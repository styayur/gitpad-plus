// SPDX-License-Identifier: AGPL-3.0-only
using System.Text.Json;
using Microsoft.UI.Xaml;
using Windows.UI.ViewManagement;

namespace GitPadPlus.App;

// Window policy only: the editor paints opaque semantic surfaces. No backdrop
// hacks or WebView transparency are needed for a readable writing page.
internal sealed class WindowAppearance : IDisposable
{
    private readonly Microsoft.UI.Xaml.Window window;
    private readonly Microsoft.Maui.Controls.TitleBar titleBar;
    private readonly Action<string> send;
    private readonly UISettings colors=new();
    private readonly Microsoft.UI.System.ThemeSettings theme;
    private readonly FrameworkElement? root;
    private bool disposed;
    internal bool HighContrast => theme.HighContrast;

    public WindowAppearance(Microsoft.UI.Xaml.Window window,Microsoft.Maui.Controls.TitleBar titleBar,Action<string> send)
    {
        this.window=window;this.titleBar=titleBar;this.send=send;root=window.Content as FrameworkElement;
        theme=Microsoft.UI.System.ThemeSettings.CreateForWindowId(window.AppWindow.Id);
        colors.ColorValuesChanged+=ColorsChanged;
        theme.Changed+=ContrastChanged;
        if(root is not null)root.ActualThemeChanged+=ThemeChanged;
        Refresh();
    }
    private void ColorsChanged(UISettings sender,object args)=>MainThread.BeginInvokeOnMainThread(Refresh);
    private void ContrastChanged(Microsoft.UI.System.ThemeSettings sender,object args)=>MainThread.BeginInvokeOnMainThread(Refresh);
    private void ThemeChanged(FrameworkElement sender,object args)=>Refresh();

    public void Refresh()
    {
        if(disposed)return;
        if(root is not null)root.RequestedTheme=Microsoft.Maui.Controls.Application.Current?.UserAppTheme switch
        {
            AppTheme.Light=>ElementTheme.Light,AppTheme.Dark=>ElementTheme.Dark,_=>ElementTheme.Default
        };
        var highContrast=theme.HighContrast;
        var dark=App.EffectiveTheme==AppTheme.Dark;
        var background=highContrast?colors.GetColorValue(UIColorType.Background):Microsoft.UI.ColorHelper.FromArgb(255,dark?(byte)32:(byte)245,dark?(byte)33:(byte)246,dark?(byte)36:(byte)248);
        var foreground=highContrast?colors.GetColorValue(UIColorType.Foreground):Microsoft.UI.ColorHelper.FromArgb(255,dark?(byte)236:(byte)36,dark?(byte)238:(byte)39,dark?(byte)243:(byte)46);
        titleBar.ForegroundColor=Microsoft.Maui.Graphics.Color.FromRgb(foreground.R,foreground.G,foreground.B);
        titleBar.BackgroundColor=highContrast?Microsoft.Maui.Graphics.Color.FromRgb(background.R,background.G,background.B):Microsoft.Maui.Graphics.Colors.Transparent;
        if(!highContrast&&Microsoft.UI.Composition.SystemBackdrops.MicaController.IsSupported())
            window.SystemBackdrop??=new Microsoft.UI.Xaml.Media.MicaBackdrop{Kind=Microsoft.UI.Composition.SystemBackdrops.MicaKind.BaseAlt};
        else window.SystemBackdrop=null;
        // Keep OS caption behavior, snap layouts and drag regions intact.
        var title=window.AppWindow.TitleBar;
        title.BackgroundColor=window.SystemBackdrop is null?background:null;
        title.ForegroundColor=foreground;title.ButtonForegroundColor=foreground;
        title.ButtonBackgroundColor=window.SystemBackdrop is null?background:Microsoft.UI.Colors.Transparent;
        var accent=colors.GetColorValue(UIColorType.Accent);
        send(JsonSerializer.Serialize(new{type="appearance",accent=$"#{accent.R:x2}{accent.G:x2}{accent.B:x2}",highContrast}));
    }
    public void Dispose()
    {
        disposed=true;colors.ColorValuesChanged-=ColorsChanged;theme.Changed-=ContrastChanged;
        if(root is not null)root.ActualThemeChanged-=ThemeChanged;
    }
}
