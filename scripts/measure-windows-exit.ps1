# SPDX-License-Identifier: AGPL-3.0-only
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Executable,
    [Parameter(Mandatory)][string]$VaultPath,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [string]$Scenario='empty',
    [ValidateRange(3,30)][int]$Runs=5
)
$ErrorActionPreference='Stop'
$exe=(Resolve-Path -LiteralPath $Executable).Path
$output=[IO.Path]::GetFullPath($OutputDirectory)
$vault=[IO.Path]::GetFullPath($VaultPath)
if (Get-Process GitPadPlus.App -ErrorAction SilentlyContinue) {throw 'Close the existing GitPad+ process before measuring.'}
if (Test-Path -LiteralPath $output) {throw 'Choose a fresh measurement directory.'}
if ($output.StartsWith($vault+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {throw 'Keep diagnostics outside the test vault.'}
New-Item -ItemType Directory -Path $output | Out-Null
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ExitWindowObservation {
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
}
'@
$results=@()
$exeHash=(Get-FileHash -LiteralPath $exe).Hash.ToLowerInvariant()
foreach ($run in 1..$Runs) {
    $trace=Join-Path $output "trace-$run.jsonl"
    $previousVault=$env:GITPAD_ACCEPTANCE_VAULT
    $previousTrace=$env:GITPAD_EXIT_TRACE
    try {
        $env:GITPAD_ACCEPTANCE_VAULT=$vault
        $env:GITPAD_EXIT_TRACE=$trace
        $process=Start-Process -FilePath $exe -WorkingDirectory (Split-Path -Parent $exe) -PassThru
    } finally {
        $env:GITPAD_ACCEPTANCE_VAULT=$previousVault
        $env:GITPAD_EXIT_TRACE=$previousTrace
    }
    $startup=[Diagnostics.Stopwatch]::StartNew()
    while (!$process.HasExited -and !$process.MainWindowHandle -and $startup.Elapsed.TotalSeconds -lt 60) {
        Start-Sleep -Milliseconds 20
        $process.Refresh()
    }
    if ($process.HasExited -or !$process.MainWindowHandle) {throw 'Native window did not appear. Preserve this failed attempt.'}
    $handle=$process.MainWindowHandle
    Write-Host "Run $run of $Runs. Prepare the $Scenario scenario, then close the native window using its X button."
    $observation=[Diagnostics.Stopwatch]::StartNew()
    $hidden=$null
    while (!$process.HasExited -and $observation.Elapsed.TotalMinutes -lt 10) {
        if (!$hidden -and ![ExitWindowObservation]::IsWindowVisible($handle)) {$hidden=[Diagnostics.Stopwatch]::GetTimestamp()}
        Start-Sleep -Milliseconds 10
        $process.Refresh()
    }
    $ended=[Diagnostics.Stopwatch]::GetTimestamp()
    if (!$process.HasExited) {throw 'The observation ended with the app still running. No process was terminated.'}
    if (!(Test-Path -LiteralPath $trace)) {throw 'Exit trace missing. Use a build with opt-in exit diagnostics.'}
    $events=@(Get-Content -LiteralPath $trace | ForEach-Object {$_ | ConvertFrom-Json})
    $close=$events | Where-Object Phase -eq 'close.requested' | Select-Object -First 1
    if (!$close.Timestamp) {throw 'The trace has no close-request timestamp.'}
    $frequency=[Diagnostics.Stopwatch]::Frequency
    $visibleDelay=$null
    $residual=$null
    if ($hidden -and $hidden -ge $close.Timestamp) {
        $visibleDelay=1000*($hidden-$close.Timestamp)/$frequency
        $residual=1000*($ended-$hidden)/$frequency
    }
    $results+= [ordered]@{
        run=$run
        scenario=$Scenario
        executableSha256=$exeHash
        closeRequestToProcessExitMs=1000*($ended-$close.Timestamp)/$frequency
        closeRequestToWindowHiddenMs=$visibleDelay
        windowHiddenToProcessExitMs=$residual
        windowHiddenObserved=($null -ne $visibleDelay)
        closeRequests=@($events | Where-Object Phase -eq 'close.requested').Count
        unsavedAtClose=$close.Dirty
        trace=Split-Path -Leaf $trace
    }
    $results | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $output 'samples.json') -Encoding utf8
}
$latencies=@($results.closeRequestToProcessExitMs | Sort-Object)
$middle=[int][Math]::Floor($latencies.Count/2)
$median=$latencies[$middle]
if ($latencies.Count%2 -eq 0) {$median=($latencies[$middle-1]+$latencies[$middle])/2}
[ordered]@{
    scenario=$Scenario
    runs=$Runs
    medianMs=$median
    p95Ms=$latencies[[int][Math]::Ceiling($latencies.Count*.95)-1]
    maximumMs=$latencies[-1]
    scope='Native close event to OS process exit, sampled every 10 ms. Operator clicks X. Physical click dispatch latency and UI-thread stalls require separate observation.'
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output 'distribution.json') -Encoding utf8
