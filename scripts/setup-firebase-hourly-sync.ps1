# One-time setup: hourly Convex → Firebase sync (Admin SDK bypasses Firestore rules).
#
# 1) Firebase Console → dkmerch-2b2c3 → Project settings → Service accounts
#    → Generate new private key
# 2) Save downloaded file as:
#      D:\dkmerch-react\firebase-service-account.json
# 3) Run:
#      cd D:\dkmerch-react
#      powershell -ExecutionPolicy Bypass -File .\scripts\setup-firebase-hourly-sync.ps1
#
# You must be logged into Convex on this machine (`npx convex login` if needed).

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$keyPath = Join-Path $root "firebase-service-account.json"
if (-not (Test-Path $keyPath)) {
  Write-Host ""
  Write-Host "Put your service account JSON here first:" -ForegroundColor Yellow
  Write-Host "  $keyPath"
  Write-Host ""
  Write-Host "Download from:"
  Write-Host "  https://console.firebase.google.com/project/dkmerch-2b2c3/settings/serviceaccounts/adminsdk"
  exit 1
}

$json = Get-Content -Raw -Path $keyPath
try {
  $parsed = $json | ConvertFrom-Json
} catch {
  Write-Host "Invalid JSON in firebase-service-account.json" -ForegroundColor Red
  exit 1
}

$projectId = if ($parsed.project_id) { [string]$parsed.project_id } else { "dkmerch-2b2c3" }

Write-Host "→ FIREBASE_PROJECT_ID = $projectId"
npx --yes convex env set FIREBASE_PROJECT_ID $projectId
if ($LASTEXITCODE -ne 0) { throw "convex env set FIREBASE_PROJECT_ID failed (run npx convex login / npx convex dev first)" }

Write-Host "→ FIREBASE_SERVICE_ACCOUNT_JSON (from file)"
# stdin form avoids PowerShell mangling quotes inside the private key
$json | npx --yes convex env set FIREBASE_SERVICE_ACCOUNT_JSON
if ($LASTEXITCODE -ne 0) { throw "convex env set FIREBASE_SERVICE_ACCOUNT_JSON failed" }

Write-Host "→ Deploy Convex (hourly cron: dkmerch-firebase-mirror)"
npx --yes convex dev --once
if ($LASTEXITCODE -ne 0) { throw "convex deploy failed" }

Write-Host ""
Write-Host "Hourly Firebase auto-sync is set." -ForegroundColor Green
Write-Host "Rules can stay locked (write:false). Service account bypasses rules."
Write-Host "Optional: delete firebase-service-account.json after setup (already gitignored)."
