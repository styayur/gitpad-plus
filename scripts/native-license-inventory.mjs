// SPDX-License-Identifier: AGPL-3.0-only
import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync,cpSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyWin2DSource,win2dVersion} from './win2d-source.mjs';

// Run after portable licenses.mjs, with snapshots of each actual native restore.
const inputs=process.argv.slice(2);
if(!inputs.length)throw Error('Supply actual native project.assets.json snapshot(s)');
const nuget=process.env.NUGET_PACKAGES;if(!nuget)throw Error('Set NUGET_PACKAGES to the restored package cache');
const sbom=JSON.parse(readFileSync('artifacts/SBOM.spdx.json','utf8'));
if(sbom.name!=='GitPadPlus-portable-dependencies')throw Error('Regenerate the portable SBOM before augmentation');
const inventory=[],unresolved=[],ids=new Map(),extracted=new Map();
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
    if(name==='Microsoft.Web.WebView2'&&text.includes('Redistribution and use in source and binary forms')&&text.includes('may not be used to endorse or promote'))license='BSD-3-Clause';
    else if(name.startsWith('Microsoft.Android.Runtime.Mono.')&&text.includes('The MIT License (MIT)')&&text.includes('Permission is hereby granted, free of charge'))license='MIT';
    else if(name.startsWith('Microsoft.WindowsAppSDK')||name==='Microsoft.Windows.SDK.BuildTools.MSIX')license=extractedLicense(text,name);
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
for(const input of inputs){
  const assets=JSON.parse(readFileSync(input,'utf8'));
  if(!assets.targets||!assets.libraries)throw Error('Expected native project.assets.json: '+input);
  for(const [framework,target] of Object.entries(assets.targets))for(const key of Object.keys(target)){
    if(assets.libraries[key]?.type!=='package')continue;
    const [name,version]=key.split('/');record(name,version,join(nuget,name.toLowerCase(),version),framework);
  }
}
// Self-contained Windows and Mono Android runtime packs are not normal PackageReferences.
record('Microsoft.NETCore.App.Runtime.win-x64','10.0.14',join(nuget,'microsoft.netcore.app.runtime.win-x64','10.0.14'),'Windows published runtime');
record('Microsoft.Windows.SDK.NET.Ref','10.0.19041.57',join(nuget,'microsoft.windows.sdk.net.ref','10.0.19041.57'),'Windows SDK projections');
const packs=join(process.env.DOTNET_ROOT??'','packs');
for(const abi of ['android-arm64','android-x64']){
  const name='Microsoft.NETCore.App.Runtime.Mono.'+abi;
  record(name,'10.0.11',join(packs,name,'10.0.11'),'Android published Mono runtime '+abi);
  const android='Microsoft.Android.Runtime.Mono.36.'+abi;
  record(android,'36.1.69',join(packs,android,'36.1.69'),'Android native runtime glue '+abi);
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
