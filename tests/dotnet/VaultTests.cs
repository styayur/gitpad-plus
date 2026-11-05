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

    [Theory]
    [InlineData("RestoreStaged")]
    [InlineData("RestoreMarkdownReplaced")]
    [InlineData("RestoreSidecarReplaced")]
    public void RestoreCrashRetainsExactSourcePair(string phase)
    {
        var store = Store();
        var first = store.Create("2026-11-05", "Restore 中文");
        var block = new BlockAnchor(Guid.CreateVersion7(), "paragraph", 0, 7);
        var selection = new SelectionAnchor(Guid.CreateVersion7(), block.Id, "中文", "", "", 0, 2);
        var saved = store.Save(Edit(first, "中文 test", [block], [selection]));
        var markdown = File.ReadAllBytes(store.Safe("Journal", saved.Header.Id + ".md"));
        var sidecar = File.ReadAllBytes(store.Safe(".gitpad", "anchors", saved.Header.Id + ".json"));
        store.Delete(saved.Header.Id, saved.Sidecar.Revision);
        Assert.Empty(store.List());
        Assert.Single(Store().ListTrash());
        var interrupted = Store(point => { if (point == phase) throw new IOException("Simulated restore interruption"); });
        Assert.Throws<IOException>(() => interrupted.Restore(saved.Header.Id));
        var recovered = Store();
        Assert.Empty(recovered.ListTrash());
        Assert.Single(recovered.List("2026-11-05", "test"));
        Assert.Equal(markdown, File.ReadAllBytes(recovered.Safe("Journal", saved.Header.Id + ".md")));
        Assert.Equal(sidecar, File.ReadAllBytes(recovered.Safe(".gitpad", "anchors", saved.Header.Id + ".json")));
        Assert.Equivalent(saved, recovered.Load(saved.Header.Id));
    }

    [Fact] public void TrashRestoreSurvivesRepeatedRoundTripsAndRestart()
    {
        var store = Store();
        var note = store.Create("2026-11-05", "Round trip");
        var raw = File.ReadAllBytes(store.Safe("Journal", note.Header.Id + ".md"));
        var metadata = File.ReadAllBytes(store.Safe(".gitpad", "anchors", note.Header.Id + ".json"));
        for (var round = 0; round < 2; round++)
        {
            store.Delete(note.Header.Id, note.Sidecar.Revision);
            store = Store();
            Assert.Single(store.ListTrash());
            Assert.Equivalent(note, store.Restore(note.Header.Id));
            store = Store();
            Assert.Empty(store.ListTrash());
            Assert.Single(store.List());
            Assert.Equal(raw, File.ReadAllBytes(store.Safe("Journal", note.Header.Id + ".md")));
            Assert.Equal(metadata, File.ReadAllBytes(store.Safe(".gitpad", "anchors", note.Header.Id + ".json")));
        }
    }

    [Fact] public void InterruptedRestoreConflictRetainsCopiesAndAllowsOtherNotesToLoad()
    {
        var store = Store();
        var note = store.Create("2026-11-05", "Interrupted target");
        var other = store.Create("2026-11-05", "Unaffected note");
        store.Delete(note.Header.Id, note.Sidecar.Revision);
        var interrupted = Store(point => { if (point == "RestoreMarkdownReplaced") throw new IOException("Stop"); });
        Assert.Throws<IOException>(() => interrupted.Restore(note.Header.Id));
        File.WriteAllText(store.Safe("Journal", note.Header.Id + ".md"), "external conflict");
        var reopened = Store();
        Assert.Contains(reopened.RecoveryIssues, issue => issue.Code == "RestoreConflict");
        Assert.Single(reopened.ListTrash());
        Assert.Equivalent(other, reopened.Load(other.Header.Id));
        Assert.Throws<RecoveryRequiredException>(() => reopened.Restore(note.Header.Id));
        Assert.Equal("external conflict", File.ReadAllText(reopened.Safe("Journal", note.Header.Id + ".md")));
    }

    [Fact] public void RestoreCanRetryAfterSourceCommitBeforeIndexAcknowledgement()
    {
        var store = Store();
        var note = store.Create("2026-11-05", "Committed restore");
        store.Delete(note.Header.Id, note.Sidecar.Revision);
        var interrupted = Store(point => { if (point == "RestoreCommitted") throw new IOException("Lost acknowledgement"); });
        Assert.Throws<IOException>(() => interrupted.Restore(note.Header.Id));
        Assert.Equivalent(note, interrupted.Restore(note.Header.Id));
        Assert.Single(interrupted.List());
        Assert.Empty(interrupted.ListTrash());
        Assert.Equivalent(note, Store().Load(note.Header.Id));
    }

    [Fact] public void RestoreRejectsConflictingActiveSource()
    {
        var store = Store();
        var note = store.Create("2026-11-05", "Restore conflict");
        store.Delete(note.Header.Id, note.Sidecar.Revision);
        File.WriteAllText(store.Safe("Journal", note.Header.Id + ".md"), "external conflict");
        Assert.Throws<RevisionConflictException>(() => store.Restore(note.Header.Id));
        Assert.Equal("external conflict", File.ReadAllText(store.Safe("Journal", note.Header.Id + ".md")));
        Assert.Single(store.ListTrash());
    }

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
    [Theory] [InlineData("markdown")] [InlineData("sidecar")] [InlineData("both")]
    public void ReconciliationArchivesAllInputsAndRejectsStalePreview(string mode)
    {
        var store=Store();var note=store.Save(Edit(store.Create("2026-10-31","Recovery"),"original"));
        var markdown=store.Safe("Journal",note.Header.Id+".md");var sidecar=store.Safe(".gitpad","anchors",note.Header.Id+".json");
        if(mode!="sidecar")File.AppendAllText(markdown," external");
        if(mode!="markdown")File.AppendAllText(sidecar," ");
        Assert.Throws<RecoveryRequiredException>(()=>store.Load(note.Header.Id));
        var preview=store.InspectRecovery(note.Header.Id);File.AppendAllText(markdown," newer");
        Assert.Throws<RevisionConflictException>(()=>store.Reconcile(new(note.Header.Id,preview.Fingerprint,preview.Versions[0].Markdown)));
        preview=store.InspectRecovery(note.Header.Id);var chosen=preview.Versions[0].Markdown;
        var restored=store.Reconcile(new(note.Header.Id,preview.Fingerprint,chosen));
        Assert.Equal(Frontmatter.Decode(chosen).Body,restored.Body);Assert.Equal(restored.Body,Store().Load(note.Header.Id).Body);
        var archived=Directory.GetFiles(store.Safe(".gitpad","recovery"),"0.md",SearchOption.AllDirectories);Assert.Single(archived);Assert.Equal(chosen,File.ReadAllText(archived[0]));
    }
    [Fact] public void SidecarChangesDuringInterruptedTransactionCannotBeOverwritten()
    {
        var note=Store().Create("2026-10-31","Conflict");var faulty=Store(point=>{if(point=="Staged")throw new IOException("stop");});
        Assert.Throws<IOException>(()=>faulty.Save(Edit(note,"staged")));
        var path=Path.Combine(Root,".gitpad","anchors",note.Header.Id+".json");File.AppendAllText(path," ");var external=File.ReadAllText(path);
        var recovered=Store();Assert.Equal(external,File.ReadAllText(path));Assert.NotEmpty(recovered.RecoveryIssues);
        var preview=recovered.InspectRecovery(note.Header.Id);Assert.Equal(3,preview.Versions.Length);
        recovered.Reconcile(new(note.Header.Id,preview.Fingerprint,preview.Versions.Single(v=>v.Name.EndsWith("/staged",StringComparison.Ordinal)).Markdown));
        Assert.Equal("staged",Store().Load(note.Header.Id).Body);Assert.NotEmpty(Directory.GetFiles(recovered.Safe(".gitpad","recovery"),"previous.md",SearchOption.AllDirectories));
    }
    [Fact] public void PluginStateIsDurableAndIsolated()
    {
        var store=Store();var id=Guid.CreateVersion7();var data=new PluginData(1,"1.0",new(){["text"]=JsonSerializer.SerializeToElement("中文")},new(){["widget"]=id});
        store.WritePluginData("first-plugin",data);Assert.Null(store.ReadPluginData("second-plugin"));
        var restored=Store().ReadPluginData("first-plugin")!;Assert.Equal(id,restored.ObjectIds["widget"]);Assert.Equal("中文",restored.Values["text"].GetString());
        Assert.Throws<ArgumentException>(()=>store.WritePluginData("../escape",data));
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
    [Fact] public void ReparsePointCannotEscapeOrBeCleared()
    {
        var store = Store(); var outside = Path.Combine(parent, "outside"); Directory.CreateDirectory(outside);
        File.WriteAllText(Path.Combine(outside, "private.txt"), "keep");
        var link = Path.Combine(Root, "Assets", "linked");
        if(OperatingSystem.IsWindows())
        {
            // NTFS junctions exercise the same reparse-point rejection without
            // requiring Developer Mode or the symlink privilege on user machines.
            var start=new System.Diagnostics.ProcessStartInfo("cmd.exe"){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};
            foreach(var argument in new[]{"/d","/c","mklink","/J",link,outside})start.ArgumentList.Add(argument);
            using var process=System.Diagnostics.Process.Start(start)!;process.WaitForExit();Assert.Equal(0,process.ExitCode);
        }
        else Directory.CreateSymbolicLink(link, outside);
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
    [Fact] public void TrustedOsBaseStillRejectsLinksInsideOwnedVault()
    {
        Directory.CreateDirectory(parent);
        Assert.Throws<ArgumentException>(()=>new VaultStore(Root,trustedPlatformBase:Root));
        Assert.Throws<ArgumentException>(()=>new VaultStore(Root,trustedPlatformBase:Path.Combine(parent,"elsewhere")));
        var store=new VaultStore(Root,trustedPlatformBase:parent);
        var outside=Path.Combine(parent,"outside-private");Directory.CreateDirectory(outside);
        File.WriteAllText(Path.Combine(outside,"keep.txt"),"untouched");
        var link=Path.Combine(Root,"Assets","linked");
        if(OperatingSystem.IsWindows()){
            var start=new System.Diagnostics.ProcessStartInfo("cmd.exe"){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};
            foreach(var argument in new[]{"/d","/c","mklink","/J",link,outside})start.ArgumentList.Add(argument);
            using var process=System.Diagnostics.Process.Start(start)!;process.WaitForExit();Assert.Equal(0,process.ExitCode);
        }else Directory.CreateSymbolicLink(link,outside);
        try{
            Assert.Throws<UnauthorizedAccessException>(()=>store.Safe("Assets","linked","keep.txt"));
            Assert.Throws<UnauthorizedAccessException>(()=>store.PreviewClear(false));
            Assert.Equal("untouched",File.ReadAllText(Path.Combine(outside,"keep.txt")));
        }finally{Directory.Delete(link);}
    }
    [Fact] public void PackagedRegistryAndNativeClipboardKeepCapabilitiesNarrow()
    {
        var store=Store();
        var bridge=new Bridge(store,[new("sample-plugin","",["commands"],[])],()=>[137,80,78,71,13,10,26,10,0]);
        JsonElement Call(string method,object parameters)=>JsonDocument.Parse(bridge.Handle(JsonSerializer.Serialize(new{protocolVersion=1,requestId="registry-test",method,@params=parameters}))).RootElement.Clone();
        Assert.Equal(JsonValueKind.Null,Call("plugins.activate",new{pluginId="sample-plugin"}).GetProperty("error").ValueKind);
        Assert.NotEqual(JsonValueKind.Null,Call("plugins.storage.read",new{pluginId="sample-plugin"}).GetProperty("error").ValueKind);
        Assert.NotEqual(JsonValueKind.Null,Call("plugins.invoke",new{pluginId="sample-plugin",method="calendar.query",@params=new{}}).GetProperty("error").ValueKind);
        var image=Call("media.importClipboard",new{});Assert.Equal(JsonValueKind.Null,image.GetProperty("error").ValueKind);
        Assert.StartsWith("../Assets/",image.GetProperty("result").GetString());
        Assert.Single(Directory.GetFiles(store.Safe("Assets")));
    }
    [Theory] [InlineData("ClearStaged")] [InlineData("ClearJournalMoved")] [InlineData("ClearAssetsMoved")] [InlineData("ClearMetadataMoved")]
    public void ConfirmedClearResumesAfterInterruption(string stage)
    {
        Store().Create("2026-10-31","Disposable");var faulty=Store(point=>{if(point==stage)throw new IOException("simulated clear interruption");});
        Assert.Throws<IOException>(()=>faulty.Clear(faulty.PreviewClear(false).Confirmation,false));
        var restarted=Store();Assert.Empty(restarted.List());Assert.Empty(Directory.GetDirectories(Root,".gitpad-clear-*"));Assert.False(File.Exists(Path.Combine(Root,".gitpad-clear.json")));
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
    [Fact] public void NativePickerImportsValidatedFilesAndCancellationHasNoWrites()
    {
        var store=Store();
        string Invoke(Bridge bridge,string method)=>bridge.Handle(JsonSerializer.Serialize(new{protocolVersion=1,requestId="picker",method,@params=new{}}));
        var unavailable=JsonDocument.Parse(Invoke(new Bridge(store),"media.pickImage"));Assert.NotEqual(JsonValueKind.Null,unavailable.RootElement.GetProperty("error").ValueKind);
        var cancel=JsonDocument.Parse(Invoke(new Bridge(store,pickFile:_=>null),"media.pickImage"));Assert.Equal(JsonValueKind.Null,cancel.RootElement.GetProperty("result").ValueKind);Assert.Empty(Directory.GetFiles(store.Safe("Assets")));
        var bridge=new Bridge(store,pickFile:kind=>kind=="image"?new("pixel.png",[137,80,78,71,13,10,26,10,0]):new("fixture.md",System.Text.Encoding.UTF8.GetBytes("中文\r\n")));
        var image=JsonDocument.Parse(Invoke(bridge,"media.pickImage"));Assert.Equal(JsonValueKind.Null,image.RootElement.GetProperty("error").ValueKind);Assert.StartsWith("../Assets/",image.RootElement.GetProperty("result").GetString());
        var markdown=JsonDocument.Parse(Invoke(bridge,"files.pickMarkdown"));Assert.Equal("中文\r\n",markdown.RootElement.GetProperty("result").GetProperty("text").GetString());Assert.Empty(store.List());
        var corrupt=JsonDocument.Parse(Invoke(new Bridge(store,pickFile:_=>new("bad.md",[0xff])),"files.pickMarkdown"));Assert.NotEqual(JsonValueKind.Null,corrupt.RootElement.GetProperty("error").ValueKind);
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
    [Fact] public void TrashRpcRejectsDirtyAndStaleDeletesAndKeepsDuplicateRequestsSafe()
    {
        var store = Store();
        var first = store.Create("2026-11-05", "RPC recovery 中文");
        var block = new BlockAnchor(Guid.CreateVersion7(), "paragraph", 0, 5);
        var note = store.Save(Edit(first, "hello", [block]));
        var markdown = File.ReadAllBytes(store.Safe("Journal", note.Header.Id + ".md"));
        var sidecar = File.ReadAllBytes(store.Safe(".gitpad", "anchors", note.Header.Id + ".json"));
        var bridge = new Bridge(store);
        JsonElement Call(string method, object parameters)
        {
            using var response = JsonDocument.Parse(bridge.Handle(JsonSerializer.Serialize(new {
                protocolVersion = 1, requestId = Guid.NewGuid().ToString(), method, @params = parameters
            })));
            return response.RootElement.Clone();
        }
        Call("documents.dirty", true);
        var dirty = Call("documents.delete", new { id = note.Header.Id, revision = note.Sidecar.Revision });
        Assert.Equal("InvalidRequest", dirty.GetProperty("error").GetProperty("code").GetString());
        Assert.Single(store.List()); Assert.Empty(store.ListTrash());
        Call("documents.dirty", false);
        var stale = Call("documents.delete", new { id = note.Header.Id, revision = first.Sidecar.Revision });
        Assert.Equal("Conflict", stale.GetProperty("error").GetProperty("code").GetString());
        Assert.Equal(markdown, File.ReadAllBytes(store.Safe("Journal", note.Header.Id + ".md")));
        Assert.Equal(JsonValueKind.Null, Call("documents.delete", new { id = note.Header.Id, revision = note.Sidecar.Revision }).GetProperty("error").ValueKind);
        var duplicate = Call("documents.delete", new { id = note.Header.Id, revision = note.Sidecar.Revision });
        Assert.NotEqual(JsonValueKind.Null, duplicate.GetProperty("error").ValueKind);
        Assert.Empty(store.List());
        Assert.Single(Call("documents.trash", new { }).GetProperty("result").EnumerateArray());
        Assert.Equal(markdown, File.ReadAllBytes(store.Safe(".gitpad", "trash", note.Header.Id.ToString(), "document.md")));
        Assert.Equal(sidecar, File.ReadAllBytes(store.Safe(".gitpad", "trash", note.Header.Id.ToString(), "sidecar.json")));
        foreach (var attempt in new[] { 1, 2 })
            Assert.Equal(JsonValueKind.Null, Call("documents.restore", new { id = note.Header.Id }).GetProperty("error").ValueKind);
        Assert.Equal(markdown, File.ReadAllBytes(store.Safe("Journal", note.Header.Id + ".md")));
        Assert.Equal(sidecar, File.ReadAllBytes(store.Safe(".gitpad", "anchors", note.Header.Id + ".json")));
        Assert.Equivalent(note, Store().Load(note.Header.Id));
        Assert.Empty(store.ListTrash());
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
    [Fact] public void UnpackagedActivationExtractsOnlyAValidatedNoteArgument()
    {
        var link=$"gitpadplus://note/{Guid.CreateVersion7()}?block={Guid.CreateVersion7()}";
        Assert.Equal(link,Identity.LinkFromActivationArguments(link));
        Assert.Equal(link,Identity.LinkFromActivationArguments("\"C:\\Program Files\\GitPad+\\GitPadPlus.App.exe\" \""+link+"\""));
        Assert.Null(Identity.LinkFromActivationArguments("prefix-"+link));
        Assert.Null(Identity.LinkFromActivationArguments("gitpadplus://note/"+Guid.NewGuid()));
        Assert.Null(Identity.LinkFromActivationArguments(null));
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
