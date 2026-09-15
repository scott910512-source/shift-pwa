# 4조 2교대 바탕화면 자동 갱신 해제
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$TaskName = "ShiftWallpaper"
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "자동 갱신을 해제했습니다." -ForegroundColor Green
} else {
  Write-Host "등록된 작업이 없습니다."
}

Write-Host ""
Write-Host "바탕화면 이미지는 그대로 남아 있습니다."
Write-Host "바꾸시려면 바탕화면 오른쪽 클릭 - 개인 설정 에서 다른 이미지를 고르세요."
