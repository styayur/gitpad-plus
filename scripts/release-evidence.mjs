// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync, realpathSync, statSync, readdirSync } from 'node:fs';
import { resolve, sep, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { inflateRawSync, crc32 } from 'node:zlib';
import { execFileSync } from 'node:child_process';

export const requiredGates = ['windowsBuild','windowsRuntime','windowsPackagedRuntime','androidBuild','androidReleaseSignature','androidRuntime','markdownFidelity','saveRecovery','blockIdentity','selectionAnchors','pluginIsolation','pluginPersistence','safeClear','security','licenses','nativeFeatureAcceptance','verifiedAssets'];
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error('RELEASE BLOCKED: '+message); };

// Read central-directory entries rather than trusting extensions or local headers.
// ZIP64 is deliberately rejected: alpha packages must fit ordinary ZIP limits.
export function readZip(bytes) {
  let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50&&i+22+bytes.readUInt16LE(i+20)===bytes.length){end=i;break;}
  if(end<0)fail('Invalid ZIP end record');
  const count=bytes.readUInt16LE(end+10);let offset=bytes.readUInt32LE(end+16);
  if(count===65535||bytes.readUInt16LE(end+4)!==0||bytes.readUInt16LE(end+6)!==0)fail('Unsupported ZIP64/multi-volume archive');
  const entries=new Map();
  for(let i=0;i<count;i++){
    if(bytes.readUInt32LE(offset)!==0x02014b50)fail('Invalid ZIP central directory');
    const flags=bytes.readUInt16LE(offset+8),method=bytes.readUInt16LE(offset+10),size=bytes.readUInt32LE(offset+20),unpacked=bytes.readUInt32LE(offset+24),nameLength=bytes.readUInt16LE(offset+28),extra=bytes.readUInt16LE(offset+30),comment=bytes.readUInt16LE(offset+32),local=bytes.readUInt32LE(offset+42);
    const name=bytes.subarray(offset+46,offset+46+nameLength).toString('utf8');
    if(flags&1||name.includes('\\')||name.startsWith('/')||name.split('/').some(s=>s==='..')||entries.has(name)||/^[A-Za-z]:/.test(name))fail('Unsafe/duplicate ZIP entry');
    if(bytes.readUInt32LE(local)!==0x04034b50)fail('Invalid ZIP local header');
    const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);
    if(start+size>bytes.length||unpacked>1_000_000_000)fail('Invalid/oversized ZIP entry');
    const packed=bytes.subarray(start,start+size),value=method===0?packed:method===8?inflateRawSync(packed,{maxOutputLength:unpacked+1}):fail('Unsupported ZIP compression');
    if(value.length!==unpacked||crc32(value)!==bytes.readUInt32LE(offset+16))fail('Truncated/corrupt ZIP entry');
    entries.set(name,value);offset+=46+nameLength+extra+comment;
  }
  return entries;
}

export function verifyAndroidBadging(badging) {
  if(!badging.includes("name='io.github.styayur.gitpadplus'")||!badging.includes("versionName='0.1.0-alpha.1'")||!badging.includes("versionCode='1'")||badging.includes('application-debuggable'))fail('Wrong package/version or Debug APK');
  const abis=/^native-code:\s*(.+)\r?$/m.exec(badging)?.[1]??'';
  if(!/^(?:minSdkVersion|sdkVersion):'26'\r?$/m.test(badging)||!/^targetSdkVersion:'36'\r?$/m.test(badging)||!abis.includes("'arm64-v8a'")||!abis.includes("'x86_64'"))fail('Wrong minimum/target SDK or missing distributed Android ABI');
}

