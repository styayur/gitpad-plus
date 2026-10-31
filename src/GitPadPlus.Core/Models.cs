// SPDX-License-Identifier: AGPL-3.0-only
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace GitPadPlus.Core;

[method: JsonConstructor]
public record DocumentHeader(int SchemaVersion, Guid Id, string Date, string Title, string[] Tags, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt)
{
    public DocumentHeader() : this(1, Guid.Empty, "", "", [], default, default) { }
}
public record BlockAnchor(Guid Id, string Kind, int Start, int End, bool Deleted = false, Guid[]? Aliases = null);
public record SelectionAnchor(Guid Id, Guid BlockId, string Exact, string Prefix, string Suffix, int Start, int End, int NormalizationVersion = 1);
public record Sidecar(int SchemaVersion, Guid DocumentId, long Revision, string ContentHash, BlockAnchor[] Blocks, SelectionAnchor[] Selections);
public record Note(DocumentHeader Header, string Body, Sidecar Sidecar);
public record SaveRequest(Guid Id, string Body, string Title, string[] Tags, long ExpectedRevision, string ExpectedHash, BlockAnchor[] Blocks, SelectionAnchor[] Selections);
public record NoteSummary(Guid Id, string Date, string Title, string[] Tags);
public record ClearPreview(string Confirmation, int Notes, int Attachments, long AttachmentBytes, long IndexBytes);
public record AppSettings(bool MarkdownPeek = true, bool NativeWordSelection = false, string Theme = "system");
public record GitStatus(string State = "NotConfigured");
public record LinkTarget(Guid DocumentId, Guid? BlockId, Guid? SelectionId);
public record SaveTransaction(Guid Id, string OldHash, string NewHash);
public record DeleteMarker(Guid Id, long Revision);
public record RecoveryIssue(Guid? DocumentId, string Code);

public static class Identity
{
    public static Guid Require(Guid id) => id.Version == 7 && (id.ToByteArray()[8] & 0xc0) == 0x80 ? id : throw new ArgumentException("An RFC 9562 UUIDv7 is required.");
    public static string Hash(string text) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(text)));
    public static LinkTarget ParseLink(string value)
    {
        var uri = new Uri(value, UriKind.Absolute);
        if (uri.Scheme != "gitpadplus" || uri.Host != "note" || uri.Port != -1 || uri.UserInfo != "" || uri.Fragment != "") throw new ArgumentException("Invalid note URI.");
        var id = Require(Guid.Parse(uri.AbsolutePath.Trim('/')));
        Guid? block = null, selection = null;
        foreach (var pair in uri.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var bits = pair.Split('=');
            if (bits.Length != 2) throw new ArgumentException("Invalid link query.");
            var target = Require(Guid.Parse(Uri.UnescapeDataString(bits[1])));
            if (bits[0] == "block" && block is null) block = target;
            else if (bits[0] == "selection" && selection is null) selection = target;
            else throw new ArgumentException("Unknown or repeated link target.");
        }
        if (block is not null && selection is not null) throw new ArgumentException("Choose one link level.");
        return new(id, block, selection);
    }
}

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase, WriteIndented = true)]
[JsonSerializable(typeof(DocumentHeader))]
[JsonSerializable(typeof(Sidecar))]
[JsonSerializable(typeof(Note))]
[JsonSerializable(typeof(SaveRequest))]
[JsonSerializable(typeof(AppSettings))]
[JsonSerializable(typeof(NoteSummary[]))]
[JsonSerializable(typeof(SaveTransaction))]
[JsonSerializable(typeof(DeleteMarker))]
[JsonSerializable(typeof(BlockAnchor[]))]
[JsonSerializable(typeof(SelectionAnchor[]))]
[JsonSerializable(typeof(string[]))]
[JsonSerializable(typeof(RecoveryIssue[]))]
public partial class DataJson : JsonSerializerContext;

public sealed class RevisionConflictException(string message) : IOException(message);
public sealed class RecoveryRequiredException(string message) : IOException(message);
