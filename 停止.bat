@echo off
REM SparkKeeper stopper for Windows.
REM Real logic lives in stop.ps1 (PowerShell handles UTF-8 correctly).
REM This file is kept pure ASCII so cmd.exe always parses it correctly.
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0stop.ps1"
pause
