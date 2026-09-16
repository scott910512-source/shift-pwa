@echo off
chcp 65001 >nul
title Shift Wallpaper - Check

set "PY="
py -3 -c "pass" >nul 2>&1
if %errorlevel%==0 set "PY=py -3"
if defined PY goto RUN

python -c "pass" >nul 2>&1
if %errorlevel%==0 set "PY=python"
if defined PY goto RUN

echo   [!] Python not found.
echo.
pause
exit /b 1

:RUN
%PY% "%~dp0wallpaper.py" --diag
echo.
pause
