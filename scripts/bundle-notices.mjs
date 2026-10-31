// SPDX-License-Identifier: AGPL-3.0-only
import {readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const portable=JSON.parse(readFileSync('artifacts/license-inventory.json','utf8'));
const native=JSON.parse(readFileSync('artifacts/native-license-inventory.json','utf8'));
const texts=new Map();
const walk=folder=>readdirSync(folder).flatMap(name=>{const path=join(folder,name);return statSync(path).isDirectory()?walk(path):[path];});
for(const path of [...walk('artifacts/third-party'),'LICENSE','THIRD_PARTY_NOTICES.md']){
  if(/\.nuspec$/i.test(path))continue;
  const bytes=readFileSync(path);if(bytes.includes(0))throw Error('Non-text license content: '+path);
  const hash=createHash('sha256').update(bytes).digest('hex');
  if(texts.has(hash))texts.get(hash).paths.push(path);else texts.set(hash,{paths:[path],text:bytes.toString('utf8')});
}
const intro=['GitPad+ 0.1.0-alpha.1 — bundled third-party license texts',
  'Original source: AGPL-3.0-only. Dependencies retain their own terms. User diary content is not relicensed.',
  'Inventory is a record of upstream terms, not a grant of additional rights.',
  'Portable dependency inventory:\n'+JSON.stringify(portable.inventory,null,2),
  'Native dependency inventory:\n'+JSON.stringify(native.inventory,null,2),
  'Unresolved review items:\n'+JSON.stringify(native.unresolved,null,2)];
const output=intro.join('\n\n')+'\n\n'+[...texts.values()].map(entry=>'='.repeat(72)+'\n'+entry.paths.join('\n')+'\n\n'+entry.text).join('\n\n');
writeFileSync('public/THIRD_PARTY_LICENSES.txt',output);
console.log(`Bundled ${texts.size} distinct upstream texts (${Buffer.byteLength(output)} bytes). Unresolved native review items: ${native.unresolved.length}. This does not pass the license gate.`);
