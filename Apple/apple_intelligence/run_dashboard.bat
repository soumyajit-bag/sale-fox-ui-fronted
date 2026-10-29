@echo off
title Apple Intelligence Pro Dashboard
cd /d "%~dp0"
echo ========================================================
echo   Apple Intelligence Pro Local Dashboard Launcher
echo ========================================================
start "" http://127.0.0.1:5050
python web_server.py
pause
