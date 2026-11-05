// SPDX-License-Identifier: AGPL-3.0-only
using System.Text.Json;
using System.Text.Json.Serialization;

namespace GitPadPlus.Core;

public record RpcRequest(int ProtocolVersion, string RequestId, string Method, JsonElement Params);
public record RpcError(string Code, string Message);
public record RpcResponse(int ProtocolVersion, string RequestId, JsonElement? Result, RpcError? Error);
public record CreateParams(string Date, string Title);
public record IdParams(Guid Id);
public record DeleteParams(Guid Id, long Revision);
public record QueryParams(string? Date = null, string? Search = null);
public record ClearParams(string Confirmation);
public record ImageParams(string Filename, string Base64);
public record ImagePathParams(string Path);
public record NativePickedFile(string Filename,byte[] Bytes);
public record PickedMarkdown(string Filename,string Text);
public record PluginParams(string PluginId);
public record PluginWriteParams(string PluginId, PluginData Data);
public record PluginInvocation(string PluginId, string Method, JsonElement Params);
public record PluginInfo(string Id, bool Enabled, string[] Permissions);
public record PersistAnchorParams(Guid DocumentId, SelectionAnchor Anchor, long ExpectedRevision, string ExpectedHash);
public record ResolveAnchorParams(Guid DocumentId, Guid SelectionId, string RenderedBlockText);

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(RpcRequest))]
[JsonSerializable(typeof(RpcResponse))]
[JsonSerializable(typeof(CreateParams))]
[JsonSerializable(typeof(IdParams))]
[JsonSerializable(typeof(DeleteParams))]
[JsonSerializable(typeof(QueryParams))]
[JsonSerializable(typeof(ClearParams))]
[JsonSerializable(typeof(ImageParams))]
[JsonSerializable(typeof(ImagePathParams))]
[JsonSerializable(typeof(PickedMarkdown))]
[JsonSerializable(typeof(PluginParams))]
[JsonSerializable(typeof(PluginWriteParams))]
[JsonSerializable(typeof(ReconcileRequest))]
[JsonSerializable(typeof(PluginInvocation))]
[JsonSerializable(typeof(PluginInfo[]))]
[JsonSerializable(typeof(PersistAnchorParams))]
[JsonSerializable(typeof(ResolveAnchorParams))]
[JsonSerializable(typeof(AnchorResolution))]
[JsonSerializable(typeof(ClearPreview))]
[JsonSerializable(typeof(GitStatus))]
[JsonSerializable(typeof(LinkTarget))]
[JsonSerializable(typeof(string))]
[JsonSerializable(typeof(bool))]
public partial class ProtocolJson : JsonSerializerContext;

