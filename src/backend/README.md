---
title: Amazon Pro Scraper
emoji: 🛒
colorFrom: yellow
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# Amazon Product & Price Scraper (Node.js)

Node.js port of the Python scraper. Same features, same CSV/JSON output, same REST API and `web/` dashboard.

## Features
- Web dashboard + REST API (Express), live progress, stats, CSV/JSON history
- Natural-language budgets: `phones under 25k`, `laptops below 50000`, `earbuds between 1k and 3k`
- Brand/model detection with strict exact-model matching and accessory filtering
- Strict in-stock filtering, Prime / min-rating / price filters
- **Turbo engine** (concurrent `curl`/HTTP scan) with automatic **Selenium Chrome fallback** (stealth, persistent profile)
- Single product, search, and batch-file scraping from the CLI

## Setup
```bash
npm install
```
Requires Node 18.17+ and `curl` on the PATH (Windows 10+ already has `curl.exe`).
Chrome + `selenium-webdriver` (optional dependency) are only needed for the browser engine / single-product scraping.

## Run
```bash
npm start                                   # web dashboard on http://localhost:5050
node main.js                                # interactive menu
node main.js --web --port 8080              # dashboard on a custom port
node main.js --asin B0CHX1W1XY              # scrape one product
node main.js --url "https://www.amazon.in/dp/B0CHX1W1XY"
node main.js --search "poco m6" --pages 2
node main.js --file sample_products.txt
node main.js --asin B0CX24C6BC --headless
npm test
```

## Apple and Vivo scrapers

The React app includes the supplied Apple and Vivo scraper engines and their cached catalogs.
Choose Apple or Vivo in the Scraper menu to run a fresh scrape. The Python API servers must be
running alongside the Amazon Node server:

```powershell
py -m pip install -r src/backend/brand_scrapers/apple/requirements.txt
py -m pip install -r src/backend/brand_scrapers/vivo/requirements.txt
py src/backend/brand_scrapers/apple/web_server.py  # port 5055
py src/backend/brand_scrapers/vivo/web_server.py   # port 5052, in a second terminal
```

Run these commands from the repository root. Vivo's live store extraction uses Playwright; install
its Chromium browser with `py -m playwright install chromium` if the browser is not already
available. Both services expose `/api/scrape` and `/api/status`. Set `VITE_APPLE_SCRAPER_URL`,
`VITE_VIVO_SCRAPER_URL`, or `VITE_SCRAPER_PINCODE` in the Vite environment to override their
local defaults.

## Project structure
```text
amazonScraper.js   # core engine: query parser, filters, turbo + browser scraping, CSV/JSON export
browser.js         # stealth Chrome driver + persistent profiles (selenium-webdriver, loaded lazily)
main.js            # interactive CLI + command-line entrypoint
webServer.js       # Express REST API + static dashboard (serves ./web)
autoCommitScrapedData.js # auto-commits only the default CSV/JSON scraper output
api/index.js       # Vercel serverless entry
web/               # your existing dashboard (index.html) - unchanged
test/              # unit tests
```

## Configuration (`scraper_config.json`, optional)
Same keys as before: `domain`, `headless`, `profiles_dir`, `output_dir`, `csv_file`, `json_file`,
`delay_range_seconds`, `page_load_timeout`, `stealth_mode`, `user_agent`.

Scrapes that save results automatically commit the default `scraped_data/amazon_products.csv` and
`scraped_data/amazon_products.json` files when running inside the Git checkout. Custom output
paths and deployments without a Git checkout are not committed. These commits do not push to a
remote and require Git user identity to be configured.

## Deploy
| Target | How |
|---|---|
| Render | `render.yaml` (build `npm install --omit=dev`, start `node webServer.js`) |
| Heroku-style | `Procfile` |
| Hugging Face / Docker | `Dockerfile` (port 7860) |
| Vercel | `vercel.json` -> `api/index.js` |
| Public tunnel | `run_tunnel.bat` (Cloudflare) or `start_localtunnel_24_7.bat` (unchanged) |
