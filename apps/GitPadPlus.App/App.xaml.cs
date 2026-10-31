// SPDX-License-Identifier: AGPL-3.0-only
namespace GitPadPlus.App;
public partial class App : Application
{
    public App() => InitializeComponent();
    protected override Window CreateWindow(IActivationState? activationState)
    {
        var page = new MainPage();
        var window = new Window(page) { Title = "GitPad+ · Development", Width = 1200, Height = 850 };
        window.Stopped += (_, _) => page.RequestFlush();
#if WINDOWS
        window.Created += (_, _) =>
        {
            if (window.Handler?.PlatformView is Microsoft.UI.Xaml.Window native)
            {
                if (Microsoft.UI.Composition.SystemBackdrops.MicaController.IsSupported()) native.SystemBackdrop = new Microsoft.UI.Xaml.Media.MicaBackdrop();
                native.AppWindow.Closing += (_, args) => { if (page.HasUnsavedChanges) { args.Cancel = true; page.RequestFlush(); } };
            }
        };
#endif
        return window;
    }
}
