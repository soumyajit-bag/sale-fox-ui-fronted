"""
Persistent 24/7 Cloudflare HTTP/2 Tunnel Runner for Vivo
Automatically launches, monitors, and auto-heals cloudflared tunnel
Saves active public URL to tunnel_url.txt
"""

import subprocess
import re
import time
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CLOUDFLARED = os.path.join(BASE_DIR, "cloudflared.exe")
URL_FILE = os.path.join(BASE_DIR, "tunnel_url.txt")

def run():
    print("Starting persistent 24/7 Cloudflare tunnel for http://127.0.0.1:5052...")
    while True:
        try:
            cmd = [CLOUDFLARED, "tunnel", "--url", "http://127.0.0.1:5052", "--protocol", "http2"]
            p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, encoding='utf-8', errors='ignore')
            
            for line in p.stdout:
                print(line.rstrip())
                m = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', line)
                if m:
                    tunnel_url = m.group(0)
                    print("\n" + "="*60)
                    print(f" LIVE PUBLIC VIVO DASHBOARD URL: {tunnel_url}")
                    print("="*60 + "\n")
                    with open(URL_FILE, "w", encoding="utf-8") as f:
                        f.write(tunnel_url)

            p.wait()
            print("Tunnel process disconnected. Re-establishing connection in 2 seconds...")
            time.sleep(2)
        except Exception as e:
            print(f"Tunnel runner exception: {e}. Retrying in 3 seconds...")
            time.sleep(3)

if __name__ == "__main__":
    run()
