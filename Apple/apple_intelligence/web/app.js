/**
 * Apple Intelligence Pro — Frontend Application Engine
 * Real-time API Polling, Dynamic Model Isolation Filtering, Metrics Sync,
 * Frosted Glass Card Rendering & 1-Click Export Handlers
 */

// Application State
const appState = {
  products: [],
  filteredProducts: [],
  currentQuery: "All",
  activeSeries: "all",
  activeSort: "featured",
  pincode: "110058",
  inStockOnly: false,
  isScraping: false,
  viewMode: "grid", // "grid" or "table"
  pollTimer: null
};

// DOM References
const dom = {
  // Header
  currentPinDisplay: document.getElementById("currentPinDisplay"),
  engineStatusText: document.getElementById("engineStatusText"),
  enginePulseDot: document.getElementById("enginePulseDot"),
  
  // Executive Cards
  heroInStockCount: document.getElementById("heroInStockCount"),
  heroVerifiedSubtext: document.getElementById("heroVerifiedSubtext"),
  heroProgressBar: document.getElementById("heroProgressBar"),
  heroProgressPercent: document.getElementById("heroProgressPercent"),
  pillInStockCount: document.getElementById("pillInStockCount"),
  pillOutOfStockCount: document.getElementById("pillOutOfStockCount"),
  pulseLowestPrice: document.getElementById("pulseLowestPrice"),
  pulseLowestModel: document.getElementById("pulseLowestModel"),
  radialCircleFill: document.getElementById("radialCircleFill"),
  radialPctDisplay: document.getElementById("radialPctDisplay"),
  cardAvgPrice: document.getElementById("cardAvgPrice"),

  // Command Hub
  searchInput: document.getElementById("searchInput"),
  btnClearSearch: document.getElementById("btnClearSearch"),
  pincodeInput: document.getElementById("pincodeInput"),
  inStockToggle: document.getElementById("inStockToggle"),
  btnLaunchScraper: document.getElementById("btnLaunchScraper"),
  presetChips: document.querySelectorAll(".preset-chip"),

  // Console
  consoleDot: document.getElementById("consoleDot"),
  consoleStatusText: document.getElementById("consoleStatusText"),
  consoleProgressVal: document.getElementById("consoleProgressVal"),
  consoleProgressBar: document.getElementById("consoleProgressBar"),
  consoleLogs: document.getElementById("consoleLogs"),

  // Catalog & Filters
  seriesTabs: document.querySelectorAll(".series-tab"),
  sortSelect: document.getElementById("sortSelect"),
  btnViewGrid: document.getElementById("btnViewGrid"),
  btnViewTable: document.getElementById("btnViewTable"),
  productsGrid: document.getElementById("productsGrid"),
  productsTableContainer: document.getElementById("productsTableContainer"),
  productsTableBody: document.getElementById("productsTableBody"),
  emptyState: document.getElementById("emptyState"),
  btnResetFilters: document.getElementById("btnResetFilters"),

  // Series Counts
  countAll: document.getElementById("countAll"),
  count16: document.getElementById("count16"),
  count15: document.getElementById("count15"),
  count14: document.getElementById("count14"),
  countSE: document.getElementById("countSE")
};

// Initial App Boot
document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  fetchStatus();
  startStatusPolling(2500);
});

