/**
 * Vivo Intelligence Pro — Dashboard Application Logic
 * Real-time polling, dynamic filtering, KPI metrics, terminal console, and 1-click export
 */

// Application State
const state = {
  products: [],
  filteredProducts: [],
  activeSeries: 'All',
  searchQuery: '',
  maxPrice: 260000,
  inStockOnly: false,
  sortBy: 'featured',
  currentPincode: '110058',
  isScraping: false,
  pollTimer: null,
};

// DOM Elements
const elements = {
  productGrid: document.getElementById('productGrid'),
  emptyState: document.getElementById('emptyState'),
  showingCount: document.getElementById('showingCount'),
  totalCatalogCount: document.getElementById('totalCatalogCount'),
  searchInput: document.getElementById('searchInput'),
  btnClearSearch: document.getElementById('btnClearSearch'),
  seriesChips: document.querySelectorAll('.chip'),
  priceRange: document.getElementById('priceRange'),
  priceRangeLabel: document.getElementById('priceRangeLabel'),
  stockToggle: document.getElementById('stockToggle'),
  sortSelect: document.getElementById('sortSelect'),
  btnResetFilters: document.getElementById('btnResetFilters'),

  // KPIs
  kpiTotalVariants: document.getElementById('kpiTotalVariants'),
  kpiSeriesBreakdown: document.getElementById('kpiSeriesBreakdown'),
  kpiInStockRate: document.getElementById('kpiInStockRate'),
  kpiInStockCount: document.getElementById('kpiInStockCount'),
  kpiOutOfStockCount: document.getElementById('kpiOutOfStockCount'),
  kpiMinPrice: document.getElementById('kpiMinPrice'),
  kpiMinModel: document.getElementById('kpiMinModel'),
  kpiMaxPrice: document.getElementById('kpiMaxPrice'),
  kpiMaxModel: document.getElementById('kpiMaxModel'),
  kpiAvgPrice: document.getElementById('kpiAvgPrice'),
  kpiAvgDiscount: document.getElementById('kpiAvgDiscount'),

  // Chip Counts
  countAll: document.getElementById('countAll'),
  countX: document.getElementById('countX'),
  countV: document.getElementById('countV'),
  countT: document.getElementById('countT'),
  countY: document.getElementById('countY'),

  // Actions
  btnTriggerScrape: document.getElementById('btnTriggerScrape'),
  scrapeBtnText: document.getElementById('scrapeBtnText'),
  btnExportCSV: document.getElementById('btnExportCSV'),
  btnExportJSON: document.getElementById('btnExportJSON'),
  btnToggleTerminal: document.getElementById('btnToggleTerminal'),
  terminalDrawer: document.getElementById('terminalDrawer'),
  terminalLogs: document.getElementById('terminalLogs'),
  btnClearLogs: document.getElementById('btnClearLogs'),
  btnCloseTerminal: document.getElementById('btnCloseTerminal'),

  // Progress Banner
  progressBanner: document.getElementById('progressBanner'),
  progressStatus: document.getElementById('progressStatus'),
  progressPct: document.getElementById('progressPct'),
  progressBar: document.getElementById('progressBar'),

  // Pincode Modal
  pincodeBadge: document.getElementById('pincodeBadge'),
  btnChangePin: document.getElementById('btnChangePin'),
  currentPincode: document.getElementById('currentPincode'),
  pincodeModal: document.getElementById('pincodeModal'),
  modalPincodeInput: document.getElementById('modalPincodeInput'),
  btnSavePincode: document.getElementById('btnSavePincode'),
  btnCloseModal: document.getElementById('btnCloseModal'),
};

// Utilities
function formatINR(val) {
  if (isNaN(val) || val === null) return '₹0';
  const s = Math.round(val).toString();
  if (s.length <= 3) return '₹' + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const groups = [];
  let r = rest;
  while (r.length > 2) {
    groups.unshift(r.slice(-2));
    r = r.slice(0, -2);
  }
  if (r.length > 0) groups.unshift(r);
  return '₹' + groups.join(',') + ',' + last3;
}

