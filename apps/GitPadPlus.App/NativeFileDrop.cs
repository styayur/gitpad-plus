// SPDX-License-Identifier: AGPL-3.0-only
#if WINDOWS
using System.Text.Json;
using GitPadPlus.Core;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;
using Windows.ApplicationModel.DataTransfer;
using Windows.Storage;
using DragEventArgs = Microsoft.UI.Xaml.DragEventArgs;
using DataPackageOperation = Windows.ApplicationModel.DataTransfer.DataPackageOperation;

namespace GitPadPlus.App;

/// <summary>Receives OS file drops without relying on WebView2's HTML file projection.</summary>
internal sealed class NativeFileDrop : IDisposable
{
    private readonly HybridWebView hybrid;
    private readonly Microsoft.Maui.Controls.Grid host;
    private readonly VaultStore vault;
    private readonly DragEventHandler dragOverHandler,dropHandler;
    private UIElement? target;
    private WebView2? view;
    private CoreWebView2? core;
    private bool disposed, busy;
    private sealed record ImportedImage(string filename, string path);

    public NativeFileDrop(Microsoft.Maui.Controls.Grid host,HybridWebView hybrid,VaultStore vault)
    {
        this.host=host;this.hybrid=hybrid;this.vault=vault;
        // Keep the same projected WinRT delegate objects for Add/RemoveHandler.
        dragOverHandler=OnDragOver;dropHandler=OnDrop;
        host.HandlerChanged+=OnHandlerChanged;hybrid.HandlerChanged+=OnHandlerChanged;OnHandlerChanged(hybrid,EventArgs.Empty);
    }
    private void OnHandlerChanged(object? sender,EventArgs args)
    {
        DetachView();
        if(disposed||hybrid.Handler?.PlatformView is not WebView2 webView)return;
        // WebView2 forwards its own XAML drag events to Chromium. Do not make
        // it a drop target: that creates a second drag lifecycle/preview.
        view=webView;view.AllowDrop=false;
        if(host.Handler?.PlatformView is UIElement container)
        {
            target=container;target.AllowDrop=true;
            target.AddHandler(UIElement.DragOverEvent,dragOverHandler,false);
            target.AddHandler(UIElement.DropEvent,dropHandler,false);
        }
        view.CoreWebView2Initialized+=OnCoreInitialized;BindCore();
    }
    private void OnCoreInitialized(WebView2 sender,CoreWebView2InitializedEventArgs args)=>BindCore();
    private void BindCore()
    {
        if(core is not null||view?.CoreWebView2 is not CoreWebView2 current)return;
        core=current;core.NavigationStarting+=OnNavigationStarting;core.NewWindowRequested+=OnNewWindowRequested;
    }
    private static void OnNavigationStarting(CoreWebView2 sender,CoreWebView2NavigationStartingEventArgs args)
    {
        // The pinned MAUI HybridWebView origin is https://0.0.0.1/.
        if(!Uri.TryCreate(args.Uri,UriKind.Absolute,out var uri)||uri.Scheme!="https"||uri.Host!="0.0.0.1"||uri.Port!=443||uri.UserInfo.Length!=0)args.Cancel=true;
    }
    private static void OnNewWindowRequested(CoreWebView2 sender,CoreWebView2NewWindowRequestedEventArgs args)=>args.Handled=true;
    private void OnDragOver(object sender,DragEventArgs args)
    {
        args.AcceptedOperation=!busy&&args.DataView.Contains(StandardDataFormats.StorageItems)?DataPackageOperation.Copy:DataPackageOperation.None;
        args.Handled=true;
    }
    private void Send<T>(T message){if(!disposed)hybrid.SendRawMessage(JsonSerializer.Serialize(message));}
    private async void OnDrop(object sender,DragEventArgs args)
    {
        if(args.Handled)return;
        args.Handled=true;args.AcceptedOperation=DataPackageOperation.Copy;
        if(disposed||view is null)return;
        var point=args.GetPosition(view);var id=Guid.NewGuid().ToString("N");
        Send(new{type="native-drop-start",id,x=Math.Clamp(point.X/Math.Max(1,view.ActualWidth),0,1),y=Math.Clamp(point.Y/Math.Max(1,view.ActualHeight),0,1)});
        if(busy){Send(new{type="native-drop-error",id,message="Another image drop is still being imported."});return;}
        busy=true;var deferral=args.GetDeferral();object? result=null;
        try
        {
            if(!args.DataView.Contains(StandardDataFormats.StorageItems))throw new ArgumentException("Files required.");
            var items=await args.DataView.GetStorageItemsAsync();
            if(items.Count is 0 or >8)throw new ArgumentException("Drop one to eight images.");
            var images=new List<ImportedImage>();long total=0;
            foreach(var item in items)
            {
                if(item is not StorageFile file)throw new ArgumentException("Folders are not image files.");
                using var random=await file.OpenReadAsync();using var input=random.AsStreamForRead();using var output=new MemoryStream();
                var buffer=new byte[16384];int count;
                while((count=await input.ReadAsync(buffer))>0){total+=count;if(total>16_000_000)throw new ArgumentException("Drop exceeds image import limit.");await output.WriteAsync(buffer.AsMemory(0,count));}
                if(disposed)return;
                var bytes=output.ToArray();var path=await Task.Run(()=>vault.ImportImage(file.Name,bytes));
                images.Add(new(file.Name,path));
            }
            result=new{type="native-drop-complete",id,files=images};
        }
        catch(Exception error)when(error is not OutOfMemoryException and not StackOverflowException)
        {result=new{type="native-drop-error",id,message="Image drop could not be imported. Use PNG, JPEG or GIF files totaling at most 16 MB."};}
        finally{busy=false;deferral.Complete();}
        // Let the OS finish its drag loop before the editor changes selection,
        // focuses WebView2 or renders the imported image.
        if(result is not null)view?.DispatcherQueue.TryEnqueue(Microsoft.UI.Dispatching.DispatcherQueuePriority.Low,()=>Send(result));
    }
    private void DetachView()
    {
        if(target is not null)
        {
            target.RemoveHandler(UIElement.DragOverEvent,dragOverHandler);target.RemoveHandler(UIElement.DropEvent,dropHandler);target.AllowDrop=false;target=null;
        }
        if(core is not null){core.NavigationStarting-=OnNavigationStarting;core.NewWindowRequested-=OnNewWindowRequested;core=null;}
        if(view is null)return;
        view.CoreWebView2Initialized-=OnCoreInitialized;
        view=null;
    }
    public void Dispose(){disposed=true;host.HandlerChanged-=OnHandlerChanged;hybrid.HandlerChanged-=OnHandlerChanged;DetachView();}
}
#endif
