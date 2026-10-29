"""
Persistent 24/7 Cloudflare HTTP/2 Tunnel Runner
Automatically launches, monitors, and auto-heals cloudflared tunnel
Saves active public URL to tunnel_url.txt
"""

import subprocess
import re
import time
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CLOUDFLARED = os.path.join(BASE_DIR, "cloudflared.exe")
URL_FILE = os.path.join(BASE_DIR, "tunnel_url.txt")

def run():
    print("Starting persistent 24/7 Cloudflare tunnel for http://127.0.0.1:5055...", flush=True)
    while True:
        try:
            cmd = [CLOUDFLARED, "tunnel", "--url", "http://127.0.0.1:5055", "--protocol", "http2"]
            p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, encoding='utf-8', errors='ignore')
            
            is_rate_limited = False
            for line in p.stdout:
                line_str = line.rstrip()
                print(line_str, flush=True)
                if "429" in line_str:
                    is_rate_limited = True
                m = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', line_str)
                if m:
                    tunnel_url = m.group(0)
                    print("\n" + "="*60, flush=True)
                    print(f" LIVE PUBLIC DASHBOARD URL: {tunnel_url}", flush=True)
                    print("="*60 + "\n", flush=True)
                    with open(URL_FILE, "w", encoding="utf-8") as f:
                        f.write(tunnel_url)

            p.wait()
            backoff = 60 if is_rate_limited else 15
            print(f"Tunnel disconnected (rate_limited={is_rate_limited}). Reconnecting in {backoff} seconds...", flush=True)
            time.sleep(backoff)
        except Exception as e:
            print(f"Tunnel runner exception: {e}. Retrying in 15 seconds...", flush=True)
            time.sleep(15)

if __name__ == "__main__":
    run()
