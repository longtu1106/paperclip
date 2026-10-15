$ErrorActionPreference = 'Stop'
$taskRepoRoot = Split-Path -Parent $PSScriptRoot
$taskAccount = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
foreach ($taskName in @('windows-home', 'windows-backups')) {
    $taskDirectory = Join-Path $taskRepoRoot "data\$taskName"
    [System.IO.Directory]::CreateDirectory($taskDirectory) | Out-Null
    $taskAcl = New-Object System.Security.AccessControl.DirectorySecurity
    $taskAcl.SetAccessRuleProtection($true, $false)
    foreach ($taskSid in @($taskAccount, (New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')), (New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')))) {
        $taskRule = New-Object System.Security.AccessControl.FileSystemAccessRule($taskSid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $taskAcl.AddAccessRule($taskRule)
    }
    Set-Acl -LiteralPath $taskDirectory -AclObject $taskAcl
    Write-Output "Protected local data directory: $taskDirectory"
}
