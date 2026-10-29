#!/usr/bin/env node
'use strict';
/**
 * Amazon Intelligence Scraper Web Server (Node.js port of web_server.py)
 * REST API + static dashboard for live Amazon scraping, smart budget parsing and in-stock filtering.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

const { AmazonScraper, DataExporter, parseNaturalQuery, parseCsv, logger } = require('./amazonScraper');

let getDriver = null;
try {
  ({ getDriver } = require('./browser'));
} catch {
  getDriver = null;
}

const BASE_DIR = __dirname;
const WEB_DIR = path.join(BASE_DIR, 'web');
const CONFIG_PATH = path.join(BASE_DIR, 'scraper_config.json');

const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = IS_SERVERLESS ? path.join(os.tmpdir(), 'scraped_data') : path.join(BASE_DIR, 'scraped_data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const CSV_FILE = path.join(DATA_DIR, 'amazon_products.csv');
const JSON_FILE = path.join(DATA_DIR, 'amazon_products.json');

const app = express();

// Accept JSON, urlencoded or odd content-types without ever 400-ing on a bad body.
app.use(express.text({ type: () => true, limit: '1mb' }));
app.use((req, _res, next) => {
  let body = {};
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      body = JSON.parse(req.body);
    } catch {
      try {
        body = Object.fromEntries(new URLSearchParams(req.body));
      } catch {
        body = {};
      }
    }
  } else if (req.body && typeof req.body === 'object') {
    body = req.body;
  }
  req.body = body && typeof body === 'object' ? body : {};
  next();
});

// ---------------------------------------------------------------------------
// Global scraper state (Node is single-threaded, so no lock is needed)
// ---------------------------------------------------------------------------
const emptyStats = () => ({
  total_found: 0,
  in_stock: 0,
  lowest_price: null,
  avg_price: null,
  max_discount: null,
});

const currentJob = {
  status: 'idle', // idle | running | completed | error
  message: 'Scraper is ready.',
  progress: 0,
  current_page: 0,
  total_pages: 1,
  query: '',
  parsed: {},
  results: [],
  logs: [],
  stats: emptyStats(),
  error: null,
};

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch {
      /* fall through to defaults */
    }
  }
  return {
    domain: 'https://www.amazon.in',
    headless: true,
    profiles_dir: 'amazon_profiles',
    output_dir: 'scraped_data',
    delay_range_seconds: [1.5, 3.0],
    page_load_timeout: 30,
    stealth_mode: true,
  };
}

function addLog(msg) {
  const t = new Date().toTimeString().slice(0, 8);
  currentJob.logs.push(`[${t}] ${msg}`);
  if (currentJob.logs.length > 200) currentJob.logs = currentJob.logs.slice(-200);
  logger.info(msg);
}

const numOrNull = (v) => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

function updateStatsInPlace(job) {
  const items = job.results || [];
  if (!items.length) return;

  const prices = items.map((it) => it.price_num).filter((p) => p && p > 0);
  const inStock = items.filter((it) => it.in_stock ?? true).length;

  const discounts = [];
  for (const it of items) {
    const d = it.discount;
    if (d && d.includes('%')) {
      const val = parseInt(d.replaceAll('-', '').replaceAll('%', '').trim(), 10);
      if (!Number.isNaN(val)) discounts.push(Math.abs(val));
    }
  }

  const brands = [...new Set(items.map((it) => it.brand).filter(Boolean))].sort();
  job.brands = brands;
  job.stats = {
    total_found: items.length,
    in_stock: inStock,
    lowest_price: prices.length ? Math.min(...prices) : null,
    avg_price: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null,
    max_discount: discounts.length ? `${Math.max(...discounts)}%` : null,
    brands_count: brands.length,
  };
}

