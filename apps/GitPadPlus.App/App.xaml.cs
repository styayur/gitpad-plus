// SPDX-License-Identifier: AGPL-3.0-only
namespace GitPadPlus.App;
public partial class App : Application
{
    internal static AppTheme EffectiveTheme => Current?.UserAppTheme is AppTheme.Light or AppTheme.Dark
        ? Current.UserAppTheme : Current?.RequestedTheme??AppTheme.Light;
    public App()
    {
        InitializeComponent();
#if ANDROID
        Microsoft.Maui.Controls.PlatformConfiguration.AndroidSpecific.Application.SetWindowSoftInputModeAdjust(
            this,Microsoft.Maui.Controls.PlatformConfiguration.AndroidSpecific.WindowSoftInputModeAdjust.Resize);
#endif
        foreach(var argument in Environment.GetCommandLineArgs())if(argument.StartsWith("gitpadplus:",StringComparison.OrdinalIgnoreCase))ActivationRouter.Open(argument);
    }
    protected override Window CreateWindow(IActivationState? activationState)
    {
        var page = new MainPage();
        var window = new Window(page) { Title = "GitPad+ · 0.1.0-alpha.1", Width = 1200, Height = 850 };
        window.Stopped += (_, _) => page.RequestFlush();
        window.Destroying+=(_,_)=>page.Detach();
#if WINDOWS
        var titleBar=new TitleBar{Title=window.Title,HeightRequest=32,BackgroundColor=Microsoft.Maui.Graphics.Colors.Transparent};
        window.TitleBar=titleBar;
        window.Created += (_, _) =>
        {
            if (window.Handler?.PlatformView is Microsoft.UI.Xaml.Window native)
            {
                ExitDiagnostics.Record("window.created");
                var finishDispatcherObservation=ExitDiagnostics.ObserveDispatcher(native.DispatcherQueue);
                native.Closed += (_, _) => {finishDispatcherObservation();ExitDiagnostics.Record("window.closed");};
                page.AttachAppearance(native,titleBar);
                // MAUI sizes the window in DIPs; AppWindow bounds are physical
                // pixels. Clamp once to the actual work area so a high-DPI
                // desktop never starts with the status bar below the screen.
                var appWindow=native.AppWindow;
                var area=Microsoft.UI.Windowing.DisplayArea.GetFromWindowId(appWindow.Id,Microsoft.UI.Windowing.DisplayAreaFallback.Nearest)?.WorkArea;
                if(area is { Width: >0, Height: >0 } work)
                {
                    var width=Math.Min(appWindow.Size.Width,work.Width);
                    var height=Math.Min(appWindow.Size.Height,work.Height);
                    var bounds=new Windows.Graphics.RectInt32(Math.Clamp(appWindow.Position.X,work.X,work.X+work.Width-width),Math.Clamp(appWindow.Position.Y,work.Y,work.Y+work.Height-height),width,height);
                    appWindow.MoveAndResize(bounds);
                }
                var closingAfterSave=false;
                native.AppWindow.Closing += (_, args) => { ExitDiagnostics.Record("close.requested", page.HasUnsavedChanges); if (page.HasUnsavedChanges) { args.Cancel = true;closingAfterSave=true; ExitDiagnostics.Record("close.waiting-for-save"); page.RequestFlush(); } };
                page.Flushed+=()=>{ExitDiagnostics.Record("save.flushed", page.HasUnsavedChanges);if(closingAfterSave){closingAfterSave=false;native.Close();}};
            }
        };
#endif
        return window;
    }
}
