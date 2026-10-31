// SPDX-License-Identifier: AGPL-3.0-only
namespace GitPadPlus.App;
public partial class App : Application
{
    public App()
    {
        InitializeComponent();
        foreach(var argument in Environment.GetCommandLineArgs())if(argument.StartsWith("gitpadplus:",StringComparison.OrdinalIgnoreCase))ActivationRouter.Open(argument);
    }
    protected override Window CreateWindow(IActivationState? activationState)
    {
        var page = new MainPage();
        var window = new Window(page) { Title = "GitPad+ · 0.1.0-alpha.1", Width = 1200, Height = 850 };
        window.Stopped += (_, _) => page.RequestFlush();
        window.Destroying+=(_,_)=>page.Detach();
#if WINDOWS
        window.Created += (_, _) =>
        {
            if (window.Handler?.PlatformView is Microsoft.UI.Xaml.Window native)
            {
                if (Microsoft.UI.Composition.SystemBackdrops.MicaController.IsSupported()) native.SystemBackdrop = new Microsoft.UI.Xaml.Media.MicaBackdrop { Kind=Microsoft.UI.Composition.SystemBackdrops.MicaKind.BaseAlt };
                var closingAfterSave=false;
                native.AppWindow.Closing += (_, args) => { if (page.HasUnsavedChanges) { args.Cancel = true;closingAfterSave=true; page.RequestFlush(); } };
                page.Flushed+=()=>{if(closingAfterSave){closingAfterSave=false;native.Close();}};
            }
        };
#endif
        return window;
    }
}
