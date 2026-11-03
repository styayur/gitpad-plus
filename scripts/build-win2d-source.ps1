# SPDX-License-Identifier: AGPL-3.0-only
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$SourceRoot,
    [Parameter(Mandatory)][string]$Dotnet6Root,
    [Parameter(Mandatory)][string]$NuGetExe,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [string]$MSBuildExe='C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\MSBuild\Current\Bin\MSBuild.exe'
)
$ErrorActionPreference='Stop'
$repository=Split-Path $PSScriptRoot -Parent
$source=(Resolve-Path -LiteralPath $SourceRoot).Path
$output=[IO.Path]::GetFullPath($OutputDirectory)
if((Test-Path -LiteralPath $output) -and (Get-ChildItem -LiteralPath $output -Force)){throw 'Use a new/empty evidence output directory'}
New-Item -ItemType Directory -Force $output | Out-Null
Push-Location $source
try{
    if((& git rev-parse HEAD).Trim() -ne '2cd2e846b0b410286a88fa5cddc3bc765de8be0b'){throw 'Unpinned Win2D source'}
    if(& git status --porcelain){throw 'Win2D tracked source must be clean'}
    if((Get-Content build/nuget/VERSION -Raw).Trim() -ne '1.4.0'){throw 'Unexpected upstream version'}
    $env:DOTNET_ROOT=(Resolve-Path -LiteralPath $Dotnet6Root).Path
    $env:DOTNET_HOST_PATH=Join-Path $env:DOTNET_ROOT 'dotnet.exe'
    $env:DOTNET_MSBUILD_SDK_RESOLVER_CLI_DIR=$env:DOTNET_ROOT
    $env:MSBuildSDKsPath=Join-Path $env:DOTNET_ROOT 'sdk/6.0.428/Sdks'
    if(!(Test-Path -LiteralPath $env:MSBuildSDKsPath)){throw 'Use the SHA-512 verified portable SDK 6.0.428'}
    $nuget=(Resolve-Path -LiteralPath $NuGetExe).Path
    if((Get-FileHash $nuget -Algorithm SHA256).Hash.ToLowerInvariant() -ne '5c5b9c96165d3283b2cb9e5b65825d343e0e7139b9e70a250b4bb24c2285f3ba'){throw 'Use the reviewed NuGet CLI 5.8.0 executable'}
    $env:PATH=$env:DOTNET_ROOT+';'+(Split-Path $nuget -Parent)+';'+$env:PATH
    # Upstream's solution restores managed assets for each native platform, but
    # its master AnyCPU build then looks in an unrestored directory. Build the
    # native matrix first and the AnyCPU projection via the restored x64 path.
    foreach($nativePlatform in @('Win32','x64','ARM64')){
        & $MSBuildExe Win2D.proj /m:4 /nr:false "/p:BuildPlatforms=$nativePlatform" /p:BuildConfigurations=Release /p:BuildTests=false /p:BuildTools=false /p:BuildDocs=false /p:RunTests=false "/bl:$output/native-$nativePlatform.binlog" /v:minimal *> "$output/native-$nativePlatform.log"
        Get-Content -LiteralPath "$output/native-$nativePlatform.log" -Raw|Add-Content -LiteralPath "$output/native.log"
        if($LASTEXITCODE){throw "Native $nativePlatform source build failed; retain the log"}
    }
    & $MSBuildExe winrt/projection/winrt.projection.csproj '/t:Restore;Build' /m:2 /nr:false /p:Platform=x64 /p:Configuration=Release /p:BuildProjectReferences=false /p:IncludeVersionInfo=true /p:EnableSourceLink=false /p:EnableSourceControlManagerQueries=false /p:SourceRevisionId=2cd2e846b0b410286a88fa5cddc3bc765de8be0b "/bl:$output/projection.binlog" /v:minimal *> "$output/projection.log"
    if($LASTEXITCODE){throw 'Managed source build failed; retain the log'}
    # Azure-only SourceLink does not accept the public GitHub remote. The exact
    # source SHA remains in native/managed version stamps and package provenance.
    $compiler='C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\cl.exe'
    @{msbuild=(& $MSBuildExe -version -nologo|Select-Object -Last 1);msbuildSha256=(Get-FileHash $MSBuildExe).Hash.ToLowerInvariant();compilerVersion=(Get-Item $compiler).VersionInfo.FileVersion;compilerSha256=(Get-FileHash $compiler).Hash.ToLowerInvariant();msvc='14.44.35207';windowsSdk='10.0.19041.0';dotnetSdk='6.0.428';dotnetHostSha256=(Get-FileHash $env:DOTNET_HOST_PATH).Hash.ToLowerInvariant();nugetVersion=(Get-Item $nuget).VersionInfo.FileVersion;nugetSha256=(Get-FileHash $nuget).Hash.ToLowerInvariant()}|ConvertTo-Json|Set-Content "$output/toolchain.json" -Encoding utf8
    & node (Join-Path $repository 'scripts/package-win2d-source.mjs') $source $output $nuget
    if($LASTEXITCODE){throw 'Source package generation failed'}
}finally{Pop-Location}
