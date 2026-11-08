param([Parameter(ValueFromRemainingArguments = $true)][string[]]$PnpmArguments)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$cacheRoot = Join-Path $projectRoot '.dependency-cache'
$env:npm_config_cache = Join-Path $cacheRoot 'npm'
$env:npm_config_devdir = Join-Path $cacheRoot 'node-gyp'
$env:XDG_CACHE_HOME = $cacheRoot
$env:COREPACK_HOME = Join-Path $cacheRoot 'corepack'
$env:npm_config_state_dir = Join-Path $cacheRoot 'state'
$env:TEMP = Join-Path $projectRoot '.temp'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null
Push-Location -LiteralPath $projectRoot
try {
    & pnpm @PnpmArguments
    $commandExitCode = $LASTEXITCODE
} finally {
    Pop-Location
}
exit $commandExitCode
