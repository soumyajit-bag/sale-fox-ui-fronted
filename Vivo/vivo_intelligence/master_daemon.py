"""
Vivo Intelligence Pro - Master 24/7 Process Supervisor
Non-blocking supervisor for web_server.py and cloudflared tunnel
"""

import subprocess
import time
import os
import sys
import re
import threading

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CLOUDFLARED = os.path.join(BASE_DIR, "cloudflared.exe")
TUNNEL_FILE = os.path.join(BASE_DIR, "active_tunnel.txt")
PYTHON_EXE = sys.executable

server_proc = None
tunnel_proc = None

def stream_reader(proc, name, is_tunnel=False):
    for line in iter(proc.stdout.readline, ''):
        if not line:
            break
        line_str = line.strip()
        # print(f"[{name}] {line_str}")
        if is_tunnel:
            m = re.search(r'https://[a-zA-Z0-9\-]+\.trycloudflare\.com', line_str)
            if m:
                url = m.group(0)
                print(f"\n=======================================================")
                print(f" [TUNNEL READY] {url}")
                print(f"=======================================================\n")
                with open(TUNNEL_FILE, "w", encoding="utf-8") as f:
                    f.write(url)

def start_server():
    global server_proc
    print("[Supervisor] Launching web_server.py on port 5050...")
    server_proc = subprocess.Popen(
        [PYTHON_EXE, "web_server.py"],
        cwd=BASE_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1
    )
    t = threading.Thread(target=stream_reader, args=(server_proc, "Server", False), daemon=True)
    t.start()

def start_tunnel():
    global tunnel_proc
    print("[Supervisor] Launching cloudflared tunnel for port 5050...")
    tunnel_proc = subprocess.Popen(
        [CLOUDFLARED, "tunnel", "--url", "http://127.0.0.1:5050", "--protocol", "http2"],
        cwd=BASE_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1
    )
    t = threading.Thread(target=stream_reader, args=(tunnel_proc, "Tunnel", True), daemon=True)
    t.start()

def main():
    print("=" * 60)
    print("  Vivo Intelligence Pro 24/7 Master Process Supervisor")
    print("=" * 60)

    start_server()
    time.sleep(2)
    start_tunnel()

    while True:
        try:
            if server_proc and server_proc.poll() is not None:
                print(f"[Supervisor] Web server stopped (exit code {server_proc.returncode}). Restarting in 2s...")
                time.sleep(2)
                start_server()

            if tunnel_proc and tunnel_proc.poll() is not None:
                print(f"[Supervisor] Cloudflare tunnel stopped (exit code {tunnel_proc.returncode}). Restarting in 2s...")
                time.sleep(2)
                start_tunnel()

            time.sleep(1)
        except Exception as e:
            print(f"[Supervisor Exception] {e}")
            time.sleep(2)

if __name__ == "__main__":
    main()
