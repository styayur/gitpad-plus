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
  await page.getByRole('button',{name:'Save second pane',exact:true}).click();
  await expect(page.locator('.secondary-pane [role=status]')).toContainText('Saved');
  const row=page.locator('.note-row').filter({hasText:second.header.title});
  await row.locator('.recycle-note').focus();
  await row.locator('.recycle-note').press('Enter');
  await expect(page.getByRole('region',{name:'Second document pane'})).toHaveCount(0);
  await expect(page.locator('.ProseMirror')).toHaveCount(1);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  expect((await call(request,'documents.load',{id:first.header.id})).header.id).toBe(first.header.id);
  expect((await call(request,'documents.load',{id:second.header.id})).header.id).toBe(second.header.id);
});
