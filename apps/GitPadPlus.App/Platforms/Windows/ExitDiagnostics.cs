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
}

internal sealed record ExitMeasurement(string Phase, double ElapsedMs, int Thread, bool? Dirty, long Timestamp);

[JsonSerializable(typeof(ExitMeasurement))]
internal partial class ExitJsonContext : JsonSerializerContext;
