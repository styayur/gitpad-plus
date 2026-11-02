// SPDX-License-Identifier: AGPL-3.0-only
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { readdirSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { v7 } from 'uuid';
const fixtureDate=()=>{const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;};
async function noteAction(page:Page,name:string){await page.getByLabel('Note actions',{exact:true}).click();await page.getByRole('button',{name,exact:true}).click();}

async function call(request:APIRequestContext,method:string,params:unknown={}) {
  const response=await request.post('/rpc',{data:{protocolVersion:1,requestId:crypto.randomUUID(),method,params}});
  expect(response.ok()).toBe(true);const json=await response.json();expect(json.error,JSON.stringify(json)).toBeNull();return json.result;
}
test.beforeEach(async({request})=>{
  await call(request,'documents.dirty',false);
  const preview=await call(request,'app.previewClear');await call(request,'app.clearLocalData',{confirmation:preview.confirmation});
});
test('calendar starts empty and creates two separate notes on the same day',async({page})=>{
  await page.goto('/');await expect(page.getByRole('heading',{name:'A place for today’s thoughts'})).toBeVisible();
  await page.getByRole('button',{name:'New note',exact:true}).click();await expect(page.locator('.ProseMirror')).toBeVisible();
  await page.getByRole('button',{name:'New note',exact:true}).click();await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.getByRole('navigation',{name:'Notes'}).getByRole('button')).toHaveCount(2);
});
test('edits Unicode Markdown, autosaves real files, reloads and searches SQLite',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'New note',exact:true}).click();
  const editor=page.locator('.ProseMirror');await expect(editor).toBeVisible();await editor.fill('中文 👩🏽‍💻 Bonjour journal');
  await expect(page.getByRole('status')).toContainText('Local: Saved');
  await expect.poll(()=>{const files=readdirSync(join(process.env.GITPAD_TEST_VAULT!,'Journal'));return files.map(f=>readFileSync(join(process.env.GITPAD_TEST_VAULT!,'Journal',f),'utf8')).join('');}).toContain('Bonjour journal');
  await page.reload();await page.getByRole('navigation',{name:'Notes'}).getByRole('button').click();await expect(page.locator('.ProseMirror')).toContainText('中文 👩🏽‍💻 Bonjour journal');
  await page.getByRole('searchbox',{name:'Search notes'}).fill('Bonjour');await expect(page.getByRole('navigation',{name:'Notes'}).getByRole('button')).toHaveCount(1);
  await page.getByRole('searchbox',{name:'Search notes'}).fill('absentword');await expect(page.getByRole('navigation',{name:'Notes'}).getByRole('button')).toHaveCount(0);
});
test('official SDK toolbar formats a selection and unloads cleanly',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'New note',exact:true}).click();const editor=page.locator('.ProseMirror');await editor.fill('format me');await editor.press('ControlOrMeta+a');
  await page.getByRole('toolbar',{name:'Formatting'}).getByRole('button',{name:'Bold',exact:true}).click();await expect(editor.locator('strong')).toContainText('format me');
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('Official toolbar',{exact:true}).uncheck();await page.getByRole('button',{name:'Close settings'}).click();await expect(page.getByRole('toolbar',{name:'Formatting'}).getByRole('button')).toHaveCount(0);
});
test('peek uses original source and closes after three seconds',async({page,request})=>{
  const note=await call(request,'documents.create',{date:fixtureDate(),title:'Peek fixture'});
  await call(request,'documents.save',{id:note.header.id,body:'__original__\n',title:note.header.title,tags:[],expectedRevision:note.sidecar.revision,expectedHash:note.sidecar.contentHash,blocks:[],selections:[]});
  await page.goto('/');await page.getByRole('searchbox',{name:'Search notes'}).fill('Peek fixture');await page.getByRole('navigation',{name:'Notes'}).getByRole('button').click();
  await expect(page.locator('.ProseMirror strong')).toHaveText('original');await noteAction(page,'Source peek');
  await expect(page.getByRole('textbox',{name:'Original Markdown source'})).toHaveValue('__original__');await expect(page.getByRole('dialog',{name:'Markdown source peek'})).toBeHidden({timeout:5000});await expect(page.locator('.ProseMirror strong')).toHaveText('original');
});
test('unknown directives survive an edit to another block',async({page,request})=>{
  const note=await call(request,'documents.create',{date:fixtureDate(),title:'Unknown fixture'});const body=':::future[Unknown]{z="last" a="first"}\nkeep **everything**\n:::\n\nEditable\n';
  await call(request,'documents.save',{id:note.header.id,body,title:note.header.title,tags:[],expectedRevision:note.sidecar.revision,expectedHash:note.sidecar.contentHash,blocks:[],selections:[]});
  await page.goto('/');await page.getByRole('searchbox',{name:'Search notes'}).fill('Unknown fixture');await page.getByRole('navigation',{name:'Notes'}).getByRole('button').click();
  await expect(page.locator('[data-gitpad-unknown]')).toBeVisible();const paragraph=page.locator('.ProseMirror p').last();await paragraph.click();await page.keyboard.press('End');await page.keyboard.type(' changed');await page.getByRole('button',{name:'Save',exact:true}).click();
  // The click starts an asynchronous durable save. Wait for its public completion
  // state before a separate HTTP client reads the authoritative source pair.
  await expect(page.getByRole('status')).toContainText('Local: Saved');
  const loaded=await call(request,'documents.load',{id:note.header.id});expect(loaded.body).toContain(':::future[Unknown]{z="last" a="first"}\nkeep **everything**\n:::');expect(loaded.body).toContain('Editable changed');
});
test('clear data requires a separate confirmation and preserves data on cancel',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'New note',exact:true}).click();await expect(page.locator('.ProseMirror')).toBeVisible();
  await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('status')).toContainText('Local: Saved');
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Clear Local GitPad+ Data',exact:true}).click();await expect(page.getByRole('alertdialog')).toContainText('1 notes');await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Clear Local GitPad+ Data',exact:true}).click();await page.getByRole('button',{name:'Confirm permanent deletion'}).click();await expect(page.getByRole('heading',{name:'A place for today’s thoughts'})).toBeVisible();await expect(page.getByRole('tab')).toHaveCount(0);
});

