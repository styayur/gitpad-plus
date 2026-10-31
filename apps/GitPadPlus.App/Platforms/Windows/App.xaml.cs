// SPDX-License-Identifier: AGPL-3.0-only
namespace GitPadPlus.App.WinUI;
public partial class App : MauiWinUIApplication
{
    public App() => InitializeComponent();
    protected override MauiApp CreateMauiApp() => MauiProgram.CreateMauiApp();
}
