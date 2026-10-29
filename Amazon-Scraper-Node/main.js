#!/usr/bin/env node
'use strict';
/**
 * Amazon Scraper CLI & Interactive Manager (Node.js port of main.py).
 * Stealth Chrome automation for single products; turbo engine + browser fallback for searches.
 */

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const { parseArgs } = require('node:util');

const { AmazonScraper, DataExporter, parseCsv } = require('./amazonScraper');
const { getDriver, resetProfile } = require('./browser');

const BASE_DIR = __dirname;
const CONFIG_PATH = path.join(BASE_DIR, 'scraper_config.json');

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
      console.log(`[!] Error reading config: ${e.message}. Using defaults.`);
    }
  }
  return {
    domain: 'https://www.amazon.in',
    headless: false,
    profiles_dir: 'amazon_profiles',
    output_dir: 'scraped_data',
    csv_file: 'scraped_data/amazon_products.csv',
    json_file: 'scraped_data/amazon_products.json',
    delay_range_seconds: [2.0, 4.0],
    page_load_timeout: 30,
    max_search_pages: 1,
    stealth_mode: true,
  };
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {
    console.log(`[!] Error writing config: ${e.message}`);
  }
}

const csvPathOf = (cfg) => path.join(BASE_DIR, cfg.csv_file || 'scraped_data/amazon_products.csv');
const jsonPathOf = (cfg) => path.join(BASE_DIR, cfg.json_file || 'scraped_data/amazon_products.json');

function printBanner() {
  console.log(`
    ==========================================================
             AMAZON PRODUCT & PRICE SCRAPER v1.0 (Node.js)
        Stealth Chrome Engine with Persistent Session
    ==========================================================
    `);
}

function showMenu(config) {
  console.log('\nSelect an action:');
  console.log('  w. Launch Interactive Web Dashboard (Frontend)');
  console.log('  1. Scrape Single Product (by URL or ASIN)');
  console.log('  2. Scrape Search Results (by Keyword)');
  console.log('  3. Scrape Batch Products from File (products.txt)');
  console.log('  4. Open Browser Session (to set delivery pincode / log in)');
  console.log('  5. View Saved Scraped Data (summary table)');
  console.log(`  6. Toggle Headless Mode (currently: ${Boolean(config.headless)})`);
  console.log('  7. Reset Browser Profile (clear cache & cookies)');
  console.log('  q. Quit');
}

