// SPDX-License-Identifier: AGPL-3.0-only
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;

namespace GitPadPlus.Core;

public static class Frontmatter
{
    private static readonly ISerializer Writer = new SerializerBuilder().WithNamingConvention(CamelCaseNamingConvention.Instance).Build();
    private static readonly IDeserializer Reader = new DeserializerBuilder().WithNamingConvention(CamelCaseNamingConvention.Instance).IgnoreUnmatchedProperties().Build();
    public static (DocumentHeader Header, string Body, string Yaml) Decode(string raw)
    {
        var newline = raw.StartsWith("---\r\n", StringComparison.Ordinal) ? "\r\n" : "\n";
        if (!raw.StartsWith("---" + newline, StringComparison.Ordinal)) throw new InvalidDataException("Missing frontmatter.");
        var end = raw.IndexOf(newline + "---" + newline, 3 + newline.Length, StringComparison.Ordinal);
        if (end < 0) throw new InvalidDataException("Unterminated frontmatter.");
        var yaml = raw[(3 + newline.Length)..end];
        var fields = Reader.Deserialize<Dictionary<string, object>>(yaml) ?? throw new InvalidDataException("Missing document metadata.");
        string Text(string key) => fields.TryGetValue(key, out var value) ? Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture) ?? "" : throw new InvalidDataException("Missing field: " + key);
        var tags = fields.TryGetValue("tags", out var tagValue) && tagValue is IEnumerable<object> values ? values.Select(v => Convert.ToString(v) ?? "").ToArray() : Array.Empty<string>();
        var header = new DocumentHeader(int.Parse(Text("schemaVersion"), System.Globalization.CultureInfo.InvariantCulture), Guid.Parse(Text("id")), Text("date"), Text("title"), tags,
            DateTimeOffset.Parse(Text("createdAt"), System.Globalization.CultureInfo.InvariantCulture), DateTimeOffset.Parse(Text("updatedAt"), System.Globalization.CultureInfo.InvariantCulture));
        Identity.Require(header.Id);
        if (header.SchemaVersion != 1 || !DateOnly.TryParseExact(header.Date, "yyyy-MM-dd", out _)) throw new InvalidDataException("Unsupported metadata.");
        return (header, raw[(end + newline.Length * 2 + 3)..], yaml);
    }
    public static string Encode(DocumentHeader header, string body, string? priorYaml = null)
    {
        // Unknown frontmatter fields survive edits, too.
        var fields = priorYaml is null ? new Dictionary<object, object>() : Reader.Deserialize<Dictionary<object, object>>(priorYaml);
        var known = new Dictionary<object, object> { ["schemaVersion"] = header.SchemaVersion, ["id"] = header.Id.ToString(), ["date"] = header.Date,
            ["title"] = header.Title, ["tags"] = header.Tags, ["createdAt"] = header.CreatedAt.ToString("O"), ["updatedAt"] = header.UpdatedAt.ToString("O") };
        foreach (var (key, value) in known) fields[key] = value;
        return "---\n" + Writer.Serialize(fields) + "---\n" + body;
    }
}