for(const fixture of readdirSync('tests/markdown-fixtures'))test(`opening/saving fixture preserves source bytes: ${fixture}`,async({page,request})=>{
  const body=readFileSync(join('tests/markdown-fixtures',fixture),'utf8');const note=await call(request,'documents.create',{date:fixtureDate(),title:fixture});
  await call(request,'documents.save',{id:note.header.id,body,title:fixture,tags:[],expectedRevision:note.sidecar.revision,expectedHash:note.sidecar.contentHash,blocks:[],selections:[]});
  await page.goto('/');await page.getByRole('searchbox',{name:'Search notes'}).fill(fixture);await page.getByRole('navigation',{name:'Notes'}).getByRole('button').click();
  if(fixture==='html.md'||fixture==='frontmatter.md')await expect(page.getByRole('region',{name:'Markdown editor'}).getByRole('alert')).toContainText('read-only');
  else await expect(page.locator('.ProseMirror')).toBeVisible();
  await page.getByRole('button',{name:'Save',exact:true}).click();const loaded=await call(request,'documents.load',{id:note.header.id});expect(loaded.body).toBe(body);
});

test('renders directives, GFM table, mathematics and callout without raw HTML',async({page,request})=>{
  const note=await call(request,'documents.create',{date:fixtureDate(),title:'Rich fixture'});
  const body=':underline[underlined] :mark[highlight]{color="yellow"}\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\nInline $x^2$\n\n> [!NOTE]\n> Context\n\n:::fold[Details]{default="closed"}\nFolded body\n:::\n';
  await call(request,'documents.save',{id:note.header.id,body,title:note.header.title,tags:[],expectedRevision:note.sidecar.revision,expectedHash:note.sidecar.contentHash,blocks:[],selections:[]});
  await page.goto('/');await page.getByRole('searchbox',{name:'Search notes'}).fill('Rich fixture');await page.getByRole('navigation',{name:'Notes'}).getByRole('button').click();
  await expect(page.locator('[data-gitpad-format="underline"]')).toContainText('underlined');await expect(page.getByRole('table')).toBeVisible();await expect(page.getByRole('cell',{name:'2',exact:true})).toBeVisible();await expect(page.locator('.katex').first()).toBeVisible();await expect(page.locator('blockquote[data-callout="note"]')).toContainText('Context');
  await expect(page.locator('details[data-gitpad-fold]')).toHaveJSProperty('open',false);
  await page.getByRole('toolbar').getByRole('button',{name:'Expand all',exact:true}).click();await expect(page.locator('details[data-gitpad-fold]')).toHaveJSProperty('open',true);
  await page.screenshot({path:'artifacts/browser-editor.png',fullPage:true});
});
test('source peek editing cancels the timer and remains undoable without rebuilding the editor',async({page,request})=>{
  const note=await call(request,'documents.create',{date:fixtureDate(),title:'Undo fixture'});
  await call(request,'documents.save',{id:note.header.id,body:'Original paragraph\n',title:note.header.title,tags:[],expectedRevision:note.sidecar.revision,expectedHash:note.sidecar.contentHash,blocks:[],selections:[]});
  await page.goto('/');await page.getByRole('searchbox',{name:'Search notes'}).fill('Undo fixture');await page.getByRole('navigation',{name:'Notes'}).getByRole('button').click();await expect(page.locator('.ProseMirror')).toBeVisible();await noteAction(page,'Source peek');
  const source=page.getByRole('textbox',{name:'Original Markdown source'});await source.fill('Changed **source**');await page.waitForTimeout(3200);await expect(source).toBeVisible();await page.getByRole('button',{name:'Apply source edit'}).click();await expect(page.locator('.ProseMirror strong')).toHaveText('source');
  await page.locator('.ProseMirror').press('ControlOrMeta+z');await expect(page.locator('.ProseMirror')).toHaveText('Original paragraph');
});
test('restores open tabs and active note after a full page restart',async({page,request})=>{
  await page.goto('/');await page.getByRole('button',{name:'New note',exact:true}).click();await expect(page.locator('.ProseMirror')).toBeVisible();await page.locator('.ProseMirror').fill('Restored active text');await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect.poll(async()=>{const state=await call(request,'workspace.get');return state.tabs.length;}).toBe(1);
  await page.reload();await expect(page.getByRole('tab')).toHaveCount(1);await expect(page.locator('.ProseMirror')).toContainText('Restored active text');
});
test('persistent selection link reloads and selects the exact rendered text',async({page,context})=>{
  await context.grantPermissions(['clipboard-read','clipboard-write']);await page.goto('/');await page.getByRole('button',{name:'New note',exact:true}).click();const editor=page.locator('.ProseMirror');await editor.fill('before hello after');
  await editor.evaluate(element=>{const text=element.querySelector('p')!.firstChild!;const range=document.createRange();range.setStart(text,7);range.setEnd(text,12);const selection=window.getSelection()!;selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange'));});
  await noteAction(page,'Selection link');await expect(page.getByRole('alert')).toContainText('Link copied');const link=await page.evaluate(()=>navigator.clipboard.readText());expect(link).toContain('?selection=');
  await page.evaluate(value=>window.dispatchEvent(new CustomEvent('gitpad-navigate',{detail:value})),link);await expect(page.getByRole('alert')).toContainText('Selection located.');await expect.poll(()=>page.evaluate(()=>window.getSelection()?.toString())).toBe('hello');
});
test('imports an image into the real vault and renders its local persisted content',async({page,request})=>{
  await page.goto('/');await page.getByRole('button',{name:'New note',exact:true}).click();await expect(page.locator('.ProseMirror')).toBeVisible();
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Image',exact:true}).click();await(await chooser).setFiles({name:'pixel.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZyoAAAAASUVORK5CYII=','base64')});
  const image=page.getByRole('img',{name:'pixel.png'});await expect(image).toBeVisible();await expect.poll(()=>image.evaluate((element:HTMLImageElement)=>element.complete&&element.naturalWidth>0)).toBe(true);
  await page.getByRole('button',{name:'Save',exact:true}).click();const notes=await call(request,'documents.list');const saved=await call(request,'documents.load',{id:notes[0].id});expect(saved.body).toContain('../Assets/');expect(saved.body).not.toContain('data:image');expect(readdirSync(join(process.env.GITPAD_TEST_VAULT!,'Assets'))).toHaveLength(1);
});

test('two distinct editable panes save independently and restore after restart',async({page,request})=>{
  const first=await call(request,'documents.create',{date:fixtureDate(),title:'First pane'}),second=await call(request,'documents.create',{date:fixtureDate(),title:'Second pane'});
  await page.goto('/');await page.getByRole('navigation',{name:'Notes'}).getByRole('button').filter({hasText:'First pane'}).click();
  await expect(page.locator('.ProseMirror')).toHaveCount(1);await page.getByRole('combobox',{name:'Open beside'}).selectOption(second.header.id);
  await expect(page.locator('.ProseMirror')).toHaveCount(2);await page.locator('.ProseMirror').first().fill('Primary 中文');await page.locator('.ProseMirror').last().fill('Secondary 👩🏽‍💻');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect.poll(async()=>(await call(request,'documents.load',{id:first.header.id})).body).toContain('Primary 中文');await expect.poll(async()=>(await call(request,'documents.load',{id:second.header.id})).body).toContain('Secondary 👩🏽‍💻');
  await expect.poll(async()=>(await call(request,'workspace.get')).secondaryId).toBe(second.header.id);
  await page.reload();await expect(page.locator('.ProseMirror')).toHaveCount(2);await expect(page.locator('.ProseMirror').first()).toContainText('Primary 中文');await expect(page.locator('.ProseMirror').last()).toContainText('Secondary 👩🏽‍💻');
});

test('image trailing paragraph keeps its identity through settings rebuild and restart',async({page,request})=>{
  const note=await call(request,'documents.create',{date:fixtureDate(),title:'Trailing identity'});
  const asset=await call(request,'media.import',{filename:'pixel.png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZyoAAAAASUVORK5CYII='});
  await call(request,'documents.save',{id:note.header.id,body:`Before image\n\n![pixel](${asset})\n`,title:note.header.title,tags:[],expectedRevision:note.sidecar.revision,expectedHash:note.sidecar.contentHash,blocks:[],selections:[]});
  await page.goto('/');await page.getByRole('navigation',{name:'Notes'}).getByRole('button').filter({hasText:'Trailing identity'}).click();
  await expect(page.locator('.ProseMirror')).toContainText('Before image');
  await expect.poll(async()=>(await call(request,'documents.load',{id:note.header.id})).sidecar.blocks.length).toBe(2);
  const initial=await call(request,'documents.load',{id:note.header.id});
  // This zero-width tail is present in the persisted native image-note fixture.
  // Markdown parsing cannot express it, but its existing identity remains authority.
  const tail={id:v7(),kind:'paragraph',start:initial.body.length,end:initial.body.length,deleted:false,aliases:[],path:[2]};
  const before=await call(request,'documents.save',{id:note.header.id,body:initial.body,title:initial.header.title,tags:[],expectedRevision:initial.sidecar.revision,expectedHash:initial.sidecar.contentHash,blocks:[...initial.sidecar.blocks,tail],selections:[]});
  await page.reload();await expect(page.locator('.ProseMirror > p').last()).toBeEmpty();
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Save settings',exact:true}).click();
  await expect(page.locator('.ProseMirror > p').last()).toBeEmpty();
  await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('status')).toContainText('Local: Saved');
  const rebuilt=await call(request,'documents.load',{id:note.header.id});
  expect(rebuilt.sidecar.blocks).toEqual(before.sidecar.blocks);expect(rebuilt.header.updatedAt).toBe(before.header.updatedAt);
  await page.reload();await expect(page.locator('.ProseMirror > p').last()).toBeEmpty();
  await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('status')).toContainText('Local: Saved');
  const restored=await call(request,'documents.load',{id:note.header.id});
  expect(restored.sidecar.blocks).toEqual(before.sidecar.blocks);expect(restored.header.updatedAt).toBe(before.header.updatedAt);
});