function readTargets(filepath) {
  return fs
    .readFileSync(filepath, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

function persist(config, data) {
  DataExporter.saveToCsv(data, csvPathOf(config));
  DataExporter.saveToJson(data, jsonPathOf(config));
}

// ---------------------------------------------------------------------------
// Interactive handlers
// ---------------------------------------------------------------------------
async function handleScrapeSingle(rl, scraper, config) {
  const target = (await rl.question('\nEnter Amazon product URL or 10-character ASIN: ')).trim();
  if (!target) return console.log('[!] Input cannot be empty.');

  console.log(`\n[*] Fetching product details for: ${target} ...`);
  const data = await scraper.scrapeProduct(target);
  if (data) {
    DataExporter.printSummaryCard(data);
    persist(config, [data]);
  } else {
    console.log('[x] Failed to extract product data.');
  }
}

async function handleScrapeSearch(rl, scraper, config) {
  const query = (await rl.question("\nEnter search keyword (e.g., 'wireless earbuds'): ")).trim();
  if (!query) return console.log('[!] Query cannot be empty.');

  const pagesStr = (await rl.question('How many result pages to scrape? [default: 1]: ')).trim();
  const pages = /^\d+$/.test(pagesStr) && parseInt(pagesStr, 10) > 0 ? parseInt(pagesStr, 10) : 1;

  console.log(`\n[*] Searching Amazon for '${query}' (${pages} page(s)) ...`);
  const results = await scraper.scrapeSearchResults(query, { maxPages: pages });
  if (!results.length) return console.log('[x] No search results found.');

  console.log(`\n[OK] Successfully scraped ${results.length} items!`);
  for (const item of results.slice(0, 5)) {
    console.log(` - [${item.asin}] ${String(item.title).slice(0, 45)}... | ${item.price} | ${item.rating}`);
  }
  if (results.length > 5) console.log(`   ... and ${results.length - 5} more items.`);
  persist(config, results);
}

async function handleScrapeBatch(rl, scraper, config) {
  const defaultFile = path.join(BASE_DIR, 'sample_products.txt');
  const input = (await rl.question('\nEnter batch file path [default: sample_products.txt]: ')).trim();
  const filepath = input || defaultFile;

  if (!fs.existsSync(filepath)) return console.log(`[!] File not found: ${filepath}`);
  const lines = readTargets(filepath);
  if (!lines.length) return console.log('[!] File is empty or has no valid targets.');

  console.log(`\n[*] Found ${lines.length} targets to scrape in batch.`);
  const all = [];
  for (const [i, target] of lines.entries()) {
    console.log(`\n--- [${i + 1}/${lines.length}] Processing: ${target} ---`);
    const item = await scraper.scrapeProduct(target);
    if (item) {
      DataExporter.printSummaryCard(item);
      all.push(item);
    } else {
      console.log(`[x] Failed to scrape ${target}`);
    }
  }
  if (all.length) {
    persist(config, all);
    console.log(`\n[OK] Batch complete! Scraped ${all.length}/${lines.length} items.`);
  }
}

async function handleOpenBrowser(rl, config) {
  const profilesDir = path.join(BASE_DIR, config.profiles_dir || 'amazon_profiles');
  console.log('\n[*] Opening interactive browser session to Amazon.in...');
  console.log('    You can use this window to:');
  console.log('    - Enter your delivery pincode on Amazon');
  console.log('    - Log into your account (optional, will be remembered)');
  console.log('    - Verify everything works');
  console.log('    Close the browser or press ENTER in terminal when done.');

  const driver = await getDriver({
    profilesDir,
    headless: false,
    userAgent: config.user_agent,
    stealth: config.stealth_mode ?? true,
  });
  try {
    await driver.get(config.domain || 'https://www.amazon.in');
    await rl.question('\n>>> Press ENTER here when you are done in the browser... ');
  } finally {
    try {
      await driver.quit();
    } catch {
      /* ignore */
    }
  }
  console.log('[OK] Browser closed. Profile session saved.');
}

function handleViewData(config) {
  const csvPath = csvPathOf(config);
  if (!fs.existsSync(csvPath)) return console.log('\n[!] No scraped CSV file found yet. Scrape some items first!');

  try {
    const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
    console.log(`\n[OK] Loaded ${rows.length} records from ${path.basename(csvPath)}:`);
    const cols = ['asin', 'title', 'price', 'mrp', 'discount', 'rating', 'availability'];
    console.table(rows.slice(-10).map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? '']))));
    console.log(`\n(Showing up to 10 most recent entries. Full file at: ${csvPath})`);
  } catch (e) {
    console.log(`[!] Error reading CSV: ${e.message}`);
  }
}

async function runInteractive(config) {
  const profilesDir = path.join(BASE_DIR, config.profiles_dir || 'amazon_profiles');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  let driver = null;
  let scraper = null;

  const closeDriver = async () => {
    if (driver) {
      try {
        await driver.quit();
      } catch {
        /* ignore */
      }
    }
    driver = null;
    scraper = null;
  };

  const ensureScraper = async () => {
    if (!driver) {
      console.log('\n[*] Launching Chrome with persistent profile & anti-detection...');
      driver = await getDriver({
        profilesDir,
        headless: Boolean(config.headless),
        userAgent: config.user_agent,
        stealth: config.stealth_mode ?? true,
      });
      scraper = new AmazonScraper(driver, config);
    }
    return scraper;
  };

  try {
    for (;;) {
      showMenu(config);
      const choice = (await rl.question('\nSelect option (1-7 or q): ')).trim().toLowerCase();

      if (['q', 'quit', 'exit'].includes(choice)) {
        console.log('\nExiting. Goodbye!');
        break;
      } else if (choice === 'w') {
        await closeDriver();
        rl.close();
        const { runServer } = require('./webServer');
        runServer(5050); // keeps the process alive until Ctrl+C
        return;
      } else if (choice === '1') {
        await handleScrapeSingle(rl, await ensureScraper(), config);
      } else if (choice === '2') {
        await handleScrapeSearch(rl, await ensureScraper(), config);
      } else if (choice === '3') {
        await handleScrapeBatch(rl, await ensureScraper(), config);
      } else if (choice === '4') {
        await closeDriver();
        await handleOpenBrowser(rl, config);
      } else if (choice === '5') {
        handleViewData(config);
      } else if (choice === '6') {
        config.headless = !config.headless;
        saveConfig(config);
        console.log(`[OK] Headless mode set to: ${config.headless}`);
        if (driver) {
          await closeDriver();
          console.log('[*] Restarting driver on next action with new headless setting.');
        }
      } else if (choice === '7') {
        await closeDriver();
        const confirm = (await rl.question('Are you sure you want to delete saved cookies/session? (y/N): ')).trim().toLowerCase();
        if (confirm === 'y') {
          resetProfile(profilesDir);
          console.log('[OK] Profile reset.');
        }
      } else {
        console.log(`[!] Invalid option: '${choice}'. Enter 1-7 or q.`);
      }
    }
  } finally {
    await closeDriver();
    rl.close();
  }
}

