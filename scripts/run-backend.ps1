# Mộc Café OS - start backend with runtime-only SQL password (Windows PowerShell 5.1+)
# Copy this script into A:\MocCafeOS\scripts\run-backend.ps1
# Does NOT create/drop/migrate the database and does NOT change the Owner password.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$project = Join-Path $root 'backend\MocCafe.Api\MocCafe.Api.csproj'
if (!(Test-Path $project)) {
    throw "Khong tim thay $project. Hay luu script vao thu muc scripts cua MocCafeOS."
}
if (!(Get-Command dotnet -ErrorAction SilentlyContinue)) {
    throw 'Chua tim thay dotnet trong PATH.'
}

[string]$server = Read-Host 'SQL Server INSTANCE (Enter=localhost\SQLEXPRESS)'
$server = $server.Trim()
if ([string]::IsNullOrWhiteSpace($server)) { $server = 'localhost\SQLEXPRESS' }
if ($server.Equals('MocCafeDB', [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'MocCafeDB la ten database, khong phai instance. Hay su dung localhost\SQLEXPRESS.'
}

$sqlSecure = Read-Host 'SQL Server password for sa' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sqlSecure)
try { $sqlPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
try {
    $builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
    $builder.Add('Data Source', [string]$server)
    $builder.Add('Initial Catalog', 'MocCafeDB')
    $builder.Add('User ID', 'sa')
    $builder.Add('Password', [string]$sqlPassword)
    $builder.Add('Encrypt', $true)
    $builder.Add('TrustServerCertificate', $true)
    $env:ConnectionStrings__DefaultConnection = $builder.ConnectionString
}
finally { Remove-Variable sqlPassword -ErrorAction SilentlyContinue }

# Persist only the JWT signing key, encrypted by Windows DPAPI for the current user.
# The SQL Server password is never written to a file.
$privateDir = Join-Path $root '.local'
$keyFile = Join-Path $privateDir 'jwt-signing-key.dpapi'
if (!(Test-Path $privateDir)) { New-Item -ItemType Directory -Path $privateDir | Out-Null }
if (Test-Path $keyFile) {
    $encrypted = (Get-Content -Path $keyFile -Raw).Trim()
    $secureJwt = ConvertTo-SecureString -String $encrypted
    $jwtPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureJwt)
    try { $env:Jwt__Key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($jwtPtr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($jwtPtr) }
} else {
    $random = New-Object byte[] 48
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($random) }
    finally { $rng.Dispose() }
    $env:Jwt__Key = [Convert]::ToBase64String($random)
    $secureJwt = ConvertTo-SecureString -String $env:Jwt__Key -AsPlainText -Force
    $secureJwt | ConvertFrom-SecureString | Set-Content -Path $keyFile -Encoding ASCII
}

$env:Jwt__Issuer = 'MocCafe'
$env:Jwt__Audience = 'MocCafeWeb'
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:ASPNETCORE_URLS = 'http://0.0.0.0:5088'
# Avoid reseeding or changing the Owner account during ordinary runs.
$env:Seed__Enabled = 'false'
$env:PublicFrontendUrl = 'http://localhost:5173'
$env:Cors__Origins = 'http://localhost:5173'

Write-Host 'Starting MocCafe backend at http://localhost:5088/health' -ForegroundColor Green
Write-Host 'Keep this PowerShell/CMD window open while using the website.' -ForegroundColor Yellow
& dotnet run --no-launch-profile --project $project --urls 'http://0.0.0.0:5088'
if ($LASTEXITCODE -ne 0) { throw "Backend exited with code $LASTEXITCODE" }
