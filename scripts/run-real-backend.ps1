# Moc Cafe OS -- Real operating mode. PowerShell 5.1+.
# This script does not install/migrate/drop the SQL Server database.
# Copies bank account information ONLY to the current process environment (not to source code).
$ErrorActionPreference = 'Stop'
$runner = Join-Path $PSScriptRoot 'run-backend.ps1'
if (-not (Test-Path $runner)) { throw 'Khong tim thay scripts\run-backend.ps1. Cai script run-backend.ps1 truoc.' }
$env:CafeMode__AllowDemoPayments = 'false'

Write-Host 'MOC CAFE OS - VAN HANH THAT, KHONG TAO DEMO MOI' -ForegroundColor Green
Write-Host 'Co the nhan tien mat that ngay. Chuyen khoan that chi bat khi ban cau hinh DUNG tai khoan ngan hang.' -ForegroundColor Yellow
[string]$bank = Read-Host 'Ma ngan hang/BIN VietQR (Enter=chi dung tien mat)'
$bank = $bank.Trim()
if ($bank) {
    [string]$acc = Read-Host 'So tai khoan THUC nhan tien'
    [string]$holder = Read-Host 'Ten chu tai khoan khong dau (VI DU: NGUYEN VAN A)'
    $acc = $acc.Trim()
    $holder = $holder.Trim()
    if ($bank -notmatch '^[a-zA-Z0-9]{2,16}$' -or $acc -notmatch '^[0-9]{6,19}$' -or $holder -notmatch '^[a-zA-Z0-9 ]{5,50}$') {
        throw 'Sai ma BIN (chu/so), tai khoan (6-19 so) hoac ten chu tai khoan (5-50 ky tu, khong dau). Khong khoi dong de tranh tao QR sai.'
    }
    $env:BankTransfer__BankId = $bank
    $env:BankTransfer__AccountNo = $acc
    $env:BankTransfer__AccountName = $holder
    Write-Host 'Da bat huong dan chuyen khoan va VietQR that; thu ngan PHAI doi chieu sao ke truoc khi xac nhan.' -ForegroundColor Yellow
} else {
    $env:BankTransfer__BankId = ''
    $env:BankTransfer__AccountNo = ''
    $env:BankTransfer__AccountName = ''
    Write-Host 'Chuyen khoan tat: he thong chi cho thanh toan tien mat that.' -ForegroundColor Yellow
}
& $runner
if ($LASTEXITCODE -ne 0) { throw "Backend exited: $LASTEXITCODE" }
