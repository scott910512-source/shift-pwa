# -*- coding: utf-8 -*-
"""파이썬 없이 쓰는 묶음을 만든다.

  바탕화면 이미지를 미리 전부 그려 두고, 윈도우 기본 명령(schtasks, reg,
  rundll32)만으로 매일 알맞은 이미지를 골라 배경으로 지정한다.
  받는 사람 PC 에는 아무것도 설치하지 않아도 된다.

사용법:
  python tools/make-noinstall.py --days 120 --size 2560x1440
"""

import datetime as dt
import importlib.util
import io
import os
import shutil
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

spec = importlib.util.spec_from_file_location(
    "wp", os.path.join(ROOT, "desktop", "wallpaper.py"))
wp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wp)

# 하루를 세 토막으로 나눈다. 새벽은 야간조가 어제 시작분이라 따로 그려야 한다.
SLOTS = [("a", 3), ("d", 14), ("n", 21)]     # 파일명 글자, 그릴 때 쓸 시각

APPLY_BAT = r'''@echo off
rem 오늘 날짜에 맞는 이미지를 골라 바탕화면으로 지정한다.
rem 작업 스케줄러가 이 파일을 부른다. 직접 실행해도 된다.
setlocal
set "HERE=%~dp0"

rem 날짜와 시각은 PowerShell 한 줄로 가져온다 (지역 설정에 안 흔들리게)
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "TODAY=%%d"
for /f %%h in ('powershell -NoProfile -Command "Get-Date -Format HH"') do set "HH=%%h"
if not defined TODAY goto FAIL

rem 08 같은 앞자리 0 이 8진수로 읽히지 않게 100 을 얹었다 뺀다
set /a H=1%HH% - 100

set "SLOT=n"
if %H% LSS 8 set "SLOT=a"
if %H% GEQ 8 if %H% LSS 20 set "SLOT=d"

set "IMG=%HERE%images\%TODAY%_%SLOT%.png"
if not exist "%IMG%" goto NOIMG

reg add "HKCU\Control Panel\Desktop" /v WallPaper /t REG_SZ /d "%IMG%" /f >nul
rem 6 = 맞춤. 전체가 보이고 남는 곳은 배경색이라 잘려 나가지 않는다.
reg add "HKCU\Control Panel\Desktop" /v WallpaperStyle /t REG_SZ /d 6 /f >nul
reg add "HKCU\Control Panel\Desktop" /v TileWallpaper /t REG_SZ /d 0 /f >nul
RUNDLL32.EXE user32.dll,UpdatePerUserSystemParameters 1, True
echo Wallpaper set: %TODAY% (%SLOT%)
exit /b 0

:NOIMG
echo.
echo   [!] No image for %TODAY%.
echo       This pack has run out. Ask for a new one.
echo.
exit /b 1

:FAIL
echo   [!] Could not read the date.
exit /b 1
'''

INSTALL_BAT = r'''@echo off
chcp 65001 >nul
title Shift Wallpaper - Install (no Python)
setlocal
set "HERE=%~dp0"
set "APPLY=%HERE%apply.bat"

if not exist "%APPLY%" goto BROKEN
if not exist "%HERE%images" goto BROKEN

echo Registering scheduled tasks...
schtasks /Create /TN "ShiftWallpaper" /TR "\"%APPLY%\"" /SC ONLOGON /F >nul
schtasks /Create /TN "ShiftWallpaper_0005" /TR "\"%APPLY%\"" /SC DAILY /ST 00:05 /F >nul
schtasks /Create /TN "ShiftWallpaper_0800" /TR "\"%APPLY%\"" /SC DAILY /ST 08:00 /F >nul
schtasks /Create /TN "ShiftWallpaper_2000" /TR "\"%APPLY%\"" /SC DAILY /ST 20:00 /F >nul

echo.
call "%APPLY%"
echo.
echo Done. The wallpaper updates at logon, 00:05, 08:00 and 20:00.
echo Keep this folder where it is - the tasks point at it.
echo.
pause
exit /b 0

:BROKEN
echo.
echo   [!] apply.bat or the images folder is missing.
echo       Unzip the whole pack and keep the files together.
echo.
pause
exit /b 1
'''

