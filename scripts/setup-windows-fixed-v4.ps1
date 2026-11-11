# Run in PowerShell from the MocCafeOS root: powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1
# Uses an existing SQLEXPRESS instance. Never drops an existing database.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$project = Join-Path $root 'backend\MocCafe.Api\MocCafe.Api.csproj'
if (!(Get-Command dotnet -ErrorAction SilentlyContinue)) { throw 'Chưa cài .NET 8 SDK. Xem README.' }
# The instance name is NOT the database name. Use localhost\SQLEXPRESS for a local Express instance.
[string]$server = Read-Host 'SQL Server INSTANCE (Enter=localhost\SQLEXPRESS; NOT MocCafeDB)'
$server = $server.Trim()
if ([string]::IsNullOrWhiteSpace($server)) { $server = 'localhost\SQLEXPRESS' }
if ($server.Equals('MocCafeDB', [System.StringComparison]::OrdinalIgnoreCase)) {
    Write-Warning 'MocCafeDB is a database name, not an SQL Server instance. Using localhost\SQLEXPRESS instead.'
    $server = 'localhost\SQLEXPRESS'
}
Write-Host ('SQL Server instance: ' + $server + ' | Database: MocCafeDB') -ForegroundColor Cyan
$sqlSecure = Read-Host 'SQL Server password for sa' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sqlSecure)
try { $sqlPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
# Use Add() with VALID SqlClient keyword spellings.
# In Windows PowerShell, assigning .DataSource may be interpreted as indexer key "DataSource"
# (which SqlClient does not recognize). Add("Data Source", ...) bypasses that issue.
$builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
$builder.Add('Data Source', [string]$server)
$builder.Add('Initial Catalog', 'MocCafeDB')
$builder.Add('User ID', 'sa')
$builder.Add('Password', [string]$sqlPassword)
$builder.Add('Encrypt', $true)
$builder.Add('TrustServerCertificate', $true)
$env:ConnectionStrings__DefaultConnection = $builder.ConnectionString
Remove-Variable sqlPassword -ErrorAction SilentlyContinue
$bytes = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$env:Jwt__Key = [Convert]::ToBase64String($bytes)
$env:Jwt__Issuer = 'MocCafe'
$env:Jwt__Audience = 'MocCafeWeb'
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:ASPNETCORE_URLS = 'http://0.0.0.0:5088'
$env:Seed__Enabled = 'true'
$env:Seed__AdminEmail = 'owner@moccafe.local'
$adminSecure = Read-Host 'Choose OWNER login password (>=8 chars)' -AsSecureString
$ptr2 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminSecure)
try { $env:Seed__AdminPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr2) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr2) }
$publicUrl = Read-Host 'Public front-end URL (Enter=http://localhost:5173; use http://LAN_IP:5173 for phone QR)'
if ([string]::IsNullOrWhiteSpace($publicUrl)) { $publicUrl = 'http://localhost:5173' }
$env:PublicFrontendUrl = $publicUrl
$env:Cors__Origins = $publicUrl
Write-Host 'Restoring dependencies...' -ForegroundColor Cyan
dotnet restore $project
if ($LASTEXITCODE -ne 0) { throw 'dotnet restore failed' }
# Install EF Core CLI only inside this project. This does NOT downgrade the user's
# globally installed dotnet-ef (which may be 10.x for other projects).
# Do not use `dotnet tool update --global` for a .NET 8 project.
Write-Host 'Checking project-local dotnet-ef 8.0.11...' -ForegroundColor Cyan
$toolDir = Join-Path $root '.moccafe-tools'
$efExe = Join-Path $toolDir 'dotnet-ef.exe'
if (!(Test-Path $efExe)) {
    dotnet tool install dotnet-ef --tool-path $toolDir --version 8.0.11
    if ($LASTEXITCODE -ne 0) { throw 'Khong the cai dotnet-ef 8.0.11 cho du an. Kiem tra Internet va NuGet.' }
}
$efVersionOutput = (& $efExe --version | Out-String)
if ($LASTEXITCODE -ne 0 -or $efVersionOutput -notmatch '8\.0\.11') {
    throw ('Expected dotnet-ef 8.0.11 in project-local tool path. Actual: ' + $efVersionOutput.Trim())
}
Write-Host ('Using project-local EF CLI: ' + $efExe) -ForegroundColor Green
$migrations = Join-Path $root 'backend\MocCafe.Api\Migrations'
if (!(Test-Path $migrations) -or !(Get-ChildItem $migrations -Filter '*.cs' -ErrorAction SilentlyContinue)) {
    Write-Host 'Generating InitialCreate EF migration...' -ForegroundColor Cyan
    & $efExe migrations add InitialCreate --project $project --startup-project $project
    if ($LASTEXITCODE -ne 0) { throw 'Migration generation failed' }
}
Write-Host 'Applying database migrations without dropping tables...' -ForegroundColor Cyan
& $efExe database update --project $project --startup-project $project
if ($LASTEXITCODE -ne 0) { throw 'Migration update failed. Check connection / existing schema.' }
Write-Host 'Migrations applied. Starting backend at http://localhost:5088/swagger' -ForegroundColor Green
Write-Host 'Open a SECOND PowerShell terminal: cd frontend; npm install; npm run dev'
dotnet run --no-launch-profile --project $project