// Event Listeners Setup
function setupEventListeners() {
  // Search Input live typing
  dom.searchInput.addEventListener("input", (e) => {
    appState.currentQuery = e.target.value.trim();
    syncPresetChips(appState.currentQuery);
    applyFiltersAndRender();
  });

  // Clear Search
  dom.btnClearSearch.addEventListener("click", () => {
    dom.searchInput.value = "";
    appState.currentQuery = "";
    syncPresetChips("All");
    applyFiltersAndRender();
  });

  // Pincode Input
  dom.pincodeInput.addEventListener("change", (e) => {
    const pin = e.target.value.trim();
    if (pin.length === 6 && /^\d+$/.test(pin)) {
      appState.pincode = pin;
      dom.currentPinDisplay.textContent = pin;
    }
  });

  // In-Stock Only Toggle
  dom.inStockToggle.addEventListener("change", (e) => {
    appState.inStockOnly = e.target.checked;
    applyFiltersAndRender();
  });

  // Launch Scraper Button
  dom.btnLaunchScraper.addEventListener("click", launchScraper);

  // Preset Chips
  dom.presetChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      dom.presetChips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      const model = chip.getAttribute("data-model");
      
      if (model === "All") {
        dom.searchInput.value = "";
        appState.currentQuery = "All";
      } else {
        dom.searchInput.value = model;
        appState.currentQuery = model;
      }
      applyFiltersAndRender();
    });
  });

  // Series Filter Tabs
  dom.seriesTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      dom.seriesTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      appState.activeSeries = tab.getAttribute("data-series");
      applyFiltersAndRender();
    });
  });

  // Sorting
  dom.sortSelect.addEventListener("change", (e) => {
    appState.activeSort = e.target.value;
    applyFiltersAndRender();
  });

  // View Mode Toggles
  dom.btnViewGrid.addEventListener("click", () => {
    appState.viewMode = "grid";
    dom.btnViewGrid.classList.add("active");
    dom.btnViewTable.classList.remove("active");
    dom.productsGrid.classList.remove("hidden");
    dom.productsTableContainer.classList.add("hidden");
  });

  dom.btnViewTable.addEventListener("click", () => {
    appState.viewMode = "table";
    dom.btnViewTable.classList.add("active");
    dom.btnViewGrid.classList.remove("active");
    dom.productsGrid.classList.add("hidden");
    dom.productsTableContainer.classList.remove("hidden");
  });

  // Reset Filters
  dom.btnResetFilters.addEventListener("click", () => {
    dom.searchInput.value = "";
    appState.currentQuery = "All";
    appState.activeSeries = "all";
    appState.inStockOnly = false;
    dom.inStockToggle.checked = false;
    dom.sortSelect.value = "featured";
    appState.activeSort = "featured";

    dom.seriesTabs.forEach((t) => {
      t.classList.toggle("active", t.getAttribute("data-series") === "all");
    });
    syncPresetChips("All");
    applyFiltersAndRender();
  });
}

function syncPresetChips(query) {
  const qLower = (query || "").toLowerCase();
  dom.presetChips.forEach((chip) => {
    const model = chip.getAttribute("data-model").toLowerCase();
    if (qLower === "" || qLower === "all") {
      chip.classList.toggle("active", model === "all");
    } else {
      chip.classList.toggle("active", model === qLower);
    }
  });
}

// Fetch Status from Backend
async function fetchStatus() {
  try {
    const res = await fetch("/api/status");
    if (!res.ok) return;
    const data = await res.json();

    if (data.products && Array.isArray(data.products)) {
      appState.products = data.products;
    }

    updateMetricsCards(data.metrics, data.products);
    updateConsole(data.status, data.progress, data.logs);
    updateEngineStatus(data.status);

    if (data.status === "scraping") {
      if (!appState.isScraping) {
        setScrapingUI(true);
      }
    } else {
      if (appState.isScraping) {
        setScrapingUI(false);
      }
    }

    updateSeriesCounters(appState.products);
    applyFiltersAndRender();
  } catch (err) {
    console.warn("Status fetch failed:", err);
  }
}

function startStatusPolling(intervalMs) {
  if (appState.pollTimer) clearInterval(appState.pollTimer);
  appState.pollTimer = setInterval(fetchStatus, intervalMs);
}

// Launch Scraper API Call
async function launchScraper() {
  const query = appState.currentQuery || "All";
  const pin = dom.pincodeInput.value.trim() || "110058";
  const inStockOnly = dom.inStockToggle.checked;

  setScrapingUI(true);
  appendConsoleLog(`[Client] Dispatching async scraper job for '${query}', PIN: ${pin}...`, "info");

  try {
    const res = await fetch("/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: query,
        pincode: pin,
        in_stock_only: inStockOnly
      })
    });

    if (res.ok) {
      startStatusPolling(1000); // Poll aggressively during execution
    } else {
      const err = await res.json();
      appendConsoleLog(`[Error] ${err.message || "Failed to start scraper"}`, "error");
      setScrapingUI(false);
    }
  } catch (err) {
    appendConsoleLog(`[Network Error] Could not connect to API server: ${err}`, "error");
    setScrapingUI(false);
  }
}

