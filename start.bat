@echo off
setlocal
cd /d "%~dp0"

REM Verify a real Python 3 is available (not the Windows Store stub).
set "PYVERSION="
for /f "delims=" %%V in ('python --version 2^>^&1') do set "PYVERSION=%%V"
echo "%PYVERSION%" | findstr /c:"Python 3." >nul
if errorlevel 1 (
  echo.
  echo Could not find a working Python 3 interpreter.
  if defined PYVERSION echo "python --version" reported: %PYVERSION%
  echo.
  echo Install Python 3 from https://www.python.org/ (tick "Add Python to PATH"),
  echo or run:  winget install Python.Python.3
  echo If a Microsoft Store window opened, that "python" is just a stub, not real Python.
  echo.
  pause
  exit /b 1
)

echo Character Card Manager running at:
echo   http://localhost:8000/index.html
echo.
echo Press Ctrl+C in this window to stop the server.
start "" http://localhost:8000/index.html
python -m http.server 8000

endlocal
