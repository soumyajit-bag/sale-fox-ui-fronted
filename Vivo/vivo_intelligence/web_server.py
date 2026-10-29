"""
Multi-threaded background HTTP API daemon for Vivo Intelligence Pro
Serves Figma Frosted Glassmorphism Executive Dashboard on Port 5052
Endpoints:
  GET  /               -> web/index.html
  GET  /<path:path>    -> static web assets
  GET  /api/status     -> scraper status, progress, metrics, and products
  POST /api/scrape     -> triggers background asynchronous scraping thread
  GET  /api/export/csv -> downloads vivo_products.csv
  GET  /api/export/json-> downloads vivo_products.json
"""

import os
import sys
import threading
import time
import logging
from flask import Flask, jsonify, request, send_from_directory, send_file
from flask_cors import CORS

# Add current folder to sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)
from vivo_scraper import VivoScraper

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger("WebServer")

app = Flask(__name__, static_folder="web")
CORS(app)

# Global Scraper State
scraper_instance = VivoScraper(output_dir=os.path.join(BASE_DIR, "scraped_data"))
scrape_state = {
    "status": "ready",  # ready | scraping | completed | error
    "progress": 0,
    "message": "Ready to scrape",
    "last_scraped_at": None,
    "current_pincode": "110058",
    "series_filter": "All",
    "error": None
}
state_lock = threading.Lock()


def run_background_scrape(series="All", pincode="110058"):
    global scrape_state
    with state_lock:
        scrape_state["status"] = "scraping"
        scrape_state["progress"] = 5
        scrape_state["message"] = f"Starting scan for {series} (PIN: {pincode})..."
        scrape_state["error"] = None
        scrape_state["series_filter"] = series
        scrape_state["current_pincode"] = pincode

    def progress_callback(pct, msg):
        with state_lock:
            scrape_state["progress"] = pct
            scrape_state["message"] = msg

    try:
        scraper_instance.scrape(series_filter=series, pincode=pincode, progress_callback=progress_callback)
        with state_lock:
            scrape_state["status"] = "completed"
            scrape_state["progress"] = 100
            scrape_state["message"] = f"Scrape complete! {len(scraper_instance.items)} variants verified."
            scrape_state["last_scraped_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    except Exception as e:
        logger.error(f"Scraper thread error: {e}", exc_info=True)
        with state_lock:
            scrape_state["status"] = "error"
            scrape_state["error"] = str(e)
            scrape_state["message"] = f"Scrape encountered an issue: {str(e)}"


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/<path:path>")
def static_proxy(path):
    return send_from_directory(app.static_folder, path)


@app.route("/api/status", methods=["GET"])
def get_status():
    with state_lock:
        current_status = dict(scrape_state)
    
    # Load latest products from disk or scraper memory
    products = scraper_instance.load_existing()
    if not products:
        products = scraper_instance.items

    # Calculate summary metrics
    total = len(products)
    in_stock_count = sum(1 for p in products if p.get("in_stock", False))
    prices = [p.get("price_num", 0) for p in products if p.get("price_num", 0) > 0]
    min_p = min(prices) if prices else 0
    max_p = max(prices) if prices else 0
    avg_p = sum(prices) / len(prices) if prices else 0

    return jsonify({
        **current_status,
        "metrics": {
            "total_variants": total,
            "in_stock_count": in_stock_count,
            "out_of_stock_count": total - in_stock_count,
            "deliverability_rate": round((in_stock_count / total * 100), 1) if total > 0 else 0,
            "min_price": min_p,
            "max_price": max_p,
            "avg_price": round(avg_p, 2)
        },
        "products": products
    })


@app.route("/api/scrape", methods=["POST"])
def trigger_scrape():
    with state_lock:
        if scrape_state["status"] == "scraping":
            return jsonify({
                "status": "error",
                "message": "A scrape is already in progress. Please wait for it to complete."
            }), 409

    data = request.get_json(silent=True) or {}
    series = data.get("series", "All")
    pincode = data.get("pincode", "110058")

    thread = threading.Thread(target=run_background_scrape, args=(series, pincode), daemon=True)
    thread.start()

    return jsonify({
        "status": "started",
        "message": f"Background scraping thread launched for {series} (PIN: {pincode})",
        "series": series,
        "pincode": pincode
    })


@app.route("/api/export/csv", methods=["GET"])
def export_csv():
    csv_file = scraper_instance.csv_path
    if not os.path.exists(csv_file):
        scraper_instance.save_datasets()
    return send_file(csv_file, as_attachment=True, download_name="vivo_products.csv", mimetype="text/csv")


@app.route("/api/export/json", methods=["GET"])
def export_json():
    json_file = scraper_instance.json_path
    if not os.path.exists(json_file):
        scraper_instance.save_datasets()
    return send_file(json_file, as_attachment=True, download_name="vivo_products.json", mimetype="application/json")


if __name__ == "__main__":
    # Ensure dataset is loaded on startup
    scraper_instance.load_existing()
    if not scraper_instance.items:
        logger.info("Initializing baseline dataset...")
        scraper_instance.scrape()
        
    port = int(os.environ.get("PORT", 5052))
    logger.info(f"Starting Vivo Intelligence Pro Server on http://127.0.0.1:{port}")
    try:
        from waitress import serve
        logger.info(f"Serving with Waitress multi-threaded WSGI on http://0.0.0.0:{port}...")
        serve(app, host="0.0.0.0", port=port, threads=8)
    except ImportError:
        app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
