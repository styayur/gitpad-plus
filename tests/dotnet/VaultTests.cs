// SPDX-License-Identifier: AGPL-3.0-only
using System.Text.Json;
using GitPadPlus.Core;
using Xunit;

namespace GitPadPlus.Tests;

public sealed class VaultTests : IDisposable
{
    private readonly string parent = Path.Combine(Path.GetTempPath(), "gitpad-tests-" + Guid.NewGuid().ToString("N"));
    private string Root => Path.Combine(parent, "Vault");
    private VaultStore Store(Action<string>? checkpoint = null) => new(Root, checkpoint);
    private static SaveRequest Edit(Note note, string body, BlockAnchor[]? blocks = null, SelectionAnchor[]? selections = null) => new(note.Header.Id, body, note.Header.Title, note.Header.Tags, note.Sidecar.Revision, note.Sidecar.ContentHash, blocks ?? [], selections ?? []);
    public void Dispose() { if (Directory.Exists(parent)) Directory.Delete(parent, true); }

    [Fact] public void CreateSaveReloadAndSearch()
    {
        var store = Store();
        var first = store.Create("2026-10-31", "Thought");
        Assert.Equal(7, first.Header.Id.Version);
        var saved = store.Save(Edit(first, "# 中文\n\nBonjour 👩🏽‍💻\n"));
        Assert.Equal(2, saved.Sidecar.Revision);
        Assert.Equivalent(saved, Store().Load(first.Header.Id));
        Assert.Single(store.List("2026-10-31", "Bonjour"));
        Assert.Empty(store.List("2026-10-30"));
    }
    [Fact] public void MultipleNotesPerDayRemainDistinct()
    {
        var store = Store();
        var one = store.Create("2026-10-31", "Same");
        var two = store.Create("2026-10-31", "Same");
        Assert.NotEqual(one.Header.Id, two.Header.Id);
        Assert.Equal(2, store.List("2026-10-31").Length);
    }
    [Fact] public void NoOpSavePreservesBytes()
    {
        var store = Store(); var note = store.Create("2026-10-31", "Noop");
        var path = store.Safe("Journal", note.Header.Id + ".md");
        var before = File.ReadAllBytes(path);
        var after = store.Save(Edit(note, note.Body));
        Assert.Equal(before, File.ReadAllBytes(path)); Assert.Equal(note.Sidecar.Revision, after.Sidecar.Revision);
    }
    [Fact] public void StaleRevisionCannotOverwriteNewerSave()
    {
        var store = Store(); var note = store.Create("2026-10-31", "Race");
        store.Save(Edit(note, "new"));
        Assert.Throws<RevisionConflictException>(() => store.Save(Edit(note, "old")));
        Assert.Equal("new", store.Load(note.Header.Id).Body);
    }
    [Theory] [InlineData("Staged")] [InlineData("MarkdownReplaced")] [InlineData("SidecarReplaced")]
    public void InterruptedSaveRecoversMatchingPair(string stage)
    {
        var note = Store().Create("2026-10-31", "Crash");
        var faulty = Store(point => { if (point == stage) throw new IOException("Simulated process interruption"); });
        Assert.Throws<IOException>(() => faulty.Save(Edit(note, "recover me")));
        var recovered = Store().Load(note.Header.Id);
        Assert.Equal("recover me", recovered.Body); Assert.Equal(2, recovered.Sidecar.Revision);
        Assert.Empty(Directory.EnumerateDirectories(Path.Combine(Root, ".gitpad", "transactions")));
    }
    [Fact] public void RecoveryNeverOverwritesExternalChange()
    {
        var note = Store().Create("2026-10-31", "Crash");
        var faulty = Store(point => { if (point == "Staged") throw new IOException("stop"); });
        Assert.Throws<IOException>(() => faulty.Save(Edit(note, "staged")));
        var path = Path.Combine(Root, "Journal", note.Header.Id + ".md");
        File.AppendAllText(path, "external");
        var recovered = Store();
        Assert.NotEmpty(recovered.RecoveryIssues);
        Assert.Throws<RecoveryRequiredException>(() => recovered.Load(note.Header.Id));
        Assert.EndsWith("external", File.ReadAllText(path));
        Assert.Single(Directory.EnumerateFiles(Path.Combine(Root, ".gitpad", "transactions"), "previous.md", SearchOption.AllDirectories));
    }
    [Fact] public void ExternalMarkdownEditFailsClosed()
    {
        var store = Store(); var note = store.Create("2026-10-31", "External");
        File.AppendAllText(store.Safe("Journal", note.Header.Id + ".md"), "changed externally");
        Assert.Throws<RecoveryRequiredException>(() => store.Load(note.Header.Id));
    }
    [Fact] public void IndexCanBeRebuiltAfterDeletion()
    {
        var store = Store(); var note = store.Create("2026-10-31", "Search");
        store.Save(Edit(note, "findability"));
        File.Delete(store.Safe(".gitpad", "index.sqlite"));
        Assert.Single(Store().List(search: "findability"));
    }
    [Fact] public void CorruptIndexIsQuarantinedAndRebuilt()
    {
        var store = Store(); store.Create("2026-10-31", "Kept");
        File.WriteAllText(store.Safe(".gitpad", "index.sqlite"), "not SQLite");
        Assert.Single(Store().List());
        Assert.Single(Directory.EnumerateFiles(Path.Combine(Root, ".gitpad"), "corrupt-index-*.sqlite"));
    }
    [Fact] public void DeleteRetainsRecoverableTrash()
    {
        var store = Store(); var note = store.Create("2026-10-31", "Delete");
        store.Delete(note.Header.Id, note.Sidecar.Revision);
        Assert.Empty(Store().List());
        Assert.Single(Directory.EnumerateFiles(store.Safe(".gitpad", "trash"), "document.md", SearchOption.AllDirectories));
    }
    [Fact] public void RejectsTraversal()
    {
        var store = Store();
        Assert.Throws<UnauthorizedAccessException>(() => store.Safe("..", "outside"));
        Assert.Throws<UnauthorizedAccessException>(() => store.Safe(Path.GetPathRoot(Root)!));
    }
    [Fact] public void CannotAdoptAnExternalNonemptyDirectory()
    {
        Directory.CreateDirectory(Root); File.WriteAllText(Path.Combine(Root, "private.txt"), "keep");
        Assert.Throws<UnauthorizedAccessException>(() => Store());
        Assert.Equal("keep", File.ReadAllText(Path.Combine(Root, "private.txt")));
    }
    [Fact] public void SymbolicLinkCannotEscapeOrBeCleared()
    {
        var store = Store(); var outside = Path.Combine(parent, "outside"); Directory.CreateDirectory(outside);
        File.WriteAllText(Path.Combine(outside, "private.txt"), "keep");
        var link = Path.Combine(Root, "Assets", "linked"); Directory.CreateSymbolicLink(link, outside);
        Assert.Throws<UnauthorizedAccessException>(() => store.Safe("Assets", "linked", "private.txt"));
        Assert.Throws<UnauthorizedAccessException>(() => store.PreviewClear(false));
        Assert.Equal("keep", File.ReadAllText(Path.Combine(outside, "private.txt")));
        Directory.Delete(link);
    }
    [Fact] public void ClearRequiresCurrentConfirmationAndNoDirtyState()
    {
        var store = Store(); store.Create("2026-10-31", "Data");
        Assert.Throws<InvalidOperationException>(() => store.PreviewClear(true));
        var preview = store.PreviewClear(false); Assert.Equal(1, preview.Notes);
        Assert.Throws<UnauthorizedAccessException>(() => store.Clear("wrong", false));
        store.Create("2026-10-31", "Changed");
        Assert.Throws<UnauthorizedAccessException>(() => store.Clear(preview.Confirmation, false));
        store.Clear(store.PreviewClear(false).Confirmation, false);
        Assert.Empty(store.List()); Assert.True(File.Exists(Path.Combine(Root, ".gitpad-owned")));
    }
    [Fact] public void AnchorIdentitiesAndTombstonesRoundTrip()
    {
        var store = Store(); var note = store.Create("2026-10-31", "Anchors");
        var block = new BlockAnchor(Guid.CreateVersion7(), "paragraph", 0, 5);
        var selection = new SelectionAnchor(Guid.CreateVersion7(), block.Id, "hello", "", "", 0, 5);
        var saved = store.Save(Edit(note, "hello", [block], [selection]));
        Assert.Equal(block, Store().Load(note.Header.Id).Sidecar.Blocks.Single());
        Assert.Equal(selection, saved.Sidecar.Selections.Single());
        Assert.Throws<ArgumentException>(() => store.Save(Edit(saved, "x", [block])));
    }
    [Fact] public void ImagesAreDeduplicatedAndActiveContentRejected()
    {
        var store = Store(); byte[] png = [137,80,78,71,13,10,26,10,0];
        Assert.Equal(store.ImportImage("first.png", png), store.ImportImage("second.png", png));
        Assert.Single(Directory.EnumerateFiles(store.Safe("Assets")));
        Assert.Throws<ArgumentException>(() => store.ImportImage("fake.png", "<svg/>"u8.ToArray()));
    }
    [Fact] public void FrontmatterRetainsUnknownFieldsAndCrLfBody()
    {
        var note = Store().Create("2026-10-31", "Metadata");
        var raw = Frontmatter.Encode(note.Header, "中文\r\n").Replace("schemaVersion:", "custom: keep\nschemaVersion:");
        var decoded = Frontmatter.Decode(raw);
        Assert.Equal("中文\r\n", decoded.Body);
        Assert.Contains("custom: keep", Frontmatter.Encode(decoded.Header, "edited", decoded.Yaml));
    }
    [Theory] [InlineData("2026-02-30")] [InlineData("31/10/2026")] [InlineData("../oops")]
    public void InvalidDatesRejected(string date) => Assert.Throws<ArgumentException>(() => Store().Create(date, "Invalid"));
    [Fact] public void BridgeRejectsUnknownMethodsAndProtocolVersions()
    {
        var bridge = new Bridge(Store());
        foreach (var (version, method, parameters) in new[] { (2, "documents.list", "{}"), (1, "System.IO.Delete", "{}"), (1, "documents.load", "{\"id\":\"../x\"}"), (1, "documents.create", "{\"date\":\"2026-10-31\",\"title\":\"x\",\"extra\":true}") })
        {
            var json = "{\"protocolVersion\":" + version + ",\"requestId\":\"test\",\"method\":\"" + method + "\",\"params\":" + parameters + "}";
            Assert.NotEqual(JsonValueKind.Null, JsonDocument.Parse(bridge.Handle(json)).RootElement.GetProperty("error").ValueKind);
        }
    }
    [Fact] public void BridgeCreateAndDirtyClearProtection()
    {
        var bridge = new Bridge(Store());
        string Call(string method, string p) => bridge.Handle("{\"protocolVersion\":1,\"requestId\":\"a\",\"method\":\"" + method + "\",\"params\":" + p + "}");
        Assert.Equal(JsonValueKind.Null, JsonDocument.Parse(Call("documents.create", "{\"date\":\"2026-10-31\",\"title\":\"Bridge\"}")).RootElement.GetProperty("error").ValueKind);
        Call("documents.dirty", "true");
        Assert.True(bridge.HasUnsavedChanges);
        Assert.NotEqual(JsonValueKind.Null, JsonDocument.Parse(Call("app.previewClear", "{}")).RootElement.GetProperty("error").ValueKind);
        Assert.Contains("NotConfigured", Call("git.status", "{}"));
    }
    [Fact] public void LinksAreStrictAndVersion7()
    {
        var doc = Guid.CreateVersion7(); var block = Guid.CreateVersion7();
        Assert.Equal(block, Identity.ParseLink($"gitpadplus://note/{doc}?block={block}").BlockId);
        Assert.Throws<ArgumentException>(() => Identity.ParseLink($"gitpadplus://note/{doc}?block={block}&selection={Guid.CreateVersion7()}"));
        Assert.Throws<ArgumentException>(() => Identity.ParseLink($"gitpadplus://note/{Guid.NewGuid()}"));
        Assert.Throws<ArgumentException>(() => Identity.ParseLink($"gitpadplus://note/{doc}/"));
        Assert.Throws<ArgumentException>(() => Identity.ParseLink($"gitpadplus://note/{doc:N}"));
    }
    [Fact] public void NativeCoreEnforcesPackagedPluginCapabilities()
    {
        var bridge = new Bridge(Store());
        string Call(string method, object parameters) => bridge.Handle(JsonSerializer.Serialize(new { protocolVersion = 1, requestId = "plugin", method, @params = parameters }));
        bool Failed(string response) => JsonDocument.Parse(response).RootElement.GetProperty("error").ValueKind != JsonValueKind.Null;
        Assert.True(Failed(Call("plugins.invoke", new { pluginId = "official-calendar-stats", method = "calendar.query", @params = new { } })));
        Assert.False(Failed(Call("plugins.activate", new { pluginId = "official-calendar-stats" })));
        Assert.False(Failed(Call("plugins.invoke", new { pluginId = "official-calendar-stats", method = "calendar.query", @params = new { } })));
        Assert.True(Failed(Call("plugins.invoke", new { pluginId = "official-calendar-stats", method = "app.clearLocalData", @params = new { confirmation = "forged" } })));
        Call("plugins.deactivate", new { pluginId = "official-calendar-stats" });
        Assert.True(Failed(Call("plugins.invoke", new { pluginId = "official-calendar-stats", method = "calendar.query", @params = new { } })));
    }
    [Fact] public void BridgeRejectsMissingAndNullRequiredFields()
    {
        var bridge = new Bridge(Store());
        foreach (var parameters in new[] { "{}", "{\"date\":\"2026-10-31\",\"title\":null}" })
        {
            var result = bridge.Handle("{\"protocolVersion\":1,\"requestId\":\"bad\",\"method\":\"documents.create\",\"params\":" + parameters + "}");
            Assert.NotEqual(JsonValueKind.Null, JsonDocument.Parse(result).RootElement.GetProperty("error").ValueKind);
        }
    }
    [Fact] public void AnchorResolverUsesUtf16AndRefusesDuplicateQuoteJumps()
    {
        var anchor = new SelectionAnchor(Guid.CreateVersion7(), Guid.CreateVersion7(), "same", "", "", 0, 4);
        Assert.Equal("ambiguous", AnchorEngine.Resolve(anchor, "same same").State);
        Assert.Equal(2, AnchorEngine.Resolve(anchor, "😀same").Start);
        Assert.Equal("missing", AnchorEngine.Resolve(anchor, "gone").State);
        var contextual = anchor with { Prefix = "left ", Suffix = " right" };
        Assert.Equal(10, AnchorEngine.Resolve(contextual, "same left same right").Start);
        Assert.Equal("ambiguous", AnchorEngine.Resolve(contextual, "unrelated same elsewhere").State);
    }
    [Fact] public void InvalidNoteDoesNotPreventReadingOtherNotes()
    {
        var store = Store(); var good = store.Create("2026-10-31", "Good"); var broken = store.Create("2026-10-31", "Broken");
        File.WriteAllText(store.Safe("Journal", broken.Header.Id + ".md"), "---\nmalformed: [\n---\n");
        var reopened = Store(); Assert.Equal(good.Header.Id, Assert.Single(reopened.List()).Id); Assert.NotEmpty(reopened.RecoveryIssues);
        Assert.Throws<RecoveryRequiredException>(() => reopened.Load(broken.Header.Id));
    }
    [Fact] public void WorkspaceRestoresAndRejectsLateStateUpdates()
    {
        var store = Store(); var id = store.Create("2026-10-31", "Workspace").Header.Id;
        store.SetWorkspace(new([id], id, 2)); store.SetWorkspace(new([], null, 1));
        var restored = Store().GetWorkspace(); Assert.Equal(id, Assert.Single(restored.Tabs)); Assert.Equal(id, restored.ActiveId);
        Assert.Throws<ArgumentException>(() => store.SetWorkspace(new([], id, 3)));
    }
}
