@echo off
title NAPLAN Tutor
cd /d "%~dp0"

REM Load ANTHROPIC_API_KEY from .env if not already set
if "%ANTHROPIC_API_KEY%"=="" (
    for /f "tokens=1,* delims==" %%A in ('findstr /r "^ANTHROPIC_API_KEY=." .env 2^>nul') do (
        set ANTHROPIC_API_KEY=%%B
    )
)

if "%ANTHROPIC_API_KEY%"=="" (
    echo.
    echo  ERROR: No API key found.
    echo.
    echo  Open the .env file in this folder and paste your key:
    echo    ANTHROPIC_API_KEY=sk-ant-...
    echo.
    echo  Get a free key at: https://console.anthropic.com
    echo.
    pause
    exit /b 1
)

echo.
echo  NAPLAN Tutor is starting...
echo  Open your browser to:  http://localhost:8000
echo  Press Ctrl+C to stop.
echo.

python -m uvicorn app:app --port 8000
pause
