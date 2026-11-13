// SPDX-License-Identifier: AGPL-3.0-only
using System.Text;
using System.Text.Json;
using Microsoft.Data.Sqlite;

namespace GitPadPlus.Core;

/// <summary>Markdown/sidecars are authoritative; SQLite is a disposable projection.</summary>
public sealed partial class VaultStore
{
    private readonly object gate = new();
    private readonly string root;
    private readonly Action<string>? checkpoint;
    private readonly string marker;
    private readonly string? trustedPlatformBase;
    public List<RecoveryIssue> RecoveryIssues { get; } = [];
    public string Root => root;
    private string Meta => Safe(".gitpad");
    private string Db => Safe(".gitpad", "index.sqlite");
    private static readonly UTF8Encoding Utf8 = new(false, true);

    public VaultStore(string managedRoot, Action<string>? checkpoint = null, string? trustedPlatformBase = null)
    {
        root = Path.GetFullPath(managedRoot);
        if (Path.GetPathRoot(root) == root) throw new ArgumentException("A dedicated application directory is required.");
        this.checkpoint = checkpoint;
        this.trustedPlatformBase=trustedPlatformBase is null?null:Path.GetFullPath(trustedPlatformBase);
        if(this.trustedPlatformBase is not null&&!root.StartsWith(this.trustedPlatformBase+Path.DirectorySeparatorChar,StringComparison.Ordinal))throw new ArgumentException("Vault must be below the OS-provided private application base.");
        RejectLinks(root);
        marker = Path.Combine(root, ".gitpad-owned");
        if (Directory.Exists(root) && !File.Exists(marker) && Directory.EnumerateFileSystemEntries(root).Any())
            throw new UnauthorizedAccessException("Refusing to adopt a nonempty, unmanaged directory.");
        Directory.CreateDirectory(root);
        if (!File.Exists(marker)) DurableWrite(marker, Guid.NewGuid().ToString("N"));
        RecoverClear();
        foreach (var path in new[] { "Journal", "Assets", ".gitpad/anchors", ".gitpad/transactions", ".gitpad/trash" }) Directory.CreateDirectory(Safe(path));
        Recover();
        InitializeIndex();
    }

