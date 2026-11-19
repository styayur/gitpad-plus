// SPDX-License-Identifier: AGPL-3.0-only
// Actual extracted MAUI executable + native WebView2 transport; no DevHost/Vite.
import {chromium,expect} from '@playwright/test';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync,realpathSync} from 'node:fs';
import {resolve,join,dirname,basename,sep} from 'node:path';
import {createServer} from 'node:net';
import {platform,release} from 'node:os';

if(process.platform!=='win32')throw Error('Native Windows qualification requires Windows');
const [exeArg,outArg,sourceCommit]=process.argv.slice(2);
if(!exeArg||!outArg||!/^[a-f0-9]{40}$/.test(sourceCommit??''))throw Error('Usage: node tests/windows/qualify-package.mjs <extracted.exe> <new evidence directory> <source SHA>');
const exe=realpathSync(resolve(exeArg)),out=resolve(outArg);
if(basename(exe)!=='GitPadPlus.App.exe'||out.startsWith(dirname(exe)+sep)||existsSync(out))throw Error('Use the extracted executable and a fresh external evidence directory');
if(!readFileSync(join(dirname(exe),'GitPadPlus.App.dll')).includes(Buffer.from(sourceCommit)))throw Error('Packaged assembly source stamp mismatch');
mkdirSync(out,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const wait=ms=>new Promise(done=>setTimeout(done,ms));
const vault=join(out,'Vault'),profile=join(out,'webview-profile'),checks=[];
let child,browser,page;
const check=(name,ok)=>{checks.push({name,passed:!!ok});if(!ok)throw Error(name);};
const rpc=(method,params={})=>page.evaluate(({method,params})=>new Promise((resolve,reject)=>{
  const requestId=crypto.randomUUID();
  const onMessage=event=>{const r=JSON.parse(event.detail.message);if(r.requestId!==requestId)return;clearTimeout(timer);window.removeEventListener('HybridWebViewMessageReceived',onMessage);r.error?reject(Error(r.error.message)):resolve(r.result);};
  const timer=setTimeout(()=>{window.removeEventListener('HybridWebViewMessageReceived',onMessage);reject(Error('Native RPC timeout '+method));},30000);
  window.addEventListener('HybridWebViewMessageReceived',onMessage);
  window.HybridWebView.SendRawMessage(JSON.stringify({protocolVersion:1,requestId,method,params}));
}),{method,params});
const pair=id=>({markdown:hash(readFileSync(join(vault,'Journal',id+'.md'))),sidecar:hash(readFileSync(join(vault,'.gitpad/anchors',id+'.json')))});
async function launch(){
  const server=createServer();await new Promise(done=>server.listen(0,'127.0.0.1',done));const port=server.address().port;await new Promise(done=>server.close(done));
  child=spawn(exe,[],{cwd:dirname(exe),env:{...process.env,GITPAD_ACCEPTANCE_VAULT:vault,WEBVIEW2_USER_DATA_FOLDER:profile,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`},stdio:'ignore'});
  child.on('error',error=>writeFileSync(join(out,'process-error.txt'),String(error)));
  for(let attempt=0;attempt<120;attempt++){
    if(child.exitCode!==null)throw Error('Native application exited before its WebView initialized: '+child.exitCode);
    try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:500});break;}catch{await wait(500);}
  }
  if(!browser?.isConnected())throw Error('Native WebView2 CDP endpoint missing');
  for(let attempt=0;attempt<60;attempt++){page=browser.contexts().flatMap(context=>context.pages()).find(item=>item.url()!=='about:blank');if(page)break;await wait(500);}
  if(!page)throw Error('Native application page missing');
  await page.waitForFunction(()=>document.documentElement.dataset.workspaceReady==='true');
  check('Native HybridWebView loaded without browser development servers',await page.evaluate(()=>!!window.HybridWebView));
}
async function close(){
  const pid=child.pid;
  execFileSync('pwsh.exe',['-NoProfile','-Command',`$p=Get-Process -Id ${pid};if(!$p.CloseMainWindow()){throw 'Native window close was refused'}`],{windowsHide:true,timeout:10000});
  for(let attempt=0;attempt<300&&child.exitCode===null;attempt++)await wait(100);
  check('Native window close flushed and exited without termination',child.exitCode===0);
  let owned=1;
  for(let attempt=0;attempt<50&&owned;attempt++){
    owned=Number(execFileSync('pwsh.exe',['-NoProfile','-Command',"@(Get-CimInstance Win32_Process -Filter \"Name='msedgewebview2.exe'\" | Where-Object {$_.CommandLine -and $_.CommandLine.IndexOf($env:GITPAD_TEST_PROFILE,[StringComparison]::OrdinalIgnoreCase) -ge 0}).Count"],{encoding:'utf8',windowsHide:true,timeout:10000,env:{...process.env,GITPAD_TEST_PROFILE:profile}}).trim());
    if(owned)await wait(200);
  }
  check('Owned WebView2 profile processes exited',owned===0);browser=undefined;page=undefined;child=undefined;
}
try{
  await launch();
  const newNote=page.getByRole('button',{name:'New note',exact:true});
  if(!await newNote.isVisible())await page.getByRole('button',{name:'Calendar',exact:true}).click();
  await newNote.click();
  const editor=page.locator('.ProseMirror');await expect(editor).toBeVisible();
  await editor.fill('Windows exact-package native 中文 👩🏽‍💻\n\nStable source and block identity.');
  const id=await page.getByRole('tab',{selected:true}).getAttribute('title');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect.poll(async()=>(await rpc('documents.load',{id})).body).toContain('Windows exact-package native 中文 👩🏽‍💻');
  await expect(page.locator('footer [role=status]').first()).toHaveText('Local: Saved');
  const saved=await rpc('documents.load',{id}),source=pair(id);
  check('Native storage persisted UUIDv7 block identities',saved.sidecar.blocks.some(block=>!block.deleted));
  const plugin=await rpc('plugins.storage.read',{pluginId:'official-calendar-stats'});
  check('Bundled plugin persisted its native object UUID',!!plugin?.objectIds['calendar-statistics']);
  await page.screenshot({path:join(out,'native-saved.png')});await close();
  await launch();await expect(page.locator('.ProseMirror')).toContainText('Windows exact-package native 中文 👩🏽‍💻');
  const restarted=await rpc('documents.load',{id}),afterPlugin=await rpc('plugins.storage.read',{pluginId:'official-calendar-stats'});
  check('Source body and block UUIDs survived native process restart',restarted.body===saved.body&&JSON.stringify(restarted.sidecar.blocks)===JSON.stringify(saved.sidecar.blocks));
  check('Plugin UUID survived native restart',afterPlugin.objectIds['calendar-statistics']===plugin.objectIds['calendar-statistics']);
  const beforeTrash=pair(id);
  await page.getByLabel('Note actions',{exact:true}).click();await page.getByRole('button',{name:'Move to trash',exact:true}).click();
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Trash',exact:true}).click();
  await page.getByRole('dialog',{name:'Trash',exact:true}).getByRole('button',{name:'Restore',exact:true}).click();
  check('Native Trash restore retained exact Markdown and sidecar bytes',JSON.stringify(pair(id))===JSON.stringify(beforeTrash));
  await page.getByRole('button',{name:'Close trash',exact:true}).click();
  const sentinel=join(out,'outside-vault-sentinel.txt');writeFileSync(sentinel,'Synthetic native clear sentinel');
  await page.getByRole('button',{name:'Clear Local GitPad+ Data',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();
  check('Clear cancellation retained the native document',(await rpc('documents.list')).some(note=>note.id===id));
  await page.getByRole('button',{name:'Clear Local GitPad+ Data',exact:true}).click();await page.getByRole('button',{name:'Confirm permanent deletion',exact:true}).click();
  await expect(page.locator('.ProseMirror')).toHaveCount(0);
  check('Explicit native clear removed notes and retained external sentinel',readdirSync(join(vault,'Journal')).length===0&&readFileSync(sentinel,'utf8')==='Synthetic native clear sentinel');
  await page.screenshot({path:join(out,'native-cleared.png')});await close();
  writeFileSync(join(out,'windows-native.json'),JSON.stringify({passed:true,sourceCommit,scope:'Exact extracted native MAUI Windows executable, actual WebView2 and Core transport; no DevHost/Vite',os:platform()+' '+release(),packagedExecutableSha256:hash(readFileSync(exe)),savedPair:source,checks},null,2)+'\n');
}catch(error){
  if(page)await page.screenshot({path:join(out,'native-failure.png')}).catch(()=>{});
  writeFileSync(join(out,'windows-native-failure.json'),JSON.stringify({passed:false,sourceCommit,checks,error:String(error)},null,2));
  if(child?.exitCode===null)await close().catch(()=>{});
  throw error;
}