function setScrapingUI(isRunning) {
  appState.isScraping = isRunning;
  if (isRunning) {
    dom.btnLaunchScraper.classList.add("running");
    dom.btnLaunchScraper.querySelector("span").textContent = "SCRAPING IN PROGRESS...";
    dom.enginePulseDot.style.background = "#ff9500";
    dom.enginePulseDot.style.boxShadow = "0 0 10px #ff9500";
    dom.engineStatusText.textContent = "SCRAPING LIVE";
    dom.consoleDot.classList.add("active");
  } else {
    dom.btnLaunchScraper.classList.remove("running");
    dom.btnLaunchScraper.querySelector("span").textContent = "LAUNCH SCRAPER";
    dom.enginePulseDot.style.background = "#34c759";
    dom.enginePulseDot.style.boxShadow = "0 0 10px #34c759";
    dom.engineStatusText.textContent = "ENGINE READY";
    dom.consoleDot.classList.remove("active");
  }
}

function updateEngineStatus(status) {
  if (status === "scraping") {
    dom.engineStatusText.textContent = "SCRAPING LIVE";
  } else {
    dom.engineStatusText.textContent = "ENGINE READY";
  }
}

// Update Top Executive Cards
function updateMetricsCards(metrics, products) {
  if (!metrics) return;

  const total = metrics.total_variants || (products ? products.length : 0);
  const inStock = metrics.in_stock_count !== undefined ? metrics.in_stock_count : total;
  const outOfStock = metrics.out_of_stock_count || 0;
  const rate = metrics.deliverability_rate !== undefined ? metrics.deliverability_rate : 100;

  // Hero Card
  dom.heroInStockCount.textContent = inStock;
  dom.heroVerifiedSubtext.textContent = `${inStock} / ${total} HANDSET VARIANTS VERIFIED`;
  dom.heroProgressBar.style.width = `${rate}%`;
  dom.heroProgressPercent.textContent = `${rate}%`;
  dom.pillInStockCount.textContent = `${inStock} In Stock Online`;
  dom.pillOutOfStockCount.textContent = `${outOfStock} Out of Stock`;

  // Pulse Card
  if (metrics.min_price) {
    dom.pulseLowestPrice.textContent = Number(metrics.min_price).toLocaleString("en-IN");
    dom.pulseLowestModel.textContent = `Apple ${metrics.min_model || "iPhone"}`;
  }

  // Radial Card
  const circumference = 264; // 2 * PI * 42
  const offset = circumference - (circumference * (rate / 100));
  dom.radialCircleFill.style.strokeDashoffset = offset;
  dom.radialPctDisplay.textContent = `${Math.round(rate)}%`;

  if (metrics.avg_price) {
    dom.cardAvgPrice.textContent = `₹${Math.round(metrics.avg_price).toLocaleString("en-IN")}`;
  }
}

// Update Console Stream
function updateConsole(status, progress, logs) {
  dom.consoleStatusText.textContent = `Console Stream: ${status ? status.toUpperCase() : "IDLE"}`;
  dom.consoleProgressVal.textContent = `${progress || 100}%`;
  dom.consoleProgressBar.style.width = `${progress || 100}%`;

  if (logs && Array.isArray(logs) && logs.length > 0) {
    dom.consoleLogs.innerHTML = "";
    logs.slice(-40).forEach((line) => {
      const div = document.createElement("div");
      div.className = "log-line";
      if (line.includes("Error") || line.includes("failed")) div.classList.add("error");
      else if (line.includes("In Stock") || line.includes("verified") || line.includes("stored")) div.classList.add("success");
      else if (line.includes("Starting") || line.includes("Extracting")) div.classList.add("info");
      div.textContent = line;
      dom.consoleLogs.appendChild(div);
    });
    dom.consoleLogs.scrollTop = dom.consoleLogs.scrollHeight;
  }
}

function appendConsoleLog(line, type = "info") {
  const div = document.createElement("div");
  div.className = `log-line ${type}`;
  div.textContent = line;
  dom.consoleLogs.appendChild(div);
  dom.consoleLogs.scrollTop = dom.consoleLogs.scrollHeight;
}

// Update Series Tab Counters
function updateSeriesCounters(products) {
  if (!products) return;
  dom.countAll.textContent = products.length;
  dom.count16.textContent = products.filter((p) => (p.model || "").includes("16")).length;
  dom.count15.textContent = products.filter((p) => (p.model || "").includes("15")).length;
  dom.count14.textContent = products.filter((p) => (p.model || "").includes("14")).length;
  dom.countSE.textContent = products.filter((p) => (p.model || "").includes("SE")).length;
}

