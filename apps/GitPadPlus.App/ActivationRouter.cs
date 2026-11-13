// SPDX-License-Identifier: AGPL-3.0-only
using GitPadPlus.Core;
namespace GitPadPlus.App;

public static class ActivationRouter
{
    private static string? pending;
    public static event Action? Changed;
    public static void Open(string? uri)
    {
        if(uri is null)return;
        try { _=Identity.ParseLink(uri); pending=uri; Changed?.Invoke(); }
        catch(ArgumentException) { /* Invalid activation never reaches the editor. */ }
        catch(FormatException) { }
    }
    public static string? Take() => Interlocked.Exchange(ref pending,null);
}
