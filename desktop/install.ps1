# 4조 2교대 근무표 — 바탕화면 자동 갱신 설치
#   작업 스케줄러에 등록해서 로그온 시 / 매일 08:00 / 20:00 에 실행한다.
#   install.bat 이 이 파일을 대신 실행하므로 직접 실행할 필요는 없다.

$ErrorActionPreference = "Stop"
$TaskName = "ShiftWallpaper"
$Here     = Split-Path -Parent $MyInvocation.MyCommand.Path
$Script   = Join-Path $Here "wallpaper.py"

Write-Host "=== 4조 2교대 바탕화면 설치 ===" -ForegroundColor Cyan

if (-not (Test-Path $Script)) { throw "wallpaper.py 를 찾지 못했습니다: $Script" }

# 1) 파이썬 찾기 — 창이 뜨지 않는 pythonw 를 우선한다
$exe = $null; $preArgs = ""; $pipExe = $null
foreach ($c in @("pythonw.exe", "python.exe", "pyw.exe", "py.exe")) {
  $p = Get-Command $c -ErrorAction SilentlyContinue
  if ($p) {
    $exe = $p.Source
    if ($c -like "py*.exe" -and $c -notlike "python*") { $preArgs = "-3 " }   # py 런처
    break
  }
}
if (-not $exe) {
  throw "파이썬을 찾지 못했습니다. python.org 에서 설치하고 'Add Python to PATH' 를 켜 주세요."
}
# pip 와 설치 단계는 콘솔이 있는 쪽으로 실행한다
$pipExe = $exe -replace "pythonw\.exe$", "python.exe" -replace "pyw\.exe$", "py.exe"
Write-Host "파이썬: $exe"

# 2) Pillow 설치 (이미 있으면 그냥 넘어간다)
Write-Host "Pillow 확인 중..."
if ($preArgs) { & $pipExe -3 -m pip install --quiet --upgrade pillow }
else          { & $pipExe    -m pip install --quiet --upgrade pillow }
if ($LASTEXITCODE -ne 0) { throw "Pillow 설치에 실패했습니다." }

# 3) 한 번 실행해서 바탕화면을 바로 바꾼다
Write-Host "바탕화면 생성 중..."
if ($preArgs) { & $pipExe -3 $Script } else { & $pipExe $Script }
if ($LASTEXITCODE -ne 0) { throw "wallpaper.py 실행에 실패했습니다." }

# 4) 작업 스케줄러 등록
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "기존 등록을 지웠습니다."
}

$action = New-ScheduledTaskAction -Execute $exe -Argument "$preArgs`"$Script`"" -WorkingDirectory $Here
# 각 트리거를 괄호로 감싸야 한다. 감싸지 않으면 뒤의 콤마가 -AtLogOn 의 값으로 먹힌다.
$triggers = @(
  (New-ScheduledTaskTrigger -AtLogOn),
  (New-ScheduledTaskTrigger -Daily -At ([datetime]"08:00")),
  (New-ScheduledTaskTrigger -Daily -At ([datetime]"20:00"))
)
# StartWhenAvailable: PC 가 꺼져 있어 놓친 실행을 켜자마자 따라잡는다
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
              -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
              -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers `
  -Settings $settings -Description "4조 2교대 근무표 바탕화면 자동 갱신" | Out-Null

Write-Host ""
Write-Host "설치 완료" -ForegroundColor Green
Write-Host "  로그온할 때, 매일 08:00 과 20:00 에 바탕화면이 갱신됩니다."
Write-Host "  지금 바탕화면을 확인해 보세요."
Write-Host ""
Write-Host "  지울 때는 uninstall.bat 을 실행하세요."
