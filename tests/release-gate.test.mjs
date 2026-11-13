// SPDX-License-Identifier: AGPL-3.0-only
// Synthetic unit fixtures; never native acceptance evidence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';
import { requiredGates, verifyEvidence, readZip, verifyAndroidBadging } from '../scripts/release-evidence.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');
function zip(entries){
  const bodies=[],central=[];let offset=0;
  for(const [name,value] of Object.entries(entries)){
    const bytes=Buffer.from(value),filename=Buffer.from(name),local=Buffer.alloc(30),header=Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50);local.writeUInt32LE(crc32(bytes),14);local.writeUInt32LE(bytes.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(filename.length,26);
    header.writeUInt32LE(0x02014b50);header.writeUInt32LE(crc32(bytes),16);header.writeUInt32LE(bytes.length,20);header.writeUInt32LE(bytes.length,24);header.writeUInt16LE(filename.length,28);header.writeUInt32LE(offset,42);
    bodies.push(local,filename,bytes);central.push(header,filename);offset+=local.length+filename.length+bytes.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(central.length/2,8);end.writeUInt16LE(central.length/2,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...bodies,directory,end]);
}
function fixture(){
  const directory=mkdtempSync(join(tmpdir(),'gitpad-gate-unit-')),sha='a'.repeat(40),exe=Buffer.alloc(256);exe.write('MZ');exe.writeUInt32LE(128,0x3c);exe.writeUInt32LE(0x4550,128);exe.writeUInt16LE(0x8664,132);
  const assets={
    'GitPadPlus-Windows-x64.zip':{role:'windows-zip',data:zip({'GitPadPlus.App.exe':exe,'GitPadPlus.App.dll':sha,'GitPadPlus.App.runtimeconfig.json':JSON.stringify({runtimeOptions:{includedFrameworks:[{name:'synthetic'}]}}),'Microsoft.ui.xaml.dll':'unit fixture','THIRD_PARTY_LICENSES.txt':'Synthetic license text','THIRD_PARTY_NOTICES.md':'Synthetic unit fixture'})},
    'GitPadPlus-Android-Release.apk':{role:'android-release-apk',data:zip({'AndroidManifest.xml':'unit fixture','classes.dex':'unit fixture','assets/wwwroot/THIRD_PARTY_LICENSES.txt':'Synthetic license text'})},
    'SBOM.spdx.json':{role:'sbom',data:JSON.stringify({spdxVersion:'SPDX-2.3',packages:[{name:'synthetic fixture'}]})},
    'THIRD_PARTY_NOTICES.md':{role:'notices',data:'Synthetic unit fixture'},'RELEASE_NOTES.md':{role:'release-notes',data:'Synthetic unit fixture'},'test.log':{role:'evidence',data:'Synthetic unit fixture; no native acceptance performed'},
  };
  const evidence={schemaVersion:2,version:'0.1.0-alpha.1',sourceCommit:sha,physicalDeviceVerified:false,devices:{windows:{description:'Synthetic Windows fixture'},android:{kind:'emulator',description:'Synthetic emulator fixture',physicalDeviceVerified:false}},gates:Object.fromEntries(requiredGates.map(gate=>[gate,{status:'passed',sourceCommit:sha,version:'0.1.0-alpha.1',logs:['test.log']}])),licenses:{scope:'native-and-web'},windows:{cleanExtractionTested:true,signature:'unsigned',packagedExecutableSha256:digest(exe)},android:{buildToolsVersion:'36.0.0',certificateSha256:'b'.repeat(64)}};
  evidence.licenses.unresolved=[];
  function save(){
    evidence.files=Object.entries(assets).map(([path,value])=>{writeFileSync(join(directory,path),value.data);return {path,role:value.role,sha256:digest(value.data)};});
    const json=JSON.stringify(evidence);writeFileSync(join(directory,'acceptance.json'),json);
    writeFileSync(join(directory,'SHA256SUMS.txt'),[...evidence.files.map(f=>`${f.sha256}  ${f.path}`),`${digest(json)}  acceptance.json`].join('\n')+'\n');
  }
  save();return {directory,sha,evidence,assets,save,cleanup:()=>rmSync(directory,{recursive:true,force:true})};
}
test('valid structural unit fixture reaches the independently injected APK inspector',()=>{const f=fixture();try{let called=false;verifyEvidence(f.directory,f.sha,()=>{called=true;});assert.equal(called,true);}finally{f.cleanup();}});
const androidBadging="package: name='io.github.styayur.gitpadplus' versionCode='1' versionName='0.1.0-alpha.1'\nminSdkVersion:'26'\ntargetSdkVersion:'36'\nnative-code: 'arm64-v8a' 'x86_64'\n";
test('accepts actual aapt2 minimum-SDK field names with LF or CRLF',()=>{for(const badging of [androidBadging,androidBadging.replace('minSdkVersion','sdkVersion').replaceAll('\n','\r\n')])assert.doesNotThrow(()=>verifyAndroidBadging(badging));});
test('rejects wrong Android SDK/ABI fields and Debug badging',()=>{for(const badging of [androidBadging.replace("minSdkVersion:'26'","minSdkVersion:'25'"),androidBadging.replace("targetSdkVersion:'36'","targetSdkVersion:'35'"),androidBadging.replace(" 'x86_64'",''),androidBadging+'application-debuggable\n'])assert.throws(()=>verifyAndroidBadging(badging),/SDK|Debug/);});
test('rejects Windows ZIP entries that collide on a case-insensitive filesystem',()=>{const f=fixture();try{const entries=Object.fromEntries(readZip(f.assets['GitPadPlus-Windows-x64.zip'].data));entries['Microsoft.UI.Xaml.dll']='collision';f.assets['GitPadPlus-Windows-x64.zip'].data=zip(entries);f.save();assert.throws(()=>verifyEvidence(f.directory,f.sha,()=>{}),/case-colliding/);}finally{f.cleanup();}});
for(const [name,change,pattern] of [
  ['wrong commit',f=>{f.evidence.sourceCommit='c'.repeat(40);},/Commit/],
  ['wrong version',f=>{f.evidence.version='0.1.0';},/version/],
  ['physical device mislabel',f=>{f.evidence.devices.android.kind='physical';},/emulator/],
  ['failed native gate',f=>{f.evidence.gates.windowsPackagedRuntime.status='not_run';},/windowsPackagedRuntime/],
  ['empty log',f=>{f.assets['test.log'].data='';},/empty/],
  ['unhashed log',f=>{f.evidence.gates.saveRecovery.logs=['absent.log'];},/evidence/],
  ['missing SBOM',f=>{delete f.assets['SBOM.spdx.json'];},/SBOM/],
  ['unresolved native license',f=>{f.evidence.licenses.unresolved=['Win2D binary license applicability'];},/redistribution/],
  ['test APK asset',f=>{f.assets['GitPadPlus-Acceptance-Tests.apk']={role:'evidence',data:'synthetic test package'};},/test APK/],
  ['unqualified ZIP',f=>{f.evidence.windows.cleanExtractionTested=false;},/qualified/],
])test('rejects '+name,()=>{const f=fixture();try{change(f);f.save();assert.throws(()=>verifyEvidence(f.directory,f.sha,()=>{}),pattern);}finally{f.cleanup();}});
test('rejects binary checksum mutation and unexpected release files',()=>{const f=fixture();try{writeFileSync(join(f.directory,'test.log'),'changed');assert.throws(()=>verifyEvidence(f.directory,f.sha,()=>{}),/Checksum/);f.save();writeFileSync(join(f.directory,'unexpected.txt'),'extra');assert.throws(()=>verifyEvidence(f.directory,f.sha,()=>{}),/Unexpected/);}finally{f.cleanup();}});
test('APK signature verification failure cannot pass the gate',()=>{const f=fixture();try{assert.throws(()=>verifyEvidence(f.directory,f.sha,()=>{throw new Error('unsigned or Debug APK');}),/unsigned or Debug/);}finally{f.cleanup();}});
