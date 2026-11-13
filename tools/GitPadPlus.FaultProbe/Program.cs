// SPDX-License-Identifier: AGPL-3.0-only
using System.Diagnostics;
using System.Text.Json;
using GitPadPlus.Core;

const string replacement="Process termination during durable save — 中文 👩🏽‍💻\n";
if(args.Length==5&&args[0]=="--child"){
    var store=new VaultStore(args[1],point=>{if(point==args[2]){File.WriteAllText(args[3],point);Thread.Sleep(Timeout.Infinite);}});
    var note=store.Load(Guid.Parse(args[4]));
    store.Save(new(note.Header.Id,replacement,note.Header.Title,[],note.Sidecar.Revision,note.Sidecar.ContentHash,[],[]));
    throw new InvalidOperationException("Expected the parent to terminate this child at the transaction checkpoint.");
}
if(args.Length!=2)throw new ArgumentException("Usage: FaultProbe <dedicated disposable parent> <report.json>");
var parent=Path.GetFullPath(args[0]);
Directory.CreateDirectory(parent);
var results=new List<object>();
foreach(var stage in new[]{"Staged","MarkdownReplaced","SidecarReplaced"}){
    var directory=Path.Combine(parent,"gitpad-process-fault-"+Guid.NewGuid().ToString("N"));
    var root=Path.Combine(directory,"Vault");var marker=Path.Combine(directory,"checkpoint.txt");
    var store=new VaultStore(root);var note=store.Create("2026-10-31","Process fault "+stage);
    var original=File.ReadAllText(store.Safe("Journal",note.Header.Id+".md"));
    var executable=Environment.ProcessPath??throw new InvalidOperationException("Process path missing");
    var start=new ProcessStartInfo(executable){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};
    if(Path.GetFileNameWithoutExtension(executable).Equals("dotnet",StringComparison.OrdinalIgnoreCase))start.ArgumentList.Add(typeof(Program).Assembly.Location);
    foreach(var value in new[]{"--child",root,stage,marker,note.Header.Id.ToString()})start.ArgumentList.Add(value);
    using var child=Process.Start(start)??throw new InvalidOperationException("Child failed to start");
    var timeout=Stopwatch.StartNew();
    while(!File.Exists(marker)&&!child.HasExited&&timeout.Elapsed<TimeSpan.FromSeconds(60))Thread.Sleep(50);
    if(!File.Exists(marker)){if(!child.HasExited)child.Kill(true);throw new InvalidOperationException("Transaction checkpoint not reached: "+stage+" "+child.StandardError.ReadToEnd());}
    var transactions=Directory.GetDirectories(store.Safe(".gitpad","transactions"));
    if(transactions.Length!=1)throw new InvalidOperationException("Expected an actual pending transaction");
    var transaction=transactions[0];
    var retainedOriginal=File.ReadAllText(Path.Combine(transaction,"previous.md"));
    if(retainedOriginal!=original)throw new InvalidOperationException("Previous version was not retained before termination");
    var stagedEvidence=Directory.GetFiles(transaction).Select(path=>new{name=Path.GetFileName(path),sha256=Identity.Hash(File.ReadAllText(path))}).ToArray();
    child.Kill(true);child.WaitForExit();
    if(child.ExitCode==0)throw new InvalidOperationException("Child was not forcibly terminated");
    var reopened=new VaultStore(root);var recovered=reopened.Load(note.Header.Id);
    if(recovered.Body!=replacement||recovered.Sidecar.Revision!=2||reopened.RecoveryIssues.Count!=0||Directory.GetDirectories(reopened.Safe(".gitpad","transactions")).Length!=0)throw new InvalidOperationException("Incomplete pair recovery after process termination");
    results.Add(new{stage,passed=true,childProcessId=child.Id,exitCode=child.ExitCode,vault=root,documentId=note.Header.Id,stagedEvidence,recoveredHash=recovered.Sidecar.ContentHash});
    // Retain these dedicated fixtures for inspection; never delete caller directories.
}
var report=Path.GetFullPath(args[1]);Directory.CreateDirectory(Path.GetDirectoryName(report)!);
File.WriteAllText(report,JsonSerializer.Serialize(new{scope="Actual Core writer subprocess termination on this host; native app lifecycle tested separately",os=System.Runtime.InteropServices.RuntimeInformation.OSDescription,timestamp=DateTimeOffset.UtcNow,passed=true,results},new JsonSerializerOptions{WriteIndented=true}));
Console.WriteLine(File.ReadAllText(report));
