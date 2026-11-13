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
public record BlockAnchor(Guid Id, string Kind, int Start, int End, bool Deleted = false, Guid[]? Aliases = null, int[]? Path = null);
public record SelectionAnchor(Guid Id, Guid BlockId, string Exact, string Prefix, string Suffix, int Start, int End, int NormalizationVersion = 1);
public record Sidecar(int SchemaVersion, Guid DocumentId, long Revision, string ContentHash, BlockAnchor[] Blocks, SelectionAnchor[] Selections);
public record Note(DocumentHeader Header, string Body, Sidecar Sidecar);
public record SaveRequest(Guid Id, string Body, string Title, string[] Tags, long ExpectedRevision, string ExpectedHash, BlockAnchor[] Blocks, SelectionAnchor[] Selections);
public record NoteSummary(Guid Id, string Date, string Title, string[] Tags);
public record ClearPreview(string Confirmation, int Notes, int Attachments, long AttachmentBytes, long IndexBytes);
public record AppSettings(bool MarkdownPeek = true, bool NativeWordSelection = false, string Theme = "system", string[]? DisabledPlugins = null);
public record GitStatus(string State = "NotConfigured");
public record LinkTarget(Guid DocumentId, Guid? BlockId, Guid? SelectionId);
public record SaveTransaction(Guid Id, string OldHash, string NewHash, string? OldSidecarHash = null);
public record PairHead(string MarkdownHash, string SidecarHash);
public record DeleteMarker(Guid Id, long Revision);
public record RecoveryIssue(Guid? DocumentId, string Code);
public record WorkspaceState(Guid[] Tabs, Guid? ActiveId, long Sequence = 0, Guid? SecondaryId = null);
public record PackagedPlugin(string Id, string Module, string[] Permissions, string[] Methods);

public static class Identity
{
    public static Guid Require(Guid id) => id.Version == 7 && (id.ToByteArray()[8] & 0xc0) == 0x80 ? id : throw new ArgumentException("An RFC 9562 UUIDv7 is required.");
    public static string Hash(string text) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(text)));
    public static string? LinkFromActivationArguments(string? arguments)
    {
        if(arguments is null)return null;
        // Unpackaged Windows activation may include the quoted executable path.
        // Note links contain no whitespace or quote characters by format.
        foreach(var token in arguments.Split([' ','\t','\r','\n','"'],StringSplitOptions.RemoveEmptyEntries)){
            if(!token.StartsWith("gitpadplus://",StringComparison.OrdinalIgnoreCase))continue;
            try{_=ParseLink(token);return token;}catch(Exception ex)when(ex is ArgumentException or FormatException){}
        }
        return null;
    }
    public static LinkTarget ParseLink(string value)
    {
        var uri = new Uri(value, UriKind.Absolute);
        if (uri.Scheme != "gitpadplus" || uri.Host != "note" || uri.Port != -1 || uri.UserInfo != "" || uri.Fragment != "") throw new ArgumentException("Invalid note URI.");
        var segments = uri.AbsolutePath.Split('/');
        if (segments.Length != 2 || !Guid.TryParseExact(segments[1], "D", out var documentId)) throw new ArgumentException("Invalid note path.");
        var id = Require(documentId);
        Guid? block = null, selection = null;
        foreach (var pair in uri.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var bits = pair.Split('=');
            if (bits.Length != 2) throw new ArgumentException("Invalid link query.");
            if (!Guid.TryParseExact(Uri.UnescapeDataString(bits[1]), "D", out var parsedTarget)) throw new ArgumentException("Invalid target UUID.");
            var target = Require(parsedTarget);
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
[JsonSerializable(typeof(PairHead))]
[JsonSerializable(typeof(ClearTransaction))]
[JsonSerializable(typeof(DeleteMarker))]
[JsonSerializable(typeof(BlockAnchor[]))]
[JsonSerializable(typeof(SelectionAnchor[]))]
[JsonSerializable(typeof(string[]))]
[JsonSerializable(typeof(RecoveryIssue[]))]
[JsonSerializable(typeof(WorkspaceState))]
[JsonSerializable(typeof(PluginData))]
[JsonSerializable(typeof(RecoveryInspection))]
[JsonSerializable(typeof(RecoveryBuffer))]
[JsonSerializable(typeof(PackagedPlugin[]))]
[JsonSerializable(typeof(RecoveryVersion[]))]
public partial class DataJson : JsonSerializerContext;

public sealed class RevisionConflictException(string message) : IOException(message);
public sealed class RecoveryRequiredException(string message) : IOException(message);
