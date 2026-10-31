// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
const directory=resolve(process.argv[2]??'release-candidate');
const path=resolve(directory,'acceptance.json');
if(!existsSync(path))throw new Error('RELEASE BLOCKED: missing actual Windows/Android acceptance and signed asset evidence. See docs/acceptance/v0.1.0-alpha.1.md.');
const evidence=JSON.parse(readFileSync(path));
if(evidence.version!=='0.1.0-alpha.1'||!process.env.SOURCE_COMMIT||evidence.sourceCommit!==process.env.SOURCE_COMMIT)throw new Error('RELEASE BLOCKED: commit/version mismatch.');
for(const gate of ['windowsRuntime','androidRuntime','androidReleaseSignature','markdownFidelity','saveRecovery','blockIdentity','selectionAnchors','pluginIsolation','safeClear','security','licenses','nativeFeatureAcceptance']){
  const result=evidence.gates?.[gate];
  if(result?.status!=='passed'||!Array.isArray(result.logs)||result.logs.length===0)throw new Error('RELEASE BLOCKED: '+gate);
}
for(const platform of ['windows','android'])if(!evidence.devices?.[platform]?.description)throw new Error('Missing real device description: '+platform);
if(!Array.isArray(evidence.files)||evidence.files.length<5)throw new Error('Incomplete assets/evidence');
let windows=false,android=false;
for(const file of evidence.files){
  const target=realpathSync(resolve(directory,file.path));
  if(!target.startsWith(realpathSync(directory)+sep)||!/^([a-f0-9]{64})$/.test(file.sha256))throw new Error('Invalid asset path/hash');
  const actual=createHash('sha256').update(readFileSync(target)).digest('hex');
  if(actual!==file.sha256)throw new Error('Asset/evidence checksum mismatch: '+file.path);
  if(file.role==='windows-zip'&&file.path.endsWith('.zip'))windows=true;
  if(file.role==='android-release-apk'&&file.path.endsWith('.apk'))android=true;
}
if(!windows||!android)throw new Error('Missing installable Windows ZIP or signed Android Release APK');
for(const result of Object.values(evidence.gates))for(const log of result.logs??[])if(!evidence.files.some(f=>f.path===log))throw new Error('Unhashed acceptance log: '+log);
console.log('Release evidence/asset integrity gates passed for '+evidence.sourceCommit);
