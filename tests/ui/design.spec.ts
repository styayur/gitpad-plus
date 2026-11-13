// SPDX-License-Identifier: AGPL-3.0-only
import { test, expect, type APIRequestContext } from '@playwright/test';

async function call(request:APIRequestContext,method:string,params:unknown={}) {
  const response=await request.post('/rpc',{data:{protocolVersion:1,requestId:crypto.randomUUID(),method,params}});
  expect(response.ok()).toBe(true);const json=await response.json();expect(json.error).toBeNull();return json.result;
}
test.beforeEach(async({request})=>{
  await call(request,'documents.dirty',false);const preview=await call(request,'app.previewClear');
  await call(request,'app.clearLocalData',{confirmation:preview.confirmation});
});

test('settings traps keyboard focus, nested confirmation cancels, Escape returns to its trigger',async({page})=>{
  await page.goto('/');const trigger=page.getByRole('button',{name:'Settings',exact:true});await trigger.click();
  const settings=page.getByRole('dialog',{name:'Settings',exact:true});await expect(settings).toBeVisible();
  for(let i=0;i<14;i++){await page.keyboard.press('Tab');expect(await settings.evaluate(node=>node.contains(document.activeElement))).toBe(true);}
  await settings.getByRole('button',{name:'Clear Local GitPad+ Data',exact:true}).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);await expect(settings).toBeVisible();
  await expect(settings.getByRole('button',{name:'Clear Local GitPad+ Data',exact:true})).toBeFocused();
  await page.keyboard.press('Escape');await expect(settings).toHaveCount(0);await expect(trigger).toBeFocused();
});

test('calendar keyboard crosses month boundaries and selects the focused day',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Today',exact:true}).click();
  const selected=page.locator('.calendar button[aria-pressed=true]');const value=await selected.getAttribute('data-date');
  const date=new Date(value!+'T12:00:00');date.setDate(1);date.setMonth(date.getMonth()+1);date.setDate(0);
  const iso=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  await page.getByRole('button',{name:iso(date),exact:true}).focus();await page.keyboard.press('ArrowRight');date.setDate(date.getDate()+1);
  const next=page.getByRole('button',{name:iso(date),exact:true});await expect(next).toBeFocused();
  await page.keyboard.press('Enter');await expect(next).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('ArrowDown');date.setDate(date.getDate()+7);await expect(page.getByRole('button',{name:iso(date),exact:true})).toBeFocused();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('HybridWebViewMessageReceived',{detail:{message:JSON.stringify({type:'native-date',date:'2026-02-10'})}})));
  await expect(page.getByRole('button',{name:'2026-02-10',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('tabs and note action menu remain keyboard accessible',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'New note',exact:true}).click();await expect(page.locator('.ProseMirror')).toBeVisible();
  await page.getByRole('button',{name:'New note',exact:true}).click();await expect(page.getByRole('tab')).toHaveCount(2);
  await page.getByRole('tab',{selected:true}).focus();await page.keyboard.press('Home');await expect(page.getByRole('tab').first()).toHaveAttribute('aria-selected','true');
  const menu=page.getByLabel('Note actions',{exact:true});await menu.focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('button',{name:'Source peek',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Source peek',exact:true})).toBeHidden();await expect(menu).toBeFocused();
});

test('plugin controls wait for the native operation before accepting another change',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Settings',exact:true}).click();
  let release=()=>{};const held=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/rpc',async route=>{
    if(route.request().postDataJSON()?.method==='plugins.deactivate'){const response=await route.fetch();await held;await route.fulfill({response});}
    else await route.continue();
  });
  const toolbar=page.getByLabel('Official toolbar',{exact:true});await toolbar.uncheck();
  try{
    await expect(toolbar).toBeDisabled();await expect(page.getByLabel('Calendar statistics',{exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Save settings',exact:true})).toBeDisabled();
    for(const name of ['Theme','Markdown Peek','Native word selection'])await expect(page.getByLabel(name,{exact:true})).toBeDisabled();
  }finally{release();}
  await expect(toolbar).toBeEnabled();
  for(const name of ['Theme','Markdown Peek','Native word selection'])await expect(page.getByLabel(name,{exact:true})).toBeEnabled();
  await toolbar.check();await expect(toolbar).toBeEnabled();
  await page.getByRole('button',{name:'Save settings',exact:true}).click();await expect(page.getByRole('dialog',{name:'Settings',exact:true})).toHaveCount(0);
  await page.reload();await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(page.getByLabel('Official toolbar',{exact:true})).toBeChecked();
});

test('editor, toolbar and status fit desktop, narrow and reduced keyboard viewports',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'New note',exact:true}).click();await expect(page.locator('.ProseMirror')).toBeVisible();
  await page.locator('.ProseMirror').fill('A page with 中文 and a long line that should wrap at every writing width.');
  for(const [width,height]of [[1920,1080],[1440,960],[1366,768],[1280,720],[1000,720],[960,720],[800,720],[761,850],[760,850],[393,852],[320,640],[393,430]]){
    await page.setViewportSize({width,height});
    const rect=await page.locator('.editor-pane').boundingBox();expect(rect,`${width}x${height}`).not.toBeNull();expect(rect!.height).toBeGreaterThan(80);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await expect(page.getByRole('textbox',{name:'Note title',exact:true})).toBeVisible();
    const toolbar=await page.getByRole('toolbar',{name:'Formatting'}).boundingBox();expect(toolbar!.y+toolbar!.height).toBeLessThanOrEqual(rect!.y+1);
    await expect(page.locator('footer [role=status]')).toBeVisible();
  }
});

