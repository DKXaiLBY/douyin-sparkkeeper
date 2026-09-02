@echo off
REM SparkKeeper launcher for Windows.
REM All real logic (including Chinese prompts) lives in start.ps1 -- PowerShell
REM handles UTF-8 correctly, while cmd.exe garbles Chinese text inside a .bat file.
REM This file is kept pure ASCII so it is always parsed correctly.
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0start.ps1"
pause
