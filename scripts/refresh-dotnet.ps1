# SPDX-License-Identifier: AGPL-3.0-only
[CmdletBinding()]
param(
    [ValidateSet('portable','windows','android','all')][string]$Scope='all',
    [switch]$Refresh,
    [switch]$InstallWorkloads
)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
function Run-Dotnet([string[]]$Arguments) {
    & dotnet @Arguments
    if($LASTEXITCODE){throw "dotnet failed: $($Arguments -join ' ')"}
}
try {
    $pins=Get-Content global.json -Raw|ConvertFrom-Json
    $nativePins=Get-Content eng/toolchain.json -Raw|ConvertFrom-Json
    if((& dotnet --version).Trim() -ne $pins.sdk.version){throw 'Use the exact SDK pinned in global.json'}
    if($pins.sdk.version -notmatch '^11\.' -or $nativePins.workloadSetVersion -notmatch '^11\.') {throw 'This compatibility branch requires .NET/MAUI 11'}
    if($InstallWorkloads){
        $workloads=@()
        if($Scope -in @('windows','all')){$workloads+='maui-windows'}
        if($Scope -in @('android','all')){$workloads+='maui-android'}
        if($workloads.Count){Run-Dotnet (@('workload','install')+$workloads+@('--version',$nativePins.workloadSetVersion))}
    }
    $targets=@()
    if($Scope -in @('portable','all')){
        foreach($path in @('src/GitPadPlus.Core','tests/dotnet','apps/GitPadPlus.DevHost','tools/GitPadPlus.Benchmarks','tools/GitPadPlus.FaultProbe','tests/windows/Win2D.NativeProbe')){
            $targets+=,@($path)
        }
    }
    if($Scope -in @('windows','all')){
        if(!$IsWindows){throw 'Windows platform lock refresh requires a Windows runner'}
        $targets+=,@('apps/GitPadPlus.App','-p:GitPadTargetFramework=net11.0-windows10.0.19041.0','-p:RuntimeIdentifier=win-x64','-p:WindowsPackageType=None')
        $targets+=,@('tests/windows/Win2D.ManagedProbe')
    }
    if($Scope -in @('android','all')){
        $targets+=,@('apps/GitPadPlus.App','-p:GitPadTargetFramework=net11.0-android','-p:GitPadAndroidReleaseUniversal=true','-p:Configuration=Release')
    }
    foreach($target in $targets){
        if($Refresh){Run-Dotnet (@('restore')+$target+@('--force-evaluate','-p:RestoreLockedMode=false'))}
        Run-Dotnet (@('restore')+$target+@('--locked-mode'))
        if($target[0] -eq 'apps/GitPadPlus.App'){
            $label=if($target -contains '-p:GitPadTargetFramework=net11.0-android'){'android-app'}else{'windows-app'}
            New-Item -ItemType Directory -Force artifacts/restore-assets|Out-Null
            Copy-Item -LiteralPath apps/GitPadPlus.App/obj/project.assets.json -Destination "artifacts/restore-assets/$label.json"
        }
    }
    Write-Output "Verified $($targets.Count) restore graphs ($Scope); SDK $($pins.sdk.version), workload $($nativePins.workloadSetVersion)."
} finally {Pop-Location}
