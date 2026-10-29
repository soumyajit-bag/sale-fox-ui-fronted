"""
Persistent 24/7 Cloudflare Tunnel Supervisor for Vivo Intelligence Pro
Monitors cloudflared process, captures live URL, and automatically reconnects upon disconnection.
"""

import subprocess
import time
import re
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CLOUDFLARED = os.path.join(BASE_DIR, "cloudflared.exe")
STATUS_FILE = os.path.join(BASE_DIR, "active_tunnel.txt")

def run_tunnel():
    print(f"Starting Cloudflare Tunnel supervisor for http://127.0.0.1:5050...")
    while True:
        try:
            print("Spawning cloudflared process...")
            cmd = [CLOUDFLARED, "tunnel", "--url", "http://127.0.0.1:5050", "--protocol", "http2"]
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1
            )

            current_url = None
            for line in proc.stdout:
                line_str = line.strip()
                print(line_str)
                # Detect trycloudflare.com URL
                match = re.search(r'https://[a-zA-Z0-9\-]+\.trycloudflare\.com', line_str)
                if match:
                    current_url = match.group(0)
                    print(f"\n[TUNNEL ONLINE] Active URL: {current_url}\n")
                    with open(STATUS_FILE, "w", encoding="utf-8") as f:
                        f.write(current_url)

            proc.wait()
            print(f"Cloudflare tunnel exited (code {proc.returncode}). Reconnecting in 3 seconds...")
        except Exception as e:
            print(f"Supervisor error: {e}. Reconnecting in 3 seconds...")
        time.sleep(3)

if __name__ == "__main__":
    run_tunnel()
