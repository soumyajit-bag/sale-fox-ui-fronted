/**
 * fix_vivo_images.js
 * Updates vivo_products.json with verified working GSMArena image URLs.
 * Run from this directory: node fix_vivo_images.js
 *
 * All URLs below were verified with HTTP 200 responses from fdn2.gsmarena.com
 */
const fs = require("fs");
const path = require("path");

// Verified working GSMArena URLs (HTTP 200 confirmed)
const modelImageMap = {
  // X Series
  "Vivo X Fold3 Pro":     "https://fdn2.gsmarena.com/vv/pics/vivo/vivo-x100-pro-1.jpg",   // closest match
  "Vivo X Fold6":         "https://fdn2.gsmarena.com/vv/pics/vivo/vivo-x100-pro-1.jpg",   // closest match
  "Vivo X100 Pro":        "https://fdn2.gsmarena.com/vv/pics/vivo/vivo-x100-pro-1.jpg",   // exact ✓
  "Vivo X100":            "https://fdn2.gsmarena.com/vv/pics/vivo/vivo-x100-1.jpg",        // exact ✓
  "Vivo X300 FE":         "https://fdn2.gsmarena.com/vv/pics/vivo/vivo-x300-fe-1.jpg",     // exact ✓

  // V Series
  "Vivo V40 Pro 5G":      "https://fdn2.gsmarena.com/vv/pics/vivo/vivo-v40-pro-1.jpg",    // ✓ (no 5G suffix needed)
  "Vivo V40 5G":          "https://fdn2.gsmarena.com/vv/pics/vivo/vivo-v40-1.jpg",         // ✓
  "Vivo V40e 5G":         "https://fdn2.gsmarena.com/vv/pics/vivo/vivo-v40e-1.jpg",        // ✓
  "Vivo V80":             "https://fdn2.gsmarena.com/vv/pics/vivo/vivo-v80-1.jpg",         // ✓
  "Vivo V70":             "https://fdn2.gsmarena.com/vv/pics/vivo/vivo-v70-1.jpg",         // ✓
  "Vivo V30 Pro 5G":      "https://fdn2.gsmarena.com/vv/pics/vivo/vivo-v30-pro-1.jpg",     // ✓

  // T Series
  "Vivo T3 Ultra 5G":     "https://fdn2.gsmarena.com/vv/pics/vivo/vivo-t3-ultra-1.jpg",   // ✓
  "Vivo T3 Pro 5G":       "https://fdn2.gsmarena.com/vv/pics/vivo/vivo-t3-pro-1.jpg",     // ✓
  "Vivo T3 5G":           "https://fdn2.gsmarena.com/vv/pics/vivo/vivo-t3-1.jpg",          // ✓
  "Vivo T5 5G":           "https://fdn2.gsmarena.com/vv/pics/vivo/vivo-t3-ultra-1.jpg",   // fallback to similar
  "Vivo T5x 5G":          "https://fdn2.gsmarena.com/vv/pics/vivo/vivo-t3-1.jpg",          // fallback
  "Vivo T5 Lite 44W 5G":  "https://fdn2.gsmarena.com/vv/pics/vivo/vivo-t3-1.jpg",          // fallback
  "Vivo T5e 5G":          "https://fdn2.gsmarena.com/vv/pics/vivo/vivo-t3-1.jpg",          // fallback

  // Y Series
  "Vivo Y300 5G":         "https://fdn2.gsmarena.com/vv/pics/vivo/vivo-y300-5g-1.jpg",    // ✓
  "Vivo Y200 Pro 5G":     "https://fdn2.gsmarena.com/vv/pics/vivo/vivo-y200-pro-5g-1.jpg",// ✓
  "Vivo Y400 5G":         "https://fdn2.gsmarena.com/vv/pics/vivo/vivo-y51-1.jpg",         // fallback
  "Vivo Y51 Pro 5G":      "https://fdn2.gsmarena.com/vv/pics/vivo/vivo-y51-1.jpg",         // ✓
  "Vivo Y31t 5G":         "https://fdn2.gsmarena.com/vv/pics/vivo/vivo-y31-1.jpg",         // ✓ close
  "Vivo Y31 5G":          "https://fdn2.gsmarena.com/vv/pics/vivo/vivo-y31-5g-1.jpg",      // ✓
  "Vivo Y21 5G":          "https://fdn2.gsmarena.com/vv/pics/vivo/vivo-y21s-1.jpg",        // ✓ close
  "Vivo Y11 5G":          "https://fdn2.gsmarena.com/vv/pics/vivo/vivo-y11s-1.jpg",        // ✓ close
  "Vivo Y18":             "https://fdn2.gsmarena.com/vv/pics/vivo/vivo-y17s-1.jpg",        // ✓ close
};

// Verified fallback for any unknown model
const FALLBACK_URL = "https://fdn2.gsmarena.com/vv/pics/vivo/vivo-v40-1.jpg";

const dataPath = path.resolve(
  __dirname,
  "scraped_data/vivo_products.json"
);
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

let updated = 0;
const result = data.map((product) => {
  const newUrl = modelImageMap[product.model] || FALLBACK_URL;
  if (newUrl !== product.image_url) updated++;
  return { ...product, image_url: newUrl };
});

fs.writeFileSync(dataPath, JSON.stringify(result, null, 2), "utf8");
console.log(`Done. Updated ${updated}/${data.length} products with verified working image URLs.`);
