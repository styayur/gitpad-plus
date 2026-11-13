# SPDX-License-Identifier: AGPL-3.0-only
[CmdletBinding()]
param([Parameter(Mandatory)][string]$ExecutablePath,[string]$PreviousExecutablePath)
$ErrorActionPreference='Stop'
$exe=(Resolve-Path -LiteralPath $ExecutablePath).Path
if([IO.Path]::GetFileName($exe) -ne 'GitPadPlus.App.exe'){throw 'Select the extracted GitPad+ executable'}
$key='HKCU:\Software\Classes\gitpadplus'
$command='"'+$exe+'" "%1"'
if(Test-Path -LiteralPath $key){
    $existing=(Get-Item -LiteralPath ($key+'\shell\open\command') -ErrorAction SilentlyContinue).GetValue('')
    if($existing -ne $command){
        if($PreviousExecutablePath){
            $previous=(Resolve-Path -LiteralPath $PreviousExecutablePath).Path
            if($existing -eq ('"'+$previous+'" "%1"')){Set-Item -LiteralPath ($key+'\shell\open\command') -Value $command;Write-Output "Migrated the explicitly identified previous GitPad+ registration to $exe";return}
        }
        throw 'An existing protocol registration targets a different executable. It was not changed.'
    }
    Write-Output 'This exact executable is already registered.';return
}
New-Item -Path ($key+'\shell\open\command') -Force | Out-Null
Set-Item -LiteralPath $key -Value 'URL:GitPad+ local note link'
New-ItemProperty -LiteralPath $key -Name 'URL Protocol' -Value '' -PropertyType String | Out-Null
Set-Item -LiteralPath ($key+'\shell\open\command') -Value $command
Write-Output "Registered gitpadplus:// for the current user: $exe"
