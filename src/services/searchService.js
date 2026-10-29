/**
 * Scalefox Search & NLP Filter Service
 * Handles client-side smart query parsing, search history in localStorage,
 * in-memory catalog filtering, and provides a pluggable backend scraper hook.
 */

const HISTORY_STORAGE_KEY = "scalefox_search_history_v1";

// Helper to convert price strings like "₹79,900" or "79900" to float
export function parsePriceNumber(priceStr) {
  if (typeof priceStr === "number") return priceStr;
  if (!priceStr) return 0;
  const cleaned = String(priceStr).replace(/[^0-9.]/g, "");
  return parseFloat(cleaned) || 0;
}

// Helper to convert rating strings like "4.5/5" or "4.3" to float
export function parseRatingNumber(ratingStr) {
  if (typeof ratingStr === "number") return ratingStr;
  if (!ratingStr) return 0;
  const match = String(ratingStr).match(/([0-9]+(?:\.[0-9]+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

/**
 * Smart Natural Language Query Parser
 * Understands:
 * - "phones under 25000", "mobiles below 30k", "under 50k", "< 20000"
 * - "between 20000 and 50000", "from 15k to 35k"
 * - "above 40000", "over 50k", "> 30000"
 * - "4 star", "4.5 rating", "rating above 4"
 * - Common phone brands (Apple, Samsung, OnePlus, Google, etc.)
 */
export function parseSmartQuery(queryText = "") {
  const raw = String(queryText).trim();
  if (!raw) {
    return {
      rawQuery: "",
      keyword: "",
      minPrice: null,
      maxPrice: null,
      minRating: null,
      detectedBrand: null,
      detectedBudget: "",
    };
  }

  let minPrice = null;
  let maxPrice = null;
  let minRating = null;
  let detectedBudget = "";
  let workingQuery = raw;

  // 1. Between X and Y
  const betweenMatch = workingQuery.match(
    /(?:between|from)\s*(?:rs\.?|inr|₹)?\s*(\d+(?:\.\d+)?)\s*(k|thousand|l|lakh)?\s*(?:to|and|-)\s*(?:rs\.?|inr|₹)?\s*(\d+(?:\.\d+)?)\s*(k|thousand|l|lakh)?/i
  );
  if (betweenMatch) {
    const toNum = (valStr, unit) => {
      let v = parseFloat(valStr);
      const u = (unit || "").toLowerCase();
      if (u === "k" || u === "thousand" || (v <= 100 && v > 0)) v *= 1000;
      else if (u === "l" || u === "lakh") v *= 100000;
      return v;
    };
    minPrice = toNum(betweenMatch[1], betweenMatch[2]);
    maxPrice = toNum(betweenMatch[3], betweenMatch[4]);
    detectedBudget = `₹${minPrice.toLocaleString()} - ₹${maxPrice.toLocaleString()}`;
    workingQuery = workingQuery.replace(betweenMatch[0], " ");
  }

  // 2. Under / Below / Less than
  if (maxPrice === null) {
    const underMatch = workingQuery.match(
      /(?:under|below|less\s+than|up\s+to|within|max|<=|<)\s*(?:rs\.?|inr|₹)?\s*(\d+(?:\.\d+)?)\s*(k|thousand|l|lakh)?/i
    );
    if (underMatch) {
      let val = parseFloat(underMatch[1]);
      const unit = (underMatch[2] || "").toLowerCase();
      if (unit === "k" || unit === "thousand" || (val <= 100 && val > 0)) {
        val *= 1000;
      } else if (unit === "l" || unit === "lakh") {
        val *= 100000;
      }
      maxPrice = val;
      detectedBudget = `Under ₹${maxPrice.toLocaleString()}`;
      workingQuery = workingQuery.replace(underMatch[0], " ");
    }
  }

  // 3. Above / Over / More than
  if (minPrice === null) {
    const aboveMatch = workingQuery.match(
      /(?:above|over|more\s+than|min|>=|>)\s*(?:rs\.?|inr|₹)?\s*(\d+(?:\.\d+)?)\s*(k|thousand|l|lakh)?/i
    );
    if (aboveMatch) {
      let val = parseFloat(aboveMatch[1]);
      const unit = (aboveMatch[2] || "").toLowerCase();
      if (unit === "k" || unit === "thousand" || (val <= 100 && val > 0)) {
        val *= 1000;
      } else if (unit === "l" || unit === "lakh") {
        val *= 100000;
      }
      minPrice = val;
      if (!detectedBudget) detectedBudget = `Above ₹${minPrice.toLocaleString()}`;
      workingQuery = workingQuery.replace(aboveMatch[0], " ");
    }
  }

  // 4. Rating (e.g. "4 star", "4.5 star", "rating 4")
  const ratingMatch = workingQuery.match(/(\d(?:\.\d)?)\s*(?:star|rating|\+)/i);
  if (ratingMatch) {
    const rVal = parseFloat(ratingMatch[1]);
    if (rVal >= 1 && rVal <= 5) {
      minRating = rVal;
      workingQuery = workingQuery.replace(ratingMatch[0], " ");
    }
  }

  // 5. Brand detection
  const KNOWN_BRANDS = [
    "Apple",
    "iPhone",
    "Samsung",
    "Galaxy",
    "OnePlus",
    "Google",
    "Pixel",
    "Xiaomi",
    "Redmi",
    "Motorola",
    "Nothing",
    "Realme",
    "Vivo",
    "iQOO",
  ];
  let detectedBrand = null;
  for (const b of KNOWN_BRANDS) {
    const regex = new RegExp(`\\b${b}\\b`, "i");
    if (regex.test(raw)) {
      detectedBrand = b === "iPhone" ? "Apple" : b === "Galaxy" ? "Samsung" : b;
      break;
    }
  }

  // Cleaned keyword
  const keyword = workingQuery.replace(/\s+/g, " ").trim();

  return {
    rawQuery: raw,
    keyword,
    minPrice,
    maxPrice,
    minRating,
    detectedBrand,
    detectedBudget,
  };
}

/**
 * Filter product catalog in-memory based on search text and active filters
 */
export function filterProducts(products = [], query = "", filters = {}) {
  const nlp = parseSmartQuery(query);

  const effectiveMinPrice =
    filters.minPrice !== null && filters.minPrice !== ""
      ? parseFloat(filters.minPrice)
      : nlp.minPrice;

  const effectiveMaxPrice =
    filters.maxPrice !== null && filters.maxPrice !== ""
      ? parseFloat(filters.maxPrice)
      : nlp.maxPrice;

  const effectiveMinRating =
    filters.minRating !== null && filters.minRating !== ""
      ? parseFloat(filters.minRating)
      : nlp.minRating;

  const searchKeyword = (nlp.keyword || "").toLowerCase();
  const searchBrand = (filters.brand || nlp.detectedBrand || "").toLowerCase();

  return products.filter((product) => {
    const nameLower = (product.name || "").toLowerCase();
    const sellerLower = (product.seller || "").toLowerCase();
    const brandLower = (product.brand || "").toLowerCase();
    const priceVal = parsePriceNumber(product.price);
    const ratingVal = parseRatingNumber(product.rating);

    // 1. Keyword check
    if (searchKeyword && searchKeyword !== "phone" && searchKeyword !== "phones" && searchKeyword !== "mobile" && searchKeyword !== "mobiles") {
      const words = searchKeyword.split(" ").filter(Boolean);
      const matchesKeyword =
        nameLower.includes(searchKeyword) ||
        sellerLower.includes(searchKeyword) ||
        brandLower.includes(searchKeyword) ||
        (words.length > 1 &&
          words.every(
            (w) =>
              nameLower.includes(w) ||
              sellerLower.includes(w) ||
              brandLower.includes(w)
          ));
      if (!matchesKeyword) return false;
    }

    // 2. Brand check
    if (searchBrand) {
      const matchesBrand =
        nameLower.includes(searchBrand) || brandLower.includes(searchBrand);
      if (!matchesBrand) return false;
    }

    // 3. Price checks
    if (effectiveMinPrice !== null && priceVal < effectiveMinPrice) {
      return false;
    }
    if (effectiveMaxPrice !== null && priceVal > effectiveMaxPrice) {
      return false;
    }

    // 4. Rating check
    if (effectiveMinRating !== null && ratingVal < effectiveMinRating) {
      return false;
    }

    // 5. In-stock check
    if (filters.inStockOnly && product.inStock === false) {
      return false;
    }

    // 6. Prime / Assured check
    if (filters.primeOnly) {
      const hasPrimeOrAssured =
        (product.badge && /prime|assured/i.test(product.badge)) ||
        (product.delivery && /prime|tomorrow/i.test(product.delivery));
      if (!hasPrimeOrAssured) return false;
    }

    return true;
  });
}

/**
 * Search History Management (localStorage)
 */
export function getSearchHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Failed to read search history:", err);
    return [];
  }
}

export function saveSearchQuery(queryText, appliedFilters = {}) {
  const trimmed = String(queryText || "").trim();
  if (!trimmed) return getSearchHistory();

  try {
    const existing = getSearchHistory();
    // Remove duplicate of the same query if already present
    const filtered = existing.filter(
      (item) => item.query.toLowerCase() !== trimmed.toLowerCase()
    );

    const now = new Date();
    const formattedDate = now.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const formattedTime = now.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const newItem = {
      id: "sh_" + Date.now(),
      query: trimmed,
      date: `${formattedDate}, ${formattedTime}`,
      timestamp: Date.now(),
      filters: appliedFilters,
    };

    // Keep up to 15 recent searches
    const updated = [newItem, ...filtered].slice(0, 15);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error("Failed to save search history:", err);
    return getSearchHistory();
  }
}

export function deleteHistoryItem(id) {
  try {
    const existing = getSearchHistory();
    const updated = existing.filter((item) => item.id !== id);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error("Failed to delete history item:", err);
    return getSearchHistory();
  }
}

export function clearAllHistory() {
  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
    return [];
  } catch (err) {
    console.error("Failed to clear search history:", err);
    return [];
  }
}

import initialAmazonScraped from "../backend/scraped_data/amazon_products.json";
import initialAppleScraped from "../backend/brand_scrapers/apple/scraped_data/apple_products.json";
import initialVivoScraped from "../backend/brand_scrapers/vivo/scraped_data/vivo_products.json";

/**
 * Backend Scraper Integration
 * Communicates with the Express + Turbo Amazon Scraper backend on port 5050
 */
const BACKEND_BASE = "http://localhost:5050";
const BRAND_SCRAPER_BASES = {
  Apple: import.meta.env.VITE_APPLE_SCRAPER_URL || "http://localhost:5055",
  Vivo: import.meta.env.VITE_VIVO_SCRAPER_URL || "http://localhost:5052",
};

/**
 * Get initial Amazon products directly from the Amazon data file
 */
export function getInitialAmazonProducts() {
  if (Array.isArray(initialAmazonScraped) && initialAmazonScraped.length > 0) {
    return initialAmazonScraped.map(transformScrapedItem).filter(Boolean);
  }
  return [];
}

export function getInitialBrandProducts() {
  return [
    ...initialAppleScraped.map((item, index) =>
      transformBrandScrapedItem(item, "Apple", index)
    ),
    ...initialVivoScraped.map((item, index) =>
      transformBrandScrapedItem(item, "Vivo", index)
    ),
  ].filter(Boolean);
}

function transformBrandScrapedItem(item, brand, index = 0) {
  if (!item) return null;

  const identifier = item.sku || item.url || `${brand}-${index}`;
  const priceNum = item.price_num || parsePriceNumber(item.price);

  return {
    id: `${brand.toLowerCase()}_${identifier}`,
    name: item.title || item.model || `${brand} smartphone`,
    image: item.image_url || "",
    price: item.price || (priceNum ? `₹${priceNum.toLocaleString("en-IN")}` : "Check Price"),
    originalPrice: item.mrp || "",
    discount: item.discount || "",
    rating: item.rating
      ? String(item.rating).includes("/")
        ? item.rating
        : `${item.rating}/5`
      : "4.3/5",
    delivery: item.availability || (item.in_stock === false ? "Currently unavailable" : "Check availability"),
    seller: item.seller || `${brand} Official Online Store`,
    badge: `${brand} Official`,
    badgeType: brand.toLowerCase(),
    brand,
    inStock: item.in_stock ?? true,
    channel: brand.toLowerCase(),
    url: item.url || "",
    isLiveScraped: true,
  };
}

/**
 * Transforms an Amazon scraper item object into Scalefox product catalog format
 */
export function transformScrapedItem(item, index = 0) {
  if (!item) return null;
  const asin = item.asin || `scraped_${Date.now()}_${index}`;
  const priceNum = item.price_num || parsePriceNumber(item.price);
  const formattedPrice =
    item.price ||
    (priceNum ? `₹${priceNum.toLocaleString("en-IN")}` : "Check Price");

  let mrpText = item.mrp || "";
  if (!mrpText && item.mrp_num) {
    mrpText = `₹${item.mrp_num.toLocaleString("en-IN")}`;
  }

  let discountText = item.discount || "";
  if (discountText && !discountText.includes("off")) {
    discountText = `${discountText.replace("-", "")} off`;
  }

  const ratingStr = item.rating
    ? String(item.rating).includes("/")
      ? item.rating
      : `${item.rating}/5`
    : "4.3/5";

  return {
    id: `amz_${asin}`,
    asin: item.asin,
    name: item.title || "Amazon Certified Device",
    image:
      item.image_url ||
      "https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-15.jpg",
    price: formattedPrice,
    originalPrice: mrpText,
    discount: discountText,
    rating: ratingStr,
    delivery: item.delivery || (item.is_prime ? "Prime 1-Day Delivery" : "Fast Amazon Delivery"),
    seller: item.seller || (item.is_prime ? "Fulfilled by Amazon" : "Amazon Verified Seller"),
    badge: item.is_prime ? "Prime" : "Amazon Verified",
    badgeType: "amazon",
    brand: item.brand || "Amazon",
    inStock: item.in_stock ?? true,
    channel: "amazon",
    url: item.url || "",
    isLiveScraped: true,
  };
}

/**
 * Check if the backend scraper server is online
 */
export async function checkBackendHealth() {
  try {
    const res = await fetch(`${BACKEND_BASE}/api/status`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data && data.status !== undefined);
  } catch {
    return false;
  }
}

/**
 * Fetch saved product history from scraper CSV
 */
export async function fetchScraperHistory() {
  try {
    const res = await fetch(`${BACKEND_BASE}/api/history`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (data && Array.isArray(data.items)) {
      return data.items.map(transformScrapedItem).filter(Boolean);
    }
    return [];
  } catch (err) {
    console.warn("[Scalefox] Failed to fetch backend history:", err);
    return [];
  }
}

/**
 * Fetch cached/latest products from brand scraper backend (Apple, Vivo)
 */
export async function fetchBrandProducts(brand) {
  const baseUrl = BRAND_SCRAPER_BASES[brand];
  if (!baseUrl) return [];
  try {
    const res = await fetch(`${baseUrl}/api/status`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (data && Array.isArray(data.products) && data.products.length > 0) {
      return data.products
        .map((item, index) => transformBrandScrapedItem(item, brand, index))
        .filter(Boolean);
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Run live Amazon scraper for query and poll until completed
 */
export async function searchWithBackendScraper(query, filters = {}, onProgress = null) {
  const trimmed = String(query || "").trim();
  if (!trimmed) return [];

  try {
    // 1. Trigger background scrape
    const payload = {
      query: trimmed,
      min_price: filters.minPrice ? Number(filters.minPrice) : null,
      max_price: filters.maxPrice ? Number(filters.maxPrice) : null,
      in_stock_only: Boolean(filters.inStockOnly),
      prime_only: Boolean(filters.primeOnly),
      min_rating: filters.minRating ? Number(filters.minRating) : null,
      pages: 1,
    };

    const triggerRes = await fetch(`${BACKEND_BASE}/api/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    if (!triggerRes.ok && triggerRes.status !== 409) {
      throw new Error(`Scraper start returned HTTP ${triggerRes.status}`);
    }

    const triggerData = await triggerRes.json().catch(() => ({}));

    // Serverless mode returns results directly in the initial response
    if (triggerData && triggerData.results && Array.isArray(triggerData.results)) {
      if (onProgress) {
        onProgress({ status: "completed", progress: 100, message: triggerData.message });
      }
      return triggerData.results.map(transformScrapedItem).filter(Boolean);
    }

    // 2. Desktop Mode: Poll /api/status until completed or error
    let attempts = 0;
    const maxAttempts = 20; // 20 * 1200ms = 24 seconds max
    while (attempts < maxAttempts) {
      await new Promise((r) => setTimeout(r, 1200));
      attempts++;

      try {
        const pollRes = await fetch(`${BACKEND_BASE}/api/status`, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(3000),
        });

        if (!pollRes.ok) continue;
        const job = await pollRes.json();

        if (onProgress && job) {
          onProgress({
            status: job.status,
            progress: job.progress || 0,
            message: job.message || "Scanning Amazon catalog...",
          });
        }

        if (job.status === "completed") {
          const rawItems = Array.isArray(job.results) ? job.results : [];
          return rawItems.map(transformScrapedItem).filter(Boolean);
        }

        if (job.status === "error") {
          console.warn("[Scalefox Scraper] Job ended with error:", job.error);
          return [];
        }
      } catch (pollErr) {
        console.warn("[Scalefox Scraper] Polling attempt error:", pollErr);
      }
    }

    return [];
  } catch (err) {
    console.info(
      "[Scalefox Scraper Hook] Backend scraper unreachable or offline:",
      err.message || err
    );
    return [];
  }
}

export async function searchWithBrandScraper(brand, query, filters = {}, onProgress = null) {
  const baseUrl = BRAND_SCRAPER_BASES[brand];
  if (!baseUrl) throw new Error(`No scraper is configured for ${brand}.`);

  const trimmed = String(query || "").trim();
  if (!trimmed) return [];

  const payload = {
    query: trimmed,
    series: "All",
    pincode: import.meta.env.VITE_SCRAPER_PINCODE || "110058",
    in_stock_only: Boolean(filters.inStockOnly),
  };
  const startResponse = await fetch(`${baseUrl}/api/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });

  if (!startResponse.ok) {
    const body = await startResponse.json().catch(() => ({}));
    throw new Error(
      body.message ||
        `${brand} scraper returned HTTP ${startResponse.status}. Check its server and dependencies.`
    );
  }

  const pollLimit = 180;
  for (let attempt = 0; attempt < pollLimit; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const statusResponse = await fetch(`${baseUrl}/api/status`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!statusResponse.ok) {
      throw new Error(`${brand} scraper status returned HTTP ${statusResponse.status}.`);
    }

    const status = await statusResponse.json();
    const progress = Number(status.progress) || 0;
    const message = status.message || status.logs?.at?.(-1) || `Scraping ${brand} products...`;
    onProgress?.({ status: status.status, progress, message });

    if (status.status === "error") {
      throw new Error(status.error || message || `${brand} scraper failed.`);
    }

    if (status.status === "completed") {
      const products = status.products;
      if (!Array.isArray(products)) {
        throw new Error(`${brand} scraper completed without a products list.`);
      }
      return products
        .map((item, index) => transformBrandScrapedItem(item, brand, index))
        .filter(Boolean);
    }
  }

  throw new Error(`${brand} scraper did not finish within 3 minutes.`);
}
