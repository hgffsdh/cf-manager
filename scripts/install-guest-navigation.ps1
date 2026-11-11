# Merge public guest hut navigation into existing source, with backups.
$ErrorActionPreference = 'Stop'
$merge = Join-Path $PSScriptRoot 'install-guest-navigation.py'
if (!(Test-Path $merge)) { throw 'Missing install-guest-navigation.py. Copy the entire patch first.' }
if (Get-Command py -ErrorAction SilentlyContinue) {
    & py -3 $merge
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    & python $merge
} else {
    throw 'Python 3 is needed for the safe source merge. Install Python 3 or ask for a manual merge.'
}
if ($LASTEXITCODE -ne 0) { throw 'Source merge failed. Do NOT run database migration. See the error above.' }
Write-Host 'Source merge completed. Next: scripts\enable-guest-navigation.ps1' -ForegroundColor Green
