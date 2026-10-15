param([ValidateSet('Enable', 'Disable')][string]$Action = 'Enable')
$ErrorActionPreference = 'Stop'
$taskRepoRoot = Split-Path -Parent $PSScriptRoot
$taskStartup = [Environment]::GetFolderPath('Startup')
$taskShortcut = Join-Path $taskStartup 'Paperclip Windows local.lnk'
if ($Action -eq 'Disable') {
    if (Test-Path -LiteralPath $taskShortcut) { Remove-Item -LiteralPath $taskShortcut }
    Write-Output 'Disabled Paperclip Windows local startup. Existing runtime startup was not changed.'
    exit 0
}
$taskWsh = New-Object -ComObject WScript.Shell
$taskLink = $taskWsh.CreateShortcut($taskShortcut)
$taskLink.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$taskLink.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $taskRepoRoot 'scripts\windows-local-start.ps1') + '"'
$taskLink.WorkingDirectory = $taskRepoRoot
$taskLink.WindowStyle = 7
$taskLink.Description = "Native Windows Paperclip. Starts after $env:USERNAME signs in; source $taskRepoRoot."
$taskLink.Save()
Write-Output "Enabled: $taskShortcut"
