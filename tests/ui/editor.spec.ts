// SPDX-License-Identifier: AGPL-3.0-only
import { test, expect, type APIRequestContext } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
  await page.getByRole('textbox',{name:'Search notes'}).fill('Bonjour');await expect(page.getByRole('navigation',{name:'Notes'}).getByRole('button')).toHaveCount(1);
  await page.getByRole('textbox',{name:'Search notes'}).fill('absentword');await expect(page.getByRole('navigation',{name:'Notes'}).getByRole('button')).toHaveCount(0);
});
test('official SDK toolbar formats a selection and unloads cleanly',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'New note',exact:true}).click();const editor=page.locator('.ProseMirror');await editor.fill('format me');await editor.press('ControlOrMeta+a');
  await page.getByRole('toolbar',{name:'Formatting'}).getByRole('button',{name:'Bold',exact:true}).click();await expect(editor.locator('strong')).toContainText('format me');
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('Official toolbar',{exact:true}).uncheck();await page.getByRole('button',{name:'Close settings'}).click();await expect(page.getByRole('toolbar',{name:'Formatting'}).getByRole('button')).toHaveCount(0);
});
test('peek uses original source and closes after three seconds',async({page,request})=>{
  const note=await call(request,'documents.create',{date:'2026-10-31',title:'Peek fixture'});
  await call(request,'documents.save',{id:note.header.id,body:'__original__\n',title:note.header.title,tags:[],expectedRevision:note.sidecar.revision,expectedHash:note.sidecar.contentHash,blocks:[],selections:[]});
  await page.goto('/');await page.getByRole('textbox',{name:'Search notes'}).fill('Peek fixture');await page.getByRole('navigation',{name:'Notes'}).getByRole('button').click();
  await expect(page.locator('.ProseMirror strong')).toHaveText('original');await page.getByRole('button',{name:'Source peek',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Original Markdown source'})).toHaveValue('__original__');await expect(page.getByRole('dialog',{name:'Markdown source peek'})).toBeHidden({timeout:5000});await expect(page.locator('.ProseMirror strong')).toHaveText('original');
});
test('unknown directives survive an edit to another block',async({page,request})=>{
  const note=await call(request,'documents.create',{date:'2026-10-31',title:'Unknown fixture'});const body=':::future[Unknown]{z="last" a="first"}\nkeep **everything**\n:::\n\nEditable\n';
  await call(request,'documents.save',{id:note.header.id,body,title:note.header.title,tags:[],expectedRevision:note.sidecar.revision,expectedHash:note.sidecar.contentHash,blocks:[],selections:[]});
  await page.goto('/');await page.getByRole('textbox',{name:'Search notes'}).fill('Unknown fixture');await page.getByRole('navigation',{name:'Notes'}).getByRole('button').click();
  await expect(page.locator('[data-gitpad-unknown]')).toBeVisible();const paragraph=page.locator('.ProseMirror p').last();await paragraph.click();await page.keyboard.press('End');await page.keyboard.type(' changed');await page.getByRole('button',{name:'Save',exact:true}).click();
  const loaded=await call(request,'documents.load',{id:note.header.id});expect(loaded.body).toContain(':::future[Unknown]{z="last" a="first"}\nkeep **everything**\n:::');expect(loaded.body).toContain('Editable changed');
});
test('clear data requires a separate confirmation and preserves data on cancel',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'New note',exact:true}).click();await expect(page.locator('.ProseMirror')).toBeVisible();
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Clear Local GitPad+ Data',exact:true}).click();await expect(page.getByRole('alertdialog')).toContainText('1 notes');await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Clear Local GitPad+ Data',exact:true}).click();await page.getByRole('button',{name:'Confirm permanent deletion'}).click();await expect(page.getByRole('heading',{name:'A place for today’s thoughts'})).toBeVisible();await expect(page.getByRole('tab')).toHaveCount(0);
});

