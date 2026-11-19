// SPDX-License-Identifier: AGPL-3.0-only
using System.Diagnostics;
using System.Text.Json;
using GitPadPlus.Core;

if (args.Length == 4 && args[0] == "--verify-close-fixture")
{
    var originalStore = new VaultStore(args[1]);
    var recoveredStore = new VaultStore(args[2]);
    var original = originalStore.Load(originalStore.List().Single().Id);
    var recovered = recoveredStore.Load(original.Header.Id);
    var markers = new[] { "LOCK-RECOVERY-1", "LOCK-RECOVERY-2", "LOCK-RECOVERY-3" };
    var stripped = System.Text.RegularExpressions.Regex.Replace(recovered.Body, @"LOCK-RECOVERY-[123] 中文", "");
    string Compact(string body) => string.Concat(body.Where(character => !char.IsWhiteSpace(character)));
    if (!markers.All(recovered.Body.Contains) || Compact(stripped) != Compact(original.Body)
        || original.Header.Id != recovered.Header.Id || original.Header.Title != recovered.Header.Title
        || original.Header.Date != recovered.Header.Date || original.Header.CreatedAt != recovered.Header.CreatedAt
        || !original.Header.Tags.SequenceEqual(recovered.Header.Tags)
        || !original.Sidecar.Blocks.Select(block => block.Id).SequenceEqual(recovered.Sidecar.Blocks.Select(block => block.Id))
        || recoveredStore.RecoveryIssues.Count != 0 || recoveredStore.List(search: "LOCK-RECOVERY-3").Length != 1)
        throw new InvalidOperationException("Native close fixture lost input, metadata, identity or index consistency.");
    string Hash(string path) => Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(path)));
    var report = new { passed = true, scope = "Synthetic Windows locked-source close recovery; original prose compared ignoring whitespace after removing the three inserted markers", documentId = recovered.Header.Id,
        blockIds = recovered.Sidecar.Blocks.Select(block => block.Id).ToArray(), markers,
        markdownSha256 = Hash(recoveredStore.Safe("Journal", recovered.Header.Id + ".md")),
        sidecarSha256 = Hash(recoveredStore.Safe(".gitpad", "anchors", recovered.Header.Id + ".json")) };
    File.WriteAllText(args[3], JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }));
    Console.WriteLine("Native close fixture retains input, UUIDs, metadata, source-pair integrity and search index.");
    return;
}

// Synthetic input preparation for the external native exit sampler.
if (args.Length == 3 && args[0] == "--exit-fixtures")
{
    var parent = Path.GetFullPath(args[1]);
    if (Directory.Exists(parent) && Directory.EnumerateFileSystemEntries(parent).Any())
        throw new ArgumentException("Use a fresh synthetic fixture parent.");
    Directory.CreateDirectory(parent);
    var reports = new List<object>();
    foreach (var scenario in new[] { "ordinary", "long", "two-pane", "images", "plugins-disabled", "pending-save" })
    {
        var store = new VaultStore(Path.Combine(parent, scenario));
        var ids = new List<Guid>();
        var image = scenario == "images" ? store.ImportImage("exit-fixture.png", File.ReadAllBytes(args[2])) : null;
        var count = scenario == "two-pane" ? 2 : 1;
        for (var pane = 0; pane < count; pane++)
        {
            var note = store.Create("2026-11-05", "Synthetic " + scenario + " " + pane);
            var paragraphs = scenario is "long" or "pending-save"
                ? Enumerable.Range(0, 10000).Select(index => "Synthetic paragraph " + index + " 中文.").ToArray()
                : scenario == "images"
                    ? Enumerable.Repeat("![Synthetic image](" + image + ")", 40).ToArray()
                    : new[] { "Synthetic ordinary diary paragraph 中文." };
            var body = string.Join("\n\n", paragraphs);
            var position = 0;
            var blocks = paragraphs.Select((paragraph, index) =>
            {
                var block = new BlockAnchor(Guid.CreateVersion7(), "paragraph", position, position + paragraph.Length, false, [], [index]);
                position += paragraph.Length + 2;
                return block;
            }).ToArray();
            store.Save(new(note.Header.Id, body, note.Header.Title, [], note.Sidecar.Revision, note.Sidecar.ContentHash, blocks, []));
            ids.Add(note.Header.Id);
        }
        if (scenario == "plugins-disabled")
            store.SetSettings(new AppSettings(DisabledPlugins: ["official-toolbar", "official-calendar-stats"]));
        store.SetWorkspace(new WorkspaceState(ids.ToArray(), ids[0], 1, scenario == "two-pane" ? ids[1] : null));
        reports.Add(new { scenario, documents = ids });
    }
    File.WriteAllText(Path.Combine(parent, "fixtures.json"), JsonSerializer.Serialize(reports, new JsonSerializerOptions { WriteIndented = true }));
    Console.WriteLine("Prepared six synthetic native exit scenarios.");
    return;
}

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
