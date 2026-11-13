// SPDX-License-Identifier: AGPL-3.0-only
namespace GitPadPlus.App.WinUI;
public partial class App : MauiWinUIApplication
{
    public App()
    {
        var instance=Microsoft.Windows.AppLifecycle.AppInstance.FindOrRegisterForKey("GitPadPlus");
        var activation=Microsoft.Windows.AppLifecycle.AppInstance.GetCurrent().GetActivatedEventArgs();
        if(!instance.IsCurrent)
        {
            instance.RedirectActivationToAsync(activation).AsTask().GetAwaiter().GetResult();
            Environment.Exit(0);return;
        }
        instance.Activated+=(_,args)=>Forward(args);
        Forward(activation);InitializeComponent();
    }
    private static void Forward(Microsoft.Windows.AppLifecycle.AppActivationArguments args)
    {
        if(args.Data is Windows.ApplicationModel.Activation.IProtocolActivatedEventArgs protocol)ActivationRouter.Open(protocol.Uri.AbsoluteUri);
        else if(args.Data is Windows.ApplicationModel.Activation.ILaunchActivatedEventArgs launch)ActivationRouter.Open(GitPadPlus.Core.Identity.LinkFromActivationArguments(launch.Arguments));
    }
    protected override MauiApp CreateMauiApp() => MauiProgram.CreateMauiApp();
}
