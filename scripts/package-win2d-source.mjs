// SPDX-License-Identifier: AGPL-3.0-only
import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const repository=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const [sourceArg,outputArg,nuget]=process.argv.slice(2);if(!sourceArg||!outputArg||!nuget)throw Error('Pass source, new build evidence directory and NuGet executable');
const source=resolve(sourceArg),output=resolve(outputArg),stage=join(output,'package'),commit='2cd2e846b0b410286a88fa5cddc3bc765de8be0b',version='1.4.1-gitpadplus.1';
const git=(...args)=>execFileSync('git',args,{cwd:source,encoding:'utf8'}).trim();
if(git('rev-parse','HEAD')!==commit||git('status','--porcelain'))throw Error('Unpinned or dirty upstream source');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const license=readFileSync(join(source,'LICENSE.txt'));
if(hash(license)!=='ba4eb1619f6e1a6bcb4130d3e42194a5f22b4a54c99a865ef90a3242f785fd1f')throw Error('Unreviewed source license');
const files=[];
function include(relative,target=relative){const bytes=readFileSync(join(source,relative));const dest=join(stage,target);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,bytes);files.push({source:relative,path:target,sha256:hash(bytes),bytes:bytes.length});}
include('LICENSE.txt');include('obj/Win2D.githash.txt','Win2D.githash.txt');
include('bin/uapx64/release/winrt.dll.uap/Microsoft.Graphics.Canvas.dll','runtimes/win-x64/native/Microsoft.Graphics.Canvas.dll');
include('bin/uapx64/release/winrt.dll.uap/Microsoft.Graphics.Canvas.winmd','lib/uap10.0/Microsoft.Graphics.Canvas.winmd');
include('bin/x64/release/winrt.projection/Microsoft.Graphics.Canvas.Interop.dll','lib/net6.0-windows10.0.19041.0/Microsoft.Graphics.Canvas.Interop.dll');
include('obj/winrt.lib.uap/uapx64/release/Generated Files/Microsoft.Graphics.Canvas.h','include/x64/Microsoft.Graphics.Canvas.h');
include('winrt/published/Microsoft.Graphics.Canvas.native.h','include/Microsoft.Graphics.Canvas.native.h');
for(const area of ['build','buildTransitive'])for(const [suffix,extension]of [['props','props'],['targets','targets']])include(`build/nuget/Microsoft.Graphics.Win2D-WinUI3.${suffix}`,`${area}/net6.0-windows10.0.19041.0/Microsoft.Graphics.Win2D.${extension}`);
const guard='<Project><Target Name="GitPadWin2DX64Only" BeforeTargets="PrepareForBuild" Condition="\'$(RuntimeIdentifier)\' != \'win-x64\'"><Error Text="This reviewed GitPad+ source rebuild supports only RuntimeIdentifier=win-x64." /></Target></Project>\n';
for(const area of ['build','buildTransitive']){const path=`${area}/net6.0-windows10.0.19041.0/Microsoft.Graphics.Win2D.targets`;const dest=join(stage,path);const original=readFileSync(dest,'utf8');const bytes=Buffer.from(original.replace('</Project>',guard.replace('<Project>','')));writeFileSync(dest,bytes);const entry=files.find(x=>x.path===path);entry.sha256=hash(bytes);entry.bytes=bytes.length;entry.transformation='Add fail-closed win-x64 RID guard; retain upstream targets';}
for(const name of readdirSync(join(repository,'third-party/win2d/notices'))){const bytes=readFileSync(join(repository,'third-party/win2d/notices',name));mkdirSync(join(stage,'notices'),{recursive:true});writeFileSync(join(stage,'notices',name),bytes);files.push({source:`GitPad+ third-party/win2d/notices/${name}`,path:`notices/${name}`,sha256:hash(bytes),bytes:bytes.length});}
const assetsPath='obj/winrt.projection/x64/release/project.assets.json',assets=JSON.parse(readFileSync(join(source,assetsPath),'utf8'));
const productDependencies=Object.entries(assets.libraries).filter(([,v])=>v.type==='package').map(([name,v])=>({name,sha512:v.sha512}));
const provenance={schemaVersion:1,package:{id:'Microsoft.Graphics.Win2D',version,scope:'GitPad+ downstream Windows x64 rebuild; not a Microsoft prebuilt release or upstream 1.4.1'},upstream:{repository:'https://github.com/microsoft/Win2D',commit,tree:git('rev-parse','HEAD^{tree}'),version:'1.4.0',sourceLicense:'MIT',licenseSha256:hash(license),trackedSourceClean:true},architecture:'x64',compiledNativeMatrix:['x86','x64','ARM64'],distributedNativeMatrix:['x64'],configuration:'Release',toolchain:JSON.parse(readFileSync(join(output,'toolchain.json'),'utf8')),managedProjection:{platformTarget:'AnyCPU',buildPlatform:'x64',sourceLink:false,reason:'Upstream AzureRepos SourceLink provider rejects the public GitHub remote; explicit source revision retained'},nativeRuntime:{linkage:'Upstream HybridCRT: static vcruntime/STL; dynamic Windows UCRT',sourceLicenseDoesNotRelicenseRuntime:true,retainedNotices:files.filter(f=>f.path.startsWith('notices/')).map(f=>f.path)},productDependencies,assetsSha256:hash(readFileSync(join(source,assetsPath))),files};
writeFileSync(join(stage,'source-build.json'),JSON.stringify(provenance,null,2)+'\n');
const nuspec=`<?xml version="1.0"?><package><metadata><id>Microsoft.Graphics.Win2D</id><version>${version}</version><authors>Microsoft (upstream); GitPad+ maintainers (source rebuild)</authors><description>GitPad+ Windows x64 source rebuild of Win2D 1.4.0 at ${commit}. Package revision is downstream only. Other architectures are unsupported.</description><license type="file">LICENSE.txt</license><requireLicenseAcceptance>false</requireLicenseAcceptance><repository type="git" url="https://github.com/microsoft/Win2D" commit="${commit}"/><dependencies><dependency id="Microsoft.WindowsAppSDK.WinUI" version="1.8.260204000"/></dependencies></metadata><files><file src="**/*" target="" exclude="package.nuspec"/></files></package>`;
writeFileSync(join(stage,'package.nuspec'),nuspec);execFileSync(nuget,['pack',join(stage,'package.nuspec'),'-BasePath',stage,'-OutputDirectory',output,'-NoPackageAnalysis','-NonInteractive'],{stdio:'inherit'});
const packageName=`Microsoft.Graphics.Win2D.${version}.nupkg`,packagePath=join(output,packageName);if(!existsSync(packagePath))throw Error('Expected package missing');
const binding={...provenance,package:{...provenance.package,file:packageName,sha256:hash(readFileSync(packagePath))},provenanceSha256:hash(readFileSync(join(stage,'source-build.json'))),buildLogs:['native.log','projection.log'].map(path=>({path,sha256:hash(readFileSync(join(output,path)))}))};
writeFileSync(join(output,'win2d-source-binding.json'),JSON.stringify(binding,null,2)+'\n');
console.log(`Built ${packageName}; native/MAUI runtime and redistribution review remain separate acceptance.`);
