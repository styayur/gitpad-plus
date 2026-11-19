import {test,expect} from '@playwright/test';
const fixtureDate=()=>{const date=new Date();return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');};
// The native API36 failure had an IME-reduced 320x393 WebView with nested panes.
test('long paste keeps the second-pane caret inside the visible writing workspace',async({page,request,context})=>{
  const call=async(method:string,params:unknown)=>{
    const response=await request.post('http://127.0.0.1:7342/rpc',{data:{protocolVersion:1,requestId:crypto.randomUUID(),method,params}});
    const envelope=await response.json();expect(envelope.error).toBeNull();return envelope.result;
  };
  await context.grantPermissions(['clipboard-read','clipboard-write']);await page.setViewportSize({width:320,height:393});
  const first=await call('documents.create',{date:fixtureDate(),title:'Caret primary'}),second=await call('documents.create',{date:fixtureDate(),title:'Caret secondary'});
  await page.goto('/');await page.locator('.open-note').filter({hasText:'Caret primary'}).click();
  await page.getByLabel('Note actions',{exact:true}).click();await page.getByRole('combobox',{name:'Open beside in menu',exact:true}).selectOption(second.header.id);
  const editor=page.locator('.secondary-pane .ProseMirror');await expect(editor).toBeVisible();await editor.click();
  const content=Array.from({length:200},(_,index)=>'Line '+index+' 中文，English punctuation!').join('\n\n')+'\n\nEND-IME-中文';
  await page.evaluate(value=>navigator.clipboard.writeText(value),content);await page.keyboard.press('Control+v');
  await expect(editor).toContainText('END-IME-中文');
  await expect.poll(()=>editor.evaluate(element=>{
    const selection=getSelection();if(!selection?.isCollapsed||!element.lastElementChild?.contains(selection.focusNode))return false;
    const caret=selection.getRangeAt(0).getBoundingClientRect(),pane=element.closest('.editor-pane')!.getBoundingClientRect(),footer=document.querySelector('footer')!.getBoundingClientRect();
    return caret.top>=Math.max(0,pane.top)-2&&caret.bottom<=Math.min(pane.bottom,footer.top)+2;
  })).toBe(true);
  await page.getByRole('button',{name:'Save second pane',exact:true}).click();
  await expect.poll(async()=>(await call('documents.load',{id:second.header.id})).body).toContain('END-IME-中文');
  expect((await call('documents.load',{id:first.header.id})).body).toBe('');
});