/// <summary>Only the first-party WebView gets this RPC entrypoint. Plugins receive capability adapters.</summary>
public sealed class Bridge(VaultStore store,PackagedPlugin[]? packagedPlugins=null,Func<byte[]>? clipboardImage=null,Func<string,NativePickedFile?>? pickFile=null)
{
    public const int Version = 1;
    public bool HasUnsavedChanges { get; private set; }
    public event Action<string>? StateChanged;
    private readonly HashSet<string> activePlugins = [];
    private readonly object pluginGate = new();
    private readonly Dictionary<string,PackagedPlugin> pluginRegistry=(packagedPlugins??[
        new("official-toolbar","",["commands","editor"],[]),new("official-calendar-stats","",["calendar.read","calendar.decorate","storage"],["calendar.query"])
    ]).ToDictionary(plugin=>plugin.Id);
    private static readonly Dictionary<string,string> PluginCapabilities=new(){["calendar.query"]="calendar.read",["documents.load"]="documents.read",["documents.save"]="documents.write"};
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        RespectNullableAnnotations = true,
        RespectRequiredConstructorParameters = true,
        TypeInfoResolver = System.Text.Json.Serialization.Metadata.JsonTypeInfoResolver.Combine(ProtocolJson.Default, DataJson.Default)
    };
    private static T Get<T>(JsonElement value) => value.Deserialize<T>(Options) ?? throw new ArgumentException("Parameters are required.");
    private static JsonElement Element<T>(T value) => JsonSerializer.SerializeToElement(value, Options);
    public string Handle(string json)
    {
        string id = "invalid";
        try
        {
            if (json.Length > 24_000_000) throw new ArgumentException("Message exceeds limit.");
            var request = JsonSerializer.Deserialize<RpcRequest>(json, Options) ?? throw new ArgumentException("Invalid request.");
            id = request.RequestId;
            if (request.ProtocolVersion != Version || string.IsNullOrWhiteSpace(id) || id.Length > 100) throw new ArgumentException("Invalid protocol version or request ID.");
            var result = Dispatch(request.Method, request.Params);
            return JsonSerializer.Serialize(new RpcResponse(Version, id, result, null), ProtocolJson.Default.RpcResponse);
        }
        catch (Exception ex) when (ex is ArgumentException or JsonException or IOException or InvalidOperationException or UnauthorizedAccessException or FormatException)
        {
            var code = ex switch { RevisionConflictException => "Conflict", RecoveryRequiredException => "RecoveryRequired", UnauthorizedAccessException => "Forbidden", IOException => "StorageError", _ => "InvalidRequest" };
            // Do not leak filesystem paths or raw exception details to the WebView.
            return JsonSerializer.Serialize(new RpcResponse(Version, id, null, new(code, code == "Conflict" ? "Stale revision; reload before saving." : code + ": operation rejected; data retained.")), ProtocolJson.Default.RpcResponse);
        }
    }
    private JsonElement Dispatch(string method, JsonElement parameters)
    {
        if(store.ClearPending)throw new RecoveryRequiredException("Restart to complete the confirmed clear before writing new data.");
        switch (method)
        {
            case "media.pickImage":
                var picked=(pickFile??throw new InvalidOperationException("Native picker unavailable."))("image");return Element(picked is null?null:store.ImportImage(picked.Filename,picked.Bytes));
            case "files.pickMarkdown":
                var markdown=(pickFile??throw new InvalidOperationException("Native picker unavailable."))("markdown");return Element(markdown is null?null:new PickedMarkdown(markdown.Filename,new System.Text.UTF8Encoding(false,true).GetString(markdown.Bytes)));
            case "app.ready": StateChanged?.Invoke("Ready"); return Element(true);
            case "app.flushed":
                if(HasUnsavedChanges)throw new InvalidOperationException("Unsaved changes remain.");
                StateChanged?.Invoke("Flushed");return Element(true);
            case "documents.list":
            case "calendar.query":
                var query = Get<QueryParams>(parameters);
                return Element(store.List(query.Date, query.Search));
            case "documents.create":
                var create = Get<CreateParams>(parameters);
                return Element(store.Create(create.Date, create.Title));
            case "documents.load": return Element(store.Load(Get<IdParams>(parameters).Id));
            case "documents.save":
                var saved = store.Save(Get<SaveRequest>(parameters));
                StateChanged?.Invoke("Saved");
                return Element(saved);
            case "documents.delete":
                if (HasUnsavedChanges) throw new InvalidOperationException("Save pending edits before moving a note to trash.");
                var delete = Get<DeleteParams>(parameters);
                store.Delete(delete.Id, delete.Revision);
                return Element(true);
            case "documents.trash": return Element(store.ListTrash());
            case "documents.restore": return Element(store.Restore(Get<IdParams>(parameters).Id));
            case "documents.dirty":
                HasUnsavedChanges = Get<bool>(parameters);
                StateChanged?.Invoke(HasUnsavedChanges ? "Unsaved" : "Saved");
                return Element(true);
            case "settings.get": return Element(store.GetSettings());
            case "settings.update":
                var settings=store.SetSettings(Get<AppSettings>(parameters));StateChanged?.Invoke("Settings");return Element(settings);
            case "workspace.get": return Element(store.GetWorkspace());
            case "workspace.save": return Element(store.SetWorkspace(Get<WorkspaceState>(parameters)));
            case "git.status": return Element(new GitStatus());
            case "recovery.list": store.RebuildIndex(); return Element(store.RecoveryIssues.ToArray());
            case "recovery.inspect": return Element(store.InspectRecovery(Get<IdParams>(parameters).Id));
            case "recovery.reconcile": return Element(store.Reconcile(Get<ReconcileRequest>(parameters)));
            case "media.import":
                var image = Get<ImageParams>(parameters);
                return Element(store.ImportImage(image.Filename, Convert.FromBase64String(image.Base64)));
            case "media.importClipboard":
                if(clipboardImage is null)throw new InvalidOperationException("Native clipboard unavailable.");
                return Element(store.ImportImage("clipboard",clipboardImage()));
            case "media.read":
                var relative = Get<ImagePathParams>(parameters).Path;
                if (!System.Text.RegularExpressions.Regex.IsMatch(relative, @"^\.\./Assets/[a-f0-9]{64}\.(png|jpg|gif)$")) throw new UnauthorizedAccessException();
                var extension = System.IO.Path.GetExtension(relative);
                return Element("data:image/" + (extension == ".jpg" ? "jpeg" : extension.TrimStart('.')) + ";base64," + Convert.ToBase64String(File.ReadAllBytes(store.Safe("Assets", System.IO.Path.GetFileName(relative)))));
            case "app.previewClear": return Element(store.PreviewClear(HasUnsavedChanges));
            case "app.clearLocalData":
                store.Clear(Get<ClearParams>(parameters).Confirmation, HasUnsavedChanges);
                StateChanged?.Invoke("Cleared");
                return Element(true);
            case "links.navigate": return Element(Identity.ParseLink(Get<string>(parameters)));
            case "anchors.create":
                var anchor = Get<PersistAnchorParams>(parameters);
                var anchorNote = store.Load(anchor.DocumentId);
                return Element(store.Save(new(anchor.DocumentId, anchorNote.Body, anchorNote.Header.Title, anchorNote.Header.Tags,
                    anchor.ExpectedRevision, anchor.ExpectedHash, anchorNote.Sidecar.Blocks, [.. anchorNote.Sidecar.Selections, anchor.Anchor])));
            case "anchors.resolve":
                var resolve = Get<ResolveAnchorParams>(parameters);
                var targetNote = store.Load(resolve.DocumentId);
                var targetAnchor = targetNote.Sidecar.Selections.SingleOrDefault(a => a.Id == Identity.Require(resolve.SelectionId));
                if (targetAnchor is null || !targetNote.Sidecar.Blocks.Any(b => b.Id == targetAnchor.BlockId && !b.Deleted)) return Element(new AnchorResolution("missing", null, null, []));
                return Element(AnchorEngine.Resolve(targetAnchor, resolve.RenderedBlockText));
            case "plugins.list":
                lock (pluginGate) return Element(pluginRegistry.Values.Select(p => new PluginInfo(p.Id, activePlugins.Contains(p.Id), p.Permissions)).ToArray());
            case "plugins.storage.read":
                var readPlugin = Get<PluginParams>(parameters).PluginId;
                lock (pluginGate)
                {
                    if (!activePlugins.Contains(readPlugin)||!pluginRegistry[readPlugin].Permissions.Contains("storage")) throw new UnauthorizedAccessException();
                    return Element(store.ReadPluginData(readPlugin));
                }
            case "plugins.storage.write":
                var writePlugin = Get<PluginWriteParams>(parameters);
                lock (pluginGate)
                {
                    if (!activePlugins.Contains(writePlugin.PluginId)||!pluginRegistry[writePlugin.PluginId].Permissions.Contains("storage")) throw new UnauthorizedAccessException();
                    return Element(store.WritePluginData(writePlugin.PluginId, writePlugin.Data));
                }
            case "plugins.activate":
            case "plugins.deactivate":
                var plugin = Get<PluginParams>(parameters).PluginId;
                lock (pluginGate)
                {
                    if (!pluginRegistry.ContainsKey(plugin)) throw new UnauthorizedAccessException("Only reviewed bundled plugins are supported.");
                    if (method == "plugins.activate") activePlugins.Add(plugin); else activePlugins.Remove(plugin);
                }
                return Element(true);
            case "plugins.invoke":
                var invocation = Get<PluginInvocation>(parameters);
                lock (pluginGate)
                {
                    if (!activePlugins.Contains(invocation.PluginId) || !pluginRegistry.TryGetValue(invocation.PluginId,out var bundle) || !bundle.Methods.Contains(invocation.Method)||!PluginCapabilities.TryGetValue(invocation.Method,out var permission)||!bundle.Permissions.Contains(permission)) throw new UnauthorizedAccessException("Plugin capability denied by native core.");
                    return Dispatch(invocation.Method, invocation.Params);
                }
            default: throw new ArgumentException("Method not permitted.");
        }
    }
}
