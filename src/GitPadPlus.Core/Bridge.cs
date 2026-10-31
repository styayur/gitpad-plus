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
public record PluginParams(string PluginId);
public record PluginInvocation(string PluginId, string Method, JsonElement Params);
public record PluginInfo(string Id, bool Enabled, string[] Permissions);

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
[JsonSerializable(typeof(PluginParams))]
[JsonSerializable(typeof(PluginInvocation))]
[JsonSerializable(typeof(PluginInfo[]))]
[JsonSerializable(typeof(ClearPreview))]
[JsonSerializable(typeof(GitStatus))]
[JsonSerializable(typeof(LinkTarget))]
[JsonSerializable(typeof(string))]
[JsonSerializable(typeof(bool))]
public partial class ProtocolJson : JsonSerializerContext;

/// <summary>Only the first-party WebView gets this RPC entrypoint. Plugins receive capability adapters.</summary>
public sealed class Bridge(VaultStore store)
{
    public const int Version = 1;
    public bool HasUnsavedChanges { get; private set; }
    public event Action<string>? StateChanged;
    private readonly HashSet<string> activePlugins = [];
    private readonly object pluginGate = new();
    private static readonly Dictionary<string, string[]> PluginMethods = new() { ["official-toolbar"] = [], ["official-calendar-stats"] = ["calendar.query"] };
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
        switch (method)
        {
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
                HasUnsavedChanges = false;
                StateChanged?.Invoke("Saved");
                return Element(saved);
            case "documents.delete":
                var delete = Get<DeleteParams>(parameters);
                store.Delete(delete.Id, delete.Revision);
                return Element(true);
            case "documents.dirty":
                HasUnsavedChanges = Get<bool>(parameters);
                StateChanged?.Invoke(HasUnsavedChanges ? "Unsaved" : "Saved");
                return Element(true);
            case "settings.get": return Element(store.GetSettings());
            case "settings.update": return Element(store.SetSettings(Get<AppSettings>(parameters)));
            case "git.status": return Element(new GitStatus());
            case "media.import":
                var image = Get<ImageParams>(parameters);
                return Element(store.ImportImage(image.Filename, Convert.FromBase64String(image.Base64)));
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
            case "plugins.list":
                lock (pluginGate) return Element(PluginMethods.Select(p => new PluginInfo(p.Key, activePlugins.Contains(p.Key), p.Value)).ToArray());
            case "plugins.activate":
            case "plugins.deactivate":
                var plugin = Get<PluginParams>(parameters).PluginId;
                lock (pluginGate)
                {
                    if (!PluginMethods.ContainsKey(plugin)) throw new UnauthorizedAccessException("Only reviewed bundled plugins are supported.");
                    if (method == "plugins.activate") activePlugins.Add(plugin); else activePlugins.Remove(plugin);
                }
                return Element(true);
            case "plugins.invoke":
                var invocation = Get<PluginInvocation>(parameters);
                lock (pluginGate)
                {
                    if (!activePlugins.Contains(invocation.PluginId) || !PluginMethods.TryGetValue(invocation.PluginId, out var allowed) || !allowed.Contains(invocation.Method)) throw new UnauthorizedAccessException("Plugin capability denied by native core.");
                    return Dispatch(invocation.Method, invocation.Params);
                }
            default: throw new ArgumentException("Method not permitted.");
        }
    }
}
