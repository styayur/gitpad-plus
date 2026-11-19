# SPDX-License-Identifier: AGPL-3.0-only
[CmdletBinding()]
param([Parameter(Mandatory)][string]$InstalledFile,[Parameter(Mandatory)][string]$ReferenceFile,[Parameter(Mandatory)][string]$OutputFile)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security.Cryptography.Pkcs
Add-Type -AssemblyName System.IO.Compression
function Entry-Bytes([string]$File,[string]$Name){
    $zip=[IO.Compression.ZipFile]::OpenRead($File)
    try {
        $entry=$zip.GetEntry($Name)
        if(!$entry){throw 'Required Microsoft JAR signature entry missing'}
        $stream=$entry.Open();$memory=[IO.MemoryStream]::new()
        try {$stream.CopyTo($memory);return ,$memory.ToArray()} finally {$stream.Dispose();$memory.Dispose()}
    } finally {$zip.Dispose()}
}
function Inspect([string]$File){
    $signature=[Security.Cryptography.Pkcs.SignedCms]::new([Security.Cryptography.Pkcs.ContentInfo]::new((Entry-Bytes $File 'META-INF/MSFTSIG.SF')),$true)
    $signature.Decode((Entry-Bytes $File 'META-INF/MSFTSIG.RSA'))
    if($signature.SignerInfos.Count -ne 1){throw 'Expected one Microsoft JAR signer'}
    # false requires both cryptographic signature and certificate trust validation.
    $signature.CheckSignature($false)
    $cert=$signature.SignerInfos[0].Certificate
    if($cert.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName,$false) -ne 'Microsoft Corporation' -or $cert.Subject -notmatch '(^|, )O=Microsoft Corporation(,|$)'){throw 'Unexpected JAR publisher'}
    return @{sha256=(Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant();signatureValid=$true;chainTrusted=$true;subject=$cert.Subject;issuer=$cert.Issuer;certificateSha256=[Convert]::ToHexStringLower([Security.Cryptography.SHA256]::HashData($cert.RawData))}
}
$installed=Inspect $InstalledFile;$reference=Inspect $ReferenceFile
if($installed.certificateSha256 -ne $reference.certificateSha256){throw 'Installed and official reference JAR signer identities differ'}
@{passed=$true;installed=$installed;reference=$reference;scope='Both CMS signatures verify over the same byte-checked SF content, with trusted chains and the exact same Microsoft Java signer. Caller independently checks every non-signature-block archive entry.'}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $OutputFile -Encoding utf8
Write-Output 'Trusted matching Microsoft JAR signatures verified.'
