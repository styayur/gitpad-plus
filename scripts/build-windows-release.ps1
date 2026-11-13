# SPDX-License-Identifier: AGPL-3.0-only
[CmdletBinding()]
param([Parameter(Mandatory)][string]$OutputDirectory,[string]$PackagedRegistryPath,[switch]$AllowDirtyDevelopmentBuild)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try{
    $output=[IO.Path]::GetFullPath($OutputDirectory)
    if(Test-Path -LiteralPath $output){if(Get-ChildItem -LiteralPath $output -Force){throw 'Output must be new/empty'}}
    $sha=(& git rev-parse HEAD).Trim();if($LASTEXITCODE -ne 0){throw 'Cannot resolve source commit'}
    $dirty=!!(& git status --porcelain)
    if($dirty -and !$AllowDirtyDevelopmentBuild){throw 'Release source must be committed and clean'}
    $stamp=if($dirty){'development'}else{$sha}
    $registry=if($PackagedRegistryPath){(Resolve-Path -LiteralPath $PackagedRegistryPath).Path}else{Join-Path $root 'plugins/packaged.json'}
    if(!(Test-Path -LiteralPath public/THIRD_PARTY_LICENSES.txt)){throw 'Run the actual portable/native license inventories and bundle-notices.mjs first'}
    New-Item -ItemType Directory -Force -Path $output | Out-Null
    $env:GITPAD_PLUGIN_REGISTRY=$registry
    & pnpm build 2>&1 | Tee-Object (Join-Path $output 'web-build.log')
    if($LASTEXITCODE -ne 0){throw 'Embedded editor build failed'}
    $publish=Join-Path $output 'publish'
    & dotnet publish apps/GitPadPlus.App/GitPadPlus.App.csproj -c Release -f net10.0-windows10.0.19041.0 '-p:GitPadTargetFramework=net10.0-windows10.0.19041.0' '-p:RestoreLockedMode=true' "-p:GitPadPackagedRegistry=$registry" -r win-x64 "-p:GitPadSourceCommit=$stamp" -o $publish -v:minimal 2>&1 | Tee-Object (Join-Path $output 'windows-publish.log')
    if($LASTEXITCODE -ne 0){throw 'Self-contained Windows publish failed'}
    foreach($file in @('THIRD_PARTY_NOTICES.md','LICENSE')){Copy-Item -LiteralPath (Join-Path $root $file) -Destination (Join-Path $publish $file)}
    Copy-Item -LiteralPath public/THIRD_PARTY_LICENSES.txt -Destination (Join-Path $publish 'THIRD_PARTY_LICENSES.txt')
    if(Get-ChildItem -LiteralPath $publish -Directory -Filter '*.WebView2'){throw 'Publish directory contains runtime-generated WebView2 data'}
    $exe=Join-Path $publish 'GitPadPlus.App.exe'
    $signature=Get-AuthenticodeSignature -LiteralPath $exe
    if($signature.Status -notin @('NotSigned','Valid')){throw 'Invalid Authenticode signature'}
    $signatureLabel=if($signature.Status -eq 'Valid'){'trusted-authenticode'}else{'unsigned'}
    $runtime=Get-Content -LiteralPath (Join-Path $publish 'GitPadPlus.App.runtimeconfig.json') -Raw|ConvertFrom-Json
    if(!$runtime.runtimeOptions.includedFrameworks -or !(Test-Path -LiteralPath (Join-Path $publish 'Microsoft.UI.Xaml.dll'))){throw 'Missing self-contained runtime payload'}
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip=Join-Path $output 'GitPadPlus-Windows-x64.zip'
    # Freeze the package before any executable is launched and creates a profile.
    [IO.Compression.ZipFile]::CreateFromDirectory($publish,$zip,[IO.Compression.CompressionLevel]::Optimal,$false)
    @{sourceCommit=$stamp;checkoutCommit=$sha;dirty=$dirty;version='0.1.0-alpha.1';configuration='Release';architecture='x64';signature=$signatureLabel;packagedExecutableSha256=(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant();bytes=(Get-Item -LiteralPath $zip).Length;sha256=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant();scope='Package built; clean extraction and native runtime acceptance still required'}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $output 'windows-build-info.json') -Encoding utf8
    Get-Content -LiteralPath (Join-Path $output 'windows-build-info.json')
}finally{Pop-Location}
