// SPDX-License-Identifier: AGPL-3.0-only
using System.Text.Json;
using GitPadPlus.Core;

namespace GitPadPlus.App;
public sealed class MainPage : ContentPage
{
    private readonly HybridWebView editor;
    private readonly Bridge bridge;
    private readonly SemaphoreSlim requests = new(1, 1);
    private readonly Label local = new() { Text = "Local: Saved", VerticalOptions = LayoutOptions.Center };
    public bool HasUnsavedChanges => bridge.HasUnsavedChanges;
    public MainPage()
    {
        var vault = new VaultStore(Path.Combine(FileSystem.AppDataDirectory, "Vault"));
        bridge = new Bridge(vault);
        editor = new HybridWebView { HybridRoot = "wwwroot", DefaultFile = "index.html" };
        editor.RawMessageReceived += async (_, args) =>
        {
            await requests.WaitAsync();
            try
            {
                var response = await Task.Run(() => bridge.Handle(args.Message));
                MainThread.BeginInvokeOnMainThread(() => editor.SendRawMessage(response));
            }
            finally { requests.Release(); }
        };
        bridge.StateChanged += state => MainThread.BeginInvokeOnMainThread(() => local.Text = "Local: " + state);
        var nativeCalendar = new CalendarHost { HeightRequest = 300 };
        nativeCalendar.DateSelected += date => editor.SendRawMessage(JsonSerializer.Serialize(new { type = "native-date", date = date.ToString("yyyy-MM-dd") }));
        var showCalendar = new Button { Text = "Calendar", HorizontalOptions = LayoutOptions.Start };
        showCalendar.Clicked += (_, _) => nativeCalendar.IsVisible = !nativeCalendar.IsVisible;
        var status = new HorizontalStackLayout { Padding = new Thickness(12, 6), Spacing = 24, Children = { local, new Label { Text = "Git: NotConfigured" } } };
        var grid = new Grid { RowDefinitions = { new RowDefinition(GridLength.Auto), new RowDefinition(GridLength.Auto), new RowDefinition(GridLength.Star), new RowDefinition(GridLength.Auto) } };
        grid.Add(showCalendar, 0, 0); grid.Add(nativeCalendar, 0, 1); grid.Add(editor, 0, 2);
#if ANDROID
        grid.Add(status, 0, 0); showCalendar.IsVisible = false;
#else
        grid.Add(status, 0, 3);
#endif
        Content = grid;
    }
    public void RequestFlush() => MainThread.BeginInvokeOnMainThread(() => editor.SendRawMessage("{\"type\":\"flush\"}"));
}
