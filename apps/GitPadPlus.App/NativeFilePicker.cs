// SPDX-License-Identifier: AGPL-3.0-only
using GitPadPlus.Core;

namespace GitPadPlus.App;

internal static class NativeFilePicker
{
    // The picker is opened after the WebView message handler has returned, on the
    // MAUI UI dispatcher. Do not open a synchronous WebView2 HTML file dialog.
    public static NativePickedFile? Pick(string kind){
      try{return PickAsync(kind).GetAwaiter().GetResult();}
      catch(Exception ex)when(ex is not OutOfMemoryException and not StackOverflowException){throw new InvalidOperationException("Selected file could not be imported.",ex);}
    }
    private static Task<NativePickedFile?> PickAsync(string kind)=>MainThread.InvokeOnMainThreadAsync<NativePickedFile?>(async()=>{
        var options=new PickOptions{PickerTitle=kind=="image"?"Import image":"Import Markdown",FileTypes=kind=="image"?FilePickerFileType.Images:new FilePickerFileType(new Dictionary<DevicePlatform,IEnumerable<string>>{
            [DevicePlatform.WinUI]=[".md",".markdown"],[DevicePlatform.Android]=["text/markdown","text/plain","application/octet-stream"]
        })};
        var file=await FilePicker.Default.PickAsync(options);
        if(file is null)return null;
        if(kind=="markdown"&&Path.GetExtension(file.FileName).ToLowerInvariant() is not ".md" and not ".markdown")throw new ArgumentException("Select a Markdown file.");
        await using var input=await file.OpenReadAsync();using var output=new MemoryStream();var buffer=new byte[16384];int count;
        var limit=kind=="image"?16_000_000:4_000_000;
        while((count=await input.ReadAsync(buffer))>0){if(output.Length+count>limit)throw new ArgumentException("Selected file exceeds import limit.");await output.WriteAsync(buffer.AsMemory(0,count));}
        return new NativePickedFile(Path.GetFileName(file.FileName),output.ToArray());
    });
}
