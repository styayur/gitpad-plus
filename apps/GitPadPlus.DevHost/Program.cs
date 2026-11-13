// SPDX-License-Identifier: AGPL-3.0-only
using GitPadPlus.Core;

// Browser integration tests only; this host is not shipped with either native app.
var builder = WebApplication.CreateBuilder(args);
var vault = Environment.GetEnvironmentVariable("GITPAD_TEST_VAULT") ?? throw new InvalidOperationException("Set GITPAD_TEST_VAULT to an isolated test directory.");
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 24_000_000);
var store = new VaultStore(vault);
var bridge = new Bridge(store);
var app = builder.Build();
app.Use(async (context, next) =>
{
    var origin = context.Request.Headers.Origin.ToString();
    if (!System.Net.IPAddress.IsLoopback(context.Connection.RemoteIpAddress!) || (origin != "" && origin != "http://127.0.0.1:5173"))
    { context.Response.StatusCode = 403; return; }
    context.Response.Headers.XContentTypeOptions = "nosniff";
    await next();
});
app.MapGet("/health", () => Results.Text("GitPad+ integration host"));
app.MapPost("/rpc", async (HttpRequest request) =>
{
    if (!request.HasJsonContentType()) return Results.StatusCode(415);
    using var reader = new StreamReader(request.Body);
    return Results.Text(bridge.Handle(await reader.ReadToEndAsync()), "application/json");
});
app.Run();