function logToTerminal(msg, type = 'info') {
  if (!elements.terminalLogs) return;
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  const now = new Date().toLocaleTimeString();
  line.textContent = `[${now}] ${msg}`;
  elements.terminalLogs.appendChild(line);
  elements.terminalLogs.scrollTop = elements.terminalLogs.scrollHeight;
}

// Fetch Status & Data from Backend API
async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Update Scraping Progress
    if (data.status === 'scraping') {
      state.isScraping = true;
      elements.progressBanner.classList.remove('hidden');
      elements.progressStatus.textContent = data.message || 'Scraping Vivo India E-Store...';
      elements.progressPct.textContent = `${data.progress || 0}%`;
      elements.progressBar.style.width = `${data.progress || 0}%`;
      elements.scrapeBtnText.textContent = 'Scraping...';
      elements.btnTriggerScrape.disabled = true;
    } else {
      if (state.isScraping) {
        logToTerminal('Background scrape completed! Refreshing catalog...', 'success');
      }
      state.isScraping = false;
      elements.progressBanner.classList.add('hidden');
      elements.scrapeBtnText.textContent = 'Trigger Scrape';
      elements.btnTriggerScrape.disabled = false;
    }

    // Process new products if received
    if (data.products && Array.isArray(data.products) && data.products.length > 0) {
      if (data.products.length !== state.products.length) {
        logToTerminal(`Loaded ${data.products.length} Vivo handset variants.`, 'info');
      }
      state.products = data.products;
      updateSeriesCounts();
      applyFilters();
    }
  } catch (err) {
    console.error('Status fetch error:', err);
  }
}

// Compute Chip Counts
function updateSeriesCounts() {
  const counts = { All: state.products.length, 'X Series': 0, 'V Series': 0, 'T Series': 0, 'Y Series': 0 };
  state.products.forEach(p => {
    if (counts[p.series] !== undefined) {
      counts[p.series]++;
    }
  });

  if (elements.countAll) elements.countAll.textContent = counts.All;
  if (elements.countX) elements.countX.textContent = counts['X Series'];
  if (elements.countV) elements.countV.textContent = counts['V Series'];
  if (elements.countT) elements.countT.textContent = counts['T Series'];
  if (elements.countY) elements.countY.textContent = counts['Y Series'];

  if (elements.totalCatalogCount) elements.totalCatalogCount.textContent = counts.All;
}

// Compute KPI Executive Metrics
function updateKPIs(items) {
  const total = items.length;
  elements.kpiTotalVariants.textContent = total;

  if (total === 0) {
    elements.kpiInStockRate.textContent = '0%';
    elements.kpiInStockCount.textContent = '0 In Stock';
    elements.kpiOutOfStockCount.textContent = '0 OOS';
    elements.kpiMinPrice.textContent = '₹0';
    elements.kpiMaxPrice.textContent = '₹0';
    elements.kpiAvgPrice.textContent = '₹0';
    return;
  }

  // Series breakdown
  const sMap = { 'X Series': 0, 'V Series': 0, 'T Series': 0, 'Y Series': 0 };
  let inStockCount = 0;
  let minP = Infinity;
  let maxP = -Infinity;
  let minItem = null;
  let maxItem = null;
  let totalPrice = 0;
  let totalMrp = 0;

  items.forEach(it => {
    if (sMap[it.series] !== undefined) sMap[it.series]++;
    if (it.in_stock) inStockCount++;

    const p = it.price_num || 0;
    const m = it.mrp_num || p;

    if (p < minP) { minP = p; minItem = it; }
    if (p > maxP) { maxP = p; maxItem = it; }

    totalPrice += p;
    totalMrp += m;
  });

  const oosCount = total - inStockCount;
  const inStockPct = Math.round((inStockCount / total) * 100);

  elements.kpiSeriesBreakdown.textContent = `X: ${sMap['X Series']} | V: ${sMap['V Series']} | T: ${sMap['T Series']} | Y: ${sMap['Y Series']}`;
  elements.kpiInStockRate.textContent = `${inStockPct}%`;
  elements.kpiInStockCount.textContent = `${inStockCount} In Stock`;
  elements.kpiOutOfStockCount.textContent = `${oosCount} OOS`;

  elements.kpiMinPrice.textContent = formatINR(minP);
  elements.kpiMinModel.textContent = minItem ? minItem.model : 'Vivo Phone';

  elements.kpiMaxPrice.textContent = formatINR(maxP);
  elements.kpiMaxModel.textContent = maxItem ? maxItem.model : 'Vivo Flagship';

  const avgP = Math.round(totalPrice / total);
  elements.kpiAvgPrice.textContent = formatINR(avgP);

  const avgDiscount = totalMrp > totalPrice ? Math.round(((totalMrp - totalPrice) / totalMrp) * 100) : 0;
  elements.kpiAvgDiscount.textContent = `Avg ${avgDiscount}% Off MRP`;
}

