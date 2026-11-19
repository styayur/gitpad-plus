# SPDX-License-Identifier: AGPL-3.0-only
[CmdletBinding(DefaultParameterSetName='Verify')]
param(
    [Parameter(Mandatory)][string]$CandidateDirectory,
    [Parameter(ParameterSetName='Stage',Mandatory)][switch]$StageDraft,
    [Parameter(ParameterSetName='Stage',Mandatory)][switch]$ApproveTag,
    [Parameter(ParameterSetName='Publish',Mandatory)][switch]$Publish,
    [Parameter(ParameterSetName='Publish',Mandatory)][switch]$ApprovePublication
)
$ErrorActionPreference='Stop'
$repo='styayur/gitpad-plus';$version=(Get-Content (Join-Path $PSScriptRoot '../package.json') -Raw|ConvertFrom-Json).version;$tag='v'+$version
function Run([string]$Program,[string[]]$Arguments) {
    $gitRead=$Program -eq 'git' -and ($Arguments[0] -in @('ls-remote','rev-parse','status','remote','show-ref','cat-file') -or ($Arguments -join ' ') -eq 'fetch origin main --no-tags')
    $ghRead=$Program -eq 'gh' -and (($Arguments[0] -eq 'api' -and !($Arguments | Where-Object {$_ -in @('--method','-X','--field','-F','--raw-field','-f','--input')})) -or ($Arguments[0] -eq 'run' -and $Arguments[1] -eq 'list'))
    for($attempt=0;$attempt -lt 4;$attempt++){
        $startInfo=[Diagnostics.ProcessStartInfo]::new()
        $startInfo.FileName=(Get-Command $Program -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
        $startInfo.WorkingDirectory=(Get-Location).ProviderPath
        $startInfo.UseShellExecute=$false;$startInfo.CreateNoWindow=$true
        $startInfo.RedirectStandardOutput=$true;$startInfo.RedirectStandardError=$true
        foreach($argument in $Arguments){$startInfo.ArgumentList.Add($argument)}
        $startInfo.Environment['GH_DEBUG']='';$startInfo.Environment['GH_PROMPT_DISABLED']='1'
        $startInfo.Environment['GIT_TERMINAL_PROMPT']='0';$startInfo.Environment['GCM_INTERACTIVE']='Never'
        $process=[Diagnostics.Process]::new();$process.StartInfo=$startInfo
        if(!$process.Start()){throw 'Unable to start release CLI'}
        $outTask=$process.StandardOutput.ReadToEndAsync();$errTask=$process.StandardError.ReadToEndAsync()
        $process.WaitForExit();$stdout=$outTask.GetAwaiter().GetResult();$stderr=$errTask.GetAwaiter().GetResult()
        $exitCode=$process.ExitCode;$global:LASTEXITCODE=$exitCode;$process.Dispose()
        if($exitCode -eq 0){if($stdout.Length){return ($stdout.TrimEnd([char[]]"`r`n") -split '\r?\n')};return}
        $transient=$stderr -match '(?i)TLS handshake timeout|SSL/TLS connection failed|failed to receive handshake|connection.*reset|timed out|HTTP (502|503|504)|unexpected EOF'
        if(($gitRead -or $ghRead) -and $transient -and $attempt -lt 3){Write-Host "Retrying read-only $Program transport failure ($($attempt+1)/3)";continue}
        $safe=[regex]::Replace($stderr+"`n"+$stdout,'https?://[^\s"<>]+','[redacted URL]')
        $safe=[regex]::Replace($safe,'(?i)\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]+','[redacted credential]')
        if($safe.Trim()){Write-Host $safe.Substring([Math]::Max(0,$safe.Length-1600))}
        throw "$Program failed (exit $exitCode). Inspect the recorded release state before retrying."
    }
}
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    $candidate=(Resolve-Path -LiteralPath $CandidateDirectory).Path
    $acceptance=Get-Content -LiteralPath (Join-Path $candidate 'acceptance.json') -Raw | ConvertFrom-Json
    $commit=$acceptance.sourceCommit
    if($commit -notmatch '^[a-f0-9]{40}$'){throw 'Invalid candidate commit'}
    if((Run git @('rev-parse','HEAD')) -ne $commit){throw 'Checkout is not the candidate commit'}
    if(Run git @('status','--porcelain')){throw 'Commit all candidate source changes before release verification'}
    $remote=Run git @('remote','get-url','origin')
    if($remote -notmatch '^(https://github\.com/|git@github\.com:)styayur/gitpad-plus(\.git)?$'){throw 'Unexpected repository origin'}
    Run git @('fetch','origin','main','--no-tags') | Out-Host
    if((Run git @('rev-parse','origin/main')) -ne $commit){throw 'GitHub main does not match the candidate'}
    $runs=Run gh @('run','list','--repo',$repo,'--workflow','ci.yml','--commit',$commit,'--limit','20','--json','headSha,conclusion,status,url') | ConvertFrom-Json
    $ci=$runs | Where-Object {$_.headSha -eq $commit -and $_.status -eq 'completed' -and $_.conclusion -eq 'success'} | Select-Object -First 1
    if(!$ci){throw 'No successful corresponding GitHub CI run'}
    $env:SOURCE_COMMIT=$commit
    Run node @('scripts/release-gate.mjs',$candidate) | Out-Host
    $manifestHash=(Get-FileHash -LiteralPath (Join-Path $candidate 'SHA256SUMS.txt') -Algorithm SHA256).Hash.ToLowerInvariant()
    $assetNames=@($acceptance.files.path)+@('acceptance.json','SHA256SUMS.txt')
    if($assetNames | Where-Object {$_ -match '[/\\]'}){throw 'Use flat release asset names; GitHub assets cannot preserve subdirectories'}
    $existingJson=Run gh @('api',"repos/$repo/releases",'--paginate','--jq',('.[] | select(.tag_name=="'+$tag+'") | @json'))
    $release=if($existingJson){$existingJson | ConvertFrom-Json}else{$null}
    $statePath=$candidate+'.publish-state.json'
    $state=if(Test-Path -LiteralPath $statePath){Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json}else{$null}
    function Verify-Download($Release) {
        $assets=Run gh @('api',"repos/$repo/releases/$($Release.id)/assets",'--paginate','--jq','.[].name')
        if(@(Compare-Object ($assetNames | Sort-Object) (@($assets) | Sort-Object)).Count){throw 'Unexpected/missing uploaded release assets'}
        $download=$candidate+'.download-'+[guid]::NewGuid().ToString('N')
        New-Item -ItemType Directory -Path $download | Out-Null
        Run gh @('release','download',$tag,'--repo',$repo,'--dir',$download) | Out-Host
        Run node @('scripts/release-gate.mjs',$download) | Out-Host
        if((Get-FileHash -LiteralPath (Join-Path $download 'SHA256SUMS.txt') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifestHash){throw 'Downloaded manifest differs from accepted local manifest'}
        foreach($name in $assetNames){
            if((Get-FileHash -LiteralPath (Join-Path $download $name) -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath (Join-Path $candidate $name) -Algorithm SHA256).Hash){throw "Uploaded/downloaded asset mismatch: $name"}
        }
        Write-Host "Re-download independently verified in $download"
    }
    Write-Host "Accepted commit: $commit; CI: $($ci.url); Android: emulator only; physical device NOT verified."
    foreach($name in @('GitPadPlus-Windows-x64.zip','GitPadPlus-Android-Release.apk')){
        $file=Get-Item -LiteralPath (Join-Path $candidate $name)
        Write-Host "$name : $($file.Length) bytes, SHA-256 $((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant())"
    }
    Write-Host "Android certificate SHA-256: $($acceptance.android.certificateSha256)"
    if($Publish){
        if(!$ApprovePublication){throw 'Explicit final publication approval is required'}
        if(!$release -or !$release.draft -or !$release.prerelease -or !$state -or $state.releaseId -ne $release.id -or $state.sourceCommit -ne $commit -or $state.manifestSha256 -ne $manifestHash){throw 'No matching verified draft created by this process'}
        Verify-Download $release
        $remoteTag=Run git @('ls-remote','origin',"refs/tags/$tag^{}")
        if(($remoteTag -split '\s+')[0] -ne $commit){throw 'Remote annotated tag points at the wrong commit'}
        Run gh @('release','edit',$tag,'--repo',$repo,'--draft=false','--prerelease') | Out-Host
        $public=Run gh @('api',"repos/$repo/releases/$($release.id)") | ConvertFrom-Json
        if($public.draft -or !$public.prerelease -or $public.tag_name -ne $tag){throw 'Public pre-release metadata verification failed'}
        Verify-Download $public
        Write-Host "Public pre-release verified: $($public.html_url)"
        return
    }
    if(!$StageDraft){Write-Host 'Verification complete. No tag or release was created.';return}
    if(!$ApproveTag){throw 'Explicit annotated-tag approval is required'}
    if($release){
        if(!$release.draft -or !$state -or $state.releaseId -ne $release.id -or $state.sourceCommit -ne $commit -or $state.manifestSha256 -ne $manifestHash){throw 'Existing release will not be overwritten'}
        # An interrupted upload may be resumed only for the exact recorded draft.
    } else {
        $tags=Run git @('ls-remote','--tags','origin',"refs/tags/$tag","refs/tags/$tag^{}")
        $owned=$state -and $state.sourceCommit -eq $commit -and $state.tag -eq $tag -and $state.manifestSha256 -eq $manifestHash
        if($tags -and !$owned){throw 'Existing remote tag will not be replaced'}
        & git show-ref --verify --quiet "refs/tags/$tag"
        $localExists=$LASTEXITCODE -eq 0
        if($LASTEXITCODE -notin @(0,1)){throw 'Unable to inspect local tags'}
        if($localExists -and !$owned){throw 'Existing local tag will not be replaced'}
        if(!$owned){
            # Persist ownership before the first irreversible remote action, so a
            # failed push/draft creation can resume without replacing any tag.
            @{releaseId=$null;sourceCommit=$commit;tag=$tag;manifestSha256=$manifestHash} | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding utf8
        }
        if(!$localExists){Run git @('tag','-a',$tag,$commit,'-m',"GitPad+ $tag verified early alpha") | Out-Host}
        if((Run git @('rev-parse',"refs/tags/$tag^{}")) -ne $commit -or (Run git @('cat-file','-t',"refs/tags/$tag")) -ne 'tag'){throw 'Recorded tag must be annotated and target the accepted commit'}
        if(!$tags){Run git @('push','origin',"refs/tags/$tag") | Out-Host}
        $remoteTag=Run git @('ls-remote','origin',"refs/tags/$tag^{}")
        if(($remoteTag -split '\s+')[0] -ne $commit){throw 'Remote annotated tag points at the wrong commit'}
        Run gh @('release','create',$tag,'--repo',$repo,'--verify-tag','--draft','--prerelease','--title',"GitPad+ $tag — Early Alpha",'--notes-file',(Join-Path $candidate 'RELEASE_NOTES.md')) | Out-Host
        $release=Run gh @('api',"repos/$repo/releases",'--jq',('.[] | select(.tag_name=="'+$tag+'")')) | ConvertFrom-Json
        @{releaseId=$release.id;sourceCommit=$commit;tag=$tag;manifestSha256=$manifestHash} | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding utf8
    }
    $uploaded=@(Run gh @('api',"repos/$repo/releases/$($release.id)/assets",'--paginate','--jq','.[].name'))
    $missing=@($assetNames | Where-Object {$_ -notin $uploaded})
    if($missing.Count){
        $uploadArguments=@('release','upload',$tag,'--repo',$repo)+@($missing | ForEach-Object {Join-Path $candidate $_})
        Run gh $uploadArguments | Out-Host
    }
    Verify-Download $release
    Write-Host 'Verified DRAFT retained. Authorized publication uses -Publish -ApprovePublication.'
} finally {Pop-Location}
