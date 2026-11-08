param(
    [string]$ConfigPath = 'C:\Users\iansa\.codex\config.toml',
    [string]$SkillPath = 'C:\Users\iansa\.agents\skills\research-skill\SKILL.md'
)
$ErrorActionPreference = 'Stop'
foreach ($targetPath in @($ConfigPath, $SkillPath)) {
    $targetDrive = New-Object System.IO.DriveInfo([System.IO.Path]::GetPathRoot($targetPath))
    if ($targetDrive.AvailableFreeSpace -lt 1048576) { throw "At least 1 MB of free space is needed on $($targetDrive.Name) before registration. No settings were changed." }
}
$projectRoot = Split-Path -Parent $PSScriptRoot
$configExample = Join-Path $projectRoot 'examples\codex-config.toml'
$skillSource = Join-Path (Split-Path -Parent $projectRoot) 'research_skill\SKILL.md'
$encoding = New-Object System.Text.UTF8Encoding($false)
$existingConfig = [System.IO.File]::ReadAllText($ConfigPath)
$serverBlock = [System.IO.File]::ReadAllText($configExample)
$skill = [System.IO.File]::ReadAllText($skillSource)
if ($existingConfig -match '(?m)^\[mcp_servers\.research_mcp(?:\]|\.)') {
    throw 'research_mcp is already configured. No settings were changed.'
}
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'dist\index.js'))) { throw 'Build the server before registration.' }
if (-not (Test-Path -LiteralPath $SkillPath)) { throw 'The installed research skill was not found.' }

# Keep recoverable copies on D:; never print or replace unrelated configuration.
$backupRoot = Join-Path $projectRoot '.temp'
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
$backupId = [Guid]::NewGuid().ToString('N')
Copy-Item -LiteralPath $ConfigPath -Destination (Join-Path $backupRoot "config-before-research-$backupId.toml")
Copy-Item -LiteralPath $SkillPath -Destination (Join-Path $backupRoot "skill-before-research-$backupId.md")
if ([System.IO.File]::ReadAllText($ConfigPath) -cne $existingConfig) { throw 'Config changed concurrently. No settings were changed.' }
[System.IO.File]::AppendAllText($ConfigPath, "`r`n" + $serverBlock + "`r`n", $encoding)
[System.IO.File]::WriteAllText($SkillPath, $skill, $encoding)
if ([System.IO.File]::ReadAllText($SkillPath) -cne $skill) { throw 'Skill installation verification failed.' }
Write-Output 'Registered research_mcp and updated the installed research-skill.'