test('stacked writing panes remain editable and keyboard-scrollable on narrow and short screens',async({page,request},testInfo)=>{
  const now=new Date(),date=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const first=await call(request,'documents.create',{date,title:'Primary narrow page'}),second=await call(request,'documents.create',{date,title:'Secondary narrow page'});
  await page.goto('/');await page.getByRole('navigation',{name:'Notes'}).getByRole('button').filter({hasText:'Primary narrow page'}).click();
  await expect(page.locator('.ProseMirror')).toHaveCount(1);await page.getByRole('combobox',{name:'Open beside'}).selectOption(second.header.id);await expect(page.locator('.ProseMirror')).toHaveCount(2);
  for(const [width,height]of [[320,640],[393,430]]){
    await page.setViewportSize({width,height});const workspace=page.getByRole('main',{name:'Writing workspace'});
    for(const pane of await page.locator('.editor-pane').all())expect((await pane.boundingBox())!.height).toBeGreaterThanOrEqual(120);
    await workspace.focus();await page.keyboard.press('Home');await page.keyboard.press('PageDown');
    await expect.poll(()=>workspace.evaluate(node=>node.scrollTop)).toBeGreaterThan(0);
    await page.locator('.ProseMirror').first().fill(`Primary ${width}`);await page.locator('.ProseMirror').last().fill(`Secondary ${width}`);
    await page.getByRole('button',{name:'Save second pane',exact:true}).click();
    await expect.poll(async()=>(await call(request,'documents.load',{id:second.header.id})).body).toContain(`Secondary ${width}`);
    await expect.poll(async()=>(await call(request,'documents.load',{id:first.header.id})).body).toContain(`Primary ${width}`);
    await expect(page.locator('footer [role=status]')).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`stacked-${width}-${height}.png`)});
  }
});

test('explicit themes, system theme and forced colors keep writing surfaces legible',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'New note',exact:true}).click();await expect(page.locator('.ProseMirror')).toBeVisible();
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('combobox',{name:'Theme',exact:true}).selectOption('dark');await page.getByRole('button',{name:'Save settings'}).click();
  await expect(page.getByRole('dialog',{name:'Settings',exact:true})).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  const dark=await page.locator('main').evaluate(node=>({background:getComputedStyle(node).backgroundColor,color:getComputedStyle(node).color}));expect(dark.background).not.toBe(dark.color);
  await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.emulateMedia({forcedColors:'active'});await expect(page.locator('main')).toHaveCSS('background-color','rgb(255, 255, 255)');await expect(page.locator('main')).toHaveCSS('color','rgb(0, 0, 0)');
  await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(page.getByRole('dialog',{name:'Settings',exact:true})).toBeVisible();await page.keyboard.press('Escape');
  await page.emulateMedia({forcedColors:'none',colorScheme:'light'});await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('combobox',{name:'Theme',exact:true}).selectOption('system');await page.getByRole('button',{name:'Save settings'}).click();
  const light=await page.locator('main').evaluate(node=>getComputedStyle(node).backgroundColor);await page.emulateMedia({colorScheme:'dark'});expect(await page.locator('main').evaluate(node=>getComputedStyle(node).backgroundColor)).not.toBe(light);
});

test('native appearance notifications preserve content and choose readable accent ink',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'New note',exact:true}).click();await expect(page.locator('.ProseMirror')).toBeVisible();await page.locator('.ProseMirror').fill('Keep my writing.');
  for(const accent of ['#ffeecc','#102030']){
    await page.evaluate(accent=>window.dispatchEvent(new CustomEvent('HybridWebViewMessageReceived',{detail:{message:JSON.stringify({type:'appearance',accent,highContrast:false})}})),accent);
    await expect(page.locator('.ProseMirror')).toHaveText('Keep my writing.');
    expect(await page.locator('html').evaluate(node=>getComputedStyle(node).getPropertyValue('--system-accent-ink').trim())).toBe(accent==='#ffeecc'?'#000000':'#ffffff');
  }
});

test('writing chrome stays reachable at 100, 125, 150 and 200 percent render scale',async({browser},testInfo)=>{
  for(const scale of [1,1.25,1.5,2]){
    const context=await browser.newContext({viewport:{width:Math.floor(1920/scale),height:Math.floor(1080/scale)},deviceScaleFactor:scale});
    const page=await context.newPage();await page.goto('/');await expect(page.locator('html')).toHaveAttribute('data-workspace-ready','true');
    const openCount=await page.getByRole('tab').count();await page.getByRole('button',{name:'New note',exact:true}).click();
    await expect(page.getByRole('tab')).toHaveCount(openCount+1);await expect(page.locator('.ProseMirror')).toBeVisible();
    await page.getByRole('textbox',{name:'Note title',exact:true}).fill('A day, clearly remembered');
    const rect=await page.locator('.editor-pane').boundingBox();expect(rect!.height).toBeGreaterThan(160);
    await expect(page.getByRole('button',{name:'Save',exact:true})).toBeInViewport();await expect(page.getByLabel('Note actions',{exact:true})).toBeInViewport();
    await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.locator('footer [role=status]')).toHaveText('Local: Saved');
    await page.screenshot({path:testInfo.outputPath(`render-scale-${scale}.png`)});await context.close();
  }
});
