// SPDX-License-Identifier: AGPL-3.0-only
import {readFileSync,realpathSync} from 'node:fs';
import {resolve,join,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {readZip} from './release-evidence.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../third-party/win2d');
export const win2dVersion='1.4.1-gitpadplus.1';
const commit='2cd2e846b0b410286a88fa5cddc3bc765de8be0b',licenseHash='ba4eb1619f6e1a6bcb4130d3e42194a5f22b4a54c99a865ef90a3242f785fd1f';
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=message=>{throw Error('Unverified Win2D source artifact: '+message);};
export function verifyWin2DSource(installedFolder,location=root){
  const binding=JSON.parse(readFileSync(join(location,'win2d-source-binding.json'),'utf8'));
  if(binding.schemaVersion!==1||binding.package.id!=='Microsoft.Graphics.Win2D'||binding.package.version!==win2dVersion||binding.upstream.commit!==commit||binding.upstream.sourceLicense!=='MIT'||binding.upstream.licenseSha256!==licenseHash||!isDeepStrictEqual(binding.distributedNativeMatrix,['x64']))fail('unexpected identity, source license or architecture');
  const file=binding.package.file;if(file!==`Microsoft.Graphics.Win2D.${win2dVersion}.nupkg`)fail('unexpected package filename');
  const bytes=readFileSync(join(location,'feed',file));if(hash(bytes)!==binding.package.sha256)fail('package SHA-256 mismatch');
  const entries=readZip(bytes),manifest=entries.get('source-build.json');
  if(!manifest||hash(manifest)!==binding.provenanceSha256)fail('provenance hash mismatch');
  const embedded=JSON.parse(manifest.toString('utf8'));
  if(!isDeepStrictEqual(embedded.files,binding.files)||!isDeepStrictEqual(embedded.upstream,binding.upstream)||!isDeepStrictEqual(embedded.toolchain,binding.toolchain))fail('provenance differs from reviewed binding');
  for(const log of binding.buildLogs){if(!['native.log','projection.log'].includes(log.path)||hash(readFileSync(join(location,'build-evidence',log.path+'.txt')))!==log.sha256)fail('build log binding differs');}
  const spec=entries.get('Microsoft.Graphics.Win2D.nuspec')?.toString('utf8');
  if(!spec?.includes(`<version>${win2dVersion}</version>`)||!spec.includes(`commit="${commit}"`)||!spec.includes('<license type="file">LICENSE.txt</license>'))fail('package metadata differs');
  if(hash(entries.get('LICENSE.txt')??Buffer.alloc(0))!==licenseHash)fail('source MIT license differs');
  for(const name of entries.keys())if(name.startsWith('runtimes/')&&!name.startsWith('runtimes/win-x64/'))fail('undeclared native architecture');
  for(const entry of binding.files){const actual=entries.get(entry.path);if(!actual||actual.length!==entry.bytes||hash(actual)!==entry.sha256)fail('payload mismatch: '+entry.path);}
  const native=entries.get('runtimes/win-x64/native/Microsoft.Graphics.Canvas.dll');
  if(!native||native.readUInt16LE(0)!==0x5a4d||native.readUInt16LE(native.readUInt32LE(0x3c)+4)!==0x8664||!native.includes(Buffer.from(commit,'utf16le')))fail('native x64 PE/source version stamp missing');
  const managed=entries.get('lib/net6.0-windows10.0.19041.0/Microsoft.Graphics.Canvas.Interop.dll');
  if(!managed?.includes(Buffer.from(commit)))fail('managed source revision missing');
  if(installedFolder){
    const folder=realpathSync(installedFolder);
    for(const entry of binding.files){const path=realpathSync(join(folder,entry.path));if(!path.startsWith(folder+sep)||hash(readFileSync(path))!==entry.sha256)fail('restored payload differs: '+entry.path);}
    const restored=readFileSync(join(folder,`microsoft.graphics.win2d.${win2dVersion}.nupkg`));if(hash(restored)!==binding.package.sha256)fail('restored package differs');
  }
  return binding;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const binding=verifyWin2DSource(process.argv[2]);console.log(`Verified source-built Win2D ${binding.package.version}, upstream ${binding.upstream.commit}, Windows x64. Runtime/license acceptance is separate.`);
}
