// SPDX-License-Identifier: AGPL-3.0-only
namespace GitPadPlus.Core;

public record ClearTransaction(Guid Id, string Owner);
public sealed partial class VaultStore
{
    private string ClearIntent => Safe(".gitpad-clear.json");
    public bool ClearPending => File.Exists(ClearIntent);
    private void RecoverClear()
    {
        if(!File.Exists(ClearIntent))return;
        var intent=Read<ClearTransaction>(ClearIntent);
        if(intent.Owner!=File.ReadAllText(marker,Utf8))throw new RecoveryRequiredException("Clear ownership mismatch; files retained.");
        FinishClear(intent);
    }
    private void FinishClear(ClearTransaction intent)
    {
        var staging=Safe(".gitpad-clear-"+intent.Id.ToString("N"));Directory.CreateDirectory(staging);
        foreach(var name in new[]{"Journal","Assets",".gitpad"})
        {
            var original=Safe(name);var destination=Path.Combine(staging,name);
            if(Directory.Exists(original))
            {
                if(Directory.Exists(destination))throw new RecoveryRequiredException("Clear staging conflict; retained for inspection.");
                Directory.Move(original,destination);
            }
            checkpoint?.Invoke("Clear"+(name==".gitpad"?"Metadata":name)+"Moved");
        }
        // A crash before this point resumes the same explicitly confirmed clear.
        // No fresh vault directories are exposed until all old data is isolated.
        foreach(var _ in EnumerateChecked(staging)) { }
        Directory.Delete(staging,true);
        File.Delete(ClearIntent);
    }
    private void BeginClear()
    {
        DurableWrite(ClearIntent,Json(new ClearTransaction(Guid.NewGuid(),File.ReadAllText(marker,Utf8))));
        checkpoint?.Invoke("ClearStaged");RecoverClear();
    }
}
