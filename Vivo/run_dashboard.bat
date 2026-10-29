@echo off
title Vivo Intelligence Pro Dashboard
cd /d "%~dp0vivo_intelligence" 2>nul || cd /d "%~dp0"
echo Starting Vivo Intelligence Pro Server on http://127.0.0.1:5050
start "" http://127.0.0.1:5050
python web_server.py
pause
