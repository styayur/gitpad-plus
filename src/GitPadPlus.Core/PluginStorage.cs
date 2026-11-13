// SPDX-License-Identifier: AGPL-3.0-only
using System.Text.Json;

namespace GitPadPlus.Core;

public record PluginData(int SchemaVersion, string PluginVersion, Dictionary<string, JsonElement> Values, Dictionary<string, Guid> ObjectIds);

public sealed partial class VaultStore
{
    private string PluginPath(string pluginId)
    {
        if (!System.Text.RegularExpressions.Regex.IsMatch(pluginId, "^[a-z0-9][a-z0-9.-]{1,99}$")) throw new ArgumentException("Invalid plugin ID.");
        var directory = Safe(".gitpad", "plugins");
        Directory.CreateDirectory(directory);
        return Safe(".gitpad", "plugins", pluginId + ".json");
    }
    public PluginData? ReadPluginData(string pluginId)
    {
        lock (gate) { var path = PluginPath(pluginId);if(!File.Exists(path))return null;var data=Read<PluginData>(path);ValidatePluginData(data);return data; }
    }
    private static void ValidatePluginData(PluginData data)
    {
        if (data.SchemaVersion < 1 ||string.IsNullOrWhiteSpace(data.PluginVersion)||data.Values is null||data.ObjectIds is null|| data.Values.Count > 1000 || data.ObjectIds.Count > 1000 || Json(data).Length > 1_000_000)
            throw new ArgumentException("Invalid plugin storage envelope or limit exceeded.");
        foreach (var id in data.ObjectIds.Values) Identity.Require(id);
    }
    public PluginData WritePluginData(string pluginId, PluginData data)
    {
        lock (gate)
        {
            ValidatePluginData(data);
            var path = PluginPath(pluginId);
            DurableWrite(path + ".new", Json(data)); File.Move(path + ".new", path, true);
            return data;
        }
    }
}
