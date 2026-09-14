<#
.SYNOPSIS
  造一个「非 DSH 假节点」的心跳到总线上，用于验收 P1-4（新节点 < 1s 可见）。

.DESCRIPTION
  这不是适配器——它是**验收探针**：只写心跳（`nodes/<id>.json`），让工作台把它当节点显示出来。
  真正的参考适配器（能收任务、执行、回结果）见 dsh-agent-cluster 的 `scripts/sim-node.mjs`。

  用途：证明「harness 无关」不是声称——工作台只看总线产物，谁写心跳谁就被看见。

.PARAMETER Name
  节点显示名（同时作为 nodeId 前缀），默认 probe-node。

.PARAMETER Minutes
  心跳续写时长（分钟），默认 1。到期自动停止。

.PARAMETER Cleanup
  只做清理：删掉本脚本造出的所有 `probe-*` 心跳文件。

.EXAMPLE
  pwsh -File scripts/mock-node.ps1 -Name probe-a -Minutes 2
  pwsh -File scripts/mock-node.ps1 -Cleanup
#>
[CmdletBinding()]
param(
  [string]$Name = "probe-node",
  [int]$Minutes = 1,
  [switch]$Cleanup
)

$ErrorActionPreference = "Stop"
$bus = if ($env:DSH_CLUSTER_DIR) { $env:DSH_CLUSTER_DIR } else { Join-Path $env:USERPROFILE ".dsh-cluster" }
$nodesDir = Join-Path $bus "nodes"

if ($Cleanup) {
  if (-not (Test-Path $nodesDir)) { "总线不存在：$bus"; exit 0 }
  $victims = Get-ChildItem $nodesDir -Filter "probe-*.json" -ErrorAction SilentlyContinue
  if (-not $victims) { "没有需要清理的 probe-* 心跳" ; exit 0 }
  $victims | ForEach-Object { Remove-Item $_.FullName -Force; "removed: $($_.Name)" }
  exit 0
}

if (-not (Test-Path $nodesDir)) { New-Item -ItemType Directory -Path $nodesDir -Force | Out-Null }

$nodeId = "$Name-$PID"
$file = Join-Path $nodesDir "$nodeId.json"
$deadline = (Get-Date).AddMinutes($Minutes)

"probe node: $nodeId"
"heartbeat : $file"
"until     : $deadline"
"（工作台应在 1 秒内显示它；到期后心跳停止，30 秒后自动转为「离线」）"

try {
  while ((Get-Date) -lt $deadline) {
    $hb = [ordered]@{
      v         = 1
      nodeId    = $nodeId
      role      = "探针"
      harness   = "probe"          # 非 DSH：证明工作台只看总线，不看来源
      profile   = "probe"
      workspace = (Get-Location).Path
      baseUrl   = ""
      port      = 0
      pid       = $PID
      hostname  = $env:COMPUTERNAME
      startedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
      atMs      = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
      tags      = @("probe")
    }
    $json = $hb | ConvertTo-Json -Compress
    # 原子写：临时文件 + 替换（避免工作台读到半个文件）
    $tmp = "$file.tmp"
    [System.IO.File]::WriteAllText($tmp, $json, [System.Text.UTF8Encoding]::new($false))
    Move-Item -Path $tmp -Destination $file -Force
    Start-Sleep -Milliseconds 1000
  }
} finally {
  if (Test-Path $file) { Remove-Item $file -Force; "heartbeat stopped (file removed): $nodeId" }
}
