// SPDX-License-Identifier: AGPL-3.0-only
using System.Text.Json;
using GitPadPlus.Core;

namespace GitPadPlus.App;
public sealed class MainPage : ContentPage
{
    private readonly HybridWebView editor;
    private readonly Bridge bridge;
    private readonly SemaphoreSlim requests = new(1, 1);
    private static readonly object vaultGate=new();
    private static VaultStore? sharedVault;
    private Action? detach;
#if WINDOWS
    private WindowAppearance? appearance;
    private bool appearanceReady;
    public void AttachAppearance(Microsoft.UI.Xaml.Window window) => appearance = new WindowAppearance(window, message=>{if(appearanceReady)editor.SendRawMessage(message);});
#endif
    public bool HasUnsavedChanges => bridge.HasUnsavedChanges;
    public event Action? Flushed;
    public MainPage()
    {
        var overrideVault=Environment.GetEnvironmentVariable("GITPAD_ACCEPTANCE_VAULT");
#if ANDROID
        // Android's OS-provided /data/user/0 alias can itself be a symlink.
        // Resolve the trusted app-private base before applying VaultStore's
        // unchanged rejection of links inside the managed vault and its parents.
        var appData=Android.App.Application.Context.FilesDir?.CanonicalPath??throw new InvalidOperationException("Private application data directory unavailable.");
#else
        var appData=FileSystem.AppDataDirectory;
#endif
#if ANDROID
        var trustedBase=overrideVault is null?appData:null;
#else
        string? trustedBase=null;
#endif
        VaultStore vault;
        var vaultPath=Path.GetFullPath(overrideVault??Path.Combine(appData,"Vault"));
        lock(vaultGate){sharedVault??=new VaultStore(vaultPath,trustedPlatformBase:trustedBase);if(sharedVault.Root!=vaultPath)throw new InvalidOperationException("The process already owns a different vault.");vault=sharedVault;}
        using var registry=typeof(MainPage).Assembly.GetManifestResourceStream("GitPadPlus.PackagedPlugins.json")??throw new InvalidOperationException("Packaged plugin registry missing.");
        bridge = new Bridge(vault,JsonSerializer.Deserialize(registry,DataJson.Default.PackagedPluginArray),NativeClipboard.ReadImage,NativeFilePicker.Pick);
        editor = new HybridWebView { HybridRoot = "wwwroot", DefaultFile = "index.html" };
        Action? showNativeCalendar=null;
#if WINDOWS
        var editorHost=new Grid();editorHost.Add(editor);
        var nativeFileDrop=new NativeFileDrop(editorHost,editor,vault);
#endif
        var attached=true;
        editor.RawMessageReceived += async (_, args) =>
        {
            var message = args.Message;
            if (message is null||!attached) return;
            if(message=="{\"type\":\"show-native-calendar\"}")
            {
                MainThread.BeginInvokeOnMainThread(()=>{if(attached)showNativeCalendar?.Invoke();});
                return;
            }
            await requests.WaitAsync();
            try
            {
                var response = await Task.Run(() => bridge.Handle(message));
                MainThread.BeginInvokeOnMainThread(() => {if(attached)editor.SendRawMessage(response);});
            }
            finally { requests.Release(); }
        };
        var ready=false;
        void Activate() => MainThread.BeginInvokeOnMainThread(()=>{if(attached&&ready&&ActivationRouter.Take() is string uri)editor.SendRawMessage(JsonSerializer.Serialize(new {type="navigate",uri}));});
        ActivationRouter.Changed+=Activate;
        void ApplyTheme(){if(Application.Current is not null)Application.Current.UserAppTheme=vault.GetSettings().Theme switch{"light"=>AppTheme.Light,"dark"=>AppTheme.Dark,_=>AppTheme.Unspecified};
#if WINDOWS
            appearance?.Refresh();
#endif
#if ANDROID
            MainActivity.UpdateSystemBars();
#endif
        }
        Action<string> stateChanged=state => MainThread.BeginInvokeOnMainThread(() => {if(!attached)return;if(state=="Ready"){ready=true;Activate();
#if WINDOWS
            appearanceReady=true;
            appearance?.Refresh();
#endif
        }else if(state=="Flushed")Flushed?.Invoke();else if(state=="Settings")ApplyTheme();});
        bridge.StateChanged+=stateChanged;
        detach=()=>{attached=false;ActivationRouter.Changed-=Activate;bridge.StateChanged-=stateChanged;
#if WINDOWS
            nativeFileDrop.Dispose();
            appearanceReady=false;
            appearance?.Dispose();
#endif
        };
        try{ApplyTheme();}catch(Exception ex)when(ex is IOException or JsonException){/* Settings RPC reports retained corrupt data without blocking the editor. */}
        var nativeCalendar = new CalendarHost { HeightRequest = 300, IsVisible=false };
        nativeCalendar.DateSelected += date => editor.SendRawMessage(JsonSerializer.Serialize(new { type = "native-date", date = date.ToString("yyyy-MM-dd") }));
#if WINDOWS
            var calendar=new Microsoft.UI.Xaml.Controls.CalendarView{SelectionMode=Microsoft.UI.Xaml.Controls.CalendarViewSelectionMode.Single,IsTodayHighlighted=true};
            calendar.SelectedDatesChanged+=(_,_)=>{if(calendar.SelectedDates.Count>0)editor.SendRawMessage(JsonSerializer.Serialize(new{type="native-date",date=calendar.SelectedDates[0].ToString("yyyy-MM-dd")}));};
            var acrylic=new Microsoft.UI.Xaml.Media.AcrylicBrush{TintOpacity=0.8};
            var style=new Microsoft.UI.Xaml.Style(typeof(Microsoft.UI.Xaml.Controls.FlyoutPresenter));
            style.Setters.Add(new Microsoft.UI.Xaml.Setter(Microsoft.UI.Xaml.Controls.Control.BackgroundProperty,acrylic));
            var flyout=new Microsoft.UI.Xaml.Controls.Flyout{Content=calendar,FlyoutPresenterStyle=style};
            flyout.Opening+=(_,_)=>{
                var dark=App.EffectiveTheme==AppTheme.Dark;
                var color=Microsoft.UI.ColorHelper.FromArgb(255,dark?(byte)48:(byte)245,dark?(byte)49:(byte)246,dark?(byte)54:(byte)248);
                acrylic.TintColor=color;acrylic.FallbackColor=color;
                var highContrast=appearance?.HighContrast??false;
                Microsoft.UI.Xaml.Media.Brush background=highContrast
                    ?new Microsoft.UI.Xaml.Media.SolidColorBrush(new Windows.UI.ViewManagement.UISettings().GetColorValue(Windows.UI.ViewManagement.UIColorType.Background))
                    :acrylic;
                style.Setters[0]=new Microsoft.UI.Xaml.Setter(Microsoft.UI.Xaml.Controls.Control.BackgroundProperty,background);
            };
            showNativeCalendar=()=>{if(editor.Handler?.PlatformView is Microsoft.UI.Xaml.FrameworkElement anchor)flyout.ShowAt(anchor);};
#else
        showNativeCalendar=()=>nativeCalendar.IsVisible=!nativeCalendar.IsVisible;
#endif
        var grid = new Grid { RowDefinitions = { new RowDefinition(GridLength.Auto), new RowDefinition(GridLength.Star) } };
        grid.Add(nativeCalendar, 0, 0);
#if WINDOWS
        grid.Add(editorHost, 0, 1);
#else
        grid.Add(editor, 0, 1);
#endif
        Content = grid;
    }
    public void RequestFlush() => MainThread.BeginInvokeOnMainThread(() => editor.SendRawMessage("{\"type\":\"flush\"}"));
    public void Detach()=>Interlocked.Exchange(ref detach,null)?.Invoke();
}
