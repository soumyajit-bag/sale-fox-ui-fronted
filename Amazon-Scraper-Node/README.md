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

## Project structure
```text
amazonScraper.js   # core engine: query parser, filters, turbo + browser scraping, CSV/JSON export
browser.js         # stealth Chrome driver + persistent profiles (selenium-webdriver, loaded lazily)
main.js            # interactive CLI + command-line entrypoint
webServer.js       # Express REST API + static dashboard (serves ./web)
api/index.js       # Vercel serverless entry
web/               # your existing dashboard (index.html) - unchanged
test/              # unit tests
```

## Configuration (`scraper_config.json`, optional)
Same keys as before: `domain`, `headless`, `profiles_dir`, `output_dir`, `csv_file`, `json_file`,
`delay_range_seconds`, `page_load_timeout`, `stealth_mode`, `user_agent`.

## Deploy
| Target | How |
|---|---|
| Render | `render.yaml` (build `npm install --omit=dev`, start `node webServer.js`) |
| Heroku-style | `Procfile` |
| Hugging Face / Docker | `Dockerfile` (port 7860) |
| Vercel | `vercel.json` -> `api/index.js` |
| Public tunnel | `run_tunnel.bat` (Cloudflare) or `start_localtunnel_24_7.bat` (unchanged) |

`_gitignore` -> rename to `.gitignore`.
