<#
.SYNOPSIS
  为 Rust/cargo 编译放行 ASR —— 只给本项目的构建目录加排除，不关防线。

.DESCRIPTION
  背景：Defender ASR 规则 `01443614-…`（阻止来源不明的可执行文件）会拦下 cargo 每次编译
  生成的 `build-script-build.exe`（未签名 + 低流行度），症状是 `os error 5 拒绝访问`，
  Defender 操作日志里能看到 Id 1121 事件。

  本脚本（按 windows-security-hardening 技能 SOP）：
    1. 备份当前 ASR 全部配置（Ids / Actions / Exclusions）→ JSON，作为回滚依据
    2. 给**本项目的构建目录**追加排除项（保留原有排除，整体替换语义）
    3. 验证并打印结果

  ⚠ 需要管理员权限（脚本会自提权，触发 UAC）。

.PARAMETER Target
  要排除的构建目录，默认本仓库的 src-tauri\target。

.PARAMETER Revert
  回滚：从备份文件恢复 ASR 配置（需给 -BackupFile）。

.EXAMPLE
  pwsh -File scripts/fix-asr-for-cargo.ps1
  pwsh -File scripts/fix-asr-for-cargo.ps1 -Revert -BackupFile "$env:USERPROFILE\.dsh\asr-backup-20260914-201500.json"
#>
[CmdletBinding()]
param(
  [string]$Target = "",
  [switch]$Revert,
  [string]$BackupFile = ""
)

$ErrorActionPreference = "Stop"

# ── 自提权 ─────────────────────────────────────────────
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host "需要管理员权限，正在提权（请在 UAC 弹窗点击「是」）…" -ForegroundColor Yellow
  $argList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"")
  if ($Target) { $argList += @("-Target", "`"$Target`"") }
  if ($Revert) { $argList += "-Revert" }
  if ($BackupFile) { $argList += @("-BackupFile", "`"$BackupFile`"") }
  Start-Process powershell -Verb RunAs -ArgumentList $argList
  exit 0
}

$ASR_UNTRUSTED_EXE = "01443614-cd74-433a-b99e-2ecdc07bfc25"  # Block executable files from running unless they meet a prevalence, age, or trusted list criterion

function Get-PreferenceSnapshot {
  $p = Get-MpPreference
  [ordered]@{
    at             = (Get-Date).ToString("s")
    asrIds         = @($p.AttackSurfaceReductionRules_Ids)
    asrActions     = @($p.AttackSurfaceReductionRules_Actions)
    asrExclusions  = @($p.AttackSurfaceReductionOnlyExclusions | Where-Object { $_ })
    pathExclusions = @($p.ExclusionPath | Where-Object { $_ })
  }
}

# ── 回滚路径 ───────────────────────────────────────────
if ($Revert) {
  if (-not $BackupFile -or -not (Test-Path $BackupFile)) { throw "需要 -BackupFile 指向有效备份文件" }
  $b = Get-Content $BackupFile -Raw | ConvertFrom-Json
  Set-MpPreference -AttackSurfaceReductionRules_Ids $b.asrIds -AttackSurfaceReductionRules_Actions $b.asrActions
  Set-MpPreference -AttackSurfaceReductionOnlyExclusions @($b.asrExclusions)
  Write-Host "已回滚 ASR 配置（依据 $BackupFile）" -ForegroundColor Green
  "ids=$($b.asrIds.Count) actions=$($b.asrActions.Count) exclusions=$($b.asrExclusions.Count)"
  exit 0
}

# ── 确定目标目录 ───────────────────────────────────────
if (-not $Target) {
  $repo = Split-Path -Parent $PSScriptRoot          # scripts/ 的上一级 = 仓库根
  $Target = Join-Path $repo "src-tauri\target"
}
$Target = [System.IO.Path]::GetFullPath($Target)
Write-Host "目标构建目录: $Target" -ForegroundColor Cyan

# ── 1. 备份 ────────────────────────────────────────────
$snap = Get-PreferenceSnapshot
$backupDir = Join-Path $env:USERPROFILE ".dsh"
if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir -Force | Out-Null }
$backupPath = Join-Path $backupDir ("asr-backup-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".json")
$snap | ConvertTo-Json -Depth 5 | Set-Content -Path $backupPath -Encoding UTF8
Write-Host "已备份当前 ASR 配置 → $backupPath" -ForegroundColor Green

# ── 2. 追加排除（保留原有！Set-MpPreference 是整体替换语义） ──
$existing = @($snap.asrExclusions)
if ($existing -contains $Target) {
  Write-Host "该目录已在排除列表中，无需重复添加" -ForegroundColor Yellow
} else {
  $new = @($existing + $Target | Select-Object -Unique)
  Set-MpPreference -AttackSurfaceReductionOnlyExclusions $new
  Write-Host "已追加 ASR 排除（$($existing.Count) → $($new.Count) 条）" -ForegroundColor Green
}

# ── 3. 验证 ────────────────────────────────────────────
$after = @((Get-MpPreference).AttackSurfaceReductionOnlyExclusions | Where-Object { $_ })
"--- 当前 ASR 排除项（$($after.Count)） ---"
$after | ForEach-Object { "  $_" }
$rule = @((Get-MpPreference).AttackSurfaceReductionRules_Ids).IndexOf($ASR_UNTRUSTED_EXE)
if ($rule -ge 0) {
  $act = @((Get-MpPreference).AttackSurfaceReductionRules_Actions)[$rule]
  "规则 01443614 仍为 Enabled（action=$act）——防线未被关闭，只是给本目录放行"
}
""
Write-Host "完成。现在可以重新编译：" -ForegroundColor Cyan
Write-Host "  cd <repo>\src-tauri; cargo test" -ForegroundColor Cyan
Write-Host "回滚：pwsh -File scripts/fix-asr-for-cargo.ps1 -Revert -BackupFile `"$backupPath`"" -ForegroundColor DarkGray
