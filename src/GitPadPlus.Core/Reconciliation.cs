// SPDX-License-Identifier: AGPL-3.0-only
namespace GitPadPlus.Core;

public record RecoveryVersion(string Name, string Markdown, string Sidecar);
public record RecoveryInspection(Guid Id, string Fingerprint, RecoveryVersion[] Versions);
public record RecoveryBuffer(string Body, string Title, BlockAnchor[] Blocks, SelectionAnchor[] Selections);
public record ReconcileRequest(Guid Id, string ExpectedFingerprint, string Markdown, RecoveryBuffer? Buffer = null);

public sealed partial class VaultStore
{
    public RecoveryInspection InspectRecovery(Guid id)
    {
        lock (gate)
        {
            Identity.Require(id);
            var versions = new List<RecoveryVersion>();
            static string Existing(string path) => File.Exists(path) ? File.ReadAllText(path, Utf8) : "";
            versions.Add(new("current", Existing(Markdown(id)), Existing(AnchorPath(id))));
            foreach (var folder in PendingFor(id))
            {
                var name = Path.GetFileName(folder);
                versions.Add(new(name + "/staged", Existing(Path.Combine(folder,"new.md")), Existing(Path.Combine(folder,"new.json"))));
                versions.Add(new(name + "/previous", Existing(Path.Combine(folder,"previous.md")), Existing(Path.Combine(folder,"previous.json"))));
            }
            return new(id, Identity.Hash(Json(versions.ToArray())), versions.ToArray());
        }
    }
    private string[] PendingFor(Guid id) => Directory.EnumerateDirectories(Safe(".gitpad","transactions"))
        .Where(folder => {
            _ = Safe(Path.GetRelativePath(root,folder));
            var path=Path.Combine(folder,"transaction.json");
            return File.Exists(path) && Read<SaveTransaction>(path).Id==id;
        }).Order(StringComparer.Ordinal).ToArray();

    public Note Reconcile(ReconcileRequest request)
    {
        lock (gate)
        {
            var inspected=InspectRecovery(request.Id);
            if(inspected.Fingerprint!=request.ExpectedFingerprint)throw new RevisionConflictException("Recovery inputs changed; inspect again.");
            var parsed=Frontmatter.Decode(request.Markdown);
            if(parsed.Header.Id!=request.Id || parsed.Header.SchemaVersion!=1)throw new ArgumentException("Recovery must retain document identity and schema.");
            // The immutable archive is complete and durable before retiring any
            // conflicting transaction or writing the user's chosen version.
            var archive=Safe(".gitpad","recovery",Guid.NewGuid().ToString("N"));Directory.CreateDirectory(archive);
            foreach(var (version,index) in inspected.Versions.Select((version,index)=>(version,index)))
            {
                DurableWrite(Path.Combine(archive,index+".md"),version.Markdown);
                DurableWrite(Path.Combine(archive,index+".json"),version.Sidecar);
            }
            DurableWrite(Path.Combine(archive,"inspection.json"),Json(inspected));
            if(request.Buffer is not null)DurableWrite(Path.Combine(archive,"editor-buffer.json"),Json(request.Buffer));
            Sidecar? previous=null;
            try { previous=Read<Sidecar>(AnchorPath(request.Id)); }
            catch(Exception ex) when(ex is IOException or System.Text.Json.JsonException) { /* Original bytes are archived. */ }
            var blocks=(previous?.Blocks??[]).Select(b=>b with {Deleted=true,Start=0,End=0}).ToArray();
            var sidecar=new Sidecar(1,request.Id,checked((previous?.Revision??0)+1),Identity.Hash(request.Markdown),blocks,previous?.Selections??[]);
            foreach(var pending in PendingFor(request.Id))Directory.Move(pending,Path.Combine(archive,Path.GetFileName(pending)));
            var current=inspected.Versions[0].Markdown;
            Commit(request.Id,File.Exists(Markdown(request.Id))?Identity.Hash(current):"",request.Markdown,sidecar);
            RecoveryIssues.RemoveAll(i=>i.DocumentId==request.Id);
            RebuildIndex();return Load(request.Id);
        }
    }
}
