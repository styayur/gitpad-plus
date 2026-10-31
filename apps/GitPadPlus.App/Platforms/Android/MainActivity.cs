// SPDX-License-Identifier: AGPL-3.0-only
using Android.App;
using Android.Content;
using Android.Content.PM;
namespace GitPadPlus.App;
[Activity(Theme = "@style/Maui.SplashTheme", MainLauncher = true, LaunchMode = LaunchMode.SingleTask, WindowSoftInputMode=Android.Views.SoftInput.AdjustResize, ConfigurationChanges = ConfigChanges.ScreenSize | ConfigChanges.Orientation | ConfigChanges.UiMode | ConfigChanges.ScreenLayout | ConfigChanges.SmallestScreenSize | ConfigChanges.Density)]
[IntentFilter([Intent.ActionView], Categories = [Intent.CategoryDefault, Intent.CategoryBrowsable], DataScheme = "gitpadplus", DataHost = "note")]
public class MainActivity : MauiAppCompatActivity
{
    protected override void OnCreate(Android.OS.Bundle? savedInstanceState){base.OnCreate(savedInstanceState);UpdateSystemBars();ActivationRouter.Open(Intent?.DataString);}
    protected override void OnNewIntent(Intent? intent){base.OnNewIntent(intent);ActivationRouter.Open(intent?.DataString);}
    public override void OnConfigurationChanged(Android.Content.Res.Configuration newConfig){base.OnConfigurationChanged(newConfig);UpdateSystemBars();}
    public static void UpdateSystemBars()
    {
        var window=Microsoft.Maui.ApplicationModel.Platform.CurrentActivity?.Window;
        if(window is null)return;
        var controller=AndroidX.Core.View.WindowCompat.GetInsetsController(window,window.DecorView);
        if(controller is null)return;
        var light=Microsoft.Maui.Controls.Application.Current?.RequestedTheme!=Microsoft.Maui.ApplicationModel.AppTheme.Dark;
        controller.AppearanceLightStatusBars=light;controller.AppearanceLightNavigationBars=light;
    }
}