// Apply Filters, Search & Sorting
function applyFilters() {
  let list = [...state.products];

  // Series Filter
  if (state.activeSeries !== 'All') {
    list = list.filter(p => p.series === state.activeSeries);
  }

  // Price Range
  list = list.filter(p => (p.price_num || 0) <= state.maxPrice);

  // In Stock Only
  if (state.inStockOnly) {
    list = list.filter(p => p.in_stock === true);
  }

  // Search Query
  if (state.searchQuery.trim() !== '') {
    const q = state.searchQuery.toLowerCase().trim();
    list = list.filter(p => {
      const matchTitle = (p.title || '').toLowerCase().includes(q);
      const matchModel = (p.model || '').toLowerCase().includes(q);
      const matchColor = (p.color || '').toLowerCase().includes(q);
      const matchSku = (p.sku || '').toLowerCase().includes(q);
      const matchSeries = (p.series || '').toLowerCase().includes(q);
      const matchSpecs = (p.specs || []).some(s => s.toLowerCase().includes(q));
      return matchTitle || matchModel || matchColor || matchSku || matchSeries || matchSpecs;
    });
  }

  // Sorting
  switch (state.sortBy) {
    case 'price-asc':
      list.sort((a, b) => (a.price_num || 0) - (b.price_num || 0));
      break;
    case 'price-desc':
      list.sort((a, b) => (b.price_num || 0) - (a.price_num || 0));
      break;
    case 'discount':
      list.sort((a, b) => {
        const da = parseInt(a.discount) || 0;
        const db = parseInt(b.discount) || 0;
        return db - da;
      });
      break;
    case 'rating':
      list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      break;
    case 'featured':
    default:
      // Flagships (X & V) first, then high price
      list.sort((a, b) => (b.price_num || 0) - (a.price_num || 0));
      break;
  }

  state.filteredProducts = list;
  updateKPIs(list);
  renderGrid(list);
}