// Filtering & Sorting Core
function applyFiltersAndRender() {
  let list = [...appState.products];

  // 1. Text Query Filter with Exact-Model Isolation
  const q = (appState.currentQuery || "").trim().toLowerCase();
  if (q && q !== "all" && q !== "all iphones") {
    const qTokens = q.replace(/[^a-z0-9]/g, " ").split(/\s+/).filter(Boolean);

    list = list.filter((p) => {
      const model = (p.model || "").toLowerCase();
      const title = (p.title || "").toLowerCase();

      // iPhone 16 Pro Max
      if (qTokens.includes("16") && qTokens.includes("pro") && qTokens.includes("max")) {
        return (model.includes("16") || title.includes("16")) && (model.includes("pro max") || title.includes("pro max"));
      }
      // iPhone 16 Pro (strict)
      if (qTokens.includes("16") && qTokens.includes("pro") && !qTokens.includes("max")) {
        return (model.includes("16") || title.includes("16")) && (model.includes("pro") || title.includes("pro")) && !model.includes("max") && !title.includes("max");
      }
      // iPhone 16 Plus (strict)
      if (qTokens.includes("16") && qTokens.includes("plus")) {
        return (model.includes("16") || title.includes("16")) && (model.includes("plus") || title.includes("plus"));
      }
      // Base iPhone 16 (strict)
      if (qTokens.includes("16") && !qTokens.includes("pro") && !qTokens.includes("max") && !qTokens.includes("plus")) {
        const has16 = model.includes("16") || title.includes("iphone 16");
        const hasSub = ["pro", "max", "plus"].some((sub) => model.includes(sub) || title.includes(sub));
        return has16 && !hasSub;
      }
      // iPhone 15 Pro Max
      if (qTokens.includes("15") && qTokens.includes("pro") && qTokens.includes("max")) {
        return (model.includes("15") || title.includes("15")) && (model.includes("pro max") || title.includes("pro max"));
      }
      // iPhone 15 Pro
      if (qTokens.includes("15") && qTokens.includes("pro") && !qTokens.includes("max")) {
        return (model.includes("15") || title.includes("15")) && (model.includes("pro") || title.includes("pro")) && !model.includes("max") && !title.includes("max");
      }
      // iPhone 15 Plus
      if (qTokens.includes("15") && qTokens.includes("plus")) {
        return (model.includes("15") || title.includes("15")) && (model.includes("plus") || title.includes("plus"));
      }
      // Base iPhone 15 (strict)
      if (qTokens.includes("15") && !qTokens.includes("pro") && !qTokens.includes("max") && !qTokens.includes("plus")) {
        const has15 = model.includes("15") || title.includes("iphone 15");
        const hasSub = ["pro", "max", "plus"].some((sub) => model.includes(sub) || title.includes(sub));
        return has15 && !hasSub;
      }
      // iPhone 14
      if (qTokens.includes("14")) {
        return model.includes("14") || title.includes("iphone 14");
      }
      // iPhone SE
      if (qTokens.includes("se")) {
        return (model.includes("se") || title.includes("iphone se")) && !["16", "15", "14", "13"].some((n) => model.includes(n));
      }

      // General fallback token match
      return qTokens.every((token) => model.includes(token) || title.includes(token));
    });
  }

  // 2. Series Tab Filter
  if (appState.activeSeries !== "all") {
    if (appState.activeSeries === "16") {
      list = list.filter((p) => (p.model || "").includes("16"));
    } else if (appState.activeSeries === "15") {
      list = list.filter((p) => (p.model || "").includes("15"));
    } else if (appState.activeSeries === "14") {
      list = list.filter((p) => (p.model || "").includes("14"));
    } else if (appState.activeSeries === "se") {
      list = list.filter((p) => (p.model || "").includes("SE"));
    }
  }

  // 3. In-Stock Only Filter
  if (appState.inStockOnly) {
    list = list.filter((p) => p.in_stock === true);
  }

  // 4. Sorting
  if (appState.activeSort === "price-low") {
    list.sort((a, b) => (a.price_num || 0) - (b.price_num || 0));
  } else if (appState.activeSort === "price-high") {
    list.sort((a, b) => (b.price_num || 0) - (a.price_num || 0));
  } else if (appState.activeSort === "rating") {
    list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  } else if (appState.activeSort === "model") {
    list.sort((a, b) => (a.model || "").localeCompare(b.model || ""));
  }

  appState.filteredProducts = list;

  // Render Grid or Table
  if (list.length === 0) {
    dom.emptyState.classList.remove("hidden");
    dom.productsGrid.innerHTML = "";
    dom.productsTableBody.innerHTML = "";
  } else {
    dom.emptyState.classList.add("hidden");
    renderGrid(list);
    renderTable(list);
  }
}