UNINSTALL_BAT = r'''@echo off
chcp 65001 >nul
title Shift Wallpaper - Uninstall
schtasks /Delete /TN "ShiftWallpaper" /F >nul 2>&1
schtasks /Delete /TN "ShiftWallpaper_0005" /F >nul 2>&1
schtasks /Delete /TN "ShiftWallpaper_0800" /F >nul 2>&1
schtasks /Delete /TN "ShiftWallpaper_2000" /F >nul 2>&1
echo Scheduled tasks removed. The wallpaper image stays as it is.
echo To change it: right-click the desktop - Personalize.
echo.
pause
'''


CHECK_BAT = r'''@echo off
chcp 65001 >nul
title Shift Wallpaper - Check
setlocal
set "HERE=%~dp0"
set "PS=powershell -NoProfile -Command"

echo.
echo === Check ===
for /f "delims=" %%a in ('%PS% "Get-CimInstance Win32_VideoController | Where-Object {$_.CurrentHorizontalResolution} | ForEach-Object {'{0}x{1}' -f $_.CurrentHorizontalResolution,$_.CurrentVerticalResolution}"') do echo 화면 해상도   : %%a
for /f "delims=" %%a in ('%PS% "(Get-ItemProperty 'HKCU:\Control Panel\Desktop').WallPaper"') do echo 지금 배경     : %%a
for /f "delims=" %%a in ('%PS% "$s=(Get-ItemProperty 'HKCU:\Control Panel\Desktop').WallpaperStyle; switch($s){'6'{'6 (맞춤)'}'10'{'10 (채우기)'}'2'{'2 (확대)'}'0'{'0 (가운데)'}default{$s}}"') do echo 까는 방식     : %%a
for /f "delims=" %%a in ('%PS% "Add-Type -AssemblyName System.Drawing; $p=(Get-ItemProperty 'HKCU:\Control Panel\Desktop').WallPaper; if(Test-Path $p){$i=[Drawing.Image]::FromFile($p); '{0}x{1}' -f $i.Width,$i.Height; $i.Dispose()} else {'(파일 없음)'}"') do echo 배경 이미지   : %%a
for /f "delims=" %%a in ('%PS% "Get-Date -Format yyyy-MM-dd"') do set "TODAY=%%a"
if exist "%HERE%images\%TODAY%_d.png" (echo 오늘 그림     : 있음  %TODAY%) else (echo 오늘 그림     : 없음  %TODAY%  ^(묶음 기간이 끝났습니다^))
echo 등록된 작업   :
schtasks /Query /TN "ShiftWallpaper" >nul 2>&1 && echo    ShiftWallpaper
schtasks /Query /TN "ShiftWallpaper_0005" >nul 2>&1 && echo    ShiftWallpaper_0005
schtasks /Query /TN "ShiftWallpaper_0800" >nul 2>&1 && echo    ShiftWallpaper_0800
schtasks /Query /TN "ShiftWallpaper_2000" >nul 2>&1 && echo    ShiftWallpaper_2000
echo.
echo 화면 해상도와 배경 이미지 크기가 많이 다르면 늘어나거나 흐려집니다.
echo 그 숫자를 알려 주시면 맞는 크기로 다시 만들어 드립니다.
echo.
pause
'''


def readme(start, end, n, size):
    return """4조 2교대 근무표 — PC 바탕화면 (파이썬 없이)

■ 쓰는 법
   1. 이 폴더를 아무 데나 두세요 (예: C:\\shift).
      경로에 공백이 없는 편이 안전합니다.
   2. install.bat 더블클릭.
   끝입니다. 설치할 프로그램은 없습니다.

■ 언제 바뀌나
   로그온할 때 / 매일 00:05 · 08:00 · 20:00
   (00:05 날짜 넘김, 08:00 주간 교대, 20:00 야간 교대)

■ 이미지 크기
   %s 로 미리 그려 두었습니다.
   이보다 작은 화면이면 윈도우가 줄여서 깔끔하게 나옵니다.
   이보다 큰 화면(4K 등)이면 늘어나 흐릿해집니다. 그럴 땐 새 묶음을 받으세요.
   내 화면 크기는 개인 설정 → 디스플레이 → 디스플레이 해상도 에서 봅니다.

■ 주의
   · 이 묶음은 %s ~ %s (%d일치) 까지만 들어 있습니다.
     기간이 끝나면 바탕화면이 더 바뀌지 않습니다. 새 묶음을 받으세요.
   · 명단이 바뀌어도 이 묶음은 안 바뀝니다. 새 묶음을 받아야 합니다.
   · 폴더를 옮기면 동작하지 않습니다. 옮겼다면 install.bat 을 다시 실행하세요.
   · 하루 세 번 검은 창이 잠깐 떴다 사라집니다. 정상입니다.

■ 지울 때
   uninstall.bat 더블클릭. 이미지는 그대로 남습니다.

■ 크기가 안 맞을 때
   check.bat 을 실행하면 화면 해상도와 배경 이미지 크기를 보여 줍니다.
   둘이 많이 다르면 늘어나거나 흐려집니다. 그 숫자를 알려 주세요.

■ 안 바뀔 때
   · 회사 정책이 배경 변경을 막고 있을 수 있습니다. 전산팀에 문의하세요.
   · 배경 슬라이드 쇼가 켜져 있으면 덮어씁니다.
     개인 설정 → 배경 을 '사진' 으로 바꾸고 다시 해 보세요.
   · images 폴더 안의 오늘 날짜 파일을 직접 바탕화면으로 지정해 봐도 됩니다.

■ 파이썬을 깔 수 있다면
   desktop 묶음(wallpaper.py)을 쓰는 편이 낫습니다.
   기간 제한이 없고, 용량도 훨씬 작고, 명단만 바꿔 끼울 수 있습니다.
""" % (size, start, end, n)


