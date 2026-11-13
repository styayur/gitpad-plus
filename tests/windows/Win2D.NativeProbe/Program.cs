// SPDX-License-Identifier: AGPL-3.0-only
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;

if (!OperatingSystem.IsWindows() || args.Length != 2)
    throw new ArgumentException("Windows only: pass the actual Canvas DLL and a JSON report path.");
var path = Path.GetFullPath(args[0]);
var reportPath = Path.GetFullPath(args[1]);
Marshal.ThrowExceptionForHR(Native.RoInitialize(1));
var library = NativeLibrary.Load(path);
nint className = 0, factory = 0, statics = 0;
try
{
    const string name = "Microsoft.Graphics.Canvas.CanvasDevice";
    Marshal.ThrowExceptionForHR(Native.WindowsCreateString(name, name.Length, out className));
    var activate = Marshal.GetDelegateForFunctionPointer<Native.GetFactory>(NativeLibrary.GetExport(library, "DllGetActivationFactory"));
    Marshal.ThrowExceptionForHR(activate(className, out factory));
    // ABI, IID and slots from the generated header at Win2D 2cd2e846.
    var iid = new Guid("9B6E2B27-CD07-421A-8F69-0AE8A787FE8C");
    Marshal.ThrowExceptionForHR(Marshal.QueryInterface(factory, in iid, out statics));
    var shared = Slot<Native.SharedDevice>(statics, 8);
    var devices = new List<object>();
    foreach (byte software in new byte[] { 0, 1 })
    {
        Marshal.ThrowExceptionForHR(shared(statics, software, out var device));
        try
        {
            Marshal.ThrowExceptionForHR(Slot<Native.GetInt>(device, 7)(device, out var maximum));
            // DirectXPixelFormat.B8G8R8A8UIntNormalized = 87.
            Marshal.ThrowExceptionForHR(Slot<Native.PixelFormat>(device, 8)(device, 87, out var supported));
            if (maximum < 1 || supported == 0) throw new InvalidOperationException("Canvas device capabilities failed.");
            devices.Add(new { requestedSoftwareRenderer = software == 1, maximumBitmapSizeInPixels = maximum, bgra8Supported = supported != 0 });
        }
        finally { Marshal.Release(device); }
    }
    File.WriteAllText(reportPath, JsonSerializer.Serialize(new { dll = path, sha256 = Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(path))), architecture = RuntimeInformation.ProcessArchitecture.ToString(), scope = "Actual native Win2D factory, hardware/default and WARP device creation and capability calls; not a MAUI or managed-projection acceptance", devices }, new JsonSerializerOptions { WriteIndented = true }) + "\n");
    Console.WriteLine(File.ReadAllText(reportPath));
}
finally
{
    if (statics != 0) Marshal.Release(statics);
    if (factory != 0) Marshal.Release(factory);
    if (className != 0) Native.WindowsDeleteString(className);
    NativeLibrary.Free(library);
    Native.RoUninitialize();
}
static T Slot<T>(nint instance, int slot) where T : Delegate => Marshal.GetDelegateForFunctionPointer<T>(Marshal.ReadIntPtr(Marshal.ReadIntPtr(instance), slot * IntPtr.Size));
internal static class Native
{
    [DllImport("combase.dll")] internal static extern int RoInitialize(uint mode);
    [DllImport("combase.dll")] internal static extern void RoUninitialize();
    [DllImport("combase.dll", CharSet = CharSet.Unicode)] internal static extern int WindowsCreateString(string value, int length, out nint result);
    [DllImport("combase.dll")] internal static extern int WindowsDeleteString(nint value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate int GetFactory(nint name, out nint factory);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate int SharedDevice(nint self, byte software, out nint device);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate int GetInt(nint self, out int value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate int PixelFormat(nint self, int format, out byte supported);
}
