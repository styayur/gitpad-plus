// SPDX-License-Identifier: AGPL-3.0-only
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace GitPadPlus.App;

// Opt-in measurements contain phase names and timings only. Buffering avoids
// filesystem work on the UI thread while the window is closing.
internal static class ExitDiagnostics
{
    private static readonly string? destination = Environment.GetEnvironmentVariable("GITPAD_EXIT_TRACE");
    private static readonly ConcurrentQueue<ExitMeasurement> events = new();
    private static readonly long started = Stopwatch.GetTimestamp();

    static ExitDiagnostics()
    {
        if (string.IsNullOrWhiteSpace(destination)) return;
        AppDomain.CurrentDomain.ProcessExit += (_, _) =>
        {
            Record("process.exit");
            try
            {
                File.WriteAllLines(destination, events.Select(entry => JsonSerializer.Serialize(entry, ExitJsonContext.Default.ExitMeasurement)));
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
            {
                // Diagnostic output must not prevent application shutdown.
            }
        };
    }

    internal static void Record(string phase, bool? dirty = null)
    {
        if (string.IsNullOrWhiteSpace(destination)) return;
        events.Enqueue(new ExitMeasurement(phase, Stopwatch.GetElapsedTime(started).TotalMilliseconds,
            Environment.CurrentManagedThreadId, dirty, Stopwatch.GetTimestamp()));
    }

    internal static Action ObserveDispatcher(Microsoft.UI.Dispatching.DispatcherQueue dispatcher)
    {
        if (string.IsNullOrWhiteSpace(destination)) return () => { };
        var stopped = 0;
        var pending = 0;
        var count = 0;
        var maximum = 0d;
        // Only one outstanding probe. Work stays bounded even during a stall.
        var timer = new Timer(_ =>
        {
            if (Volatile.Read(ref stopped) != 0 || Interlocked.Exchange(ref pending, 1) != 0) return;
            var queued = Stopwatch.GetTimestamp();
            if (!dispatcher.TryEnqueue(() =>
            {
                if (Volatile.Read(ref stopped) == 0)
                {
                    maximum = Math.Max(maximum, Stopwatch.GetElapsedTime(queued).TotalMilliseconds);
                    count++;
                }
                Volatile.Write(ref pending, 0);
            })) Volatile.Write(ref pending, 0);
        }, null, 100, 100);
        return () =>
        {
            if (Interlocked.Exchange(ref stopped, 1) != 0) return;
            timer.Dispose();
            events.Enqueue(new ExitMeasurement("dispatcher.summary", Stopwatch.GetElapsedTime(started).TotalMilliseconds,
                Environment.CurrentManagedThreadId, null, Stopwatch.GetTimestamp(), maximum, count));
        };
    }
}

internal sealed record ExitMeasurement(string Phase, double ElapsedMs, int Thread, bool? Dirty, long Timestamp,
    double? MaximumDispatchDelayMs = null, int? DispatchSamples = null);

[JsonSerializable(typeof(ExitMeasurement))]
internal partial class ExitJsonContext : JsonSerializerContext;
