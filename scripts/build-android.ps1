[CmdletBinding()]
param(
  [string]$JavaHomePath = 'C:\Program Files\Android\Android Studio\jbr',
  [string]$AndroidSdkPath = "$env:LOCALAPPDATA\Android\Sdk",
  [ValidateRange(1, 8)]
  [int]$MaxWorkers = 4,
  [string]$GradleJvmArgs = '-Xmx4096m -XX:MaxMetaspaceSize=2048m -Dfile.encoding=UTF-8',
  [switch]$SkipPrebuild
)

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$androidRoot = Join-Path $projectRoot 'android'
$artifactRoot = Join-Path $projectRoot 'artifacts'
$packagePath = Join-Path $projectRoot 'package.json'
$javaExecutable = Join-Path $JavaHomePath 'bin\java.exe'

if (-not (Test-Path -LiteralPath $javaExecutable -PathType Leaf)) {
  throw "JDK not found: $javaExecutable. Pass -JavaHomePath with an installed JDK."
}
if (-not (Test-Path -LiteralPath (Join-Path $AndroidSdkPath 'platform-tools') -PathType Container)) {
  throw "Android SDK not found: $AndroidSdkPath. Pass -AndroidSdkPath with an installed Android SDK."
}
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules\expo\package.json') -PathType Leaf)) {
  throw 'Project dependencies are missing. Run npm install in the project first.'
}
$npxCommand = (Get-Command npx.cmd -ErrorAction Stop).Source
[void](Get-Command node.exe -ErrorAction Stop)
New-Item -ItemType Directory -Path $artifactRoot -Force | Out-Null

function Invoke-LoggedNative {
  param([string]$Executable, [string[]]$Arguments, [string]$LogPath)
  # Windows PowerShell otherwise promotes ordinary native stderr warnings into
  # terminating errors. The process exit code remains the source of truth.
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & $Executable @Arguments 2>&1 | Tee-Object -FilePath $LogPath
    $nativeExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  if ($nativeExitCode -ne 0) {
    throw "Native command exited with code $nativeExitCode. See $LogPath"
  }
}

function Restore-PrebuildScripts {
  param([hashtable]$OriginalScripts)
  $currentPackage = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
  $changed = $false
  foreach ($name in @('android', 'ios')) {
    $property = $currentPackage.scripts.PSObject.Properties[$name]
    # Restore only Expo's automatic script rewrites. Preserve all other current
    # manifest values, including scripts added by the app author during a build.
    if ($property -and $property.Value -eq "expo run:$name") {
      if ($OriginalScripts.ContainsKey($name)) {
        if ($property.Value -ne $OriginalScripts[$name]) {
          $property.Value = $OriginalScripts[$name]
          $changed = $true
        }
      } else {
        $currentPackage.scripts.PSObject.Properties.Remove($name)
        $changed = $true
      }
    }
  }
  if ($changed) {
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($packagePath, (($currentPackage | ConvertTo-Json -Depth 100) + [Environment]::NewLine), $utf8)
  }
}

$environmentNames = @('JAVA_HOME', 'ANDROID_HOME', 'ANDROID_SDK_ROOT', 'NODE_ENV', 'CI')
$originalEnvironment = @{}
foreach ($name in $environmentNames) {
  $originalEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
$originalLocation = Get-Location
try {
  [Environment]::SetEnvironmentVariable('JAVA_HOME', $JavaHomePath, 'Process')
  [Environment]::SetEnvironmentVariable('ANDROID_HOME', $AndroidSdkPath, 'Process')
  [Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT', $AndroidSdkPath, 'Process')
  [Environment]::SetEnvironmentVariable('NODE_ENV', 'production', 'Process')
  [Environment]::SetEnvironmentVariable('CI', '1', 'Process')
  Set-Location -LiteralPath $projectRoot

  if (-not $SkipPrebuild) {
    $beforePackage = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
    $originalScripts = @{}
    foreach ($name in @('android', 'ios')) {
      $property = $beforePackage.scripts.PSObject.Properties[$name]
      if ($property) { $originalScripts[$name] = $property.Value }
    }
    try {
      Invoke-LoggedNative -Executable $npxCommand `
        -Arguments @('expo', 'prebuild', '--platform', 'android', '--no-install', '--no-clean', '--skip-dependency-update', 'react,react-native') `
        -LogPath (Join-Path $artifactRoot 'android-prebuild.log')
    } finally {
      Restore-PrebuildScripts -OriginalScripts $originalScripts
    }
  }

  $gradleWrapper = Join-Path $androidRoot 'gradlew.bat'
  if (-not (Test-Path -LiteralPath $gradleWrapper -PathType Leaf)) {
    throw 'Android project has not been generated. Run this script without -SkipPrebuild.'
  }
  Set-Location -LiteralPath $androidRoot
  Invoke-LoggedNative -Executable $gradleWrapper `
    -Arguments @('assembleRelease', '--console=plain', '--no-daemon', "--max-workers=$MaxWorkers", "-Dorg.gradle.jvmargs=$GradleJvmArgs") `
    -LogPath (Join-Path $artifactRoot 'android-release-build.log')

  $builtApk = Join-Path $androidRoot 'app\build\outputs\apk\release\app-release.apk'
  if (-not (Test-Path -LiteralPath $builtApk -PathType Leaf)) {
    throw "Gradle did not produce the expected APK: $builtApk"
  }
  $previewApk = Join-Path $artifactRoot 'spotit-preview.apk'
  Copy-Item -LiteralPath $builtApk -Destination $previewApk -Force
  $apk = Get-Item -LiteralPath $previewApk
  if ($apk.Length -eq 0) { throw 'The generated APK is empty.' }
  Write-Host "Preview APK ready: $previewApk"
  Write-Host "Size: $($apk.Length) bytes. This is a local preview signed with the generated debug key."
  Write-Host 'Maps, OAuth, and remote notifications still require their documented provider settings.'
} finally {
  Set-Location -LiteralPath $originalLocation.Path
  foreach ($name in $environmentNames) {
    [Environment]::SetEnvironmentVariable($name, $originalEnvironment[$name], 'Process')
  }
}
