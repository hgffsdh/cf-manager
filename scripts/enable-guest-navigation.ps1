# Create EF migration for CafeNavigationLayouts table ONLY. Never drop existing SQL data.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$project = Join-Path $root 'backend\MocCafe.Api\MocCafe.Api.csproj'
$ef = Join-Path $root '.moccafe-tools\dotnet-ef.exe'
$migrations = Join-Path $root 'backend\MocCafe.Api\Migrations'
if (!(Test-Path $project)) { throw 'Cannot find MocCafe.Api.csproj' }
if (!(Test-Path $ef)) { throw 'Missing project-local dotnet-ef.exe. Run the existing setup instructions first.' }
if (!(Test-Path $migrations)) { throw 'No EF migration history in source. Stop: do not re-create database.' }
$server = Read-Host 'SQL Server INSTANCE (Enter=localhost\SQLEXPRESS)'
if ([string]::IsNullOrWhiteSpace($server)) { $server = 'localhost\SQLEXPRESS' }
$securePassword = Read-Host 'SQL password for sa' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try { $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
$builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
$builder.Add('Data Source', [string]$server)
$builder.Add('Initial Catalog', 'MocCafeDB')
$builder.Add('User ID', 'sa')
$builder.Add('Password', [string]$password)
$builder.Add('Encrypt', $true)
$builder.Add('TrustServerCertificate', $true)
$env:ConnectionStrings__DefaultConnection = [string]$builder.ConnectionString
Remove-Variable password -ErrorAction SilentlyContinue
try {
    dotnet build $project
    if ($LASTEXITCODE -ne 0) { throw 'Backend build failed: migration NOT applied' }
    $migration = Get-ChildItem $migrations -Filter '*_AddCafeNavigationLayout.cs' -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -Last 1
    if (-not $migration) {
        Write-Host 'Creating EF migration AddCafeNavigationLayout...' -ForegroundColor Cyan
        & $ef migrations add AddCafeNavigationLayout --project $project --startup-project $project
        if ($LASTEXITCODE -ne 0) { throw 'Migration generation failed' }
        $migration = Get-ChildItem $migrations -Filter '*_AddCafeNavigationLayout.cs' | Sort-Object Name | Select-Object -Last 1
    }
    if (-not $migration) { throw 'Migration file not found' }
    $source = Get-Content $migration.FullName -Raw
    $start = $source.IndexOf('protected override void Up(')
    $end = $source.IndexOf('protected override void Down(', $start)
    if ($start -lt 0 -or $end -lt 0) { throw 'Cannot parse Up() and Down()' }
    $up = $source.Substring($start, $end - $start)
    $ops = @([regex]::Matches($up, 'migrationBuilder\.([A-Za-z]+)\s*\(') | ForEach-Object { $_.Groups[1].Value })
    Write-Host ('Up() operations: ' + ($ops -join ', '))
    $safe = ($ops.Count -ge 1 -and $ops.Count -le 2 -and $ops[0] -eq 'CreateTable')
    if ($ops.Count -eq 2) { $safe = ($safe -and $ops[1] -eq 'CreateIndex') }
    $safe = ($safe -and $up -match 'name:\s*"CafeNavigationLayouts"' -and $up -match '\bLayoutJson\s*=' -and $up -match '\bBranchId\s*=')
    if (-not $safe) {
        Write-Host ('Please review migration: ' + $migration.FullName) -ForegroundColor Yellow
        throw 'Unexpected Up() operations. No SQL update was performed. Share the generated Up() for review.'
    }
    Write-Host 'Safe migration: add CafeNavigationLayouts only. Existing orders/payments remain untouched.' -ForegroundColor Green
    & $ef database update --project $project --startup-project $project
    if ($LASTEXITCODE -ne 0) { throw 'Database update failed' }
    Write-Host 'DONE. Walkway layout can now be saved in SQL Server.' -ForegroundColor Green
}
finally {
    Remove-Item Env:ConnectionStrings__DefaultConnection -ErrorAction SilentlyContinue
    $builder['Password'] = ''
}