// Render Product Cards
function renderGrid(items) {
  elements.showingCount.textContent = items.length;

  if (items.length === 0) {
    elements.productGrid.innerHTML = '';
    elements.emptyState.classList.remove('hidden');
    return;
  }

  elements.emptyState.classList.add('hidden');

  const fragment = document.createDocumentFragment();

  items.forEach(p => {
    const card = document.createElement('div');
    card.className = 'phone-card glass-panel';

    const seriesClass = p.series.toLowerCase().replace(' ', '-');
    const stockClass = p.in_stock ? 'stock-in' : 'stock-out';
    const stockText = p.in_stock ? 'In Stock' : 'Out of Stock';

    // Specs list (up to 3 key highlights)
    const specsHtml = (p.specs || []).slice(0, 3)
      .map(sp => `<li>${escapeHtml(sp)}</li>`)
      .join('');

    // Fallback image if empty or data url
    let imgSrc = p.image_url;
    if (!imgSrc || imgSrc.startsWith('data:image')) {
      imgSrc = 'https://exstatic-in.vivo.com/Oz84QB3Wo0uns8j1/in/1760346575389/040909a72fc45b94a50a772b7d6d0b85.png.webp';
    } else if (imgSrc.startsWith('//')) {
      imgSrc = 'https:' + imgSrc;
    }

    card.innerHTML = `
      <div class="card-top">
        <span class="series-badge ${seriesClass}">${escapeHtml(p.series)}</span>
        <span class="stock-badge ${stockClass}">${stockText}</span>
      </div>

      <div class="card-thumbnail-wrap">
        <img class="card-thumbnail" src="${escapeHtml(imgSrc)}" alt="${escapeHtml(p.title)}" loading="lazy" onerror="this.src='https://exstatic-in.vivo.com/Oz84QB3Wo0uns8j1/in/1760346575389/040909a72fc45b94a50a772b7d6d0b85.png.webp'">
      </div>

      <div class="card-info">
        <h3 class="phone-title">${escapeHtml(p.title)}</h3>

        <div class="chips-row">
          <span class="spec-chip color-chip">${escapeHtml(p.color || 'Standard')}</span>
          <span class="spec-chip">${escapeHtml(p.ram || '')} + ${escapeHtml(p.storage || '')}</span>
          <span class="spec-chip sku-chip">${escapeHtml(p.sku || '')}</span>
        </div>

        <ul class="feature-list">
          ${specsHtml}
        </ul>

        <div class="card-pricing">
          <span class="price-current">${escapeHtml(p.price)}</span>
          <span class="price-mrp">${escapeHtml(p.mrp)}</span>
          <span class="discount-pill">${escapeHtml(p.discount)}</span>
        </div>

        <div class="card-actions">
          <a href="${escapeHtml(p.url || 'https://shop.vivo.com/in/')}" target="_blank" rel="noopener noreferrer" class="btn-buy">
            <span>Buy on Vivo Store</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>
            </svg>
          </a>
        </div>
      </div>
    `;

    fragment.appendChild(card);
  });

  elements.productGrid.innerHTML = '';
  elements.productGrid.appendChild(fragment);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Trigger Asynchronous Scrape
async function triggerScrape() {
  if (state.isScraping) return;
  state.isScraping = true;
  elements.scrapeBtnText.textContent = 'Scraping...';
  elements.btnTriggerScrape.disabled = true;
  elements.progressBanner.classList.remove('hidden');
  elements.progressBar.style.width = '5%';
  elements.progressPct.textContent = '5%';
  elements.progressStatus.textContent = 'Initiating background scrape...';

  logToTerminal(`Triggering live store scrape for ${state.activeSeries} (Pincode: ${state.currentPincode})...`, 'info');

  try {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        series: state.activeSeries,
        pincode: state.currentPincode
      })
    });
    const data = await res.json();
    logToTerminal(`Scrape job accepted: ${data.message || 'Running in background'}`, 'success');
  } catch (err) {
    logToTerminal(`Scrape trigger failed: ${err.message}`, 'error');
    state.isScraping = false;
    elements.scrapeBtnText.textContent = 'Trigger Scrape';
    elements.btnTriggerScrape.disabled = false;
  }
}

// Export CSV / JSON
function exportData(type) {
  logToTerminal(`Initiating ${type.toUpperCase()} dataset download...`, 'info');
  window.location.href = `/api/export/${type}`;
}

