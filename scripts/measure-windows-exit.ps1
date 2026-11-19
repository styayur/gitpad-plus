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
if (Get-Process GitPadPlus.App -ErrorAction SilentlyContinue | Where-Object {!$_.HasExited}) {throw 'Close the existing GitPad+ process before measuring.'}
if (Test-Path -LiteralPath $output) {throw 'Choose a fresh measurement directory.'}
if ($output.StartsWith($vault+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {throw 'Keep diagnostics outside the test vault.'}
New-Item -ItemType Directory -Path $output | Out-Null
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ExitWindowObservation {
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
    public static long[] ClockAnchor() {
        long bestStart=0, bestEnd=0, bestUtc=0, best=long.MaxValue;
        for(int i=0;i<8;i++) {
            long start=System.Diagnostics.Stopwatch.GetTimestamp();
            long utc=DateTime.UtcNow.Ticks;
            long end=System.Diagnostics.Stopwatch.GetTimestamp();
            if(end-start<best){best=end-start;bestStart=start;bestEnd=end;bestUtc=utc;}
        }
        return new[]{bestStart+(bestEnd-bestStart)/2,bestUtc,best};
    }
}
'@
$os=Get-CimInstance Win32_OperatingSystem
$cpu=Get-CimInstance Win32_Processor
[ordered]@{
    capturedAt=[DateTimeOffset]::UtcNow
    osBuild=$os.BuildNumber
    freePhysicalKilobytes=$os.FreePhysicalMemory
    logicalProcessors=[Environment]::ProcessorCount
    processorLoadPercent=($cpu | Measure-Object -Property LoadPercentage -Average).Average
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output 'environment.json') -Encoding utf8
$results=@()
$exeHash=(Get-FileHash -LiteralPath $exe).Hash.ToLowerInvariant()
$assemblyHash=(Get-FileHash -LiteralPath (Join-Path (Split-Path -Parent $exe) 'GitPadPlus.App.dll')).Hash.ToLowerInvariant()
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
    # Correlate the monotonic native event clock with the kernel's ExitTime.
    # Poll completion can be delayed by the observer's own scheduling/GC.
    $clockAnchor=[ExitWindowObservation]::ClockAnchor()
    $anchorTimestamp=$clockAnchor[0]
    $anchorUtcTicks=$clockAnchor[1]
    $hidden=$null
    $lastVisible=$null
    while (!$process.WaitForExit(0) -and $observation.Elapsed.TotalMinutes -lt 10) {
        if (!$hidden) {
            $currentHandle=$process.MainWindowHandle
            if($currentHandle -ne [IntPtr]::Zero){$handle=$currentHandle}
            $observed=[Diagnostics.Stopwatch]::GetTimestamp()
            if ([ExitWindowObservation]::IsWindowVisible($handle)) {$lastVisible=$observed}
            elseif($null -ne $lastVisible) {$hidden=$observed}
        }
        Start-Sleep -Milliseconds 10
        $process.Refresh()
    }
    $ended=[Diagnostics.Stopwatch]::GetTimestamp()
    if (!$process.WaitForExit(0)) {throw 'The observation ended with the app still running. No process was terminated.'}
    if (!(Test-Path -LiteralPath $trace)) {throw 'Exit trace missing. Use a build with opt-in exit diagnostics.'}
    $events=@(Get-Content -LiteralPath $trace | ForEach-Object {$_ | ConvertFrom-Json})
    $close=$events | Where-Object Phase -eq 'close.requested' | Select-Object -First 1
    if (!$close.Timestamp) {throw 'The trace has no close-request timestamp.'}
    $frequency=[Diagnostics.Stopwatch]::Frequency
    $exitUtc=$process.ExitTime.ToUniversalTime()
    if($exitUtc.Year -lt 2020){throw 'Kernel exit timestamp is unavailable. Preserve the attempt without reporting a distribution.'}
    $kernelExitTimestamp=$anchorTimestamp+($exitUtc.Ticks-$anchorUtcTicks)*$frequency/[TimeSpan]::TicksPerSecond
    $clockEnd=[ExitWindowObservation]::ClockAnchor()
    $clockDriftMs=($clockEnd[1]-$anchorUtcTicks)/[TimeSpan]::TicksPerMillisecond-1000*($clockEnd[0]-$anchorTimestamp)/$frequency
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
        assemblySha256=$assemblyHash
        closeRequestToProcessExitMs=1000*($ended-$close.Timestamp)/$frequency
        kernelCloseRequestToProcessExitMs=1000*($kernelExitTimestamp-$close.Timestamp)/$frequency
        observerSchedulingLagMs=1000*($ended-$kernelExitTimestamp)/$frequency
        clockCorrelationDriftMs=$clockDriftMs
        clockAnchorUncertaintyMs=1000*($clockAnchor[2]+$clockEnd[2])/$frequency
        processExitUtc=$exitUtc
        closeRequestToWindowHiddenMs=$visibleDelay
        windowHiddenToProcessExitMs=$residual
        windowHiddenObserved=($null -ne $visibleDelay)
        windowHiddenToExitUpperBoundMs=if($null -ne $lastVisible){1000*($ended-$lastVisible)/$frequency}else{$null}
        exitCode=$process.ExitCode
        closeRequests=@($events | Where-Object Phase -eq 'close.requested').Count
        unsavedAtClose=$close.Dirty
        trace=Split-Path -Leaf $trace
    }
    $results | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $output 'samples.json') -Encoding utf8
}
$latencies=@($results.closeRequestToProcessExitMs | Sort-Object)
$kernelLatencies=@($results.kernelCloseRequestToProcessExitMs | Sort-Object)
$middle=[int][Math]::Floor($latencies.Count/2)
$median=$latencies[$middle]
if ($latencies.Count%2 -eq 0) {$median=($latencies[$middle-1]+$latencies[$middle])/2}
[ordered]@{
    scenario=$Scenario
    runs=$Runs
    medianMs=$median
    p95Ms=$latencies[[int][Math]::Ceiling($latencies.Count*.95)-1]
    maximumMs=$latencies[-1]
    kernelMedianMs=if($Runs%2){$kernelLatencies[$middle]}else{($kernelLatencies[$middle-1]+$kernelLatencies[$middle])/2}
    kernelP95Ms=$kernelLatencies[[int][Math]::Ceiling($Runs*.95)-1]
    kernelMaximumMs=$kernelLatencies[-1]
    scope='Native close event to OS process exit, sampled every 10 ms. Operator clicks X. Physical click dispatch latency and UI-thread stalls require separate observation.'
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output 'distribution.json') -Encoding utf8
