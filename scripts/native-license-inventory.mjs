// SPDX-License-Identifier: AGPL-3.0-only
import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync,cpSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {verifyWin2DSource,win2dVersion} from './win2d-source.mjs';
import {readZip} from './release-evidence.mjs';
import {reviewedSqliteLicense} from './reviewed-sqlite-license.mjs';

// Run after portable licenses.mjs, with snapshots of each actual native restore.
const inputs=process.argv.slice(2);
const runtimePins=JSON.parse(readFileSync('eng/toolchain.json')).nativeRuntimePins;
if(!runtimePins)throw Error('Missing reviewed native runtime pins');
if(!inputs.length)throw Error('Supply actual native project.assets.json snapshot(s)');
const nuget=process.env.NUGET_PACKAGES;if(!nuget)throw Error('Set NUGET_PACKAGES to the restored package cache');
const sbom=JSON.parse(readFileSync('artifacts/SBOM.spdx.json','utf8'));
if(sbom.name!=='GitPadPlus-portable-dependencies')throw Error('Regenerate the portable SBOM before augmentation');
const inventory=[],unresolved=[],ids=new Map();
const extracted=new Map((sbom.hasExtractedLicensingInfos??[]).map(entry=>[entry.licenseId,entry]));
const decode=value=>value.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const approved=new Set(['MIT','Apache-2.0','BSD-2-Clause','BSD-3-Clause','ISC','CC0-1.0']);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const extractedLicense=(text,label)=>{
  const id='LicenseRef-'+label+'-'+hash(text).slice(0,12);
  extracted.set(id,{licenseId:id,name:label,extractedText:text});return id;
};
function record(name,version,folder,scope){
  const key=name.toLowerCase()+'/'+version;
  if(ids.has(key)){ids.get(key).scopes.push(scope);return;}
  const specPath=join(folder,name.toLowerCase()+'.nuspec');
  const spec=readFileSync(specPath,'utf8');
  name=/<id>([^<]+)<\/id>/.exec(spec)?.[1]??name;
  const expression=/<license type="expression">([^<]+)<\/license>/.exec(spec)?.[1];
  const licenseFile=/<license type="file">([^<]+)<\/license>/.exec(spec)?.[1];
  let license=expression,review='metadata and retained upstream text',extra=[],sourceBuild;
  if(name==='Microsoft.Graphics.Win2D'&&version===win2dVersion){
    sourceBuild=verifyWin2DSource(folder);
    if(licenseFile!=='LICENSE.txt')throw Error('Source-built Win2D license metadata differs');
    const runtimeText=['VS2022-BuildTools.txt','VC-Runtime.txt'].map(file=>readFileSync(join(folder,'notices',file),'utf8')).join('\n\n');
    const runtime=extractedLicense(runtimeText,'Microsoft-VisualCpp-Runtime');
    license=`MIT AND (Apache-2.0 WITH LLVM-exception) AND ${runtime}`;
    review=`Reviewed downstream Windows x64 source rebuild, upstream ${sourceBuild.upstream.commit}; exact package and restored payload hashes verified. Win2D source MIT is independent of retained MSVC STL/runtime and Windows system-library terms; see third-party/win2d/README.md. No claim applies to the original prebuilt binary.`;
    extra.push(join(folder,'source-build.json'),'third-party/win2d/win2d-source-binding.json');
  }else if(expression){
    const atoms=expression.split(/\s+(?:AND|OR)\s+|[()]/).filter(Boolean);
    if(atoms.some(atom=>!approved.has(atom)))throw Error('Unreviewed native license expression '+key+' '+expression);
  }else if(licenseFile){
    const path=resolve(folder,decode(licenseFile));
    if(!path.startsWith(resolve(folder)+'/')&&!path.startsWith(resolve(folder)+'\\'))throw Error('License path escapes package');
    const text=readFileSync(path,'utf8');extra.push(path);
    const sqliteLicense=reviewedSqliteLicense(name,version,spec,folder);
    if(sqliteLicense){license=sqliteLicense.licenseId;extracted.set(license,sqliteLicense);}
    else if(name==='Microsoft.Web.WebView2'&&text.includes('Redistribution and use in source and binary forms')&&text.includes('may not be used to endorse or promote'))license='BSD-3-Clause';
    else if(name.startsWith('Microsoft.Android.Runtime.CoreCLR.')&&text.includes('The MIT License (MIT)')&&text.includes('Permission is hereby granted, free of charge'))license='MIT';
    else if(name==='Microsoft.Windows.AI.MachineLearning'&&version==='2.1.74'){
      if(hash(readFileSync(path))!=='66395f8cb219087fae2bd025010bd9076b736c14f03b48f20295471c0c376814'
          ||hash(readFileSync(join(folder,'ThirdPartyNotices.txt')))!=='fb0af774b4d7cffc5b9d046f2aaeade2f37df2f80abf8033c95dfffcc77a8866'){
        throw Error('Windows ML redistribution terms or third-party notices differ from the reviewed package');
      }
      license=extractedLicense(text,name);
      review='Windows ML package terms and third-party notices retained. Section 3 covers files binplaced by Windows App SDK in the application and sets redistribution conditions.';
    }else if(name.startsWith('Microsoft.WindowsAppSDK')||name==='Microsoft.Windows.SDK.BuildTools.MSIX')license=extractedLicense(text,name);
    else throw Error('Review native license file '+key);
  }else if(name==='Microsoft.Graphics.Win2D'&&version==='1.4.0'){
    const path='docs/licenses/win2d-legacy-eula.txt',text=readFileSync(path,'utf8');
    if(!spec.includes('eula_win2d_10012014.htm')||!text.includes('Distributable'))throw Error('Win2D legacy provenance missing');
    license=extractedLicense(text,'Microsoft-Win2D-binary');extra.push(path,'docs/licenses/win2d-LICENSE.txt');
    review='Legacy binary license URL requires authoritative applicability/redistribution review; current upstream source MIT does not relicense this binary';
    unresolved.push({name,version,issue:review});
  }else if(name==='Microsoft.Windows.SDK.BuildTools'||name==='Microsoft.Windows.SDK.NET.Ref'){
    const path='docs/licenses/windows-sdk-license.rtf';
    const text=readFileSync(path,'utf8');
    if(!text.startsWith('{\\rtf')||!spec.includes('https://aka.ms/WinSDKLicenseURL'))throw Error('Windows SDK license provenance missing');
    license=extractedLicense(text,'Microsoft-Windows-SDK');extra.push(path);
  }else throw Error('Missing native license '+key);
  const id='SPDXRef-native-'+(inventory.length+1),noticeDir=join('artifacts/third-party',id);
  mkdirSync(noticeDir,{recursive:true});
  const notices=readdirSync(folder).filter(file=>/license|notice|copyright|\.nuspec$/i.test(file));
  for(const file of notices)cpSync(join(folder,file),join(noticeDir,file),{recursive:true});
  for(const path of extra)cpSync(path,join(noticeDir,path.split(/[\\/]/).at(-1)));
  const record={name,version,license,scopes:[scope],review,notices:readdirSync(noticeDir)};inventory.push(record);ids.set(key,record);
  sbom.packages.push({SPDXID:id,name,versionInfo:version,downloadLocation:sourceBuild?'NOASSERTION':`https://api.nuget.org/v3-flatcontainer/${name.toLowerCase()}/${version}/${name.toLowerCase()}.${version}.nupkg`,filesAnalyzed:false,licenseDeclared:sourceBuild?'MIT':license,licenseConcluded:license,copyrightText:'NOASSERTION',comment:review,...(sourceBuild?{checksums:[{algorithm:'SHA256',checksumValue:sourceBuild.package.sha256}],sourceInfo:`Vendored third-party/win2d/feed/${sourceBuild.package.file}; built from https://github.com/microsoft/Win2D/tree/${sourceBuild.upstream.commit}`}:{})});
  sbom.relationships.push({spdxElementId:'SPDXRef-DOCUMENT',relationshipType:'DESCRIBES',relatedSpdxElement:id});
}
const downloads=new Map();
for(const input of inputs){
  const assets=JSON.parse(readFileSync(input,'utf8'));
  for(const framework of Object.values(assets.project.frameworks)){
    for(const dependency of framework.downloadDependencies??[]){
      const key=dependency.name.toLowerCase();
      if(downloads.has(key)&&downloads.get(key)!==dependency.version)throw Error('Native restores disagree on '+key);
      downloads.set(key,dependency.version);
    }
  }
  if(!assets.targets||!assets.libraries)throw Error('Expected native project.assets.json: '+input);
  for(const [framework,target] of Object.entries(assets.targets))for(const key of Object.keys(target)){
    if(assets.libraries[key]?.type!=='package')continue;
    const [name,version]=key.split('/');record(name,version,join(nuget,name.toLowerCase(),version),framework);
  }
}
// Framework runtime downloads are resolved outside the ordinary NuGet target graph.
function restoredPack(name,version,scope){
  const id=name.toLowerCase();
  if(downloads.get(id)!==`[${version}, ${version}]`)throw Error('Actual native restore differs from reviewed pack '+name+'@'+version);
  record(name,version,join(nuget,id,version),scope);
}
for(const name of ['Microsoft.NETCore.App','Microsoft.WindowsDesktop.App','Microsoft.AspNetCore.App']){
  restoredPack(name+'.Runtime.win-x64',runtimePins.windowsRuntimeVersion,'Windows published runtime');
}
restoredPack('Microsoft.Windows.SDK.NET.Ref',runtimePins.windowsSdkReferenceVersion,'Windows SDK projections');
const packs=join(process.env.DOTNET_ROOT??'','packs');
function workloadRecord(name,version,scope){
  const installed=join(packs,name,version),packageRoot=join(nuget,name.toLowerCase(),version);
  if(!existsSync(installed))throw Error('Reviewed installed workload pack missing: '+installed);
  const walk=folder=>readdirSync(folder,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(join(folder,entry.name)):[join(folder,entry.name)]);
  const binaries=walk(installed).filter(file=>/\.(?:dll|exe|so|a|lib|bc|dat|bin|wasm|jar|dylib|winmd)$/i.test(file));
  if(!binaries.length)throw Error('No installed workload binary payload: '+installed);
  const payload=binaries.map(file=>{
    const path=relative(installed,file),source=join(packageRoot,path),actual=readFileSync(file),sha256=hash(actual);
    if(!existsSync(source))throw Error('Installed workload payload is absent from official NuGet package: '+path);
    const expected=readFileSync(source),packageSha256=hash(expected);
    if(packageSha256===sha256)return {path:path.replaceAll('\\','/'),sha256};
    const evidence=join('artifacts/workload-payload-comparison',name,version,path);
    mkdirSync(resolve(evidence,'..'),{recursive:true});
    writeFileSync(evidence+'.installed',actual);writeFileSync(evidence+'.nuget',expected);
    if(!path.endsWith('.jar'))throw Error('Installed workload differs from exact official NuGet payload: '+path);
    // JAR compression/timestamps/order need not be reproducible. Every named
    // entry, including manifests/signature files, must retain identical bytes.
    const entries=readZip(actual),original=readZip(expected);
    const different=[...new Set([...entries.keys(),...original.keys()])].filter(key=>!entries.get(key)?.equals(original.get(key)??Buffer.alloc(0))||!original.has(key));
    const comparison={path:path.replaceAll('\\','/'),sha256,packageSha256,differentEntries:different,installedEntries:entries.size,packageEntries:original.size};
    writeFileSync(evidence+'.json',JSON.stringify(comparison,null,2)+'\n');
    if(entries.size!==original.size||different.some(key=>key!=='META-INF/MSFTSIG.RSA'))throw Error('Installed JAR entry bytes differ from official NuGet package: '+path+' '+different.join(','));
    if(different.length){
      const result=resolve(evidence+'.signature.json');
      execFileSync('pwsh',['-NoProfile','-File',resolve('scripts/verify-jar-provenance.ps1'),'-InstalledFile',file,'-ReferenceFile',source,'-OutputFile',result],{stdio:'inherit',timeout:60000});
      const signatures=JSON.parse(readFileSync(result,'utf8'));
      if(!signatures.passed||signatures.installed.sha256!==sha256||signatures.reference.sha256!==packageSha256)throw Error('JAR signature proof does not bind actual bytes');
      return {...comparison,signatures,comparison:'Every non-signature-block entry byte is identical; both differing Microsoft CMS blocks independently verify with trusted chains and the same signer identity'};
    }
    return {...comparison,comparison:'All ZIP entry names and decompressed bytes identical; only archive container encoding differs'};
  });
  record(name,version,packageRoot,scope);
  ids.get(name.toLowerCase()+'/'+version).installedPack={version,binaryFiles:payload.length,payload,metadataSource:`https://api.nuget.org/v3-flatcontainer/${name.toLowerCase()}/${version}/${name.toLowerCase()}.${version}.nupkg`,scope:'Official exact NuGet metadata/notices retained; binary bytes match except JAR container encoding or independently trusted same-signer CMS re-signing. Every other JAR entry byte must match. Installed metadata is not fabricated.'};
}
for(const abi of ['android-arm64','android-x64']){
  const name='Microsoft.NETCore.App.Runtime.'+abi;
  // The SDK restores CoreCLR via NuGet. Only Android's glue is a workload-installed pack.
  restoredPack(name,runtimePins.androidRuntimeVersion,'Android published CoreCLR runtime '+abi);
  const android='Microsoft.Android.Runtime.CoreCLR.37.'+abi;
  workloadRecord(android,runtimePins.androidRuntimeGlueVersion,'Android native runtime glue '+abi);
}
const fontText=readFileSync('docs/licenses/katex-fonts-OFL-1.1.txt','utf8');
if(!fontText.includes('SIL OPEN FONT LICENSE'))throw Error('Missing actual KaTeX asset license');
mkdirSync('artifacts/third-party/SPDXRef-katex-fonts',{recursive:true});
cpSync('docs/licenses/katex-fonts-OFL-1.1.txt','artifacts/third-party/SPDXRef-katex-fonts/OFL-1.1.txt');
sbom.packages.push({SPDXID:'SPDXRef-katex-fonts',name:'KaTeX bundled font assets',downloadLocation:'https://github.com/KaTeX/KaTeX',filesAnalyzed:false,licenseDeclared:'OFL-1.1',licenseConcluded:'OFL-1.1',copyrightText:'See retained per-font upstream notices'});
sbom.relationships.push({spdxElementId:'SPDXRef-DOCUMENT',relationshipType:'DESCRIBES',relatedSpdxElement:'SPDXRef-katex-fonts'});
sbom.name='GitPadPlus-native-and-portable-dependencies';sbom.hasExtractedLicensingInfos=[...extracted.values()];
sbom.documentNamespace+='-native-'+hash(inputs.map(path=>readFileSync(path)).join('')).slice(0,16);
writeFileSync('artifacts/SBOM.spdx.json',JSON.stringify(sbom,null,2)+'\n');
writeFileSync('artifacts/native-license-inventory.json',JSON.stringify({inputs:inputs.map(path=>({path:relative(process.cwd(),resolve(path)),sha256:hash(readFileSync(path))})),inventory,unresolved,passed:unresolved.length===0},null,2)+'\n');
console.log(`Inventoried ${inventory.length} exact native dependencies; ${unresolved.length} unresolved redistribution review(s).`);
if(unresolved.length)process.exitCode=2;
