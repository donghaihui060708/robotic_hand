$ErrorActionPreference = 'Stop'

$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$sdkManager = Join-Path $sdk 'cmdline-tools\latest\bin\sdkmanager.bat'

if (-not (Test-Path -LiteralPath $sdkManager)) {
    throw 'Android SDK Command-line Tools are missing. Install them from Android Studio > SDK Manager > SDK Tools.'
}

& $sdkManager --sdk_root=$sdk --licenses
if ($LASTEXITCODE -ne 0) { throw 'Android SDK license acceptance failed.' }

& $sdkManager --sdk_root=$sdk 'ndk;29.0.13113456' 'cmake;3.31.6'
if ($LASTEXITCODE -ne 0) { throw 'NDK/CMake installation failed.' }

& (Join-Path $PSScriptRoot 'setup-llama-cpp.ps1')
