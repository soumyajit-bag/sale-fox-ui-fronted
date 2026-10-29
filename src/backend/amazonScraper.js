#!/usr/bin/env node
'use strict';
/**
 * Amazon Product & Price Scraper Engine (Node.js port of amazon_scraper.py)
 * Extracts product metadata, live pricing, stock, ratings, reviews, seller info, and search results.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const cheerio = require('cheerio');

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
function stamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}
const logger = {
  info: (m) => console.log(`${stamp()} [INFO] ${m}`),
  warn: (m) => console.log(`${stamp()} [WARNING] ${m}`),
  error: (m) => console.log(`${stamp()} [ERROR] ${m}`),
};

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (s) => new RegExp(`\\b${escapeRegExp(s)}\\b`, 'i');
const plus = (s) => s.replaceAll(' ', '+');
const fmtInt = (n) => Math.trunc(n).toLocaleString('en-US');

function nowStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Run `fn` over `items` with at most `limit` in flight (replacement for ThreadPoolExecutor.map). */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const n = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: n }, worker));
  return results;
}

// ---------------------------------------------------------------------------
// Text / ASIN / price helpers
// ---------------------------------------------------------------------------
const ASIN_PATTERN = /(?:\/dp\/|\/gp\/product\/|\/ASIN\/|\/product\/)([A-Z0-9]{10})/i;
const RAW_ASIN_PATTERN = /^[A-Z0-9]{10}$/i;

function extractAsin(input) {
  const s = String(input || '').trim();
  if (RAW_ASIN_PATTERN.test(s)) return s.toUpperCase();
  const m = ASIN_PATTERN.exec(s);
  return m ? m[1].toUpperCase() : null;
}

function cleanText(text) {
  if (!text) return '';
  return String(text).replace(/\s+/g, ' ').trim();
}

