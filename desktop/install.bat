@echo off
chcp 65001 >nul
title Shift Wallpaper - Install

set "PY="
py -3 -c "pass" >nul 2>&1
if %errorlevel%==0 set "PY=py -3"
if defined PY goto RUN

python -c "pass" >nul 2>&1
if %errorlevel%==0 set "PY=python"
if defined PY goto RUN

echo.
echo   [!] Python not found.
echo.
echo   1. https://www.python.org/downloads/
echo   2. Check "Add Python to PATH" during setup
echo   3. Run this file again
echo.
pause
exit /b 1

:RUN
%PY% "%~dp0wallpaper.py" --install
echo.
pause