    public string Safe(params string[] pieces)
    {
        var path = Path.GetFullPath(Path.Combine(new[] { root }.Concat(pieces).ToArray()));
        if (!path.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.Ordinal) && path != root)
            throw new UnauthorizedAccessException("Path escapes the application vault.");
        RejectLinks(path);
        return path;
    }
    private void RejectLinks(string path)
    {
        for (var current = path; !string.IsNullOrEmpty(current); current = Path.GetDirectoryName(current))
        {
            // Only the native Android shell supplies its OS-owned private base.
            // Android app mount namespaces can expose system aliases above it.
            if(current==trustedPlatformBase)return;
            if (File.Exists(current) || Directory.Exists(current))
            {
                var attributes = File.GetAttributes(current);
                if ((attributes & FileAttributes.ReparsePoint) != 0) throw new UnauthorizedAccessException("Symbolic links and reparse points are not allowed.");
            }
            else if (new FileInfo(current).LinkTarget is not null) throw new UnauthorizedAccessException("Dangling link rejected.");
        }
    }
    private string Markdown(Guid id) => Safe("Journal", Identity.Require(id) + ".md");
    private string AnchorPath(Guid id) => Safe(".gitpad", "anchors", Identity.Require(id) + ".json");
    private static void DurableWrite(string path, string value)
    {
        using var stream = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.None);
        stream.Write(Utf8.GetBytes(value));
        stream.Flush(flushToDisk: true);
    }
    private static T Read<T>(string path) => JsonSerializer.Deserialize<T>(File.ReadAllText(path, Utf8), DataJson.Default.Options) ?? throw new InvalidDataException("Invalid JSON.");
    private static string Json<T>(T value) => JsonSerializer.Serialize(value, DataJson.Default.Options);

    public Note Create(string date, string title)
    {
        lock (gate)
        {
            if (!DateOnly.TryParseExact(date, "yyyy-MM-dd", out _)) throw new ArgumentException("Date must be YYYY-MM-DD.");
            var now = DateTimeOffset.UtcNow;
            var id = Guid.CreateVersion7();
            var header = new DocumentHeader(1, id, date, title, [], now, now);
            var text = Frontmatter.Encode(header, "");
            var sidecar = new Sidecar(1, id, 1, Identity.Hash(text), [], []);
            Commit(id, "", text, sidecar);
            Project(header, "");
            return new(header, "", sidecar);
        }
    }
    public Note Load(Guid id, bool verifyHead = true)
    {
        lock (gate)
        {
            try
            {
            var raw = File.ReadAllText(Markdown(id), Utf8);
            var parsed = Frontmatter.Decode(raw);
            var sidecar = Read<Sidecar>(AnchorPath(id));
            if (parsed.Header.Id != id || sidecar.DocumentId != id || sidecar.SchemaVersion != 1 || sidecar.Blocks is null || sidecar.Selections is null || sidecar.ContentHash != Identity.Hash(raw))
                throw new RecoveryRequiredException("Markdown/sidecar mismatch; retained unchanged for recovery. External edits require explicit reconciliation.");
            ValidateAnchors(new(id,parsed.Body,parsed.Header.Title,parsed.Header.Tags,sidecar.Revision,sidecar.ContentHash,sidecar.Blocks,sidecar.Selections));
            var headPath=Safe(".gitpad","heads",id+".json");
            if(verifyHead && File.Exists(headPath))
            {
                var head=Read<PairHead>(headPath);
                if(head.MarkdownHash!=Identity.Hash(raw)||head.SidecarHash!=Identity.Hash(File.ReadAllText(AnchorPath(id),Utf8)))
                    throw new RecoveryRequiredException("Externally modified pair; explicit reconciliation required.");
            }
            return new(parsed.Header, parsed.Body, sidecar);
            }
            catch (Exception ex) when (ex is YamlDotNet.Core.YamlException or JsonException or FormatException or InvalidDataException or ArgumentException)
            { throw new RecoveryRequiredException("Invalid persisted metadata; original files retained for repair."); }
        }
    }
    public Note Save(SaveRequest request)
    {
        lock (gate)
        {
            var existing = Load(request.Id);
            if (request.ExpectedRevision != existing.Sidecar.Revision || request.ExpectedHash != existing.Sidecar.ContentHash)
                throw new RevisionConflictException("Stale save rejected. Reload before retrying.");
            ValidateAnchors(request);
            var raw = File.ReadAllText(Markdown(request.Id), Utf8);
            var unchanged = request.Body == existing.Body && request.Title == existing.Header.Title && request.Tags.SequenceEqual(existing.Header.Tags)
                && Json(request.Blocks) == Json(existing.Sidecar.Blocks) && Json(request.Selections) == Json(existing.Sidecar.Selections);
            if (unchanged) return existing; // Byte-preserving no-op, including CRLF/frontmatter spacing.
            var header = existing.Header with { Title = request.Title, Tags = request.Tags, UpdatedAt = DateTimeOffset.UtcNow };
            var text = Frontmatter.Encode(header, request.Body, Frontmatter.Decode(raw).Yaml);
            var sidecar = new Sidecar(1, request.Id, checked(existing.Sidecar.Revision + 1), Identity.Hash(text), request.Blocks, request.Selections);
            Commit(request.Id, existing.Sidecar.ContentHash, text, sidecar);
            Project(header, request.Body);
            return new(header, request.Body, sidecar);
        }
    }
    private static void ValidateAnchors(SaveRequest request)
    {
        var ids = new HashSet<Guid>();
        foreach (var block in request.Blocks)
        {
            if (!ids.Add(Identity.Require(block.Id)) || block.Start < 0 || block.End < block.Start || block.End > request.Body.Length)
                throw new ArgumentException("Invalid or duplicate block.");
            foreach (var alias in block.Aliases ?? []) Identity.Require(alias);
        }
        foreach (var selection in request.Selections)
        {
            if (!ids.Add(Identity.Require(selection.Id)) || !request.Blocks.Any(b => b.Id == selection.BlockId)
                || selection.NormalizationVersion != 1 || selection.Start < 0 || selection.End < selection.Start)
                throw new ArgumentException("Invalid persistent selection.");
        }
    }
    private void Commit(Guid id, string oldHash, string text, Sidecar sidecar)
    {
        var folder = Safe(".gitpad", "transactions", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(folder);
        DurableWrite(Path.Combine(folder, "new.md"), text);
        DurableWrite(Path.Combine(folder, "new.json"), Json(sidecar));
        if (File.Exists(Markdown(id))) File.Copy(Markdown(id), Path.Combine(folder, "previous.md"));
        if (File.Exists(AnchorPath(id))) File.Copy(AnchorPath(id), Path.Combine(folder, "previous.json"));
        var previousSidecar=Path.Combine(folder,"previous.json");
        DurableWrite(Path.Combine(folder, "transaction.json"), Json(new SaveTransaction(id, oldHash, sidecar.ContentHash,File.Exists(previousSidecar)?Identity.Hash(File.ReadAllText(previousSidecar,Utf8)):"")));
        checkpoint?.Invoke("Staged");
        Finish(folder);
    }
    private void Finish(string folder)
    {
        var transaction = Read<SaveTransaction>(Path.Combine(folder, "transaction.json"));
        var target = Markdown(transaction.Id);
        var current = File.Exists(target) ? Identity.Hash(File.ReadAllText(target, Utf8)) : "";
        var stagedSidecar = Path.Combine(folder, "new.json");
        var actualSidecar=File.Exists(AnchorPath(transaction.Id))?Identity.Hash(File.ReadAllText(AnchorPath(transaction.Id),Utf8)):"";
        var nextSidecar=File.Exists(stagedSidecar)?Identity.Hash(File.ReadAllText(stagedSidecar,Utf8)):actualSidecar;
        if(transaction.OldSidecarHash is not null && actualSidecar!=transaction.OldSidecarHash && actualSidecar!=nextSidecar)
            throw new RecoveryRequiredException("External sidecar modification; all staged copies retained.");
        if (current != transaction.OldHash && current != transaction.NewHash)
            throw new RecoveryRequiredException("External modification conflicts with pending transaction; backups retained.");
        var staged = Path.Combine(folder, "new.md");
        if (current != transaction.NewHash)
        {
            if (!File.Exists(staged) || Identity.Hash(File.ReadAllText(staged, Utf8)) != transaction.NewHash)
                throw new RecoveryRequiredException("Invalid staged Markdown; previous copy retained.");
            File.Move(staged, target, true);
        }
        checkpoint?.Invoke("MarkdownReplaced");
        if (File.Exists(stagedSidecar))
        {
            var sidecar = Read<Sidecar>(stagedSidecar);
            if (sidecar.ContentHash != transaction.NewHash || sidecar.DocumentId != transaction.Id)
                throw new RecoveryRequiredException("Invalid staged sidecar; backups retained.");
            File.Move(stagedSidecar, AnchorPath(transaction.Id), true);
        }
        checkpoint?.Invoke("SidecarReplaced");
        _ = Load(transaction.Id,verifyHead:false);
        Directory.CreateDirectory(Safe(".gitpad","heads"));
        var head=Safe(".gitpad","heads",transaction.Id+".json");
        DurableWrite(head+".new",Json(new PairHead(transaction.NewHash,Identity.Hash(File.ReadAllText(AnchorPath(transaction.Id),Utf8)))));
        File.Move(head+".new",head,true);
        Directory.Delete(folder, true);
    }
    public void Recover()
    {
        lock (gate)
        {
            foreach (var folder in Directory.EnumerateDirectories(Safe(".gitpad", "transactions")))
            {
                _ = Safe(Path.GetRelativePath(root, folder));
                if (File.Exists(Path.Combine(folder, "transaction.json")))
                {
                    Guid? documentId=null;
                    try { documentId=Read<SaveTransaction>(Path.Combine(folder,"transaction.json")).Id;Finish(folder); }
                    catch (Exception ex) when (ex is IOException or JsonException or ArgumentException) { RecoveryIssues.Add(new(documentId, "TransactionConflict")); }
                }
            }
            foreach (var folder in Directory.EnumerateDirectories(Safe(".gitpad", "trash")))
            {
                _ = Safe(Path.GetRelativePath(root, folder));
                var markerPath = Path.Combine(folder, "deleted.json");
                if (!File.Exists(markerPath)) continue;
                var deleted = Read<DeleteMarker>(markerPath);
                foreach (var pair in new[] { (Markdown(deleted.Id), "document.md"), (AnchorPath(deleted.Id), "sidecar.json") })
                    if (File.Exists(pair.Item1))
                    {
                        var destination = Path.Combine(folder, pair.Item2);
                        if (File.Exists(destination)) throw new RecoveryRequiredException("Trash recovery conflict; copies retained.");
                        File.Move(pair.Item1, destination);
                    }
            }
        }
    }

    private SqliteConnection Connect()
    {
        var connection = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = Db, Pooling = false }.ToString());
        connection.Open();
        return connection;
    }
    private void InitializeIndex()
    {
        try
        {
            using var connection = Connect();
            using var command = connection.CreateCommand();
            command.CommandText = "CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY, date TEXT NOT NULL, title TEXT NOT NULL, tags TEXT NOT NULL); CREATE INDEX IF NOT EXISTS notes_date ON notes(date); CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(id UNINDEXED,title,body);";
            command.ExecuteNonQuery();
            RebuildIndex();
        }
        catch (SqliteException ex) when (ex.SqliteErrorCode is 11 or 26)
        {
            File.Move(Db, Safe(".gitpad", "corrupt-index-" + Guid.NewGuid().ToString("N") + ".sqlite"));
            InitializeIndex();
        }
    }
    public void RebuildIndex()
    {
        lock (gate)
        {
            using var connection=Connect();
            using var transaction=connection.BeginTransaction();
            using (var command = connection.CreateCommand())
            {
                command.Transaction=transaction;
                command.CommandText = "DELETE FROM notes; DELETE FROM search;";
                command.ExecuteNonQuery();
            }
            foreach (var file in Directory.EnumerateFiles(Safe("Journal"), "*.md"))
            {
                _ = Safe("Journal", Path.GetFileName(file));
                if (!Guid.TryParse(Path.GetFileNameWithoutExtension(file), out var id)) { RecoveryIssues.Add(new(null, "UnknownFilename")); continue; }
                try { var note = Load(id); Project(connection,transaction,note.Header, note.Body); }
                catch (Exception ex) when (ex is IOException or ArgumentException) { if (!RecoveryIssues.Any(i => i.DocumentId == id)) RecoveryIssues.Add(new(id, "MetadataMismatch")); }
            }
            transaction.Commit();
        }
    }
    private void Project(DocumentHeader header, string body)
    {
        using var connection = Connect();
        using var transaction = connection.BeginTransaction();
        Project(connection,transaction,header,body);
        transaction.Commit();
    }
    private static void Project(SqliteConnection connection,SqliteTransaction transaction,DocumentHeader header,string body)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "INSERT OR REPLACE INTO notes VALUES($id,$date,$title,$tags); DELETE FROM search WHERE id=$id; INSERT INTO search VALUES($id,$title,$body);";
        command.Parameters.AddWithValue("$id", header.Id.ToString());
        command.Parameters.AddWithValue("$date", header.Date);
        command.Parameters.AddWithValue("$title", header.Title);
        command.Parameters.AddWithValue("$tags", Json(header.Tags));
        command.Parameters.AddWithValue("$body", body);
        command.ExecuteNonQuery();
    }
    public NoteSummary[] List(string? date = null, string? search = null)
    {
        lock (gate)
        {
            using var connection = Connect();
            using var command = connection.CreateCommand();
            command.CommandText = "SELECT id,date,title,tags FROM notes WHERE ($date IS NULL OR date=$date) AND ($search IS NULL OR id IN (SELECT id FROM search WHERE search MATCH $search)) ORDER BY date DESC,id";
            command.Parameters.AddWithValue("$date", (object?)date ?? DBNull.Value);
            // Quote as a literal FTS phrase; do not allow user text to become FTS syntax.
            command.Parameters.AddWithValue("$search", search is null ? DBNull.Value : '"' + search.Replace("\"", "\"\"") + '"');
            using var reader = command.ExecuteReader();
            var rows = new List<NoteSummary>();
            while (reader.Read()) rows.Add(new(Guid.Parse(reader.GetString(0)), reader.GetString(1), reader.GetString(2), JsonSerializer.Deserialize<string[]>(reader.GetString(3)) ?? []));
            return rows.ToArray();
        }
    }
    public void Delete(Guid id, long revision)
    {
        lock (gate)
        {
            var note = Load(id);
            if (revision != note.Sidecar.Revision) throw new RevisionConflictException("Stale delete rejected.");
            // A durable tombstone makes a crash between moves detectable and repeatable.
            var trash = Safe(".gitpad", "trash", id.ToString());
            Directory.CreateDirectory(trash);
            DurableWrite(Path.Combine(trash, "deleted.json"), Json(new DeleteMarker(id, revision)));
            File.Move(Markdown(id), Path.Combine(trash, "document.md"), true);
            File.Move(AnchorPath(id), Path.Combine(trash, "sidecar.json"), true);
            RebuildIndex();
        }
    }
    public AppSettings GetSettings() => File.Exists(Safe(".gitpad", "settings.json")) ? Read<AppSettings>(Safe(".gitpad", "settings.json")) : new();
    public WorkspaceState GetWorkspace() => File.Exists(Safe(".gitpad", "session.json")) ? Read<WorkspaceState>(Safe(".gitpad", "session.json")) : new([], null);
    public WorkspaceState SetWorkspace(WorkspaceState workspace)
    {
        lock (gate)
        {
            if (workspace.Tabs.Length > 100 || workspace.Tabs.Distinct().Count() != workspace.Tabs.Length) throw new ArgumentException("Invalid workspace tabs.");
            foreach (var id in workspace.Tabs) Identity.Require(id);
            if (workspace.ActiveId is Guid active && !workspace.Tabs.Contains(active)) throw new ArgumentException("Active note must be an open tab.");
            if(workspace.SecondaryId is Guid secondary){Identity.Require(secondary);if(secondary==workspace.ActiveId)throw new ArgumentException("Each pane must have a distinct document.");}
            var previous = GetWorkspace();
            if (workspace.Sequence <= previous.Sequence) return previous;
            var temp = Safe(".gitpad", "session.new"); DurableWrite(temp, Json(workspace));
            File.Move(temp, Safe(".gitpad", "session.json"), true); return workspace;
        }
    }
    public AppSettings SetSettings(AppSettings settings)
    {
        lock (gate)
        {
            if (settings.Theme is not ("system" or "light" or "dark")) throw new ArgumentException("Unknown theme.");
            var temp = Safe(".gitpad", "settings.new");
            DurableWrite(temp, Json(settings));
            File.Move(temp, Safe(".gitpad", "settings.json"), true);
            return settings;
        }
    }
    public string ImportImage(string filename, byte[] bytes)
    {
        lock (gate)
        {
            if (bytes.Length is 0 or > 16_000_000) throw new ArgumentException("Images must be 1 byte to 16 MB.");
            // Sniff content and reject active SVG/HTML; never trust a caller extension.
            var extension = bytes.AsSpan().StartsWith(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }) ? ".png"
                : bytes.AsSpan().StartsWith(new byte[] { 255, 216, 255 }) ? ".jpg"
                : bytes.Length > 6 && Encoding.ASCII.GetString(bytes, 0, 6) is "GIF87a" or "GIF89a" ? ".gif"
                : throw new ArgumentException("Only PNG, JPEG and GIF images are accepted.");
            var hash = Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(bytes));
            var name = hash + extension;
            var target = Safe("Assets", name);
            if (File.Exists(target) && Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(target))) != hash) throw new RecoveryRequiredException("Existing asset hash mismatch; file retained.");
            if (!File.Exists(target))
            {
                var temp = Safe("Assets", name + ".new");
                using (var file = new FileStream(temp, FileMode.Create, FileAccess.Write)) { file.Write(bytes); file.Flush(true); }
                File.Move(temp, target, true);
            }
            return "../Assets/" + name;
        }
    }
    public ClearPreview PreviewClear(bool hasUnsavedChanges)
    {
        lock (gate)
        {
            if (hasUnsavedChanges) throw new InvalidOperationException("Save or discard unsaved edits before clearing data.");
            var files = EnumerateChecked(root).Order(StringComparer.Ordinal).ToArray();
            var fingerprint = File.ReadAllText(marker) + string.Join(";", files.Select(p => Path.GetRelativePath(root, p) + ":" + new FileInfo(p).Length + ":" + File.GetLastWriteTimeUtc(p).Ticks));
            var assets = files.Where(p => p.StartsWith(Safe("Assets") + Path.DirectorySeparatorChar, StringComparison.Ordinal)).ToArray();
            return new(Identity.Hash(fingerprint), Directory.EnumerateFiles(Safe("Journal"),"*.md").Count(), assets.Length, assets.Sum(p => new FileInfo(p).Length), File.Exists(Db) ? new FileInfo(Db).Length : 0);
        }
    }
    private IEnumerable<string> EnumerateChecked(string directory)
    {
        foreach (var entry in Directory.EnumerateFileSystemEntries(directory))
        {
            _ = Safe(Path.GetRelativePath(root, entry));
            if (Directory.Exists(entry)) { foreach (var file in EnumerateChecked(entry)) yield return file; }
            else yield return entry;
        }
    }
    public void Clear(string confirmation, bool hasUnsavedChanges)
    {
        lock (gate)
        {
            if (!File.Exists(marker) || confirmation != PreviewClear(hasUnsavedChanges).Confirmation) throw new UnauthorizedAccessException("Clear confirmation expired or vault is unmanaged.");
            // Only dedicated managed subdirectories are removed; the root is never recursively deleted.
            BeginClear();
            foreach (var path in new[] { "Journal", "Assets", ".gitpad/anchors", ".gitpad/transactions", ".gitpad/trash" }) Directory.CreateDirectory(Safe(path));
            RecoveryIssues.Clear();
            InitializeIndex();
        }
    }
}