export function inspectAndroid(apk, evidence) {
  const sdk=process.env.ANDROID_SDK_ROOT??process.env.ANDROID_HOME;
  if(!sdk)fail('ANDROID_SDK_ROOT is required for actual APK verification');
  const tools=resolve(sdk,'build-tools',evidence.android.buildToolsVersion);
  const suffix=process.platform==='win32'?'.exe':'';
  const badging=execFileSync(resolve(tools,'aapt2'+suffix),['dump','badging',apk],{encoding:'utf8'});
  const certificate=execFileSync('java',['-jar',resolve(tools,'lib','apksigner.jar'),'verify','--verbose','--print-certs',apk],{encoding:'utf8'});
  const manifest=execFileSync(resolve(tools,'aapt2'+suffix),['dump','xmltree',apk,'--file','AndroidManifest.xml'],{encoding:'utf8'});
  verifyAndroidBadging(badging);
  if(/CN=Android Debug/i.test(certificate))fail('Debug signing identity');
  if(!new RegExp('gitpadplus\\.sourceCommit[\\s\\S]{0,600}'+evidence.sourceCommit).test(manifest))fail('APK source commit stamp mismatch');
  const fingerprint=/certificate SHA-256 digest:\s*([a-f0-9]{64})/i.exec(certificate)?.[1]?.toLowerCase();
  if(!fingerprint||fingerprint!==evidence.android.certificateSha256)fail('Signing certificate fingerprint mismatch');
  return {badging,certificate};
}