// Event Listeners Initialization
function initEventListeners() {
  // Search input
  elements.searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    elements.btnClearSearch.classList.toggle('hidden', state.searchQuery === '');
    applyFilters();
  });

  elements.btnClearSearch.addEventListener('click', () => {
    state.searchQuery = '';
    elements.searchInput.value = '';
    elements.btnClearSearch.classList.add('hidden');
    applyFilters();
  });

  // Series Chips
  elements.seriesChips.forEach(chip => {
    chip.addEventListener('click', () => {
      elements.seriesChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.activeSeries = chip.getAttribute('data-series');
      logToTerminal(`Series filter changed to: ${state.activeSeries}`, 'info');
      applyFilters();
    });
  });

  // Price Range
  elements.priceRange.addEventListener('input', (e) => {
    state.maxPrice = Number(e.target.value);
    elements.priceRangeLabel.textContent = formatINR(state.maxPrice);
    applyFilters();
  });

  // Stock Toggle
  elements.stockToggle.addEventListener('change', (e) => {
    state.inStockOnly = e.target.checked;
    applyFilters();
  });

  // Sort Select
  elements.sortSelect.addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    applyFilters();
  });

  // Reset Filters
  elements.btnResetFilters.addEventListener('click', () => {
    state.searchQuery = '';
    state.activeSeries = 'All';
    state.maxPrice = 260000;
    state.inStockOnly = false;
    state.sortBy = 'featured';

    elements.searchInput.value = '';
    elements.btnClearSearch.classList.add('hidden');
    elements.priceRange.value = 260000;
    elements.priceRangeLabel.textContent = '₹2,60,000';
    elements.stockToggle.checked = false;
    elements.sortSelect.value = 'featured';

    elements.seriesChips.forEach(c => c.classList.remove('active'));
    document.querySelector('.chip[data-series="All"]').classList.add('active');

    applyFilters();
  });

  // Buttons
  elements.btnTriggerScrape.addEventListener('click', triggerScrape);
  elements.btnExportCSV.addEventListener('click', () => exportData('csv'));
  elements.btnExportJSON.addEventListener('click', () => exportData('json'));

  // Terminal Toggle
  elements.btnToggleTerminal.addEventListener('click', () => {
    elements.terminalDrawer.classList.toggle('hidden');
  });
  elements.btnCloseTerminal.addEventListener('click', () => {
    elements.terminalDrawer.classList.add('hidden');
  });
  elements.btnClearLogs.addEventListener('click', () => {
    elements.terminalLogs.innerHTML = '';
  });

  // Pincode Modal
  const openPinModal = () => {
    elements.pincodeModal.classList.remove('hidden');
    elements.modalPincodeInput.focus();
  };
  const closePinModal = () => {
    elements.pincodeModal.classList.add('hidden');
  };

  elements.pincodeBadge.addEventListener('click', openPinModal);
  elements.btnChangePin.addEventListener('click', (e) => {
    e.stopPropagation();
    openPinModal();
  });
  elements.btnCloseModal.addEventListener('click', closePinModal);
  elements.pincodeModal.addEventListener('click', (e) => {
    if (e.target === elements.pincodeModal) closePinModal();
  });

  elements.btnSavePincode.addEventListener('click', () => {
    const pin = elements.modalPincodeInput.value.trim();
    if (/^\d{6}$/.test(pin)) {
      state.currentPincode = pin;
      elements.currentPincode.textContent = pin;
      closePinModal();
      logToTerminal(`Deliverability postal code updated to ${pin}. Verifying live stock...`, 'info');
      triggerScrape();
    } else {
      alert('Please enter a valid 6-digit Indian PIN code.');
    }
  });

  document.querySelectorAll('.pin-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      elements.modalPincodeInput.value = pill.getAttribute('data-pin');
    });
  });
}

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  logToTerminal('Vivo Intelligence Pro dashboard loaded.', 'info');
  initEventListeners();
  fetchStatus();
  // Poll every 3 seconds for live scraper progress and status
  state.pollTimer = setInterval(fetchStatus, 3000);
});