// Render Products Grid Cards
function renderGrid(products) {
  dom.productsGrid.innerHTML = "";

  products.forEach((p) => {
    const card = document.createElement("div");
    card.className = "handset-card";

    const inStock = p.in_stock !== false;
    const stockClass = inStock ? "in-stock" : "out-of-stock";
    const stockText = inStock ? "In Stock Online" : "Out of Stock";
    const ctaText = inStock ? "View on Apple Store" : "Check Store / Notify Me";

    // Build specs chips
    let specsHtml = "";
    if (Array.isArray(p.specs)) {
      specsHtml = p.specs.slice(0, 5).map((s) => `<span class="spec-chip">${s}</span>`).join("");
    } else if (typeof p.specs === "string") {
      specsHtml = p.specs.split("|").slice(0, 5).map((s) => `<span class="spec-chip">${s.trim()}</span>`).join("");
    }

    card.innerHTML = `
      <div class="card-image-box">
        <img src="${p.image_url}" alt="${p.title}" loading="lazy" onerror="this.onerror=null; this.src='https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/iphone-16-ultramarine-select-202409?wid=940&hei=1112&fmt=png-alpha'">
      </div>

      <div class="card-tag-row">
        <span class="series-badge">${p.model || "iPhone"}</span>
        <div class="stock-pill ${stockClass}">
          <span class="stock-dot"></span>
          <span>${stockText}</span>
        </div>
      </div>

      <h3 class="handset-title" title="${p.title}">${p.title}</h3>
      <div class="handset-sku">SKU: ${p.sku || "MYWU3HN/A"} • PIN: ${p.pincode || "110058"}</div>

      <div class="specs-chips-wrap">
        ${specsHtml}
      </div>

      <div class="card-pricing-row">
        <div class="price-col">
          <span class="price-current">${p.price || "₹79,900"}</span>
          <span class="price-mrp">MRP: ${p.mrp || p.price}</span>
        </div>
        <div class="rating-badge">
          <svg class="star-icon" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          <span>${p.rating || 4.8}</span>
          <span class="review-count">(${p.review_count || 340})</span>
        </div>
      </div>

      <a href="${p.url || 'https://www.apple.com/in/shop/buy-iphone'}" target="_blank" rel="noopener" class="btn-card-cta ${stockClass}">
        ${ctaText}
      </a>
    `;

    dom.productsGrid.appendChild(card);
  });
}

// Render Products Table
function renderTable(products) {
  dom.productsTableBody.innerHTML = "";

  products.forEach((p) => {
    const tr = document.createElement("tr");
    const inStock = p.in_stock !== false;
    const stockClass = inStock ? "in-stock" : "out-of-stock";
    const stockText = inStock ? "In Stock Online" : "Out of Stock";

    let specsSummary = "";
    if (Array.isArray(p.specs)) {
      specsSummary = p.specs.slice(0, 3).join(", ");
    } else if (typeof p.specs === "string") {
      specsSummary = p.specs.split("|").slice(0, 3).join(", ");
    }

    tr.innerHTML = `
      <td><img src="${p.image_url}" class="table-img" alt="${p.title}"></td>
      <td>
        <div class="table-model-bold">${p.title}</div>
        <small style="color: #6e6e73;">${p.model}</small>
      </td>
      <td><code>${p.sku}</code></td>
      <td class="table-price-bold">${p.price}</td>
      <td style="color: #86868b; text-decoration: line-through;">${p.mrp}</td>
      <td>
        <div class="stock-pill ${stockClass}" style="display: inline-flex;">
          <span class="stock-dot"></span>
          <span>${stockText}</span>
        </div>
      </td>
      <td><small style="color: #424245;">${specsSummary}</small></td>
      <td><b>${p.pincode || "110058"}</b></td>
      <td>
        <a href="${p.url}" target="_blank" rel="noopener" class="btn-table-action">Store Link</a>
      </td>
    `;

    dom.productsTableBody.appendChild(tr);
  });
}