def main():
    args = sys.argv[1:]

    def opt(name, default=None):
        return args[args.index(name) + 1] if name in args else default

    days = int(opt("--days", 120))
    out = opt("--out", os.path.join(ROOT, "build", "noinstall"))
    size = opt("--size", "2560x1440")
    W, H = (int(v) for v in size.lower().split("x"))
    scale = float(opt("--scale", wp.SCALE))
    icon_cols = int(opt("--icon-cols", wp.ICON_COLS))
    start = (dt.date.fromisoformat(opt("--from"))
             if opt("--from") else wp.now_kst().date())

    crew, source = wp.load_crew("")          # 내장 명단
    fonts = wp.pick_font(opt("--font"))

    if os.path.isdir(out):
        shutil.rmtree(out)
    imgdir = os.path.join(out, "images")
    os.makedirs(imgdir)

    total = 0
    for i in range(days):
        d = start + dt.timedelta(days=i)
        for letter, hour in SLOTS:
            now = dt.datetime(d.year, d.month, d.day, hour, 0)
            view = wp.current_view(now)
            view["now"] = now
            img = wp.build_image(view, crew, (W, H), fonts, source,
                                 icon_cols, scale, stamp="명단 " + source)
            # 색이 많지 않아 팔레트로 저장하면 1/3 로 줄어든다
            img.convert("P", palette=Image_ADAPTIVE, colors=256).save(
                os.path.join(imgdir, "%s_%s.png" % (d.isoformat(), letter)),
                optimize=True)
            total += 1
        if (i + 1) % 30 == 0:
            print("  %d/%d일" % (i + 1, days))

    end = start + dt.timedelta(days=days - 1)
    for name, text in (("apply.bat", APPLY_BAT),
                       ("install.bat", INSTALL_BAT),
                       ("uninstall.bat", UNINSTALL_BAT),
                       ("check.bat", CHECK_BAT)):
        # 배치는 CRLF 로. apply.bat 만 한글 주석이 있어 UTF-8 로 둔다.
        io.open(os.path.join(out, name), "w", encoding="utf-8", newline="").write(
            text.replace("\r\n", "\n").replace("\n", "\r\n"))
    io.open(os.path.join(out, "README.txt"), "w", encoding="utf-8", newline="").write(
        readme(start.isoformat(), end.isoformat(), days, "%dx%d" % (W, H))
        .replace("\r\n", "\n").replace("\n", "\r\n"))

    zpath = out.rstrip("/\\") + ".zip"
    base = os.path.basename(out.rstrip("/\\"))
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        for root, _, files in os.walk(out):
            for f in sorted(files):
                full = os.path.join(root, f)
                z.write(full, os.path.join(base, os.path.relpath(full, out)))
    print("이미지 %d장 (%s ~ %s)" % (total, start, end))
    print("묶음:", zpath, "— %.1f MB" % (os.path.getsize(zpath) / 1048576))


from PIL import Image as _Image
Image_ADAPTIVE = _Image.Palette.ADAPTIVE if hasattr(_Image, "Palette") else 1

if __name__ == "__main__":
    main()
