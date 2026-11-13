# SPDX-License-Identifier: AGPL-3.0-only
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$KeystorePath,
    [Parameter(Mandatory)][string]$AndroidSdkDirectory,
    [Parameter(Mandatory)][string]$JavaSdkDirectory,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [string]$Alias='gitpadplus-release',
    [string]$BuildToolsVersion='36.0.0',
    [string]$PackagedRegistryPath,
    [switch]$QuickProbe,
    [switch]$AllowDirtyDevelopmentBuild
)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
$pointer=[IntPtr]::Zero
try {
    $key=(Resolve-Path -LiteralPath $KeystorePath).Path
    if($key.StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Signing identity must be outside the repository'}
    $output=[IO.Path]::GetFullPath($OutputDirectory)
    if(Test-Path -LiteralPath $output){if(Get-ChildItem -LiteralPath $output -Force){throw 'Output must be a new/empty directory; existing assets will not be overwritten'}}
    New-Item -ItemType Directory -Force -Path $output | Out-Null
    $sha=(& git rev-parse HEAD).Trim();if($LASTEXITCODE -ne 0){throw 'Unable to resolve source commit'}
    $dirty=!!(& git status --porcelain)
    if($dirty -and !$AllowDirtyDevelopmentBuild){throw 'Release source must be committed and clean'}
    if($QuickProbe -and !$AllowDirtyDevelopmentBuild){throw 'Quick probe builds are development-only'}
    $stamp=if($dirty -or $QuickProbe){'development'}else{$sha}
    $registry=if($PackagedRegistryPath){(Resolve-Path -LiteralPath $PackagedRegistryPath).Path}else{Join-Path $root 'plugins/packaged.json'}
    $env:GITPAD_PLUGIN_REGISTRY=$registry
    & pnpm build 2>&1 | Tee-Object (Join-Path $output 'web-build.log')
    if($LASTEXITCODE -ne 0){throw 'Embedded editor build failed'}
    [string[]]$modeArguments=if($QuickProbe){@('-p:GitPadAndroidReleaseUniversal=false','-p:RuntimeIdentifier=android-x64','-p:RunAOTCompilation=false')}else{@('-p:GitPadAndroidReleaseUniversal=true')}
    $modeArguments+=if($QuickProbe){'-p:RestoreLockedMode=false'}else{'-p:RestoreLockedMode=true'}
    $protectedPassword=(Get-Content -LiteralPath ($key+'.password.dpapi') -Raw).Trim()
    $secure=ConvertTo-SecureString -String $protectedPassword
    $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $env:GITPAD_RELEASE_PASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    $env:JAVA_HOME=$JavaSdkDirectory
    $env:ANDROID_HOME=$AndroidSdkDirectory
    $publish=Join-Path $output 'publish'
    & dotnet publish apps/GitPadPlus.App/GitPadPlus.App.csproj -c Release -f net10.0-android '-p:GitPadTargetFramework=net10.0-android' "-p:GitPadPackagedRegistry=$registry" @modeArguments "-p:GitPadSourceCommit=$stamp" "-p:AndroidSdkDirectory=$AndroidSdkDirectory" "-p:JavaSdkDirectory=$JavaSdkDirectory" '-p:AndroidKeyStore=true' "-p:AndroidSigningKeyStore=$key" "-p:AndroidSigningKeyAlias=$Alias" '-p:AndroidSigningStorePass=env:GITPAD_RELEASE_PASSWORD' '-p:AndroidSigningKeyPass=env:GITPAD_RELEASE_PASSWORD' '-p:AndroidPackageFormats=apk' '-p:AndroidCreatePackagePerAbi=false' -o $publish 2>&1 | Tee-Object (Join-Path $output 'android-publish.log')
    if($LASTEXITCODE -ne 0){throw 'Signed Android publish failed'}
    $packages=@(Get-ChildItem -LiteralPath $publish -Filter '*Signed.apk' -File -Recurse)
    if($packages.Count -ne 1){throw 'Expected one signed universal APK'}
    $apk=Join-Path $output 'GitPadPlus-Android-Release.apk'
    Copy-Item -LiteralPath $packages[0].FullName -Destination $apk
    & java -jar (Join-Path $AndroidSdkDirectory "build-tools/$BuildToolsVersion/lib/apksigner.jar") verify --verbose --print-certs $apk > (Join-Path $output 'android-signature.log')
    if($LASTEXITCODE -ne 0){throw 'Release signature verification failed'}
    $signature=Get-Content -LiteralPath (Join-Path $output 'android-signature.log') -Raw
    if($signature -match 'CN=Android Debug'){throw 'Debug signing identity is not a release identity'}
    $aapt=Join-Path $AndroidSdkDirectory "build-tools/$BuildToolsVersion/aapt2.exe"
    & $aapt dump badging $apk > (Join-Path $output 'android-badging.log')
    if($LASTEXITCODE -ne 0){throw 'APK manifest inspection failed'}
    $badging=Get-Content -LiteralPath (Join-Path $output 'android-badging.log') -Raw
    if($badging -match 'application-debuggable' -or $badging -notmatch "versionName='0.1.0-alpha.1'" -or $badging -notmatch "versionCode='1'" -or $badging -notmatch "name='io.github.styayur.gitpadplus'"){throw 'APK identity, version or Release configuration mismatch'}
    & $aapt dump xmltree $apk --file AndroidManifest.xml > (Join-Path $output 'android-manifest.log')
    if($LASTEXITCODE -ne 0){throw 'APK source stamp inspection failed'}
    $fingerprint=[regex]::Match($signature,'certificate SHA-256 digest:\s*([a-f0-9]{64})',[Text.RegularExpressions.RegexOptions]::IgnoreCase).Groups[1].Value.ToLowerInvariant()
    if(!$fingerprint){throw 'Missing certificate fingerprint'}
    @{sourceCommit=$stamp;checkoutCommit=$sha;dirty=$dirty;quickProbe=[bool]$QuickProbe;packagedRegistrySha256=(Get-FileHash -LiteralPath $registry -Algorithm SHA256).Hash.ToLowerInvariant();version='0.1.0-alpha.1';configuration='Release';certificateSha256=$fingerprint;bytes=(Get-Item -LiteralPath $apk).Length;sha256=(Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant();physicalDeviceVerified=$false;scope=if($stamp -eq 'development'){'Development signed probe; not release-ready'}else{'Candidate awaiting exact APK emulator acceptance'}} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output 'android-build-info.json') -Encoding utf8
    Get-Content -LiteralPath (Join-Path $output 'android-build-info.json')
} finally {
    $env:GITPAD_RELEASE_PASSWORD=$null
    if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
    $secure=$null;$protectedPassword=$null;Pop-Location
}
