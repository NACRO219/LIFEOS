#!/usr/bin/env bash
# Installs the Android SDK command-line tools (no Android Studio needed) into D:\Android\Sdk.
# Forces IPv4 because IPv6 to dl.google.com is unreliable on this network.
set -euo pipefail
SDK="/d/Android/Sdk"
mkdir -p "$SDK/cmdline-tools" /d/Android/tmp
if [ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager.bat" ]; then
  curl -4 -fL --retry 5 --max-time 900 -o /d/Android/tmp/cmdline-tools.zip \
    https://dl.google.com/android/repository/commandlinetools-win-16111833_latest.zip
  rm -rf /d/Android/tmp/ct && unzip -q /d/Android/tmp/cmdline-tools.zip -d /d/Android/tmp/ct
  rm -rf "$SDK/cmdline-tools/latest" && mv /d/Android/tmp/ct/cmdline-tools "$SDK/cmdline-tools/latest"
fi
export JAVA_OPTS="-Djava.net.preferIPv4Stack=true"
export SDKMANAGER_OPTS="-Djava.net.preferIPv4Stack=true"
SM="$SDK/cmdline-tools/latest/bin/sdkmanager.bat"
yes | "$SM" --sdk_root="D:\Android\Sdk" --licenses > /dev/null || true
"$SM" --sdk_root="D:\Android\Sdk" "platform-tools" "platforms;android-36" "build-tools;36.0.0"
echo "SDK ready:"; ls "$SDK"