/** Convert '₹24,999.00' or '$19.99' to a number (null when not parseable). */
function parsePrice(priceStr) {
  if (!priceStr) return null;
  const cleaned = priceStr.replaceAll(',', '').replace(/[^\d.]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// Brand / model knowledge
// ---------------------------------------------------------------------------
const POPULAR_PHONE_BRANDS = [
  'AI+', 'Apple', 'Samsung', 'OnePlus', 'Xiaomi', 'Redmi', 'Realme', 'iQOO', 'Vivo',
  'Oppo', 'Motorola', 'Poco', 'Nothing', 'CMF', 'Google', 'Pixel', 'Infinix', 'Tecno',
  'Lava', 'Itel', 'Jio', 'Micromax', 'IKALL', 'Karbonn', 'Honor', 'Nokia', 'HMD', 'Asus', 'Sony',
];

const BRAND_ALIASES = {
  techno: 'Tecno', tecno: 'Tecno',
  ipone: 'Apple', ihpone: 'Apple', iphone: 'Apple', apple: 'Apple',
  samsng: 'Samsung', sumsung: 'Samsung', galaxy: 'Samsung',
  'one plus': 'OnePlus', '1plus': 'OnePlus', oneplus: 'OnePlus',
  readmi: 'Redmi', redme: 'Redmi', redmi: 'Redmi',
  xiaomi: 'Xiaomi',
  relme: 'Realme', 'real me': 'Realme', realme: 'Realme', narzo: 'Realme',
  noting: 'Nothing', nothing: 'Nothing',
  cmf: 'CMF',
  motrola: 'Motorola', moto: 'Motorola', motorola: 'Motorola',
  iqo: 'iQOO', iqoo: 'iQOO',
  infinx: 'Infinix', infinix: 'Infinix',
  poco: 'Poco', lava: 'Lava', itel: 'Itel',
  jio: 'Jio', jiobharat: 'Jio',
  nokia: 'Nokia', hmd: 'HMD', honor: 'Honor',
  nord: 'OnePlus',
  'ai pulse': 'AI+', 'pulse 2': 'AI+', 'ai+': 'AI+',
};

const MODEL_PREFIX_BRANDS = [
  [/\b(?:s\d{2}|m\d{2}|a\d{2}|f\d{2}|z\s*fold|z\s*flip)\b/, 'Samsung'],
  [/\bnord\b/, 'OnePlus'],
  [/\bnarzo\b/, 'Realme'],
  [/\bredmi\b/, 'Redmi'],
  [/\bpoco\b/, 'Poco'],
  [/\biphone\b/, 'Apple'],
  [/\bpixel\b/, 'Google'],
];

const GENERIC_PHONE_KEYWORDS = new Set([
  'phone', 'phones', 'mobile', 'mobiles', 'smartphone', 'smartphones',
  '5g', '4g', 'volte', 'lte', 'handset', 'device', 'best', 'new', 'latest',
  'in', 'stock', 'all', 'buy', 'online', 'amazon', 'price', 'only', 'verified',
]);

function normalizeTextForModel(text) {
  let t = text.toLowerCase().replaceAll('+', ' plus ');
  t = t.replace(/[-_/(),:;]/g, ' ');
  return ' ' + t.replace(/\s+/g, ' ').trim() + ' ';
}

/**
 * Strictly verifies a product title is the exact target model requested while allowing
 * variant configurations (RAM/ROM, colour, seller). Rejects adjacent sub-models
 * (searching '12' rejects '12R', '15' rejects '15 Pro', 'X6' rejects 'X6 Neo', ...).
 */
function matchesExactModel(title, targetModel) {
  if (!title || !targetModel) return true;

  const t = normalizeTextForModel(title);
  const mRaw = normalizeTextForModel(targetModel).trim();

  const hasProMax = /\bpro\s+max\b/.test(mRaw);
  const hasPro = /\bpro\b/.test(mRaw) && !hasProMax;
  const hasMax = /\bmax\b/.test(mRaw) && !hasProMax;
  const hasUltra = /\bultra\b/.test(mRaw);
  const hasPlus = /\bplus\b/.test(mRaw);
  const hasNeo = /\bneo\b/.test(mRaw);
  const hasFe = /\bfe\b/.test(mRaw);
  const hasLite = /\blite\b/.test(mRaw);
  const hasCe = /\bce\b/.test(mRaw);
  const hasR = /\b\d+r\b/.test(mRaw) || /\br\b/.test(mRaw);
  const hasMini = /\bmini\b/.test(mRaw);

  for (const tok of mRaw.split(/\s+/).filter(Boolean)) {
    if (!new RegExp(`\\b${escapeRegExp(tok)}\\b`).test(t)) return false;
  }

  if (!hasProMax && /\bpro\s+max\b/.test(t)) return false;
  if (!(hasPro || hasProMax) && /\bpro\b/.test(t)) return false;
  if (!(hasMax || hasProMax) && /\bmax\b/.test(t)) return false;
  if (!hasUltra && /\bultra\b/.test(t)) return false;
  if (!hasPlus && /\bplus\b/.test(t)) return false;
  if (!hasNeo && /\bneo\b/.test(t)) return false;
  if (!hasFe && /\bfe\b/.test(t)) return false;
  if (!hasLite && /\blite\b/.test(t)) return false;
  if (!hasCe && /\bce\b/.test(t)) return false;
  if (!hasMini && /\bmini\b/.test(t)) return false;

  if (!hasR) {
    const numMatch = /\b(\d+)\b/.exec(mRaw);
    if (numMatch) {
      const num = numMatch[1];
      if (new RegExp(`\\b${num}r\\b`).test(t) || new RegExp(`\\b${num}\\s+r\\b`).test(t)) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// curl-based HTTP (keeps the original curl TLS fingerprint + cookie jar), with fetch fallback
// ---------------------------------------------------------------------------
const CURL_BIN = process.platform === 'win32' ? 'curl.exe' : 'curl';
const COOKIE_FILE = path.join(os.tmpdir(), 'amazon_cookies.txt');
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function runCurl(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(
      CURL_BIN,
      args,
      { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8', windowsHide: true },
      (err, stdout) => (err ? reject(err) : resolve(stdout)),
    );
  });
}

function curlGet(url, timeoutMs) {
  return runCurl(
    [
      '-s', '--compressed',
      '-b', COOKIE_FILE, '-c', COOKIE_FILE,
      '-H', `User-Agent: ${CHROME_UA}`,
      '-H', 'Accept-Language: en-US,en;q=0.9',
      url,
    ],
    timeoutMs,
  );
}

async function fetchGet(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': CHROME_UA, 'Accept-Language': 'en-US,en;q=0.9' },
      signal: ctrl.signal,
    });
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** curl first, plain fetch if curl is missing/fails. Returns '' on total failure. */
async function getHtml(url, timeoutMs) {
  try {
    return await curlGet(url, timeoutMs);
  } catch {
    try {
      return await fetchGet(url, timeoutMs);
    } catch {
      return '';
    }
  }
}

let cookieRefresh = null;

/** Make sure the cookie jar exists and is fresh (< 30 min) to avoid the Akamai interstitial. */
async function ensureAmazonCookies() {
  let need = false;
  try {
    const st = fs.statSync(COOKIE_FILE);
    if (st.size < 50 || Date.now() - st.mtimeMs > 1800 * 1000) need = true;
  } catch {
    need = true;
  }
  if (!need) return;

  if (!cookieRefresh) {
    cookieRefresh = runCurl(
      [
        '-s', '-c', COOKIE_FILE,
        '-H', `User-Agent: ${CHROME_UA}`,
        '-H', 'Accept-Language: en-US,en;q=0.9',
        'https://www.amazon.in/',
      ],
      5000,
    )
      .catch(() => {})
      .finally(() => {
        cookieRefresh = null;
      });
  }
  await cookieRefresh;
}

// ---------------------------------------------------------------------------
// cheerio helpers (stand-ins for BeautifulSoup find/select_one)
// ---------------------------------------------------------------------------
const first = ($scope, selector) => {
  const el = $scope.find(selector).first();
  return el.length ? el : null;
};
const firstOf = (...els) => els.find((e) => e && e.length) || null;
const h2WithClass = ($, scope, sub) =>
  scope
    .find('h2')
    .filter((_, el) => ($(el).attr('class') || '').split(/\s+/).some((c) => c.includes(sub)))
    .first();
const txt = (el) => (el ? cleanText(el.text()) : '');

// ---------------------------------------------------------------------------
// Seller lookup
// ---------------------------------------------------------------------------
async function fetchSellerForAsin(asin) {
  if (!asin) return 'Amazon Seller';
  await ensureAmazonCookies();
  try {
    const html = await getHtml(`https://www.amazon.in/dp/${asin}`, 3000);
    if (!html) return 'Amazon Verified Seller';
    const $ = cheerio.load(html);
    const root = $.root();

    let sellerName = '';
    const sEl = firstOf(
      first(root, 'a#sellerProfileTriggerId'),
      first(root, "a[href*='seller/at-a-glance']"),
      first(root, "a[href*='dp_merchant_link']"),
    );
    if (sEl) sellerName = txt(sEl);

    if (!sellerName) {
      const tabular = first(root, "#tabular-buybox .tabular-buybox-text[tabular-attribute-name='Sold by']");
      if (tabular) sellerName = txt(tabular);
    }

    if (!sellerName) {
      const merchant = first(root, 'div#merchant-info');
      if (merchant) {
        const m = txt(merchant);
        const sold = /sold\s+by\s+([^.\n]+)/i.exec(m);
        if (sold) sellerName = sold[1].trim();
        else if (m) sellerName = m.slice(0, 40);
      }
    }

    const isFba = /fulfilled\s+by\s+amazon|isamazonfulfilled=1/i.test(html);
    if (sellerName) {
      const clean = sellerName.replace(/^(?:Sold by|Merchant:?)\s*/i, '').trim();
      if (clean) return `${clean} ${isFba ? '(FBA)' : ''}`.trim();
    }
    if (isFba) return 'Fulfilled by Amazon';
    return 'Amazon Verified Seller';
  } catch {
    return 'Amazon Verified Seller';
  }
}

// ---------------------------------------------------------------------------
// Phone handset validation
// ---------------------------------------------------------------------------
const MIN_PHONE_PRICE_BY_BRAND = {
  Apple: 20000, OnePlus: 12000, iQOO: 8000, Google: 18000, Pixel: 18000, Nothing: 14000, CMF: 10000,
  Samsung: 5500, Xiaomi: 5500, Redmi: 5000, Realme: 5000, Poco: 5000, Motorola: 5500, Vivo: 5500,
  Oppo: 5500, Honor: 8000, Tecno: 5000, Infinix: 5000, 'AI+': 3500,
  Lava: 800, Itel: 800, Nokia: 800, HMD: 800, Jio: 800, Micromax: 800, IKALL: 800,
};

const NON_PHONE_PATTERNS = [
  // Watches & wearables
  /\b(?:watch|smartwatch|smart watch|wrist watch|analog watch|digital watch|watch for|smart band|fitness band|activity tracker)\b/,
  // Cases, covers, holsters, panels
  /\b(?:cover|covers|case|cases|flip cover|back cover|flip case|back case|protective case|shockproof case|bumper case|leather case|silicone case|clear case|carbon case|phone cover|phone case|back panel|panel replacement|housing body|pouch|holster|sleeve bag)\b/,
  // Glass & screen protectors
  /\b(?:tempered glass|screen protector|camera lens protector|privacy glass|guard for|display glass|front glass replacement)\b/,
  /\b(?:compatible with|cover compatible|case compatible)\b/,
  // Replacement parts & batteries
  /\b(?:replacement|spare parts?|replacement battery|mobile battery|li-ion battery|internal battery|battery for|combo folder|display replacement|lcd screen replacement|touch screen digitizer|sim tray|flex cable)\b/,
  // Cables & chargers
  /\b(?:charging cable|charger cable|usb cable|type-c cable|lightning cable|adapter|charger adapter|power adapter|wall charger|car charger|wireless charger|docking station|power bank|powerbank)\b/,
  // Audio accessories
  /\b(?:bluetooth speaker|speaker|soundbar|tws|earbuds|earphones|headphone|headphones|neckband|microphone|mic)\b/,
  // Mounts, stands, skins
  /\b(?:phone holder|mobile holder|car mount|bike mount|mobile stand|tripod|gimbal|selfie stick|ring light|ring holder|pop socket|skin wrap|wrap skin|decal sticker)\b/,
  // Musical instruments
  /\b(?:guitar|acoustic|semi-acoustic|cutaway|basswood|rosewood|ukulele|violin|piano|harmonium|synthesizer|flute|drum|amplifier)\b/,
  // Appliances & TVs
  /\b(?:television|smart tv|led tv|oled tv|refrigerator|fridge|washing machine|microwave|oven|air conditioner|cooler|fan|vacuum cleaner|water purifier|geyser)\b/,
  // Laptops & PC parts
  /\b(?:laptop|notebook|chromebook|macbook|desktop pc|monitor|motherboard|graphic card|graphics card|gpu|cpu processor|printer|scanner|mechanical keyboard)\b/,
];
const NON_PHONE_REGEX = new RegExp(NON_PHONE_PATTERNS.map((r) => r.source).join('|'), 'i');

const POSITIVE_PHONE_PATTERNS = [
  /\b(?:smartphone|smartphones|mobile phone|mobile phones|basic mobile|feature phone|cellphone|handset|keypad phone|keypad mobile|keypad)\b/,
  /\b(?:5g|4g volte|4g lte|dual sim)\b/,
  /\b\d+\s*(?:gb|mb)\s*(?:ram|rom|storage)\b/,
  /\b(?:snapdragon|dimensity|bionic|helio|unisoc|exynos|tensor)\b/,
];
const POSITIVE_PHONE_REGEX = new RegExp(POSITIVE_PHONE_PATTERNS.map((r) => r.source).join('|'), 'i');

/** Strictly validates whether a listing is an authentic mobile phone handset. */
function isValidPhoneHandset(title, priceNum = null, targetBrand = null) {
  if (!title) return false;
  const t = title.toLowerCase().trim();

  if (NON_PHONE_REGEX.test(t)) return false;

  if (targetBrand) {
    const minAllowed = MIN_PHONE_PRICE_BY_BRAND[targetBrand] ?? 800;
    if (priceNum !== null && priceNum !== undefined && priceNum < minAllowed) return false;
  } else if (priceNum !== null && priceNum !== undefined && priceNum < 800) {
    return false;
  }

  if (POSITIVE_PHONE_REGEX.test(t)) return true;

  for (const b of POPULAR_PHONE_BRANDS) {
    if (wordRe(b.toLowerCase()).test(t)) {
      if (/\b(?:\d+\s*gb|\d+\s*inch|android|camera|display|titanium)\b/.test(t)) return true;
    }
  }
  return false;
}

const isPhoneAccessory = (title, priceNum, targetBrand) => !isValidPhoneHandset(title, priceNum, targetBrand);

function extractBrandAndSpecs(title) {
  if (!title) return { brand: '', specs: [] };

  let brand = '';
  const lower = title.toLowerCase();

  if (lower.includes('ai+') || lower.includes('ai pulse') || lower.includes('ai nova') || lower.includes('pulse 2')) {
    brand = 'AI+';
  } else if (lower.includes('iphone') || lower.includes('apple')) {
    brand = 'Apple';
  } else {
    for (const [alias, canon] of Object.entries(BRAND_ALIASES)) {
      if (wordRe(alias).test(lower)) {
        brand = canon;
        break;
      }
    }
    if (!brand) {
      for (const b of POPULAR_PHONE_BRANDS) {
        if (wordRe(b.toLowerCase()).test(lower)) {
          brand = b;
          break;
        }
      }
    }
  }

  if (!brand && title) {
    const firstToken = title.split(/\s+/).filter(Boolean)[0] || '';
    if (firstToken.length >= 2 && /^[a-z0-9]+$/i.test(firstToken)) {
      brand = firstToken.charAt(0).toUpperCase() + firstToken.slice(1).toLowerCase();
    }
  }

  const specs = [];
  if (/\b5G\b/i.test(title)) specs.push('5G');

  const ram = /(\d+\s*GB\s*RAM)/i.exec(title);
  if (ram) specs.push(cleanText(ram[1]).toUpperCase());

  const rom = /(\d+\s*GB(?:\s*(?:Storage|ROM))?)/i.exec(title);
  if (rom) {
    const val = cleanText(rom[1]).toUpperCase();
    if (!specs.some((s) => s.includes(val))) specs.push(val);
  }

  const disp = /\b(AMOLED|OLED|FHD\+?|120\s*Hz|90\s*Hz)\b/i.exec(title);
  if (disp) specs.push(disp[1].toUpperCase());

  return { brand, specs: specs.slice(0, 4) };
}

// ---------------------------------------------------------------------------
// Natural-language query parsing
// ---------------------------------------------------------------------------
const AMOUNT = String.raw`(?:rs\.?|inr|₹)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|thousands|l|lac|lacs|lakh|lakhs)?`;
const BETWEEN_RE = new RegExp(String.raw`(?:between|from)\s*${AMOUNT}\s*(?:to|and|-)\s*${AMOUNT}`, 'i');
const UNDER_RE = new RegExp(String.raw`(?:under|below|less\s+than|up\s+to|within|max|<|<=)\s*${AMOUNT}`, 'i');
const ABOVE_RE = new RegExp(String.raw`(?:above|over|more\s+than|min|>|>=)\s*${AMOUNT}`, 'i');

/** '25 k' -> 25000, '2 lakh' -> 200000, bare '25' -> 25000 (shorthand), '25000' stays. */
function scaleAmount(valStr, unit) {
  const v = parseFloat(String(valStr || '').replace(/,/g, ''));
  const u = String(unit || '').toLowerCase().replace(/s$/, '');
  if (u === 'l' || u === 'lac' || u === 'lakh') return v * 100000;
  if (u === 'k' || u === 'thousand' || (v > 0 && v <= 100)) return v * 1000;
  return v;
}

function parseNaturalQuery(query) {
  const raw = String(query || '').trim();
  let minPrice = null;
  let maxPrice = null;
  let detectedBudget = '';
  let cleaned = raw;

  let m = BETWEEN_RE.exec(raw);
  if (m) {
    minPrice = scaleAmount(m[1], m[2]);
    maxPrice = scaleAmount(m[3], m[4]);
    detectedBudget = `₹${fmtInt(minPrice)} - ₹${fmtInt(maxPrice)}`;
    cleaned = raw.slice(0, m.index) + ' ' + raw.slice(m.index + m[0].length);
  } else if ((m = UNDER_RE.exec(raw))) {
    maxPrice = scaleAmount(m[1], m[2]);
    detectedBudget = `Under ₹${fmtInt(maxPrice)}`;
    cleaned = raw.slice(0, m.index) + ' ' + raw.slice(m.index + m[0].length);
  } else if ((m = ABOVE_RE.exec(raw))) {
    minPrice = scaleAmount(m[1], m[2]);
    detectedBudget = `Above ₹${fmtInt(minPrice)}`;
    cleaned = raw.slice(0, m.index) + ' ' + raw.slice(m.index + m[0].length);
  }

  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  if (!cleaned) cleaned = raw;

  let targetBrand = null;
  let targetModel = null;
  const cleanedLower = cleaned.toLowerCase();

  // 1. Brand
  if (
    cleanedLower.includes('pulse') || cleanedLower.includes('ai+') || cleanedLower.includes('ai pulse') ||
    cleanedLower.includes('ai plus') || cleanedLower.includes('nova 5g')
  ) {
    targetBrand = 'AI+';
  } else if (cleanedLower.includes('iphone') || cleanedLower.includes('apple')) {
    targetBrand = 'Apple';
  } else if (cleanedLower.includes('galaxy')) {
    targetBrand = 'Samsung';
  } else {
    for (const [alias, canon] of Object.entries(BRAND_ALIASES)) {
      if (wordRe(alias).test(cleanedLower)) {
        targetBrand = canon;
        break;
      }
    }
    if (!targetBrand) {
      for (const b of POPULAR_PHONE_BRANDS) {
        if (wordRe(b.toLowerCase()).test(cleanedLower)) {
          targetBrand = b;
          break;
        }
      }
    }
    if (!targetBrand) {
      for (const [pat, b] of MODEL_PREFIX_BRANDS) {
        if (pat.test(cleanedLower)) {
          targetBrand = b;
          break;
        }
      }
    }
  }

  // 2. Model
  let forModel = cleaned.replace(/\b\d+\s*(?:gb|tb|mb)(?:\s*(?:ram|rom|storage))?\b/gi, ' ');
  if (targetBrand) {
    const brandTokens = [targetBrand.toLowerCase()];
    for (const [alias, canon] of Object.entries(BRAND_ALIASES)) {
      if (canon.toLowerCase() === targetBrand.toLowerCase()) brandTokens.push(alias.toLowerCase());
    }
    for (const bt of brandTokens) {
      forModel = forModel.replace(new RegExp(`\\b${escapeRegExp(bt)}\\b`, 'gi'), ' ');
    }
  }

  const modelWords = forModel.split(/\s+/).filter((w) => w && !GENERIC_PHONE_KEYWORDS.has(w.toLowerCase()));
  if (modelWords.length) {
    targetModel = modelWords.join(' ').replace(/^[ _/-]+|[ _/-]+$/g, '');
  }

  // 3. Amazon search keyword
  let searchKeyword;
  if (targetBrand && targetModel) {
    searchKeyword =
      targetBrand === 'Apple' && !targetModel.toLowerCase().includes('iphone')
        ? `iPhone ${targetModel}`
        : `${targetBrand} ${targetModel}`;
  } else if (targetBrand) {
    searchKeyword = `${targetBrand} smartphones`;
  } else if (['phones', 'phone', 'mobile', 'mobiles'].includes(cleanedLower)) {
    searchKeyword = 'smartphones';
  } else if (cleanedLower.includes('phone') && !cleanedLower.includes('smart')) {
    searchKeyword = cleanedLower.replaceAll('phone', 'smartphone');
  } else {
    searchKeyword = cleaned;
  }

  return {
    raw_query: raw,
    search_keyword: searchKeyword,
    target_brand: targetBrand,
    target_model: targetModel,
    min_price: minPrice,
    max_price: maxPrice,
    detected_budget: detectedBudget,
  };
}

// ---------------------------------------------------------------------------
// Brand sweep tables for the turbo engine
// ---------------------------------------------------------------------------
const BRAND_SWEEP_TERMS = {
  apple: ['apple', 'iphone', 'apple iphone', 'apple iphones', 'iphones', 'apple phone', 'apple phones', 'apple mobile', 'apple smartphones'],
  poco: ['poco', 'poco phone', 'poco phones', 'poco mobile', 'poco smartphones', 'poco 5g'],
  samsung: ['samsung', 'samsung galaxy', 'samsung phone', 'samsung phones', 'samsung mobile', 'samsung smartphones'],
  oneplus: ['oneplus', 'oneplus nord', 'oneplus phone', 'oneplus phones', 'oneplus mobile', 'oneplus smartphones'],
  redmi: ['redmi', 'redmi note', 'redmi phone', 'redmi phones', 'redmi mobile', 'redmi smartphones', 'xiaomi'],
  realme: ['realme', 'realme narzo', 'realme phone', 'realme phones', 'realme mobile', 'realme smartphones'],
  motorola: ['moto', 'motorola', 'motorola phone', 'motorola phones', 'motorola mobile', 'motorola smartphones'],
  iqoo: ['iqoo', 'iqoo phone', 'iqoo phones', 'iqoo mobile', 'iqoo smartphones'],
  tecno: ['tecno', 'techno', 'tecno phone', 'tecno phones', 'tecno mobile', 'tecno smartphones', 'tecno spark', 'tecno pova', 'tecno camon', 'tecno pop'],
  infinix: ['infinix', 'infinix phone', 'infinix phones', 'infinix mobile', 'infinix smartphones', 'infinix gt', 'infinix note', 'infinix zero', 'infinix smart'],
  itel: ['itel', 'itel phone', 'itel phones', 'itel mobile', 'itel smartphones'],
  lava: ['lava', 'lava phone', 'lava phones', 'lava mobile', 'lava smartphones', 'lava agni', 'lava blaze', 'lava yuva'],
  nothing: ['nothing', 'nothing phone', 'nothing phones', 'cmf', 'cmf phone'],
  vivo: ['vivo', 'vivo phone', 'vivo phones', 'vivo mobile', 'vivo smartphones', 'vivo v', 'vivo t', 'vivo y'],
  oppo: ['oppo', 'oppo phone', 'oppo phones', 'oppo mobile', 'oppo smartphones', 'oppo reno', 'oppo f'],
  google: ['google', 'pixel', 'google pixel', 'google phone', 'google phones'],
  nokia: ['nokia', 'hmd', 'nokia phone', 'nokia phones', 'nokia mobile', 'nokia 105', 'nokia g42'],
};

const SMARTPHONE_NODE = 'rh=n%3A1389401031';

// ---------------------------------------------------------------------------
// Scraper
// ---------------------------------------------------------------------------
class AmazonScraper {
  /**
   * @param {object|null} driver  selenium-webdriver WebDriver (only needed for the browser engine)
   * @param {object} config       contents of scraper_config.json
   */
  constructor(driver = null, config = {}) {
    this.driver = driver;
    this.config = config || {};
    this.domain = (this.config.domain || 'https://www.amazon.in').replace(/\/+$/, '');
    const delays = this.config.delay_range_seconds || [2.0, 4.0];
    this.delayMin = delays[0];
    this.delayMax = delays[1];
    this.timeout = this.config.page_load_timeout || 30;
  }

  async randomSleep() {
    const delay = this.delayMin + Math.random() * (this.delayMax - this.delayMin);
    await sleep(delay * 1000);
  }

  async applyPageLoadTimeout() {
    if (!this.driver) return;
    try {
      await this.driver.manage().setTimeouts({ pageLoad: this.timeout * 1000 });
    } catch {
      /* ignore */
    }
  }

  /** Detect Amazon robot-check / CAPTCHA page and wait for the user to solve it. */
  async checkAndHandleCaptcha() {
    const isCaptcha = (s) =>
      s.includes('enter the characters you see below') ||
      s.includes('type the characters you see in this image') ||
      s.includes('robot check');

    const src = (await this.driver.getPageSource()).toLowerCase();
    if (!isCaptcha(src)) return true;

    logger.warn('[!] Amazon CAPTCHA detected!');
    console.log('\n' + '='.repeat(60));
    console.log('>>> [ACTION NEEDED] Amazon Robot Check / CAPTCHA triggered!');
    console.log('>>> Please solve the CAPTCHA in the opened Chrome window.');
    console.log('='.repeat(60) + '\n');

    const start = Date.now();
    while (Date.now() - start < 120 * 1000) {
      await sleep(3000);
      const after = (await this.driver.getPageSource()).toLowerCase();
      if (!after.includes('enter the characters you see below') && !after.includes('robot check')) {
        logger.info('[OK] CAPTCHA resolved successfully!');
        return true;
      }
    }
    logger.error('[x] CAPTCHA wait timed out after 120s.');
    return false;
  }

  buildProductUrl(asinOrUrl) {
    const asin = extractAsin(asinOrUrl);
    if (asin && !asinOrUrl.startsWith('http')) return `${this.domain}/dp/${asin}`;
    return asinOrUrl;
  }

  absUrl(href) {
    try {
      return new URL(href, this.domain + '/').href;
    } catch {
      return href;
    }
  }

  // ---- single product (browser) -------------------------------------------------
  async scrapeProduct(asinOrUrl) {
    const url = this.buildProductUrl(asinOrUrl);
    const asin = extractAsin(url) || '';

    logger.info(`Navigating to product: ${url}`);
    await this.applyPageLoadTimeout();
    try {
      await this.driver.get(url);
    } catch (e) {
      if (e && e.name === 'TimeoutError') {
        logger.warn('Page load timed out, attempting to parse available content...');
      } else {
        logger.error(`Failed to load URL ${url}: ${e && e.message}`);
        return null;
      }
    }

    logger.info(`Page loaded. Title: '${await this.driver.getTitle()}' | URL: ${await this.driver.getCurrentUrl()}`);

    if (!(await this.checkAndHandleCaptcha())) return null;
    await this.randomSleep();

    const $ = cheerio.load(await this.driver.getPageSource());
    return this.extractProductDetails($, url, asin);
  }

  extractProductDetails($, url, asin) {
    const root = $.root();
    const pick = (...sels) => firstOf(...sels.map((s) => first(root, s)));
    const pickText = (sels, requireDigit = false) => {
      for (const s of sels) {
        const el = first(root, s);
        if (el && el.text()) {
          const c = cleanText(el.text());
          if (!requireDigit || /\d/.test(c)) return c;
        }
      }
      return '';
    };

    // 1. Title
    const title = txt(pick('span#productTitle', 'h1#title', 'h1.a-size-large'));

    // 2. ASIN
    if (!asin) {
      const v = first(root, 'input#ASIN');
      if (v && v.attr('value')) asin = v.attr('value').trim();
    }

    // 3. Price
    const priceText = pickText(
      [
        '.a-price.aok-align-center .a-offscreen',
        '.apexPriceToPay .a-offscreen',
        '#corePriceDisplay_desktop_feature_div .a-price .a-offscreen',
        '.priceToPay .a-offscreen',
        '#priceblock_ourprice',
        '#priceblock_dealprice',
        '#price',
        '.a-price .a-offscreen',
      ],
      true,
    );
    const priceNum = parsePrice(priceText);

    // 4. MRP
    const mrpText = pickText(
      [
        '.a-price.a-text-price .a-offscreen',
        '.basisPrice .a-offscreen',
        '#listPrice',
        "span.a-price.a-text-price[data-a-strike='true'] .a-offscreen",
      ],
      true,
    );
    const mrpNum = parsePrice(mrpText);

    // 5. Discount
    let discount = '';
    const discountEl = pick('.savingsPercentage', '.reinventPriceSavingsPercentageMargin', '#dealprice_savings .priceBlockSavingsString');
    if (discountEl) {
      discount = txt(discountEl);
    } else if (priceNum && mrpNum && mrpNum > priceNum) {
      discount = `-${Math.round(((mrpNum - priceNum) / mrpNum) * 100)}%`;
    }

    // 6. Availability
    let availability = 'Unknown';
    const availEl = first(root, 'div#availability');
    if (availEl) availability = txt(availEl);
    else if (first(root, 'div#outOfStock')) availability = 'Currently unavailable.';

    const al = availability.toLowerCase();
    const inStock = !(al.includes('currently unavailable') || al.includes('out of stock'));

    // 7. Rating & reviews
    const ratingScore = txt(pick('#acrPopover span.a-icon-alt', '.a-icon-star-small .a-icon-alt', "span[data-hook='rating-out-of-text']"));
    const reviewCount = txt(pick('span#acrCustomerReviewText', "span[data-hook='total-review-count']"));

    // 8. Brand
    let brand = '';
    const brandEl = pick('a#bylineInfo', 'tr.po-brand td.po-break-word', '.po-brand .a-span9');
    if (brandEl) {
      brand = txt(brandEl).replaceAll('Brand:', '').replaceAll('Visit the', '').replaceAll('Store', '').trim();
    }

    // 9. Seller
    let seller = '';
    const merchant = first(root, 'div#merchant-info');
    if (merchant) {
      seller = txt(merchant);
    } else {
      const sb = first(root, "#tabular-buybox .tabular-buybox-text[tabular-attribute-name='Sold by'] a");
      if (sb) seller = txt(sb);
    }

    // 10. Prime
    const isPrime = Boolean(first(root, '.a-icon-prime'));

    // 11. Delivery
    const deliv = pick('div#mir-layout-DELIVERY_BLOCK', 'div#deliveryBlockMessage');
    const delivery = deliv ? txt(deliv) : '';

    // 12. Bullets
    const bullets = [];
    const featureDiv = first(root, 'div#feature-bullets');
    if (featureDiv) {
      featureDiv.find('ul li span.a-list-item').each((_, li) => {
        const t = cleanText($(li).text());
        if (t && !t.startsWith('›')) bullets.push(t);
      });
    }

    // 13. Image
    let imageUrl = '';
    const imgEl = pick('img#landingImage', 'img#imgBlkFront');
    if (imgEl) {
      imageUrl = imgEl.attr('data-old-hires') || imgEl.attr('data-a-dynamic-image') || imgEl.attr('src') || '';
      if (imageUrl.startsWith('{')) {
        try {
          const keys = Object.keys(JSON.parse(imageUrl));
          if (keys.length) imageUrl = keys[0];
        } catch {
          imageUrl = imgEl.attr('src') || '';
        }
      }
    }

    return {
      asin,
      title,
      price: priceText,
      price_num: priceNum,
      mrp: mrpText,
      mrp_num: mrpNum,
      discount,
      in_stock: inStock,
      availability,
      rating: ratingScore,
      review_count: reviewCount,
      brand,
      seller,
      is_prime: isPrime,
      delivery,
      image_url: imageUrl,
      features: bullets.join(' | '),
      url,
      scraped_at: nowStr(),
    };
  }

  // ---- search result card -> product --------------------------------------------
  parseSearchItemNode($, el, opts = {}) {
    const {
      query = '', targetBrand = null, targetModel = null, isPhoneQuery = true, inStockOnly = true,
      minPrice = null, maxPrice = null, primeOnly = false, minRating = null,
    } = opts;

    const $item = $(el);
    const asin = ($item.attr('data-asin') || '').trim();
    if (!asin) return null;

    // Title & URL
    const recipe = first($item, 'div[data-cy="title-recipe"]');
    let title = '';
    let fullUrl = '';
    let brandHeader = '';

    if (recipe) {
      let linkEl = recipe
        .find('a')
        .filter((_, a) => {
          const h = $(a).attr('href');
          return h && (h.includes('/dp/') || h.includes('/gp/'));
        })
        .first();
      if (!linkEl.length) linkEl = recipe.find('a').first();
      if (linkEl.length) fullUrl = this.absUrl(linkEl.attr('href') || '');

      const brandSub = firstOf(h2WithClass($, recipe, 'a-size-mini'), first(recipe, '.a-row.a-color-secondary span'));
      brandHeader = brandSub ? txt(brandSub) : '';

      const mainH2 = firstOf(
        h2WithClass($, recipe, 'a-size-medium'),
        h2WithClass($, recipe, 'a-color-base'),
        recipe.find('h2').first(),
      );
      if (mainH2) title = mainH2.attr('aria-label') || cleanText(mainH2.text());
      if (!title && linkEl.length) title = linkEl.attr('aria-label') || cleanText(linkEl.text());

      if (brandHeader && !title.toLowerCase().includes(brandHeader.toLowerCase())) {
        title = `${brandHeader} ${title}`.trim();
      }
    }

    if (!title) {
      const titleSelectors = [
        "div[data-cy='title-recipe'] h2 span",
        'h2.a-color-base span',
        'h2 a span',
        'h2.a-size-medium.a-text-normal span',
        'h2.a-text-normal',
        'a.a-link-normal.s-link-style span',
        'a.a-text-normal span',
      ];
      for (const sel of titleSelectors) {
        const t = first($item, sel);
        if (t && t.text()) {
          const c = cleanText(t.text());
          if (c.length > 2) {
            title = c;
            break;
          }
        }
      }
    }

    if (!brandHeader) {
      const bEl = firstOf(
        first($item, 'h2.a-size-mini span.a-color-base'),
        h2WithClass($, $item, 'a-size-mini'),
        first($item, '.a-row.a-color-secondary span'),
      );
      if (bEl) brandHeader = txt(bEl);
    }

    if (brandHeader && !title.toLowerCase().includes(brandHeader.toLowerCase())) {
      title = `${brandHeader} ${title}`.trim();
    } else if (targetBrand && !title.toLowerCase().includes(targetBrand.toLowerCase())) {
      const tl = title.toLowerCase();
      const competing = POPULAR_PHONE_BRANDS.filter(
        (b) => b.toLowerCase() !== targetBrand.toLowerCase() && wordRe(b.toLowerCase()).test(tl),
      );
      if (!competing.length) title = `${targetBrand} ${title}`.trim();
    }

    if (!fullUrl) {
      const linkEl = firstOf(first($item, "a[href*='/dp/']"), first($item, 'h2 a'));
      const href = linkEl && linkEl.attr('href') ? linkEl.attr('href') : `/dp/${asin}`;
      fullUrl = this.absUrl(href);
    }

    // Price & MRP
    const priceEl = first($item, '.a-price .a-offscreen');
    const priceText = priceEl ? txt(priceEl) : '';
    const priceNum = parsePrice(priceText);

    const mrpEl = first($item, '.a-price.a-text-price .a-offscreen');
    const mrpText = mrpEl ? txt(mrpEl) : '';
    const mrpNum = parsePrice(mrpText);

    // Accessory filter
    if (isPhoneQuery && isPhoneAccessory(title, priceNum, targetBrand)) return null;

    // Brand validation
    const { brand, specs } = extractBrandAndSpecs(title);

    if (targetBrand) {
      const tl = title.toLowerCase();
      let brandMatch = false;
      if (targetBrand === 'AI+') {
        brandMatch = tl.includes('ai+') || tl.includes('ai pulse') || tl.includes('pulse 2') || tl.includes('ai nova') || brand === 'AI+';
      } else if (targetBrand === 'Apple') {
        brandMatch = tl.includes('iphone') || tl.includes('apple') || brand === 'Apple';
      } else {
        brandMatch = tl.includes(targetBrand.toLowerCase()) || Boolean(brand && brand.toLowerCase() === targetBrand.toLowerCase());
      }
      if (!brandMatch) return null;
      if (targetModel && !matchesExactModel(title, targetModel)) return null;
    }

    // Stock
    const cardText = $item.text().toLowerCase();
    let outOfStock =
      cardText.includes('currently unavailable') ||
      cardText.includes('out of stock') ||
      cardText.includes('temporarily out of stock');
    if (priceNum === null || priceNum <= 0) outOfStock = true;

    const inStock = !outOfStock;
    if (inStockOnly && !inStock) return null;

    // Price bounds
    if (maxPrice !== null && maxPrice !== undefined && priceNum !== null && priceNum > maxPrice) return null;
    if (minPrice !== null && minPrice !== undefined && priceNum !== null && priceNum < minPrice) return null;

    const isPrime = Boolean(first($item, '.a-icon-prime'));
    if (primeOnly && !isPrime) return null;

    let rating = '';
    let ratingNum = null;
    const ratingEl = firstOf(first($item, 'i.a-icon-star-small span.a-icon-alt'), first($item, 'span.a-icon-alt'));
    if (ratingEl) {
      rating = txt(ratingEl);
      const rm = /(\d+(?:\.\d+)?)/.exec(rating);
      if (rm) ratingNum = parseFloat(rm[1]);
    }
    if (minRating !== null && minRating !== undefined && ratingNum !== null && ratingNum < minRating) return null;

    const reviewsEl = firstOf(first($item, 'span.a-size-base.s-underline-text'), first($item, 'span.s-underline-text'));
    const reviewCount = reviewsEl ? txt(reviewsEl) : '';

    const imgEl = first($item, 'img.s-image');
    const imgUrl = (imgEl && imgEl.attr('src')) || '';

    let discount = '';
    if (priceNum && mrpNum && mrpNum > priceNum) {
      discount = `-${Math.round(((mrpNum - priceNum) / mrpNum) * 100)}%`;
    }

    const badgeEl = firstOf(first($item, '.a-badge-text'), first($item, '.s-ribbon-text'));
    const badge = badgeEl ? txt(badgeEl) : '';

    return {
      asin,
      title,
      price:
        priceText ||
        (priceNum ? `₹${priceNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A'),
      price_num: priceNum,
      mrp: mrpText,
      mrp_num: mrpNum,
      discount,
      in_stock: inStock,
      availability: inStock ? 'In stock' : 'Out of stock',
      rating,
      rating_num: ratingNum,
      review_count: reviewCount,
      brand: brand || targetBrand || 'Amazon',
      seller: isPrime ? 'Fulfilled by Amazon' : 'Amazon Verified',
      is_prime: isPrime,
      delivery: isPrime ? 'Prime Delivery' : '',
      image_url: imgUrl,
      specs,
      badge,
      features: specs.join(', '),
      search_query: query,
      url: fullUrl,
      scraped_at: nowStr(),
    };
  }

  // ---- turbo engine (concurrent HTTP) -------------------------------------------
  async scrapeSearchResultsTurbo(query, opts = {}) {
    const {
      maxPages = 2, inStockOnly = true, primeOnly = false, minRating = null,
      progressCallback = null, deepScan = true,
    } = opts;
    let { minPrice = null, maxPrice = null } = opts;

    const parsed = parseNaturalQuery(query);
    const actualKeyword = parsed.search_keyword || query;
    const targetBrand = parsed.target_brand;
    const targetModel = parsed.target_model;

    if (minPrice === null || minPrice === undefined) minPrice = parsed.min_price;
    if (maxPrice === null || maxPrice === undefined) maxPrice = parsed.max_price;

    const q = query.toLowerCase();
    const isLaptopQuery = ['laptop', 'notebook', 'chromebook', 'macbook'].some((k) => q.includes(k));
    const isPhoneQuery =
      !isLaptopQuery &&
      (targetBrand !== null ||
        ['phone', 'phones', 'mobile', 'mobiles', 'smartphone', 'smartphones', 'pulse', 'handset', '5g', 'keypad'].some((k) => q.includes(k)));

    const bKey = targetBrand ? targetBrand.toLowerCase() : '';
    const validSweep = bKey
      ? BRAND_SWEEP_TERMS[bKey] || [bKey, `${bKey} phone`, `${bKey} phones`, `${bKey} mobile`, `${bKey} smartphones`]
      : [];
    const qNorm = query.trim().toLowerCase();
    const isGenericBrandSearch = Boolean(
      bKey && (validSweep.includes(qNorm) || (targetModel === null && validSweep.includes(qNorm.replaceAll('+', ' ')))),
    );

    const D = this.domain;
    const scanUrls = [];

    if (isGenericBrandSearch && targetBrand === 'Apple') {
      for (let p = 1; p <= 10; p++) {
        scanUrls.push(`${D}/s?k=apple+iphone&${SMARTPHONE_NODE}&page=${p}`);
        scanUrls.push(`${D}/s?k=iphone&${SMARTPHONE_NODE}&page=${p}`);
      }
      for (const s of ['iphone+16', 'iphone+15', 'iphone+14', 'iphone+13', 'iphone+16+pro', 'iphone+15+pro', 'iphone+plus', 'iphone+se', 'iphone+12', 'iphone+11']) {
        for (let p = 1; p <= 2; p++) scanUrls.push(`${D}/s?k=${s}&${SMARTPHONE_NODE}&page=${p}`);
      }
    } else if (isGenericBrandSearch && targetBrand === 'Poco') {
      for (let p = 1; p <= 15; p++) scanUrls.push(`${D}/s?k=poco&${SMARTPHONE_NODE}&page=${p}`);
      for (const s of ['poco+5g', 'poco+m6', 'poco+x6', 'poco+c65', 'poco+f6', 'poco+c61', 'poco+m5', 'poco+m4', 'poco+x5', 'poco+c55']) {
        for (let p = 1; p <= 2; p++) scanUrls.push(`${D}/s?k=${s}&${SMARTPHONE_NODE}&page=${p}`);
      }
    } else if (isGenericBrandSearch && targetBrand === 'AI+') {
      for (const a of ['ai pulse 2', 'ai+ pulse 2', 'ai+ nova 5g', 'ai+ smartphones']) {
        for (let p = 1; p <= Math.max(maxPages, 3); p++) scanUrls.push(`${D}/s?k=${plus(a)}&${SMARTPHONE_NODE}&page=${p}`);
      }
    } else if (isGenericBrandSearch) {
      for (let p = 1; p <= Math.max(maxPages, 12); p++) scanUrls.push(`${D}/s?k=${bKey}&${SMARTPHONE_NODE}&page=${p}`);
      for (const a of [`${bKey}+5g`, `${bKey}+smartphones`]) {
        for (let p = 1; p <= 2; p++) scanUrls.push(`${D}/s?k=${a}&${SMARTPHONE_NODE}&page=${p}`);
      }
    } else {
      const angles = [actualKeyword];
      if (deepScan && isPhoneQuery && !['phone', 'mobile', 'smartphone'].some((k) => actualKeyword.toLowerCase().includes(k))) {
        angles.push(`${actualKeyword} 5g mobile`);
      }
      const depth = targetModel ? Math.max(maxPages, 5) : Math.max(maxPages, 3);
      for (const a of angles) {
        for (let p = 1; p <= depth; p++) {
          const params = [`k=${plus(a)}`, `page=${p}`];
          if (isPhoneQuery) params.push(SMARTPHONE_NODE);
          if (minPrice) params.push(`low-price=${Math.trunc(minPrice)}`);
          if (maxPrice) params.push(`high-price=${Math.trunc(maxPrice)}`);
          scanUrls.push(`${D}/s?${params.join('&')}`);
        }
      }
    }

    if (progressCallback) {
      progressCallback({
        stage: 'starting',
        message: `⚡ Turbo Engine: Concurrently scanning ${scanUrls.length} Amazon catalog pages...`,
        parsed,
        current_page: 0,
        total_pages: scanUrls.length,
      });
    }

    const tStart = Date.now();
    logger.info(`⚡ Turbo Engine: Scanning ${scanUrls.length} Amazon pages in parallel...`);
    await ensureAmazonCookies();

    const itemOpts = { query, targetBrand, targetModel, isPhoneQuery, inStockOnly, minPrice, maxPrice, primeOnly, minRating };

    const fetchAndParse = async (u) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const html = await getHtml(u, 5000);
        if (html && (html.includes('data-component-type="s-search-result"') || html.length > 20000)) {
          const $ = cheerio.load(html);
          let items = $("div[data-component-type='s-search-result']");
          if (!items.length) items = $('.s-result-item[data-asin]');
          const pageItems = [];
          items.each((_, el) => {
            const data = this.parseSearchItemNode($, el, itemOpts);
            if (data) pageItems.push(data);
          });
          return pageItems;
        }
        if (html.includes('bm-verify')) await ensureAmazonCookies();
        await sleep(100);
      }
      return [];
    };

    const pagesResults = await mapLimit(scanUrls, Math.min(scanUrls.length, 25), fetchAndParse);

    const seen = new Set();
    const results = [];
    for (const pageItems of pagesResults) {
      for (const it of pageItems) {
        if (seen.has(it.asin)) continue;
        seen.add(it.asin);
        results.push(it);
        if (progressCallback) progressCallback({ stage: 'item_scraped', item: it, total_count: results.length });
      }
    }

    logger.info(`⚡ Turbo Search finished in ${((Date.now() - tStart) / 1000).toFixed(2)}s! Found ${results.length} items.`);

    if (results.length) {
      const missing = results.filter((r) => !r.seller || r.seller === 'Amazon Verified').slice(0, 30);
      if (missing.length) {
        if (progressCallback) {
          progressCallback({
            stage: 'enriching_sellers',
            message: `⚡ Quick-enriching sellers for ${missing.length} items...`,
            current_page: scanUrls.length,
            total_pages: scanUrls.length,
          });
        }
        const tSel = Date.now();
        const sellers = await mapLimit(missing, Math.min(missing.length, 25), (r) => fetchSellerForAsin(r.asin));
        missing.forEach((r, i) => {
          if (sellers[i]) r.seller = sellers[i];
        });
        logger.info(`⚡ Verified sellers enriched in ${((Date.now() - tSel) / 1000).toFixed(2)}s!`);
      }
    }

    if (progressCallback) {
      progressCallback({
        stage: 'completed',
        message: `⚡ Turbo Scraped ${results.length} verified items in ${((Date.now() - tStart) / 1000).toFixed(1)}s!`,
        total_count: results.length,
      });
    }
    return results;
  }

  // ---- main entry: turbo first, browser fallback --------------------------------
  async scrapeSearchResults(query, opts = {}) {
    const {
      maxPages = 1, inStockOnly = true, primeOnly = false, minRating = null,
      progressCallback = null, deepScan = true, useTurbo = true,
    } = opts;
    let { minPrice = null, maxPrice = null } = opts;

    let turboRes = null;
    if (useTurbo) {
      try {
        turboRes = await this.scrapeSearchResultsTurbo(query, {
          maxPages, minPrice, maxPrice, inStockOnly, primeOnly, minRating, progressCallback, deepScan,
        });
        if (turboRes && turboRes.length) return turboRes;
        logger.warn('Turbo search returned 0 items, checking browser driver fallback...');
      } catch (e) {
        logger.warn(`Turbo search exception: ${e && e.message}, checking browser driver fallback...`);
      }
    }

    if (!this.driver) {
      logger.warn('No browser driver initialized. Returning turbo results.');
      return turboRes && turboRes.length ? turboRes : [];
    }

    const parsed = parseNaturalQuery(query);
    const actualKeyword = parsed.search_keyword || query;
    const targetBrand = parsed.target_brand;
    const targetModel = parsed.target_model;

    if (minPrice === null || minPrice === undefined) minPrice = parsed.min_price;
    if (maxPrice === null || maxPrice === undefined) maxPrice = parsed.max_price;

    const ql = query.toLowerCase();
    const isPhoneQuery = targetBrand !== null || ['phone', 'mobile', 'smartphone', 'pulse'].some((k) => ql.includes(k));

    // Search angles
    const searchQueries = [actualKeyword];
    const addAngle = (a) => {
      if (!searchQueries.some((s) => s.toLowerCase() === a.toLowerCase())) searchQueries.push(a);
    };
    if (targetBrand) {
      const ANGLES = {
        'AI+': ['ai pulse 2', 'ai+ pulse 2', 'ai+ nova 5g', 'ai+ pulse mobile'],
        Apple: ['apple iphone', 'iphone 15', 'iphone 16', 'iphone 14'],
        Samsung: ['samsung galaxy smartphones', 'samsung 5g mobile', 'samsung galaxy s24 ultra'],
        OnePlus: ['oneplus smartphones', 'oneplus nord ce 4', 'oneplus 12'],
        Redmi: ['redmi smartphones', 'redmi note 13 5g', 'redmi 13c'],
        Realme: ['realme smartphones', 'realme 12 pro 5g', 'realme narzo'],
        Poco: ['poco smartphones', 'poco 5g mobile', 'poco m6 5g', 'poco x6', 'poco c65', 'poco f6', 'poco c61'],
      };
      (ANGLES[targetBrand] || [`${targetBrand} smartphones`, `${targetBrand} 5G mobile`]).forEach(addAngle);
    } else if (deepScan && isPhoneQuery) {
      [
        'ai pulse 2',
        maxPrice ? `smartphones under ${Math.trunc(maxPrice)}` : 'smartphones',
        maxPrice ? `5G smartphones under ${Math.trunc(maxPrice)}` : '5G smartphones',
      ].forEach(addAngle);
    }

    const results = [];
    const seen = new Set();
    const itemOpts = { query, targetBrand, targetModel, isPhoneQuery, inStockOnly, minPrice, maxPrice, primeOnly, minRating };

    if (progressCallback) {
      progressCallback({
        stage: 'starting',
        message: `Searching Amazon for '${actualKeyword}'${targetBrand ? ` (${targetBrand} Catalog)` : ''} (${searchQueries.length} search angles)...`,
        parsed,
        current_page: 0,
        total_pages: maxPages * searchQueries.length,
      });
    }

    const totalSteps = searchQueries.length * maxPages;
    let step = 0;
    await this.applyPageLoadTimeout();

    for (const curQuery of searchQueries) {
      for (let page = 1; page <= maxPages; page++) {
        step += 1;
        const params = [`k=${plus(curQuery)}`, `page=${page}`];
        if (minPrice !== null && minPrice !== undefined) params.push(`low-price=${Math.trunc(minPrice)}`);
        if (maxPrice !== null && maxPrice !== undefined) params.push(`high-price=${Math.trunc(maxPrice)}`);
        const searchUrl = `${this.domain}/s?${params.join('&')}`;
        logger.info(`[${step}/${totalSteps}] Scraping: ${curQuery} (p.${page}): ${searchUrl}`);

        if (progressCallback) {
          progressCallback({
            stage: 'page_loading',
            message: `Scanning Amazon angle '${curQuery}' (page ${page})...`,
            current_page: step,
            total_pages: totalSteps,
            url: searchUrl,
          });
        }

        try {
          await this.driver.get(searchUrl);
        } catch (e) {
          if (e && e.name === 'TimeoutError') {
            logger.warn('Search page load timed out, trying to parse available content...');
          } else {
            logger.error(`Search request failed: ${e && e.message}`);
            break;
          }
        }

        if (!(await this.checkAndHandleCaptcha())) break;
        await this.randomSleep();

        const $ = cheerio.load(await this.driver.getPageSource());
        let items = $("div[data-component-type='s-search-result']");
        if (!items.length) items = $('.s-result-item[data-asin]');
        logger.info(`Found ${items.length} raw listings for '${curQuery}' on page ${page}.`);

        let pageItems = 0;
        items.each((_, el) => {
          const asin = ($(el).attr('data-asin') || '').trim();
          if (!asin || seen.has(asin)) return;
          const product = this.parseSearchItemNode($, el, itemOpts);
          if (!product) return;
          product.seller = '';
          seen.add(asin);
          results.push(product);
          pageItems += 1;
          if (progressCallback) progressCallback({ stage: 'item_scraped', item: product, total_count: results.length });
        });
        logger.info(`Page ${page}: Scraped ${pageItems} valid items (Total matches so far: ${results.length})`);
      }
    }

    if (results.length) {
      if (progressCallback) {
        progressCallback({
          stage: 'enriching_sellers',
          message: `Fetching verified Amazon seller information for ${results.length} items...`,
          current_page: totalSteps,
          total_pages: totalSteps,
        });
      }
      logger.info(`Enriching sellers for ${results.length} items via concurrent pool...`);
      try {
        const sellers = await mapLimit(results, 6, (r) => fetchSellerForAsin(r.asin));
        results.forEach((r, i) => {
          r.seller = sellers[i];
        });
      } catch (e) {
        logger.warn(`Seller enrichment encountered minor issue: ${e && e.message}`);
      }
    }

    if (progressCallback) {
      progressCallback({
        stage: 'completed',
        message: `Successfully scraped ${results.length} in-stock items with verified sellers!`,
        total_count: results.length,
      });
    }
    return results;
  }
}

// ---------------------------------------------------------------------------
// CSV / JSON export
// ---------------------------------------------------------------------------
const STANDARD_FIELDS = [
  'asin', 'title', 'price', 'price_num', 'mrp', 'mrp_num', 'discount', 'in_stock', 'availability',
  'rating', 'review_count', 'brand', 'seller', 'is_prime', 'delivery', 'image_url', 'features',
  'search_query', 'url', 'scraped_at',
];

function csvCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'True' : 'False'; // matches the Python CSVs
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** Minimal RFC-4180 parser -> array of row objects keyed by the header row. */
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => !(r.length === 1 && r[0] === ''));
  if (!nonEmpty.length) return [];
  const header = nonEmpty[0];
  return nonEmpty.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

class DataExporter {
  static saveToCsv(data, filepath) {
    if (!data || !data.length) return;
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    const exists = fs.existsSync(filepath);
    let out = '';
    if (!exists) out += STANDARD_FIELDS.join(',') + '\r\n';
    for (const row of data) out += STANDARD_FIELDS.map((k) => csvCell(row[k])).join(',') + '\r\n';
    fs.appendFileSync(filepath, out, 'utf8');
    logger.info(`[OK] Saved ${data.length} items to CSV: ${filepath}`);
  }

  static saveToJson(data, filepath) {
    if (!data || !data.length) return;
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    let existing = [];
    if (fs.existsSync(filepath)) {
      try {
        existing = JSON.parse(fs.readFileSync(filepath, 'utf8'));
        if (!Array.isArray(existing)) existing = [];
      } catch {
        existing = [];
      }
    }
    const seen = new Set(existing.filter((i) => i && i.asin).map((i) => i.asin));
    for (const d of data) {
      if (!seen.has(d.asin)) {
        existing.push(d);
        if (d.asin) seen.add(d.asin);
      }
    }
    fs.writeFileSync(filepath, JSON.stringify(existing.length ? existing : data, null, 2), 'utf8');
    logger.info(`[OK] Saved to JSON: ${filepath}`);
  }

  static printSummaryCard(item) {
    const cut = (s, n) => String(s).slice(0, n);
    console.log('\n' + '='.repeat(70));
    console.log(` [PRODUCT]  ${cut(item.title || 'N/A', 65)}`);
    console.log(` [ASIN]     ${item.asin || 'N/A'}  |  [BRAND] ${item.brand || 'N/A'}`);
    console.log(` [PRICE]    ${item.price || 'N/A'}  |  [MRP] ${item.mrp || 'N/A'}  |  [DISCOUNT] ${item.discount || 'N/A'}`);
    console.log(` [RATING]   ${item.rating || 'N/A'} (${item.review_count || '0 reviews'})`);
    console.log(` [STOCK]    ${item.availability || 'N/A'}`);
    if (item.seller) console.log(` [SELLER]   ${cut(item.seller, 65)}`);
    console.log(` [URL]      ${item.url || 'N/A'}`);
    console.log('='.repeat(70));
  }
}

module.exports = {
  AmazonScraper,
  DataExporter,
  extractAsin,
  cleanText,
  parsePrice,
  parseNaturalQuery,
  matchesExactModel,
  isValidPhoneHandset,
  isPhoneAccessory,
  extractBrandAndSpecs,
  fetchSellerForAsin,
  parseCsv,
  logger,
};
