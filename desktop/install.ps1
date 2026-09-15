# 4조 2교대 근무표 — 바탕화면 자동 갱신 설치
#   작업 스케줄러에 등록해서 로그온 시 / 매일 08:00 / 20:00 에 실행한다.
#   install.bat 이 이 파일을 대신 실행하므로 직접 실행할 필요는 없다.
#
#   주의 1: 줄 끝 역따옴표(`)로 줄을 잇지 말 것. 다운로드 과정에서 줄바꿈이나
#           끝 공백이 바뀌면 이어지지 않고 다음 줄이 별개 명령으로 해석돼 깨진다.
#           인자가 많으면 해시테이블 + 스플래팅(@속성)을 쓴다.
#   주의 2: 이 파일은 UTF-8 BOM + CRLF 로 저장해야 한다. BOM 이 없으면
#           PowerShell 5.1 이 ANSI 로 읽어 한글이 깨진다.

$ErrorActionPreference = "Stop"

# 한글이 깨지지 않도록 출력 인코딩을 맞춘다
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$TaskName = "ShiftWallpaper"
$Here     = Split-Path -Parent $MyInvocation.MyCommand.Path
$Script   = Join-Path $Here "wallpaper.py"

Write-Host "=== 4조 2교대 바탕화면 설치 ===" -ForegroundColor Cyan

if (-not (Test-Path $Script)) { throw "wallpaper.py 를 찾지 못했습니다: $Script" }

# 1) 파이썬 찾기 — 작업 스케줄러에서는 창이 뜨지 않는 pythonw 를 쓴다
$exe = $null
$preArgs = ""
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

# pip 와 첫 실행은 콘솔이 있는 쪽으로 돌린다 (오류 메시지를 봐야 하므로)
$pipExe = $exe -replace "pythonw\.exe$", "python.exe" -replace "pyw\.exe$", "py.exe"
$py = @()
if ($preArgs) { $py = @("-3") }
Write-Host "파이썬: $exe"

# 외부 프로그램은 stderr 한 줄에도 멈추지 않게 감싸서 부르고 종료 코드만 본다
function Invoke-Py {
  $old = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & $pipExe @py @args | Out-Host
    return $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $old
  }
}

# 2) Pillow — 이미 깔려 있으면 건드리지 않는다
Write-Host "Pillow 확인 중..."
if ((Invoke-Py "-c" "import PIL") -eq 0) {
  Write-Host "  이미 설치돼 있습니다."
} else {
  $code = Invoke-Py "-m" "pip" "install" "--quiet" "--upgrade" "pillow"
  if ($code -ne 0) {
    # 사내망 SSL 검사(자체 서명 인증서) 때문에 막히는 경우가 있다.
    # PyPI 세 곳에 한해 인증서 검사를 건너뛰고 다시 시도한다.
    Write-Host "  기본 설치가 막혔습니다. 사내망 설정으로 다시 시도합니다..." -ForegroundColor Yellow
    $trusted = @("--trusted-host", "pypi.org",
                 "--trusted-host", "files.pythonhosted.org",
                 "--trusted-host", "pypi.python.org")
    Invoke-Py "-m" "pip" "install" "--quiet" "--upgrade" @trusted "pillow" | Out-Null
  }
  if ((Invoke-Py "-c" "import PIL") -ne 0) {
    throw "Pillow 설치에 실패했습니다. 인터넷이 막혀 있다면 다른 PC 에서 pillow 의 whl 파일을 받아 'pip install 파일이름.whl' 로 설치한 뒤 다시 실행해 주세요."
  }
}

# 3) 한 번 실행해서 바탕화면을 바로 바꾼다
Write-Host "바탕화면 생성 중..."
if ((Invoke-Py $Script) -ne 0) { throw "wallpaper.py 실행에 실패했습니다." }

# 4) 작업 스케줄러 등록
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "기존 등록을 지웠습니다."
}

$action = New-ScheduledTaskAction -Execute $exe -Argument "$preArgs`"$Script`"" -WorkingDirectory $Here

# 각 트리거를 괄호로 감싼다. 감싸지 않으면 뒤의 콤마가 -AtLogOn 의 값으로 먹힌다.
$triggers = @(
  (New-ScheduledTaskTrigger -AtLogOn),
  (New-ScheduledTaskTrigger -Daily -At ([datetime]"08:00")),
  (New-ScheduledTaskTrigger -Daily -At ([datetime]"20:00"))
)

# StartWhenAvailable: PC 가 꺼져 있어 놓친 실행을 켜자마자 따라잡는다
$settingArgs = @{
  StartWhenAvailable         = $true
  AllowStartIfOnBatteries    = $true
  DontStopIfGoingOnBatteries = $true
  ExecutionTimeLimit         = (New-TimeSpan -Minutes 5)
}
$settings = New-ScheduledTaskSettingsSet @settingArgs

$regArgs = @{
  TaskName    = $TaskName
  Action      = $action
  Trigger     = $triggers
  Settings    = $settings
  Description = "4조 2교대 근무표 바탕화면 자동 갱신"
}
Register-ScheduledTask @regArgs | Out-Null

Write-Host ""
Write-Host "설치 완료" -ForegroundColor Green
Write-Host "  로그온할 때, 매일 08:00 과 20:00 에 바탕화면이 갱신됩니다."
Write-Host "  지금 바탕화면을 확인해 보세요."
Write-Host ""
Write-Host "  지울 때는 uninstall.bat 을 실행하세요."