export function verifyEvidence(directory, sourceCommit, inspectApk=inspectAndroid) {
  directory=realpathSync(resolve(directory));
  const evidence=JSON.parse(readFileSync(resolve(directory,'acceptance.json'),'utf8'));
  if(evidence.schemaVersion!==2||evidence.version!=='0.1.0-alpha.1'||!/^[a-f0-9]{40}$/.test(sourceCommit??'')||evidence.sourceCommit!==sourceCommit)fail('Commit/version/schema mismatch');
  if(evidence.devices?.android?.kind!=='emulator'||evidence.devices.android.physicalDeviceVerified!==false||evidence.physicalDeviceVerified!==false)fail('Android acceptance must explicitly identify emulator-only scope');
  for(const platform of ['windows','android'])if(!evidence.devices?.[platform]?.description?.trim())fail('Missing real device description: '+platform);
  for(const gate of requiredGates){
    const result=evidence.gates?.[gate];
    if(result?.status!=='passed'||!Array.isArray(result.logs)||!result.logs.length)fail(gate);
    if(result.sourceCommit!==sourceCommit||result.version!==evidence.version)fail('Gate commit/version mismatch: '+gate);
  }
  if(!Array.isArray(evidence.files)||!evidence.files.length)fail('Missing asset inventory');
  const files=new Map();
  for(const file of evidence.files){
    if(typeof file.path!=='string'||isAbsolute(file.path)||file.path.includes('\\')||file.path.split('/').some(s=>!s||s==='.'||s==='..')||files.has(file.path)||['acceptance.json','SHA256SUMS.txt'].includes(file.path))fail('Invalid/duplicate asset path');
    if(/\.(?:keystore|p12|pfx|dpapi|dmp)$/i.test(file.path)||(/\.apk$/i.test(file.path)&&file.path!=='GitPadPlus-Android-Release.apk'))fail('Signing material, process dump or test APK must not be a release asset');
    const target=realpathSync(resolve(directory,file.path));
    if(!target.startsWith(directory+sep)||!statSync(target).isFile()||!statSync(target).size||!/^[a-f0-9]{64}$/.test(file.sha256))fail('Invalid/empty asset: '+file.path);
    const bytes=readFileSync(target);if(hash(bytes)!==file.sha256)fail('Checksum mismatch: '+file.path);
    files.set(file.path,{...file,bytes,target});
  }
  for(const gate of requiredGates)for(const log of evidence.gates[gate].logs){
    const file=files.get(log);if(!file||file.role!=='evidence'||!file.bytes.toString('utf8').trim())fail('Missing/empty/unhashed evidence: '+log);
  }
  const required={'GitPadPlus-Windows-x64.zip':'windows-zip','GitPadPlus-Android-Release.apk':'android-release-apk','SBOM.spdx.json':'sbom','THIRD_PARTY_NOTICES.md':'notices','RELEASE_NOTES.md':'release-notes'};
  for(const [name,role] of Object.entries(required))if(files.get(name)?.role!==role)fail('Missing release asset: '+name);
  const sbom=JSON.parse(files.get('SBOM.spdx.json').bytes);
  if(sbom.spdxVersion!=='SPDX-2.3'||!sbom.packages?.length||evidence.licenses?.scope!=='native-and-web')fail('Missing native/web SPDX inventory');
  if(!Array.isArray(evidence.licenses.unresolved)||evidence.licenses.unresolved.length)fail('Unresolved native redistribution review');
  const windows=readZip(files.get('GitPadPlus-Windows-x64.zip').bytes),exe=windows.get('GitPadPlus.App.exe');
  if(new Set([...windows.keys()].map(name=>name.toLowerCase())).size!==windows.size)fail('Windows ZIP contains case-colliding paths');
  if([...windows.keys()].some(name=>/\.exe\.WebView2\/|(^|\/)EBWebView\/|(^|\/)Vault\/|\.keystore$|\.password\.dpapi$/i.test(name)))fail('Windows ZIP contains runtime profile, user data or signing material');
  if(!exe||exe.toString('ascii',0,2)!=='MZ')fail('Missing Windows executable at ZIP root');
  const pe=exe.readUInt32LE(0x3c);
  if(exe.readUInt32LE(pe)!==0x4550||exe.readUInt16LE(pe+4)!==0x8664)fail('Windows executable is not x64 PE');
  const runtime=JSON.parse(windows.get('GitPadPlus.App.runtimeconfig.json')??'{}');
  if(!windows.get('GitPadPlus.App.dll')?.includes(Buffer.from(sourceCommit)))fail('Windows binary source commit stamp mismatch');
  if(runtime.runtimeOptions?.framework||runtime.runtimeOptions?.frameworks||!runtime.runtimeOptions?.includedFrameworks?.length||![...windows.keys()].some(name=>name.toLowerCase()==='microsoft.ui.xaml.dll'))fail('Windows ZIP is not .NET/Windows App SDK self-contained');
  if(!windows.get('THIRD_PARTY_LICENSES.txt')?.length||!windows.get('THIRD_PARTY_NOTICES.md')?.equals(files.get('THIRD_PARTY_NOTICES.md').bytes))fail('Windows ZIP lacks bundled third-party texts/notices');
  if(evidence.windows?.packagedExecutableSha256!==hash(exe)||evidence.windows?.cleanExtractionTested!==true||!['unsigned','trusted-authenticode'].includes(evidence.windows?.signature))fail('Windows packaged executable has not been qualified');
  const apk=files.get('GitPadPlus-Android-Release.apk'),apkEntries=readZip(apk.bytes);
  if(!apkEntries.has('AndroidManifest.xml')||!apkEntries.has('classes.dex'))fail('Not an Android application');
  if(!apkEntries.get('assets/wwwroot/THIRD_PARTY_LICENSES.txt')?.equals(windows.get('THIRD_PARTY_LICENSES.txt')))fail('APK lacks matching bundled third-party texts');
  if(!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(evidence.android?.buildToolsVersion??'')||!/^[a-f0-9]{64}$/.test(evidence.android?.certificateSha256??''))fail('Missing APK signing/tool metadata');
  inspectApk(apk.target,evidence);
  const sums=new Map();
  for(const line of readFileSync(resolve(directory,'SHA256SUMS.txt'),'utf8').trim().split(/\r?\n/)){
    const match=/^([a-f0-9]{64})  ([^\r\n]+)$/.exec(line);if(!match||sums.has(match[2]))fail('Invalid SHA256SUMS');sums.set(match[2],match[1]);
  }
  const expected=new Map([...files].map(([name,file])=>[name,file.sha256]));expected.set('acceptance.json',hash(readFileSync(resolve(directory,'acceptance.json'))));
  if(sums.size!==expected.size)fail('Checksum manifest inventory mismatch');
  for(const [name,digest] of expected)if(sums.get(name)!==digest)fail('Manifest mismatch: '+name);
  const walk=(folder,prefix='')=>readdirSync(folder,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(resolve(folder,entry.name),prefix+entry.name+'/'):[prefix+entry.name]);
  for(const name of walk(directory))if(name!=='SHA256SUMS.txt'&&!expected.has(name))fail('Unexpected candidate file: '+name);
  return evidence;
}
