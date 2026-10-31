# SPDX-License-Identifier: AGPL-3.0-only
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$KeystorePath,
    [Parameter(Mandatory)][string]$AndroidSdkDirectory,
    [Parameter(Mandatory)][string]$JavaSdkDirectory,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [string]$FixtureDirectory
)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$output=[IO.Path]::GetFullPath($OutputDirectory)
if(Test-Path -LiteralPath $output){if(Get-ChildItem -LiteralPath $output -Force){throw 'Instrumentation output must be new/empty'}}
New-Item -ItemType Directory -Force -Path $output,(Join-Path $output 'classes'),(Join-Path $output 'dex'),(Join-Path $output 'assets')|Out-Null
$tools=Join-Path $AndroidSdkDirectory 'build-tools/36.0.0'
$androidJar=Join-Path $AndroidSdkDirectory 'platforms/android-36/android.jar'
$key=(Resolve-Path -LiteralPath $KeystorePath).Path
if($key.StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Permanent identity must be outside source repository'}
$pointer=[IntPtr]::Zero
function Invoke-Checked([string]$Program,[string[]]$Arguments){& $Program @Arguments;if($LASTEXITCODE -ne 0){throw "Instrumentation tool failed: $Program"}}
try{
    $env:JAVA_HOME=$JavaSdkDirectory
    Copy-Item -LiteralPath (Join-Path $root 'tests/android/scenario.js') -Destination (Join-Path $output 'assets/scenario.js')
    if($FixtureDirectory){
        $fixture=(Resolve-Path -LiteralPath $FixtureDirectory).Path
        $notes=@(Get-ChildItem -LiteralPath (Join-Path $fixture 'Journal') -Filter '*.md' -File)
        if($notes.Count -ne 1000){throw 'Performance input must be the generated 1000-note benchmark fixture'}
        $journal=Join-Path $output 'assets/fixture/Journal';$anchors=Join-Path $output 'assets/fixture/anchors'
        New-Item -ItemType Directory -Force -Path $journal,$anchors|Out-Null
        foreach($note in $notes){
            if($note.BaseName -notmatch '^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' -or (Get-Content -LiteralPath $note.FullName -Raw) -notmatch '(?m)^title: Benchmark [0-9]+\r?$'){throw 'Only generated Benchmark source pairs may be embedded in the test APK'}
            Copy-Item -LiteralPath $note.FullName -Destination $journal
            Copy-Item -LiteralPath (Join-Path $fixture ('.gitpad/anchors/'+$note.BaseName+'.json')) -Destination $anchors
        }
        $large=$notes|Sort-Object Length -Descending|Select-Object -First 1
        @{scope='Generated benchmark source-pair fixtures, not user data or application create-throughput measurement';notes=1000;longDocumentId=$large.BaseName}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $output 'assets/fixture-info.json') -Encoding utf8NoBOM
    }
    Invoke-Checked (Join-Path $JavaSdkDirectory 'bin/javac.exe') @('--release','17','-classpath',$androidJar,'-d',(Join-Path $output 'classes'),(Join-Path $root 'tests/android/AcceptanceInstrumentation.java'))
    Invoke-Checked (Join-Path $JavaSdkDirectory 'bin/jar.exe') @('cf',(Join-Path $output 'classes.jar'),'-C',(Join-Path $output 'classes'),'.')
    Invoke-Checked (Join-Path $tools 'd8.bat') @('--lib',$androidJar,'--min-api','26','--output',(Join-Path $output 'dex'),(Join-Path $output 'classes.jar'))
    Invoke-Checked (Join-Path $tools 'aapt2.exe') @('link','-I',$androidJar,'--manifest',(Join-Path $root 'tests/android/AndroidManifest.xml'),'-o',(Join-Path $output 'unsigned.apk'))
    # jar normalizes nested asset names to '/' on Windows. aapt2 -A can emit
    # backslash names that AssetManager cannot enumerate as directories.
    Invoke-Checked (Join-Path $JavaSdkDirectory 'bin/jar.exe') @('uf',(Join-Path $output 'unsigned.apk'),'-C',$output,'assets','-C',(Join-Path $output 'dex'),'classes.dex')
    Invoke-Checked (Join-Path $tools 'zipalign.exe') @('-f','4',(Join-Path $output 'unsigned.apk'),(Join-Path $output 'aligned.apk'))
    $secure=ConvertTo-SecureString -String ((Get-Content -LiteralPath ($key+'.password.dpapi') -Raw).Trim())
    $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $env:GITPAD_TEST_SIGNING_PASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    Invoke-Checked (Join-Path $JavaSdkDirectory 'bin/java.exe') @('-jar',(Join-Path $tools 'lib/apksigner.jar'),'sign','--ks',$key,'--ks-key-alias','gitpadplus-release','--ks-pass','env:GITPAD_TEST_SIGNING_PASSWORD','--key-pass','env:GITPAD_TEST_SIGNING_PASSWORD','--out',(Join-Path $output 'GitPadPlus-Acceptance-Tests.apk'),(Join-Path $output 'aligned.apk'))
    Invoke-Checked (Join-Path $JavaSdkDirectory 'bin/java.exe') @('-jar',(Join-Path $tools 'lib/apksigner.jar'),'verify','--verbose','--print-certs',(Join-Path $output 'GitPadPlus-Acceptance-Tests.apk'))
    Write-Output 'Test-only instrumentation APK built; never distribute it as a product release asset.'
}finally{
    $env:GITPAD_TEST_SIGNING_PASSWORD=$null
    if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
    $secure=$null
}
