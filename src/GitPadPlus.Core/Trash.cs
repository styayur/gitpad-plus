// SPDX-License-Identifier: AGPL-3.0-only
namespace GitPadPlus.Core;

public sealed partial class VaultStore
{
    public NoteSummary[] ListTrash()
    {
        lock (gate)
        {
            return Directory.EnumerateDirectories(Safe(".gitpad", "trash"))
                .Where(folder => File.Exists(Safe(Path.GetRelativePath(root, folder), "deleted.json")))
                .Select(folder =>
                {
                    var marker = Read<DeleteMarker>(Safe(Path.GetRelativePath(root, folder), "deleted.json"));
                    var header = Frontmatter.Decode(File.ReadAllText(Safe(Path.GetRelativePath(root, folder), "document.md"), Utf8)).Header;
                    if (header.Id != marker.Id) throw new RecoveryRequiredException("Trash document identity mismatch.");
                    return new NoteSummary(header.Id, header.Date, header.Title, header.Tags);
                }).ToArray();
        }
    }

    public Note Restore(Guid id)
    {
        lock (gate)
        {
            var folder = Safe(".gitpad", "trash", Identity.Require(id).ToString());
            var marker = Safe(Path.GetRelativePath(root, folder), "restoring.json");
            if (!File.Exists(marker))
            {
                if (File.Exists(Markdown(id)) || File.Exists(AnchorPath(id)))
                {
                    // A completed source-pair restore may lose its response or
                    // fail while rebuilding the disposable index. Accept only
                    // an exact replay of a retained committed transaction.
                    var archive = Safe(".gitpad", "restored", id.ToString());
                    if (!Directory.Exists(folder) && Directory.Exists(archive)
                        && File.Exists(Markdown(id)) && File.Exists(AnchorPath(id)))
                    {
                        var markdownHash = RestoreHash(Markdown(id));
                        var sidecarHash = RestoreHash(AnchorPath(id));
                        foreach (var entry in Directory.EnumerateDirectories(archive))
                        {
                            var retained = Read<RestoreMarker>(Safe(Path.GetRelativePath(root, entry), "restoring.json"));
                            if (retained.Id != id || retained.MarkdownHash != markdownHash
                                || retained.SidecarHash != sidecarHash) continue;
                            RebuildIndex();
                            return Load(id);
                        }
                    }
                    throw new RevisionConflictException("An active document already occupies this identity.");
                }
                var deleted = Read<DeleteMarker>(Safe(Path.GetRelativePath(root, folder), "deleted.json"));
                var text = File.ReadAllText(Safe(Path.GetRelativePath(root, folder), "document.md"), Utf8);
                var sidecar = Read<Sidecar>(Safe(Path.GetRelativePath(root, folder), "sidecar.json"));
                if (deleted.Id != id || Frontmatter.Decode(text).Header.Id != id || sidecar.DocumentId != id
                    || sidecar.Revision != deleted.Revision || sidecar.ContentHash != Identity.Hash(text))
                    throw new RecoveryRequiredException("Incomplete or inconsistent trash source pair.");
                DurableWrite(marker, Json(new RestoreMarker(id, RestoreHash(Safe(Path.GetRelativePath(root, folder), "document.md")),
                    RestoreHash(Safe(Path.GetRelativePath(root, folder), "sidecar.json")))));
                checkpoint?.Invoke("RestoreStaged");
            }
            FinishRestore(folder);
            checkpoint?.Invoke("RestoreCommitted");
            RebuildIndex();
            return Load(id);
        }
    }

    private void FinishRestore(string folder)
    {
        var restore = Read<RestoreMarker>(Safe(Path.GetRelativePath(root, folder), "restoring.json"));
        if (Path.GetFileName(folder) != Identity.Require(restore.Id).ToString())
            throw new RecoveryRequiredException("Restore transaction identity mismatch.");
        RestoreFile(folder, "document.md", Markdown(restore.Id), restore.MarkdownHash);
        checkpoint?.Invoke("RestoreMarkdownReplaced");
        RestoreFile(folder, "sidecar.json", AnchorPath(restore.Id), restore.SidecarHash);
        checkpoint?.Invoke("RestoreSidecarReplaced");
        _ = Load(restore.Id);
        // Moving the whole tombstone directory commits the restore atomically.
        // A crash cannot expose the old deletion marker without its restore marker.
        var archive = Safe(".gitpad", "restored", restore.Id.ToString());
        Directory.CreateDirectory(archive);
        Directory.Move(folder, Path.Combine(archive, Guid.NewGuid().ToString("N")));
    }

    private static string RestoreHash(string path)
    {
        using var stream = File.OpenRead(path);
        return Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(stream));
    }

    private void RestoreFile(string folder, string name, string target, string expectedHash)
    {
        if (File.Exists(target))
        {
            if (RestoreHash(target) != expectedHash)
                throw new RecoveryRequiredException("Restore target changed; retained copies require review.");
            return;
        }
        var source = Safe(Path.GetRelativePath(root, folder), name);
        if (RestoreHash(source) != expectedHash)
            throw new RecoveryRequiredException("Retained restore source changed.");
        var staged = Safe(Path.GetRelativePath(root, folder), "restore-" + name);
        using (var input = File.OpenRead(source))
        using (var output = new FileStream(staged, FileMode.Create, FileAccess.Write, FileShare.None))
        {
            input.CopyTo(output);
            output.Flush(flushToDisk: true);
        }
        File.Move(staged, target);
    }
}