// ---------------------------------------------------------------------------
// Background scrape job
// ---------------------------------------------------------------------------
async function runScrapeWorker(params) {
  const query = String(params.query || '').trim();
  const pages = parseInt(params.pages ?? 1, 10) || 1;
  const inStockOnly = params.in_stock_only === undefined ? true : toBool(params.in_stock_only);
  const primeOnly = params.prime_only === undefined ? false : toBool(params.prime_only);
  const minRating = params.min_rating ? Number(params.min_rating) : null;
  let minPrice = numOrNull(params.min_price);
  let maxPrice = numOrNull(params.max_price);
  const headless = params.headless === undefined ? true : toBool(params.headless);
  const deepScan = params.deep_scan === undefined ? true : toBool(params.deep_scan);

  const parsed = parseNaturalQuery(query);
  if (minPrice === null && parsed.min_price !== null) minPrice = parsed.min_price;
  if (maxPrice === null && parsed.max_price !== null) maxPrice = parsed.max_price;

  Object.assign(currentJob, {
    status: 'running',
    message: `Initializing stealth Chrome driver for '${query}'...`,
    progress: 10,
    query,
    parsed: {
      search_keyword: parsed.search_keyword || query,
      target_brand: parsed.target_brand,
      target_model: parsed.target_model,
      min_price: minPrice,
      max_price: maxPrice,
      detected_budget: parsed.detected_budget || '',
      in_stock_only: inStockOnly,
    },
    results: [],
    logs: [],
    error: null,
    stats: emptyStats(),
  });

  addLog(`Starting scrape for query: '${query}'`);
  if (parsed.target_brand) {
    addLog(`Target Brand / Model Detected: '${parsed.target_brand}' (Scraping all available models with verified sellers)`);
  }
  if (parsed.detected_budget) addLog(`Smart Budget Detected: ${parsed.detected_budget}`);
  addLog(`Target Amazon Search Keyword: '${parsed.search_keyword}' (Headless: ${headless})`);

  const config = loadConfig();
  const profilesDir = path.join(BASE_DIR, config.profiles_dir || 'amazon_profiles');
  let driver = null;

  try {
    const scraper = new AmazonScraper(null, config);

    const progressCb = (ev) => {
      switch (ev.stage) {
        case 'starting': {
          currentJob.progress = 15;
          currentJob.message = ev.message || '⚡ Turbo Engine scanning Amazon catalog...';
          addLog(currentJob.message);
          break;
        }
        case 'page_loading': {
          const p = ev.current_page || 1;
          const tot = ev.total_pages || pages;
          currentJob.progress = Math.trunc(25 + ((p - 1) / Math.max(tot, 1)) * 55);
          currentJob.message = `Scraping page ${p}/${tot}...`;
          addLog(`Loading search page ${p} of ${tot}...`);
          break;
        }
        case 'item_scraped': {
          const item = ev.item || {};
          currentJob.results.push(item);
          updateStatsInPlace(currentJob);
          addLog(`Scraped In-Stock item: ${String(item.title || '').slice(0, 55)}... (${item.price || ''})`);
          break;
        }
        case 'enriching_sellers': {
          currentJob.progress = 88;
          currentJob.message = ev.message || 'Fetching verified sellers...';
          addLog(currentJob.message);
          break;
        }
        default:
      }
    };

    addLog('⚡ Activating Ultra-Fast Turbo Engine (concurrent multi-angle scan)...');
    currentJob.progress = 10;
    currentJob.message = '⚡ Turbo Engine active. Scanning Amazon...';

    const scrapeOpts = {
      maxPages: pages, minPrice, maxPrice, inStockOnly, primeOnly, minRating,
      progressCallback: progressCb, deepScan,
    };

    let results = await scraper.scrapeSearchResults(query, { ...scrapeOpts, useTurbo: true });

    // Browser fallback only if turbo found nothing
    if (!results.length) {
      addLog('Turbo engine returned 0 items, activating fallback browser engine...');
      if (!getDriver) {
        addLog('Fallback browser engine unavailable on this host (selenium-webdriver / Chrome not installed).');
      } else {
        currentJob.progress = 25;
        currentJob.message = 'Spawning anti-detection Chrome instance for fallback...';
        driver = await getDriver({
          profilesDir,
          headless,
          userAgent: config.user_agent,
          stealth: config.stealth_mode ?? true,
        });
        scraper.driver = driver;
        results = await scraper.scrapeSearchResults(query, { ...scrapeOpts, useTurbo: false });
      }
    }

    if (results.length) {
      addLog(`Saving ${results.length} items to persistent CSV & JSON...`);
      DataExporter.saveToCsv(results, CSV_FILE);
      DataExporter.saveToJson(results, JSON_FILE);
    }

    currentJob.status = 'completed';
    currentJob.progress = 100;
    currentJob.message = `Finished! Found ${results.length} verified in-stock items.`;
    currentJob.results = results;
    updateStatsInPlace(currentJob);
    addLog(`Scrape completed successfully. ${results.length} items ready.`);
  } catch (e) {
    console.error(e);
    currentJob.status = 'error';
    currentJob.error = String(e && e.message ? e.message : e);
    currentJob.message = `Scrape failed: ${currentJob.error}`;
    addLog(`ERROR: ${currentJob.error}`);
  } finally {
    if (driver) {
      try {
        await driver.quit();
      } catch {
        /* ignore */
      }
    }
  }
}

