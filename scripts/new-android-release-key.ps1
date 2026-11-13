# SPDX-License-Identifier: AGPL-3.0-only
# Run only after the user's explicit one-time key/password-storage approval.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$KeystorePath,
    [Parameter(Mandatory)][string]$BackupDirectory,
    [Parameter(Mandatory)][switch]$ApprovedPermanentKeyAndPasswordStorage
)
$ErrorActionPreference='Stop'
if(!$ApprovedPermanentKeyAndPasswordStorage){throw 'Explicit user approval is required'}
$repo=[IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))+[IO.Path]::DirectorySeparatorChar
$key=[IO.Path]::GetFullPath($KeystorePath)
$backup=[IO.Path]::GetFullPath($BackupDirectory)
if($key.StartsWith($repo,[StringComparison]::OrdinalIgnoreCase) -or $backup.StartsWith($repo,[StringComparison]::OrdinalIgnoreCase)){throw 'Signing files and backups must be outside the repository'}
if(Test-Path -LiteralPath $key){throw 'Refusing to replace a permanent signing identity'}
$credentials=$key+'.password.dpapi'
if(Test-Path -LiteralPath $credentials){throw 'Existing credentials will not be overwritten'}
$directory=Split-Path $key -Parent
New-Item -ItemType Directory -Force -Path $directory,$backup | Out-Null
$identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
foreach($folder in @($directory,$backup)){
    & icacls.exe $folder '/inheritance:r' '/grant:r' ($identity+':(OI)(CI)F') 'SYSTEM:(OI)(CI)F' | Out-Null
    if($LASTEXITCODE -ne 0){throw 'Unable to restrict signing directory access'}
}
$password=[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
try {
    $secure=ConvertTo-SecureString $password -AsPlainText -Force
    $secure | ConvertFrom-SecureString | Set-Content -LiteralPath $credentials -Encoding utf8
    $env:GITPAD_KEYSTORE_PASSWORD=$password
    & keytool -genkeypair -keystore $key -storetype PKCS12 -alias gitpadplus-release -keyalg RSA -keysize 3072 -validity 36500 -dname 'CN=GitPadPlus Release, O=styayur' -storepass:env GITPAD_KEYSTORE_PASSWORD -keypass:env GITPAD_KEYSTORE_PASSWORD
    if($LASTEXITCODE -ne 0){throw 'Key generation failed; preserve partial files for inspection'}
    foreach($file in @($key,$credentials)){
        $destination=Join-Path $backup (Split-Path $file -Leaf)
        if(Test-Path -LiteralPath $destination){throw 'Existing signing backup will not be overwritten'}
        Copy-Item -LiteralPath $file -Destination $destination
        if((Get-FileHash -LiteralPath $file).Hash -ne (Get-FileHash -LiteralPath $destination).Hash){throw 'Signing backup verification failed'}
    }
    & keytool -list -v -keystore $key -alias gitpadplus-release -storepass:env GITPAD_KEYSTORE_PASSWORD
    if($LASTEXITCODE -ne 0){throw 'Signing certificate inspection failed'}
    Write-Host 'Permanent key and encrypted password backup verified. DPAPI credentials require this Windows account/profile; arrange independent password-manager/offline recovery before relying on this identity long-term.'
} finally {$env:GITPAD_KEYSTORE_PASSWORD=$null;$password=$null;$secure=$null}
