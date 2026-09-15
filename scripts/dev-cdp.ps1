<#
  dev-cdp.ps1 — 启动工作台开发环境（vite + 带 CDP 的窗口）

  为什么需要它（2026-09-15 实测定调）：
  经 DSH 工具调用启动的进程会挂在 web 的进程树里（web → runner → pwsh → app），
  web 一旦重启（哨兵/预检/dsh 重启），`taskkill /T` 会把窗口和 vite 一起带走。
  本脚本经 **WMI（Win32_Process.Create）** 创建子进程 —— 父进程是 WmiPrvSE，
  **不在 web 进程树里** ⇒ web 重启不再打断开发环境。

  用法：
    pwsh -File scripts/dev-cdp.ps1              # 默认 CDP 端口 9333
    pwsh -File scripts/dev-cdp.ps1 -Port 9444   # 换端口（须与 webops_attach 一致）

  配套（爱丽丝侧）：
    webops_attach { port: 9333 } → 之后 webops_eval/click/type/wait/console/shot 全部可用
#>
param([int]$Port = 9333)

$root = Split-Path $PSScriptRoot -Parent
$exe = Join-Path $root 'src-tauri\target\debug\alice-workbench.exe'
$exeDir = Split-Path $exe

function Test-Port([int]$p) {
  return [bool](Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)
}

# ---- 1) vite dev server（1420）----
if (Test-Port 1420) {
  Write-Host "vite   : 已在 1420"
} else {
  $cmd = 'cmd.exe /c "cd /d ' + $root + ' && pnpm dev > "' + $root + '\vite.log" 2>&1"'
  Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd } | Out-Null
  Write-Host "vite   : 已启动（日志 $root\vite.log）"
}

# ---- 2) 窗口（带 CDP；WMI 创建 = 脱离调用者进程树）----
if (Get-Process alice-workbench -ErrorAction SilentlyContinue) {
  Write-Host "窗口   : 已在运行"
} else {
  if (-not (Test-Path $exe)) { Write-Host "窗口   : EXE 缺失（先 cargo build）: $exe"; exit 1 }
  # set 用 set "VAR=value" 形式：避免 `set X=v && …` 把尾随空格写进变量
  $cmd = 'cmd.exe /c "set "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=' + $Port +
         '" && cd /d ' + $exeDir + ' && ' + $exe + '"'
  Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd } | Out-Null
  Write-Host "窗口   : 已启动（CDP $Port）"
}

Start-Sleep -Seconds 8

# ---- 3) 就绪自证（不猜：端口 + 进程 + CDP 身份三查）----
Write-Host "== 就绪自证 =="
Write-Host ("vite 1420 : " + (Test-Port 1420))
Write-Host ("CDP  $Port : " + (Test-Port $Port))
$p = Get-Process alice-workbench -ErrorAction SilentlyContinue | Select-Object -First 1
if ($p) { Write-Host ("窗口 pid  : " + $p.Id + "（启动于 " + $p.StartTime + "）") } else { Write-Host "窗口 pid  : 未运行" }
if (Test-Port $Port) {
  try {
    $t = (Invoke-WebRequest -Uri ("http://127.0.0.1:$Port/json") -UseBasicParsing -TimeoutSec 5).Content | ConvertFrom-Json
    $page = $t | Where-Object { $_.type -eq 'page' } | Select-Object -First 1
    Write-Host ("page target: 「" + $page.title + "」 " + $page.url)
  } catch { Write-Host ("page target: 读取失败 " + $_.Exception.Message) }
}
