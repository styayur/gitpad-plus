# SPDX-License-Identifier: AGPL-3.0-only
# Run after refresh-dotnet.ps1 -Scope all (locked by default).
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
if(!$IsWindows){throw 'Native dependency preflight requires Windows'}
$root=Split-Path $PSScriptRoot -Parent
$previousTarget=$env:GitPadTargetFramework
$previousUniversal=$env:GitPadAndroidReleaseUniversal
Push-Location $root
function Checked([string]$Program,[string[]]$Arguments){& $Program @Arguments;if($LASTEXITCODE){throw "Native dependency command failed: $Program"}}
try {
    New-Item -ItemType Directory -Force artifacts/restore-assets|Out-Null
    pnpm audit --json > artifacts/npm-audit.json
    if($LASTEXITCODE){throw 'Raw npm audit did not pass'}
    foreach($target in @(@{name='windows';framework='net10.0-windows10.0.19041.0';args=@('-p:RuntimeIdentifier=win-x64')},@{name='android';framework='net10.0-android';args=@('-p:GitPadAndroidReleaseUniversal=true','-p:Configuration=Release')})){
        $env:GitPadTargetFramework=$target.framework
        $env:GitPadAndroidReleaseUniversal=if($target.name -eq 'android'){'true'}else{$null}
        Checked dotnet (@('restore','apps/GitPadPlus.App',"-p:GitPadTargetFramework=$($target.framework)",'--locked-mode')+$target.args)
        $assets=Get-Content apps/GitPadPlus.App/obj/project.assets.json -Raw|ConvertFrom-Json
        $aliases=@($assets.project.restore.originalTargetFrameworks)
        if($aliases.Count -ne 1 -or $aliases[0] -ne $target.framework){throw 'Actual restored framework differs from requested native scope'}
        Copy-Item -LiteralPath apps/GitPadPlus.App/obj/project.assets.json -Destination "artifacts/restore-assets/$($target.name)-app.json"
        # NuGet list selects the original project alias, not the lock-file spelling.
        $query=@('list','apps/GitPadPlus.App','package','--no-restore','--include-transitive','--framework',$aliases[0],'--format','json')
        & dotnet @query --vulnerable > "artifacts/$($target.name)-nuget-audit.json"
        if($LASTEXITCODE){throw "$($target.name) audit query failed; inspect retained raw JSON"}
        & dotnet @query > "artifacts/$($target.name)-nuget-audit.inventory.json"
        if($LASTEXITCODE){throw "$($target.name) inventory query failed; inspect retained raw JSON"}
    }
    $env:GitPadTargetFramework=$null;$env:GitPadAndroidReleaseUniversal=$null
    & node scripts/security-gate.mjs artifacts/windows-nuget-audit.json artifacts/android-nuget-audit.json > artifacts/native-security-gate.log
    if($LASTEXITCODE){throw 'Installed native dependency security gate failed'}
    $pins=(Get-Content eng/toolchain.json -Raw|ConvertFrom-Json).nativeRuntimePins
    $queries=@('Microsoft.Graphics.Win2D@1.4.0',"Microsoft.NETCore.App.Runtime.win-x64@$($pins.windowsRuntimeVersion)","Microsoft.NETCore.App.Runtime.Mono.android-arm64@$($pins.androidMonoRuntimeVersion)","Microsoft.NETCore.App.Runtime.Mono.android-x64@$($pins.androidMonoRuntimeVersion)")
    $records=@()
    foreach($query in $queries){
        $raw=gh api --method GET /advisories -f ecosystem=nuget -f "affects=$query"
        if($LASTEXITCODE){throw 'Native upstream advisory query failed'}
        $found=@($raw|ConvertFrom-Json -NoEnumerate)
        if($found.Count -ne 1 -or $found[0] -isnot [array]){throw 'Malformed native advisory response'}
        $advisories=$found[0]
        $records+=@{package=$query;advisories=$advisories}
        if($advisories.Count){throw "Review native upstream advisory: $query"}
    }
    $records|ConvertTo-Json -Depth 30|Set-Content artifacts/native-upstream-advisories.json -Encoding utf8
    # Workload installers can omit NuGet metadata from the installed pack. Fetch
    # the same exact official packages into the normal verified NuGet cache;
    # native-license-inventory binds their binary payloads to installed packs.
    # This disposable metadata project is separate from every locked app graph.
    $metadataRoot=Join-Path ([IO.Path]::GetTempPath()) ('gitpad-runtime-metadata-'+[guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $metadataRoot|Out-Null
    $items=@()
    foreach($abi in @('android-arm64','android-x64')){
        $items+="<PackageDownload Include=`"Microsoft.NETCore.App.Runtime.Mono.$abi`" Version=`"[$($pins.androidMonoRuntimeVersion)]`" />"
        $items+="<PackageDownload Include=`"Microsoft.Android.Runtime.Mono.36.$abi`" Version=`"[$($pins.androidRuntimeGlueVersion)]`" />"
    }
    $metadataProject=Join-Path $metadataRoot 'RuntimeMetadata.csproj'
    [IO.File]::WriteAllText($metadataProject,('<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework><RestorePackagesWithLockFile>true</RestorePackagesWithLockFile></PropertyGroup><ItemGroup>'+($items -join '')+'</ItemGroup></Project>'))
    Checked dotnet @('restore',$metadataProject,'--source','https://api.nuget.org/v3/index.json','--packages',$env:NUGET_PACKAGES,'--use-lock-file')
    Checked dotnet @('restore',$metadataProject,'--source','https://api.nuget.org/v3/index.json','--packages',$env:NUGET_PACKAGES,'--locked-mode')
    New-Item -ItemType Directory -Force artifacts/workload-package-metadata|Out-Null
    Copy-Item -LiteralPath $metadataProject,(Join-Path $metadataRoot 'packages.lock.json') -Destination artifacts/workload-package-metadata/
    Checked node @('scripts/licenses.mjs')
    Checked node @('scripts/native-license-inventory.mjs','artifacts/restore-assets/windows-app.json','artifacts/restore-assets/android-app.json')
    Checked node @('scripts/bundle-notices.mjs')
} finally {$env:GitPadTargetFramework=$previousTarget;$env:GitPadAndroidReleaseUniversal=$previousUniversal;Pop-Location}