for(const fixture of readdirSync('tests/markdown-fixtures'))test(`opening/saving fixture preserves source bytes: ${fixture}`,async({page,request})=>{
  const body=readFileSync(join('tests/markdown-fixtures',fixture),'utf8');const note=await call(request,'documents.create',{date:'2026-10-31',title:fixture});
  await call(request,'documents.save',{id:note.header.id,body,title:fixture,tags:[],expectedRevision:note.sidecar.revision,expectedHash:note.sidecar.contentHash,blocks:[],selections:[]});
  await page.goto('/');await page.getByRole('textbox',{name:'Search notes'}).fill(fixture);await page.getByRole('navigation',{name:'Notes'}).getByRole('button').click();
  if(fixture==='html.md'||fixture==='frontmatter.md')await expect(page.getByRole('region',{name:'Markdown editor'}).getByRole('alert')).toContainText('read-only');
  else await expect(page.locator('.ProseMirror')).toBeVisible();
  await page.getByRole('button',{name:'Save',exact:true}).click();const loaded=await call(request,'documents.load',{id:note.header.id});expect(loaded.body).toBe(body);
});

test('renders directives, GFM table, mathematics and callout without raw HTML',async({page,request})=>{
  const note=await call(request,'documents.create',{date:'2026-10-31',title:'Rich fixture'});
  const body=':underline[underlined] :mark[highlight]{color="yellow"}\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\nInline $x^2$\n\n> [!NOTE]\n> Context\n\n:::fold[Details]{default="closed"}\nFolded body\n:::\n';
  await call(request,'documents.save',{id:note.header.id,body,title:note.header.title,tags:[],expectedRevision:note.sidecar.revision,expectedHash:note.sidecar.contentHash,blocks:[],selections:[]});
  await page.goto('/');await page.getByRole('textbox',{name:'Search notes'}).fill('Rich fixture');await page.getByRole('navigation',{name:'Notes'}).getByRole('button').click();
  await expect(page.locator('[data-gitpad-format="underline"]')).toContainText('underlined');await expect(page.getByRole('table')).toBeVisible();await expect(page.getByRole('cell',{name:'2',exact:true})).toBeVisible();await expect(page.locator('.katex').first()).toBeVisible();await expect(page.locator('blockquote[data-callout="note"]')).toContainText('Context');
  await expect(page.locator('details[data-gitpad-fold]')).toHaveJSProperty('open',false);
  await page.getByRole('toolbar').getByRole('button',{name:'Expand all',exact:true}).click();await expect(page.locator('details[data-gitpad-fold]')).toHaveJSProperty('open',true);
  await page.screenshot({path:'artifacts/browser-editor.png',fullPage:true});
});
test('source peek editing cancels the timer and remains undoable without rebuilding the editor',async({page,request})=>{
  const note=await call(request,'documents.create',{date:'2026-10-31',title:'Undo fixture'});
  await call(request,'documents.save',{id:note.header.id,body:'Original paragraph\n',title:note.header.title,tags:[],expectedRevision:note.sidecar.revision,expectedHash:note.sidecar.contentHash,blocks:[],selections:[]});
  await page.goto('/');await page.getByRole('textbox',{name:'Search notes'}).fill('Undo fixture');await page.getByRole('navigation',{name:'Notes'}).getByRole('button').click();await expect(page.locator('.ProseMirror')).toBeVisible();await page.getByRole('button',{name:'Source peek',exact:true}).click();
  const source=page.getByRole('textbox',{name:'Original Markdown source'});await source.fill('Changed **source**');await page.waitForTimeout(3200);await expect(source).toBeVisible();await page.getByRole('button',{name:'Apply source edit'}).click();await expect(page.locator('.ProseMirror strong')).toHaveText('source');
  await page.locator('.ProseMirror').press('ControlOrMeta+z');await expect(page.locator('.ProseMirror')).toHaveText('Original paragraph');
});