function toBool(v) {
  if (typeof v === 'string') return !['', '0', 'false', 'no', 'off'].includes(v.trim().toLowerCase());
  return Boolean(v);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/', (_req, res) => {
  const indexPath = path.join(WEB_DIR, 'index.html');
  if (!fs.existsSync(indexPath)) {
    res.status(404).type('text').send('Dashboard not found: put your frontend at web/index.html');
    return;
  }
  res.sendFile(indexPath);
});

app.get(['/api/status', '/status'], (_req, res) => res.json(currentJob));

app.post(['/api/scrape', '/scrape'], async (req, res) => {
  const data = req.body || {};
  const query = String(data.query || '').trim();
  if (!query) return res.status(400).json({ success: false, error: 'Search query cannot be empty.' });

  // Serverless: background work doesn't survive the response, so scrape synchronously.
  if (IS_SERVERLESS) {
    try {
      const config = loadConfig();
      const scraper = new AmazonScraper(null, config);
      const targetPages = Math.min(Math.max(parseInt(data.pages ?? 1, 10) || 1, 1), 2); // keep it fast on serverless
      const results = await scraper.scrapeSearchResults(query, {
        maxPages: targetPages,
        minPrice: numOrNull(data.min_price),
        maxPrice: numOrNull(data.max_price),
        inStockOnly: data.in_stock_only === undefined ? true : toBool(data.in_stock_only),
        primeOnly: data.prime_only === undefined ? false : toBool(data.prime_only),
        minRating: data.min_rating ? Number(data.min_rating) : null,
        deepScan: data.deep_scan === undefined ? false : toBool(data.deep_scan),
        useTurbo: true,
      });
      currentJob.results = results;
      currentJob.status = 'completed';
      currentJob.progress = 100;
      currentJob.query = query;
      updateStatsInPlace(currentJob);
      return res.json({
        success: true,
        status: 'completed',
        results,
        stats: currentJob.stats,
        message: `Found ${results.length} verified in-stock items.`,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, error: String(e && e.message ? e.message : e) });
    }
  }

  if (currentJob.status === 'running') {
    return res.status(409).json({ success: false, error: 'A scrape is already running.' });
  }

  runScrapeWorker(data).catch((e) => console.error('Scrape worker crashed:', e));
  return res.json({ success: true, message: 'Scrape task started in background.' });
});

app.get(['/api/history', '/history'], (_req, res) => {
  if (!fs.existsSync(CSV_FILE)) return res.json({ success: true, items: [] });
  try {
    const rows = parseCsv(fs.readFileSync(CSV_FILE, 'utf8')).map((row) => {
      const n = row.price_num ? Number(row.price_num) : NaN;
      row.price_num = Number.isNaN(n) ? null : n;
      return row;
    });
    rows.reverse(); // latest first
    return res.json({ success: true, count: rows.length, items: rows.slice(0, 100) });
  } catch (e) {
    return res.status(500).json({ success: false, error: String(e && e.message ? e.message : e) });
  }
});

app.post(['/api/parse-query', '/parse-query'], (req, res) => {
  res.json(parseNaturalQuery((req.body && req.body.query) || ''));
});

// Static assets (after the explicit routes, like Flask's static_url_path="")
app.use(express.static(WEB_DIR));

// ---------------------------------------------------------------------------
function runServer(port) {
  const p = port || parseInt(process.env.PORT, 10) || 5050;
  const host = process.env.HOST || '0.0.0.0';
  return app.listen(p, host, () => {
    console.log('\n=======================================================');
    console.log('  AMAZON INTELLIGENCE SCRAPER - PRO WEB DASHBOARD');
    console.log(`  Live at: http://${host}:${p}`);
    console.log('=======================================================\n');
  });
}

module.exports = { app, runServer };

if (require.main === module) runServer();
