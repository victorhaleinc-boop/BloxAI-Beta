param(
  [string]$Version = ""
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if ([string]::IsNullOrWhiteSpace($Version)) {
  $manifest = Get-Content -Raw (Join-Path $root "everlua-extension\manifest.json") | ConvertFrom-Json
  $Version = $manifest.version
}

$distRoot = Join-Path $root "dist"
$releaseName = "EverLua-Beta-v$Version"
$stage = Join-Path $distRoot $releaseName
$zip = Join-Path $distRoot "$releaseName.zip"

if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null

# Files users need to install the extension and run their own local bridge.
$rootFiles = @("bridge.py", "config.json", "start.bat", "MacOS_Start.command", "launch_studio_mcp.py", "README.md", "LICENSE", "TRADEMARKS.md")
foreach ($file in $rootFiles) {
  $source = Join-Path $root $file
  if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $stage -Force }
}

$extensionSource = Join-Path $root "everlua-extension"
$extensionStage = Join-Path $stage "everlua-extension"
Copy-Item -LiteralPath $extensionSource -Destination $extensionStage -Recurse -Force
Remove-Item -LiteralPath (Join-Path $extensionStage "test-parser.js") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $extensionStage "test-ui-kits.js") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $extensionStage "ui-builder") -Recurse -Force -ErrorAction SilentlyContinue

@"
EverLua Beta $Version release build

This package contains readable source code under GPLv3.
The EverLua name and logo remain protected trademarks; see TRADEMARKS.md in
the source repository.

Install: extract this ZIP, open chrome://extensions or edge://extensions, enable
Developer mode, choose Load unpacked, and select the everlua-extension folder.
Then run start.bat (Windows) or MacOS_Start.command (macOS).
"@ | Set-Content -LiteralPath (Join-Path $stage "RELEASE-README.txt") -Encoding utf8

Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip -Force
Write-Host "Created $zip"
