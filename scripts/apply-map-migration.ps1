# One-time, non-destructive migration for Mộc Café OS map coordinates.
# Run from anywhere: powershell -ExecutionPolicy Bypass -File .\scripts\apply-map-migration.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$project = Join-Path $root 'backend\MocCafe.Api\MocCafe.Api.csproj'
$ef = Join-Path $root '.moccafe-tools\dotnet-ef.exe'
$migrations = Join-Path $root 'backend\MocCafe.Api\Migrations'
if (!(Test-Path $project)) { throw 'Khong tim thay MocCafe.Api.csproj. Can chay script tai source MocCafeOS.' }
if (!(Test-Path $ef)) { throw 'Chua co .moccafe-tools/dotnet-ef.exe. Hay cai dotnet-ef 8.0.11 cho project.' }
if (!(Test-Path $migrations)) { throw 'Chua co EF migrations InitialCreate. Hay hoan tat setup v4 truoc.' }
$server = Read-Host 'SQL Server INSTANCE (Enter=localhost\SQLEXPRESS)'
if ([string]::IsNullOrWhiteSpace($server)) { $server = 'localhost\SQLEXPRESS' }
$secret = Read-Host 'SQL Server password for sa' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try { $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
$builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
$builder.Add('Data Source', [string]$server)
$builder.Add('Initial Catalog', 'MocCafeDB')
$builder.Add('User ID', 'sa')
$builder.Add('Password', [string]$password)
$builder.Add('Encrypt', $true)
$builder.Add('TrustServerCertificate', $true)
$env:ConnectionStrings__DefaultConnection = $builder.ConnectionString
Remove-Variable password -ErrorAction SilentlyContinue
try {
    Write-Host 'Dang kiem tra dotnet build...' -ForegroundColor Cyan
    dotnet build $project
    if ($LASTEXITCODE -ne 0) { throw 'dotnet build failed' }
    $existing = @(Get-ChildItem $migrations -Filter '*_AddCafeMapPositions.cs' -ErrorAction SilentlyContinue)
    if ($existing.Count -eq 0) {
        Write-Host 'Tao EF migration bo sung: AddCafeMapPositions...' -ForegroundColor Cyan
        & $ef migrations add AddCafeMapPositions --project $project --startup-project $project
        if ($LASTEXITCODE -ne 0) { throw 'EF migration add failed' }
    }
    Write-Host 'Ap dung migration (khong drop database)...' -ForegroundColor Cyan
    & $ef database update --project $project --startup-project $project
    if ($LASTEXITCODE -ne 0) { throw 'EF database update failed' }
    Write-Host 'Hoan thanh! Da bo sung MapX, MapY cho CafeTables.' -ForegroundColor Green
}
finally { Remove-Item Env:ConnectionStrings__DefaultConnection -ErrorAction SilentlyContinue }
