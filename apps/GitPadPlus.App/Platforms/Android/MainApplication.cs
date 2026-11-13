// SPDX-License-Identifier: AGPL-3.0-only
using Android.App;
using Android.Runtime;
namespace GitPadPlus.App;
[Application]
public class MainApplication(nint handle, JniHandleOwnership ownership) : MauiApplication(handle, ownership)
{
    protected override MauiApp CreateMauiApp() => MauiProgram.CreateMauiApp();
}
