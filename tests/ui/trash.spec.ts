// SPDX-License-Identifier: AGPL-3.0-only
import {test,expect,type APIRequestContext} from '@playwright/test';

const fixtureDate=()=>{const date=new Date();return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');};
async function call(request:APIRequestContext,method:string,params:unknown={}){
  const response=await request.post('/rpc',{data:{protocolVersion:1,requestId:crypto.randomUUID(),method,params}});
  const result=await response.json();expect(result.error).toBeNull();return result.result;
}
test.beforeEach(async({request})=>{
  await call(request,'documents.dirty',false);
  const preview=await call(request,'app.previewClear');
  await call(request,'app.clearLocalData',{confirmation:preview.confirmation});
});
test('a failed save blocks recycling and retains the open buffer',async({page,request})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'New note',exact:true}).click();
  await page.route('**/rpc',async route=>{
    const data=route.request().postDataJSON();
    if(data.method!=='documents.save'){await route.continue();return;}
    await route.fulfill({json:{protocolVersion:1,requestId:data.requestId,result:null,error:{code:'IOError',message:'Injected save failure'}}});
  });
  await page.locator('.ProseMirror').fill('Retain this unsaved buffer 中文');
  await expect(page.locator('footer [role=status]')).toContainText('SaveError');
  await page.getByLabel('Note actions',{exact:true}).click();
  await page.getByRole('button',{name:'Move to trash',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Save this note successfully');
  await expect(page.locator('.ProseMirror')).toContainText('Retain this unsaved buffer 中文');
  expect(await call(request,'documents.trash')).toHaveLength(0);
  expect(await call(request,'documents.list')).toHaveLength(1);
});
test('recycling the second pane closes that pane and undo keeps the first document',async({page,request})=>{
  const date=fixtureDate();
  const first=await call(request,'documents.create',{date,title:'Primary trash test'});
  const second=await call(request,'documents.create',{date,title:'Secondary trash test'});
  await page.goto('/');
  await page.locator('.open-note').filter({hasText:first.header.title}).click();
  await page.getByRole('combobox',{name:'Open beside',exact:true}).selectOption(second.header.id);
  await expect(page.locator('.ProseMirror')).toHaveCount(2);
  await expect(page.getByText('Loading editor…',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByRole('button',{name:'Save second pane',exact:true}).click();
  await expect(page.locator('.secondary-pane [role=status]')).toContainText('Saved');
  await expect(page.locator('footer [role=status]')).toHaveText('Local: Saved');
  const row=page.locator('.note-row').filter({hasText:second.header.title});
  await row.locator('.recycle-note').focus();
  await row.locator('.recycle-note').press('Enter');
  await expect(page.getByRole('region',{name:'Second document pane'})).toHaveCount(0);
  await expect(page.locator('.ProseMirror')).toHaveCount(1);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  expect((await call(request,'documents.load',{id:first.header.id})).header.id).toBe(first.header.id);
  expect((await call(request,'documents.load',{id:second.header.id})).header.id).toBe(second.header.id);
});


test('a complete swipe delivered within one render turn expands without recycling',async({page,request})=>{
  await page.setViewportSize({width:393,height:700});
  const note=await call(request,'documents.create',{date:fixtureDate(),title:'Batched pointer fixture'});
  await page.goto('/');
  const row=page.locator('.note-row').filter({hasText:note.header.title});
  await row.evaluate(node=>{
    for(const [type,x] of [['pointerdown',300],['pointermove',210],['pointerup',210]] as const){
      node.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'touch',pointerId:1,clientX:x,clientY:100}));
    }
  });
  await expect(row.locator('.open-note')).toHaveCSS('transform','matrix(1, 0, 0, 1, -88, 0)');
  expect(await call(request,'documents.trash')).toHaveLength(0);
});