test('image file drop and paste persist through the real storage bridge',async({page,request})=>{
  await page.goto('/');await page.getByRole('button',{name:'New note',exact:true}).click();const editor=page.locator('.ProseMirror');await expect(editor).toBeVisible();
  for(const kind of ['drop','paste']){
    await editor.evaluate((element,eventKind)=>{
      const transfer=new DataTransfer(),bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZyoAAAAASUVORK5CYII='),character=>character.charCodeAt(0));
      transfer.items.add(new File([bytes],eventKind+'.png',{type:'image/png'}));
      element.dispatchEvent(eventKind==='drop'?new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}):new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:transfer}));
    },kind);
    await expect(editor.getByRole('img',{name:kind+'.png'})).toBeVisible();
  }
  await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.locator('footer [role=status]').first()).toHaveText('Local: Saved');
  const id=await page.getByRole('tab',{selected:true}).getAttribute('title');const saved=await call(request,'documents.load',{id});
  expect(saved.body.match(/\.\.\/Assets\//g)).toHaveLength(2);expect(saved.body).not.toContain('data:image');
  expect(readdirSync(join(process.env.GITPAD_TEST_VAULT!,'Assets'))).toHaveLength(1);
  await page.reload();await expect(page.locator('.ProseMirror').getByRole('img',{name:'drop.png',exact:true})).toBeVisible();await expect(page.locator('.ProseMirror').getByRole('img',{name:'paste.png',exact:true})).toBeVisible();
});

