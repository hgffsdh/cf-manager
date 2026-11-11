param(
    [string]$ProjectRoot = 'A:\MocCafeOS'
)
$ErrorActionPreference = 'Stop'

try {
    $components = Join-Path $ProjectRoot 'frontend\src\components'
    $layoutPath = Join-Path $components 'Layout.tsx'
    $apiPath = Join-Path $ProjectRoot 'frontend\src\lib\api.ts'
    $tsxPath = Join-Path $components 'SidebarWorkBadges.tsx'
    $cssPath = Join-Path $components 'SidebarWorkBadges.css'

    if (-not (Test-Path -LiteralPath $layoutPath)) { throw "Khong tim thay Layout: $layoutPath" }
    if (-not (Test-Path -LiteralPath $apiPath)) { throw "Khong tim thay API: $apiPath" }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $original = [IO.File]::ReadAllText($layoutPath, [Text.Encoding]::UTF8)
    $updated = $original

    # Remove the old Pending-only counter, avoiding two counters in Orders.
    $oldBadge = '\{to\s*===\s*(''/admin/orders''|"/admin/orders")\s*&&\s*<PendingOrderBadge\s*/>\s*\}'
    $updated = [regex]::Replace($updated, $oldBadge, '')
    if ($updated -match '<PendingOrderBadge\s*/>') {
        throw 'Layout co PendingOrderBadge o vi tri khac. Khong sua tu dong de tranh vo giao dien.'
    }

    # Remove only the now-unused named import, preserve OrderBell and OrderDeepLink.
    $importOld = '(?m)^\s*import\s*\{(?<names>[^}]+)\}\s*from\s*[''"](?<mod>[^''"]*OrderNotifications)[''"]\s*;?'
    $updated = [regex]::Replace($updated, $importOld, [System.Text.RegularExpressions.MatchEvaluator]{
        param($m)
        $names = @($m.Groups['names'].Value -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -and $_ -ne 'PendingOrderBadge' })
        if ($names.Count -eq 0) { return '' }
        return ('import {{ {0} }} from ''{1}'';' -f ($names -join ', '), $m.Groups['mod'].Value)
    })

    if ($updated -notmatch 'from\s*[''"]\./SidebarWorkBadges[''"]') {
        $updated = "import { useSidebarWorkCounts, SidebarOrderWorkBadge, SidebarKitchenWorkBadge, SidebarServiceWorkBadge } from './SidebarWorkBadges';`r`n" + $updated
    }

    if ($updated -notmatch 'const\s+workCounts\s*=\s*useSidebarWorkCounts\s*\(') {
        $fn = [regex]::Match($updated, 'export\s+function\s+Layout\s*\(\s*\)\s*\{')
        if (-not $fn.Success) { throw 'Khong tim thay export function Layout(). Khong sua file.' }
        $updated = $updated.Insert($fn.Index + $fn.Length, "`r`n  const workCounts = useSidebarWorkCounts();")
    }

    if ($updated -notmatch '<SidebarOrderWorkBadge\s+counts=') {
        $nav = [regex]::Match($updated, '<nav\b[^>]*\bclassName\s*=\s*"side-links"[^>]*>')
        if (-not $nav.Success) { throw 'Khong tim thay <nav className="side-links"> trong Layout.' }
        $endLink = $updated.IndexOf('</NavLink>', $nav.Index + $nav.Length)
        if ($endLink -lt 0) { throw 'Khong tim thay </NavLink> trong nav.' }
        $injection = "{to === '/admin/orders' && <SidebarOrderWorkBadge counts={workCounts} />}" +
                     "{to === '/admin/kitchen' && <SidebarKitchenWorkBadge counts={workCounts} />}" +
                     "{to === '/admin/service' && <SidebarServiceWorkBadge counts={workCounts} />}"
        $updated = $updated.Insert($endLink, $injection)
    }

    foreach ($marker in @('useSidebarWorkCounts()', 'SidebarOrderWorkBadge counts={workCounts}', 'SidebarKitchenWorkBadge counts={workCounts}', 'SidebarServiceWorkBadge counts={workCounts}')) {
        if (-not $updated.Contains($marker)) { throw "Thieu thanh phan sau khi chuan bi: $marker" }
    }

    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    if ($updated -ne $original) {
        $backup = "$layoutPath.backup-badges-$stamp"
        Copy-Item -LiteralPath $layoutPath -Destination $backup -ErrorAction Stop
        Write-Host "[BACKUP] $backup"
    }
    foreach ($path in @($tsxPath, $cssPath)) {
        if (Test-Path -LiteralPath $path) {
            Copy-Item -LiteralPath $path -Destination "$path.backup-badges-$stamp" -ErrorAction Stop
        }
    }

    $tsxBase64 = 'aW1wb3J0IHsgdXNlUXVlcnkgfSBmcm9tICdAdGFuc3RhY2svcmVhY3QtcXVlcnknOwppbXBvcnQgeyBhcGkgfSBmcm9tICcuLi9saWIvYXBpJzsKaW1wb3J0ICcuL1NpZGViYXJXb3JrQmFkZ2VzLmNzcyc7Cgp0eXBlIE9yZGVyc1BhZ2UgPSB7IHRvdGFsQ291bnQ6IG51bWJlciB9Owp0eXBlIEtpdGNoZW5UYXNrID0gewogIGlkOiBzdHJpbmc7CiAgc3RhdHVzOiBzdHJpbmc7CiAgb3JkZXJOdW1iZXI6IHN0cmluZzsKICBxdWFudGl0eTogbnVtYmVyOwogIHJlYWR5UXVhbnRpdHk6IG51bWJlcjsKICBzZXJ2ZWRRdWFudGl0eTogbnVtYmVyOwp9Owp0eXBlIFNlcnZpY2VSZXF1ZXN0ID0geyBpZDogc3RyaW5nIH07CgovLyBUaGVzZSBrZXlzIGRlbGliZXJhdGVseSBtYXRjaCB0aGUgZXhpc3RpbmcgcGFnZXMgYW5kIG5vdGlmaWNhdGlvbiBiZWxsLgovLyB1c2VSZWFsdGltZSgpIGluIExheW91dCBpbnZhbGlkYXRlcyBxdWVyaWVzIHdoZW4gU2lnbmFsUiBtZXNzYWdlcyBhcnJpdmUuCmV4cG9ydCBmdW5jdGlvbiB1c2VTaWRlYmFyV29ya0NvdW50cygpIHsKICBjb25zdCBwZW5kaW5nT3JkZXJzID0gdXNlUXVlcnkoewogICAgcXVlcnlLZXk6IFsnbW9jLW9yZGVyLW5vdGlmaWNhdGlvbnMnLCAnUGVuZGluZyddLAogICAgcXVlcnlGbjogKCkgPT4gYXBpPE9yZGVyc1BhZ2U+KCcvc3RhZmYvb3JkZXJzP3N0YXR1cz1QZW5kaW5nJnBhZ2U9MScpLAogICAgcmVmZXRjaEludGVydmFsOiAxMl8wMDAsCiAgICByZWZldGNoT25XaW5kb3dGb2N1czogdHJ1ZSwKICAgIHN0YWxlVGltZTogMV81MDAsCiAgICByZXRyeTogMSwKICB9KTsKCiAgY29uc3Qga2l0Y2hlbiA9IHVzZVF1ZXJ5KHsKICAgIHF1ZXJ5S2V5OiBbJ2tpdGNoZW4nXSwKICAgIHF1ZXJ5Rm46ICgpID0+IGFwaTxLaXRjaGVuVGFza1tdPignL3N0YWZmL2tpdGNoZW4nKSwKICAgIHJlZmV0Y2hJbnRlcnZhbDogMTJfMDAwLAogICAgcmVmZXRjaE9uV2luZG93Rm9jdXM6IHRydWUsCiAgICBzdGFsZVRpbWU6IDFfNTAwLAogICAgcmV0cnk6IDEsCiAgfSk7CgogIGNvbnN0IHN1cHBvcnQgPSB1c2VRdWVyeSh7CiAgICBxdWVyeUtleTogWydzdXBwb3J0J10sCiAgICBxdWVyeUZuOiAoKSA9PiBhcGk8U2VydmljZVJlcXVlc3RbXT4oJy9zdGFmZi9zdXBwb3J0JyksCiAgICByZWZldGNoSW50ZXJ2YWw6IDEyXzAwMCwKICAgIHJlZmV0Y2hPbldpbmRvd0ZvY3VzOiB0cnVlLAogICAgc3RhbGVUaW1lOiAxXzUwMCwKICAgIHJldHJ5OiAxLAogIH0pOwoKICBjb25zdCB0YXNrcyA9IGtpdGNoZW4uZGF0YSA/PyBbXTsKICBjb25zdCBxdWV1ZWQgPSB0YXNrcy5maWx0ZXIoKHRhc2spID0+IHRhc2suc3RhdHVzID09PSAnUXVldWVkJykubGVuZ3RoOwogIGNvbnN0IHByZXBhcmluZyA9IHRhc2tzLmZpbHRlcigodGFzaykgPT4KICAgIHRhc2suc3RhdHVzID09PSAnUHJlcGFyaW5nJyB8fCB0YXNrLnN0YXR1cyA9PT0gJ1BhcnRpYWxseVJlYWR5JwogICkubGVuZ3RoOwoKICAvLyBBIGZ1bGx5IHNlcnZlZCB0YXNrIG1heSBzdGlsbCBoYXZlIFN0YXR1cz0nUmVhZHknIGluIHRoZSBjdXJyZW50IGJhY2tlbmQuCiAgLy8gQ29tcGFyZSBhY3R1YWwgcXVhbnRpdGllcyBpbnN0ZWFkIG9mIHJlbHlpbmcgb24gdGFzayBzdGF0dXMgYWxvbmUuCiAgY29uc3QgcmVhZHlUb1NlcnZlID0gdGFza3MucmVkdWNlKAogICAgKHN1bSwgdGFzaykgPT4gc3VtICsgTWF0aC5tYXgoMCwgdGFzay5yZWFkeVF1YW50aXR5IC0gdGFzay5zZXJ2ZWRRdWFudGl0eSksCiAgICAwCiAgKTsKCiAgY29uc3QgYWN0aXZlT3JkZXJOdW1iZXJzID0gbmV3IFNldCgKICAgIHRhc2tzCiAgICAgIC5maWx0ZXIoKHRhc2spID0+CiAgICAgICAgdGFzay5zdGF0dXMgPT09ICdRdWV1ZWQnIHx8CiAgICAgICAgdGFzay5zdGF0dXMgPT09ICdQcmVwYXJpbmcnIHx8CiAgICAgICAgdGFzay5zdGF0dXMgPT09ICdQYXJ0aWFsbHlSZWFkeScgfHwKICAgICAgICB0YXNrLnJlYWR5UXVhbnRpdHkgPiB0YXNrLnNlcnZlZFF1YW50aXR5CiAgICAgICkKICAgICAgLm1hcCgodGFzaykgPT4gdGFzay5vcmRlck51bWJlcikKICAgICAgLmZpbHRlcihCb29sZWFuKQogICk7CgogIHJldHVybiB7CiAgICBwZW5kaW5nOiBwZW5kaW5nT3JkZXJzLmRhdGE/LnRvdGFsQ291bnQgPz8gMCwKICAgIGFjdGl2ZU9yZGVyczogYWN0aXZlT3JkZXJOdW1iZXJzLnNpemUsCiAgICBxdWV1ZWQsCiAgICBwcmVwYXJpbmcsCiAgICByZWFkeVRvU2VydmUsCiAgICBzdXBwb3J0UmVxdWVzdHM6IHN1cHBvcnQuZGF0YT8ubGVuZ3RoID8/IDAsCiAgICBwZW5kaW5nRXJyb3I6IEJvb2xlYW4ocGVuZGluZ09yZGVycy5lcnJvciksCiAgICBraXRjaGVuRXJyb3I6IEJvb2xlYW4oa2l0Y2hlbi5lcnJvciksCiAgICBzdXBwb3J0RXJyb3I6IEJvb2xlYW4oc3VwcG9ydC5lcnJvciksCiAgfTsKfQoKZXhwb3J0IHR5cGUgU2lkZWJhcldvcmtDb3VudHMgPSBSZXR1cm5UeXBlPHR5cGVvZiB1c2VTaWRlYmFyV29ya0NvdW50cz47Cgp0eXBlIFdvcmtCYWRnZVByb3BzID0gewogIGNvdW50OiBudW1iZXI7CiAgbGFiZWw6IHN0cmluZzsKICB0b25lOiAncmVkJyB8ICdhbWJlcicgfCAnZ3JlZW4nIHwgJ2JsdWUnOwp9OwoKZnVuY3Rpb24gV29ya0JhZGdlKHsgY291bnQsIGxhYmVsLCB0b25lIH06IFdvcmtCYWRnZVByb3BzKSB7CiAgaWYgKGNvdW50IDw9IDApIHJldHVybiBudWxsOwogIGNvbnN0IHRleHQgPSBjb3VudCA+IDk5ID8gJzk5KycgOiBTdHJpbmcoY291bnQpOwogIHJldHVybiAoCiAgICA8c3BhbgogICAgICBjbGFzc05hbWU9e2Btb2Mtd29yay1iYWRnZSBtb2Mtd29yay1iYWRnZS0ke3RvbmV9YH0KICAgICAgdGl0bGU9e2Ake2xhYmVsfTogJHtjb3VudH1gfQogICAgICBhcmlhLWxhYmVsPXtgJHtsYWJlbH06ICR7Y291bnR9YH0KICAgID4KICAgICAge3RleHR9CiAgICA8L3NwYW4+CiAgKTsKfQoKZnVuY3Rpb24gV29ya0Vycm9yQmFkZ2UoeyBsYWJlbCB9OiB7IGxhYmVsOiBzdHJpbmcgfSkgewogIHJldHVybiAoCiAgICA8c3BhbgogICAgICBjbGFzc05hbWU9Im1vYy13b3JrLWJhZGdlIG1vYy13b3JrLWJhZGdlLWVycm9yIgogICAgICB0aXRsZT17YEtow7RuZyB04bqjaSDEkcaw4bujYyBz4buRIGzGsOG7o25nOiAke2xhYmVsfS4gSMOjeSBraeG7g20gdHJhIHF1eeG7gW4gdHJ1eSBj4bqtcCBob+G6t2MgQVBJLmB9CiAgICAgIGFyaWEtbGFiZWw9e2BLaMO0bmcgdOG6o2kgxJHGsOG7o2Mgc+G7kSBsxrDhu6NuZyAke2xhYmVsfWB9CiAgICA+CiAgICAgICEKICAgIDwvc3Bhbj4KICApOwp9CgpleHBvcnQgZnVuY3Rpb24gU2lkZWJhck9yZGVyV29ya0JhZGdlKHsgY291bnRzIH06IHsgY291bnRzOiBTaWRlYmFyV29ya0NvdW50cyB9KSB7CiAgcmV0dXJuICgKICAgIDw+CiAgICAgIHtjb3VudHMucGVuZGluZ0Vycm9yID8gKAogICAgICAgIDxXb3JrRXJyb3JCYWRnZSBsYWJlbD0ixJHGoW4gY2jhu50geMOhYyBuaOG6rW4iIC8+CiAgICAgICkgOiAoCiAgICAgICAgPFdvcmtCYWRnZSBjb3VudD17Y291bnRzLnBlbmRpbmd9IGxhYmVsPSLEkMahbiBjaOG7nSB4w6FjIG5o4bqtbiIgdG9uZT0icmVkIiAvPgogICAgICApfQogICAgICB7Y291bnRzLmtpdGNoZW5FcnJvciA/ICgKICAgICAgICA8V29ya0Vycm9yQmFkZ2UgbGFiZWw9IsSRxqFuIMSRYW5nIHjhu60gbMO9IiAvPgogICAgICApIDogKAogICAgICAgIDxXb3JrQmFkZ2UgY291bnQ9e2NvdW50cy5hY3RpdmVPcmRlcnN9IGxhYmVsPSLEkMahbiDEkWFuZyB44butIGzDvSIgdG9uZT0iYW1iZXIiIC8+CiAgICAgICl9CiAgICA8Lz4KICApOwp9CgpleHBvcnQgZnVuY3Rpb24gU2lkZWJhcktpdGNoZW5Xb3JrQmFkZ2UoeyBjb3VudHMgfTogeyBjb3VudHM6IFNpZGViYXJXb3JrQ291bnRzIH0pIHsKICBpZiAoY291bnRzLmtpdGNoZW5FcnJvcikgcmV0dXJuIDxXb3JrRXJyb3JCYWRnZSBsYWJlbD0iY8O0bmcgdmnhu4djIHBoYSBjaOG6vyIgLz47CiAgcmV0dXJuICgKICAgIDw+CiAgICAgIDxXb3JrQmFkZ2UgY291bnQ9e2NvdW50cy5xdWV1ZWR9IGxhYmVsPSJNw7NuIGNo4budIHBoYSBjaOG6vyIgdG9uZT0icmVkIiAvPgogICAgICA8V29ya0JhZGdlIGNvdW50PXtjb3VudHMucHJlcGFyaW5nfSBsYWJlbD0iTcOzbiDEkWFuZyBwaGEgY2jhur8iIHRvbmU9ImFtYmVyIiAvPgogICAgPC8+CiAgKTsKfQoKZXhwb3J0IGZ1bmN0aW9uIFNpZGViYXJTZXJ2aWNlV29ya0JhZGdlKHsgY291bnRzIH06IHsgY291bnRzOiBTaWRlYmFyV29ya0NvdW50cyB9KSB7CiAgcmV0dXJuICgKICAgIDw+CiAgICAgIHtjb3VudHMua2l0Y2hlbkVycm9yID8gKAogICAgICAgIDxXb3JrRXJyb3JCYWRnZSBsYWJlbD0ibcOzbiBjaOG7nSBwaOG7pWMgduG7pSIgLz4KICAgICAgKSA6ICgKICAgICAgICA8V29ya0JhZGdlIGNvdW50PXtjb3VudHMucmVhZHlUb1NlcnZlfSBsYWJlbD0iUGjhuqduIG3Ds24gY2jhu50gcGjhu6VjIHbhu6UiIHRvbmU9ImdyZWVuIiAvPgogICAgICApfQogICAgICB7Y291bnRzLnN1cHBvcnRFcnJvciA/ICgKICAgICAgICA8V29ya0Vycm9yQmFkZ2UgbGFiZWw9InnDqnUgY+G6p3UgaOG7lyB0cuG7oyIgLz4KICAgICAgKSA6ICgKICAgICAgICA8V29ya0JhZGdlIGNvdW50PXtjb3VudHMuc3VwcG9ydFJlcXVlc3RzfSBsYWJlbD0iWcOqdSBj4bqndSBraMOhY2ggxJFhbmcgY2jhu50iIHRvbmU9ImJsdWUiIC8+CiAgICAgICl9CiAgICA8Lz4KICApOwp9Cg=='
    $cssBase64 = 'LyogU2lkZWJhciB3b3JrIGNvdW50ZXJzIGZvciBN4buZYyBDYWbDqSBPUyAocmVhbCBBUEkgdmFsdWVzKS4gKi8KLm1vYy1zaGVsbCAuc2lkZWJhciAuc2lkZS1saW5rIHNwYW4ubW9jLXdvcmstYmFkZ2UgewogIGRpc3BsYXk6IGlubGluZS1mbGV4ICFpbXBvcnRhbnQ7CiAgYWxpZ24taXRlbXM6IGNlbnRlcjsKICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjsKICBmbGV4LXNocmluazogMDsKICBtaW4td2lkdGg6IDIwcHg7CiAgaGVpZ2h0OiAyMHB4OwogIHBhZGRpbmc6IDAgNXB4OwogIGJvcmRlci1yYWRpdXM6IDk5OXB4OwogIGNvbG9yOiAjZmZmOwogIGZvbnQtc2l6ZTogMTBweDsKICBmb250LXdlaWdodDogODAwOwogIGxpbmUtaGVpZ2h0OiAxOwogIGZvbnQtdmFyaWFudC1udW1lcmljOiB0YWJ1bGFyLW51bXM7CiAgYm94LXNoYWRvdzogMCAycHggN3B4IHJnYmEoMCwgMCwgMCwgLjEyKTsKICBtYXJnaW4tbGVmdDogYXV0bzsKfQoubW9jLXNoZWxsIC5zaWRlYmFyIC5zaWRlLWxpbmsgc3Bhbi5tb2Mtd29yay1iYWRnZSArIHNwYW4ubW9jLXdvcmstYmFkZ2UgewogIG1hcmdpbi1sZWZ0OiAzcHg7Cn0KLm1vYy1zaGVsbCAuc2lkZWJhciAuc2lkZS1saW5rIC5tb2Mtd29yay1iYWRnZS1yZWQgeyBiYWNrZ3JvdW5kOiAjZGYzYjNiOyB9Ci5tb2Mtc2hlbGwgLnNpZGViYXIgLnNpZGUtbGluayAubW9jLXdvcmstYmFkZ2UtYW1iZXIgeyBiYWNrZ3JvdW5kOiAjZDg4YjIwOyB9Ci5tb2Mtc2hlbGwgLnNpZGViYXIgLnNpZGUtbGluayAubW9jLXdvcmstYmFkZ2UtZ3JlZW4geyBiYWNrZ3JvdW5kOiAjMjE4NjUzOyB9Ci5tb2Mtc2hlbGwgLnNpZGViYXIgLnNpZGUtbGluayAubW9jLXdvcmstYmFkZ2UtYmx1ZSB7IGJhY2tncm91bmQ6ICMzYTc2YjY7IH0KLm1vYy1zaGVsbCAuc2lkZWJhciAuc2lkZS1saW5rIC5tb2Mtd29yay1iYWRnZS1lcnJvciB7IGJhY2tncm91bmQ6ICM2NDc0OGI7IH0KCi8qIFRoZSBleGlzdGluZyBjb2xsYXBzZSBzdHlsZXNoZWV0IGhpZGVzIGFsbCBzcGFucyB3aXRoICFpbXBvcnRhbnQuCiAgIFRoZXNlIG1vcmUtc3BlY2lmaWMgc2VsZWN0b3JzIGtlZXAgd29yayBiYWRnZXMgdmlzaWJsZSBvbiBjb2xsYXBzZWQgaWNvbnMuICovCkBtZWRpYSAobWluLXdpZHRoOiA4MzFweCkgewogIC5tb2Mtc2hlbGwubW9jLXNpZGViYXItY29sbGFwc2VkIC5zaWRlYmFyIC5zaWRlLWxpbmsgewogICAgcG9zaXRpb246IHJlbGF0aXZlOwogICAgb3ZlcmZsb3c6IHZpc2libGU7CiAgfQogIC5tb2Mtc2hlbGwubW9jLXNpZGViYXItY29sbGFwc2VkIC5zaWRlYmFyIC5zaWRlLWxpbmsgc3Bhbi5tb2Mtd29yay1iYWRnZSB7CiAgICBkaXNwbGF5OiBpbmxpbmUtZmxleCAhaW1wb3J0YW50OwogICAgcG9zaXRpb246IGFic29sdXRlOwogICAgdG9wOiAycHg7CiAgICByaWdodDogMDsKICAgIGhlaWdodDogMTdweDsKICAgIG1pbi13aWR0aDogMTdweDsKICAgIGZvbnQtc2l6ZTogOXB4OwogICAgcGFkZGluZzogMCAzcHg7CiAgICBtYXJnaW46IDA7CiAgICBib3JkZXI6IDJweCBzb2xpZCAjZmZmOwogICAgei1pbmRleDogMjsKICB9CiAgLm1vYy1zaGVsbC5tb2Mtc2lkZWJhci1jb2xsYXBzZWQgLnNpZGViYXIgLnNpZGUtbGluayBzcGFuLm1vYy13b3JrLWJhZGdlICsgc3Bhbi5tb2Mtd29yay1iYWRnZSB7CiAgICB0b3A6IGF1dG87CiAgICBib3R0b206IDFweDsKICAgIHJpZ2h0OiAwOwogICAgbWFyZ2luOiAwOwogIH0KfQo='
    [IO.File]::WriteAllBytes($tsxPath, [Convert]::FromBase64String($tsxBase64))
    [IO.File]::WriteAllBytes($cssPath, [Convert]::FromBase64String($cssBase64))
    if ($updated -ne $original) {
        [IO.File]::WriteAllText($layoutPath, $updated, $utf8NoBom)
    }

    Write-Host '[OK] Da kich hoat badge cong viec: Don hang, Pha che, Phuc vu.' -ForegroundColor Green
    Write-Host '[OK] Da giu nguyen OrderBell, OrderDeepLink, sidebar hover va quyen hien tai.' -ForegroundColor Green
    Write-Host '[NEXT] cd /d A:\MocCafeOS\frontend'
    Write-Host '[NEXT] npm run build'
    Write-Host '[INFO] So lieu lay tu /staff/orders, /staff/kitchen, /staff/support; cap nhat moi 12 giay va qua SignalR.'
    Write-Host '[INFO] Neu khong co viec cho, badge khong hien. Dau ! la loi tai API/quyen.'
} catch {
    Write-Host ('[ERROR] ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
