// SPDX-License-Identifier: AGPL-3.0-only
namespace GitPadPlus.App;

internal static class NativeClipboard
{
    public static byte[] ReadImage()
    {
        try{return MainThread.InvokeOnMainThreadAsync(ReadPlatformAsync).GetAwaiter().GetResult();}
        catch(Exception ex) when(ex is not OutOfMemoryException and not StackOverflowException){throw new InvalidOperationException("Clipboard contains no available supported image.",ex);}
    }
    private static Task<byte[]> ReadPlatformAsync()
    {
#if WINDOWS
        return ReadWindowsAsync();
#elif ANDROID
        var context=Android.App.Application.Context;
        var clipboard=context.GetSystemService(Android.Content.Context.ClipboardService) as Android.Content.ClipboardManager;
        var clip=clipboard?.PrimaryClip;
        var uri=clip is not null&&clip.ItemCount>0?clip.GetItemAt(0)?.Uri:null;
        var resolver=context.ContentResolver;
        if(uri?.Scheme!="content"||resolver?.GetType(uri)?.StartsWith("image/",StringComparison.OrdinalIgnoreCase)!=true)throw new InvalidOperationException("No clipboard image.");
        using var input=resolver.OpenInputStream(uri)??throw new InvalidOperationException("Clipboard image unavailable.");
        using var output=new MemoryStream();var buffer=new byte[16384];int count;
        while((count=input.Read(buffer,0,buffer.Length))>0){if(output.Length+count>16_000_000)throw new ArgumentException("Image exceeds 16 MB.");output.Write(buffer,0,count);}
        return Task.FromResult(output.ToArray());
#else
        throw new InvalidOperationException("Native image clipboard unavailable.");
#endif
    }
#if WINDOWS
    private static async Task<byte[]> ReadWindowsAsync()
    {
        var data=Windows.ApplicationModel.DataTransfer.Clipboard.GetContent();
        if(!data.Contains(Windows.ApplicationModel.DataTransfer.StandardDataFormats.Bitmap))throw new InvalidOperationException("No clipboard image.");
        var reference=await data.GetBitmapAsync();using var stream=await reference.OpenReadAsync();
        var decoder=await Windows.Graphics.Imaging.BitmapDecoder.CreateAsync(stream);
        if((ulong)decoder.PixelWidth*decoder.PixelHeight>16_000_000)throw new ArgumentException("Clipboard image dimensions exceed limit.");
        using var bitmap=await decoder.GetSoftwareBitmapAsync();using var output=new Windows.Storage.Streams.InMemoryRandomAccessStream();
        var encoder=await Windows.Graphics.Imaging.BitmapEncoder.CreateAsync(Windows.Graphics.Imaging.BitmapEncoder.PngEncoderId,output);
        encoder.SetSoftwareBitmap(bitmap);await encoder.FlushAsync();
        if(output.Size>16_000_000)throw new ArgumentException("Image exceeds 16 MB.");
        using var reader=new Windows.Storage.Streams.DataReader(output.GetInputStreamAt(0));await reader.LoadAsync((uint)output.Size);
        var bytes=new byte[(int)output.Size];reader.ReadBytes(bytes);return bytes;
    }
#endif
}
