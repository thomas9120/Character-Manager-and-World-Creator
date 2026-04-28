@echo off
cd /d "%~dp0"
echo Character Card Manager running at:
echo http://localhost:8000/index.html
echo.
start "" http://localhost:8000/index.html
python -m http.server 8000