test('native drop messages target the original pane and ignore completion after it closes',async({page,request})=>{
  // This verifies the native/web contract with real persisted assets, not an OS drag gesture.
  const first=await call(request,'documents.create',{date:fixtureDate(),title:'Drop primary'}),second=await call(request,'documents.create',{date:fixtureDate(),title:'Drop secondary'});
  const path=await call(request,'media.import',{filename:'native.png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZyoAAAAASUVORK5CYII='});
  await page.goto('/');await page.getByRole('navigation',{name:'Notes'}).getByRole('button').filter({hasText:'Drop primary'}).click();
  await page.getByRole('combobox',{name:'Open beside'}).selectOption(second.header.id);
  const secondary=page.getByRole('region',{name:'Second document pane'}).locator('.ProseMirror');await expect(secondary).toBeVisible();
  const start=async(id:string)=>secondary.evaluate((element,dropId)=>{const rect=element.getBoundingClientRect();window.dispatchEvent(new CustomEvent('HybridWebViewMessageReceived',{detail:{message:JSON.stringify({type:'native-drop-start',id:dropId,x:(rect.left+20)/innerWidth,y:(rect.top+15)/innerHeight})}}));},id);
  const complete=async(id:string,filename:string)=>page.evaluate(message=>window.dispatchEvent(new CustomEvent('HybridWebViewMessageReceived',{detail:{message:JSON.stringify(message)}})),{type:'native-drop-complete',id,files:[{filename,path}]});
  await start('accepted');await complete('accepted','native.png');await expect(secondary.getByRole('img',{name:'native.png',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Save second pane',exact:true}).click();
  await expect.poll(async()=>(await call(request,'documents.load',{id:second.header.id})).body).toContain(`![native.png](${path})`);
  expect((await call(request,'documents.load',{id:first.header.id})).body).not.toContain('../Assets/');
  await start('closed');await page.getByRole('button',{name:'Close second pane',exact:true}).click();await expect(secondary).toHaveCount(0);
  await complete('closed','late.png');await page.getByRole('combobox',{name:'Open beside'}).selectOption(second.header.id);await expect(secondary.locator('img')).toHaveCount(1);
  await expect.poll(()=>secondary.locator('img').evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth>0)).toBe(true);
  expect((await call(request,'documents.load',{id:second.header.id})).body).not.toContain('late.png');
  await page.reload();await expect(secondary.locator('img')).toHaveCount(1);
  await expect(page.locator('.ProseMirror').first().locator('img')).toHaveCount(0);
  expect((await call(request,'documents.load',{id:first.header.id})).body).not.toContain('../Assets/');
});

test('native drop retains its text position across cursor movement, edits, zoom and scrolling',async({page,request})=>{
  const note=await call(request,'documents.create',{date:fixtureDate(),title:'Drop position'});
  const body=Array.from({length:35},(_,i)=>`Paragraph ${i}`).join('\n\n')+'\n\nTarget here\n\nAfter paragraph\n';
  await call(request,'documents.save',{id:note.header.id,body,title:note.header.title,tags:[],expectedRevision:note.sidecar.revision,expectedHash:note.sidecar.contentHash,blocks:[],selections:[]});
  const path=await call(request,'media.import',{filename:'anchor.png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZyoAAAAASUVORK5CYII='});
  await page.goto('/');await page.getByRole('navigation',{name:'Notes'}).getByRole('button').click();const editor=page.locator('.ProseMirror');await expect(editor).toBeVisible();
  await page.evaluate(()=>{document.documentElement.style.zoom='1.25';});
  const target=editor.locator('p').filter({hasText:/^Target here$/});await target.scrollIntoViewIfNeeded();
  const focusUnchanged=await target.evaluate(element=>{const focused=document.activeElement,range=document.createRange();range.setStart(element.firstChild!,7);range.collapse(true);const rect=range.getBoundingClientRect();
    window.dispatchEvent(new CustomEvent('HybridWebViewMessageReceived',{detail:{message:JSON.stringify({type:'native-drop-start',id:'position',x:rect.left/innerWidth,y:(rect.top+rect.height/2)/innerHeight})}}));return document.activeElement===focused;});
  expect(focusUnchanged).toBe(true);
  // Import is asynchronous: the user may edit another paragraph before it completes.
  await editor.locator('p').first().click();await page.keyboard.press('Home');await page.keyboard.type('prefix ');
  await page.evaluate(message=>window.dispatchEvent(new CustomEvent('HybridWebViewMessageReceived',{detail:{message:JSON.stringify(message)}})),{type:'native-drop-complete',id:'position',files:[{filename:'anchor.png',path}]});
  await expect(target.getByRole('img',{name:'anchor.png',exact:true})).toBeVisible();await expect(editor.locator('p').first().locator('img')).toHaveCount(0);
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect.poll(async()=>(await call(request,'documents.load',{id:note.header.id})).body).toContain(`Target ![anchor.png](${path})here`);
  expect((await call(request,'documents.load',{id:note.header.id})).body).toContain('prefix Paragraph 0');
});

test('external Markdown is compared, archived and explicitly reconciled through the UI',async({page,request})=>{
  const note=await call(request,'documents.create',{date:fixtureDate(),title:'External recovery'});
  await page.goto('/');await page.getByRole('navigation',{name:'Notes'}).getByRole('button').click();await expect(page.locator('.ProseMirror')).toBeVisible();await page.getByRole('button',{name:'Save',exact:true}).click();
  appendFileSync(join(process.env.GITPAD_TEST_VAULT!,'Journal',note.header.id+'.md'),'External 中文\n');
  await page.getByRole('button',{name:'Check recovery'}).click();await page.getByRole('button',{name:'Compare retained versions'}).click();
  await expect(page.getByRole('dialog',{name:'Reconcile external changes'})).toBeVisible();const merged=page.getByRole('textbox',{name:'Merged Markdown'});await expect(merged).toContainText('External 中文');
  await page.getByRole('button',{name:'Archive versions and apply'}).click();await expect(page.getByRole('dialog',{name:'Reconcile external changes'})).toBeHidden();await expect(page.locator('.ProseMirror')).toContainText('External 中文');
  expect(readdirSync(join(process.env.GITPAD_TEST_VAULT!,'.gitpad','recovery'))).toHaveLength(1);
});

test('plugin disabled preference persists after restart',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('Official toolbar',{exact:true}).uncheck();await page.getByRole('button',{name:'Close settings'}).click();
  await page.reload();await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(page.getByLabel('Official toolbar',{exact:true})).not.toBeChecked();
});

test('a committed save acknowledgement delayed past ten seconds completes without losing the buffer',async({page,request})=>{
  let delayed=false;
  await page.route('**/rpc',async route=>{
    const message=route.request().postDataJSON();
    if(!delayed&&message.method==='documents.save'&&message.params.body.includes('Delayed acknowledgement')){
      delayed=true;const response=await route.fetch();
      // Reproduce a committed native write whose acknowledgement arrives late.
      await new Promise(resolve=>setTimeout(resolve,12_000));await route.fulfill({response});
    }else await route.continue();
  });
  await page.goto('/');await page.getByRole('button',{name:'New note',exact:true}).click();const editor=page.locator('.ProseMirror');await expect(editor).toBeVisible();
  const id=await page.getByRole('tab',{selected:true}).getAttribute('title');await editor.fill('Delayed acknowledgement 中文 👩🏽‍💻');await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect.poll(async()=>(await call(request,'documents.load',{id})).body).toContain('Delayed acknowledgement 中文 👩🏽‍💻');
  await expect(page.locator('footer [role=status]')).toHaveText('Local: Saved',{timeout:20_000});expect(delayed).toBe(true);await expect(editor).toContainText('Delayed acknowledgement 中文 👩🏽‍💻');
});
