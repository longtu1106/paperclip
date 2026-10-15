$ErrorActionPreference = 'Stop'
$taskRepoRoot = Split-Path -Parent $PSScriptRoot
$taskNode = (Get-Command node.exe -ErrorAction Stop).Source
& $taskNode (Join-Path $PSScriptRoot 'windows-local.mjs') start
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
