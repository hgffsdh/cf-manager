param(
  [string]$ProjectRoot = 'A:\MocCafeOS'
)
$ErrorActionPreference = 'Stop'

$src = Split-Path -Parent $PSScriptRoot
$components = Join-Path $ProjectRoot 'frontend\src\components'
$layoutPath = Join-Path $components 'Layout.tsx'
$ordersPath = Join-Path $ProjectRoot 'frontend\src\pages\Orders.tsx'

if (-not (Test-Path -LiteralPath $layoutPath)) { throw "Khong tim thay Layout.tsx: $layoutPath" }
if (-not (Test-Path -LiteralPath $ordersPath)) { throw "Khong tim thay Orders.tsx: $ordersPath" }
if (-not (Test-Path -LiteralPath (Join-Path $src 'src\OrderNotifications.tsx'))) { throw 'Thieu OrderNotifications.tsx trong goi patch' }

$layout = [IO.File]::ReadAllText($layoutPath, [Text.Encoding]::UTF8)
$orders = [IO.File]::ReadAllText($ordersPath, [Text.Encoding]::UTF8)

$hasLayout = ($layout -match '<OrderBell\s*/>') -and ($layout -match '<PendingOrderBadge\s*/>')
$hasOrders = ($orders -match '<OrderDeepLink\s*/>')

# Validate patterns before changing any files.
if (-not $hasLayout) {
  if ($layout -notmatch '<nav\s+className="side-links"') {
    throw 'Khong tim thay <nav className="side-links">. Dung an toan de tranh sua nham Layout.'
  }
  if ($layout -notmatch '<NavLink\b') {
    throw 'Khong tim thay NavLink trong sidebar. Dung an toan.'
  }
  if ($layout -notmatch '<div\s+className="top-actions[^\"]*"') {
    throw 'Khong tim thay top-actions. Dung an toan de tranh sua nham Layout.'
  }
}
if (-not $hasOrders -and $orders -notmatch 'return\s*<>\s*<PageTitle') {
  throw 'Khong nhan dien duoc JSX return cua Orders.tsx. Dung an toan de tranh sua nham trang Don hang.'
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item -LiteralPath $layoutPath -Destination "$layoutPath.backup-$stamp" -Force
Copy-Item -LiteralPath $ordersPath -Destination "$ordersPath.backup-$stamp" -Force

if (-not $hasLayout) {
  if ($layout -notmatch "from './OrderNotifications'") {
    $layout = "import { OrderBell, PendingOrderBadge } from './OrderNotifications';`r`n" + $layout
  }
  $m = [regex]::Match($layout, '<div\s+className="top-actions[^\"]*"[^>]*>')
  if (-not $m.Success) { throw 'Khong the chen chuong thong bao.' }
  $layout = $layout.Insert($m.Index + $m.Length, "`r`n            <OrderBell />")

  $nav = [regex]::Match($layout, '<nav\s+className="side-links"[^>]*>')
  $linkEnd = $layout.IndexOf('</NavLink>', $nav.Index + $nav.Length)
  if ($linkEnd -lt 0) { throw 'Khong tim thay diem ket thuc NavLink de chen badge.' }
  $layout = $layout.Insert($linkEnd, "{to === '/admin/orders' && <PendingOrderBadge />}")
}
if (-not $hasOrders) {
  if ($orders -notmatch "from '../components/OrderNotifications'") {
    $orders = "import { OrderDeepLink } from '../components/OrderNotifications';`r`n" + $orders
  }
  $orders = [regex]::Replace($orders, 'return\s*<>\s*<PageTitle', 'return <><OrderDeepLink/><PageTitle', 1)
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($layoutPath, $layout, $utf8NoBom)
[IO.File]::WriteAllText($ordersPath, $orders, $utf8NoBom)
Copy-Item -LiteralPath (Join-Path $src 'src\OrderNotifications.tsx') -Destination (Join-Path $components 'OrderNotifications.tsx') -Force
Copy-Item -LiteralPath (Join-Path $src 'src\OrderNotifications.css') -Destination (Join-Path $components 'OrderNotifications.css') -Force

Write-Host ''
Write-Host '[OK] Da cai dat Notification Center vao frontend.' -ForegroundColor Green
Write-Host "[OK] Da sao luu Layout va Orders voi duoi .backup-$stamp"
Write-Host 'Dung GET /api/v1/staff/orders?status=Pending va POST /api/v1/staff/orders/{id}/accept'
Write-Host 'SignalR se tai lai query qua useRealtime hien co; polling du phong 12 giay.'
Write-Host ''
Write-Host 'Tiep theo (CMD):'
Write-Host "cd /d $ProjectRoot\frontend"
Write-Host 'npm run build'
Write-Host 'npm run dev'
