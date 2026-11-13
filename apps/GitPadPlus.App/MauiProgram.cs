// SPDX-License-Identifier: AGPL-3.0-only
using Microsoft.Maui.Hosting;

namespace GitPadPlus.App;
public static class MauiProgram
{
    public static MauiApp CreateMauiApp() => MauiApp.CreateBuilder().UseMauiApp<App>()
        .ConfigureMauiHandlers(handlers => handlers.AddHandler<CalendarHost, CalendarHandler>()).Build();
}
