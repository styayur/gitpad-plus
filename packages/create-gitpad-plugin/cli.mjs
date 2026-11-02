#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const directory = process.argv[2];
if (!directory) throw new Error('Usage: node packages/create-gitpad-plugin/cli.mjs <new-directory>');
const target = resolve(directory), name=basename(target).toLowerCase();
if (!/^[a-z0-9][a-z0-9-]+$/.test(name) || existsSync(target)) throw new Error('Use a new directory with a lower-case plugin name; existing files are never overwritten.');
mkdirSync(target);mkdirSync(join(target,'src'));
const sdk=fileURLToPath(new URL('../sdk',import.meta.url));
writeFileSync(join(target,'package.json'),JSON.stringify({name,version:'0.1.0',private:true,type:'module',license:'AGPL-3.0-only',scripts:{build:'tsc',test:'vitest run'},dependencies:{'@gitpad-plus/sdk':'file:'+sdk},devDependencies:{typescript:'5.9.3',vitest:'5.0.5'}},null,2)+'\n');
writeFileSync(join(target,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'ESNext',moduleResolution:'Bundler',strict:true,declaration:true,outDir:'dist',rootDir:'src',skipLibCheck:true},include:['src']},null,2)+'\n');
writeFileSync(join(target,'src/index.ts'),`// SPDX-License-Identifier: AGPL-3.0-only\nimport { definePlugin } from '@gitpad-plus/sdk';\nexport default definePlugin({manifest:{id:'${name}',name:'Example command',version:'0.1.0',apiVersion:1,level:1,permissions:['commands','storage'],storageSchemaVersion:1},async activate(api){const objectId=await api.objectId('example-command');const count=Number(api.getSetting('activations')??0)+1;await api.setSetting('activations',count);api.registerCommand({id:'hello',title:'SDK '+count+' '+objectId,toolbar:true,async run(){await api.setSetting('lastCommandObjectId',objectId);}});}});\n`);
writeFileSync(join(target,'plugin.test.ts'),`import { expect, test } from 'vitest';\nimport plugin from './src/index';\ntest('registers a command and provides a disposable',async()=>{let registered=false;await plugin.activate({getSetting(){return undefined;},async setSetting(){},async objectId(){return 'unit-fixture-object';},registerCommand(){registered=true;return{dispose(){}};}} as Parameters<typeof plugin.activate>[0]);expect(registered).toBe(true);});\n`);
writeFileSync(join(target,'LICENSE'),readFileSync(new URL('../../LICENSE',import.meta.url)));
writeFileSync(join(target,'README.md'),'# '+name+'\n\nGenerated from GitPad+ Plugin SDK 0.1 alpha. Build the local SDK first. Then run `pnpm install`, `pnpm test`, `pnpm build`. Commit the generated lockfile. The SDK is linked to this local checkout.\n\nOnly trusted/bundled modules can be installed in this alpha; there is no remote plugin loader. Have the built module reviewed before registering it through PluginHost.activate(module, approvedPermissions). This does not require changes to the C# Core. Ordinary permissions are capabilities, not a JavaScript security sandbox.\n');
console.log(target);
