// SPDX-License-Identifier: AGPL-3.0-only
using System.Diagnostics;
using System.Text.Json;
using GitPadPlus.Core;

// Measures portable storage, not native application startup or mobile input latency.
var temp = Path.Combine(Path.GetTempPath(), "gitpad-benchmark-" + Guid.NewGuid().ToString("N"));
var output = Path.GetFullPath(args.FirstOrDefault() ?? "artifacts/storage-benchmark.json");
try
{
    var watch = Stopwatch.StartNew();
    var store = new VaultStore(Path.Combine(temp, "Vault"));
    var openMs = watch.Elapsed.TotalMilliseconds;
    watch.Restart();
    for (var index = 0; index < 1000; index++) store.Create("2026-10-31", "Benchmark " + index);
    var create1000Ms = watch.Elapsed.TotalMilliseconds;
    watch.Restart(); var calendar = store.List("2026-10-31"); var calendarMs = watch.Elapsed.TotalMilliseconds;
    if (calendar.Length != 1000) throw new Exception("Lost document during calendar benchmark");
    watch.Restart(); var search = store.List(search: "Benchmark"); var searchMs = watch.Elapsed.TotalMilliseconds;
    if (search.Length != 1000) throw new Exception("Index benchmark mismatch");
    watch.Restart(); store.RebuildIndex(); var rebuild1000Ms = watch.Elapsed.TotalMilliseconds;
    var note = store.Load(calendar[0].Id);
    var large = string.Concat(Enumerable.Repeat("中文 👩🏽‍💻 **Markdown**\n\n", 10000));
    watch.Restart();
    var saved = store.Save(new(note.Header.Id, large, note.Header.Title, [], note.Sidecar.Revision, note.Sidecar.ContentHash, [], []));
    var largeSaveMs = watch.Elapsed.TotalMilliseconds;
    watch.Restart(); var loaded = new VaultStore(store.Root).Load(saved.Header.Id); var reopenMs = watch.Elapsed.TotalMilliseconds;
    if (loaded.Body != large) throw new Exception("Large document did not round-trip");
    var results = new { scope = "Linux portable storage only; not native performance acceptance", timestamp = DateTimeOffset.UtcNow, runtime = System.Runtime.InteropServices.RuntimeInformation.FrameworkDescription,
        notes = 1000, largeUtf16Length = large.Length, openMs, create1000Ms, calendarMs, searchMs, rebuild1000Ms, largeSaveMs, reopenIncludingIndexMs = reopenMs, managedMemoryBytes = GC.GetTotalMemory(false) };
    Directory.CreateDirectory(Path.GetDirectoryName(output)!); File.WriteAllText(output, JsonSerializer.Serialize(results, new JsonSerializerOptions { WriteIndented = true }));
    Console.WriteLine(File.ReadAllText(output));
}
finally { if (Directory.Exists(temp)) Directory.Delete(temp, true); }
