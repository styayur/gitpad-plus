// SPDX-License-Identifier: AGPL-3.0-only
using System.Diagnostics;
using System.Text.Json;
using GitPadPlus.Core;

// Measures portable storage, not native application startup or mobile input latency.
var benchmarkRoot=Path.GetFullPath(Environment.GetEnvironmentVariable("GITPAD_BENCHMARK_TEMP")??Path.GetTempPath());
var temp = Path.Combine(benchmarkRoot, "gitpad-benchmark-" + Guid.NewGuid().ToString("N"));
var fixtureOnly=args.Contains("--index-fixture");
var keepFixture=args.Contains("--keep-fixture");
var output = Path.GetFullPath(args.FirstOrDefault(value=>!value.StartsWith("--",StringComparison.Ordinal)) ?? "artifacts/storage-benchmark.json");
try
{
    var watch = Stopwatch.StartNew();
    var store = new VaultStore(Path.Combine(temp, "Vault"));
    var openMs = watch.Elapsed.TotalMilliseconds;
    watch.Restart();
    for (var index = 0; index < 1000; index++)
    {
        if(!fixtureOnly){store.Create("2026-10-31", "Benchmark " + index);continue;}
        // Fixture construction is deliberately outside the timed index/load path.
        // It does not measure application create throughput or save durability.
        var id=Guid.CreateVersion7();var now=DateTimeOffset.UtcNow;
        var header=new DocumentHeader(1,id,"2026-10-31","Benchmark "+index,[],now,now);
        var markdown=Frontmatter.Encode(header,"Fixture note "+index+"\n");
        File.WriteAllText(store.Safe("Journal",id+".md"),markdown);
        File.WriteAllText(store.Safe(".gitpad","anchors",id+".json"),JsonSerializer.Serialize(new Sidecar(1,id,1,Identity.Hash(markdown),[],[]),DataJson.Default.Sidecar));
    }
    var create1000Ms = watch.Elapsed.TotalMilliseconds;
    if(fixtureOnly)store.RebuildIndex();
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
    var results = new { scope = "Core storage on the recorded host OS; excludes MAUI UI and Android performance acceptance", os=System.Runtime.InteropServices.RuntimeInformation.OSDescription, architecture=System.Runtime.InteropServices.RuntimeInformation.ProcessArchitecture.ToString(), timestamp = DateTimeOffset.UtcNow, runtime = System.Runtime.InteropServices.RuntimeInformation.FrameworkDescription,
        notes = 1000, populationMethod=fixtureOnly?"Direct valid source-pair fixtures; excludes application create throughput":"VaultStore.Create with durable transactions", populatedVault=keepFixture?store.Root:null, largeUtf16Length = large.Length, openMs, populate1000Ms=create1000Ms, calendarMs, searchMs, rebuild1000Ms, largeSaveMs, reopenIncludingIndexMs = reopenMs, managedMemoryBytes = GC.GetTotalMemory(false) };
    Directory.CreateDirectory(Path.GetDirectoryName(output)!); File.WriteAllText(output, JsonSerializer.Serialize(results, new JsonSerializerOptions { WriteIndented = true }));
    Console.WriteLine(File.ReadAllText(output));
}
finally {
    var resolved=Path.GetFullPath(temp);
    if(!resolved.StartsWith(benchmarkRoot+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||!Path.GetFileName(resolved).StartsWith("gitpad-benchmark-",StringComparison.Ordinal))throw new InvalidOperationException("Benchmark cleanup escaped its dedicated directory.");
    if (!keepFixture&&Directory.Exists(resolved)) Directory.Delete(resolved, true);
}
