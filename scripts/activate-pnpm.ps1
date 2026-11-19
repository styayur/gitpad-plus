# SPDX-License-Identifier: AGPL-3.0-only
$ErrorActionPreference='Stop'
$temporary=if($env:RUNNER_TEMP){$env:RUNNER_TEMP}else{[IO.Path]::GetTempPath()}
$toolsRoot=Join-Path $temporary 'gitpad-pnpm-tools-0.34.6'
$cacheRoot=Join-Path $temporary 'gitpad-npm-bootstrap-cache'
$env:COREPACK_HOME=Join-Path $temporary 'gitpad-corepack-cache'
& npm install --prefix $toolsRoot --cache $cacheRoot --fetch-retries=1 --fetch-timeout=30000 --no-audit --no-fund corepack@0.34.6
if($LASTEXITCODE){throw 'Isolated Corepack installation failed'}
$bin=Join-Path $toolsRoot 'node_modules/.bin'
$env:PATH="$bin;$env:PATH"
& corepack enable --install-directory $bin
if($LASTEXITCODE){throw 'Isolated package-manager shim activation failed'}
& corepack install --global pnpm@12.16.1
if($LASTEXITCODE){throw 'Pinned pnpm activation failed'}
if((& corepack --version).Trim() -ne '0.34.6' -or $LASTEXITCODE){throw 'Corepack version differs'}
if((& pnpm --version).Trim() -ne '12.16.1' -or $LASTEXITCODE){throw 'pnpm version differs'}
if($env:GITHUB_PATH){$bin >> $env:GITHUB_PATH}
if($env:GITHUB_ENV){"COREPACK_HOME=$env:COREPACK_HOME" >> $env:GITHUB_ENV}
