@echo off
chcp 65001 > nul
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "if (Get-ScheduledTask -TaskName 'ShiftWallpaper' -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName 'ShiftWallpaper' -Confirm:$false; Write-Host '자동 갱신을 해제했습니다.' -ForegroundColor Green } else { Write-Host '등록된 작업이 없습니다.' }"
echo.
echo 바탕화면 이미지는 그대로 남아 있습니다.
echo 바꾸시려면 바탕화면 오른쪽 클릭 - 개인 설정 에서 다른 이미지를 고르세요.
echo.
pause
