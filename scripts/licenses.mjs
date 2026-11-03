// SPDX-License-Identifier: AGPL-3.0-only
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, cpSync, renameSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
const groups=JSON.parse(process.platform==='win32'
  ?execFileSync(process.env.ComSpec??'cmd.exe',['/d','/s','/c','pnpm licenses list --json'],{encoding:'utf8',maxBuffer:20_000_000})
  :execFileSync('pnpm',['licenses','list','--json'],{encoding:'utf8',maxBuffer:20_000_000}));
// Reused numeric SPDX directories can otherwise retain notices from an older
// native dependency graph. Preserve that generated evidence, then collect this
// inventory into a fresh tree instead of merging unrelated package contents.
const artifactsRoot=resolve('artifacts'),noticeRoot=join(artifactsRoot,'third-party');
if(existsSync(noticeRoot)){
  const history=join(artifactsRoot,'license-history'),archive=join(history,randomUUID());
  if(!noticeRoot.startsWith(artifactsRoot+sep)||!archive.startsWith(artifactsRoot+sep))throw Error('Notice archive escapes generated artifacts');
  mkdirSync(history,{recursive:true});renameSync(noticeRoot,archive);
}
mkdirSync(noticeRoot,{recursive:true});
const approved=new Set(['MIT','MIT-0','Apache-2.0','BSD-2-Clause','BSD-3-Clause','ISC','CC0-1.0','BlueOak-1.0.0','MPL-2.0','(MPL-2.0 OR Apache-2.0)']);
const packages=[],inventory=[];let count=0;
for(const [license,items] of Object.entries(groups)){
  if(!approved.has(license))throw new Error('Unreviewed license expression: '+license);
  for(const item of items)for(const version of item.versions){
    const id='SPDXRef-npm-'+(++count),packagePath=item.paths.find(p=>existsSync(join(p,'package.json')));
    if(!packagePath)throw new Error('Missing installed package: '+item.name);
    const meta=JSON.parse(readFileSync(join(packagePath,'package.json')));
    const notices=readdirSync(packagePath).filter(name=>/^(licen[sc]e|copying|notice|copyright)([.-]|$)/i.test(name));
    const noticeDir=join('artifacts/third-party',id);mkdirSync(noticeDir,{recursive:true});
    for(const name of notices)cpSync(join(packagePath,name),join(noticeDir,name),{recursive:true});
    packages.push({SPDXID:id,name:item.name,versionInfo:version,downloadLocation:'https://registry.npmjs.org/'+encodeURIComponent(item.name)+'/-/'+item.name.split('/').at(-1)+'-'+version+'.tgz',filesAnalyzed:false,licenseConcluded:license,licenseDeclared:license,copyrightText:typeof meta.author==='string'?meta.author:meta.author?.name??'NOASSERTION',externalRefs:[{referenceCategory:'PACKAGE-MANAGER',referenceType:'purl',referenceLocator:'pkg:npm/'+item.name.replace('@','%40')+'@'+version}]});
    inventory.push({name:item.name,version,license,noticeFiles:notices,source:meta.repository??meta.homepage??null});
  }
}
// NuGet licenses are read from the exact restored nuspecs, not guessed from names.
const nugetRoot=process.env.NUGET_PACKAGES??join(process.env.USERPROFILE??process.env.HOME,'.nuget','packages');
for(const project of ['src/GitPadPlus.Core','tests/dotnet','apps/GitPadPlus.DevHost']){
  const lockPath=join(project,'packages.lock.json');if(!existsSync(lockPath))throw new Error('Missing NuGet lock: '+lockPath);
  const lock=JSON.parse(readFileSync(lockPath));
  for(const dependencies of Object.values(lock.dependencies))for(const [name,entry] of Object.entries(dependencies)){
    if(entry.type==='Project'||inventory.some(x=>x.name===name&&x.version===entry.resolved))continue;
    const folder=join(nugetRoot,name.toLowerCase(),entry.resolved),nuspec=readFileSync(join(folder,name.toLowerCase()+'.nuspec'),'utf8');
    let license=/<license type="expression">([^<]+)<\/license>/.exec(nuspec)?.[1];
    // This legacy package declares licenseUrl rather than an SPDX expression. Its exact
    // contemporaneous upstream license is retained and reviewed in THIRD_PARTY_NOTICES.md.
    if(!license&&name==='xunit.abstractions'&&entry.resolved==='2.0.3'&&nuspec.includes('https://raw.githubusercontent.com/xunit/xunit/master/license.txt')){
      const text=readFileSync('docs/licenses/xunit-abstractions-2.0.3.txt','utf8');
      if(!text.includes('Apache License')||!text.includes('Version 2.0'))throw new Error('Legacy xUnit license evidence missing');
      license='Apache-2.0';
    }
    if(!license||!approved.has(license))throw new Error('Review NuGet license: '+name+' '+license);
    const id='SPDXRef-nuget-'+(++count),noticeDir=join('artifacts/third-party',id);mkdirSync(noticeDir,{recursive:true});
    for(const file of readdirSync(folder).filter(f=>/license|notice|copyright|\.nuspec$/i.test(f)))cpSync(join(folder,file),join(noticeDir,file),{recursive:true});
    inventory.push({name,version:entry.resolved,license,source:'NuGet'});
    packages.push({SPDXID:id,name,versionInfo:entry.resolved,downloadLocation:`https://api.nuget.org/v3-flatcontainer/${name.toLowerCase()}/${entry.resolved}/${name.toLowerCase()}.${entry.resolved}.nupkg`,filesAnalyzed:false,licenseDeclared:license,licenseConcluded:license,copyrightText:'NOASSERTION'});
  }
}
const digest=createHash('sha256').update(readFileSync('pnpm-lock.yaml')).digest('hex');
const sbom={spdxVersion:'SPDX-2.3',dataLicense:'CC0-1.0',SPDXID:'SPDXRef-DOCUMENT',name:'GitPadPlus-portable-dependencies',documentNamespace:'https://github.com/styayur/gitpad-plus/sbom/'+digest,creationInfo:{created:new Date().toISOString(),creators:['Tool: GitPadPlus-license-inventory-0.1']},packages,relationships:packages.map(p=>({spdxElementId:'SPDXRef-DOCUMENT',relationshipType:'DESCRIBES',relatedSpdxElement:p.SPDXID}))};
writeFileSync('artifacts/SBOM.spdx.json',JSON.stringify(sbom,null,2)+'\n');
writeFileSync('artifacts/license-inventory.json',JSON.stringify({scope:'installed portable npm/NuGet dependencies; native workloads and artifacts require a separate audit',inventory},null,2)+'\n');
console.log(`Recorded ${packages.length} restored package licenses and preserved upstream notice files. MPL-2.0 sources remain under MPL; inventory records their source locations. Native binary license gate is still pending.`);