test('recycling a background tab preserves the active editor and survives workspace restart',async({page,request})=>{
  const date=fixtureDate();
  const background=await call(request,'documents.create',{date,title:'Background recycle fixture'});
  const active=await call(request,'documents.create',{date,title:'Active retained fixture'});
  await page.goto('/');
  await page.locator('.open-note').filter({hasText:background.header.title}).click();
  await expect(page.getByRole('tab',{selected:true})).toHaveAttribute('title',background.header.id);
  await expect(page.getByText('Loading editor…',{exact:true})).toHaveCount(0);
  await page.locator('.ProseMirror').fill('Background original 中文');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.locator('footer [role=status]')).toContainText('Saved');
  const original=await call(request,'documents.load',{id:background.header.id});
  expect(original.body).toContain('Background original 中文');
  await page.locator('.open-note').filter({hasText:active.header.title}).click();
  await expect(page.getByRole('tab',{selected:true})).toHaveAttribute('title',active.header.id);
  await expect(page.getByText('Loading editor…',{exact:true})).toHaveCount(0);
  await page.locator('.ProseMirror').fill('Active writing stays connected');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.locator('footer [role=status]')).toContainText('Saved');
  const activeBefore=await call(request,'documents.load',{id:active.header.id});
  expect(activeBefore.body).toContain('Active writing stays connected');
  const activeEditor=await page.locator('.ProseMirror').elementHandle();
  const row=page.locator('.note-row').filter({hasText:background.header.title});
  await row.locator('.recycle-note').focus();await row.locator('.recycle-note').press('Enter');
  await expect(page.getByRole('tab').filter({hasText:background.header.title})).toHaveCount(0);
  await expect(page.getByRole('tab',{selected:true})).toHaveAttribute('title',active.header.id);
  expect(await page.locator('.ProseMirror').evaluate((node,previous)=>node===previous,activeEditor)).toBe(true);
  expect(await call(request,'documents.load',{id:active.header.id})).toEqual(activeBefore);
  expect(await call(request,'documents.list',{date})).toHaveLength(1);
  expect(await call(request,'documents.list',{search:background.header.title})).toHaveLength(0);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect.poll(()=>call(request,'documents.trash')).toHaveLength(0);
  expect(await call(request,'documents.load',{id:background.header.id})).toEqual(original);
  await page.reload();
  await expect(page.getByRole('tab',{selected:true})).toHaveAttribute('title',active.header.id);
  await expect(page.getByRole('tab').filter({hasText:background.header.title})).toHaveCount(0);
  await expect(page.locator('.ProseMirror')).toContainText('Active writing stays connected');
});

test('a failed restore explains its cause inside the active trash dialog',async({page,request})=>{
  await page.setViewportSize({width:320,height:640});
  const note=await call(request,'documents.create',{date:fixtureDate(),title:'Retained restore failure'});
  await call(request,'documents.delete',{id:note.header.id,revision:note.sidecar.revision});
  await page.goto('/');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Trash',exact:true}).click();
  const trash=page.getByRole('dialog',{name:'Trash',exact:true});
  await page.route('**/rpc',async route=>{
    const data=route.request().postDataJSON();
    if(data.method!=='documents.restore'){await route.continue();return;}
    await route.fulfill({json:{protocolVersion:1,requestId:data.requestId,result:null,error:{code:'Conflict',message:'A note with this identity already exists in the active vault. Both versions were retained.'}}});
  });
  await trash.getByRole('button',{name:'Restore '+note.header.title,exact:true}).click();
  await expect(trash.getByRole('alert')).toContainText('active vault');
  await expect(trash.getByRole('alert')).toBeInViewport();
  await expect(trash.getByRole('button',{name:'Restore '+note.header.title,exact:true})).toBeVisible();
  expect((await call(request,'documents.trash')).map((item:{id:string})=>item.id)).toContain(note.header.id);
  await page.screenshot({path:'artifacts/ui-v11-trash-restore-error-320.png'});
});
