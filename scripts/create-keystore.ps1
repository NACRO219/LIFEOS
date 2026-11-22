# Creates the private signing key for LIFEOS release builds (run ONCE).
#   powershell -ExecutionPolicy Bypass -File scripts\create-keystore.ps1
#
# The key is stored OUTSIDE the project (D:\LIFEOS-keys) so it is never committed or deleted
# with the project folder. BACK IT UP (USB drive / password manager). If you lose it, you can't
# install updates over the existing app; you'd have to uninstall (losing on-device data) first.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$keyDir = "D:\LIFEOS-keys"
$keystore = "$keyDir\lifeos-release.jks"
$props = "$root\frontend\android\keystore.properties"

if (Test-Path $keystore) { throw "A keystore already exists at $keystore. Never overwrite it: you'd lose the ability to update the app." }
New-Item -ItemType Directory -Force $keyDir | Out-Null

$sec = Read-Host "Choose a keystore password (min 6 chars; it is not shown)" -AsSecureString
$sec2 = Read-Host "Repeat the password" -AsSecureString
$p1 = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
$p2 = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec2))
if ($p1 -ne $p2) { throw "Passwords don't match" }
if ($p1.Length -lt 6) { throw "Password must have at least 6 characters" }

keytool -genkeypair -v -keystore $keystore -alias lifeos -keyalg RSA -keysize 4096 -validity 10000 `
  -storepass $p1 -keypass $p1 -dname "CN=LIFEOS, O=Personal, C=XX"
if ($LASTEXITCODE -ne 0) { throw "keytool failed" }

@"
storeFile=$($keystore -replace '\\','/')
storePassword=$p1
keyAlias=lifeos
keyPassword=$p1
"@ | Set-Content -Encoding ascii $props

Write-Host "`nKeystore created: $keystore" -ForegroundColor Green
Write-Host "Signing settings: $props (git-ignored; keep it private)" -ForegroundColor Green
Write-Host "NOW back up $keyDir and remember the password." -ForegroundColor Yellow
