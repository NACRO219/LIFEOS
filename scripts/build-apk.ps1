# Builds the LIFEOS Android APK.
#   Debug (for testing):   powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1
#   Release (signed):      powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1 -Release
#   Build + install via USB: add -Install
param([switch]$Release, [switch]$Install)
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$env:ANDROID_HOME = "D:\Android\Sdk"
$env:ANDROID_SDK_ROOT = "D:\Android\Sdk"
$env:GRADLE_USER_HOME = "D:\Android\gradle-home"   # keeps ~1-2 GB of Gradle cache off drive C:
$env:JAVA_OPTS = "-Djava.net.preferIPv4Stack=true"
$adb = "D:\Android\Sdk\platform-tools\adb.exe"

Set-Location "$root\frontend"
Write-Host "1/3 Building the web app..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "Web build failed" }

Write-Host "2/3 Copying it into the Android project..." -ForegroundColor Cyan
npx cap sync android
if ($LASTEXITCODE -ne 0) { throw "Capacitor sync failed" }

Set-Location "$root\frontend\android"
if ($Release) {
  if (-not (Test-Path "keystore.properties")) { throw "android\keystore.properties is missing. Run scripts\create-keystore.ps1 first." }
  Write-Host "3/3 Building the signed RELEASE APK..." -ForegroundColor Cyan
  .\gradlew.bat assembleRelease
  $apk = "$root\frontend\android\app\build\outputs\apk\release\app-release.apk"
} else {
  Write-Host "3/3 Building the DEBUG APK..." -ForegroundColor Cyan
  .\gradlew.bat assembleDebug
  $apk = "$root\frontend\android\app\build\outputs\apk\debug\app-debug.apk"
}
if ($LASTEXITCODE -ne 0) { throw "Gradle build failed" }

$out = "$root\LIFEOS-$(if ($Release) { 'release' } else { 'debug' }).apk"
Copy-Item $apk $out -Force
Write-Host "`nAPK ready: $out" -ForegroundColor Green

if ($Install) {
  & $adb devices
  & $adb install -r $out
  if ($LASTEXITCODE -eq 0) {
    & $adb shell monkey -p com.lifeos.app -c android.intent.category.LAUNCHER 1 | Out-Null
    Write-Host "Installed and launched on your phone." -ForegroundColor Green
  }
}
