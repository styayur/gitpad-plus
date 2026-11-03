// SPDX-License-Identifier: AGPL-3.0-only
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Graphics.Canvas;

if (args.Length != 2) throw new ArgumentException("Pass the reviewed source binding and a JSON report path.");
using var binding = JsonDocument.Parse(File.ReadAllText(args[0]));
var files = binding.RootElement.GetProperty("files").EnumerateArray();
string VerifyFile(string name)
{
    var expected = files.Single(file => file.GetProperty("path").GetString()!.EndsWith('/' + name, StringComparison.Ordinal)).GetProperty("sha256").GetString();
    var actual = Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, name))));
    if (actual != expected) throw new InvalidOperationException("Unreviewed probe dependency: " + name);
    return actual;
}
var nativeSha256 = VerifyFile("Microsoft.Graphics.Canvas.dll");
var projectionSha256 = VerifyFile("Microsoft.Graphics.Canvas.Interop.dll");
using var device = CanvasDevice.GetSharedDevice(true);
using var target = new CanvasRenderTarget(device, 4, 4, 96);
using (var drawing = target.CreateDrawingSession()) drawing.Clear(new Windows.UI.Color { A = 255, R = 12, G = 34, B = 56 });
var pixels = target.GetPixelBytes();
if (pixels.Length != 64) throw new InvalidOperationException("Unexpected rendered surface size.");
for (var offset = 0; offset < pixels.Length; offset += 4)
    if (!pixels.AsSpan(offset, 4).SequenceEqual(new byte[] { 56, 34, 12, 255 })) throw new InvalidOperationException("Win2D rendered pixel differs.");
var result = new { sourceCommit = binding.RootElement.GetProperty("upstream").GetProperty("commit").GetString(), nativeSha256, projectionSha256, width = 4, height = 4, dpi = 96, pixels = pixels.Length, bgra = pixels.Take(4), scope = "Actual source-built CsWinRT projection, WARP device, CanvasRenderTarget, drawing session and pixel readback; not final MAUI package acceptance" };
File.WriteAllText(args[1], JsonSerializer.Serialize(result, new JsonSerializerOptions { WriteIndented = true }) + "\n");
Console.WriteLine(File.ReadAllText(args[1]));
