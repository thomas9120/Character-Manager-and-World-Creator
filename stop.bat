@echo off
setlocal

REM Filter LISTENING lines first, then match the local :8000 port with a
REM trailing space so we don't kill unrelated remote endpoints.
set "FOUND="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":8000 "') do (
  set "FOUND=1"
  taskkill /PID %%P /F
)
if not defined FOUND echo No process is listening on port 8000.

endlocal
