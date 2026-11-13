// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,cpSync,rmSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {verifyWin2DSource,win2dVersion} from '../scripts/win2d-source.mjs';
import {readZip} from '../scripts/release-evidence.mjs';
const source=resolve('third-party/win2d'),packageFile=`Microsoft.Graphics.Win2D.${win2dVersion}.nupkg`;
function fixture(t){const parent=resolve(tmpdir()),root=mkdtempSync(join(parent,'gitpad-win2d-test-'));assert.ok(root.startsWith(parent+sep));t.after(()=>{assert.ok(root.startsWith(parent+sep)&&root.includes('gitpad-win2d-test-'));rmSync(root,{recursive:true});});cpSync(source,root,{recursive:true});return root;}
test('reviewed source package binds source SHA, licenses, payload and x64 PE',()=>{const result=verifyWin2DSource();assert.equal(result.upstream.version,'1.4.0');assert.deepEqual(result.distributedNativeMatrix,['x64']);});
test('a changed package cannot borrow the reviewed provenance',t=>{const root=fixture(t),path=join(root,'feed',packageFile),bytes=readFileSync(path);bytes[200]^=1;writeFileSync(path,bytes);assert.throws(()=>verifyWin2DSource(undefined,root),/package SHA-256 mismatch/);});
test('a rewritten source identity is rejected',t=>{const root=fixture(t),path=join(root,'win2d-source-binding.json'),binding=JSON.parse(readFileSync(path));binding.upstream.commit='0'.repeat(40);writeFileSync(path,JSON.stringify(binding));assert.throws(()=>verifyWin2DSource(undefined,root),/unexpected identity/);});
test('restored cache is verified independently of the package source mapping',t=>{const root=fixture(t),cache=join(root,'restored');mkdirSync(cache);const binding=verifyWin2DSource();for(const [name,bytes]of readZip(readFileSync(join(root,'feed',packageFile)))){const path=join(cache,name);mkdirSync(resolve(path,'..'),{recursive:true});writeFileSync(path,bytes);}writeFileSync(join(cache,`microsoft.graphics.win2d.${win2dVersion}.nupkg`),readFileSync(join(root,'feed',packageFile)));verifyWin2DSource(cache);writeFileSync(join(cache,binding.files.find(f=>f.path.endsWith('Canvas.dll')).path),'changed');assert.throws(()=>verifyWin2DSource(cache),/restored payload differs/);});
