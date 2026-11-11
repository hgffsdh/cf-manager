$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location (Join-Path $root 'frontend')
if (!(Test-Path node_modules)) { npm install; if ($LASTEXITCODE -ne 0) { throw 'npm install failed' } }
npm run dev