// ---------------------------------------------------------------------------
// Non-interactive CLI
// ---------------------------------------------------------------------------
async function runCliArgs(args, config) {
  const profilesDir = path.join(BASE_DIR, config.profiles_dir || 'amazon_profiles');
  const headless = args.headless !== undefined ? args.headless : Boolean(config.headless);
  const csvPath = args['output-csv'] ? path.resolve(args['output-csv']) : csvPathOf(config);
  const jsonPath = args['output-json'] ? path.resolve(args['output-json']) : jsonPathOf(config);

  const save = (data) => {
    DataExporter.saveToCsv(data, csvPath);
    DataExporter.saveToJson(data, jsonPath);
  };

  // Searches use the turbo engine; only open Chrome when it is actually needed.
  const needsBrowser = Boolean(args.url || args.asin || args.file);
  let driver = null;
  if (needsBrowser) {
    console.log(`[*] Starting driver in headless=${headless} mode...`);
    driver = await getDriver({
      profilesDir,
      headless,
      userAgent: config.user_agent,
      stealth: config.stealth_mode ?? true,
    });
  }
  const scraper = new AmazonScraper(driver, config);

  try {
    if (args.url || args.asin) {
      const data = await scraper.scrapeProduct(args.url || args.asin);
      if (!data) {
        console.log('[x] Failed to extract product data.');
        process.exitCode = 1;
        return;
      }
      DataExporter.printSummaryCard(data);
      save([data]);
    } else if (args.search) {
      const pages = parseInt(args.pages, 10) || 1;
      let results = await scraper.scrapeSearchResults(args.search, { maxPages: pages });
      if (!results.length) {
        console.log(`[*] Turbo engine found nothing, trying browser fallback (headless=${headless})...`);
        driver = await getDriver({
          profilesDir,
          headless,
          userAgent: config.user_agent,
          stealth: config.stealth_mode ?? true,
        });
        scraper.driver = driver;
        results = await scraper.scrapeSearchResults(args.search, { maxPages: pages, useTurbo: false });
      }
      if (!results.length) {
        console.log('[x] No search results found.');
        process.exitCode = 1;
        return;
      }
      console.log(`[OK] Scraped ${results.length} items for query '${args.search}'.`);
      save(results);
    } else if (args.file) {
      const filepath = path.resolve(args.file);
      if (!fs.existsSync(filepath)) {
        console.log(`[!] File not found: ${filepath}`);
        process.exitCode = 1;
        return;
      }
      const all = [];
      for (const t of readTargets(filepath)) {
        const item = await scraper.scrapeProduct(t);
        if (item) {
          DataExporter.printSummaryCard(item);
          all.push(item);
        }
      }
      if (all.length) {
        save(all);
        console.log(`[OK] Batch scrape finished: ${all.length} items saved.`);
      }
    }
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

async function main() {
  const { values: args } = parseArgs({
    options: {
      url: { type: 'string' },
      asin: { type: 'string' },
      search: { type: 'string' },
      pages: { type: 'string', default: '1' },
      file: { type: 'string' },
      headless: { type: 'boolean' },
      'output-csv': { type: 'string' },
      'output-json': { type: 'string' },
      web: { type: 'boolean' },
      port: { type: 'string', default: '5050' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (args.help) {
    console.log(`Amazon Product & Price Scraper

  node main.js                         interactive menu
  node main.js --asin B0CHX1W1XY       scrape by ASIN
  node main.js --url <amazon url>      scrape by URL
  node main.js --search "poco m6" --pages 2
  node main.js --file sample_products.txt
  node main.js --web [--port 5050]     launch web dashboard
  Options: --headless  --output-csv <path>  --output-json <path>`);
    return;
  }

  const config = loadConfig();

  if (args.web) {
    require('./webServer').runServer(parseInt(args.port, 10) || 5050);
  } else if (args.url || args.asin || args.search || args.file) {
    await runCliArgs(args, config);
  } else {
    printBanner();
    await runInteractive(config);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
