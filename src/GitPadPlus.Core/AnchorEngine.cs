// SPDX-License-Identifier: AGPL-3.0-only
namespace GitPadPlus.Core;
public record AnchorResolution(string State, int? Start, int? End, int[] Candidates);
public static class AnchorEngine
{
    // UTF-16 offsets and exact matching are identical to the TypeScript implementation.
    public static AnchorResolution Resolve(SelectionAnchor anchor, string renderedBlockText)
    {
        if (anchor.NormalizationVersion != 1 || string.IsNullOrEmpty(anchor.Exact)) return new("missing", null, null, []);
        var candidates = new List<int>();
        for (var offset = renderedBlockText.IndexOf(anchor.Exact, StringComparison.Ordinal); offset >= 0; offset = renderedBlockText.IndexOf(anchor.Exact, offset + 1, StringComparison.Ordinal)) candidates.Add(offset);
        var contextual = candidates.Where(start =>
            renderedBlockText[Math.Max(0, start - anchor.Prefix.Length)..start] == anchor.Prefix &&
            renderedBlockText[(start + anchor.Exact.Length)..Math.Min(renderedBlockText.Length, start + anchor.Exact.Length + anchor.Suffix.Length)] == anchor.Suffix).ToArray();
        var matches = contextual.Length > 0 ? contextual : candidates.ToArray();
        return matches.Length switch { 0 => new("missing", null, null, []), 1 => new("resolved", matches[0], matches[0] + anchor.Exact.Length, matches), _ => new("ambiguous", null, null, matches) };
    }
}
