// SPDX-License-Identifier: AGPL-3.0-only
// Executes in the real Release WebView through separately signed instrumentation.
void(async()=>{
  const checks=[],saves=[],saveRequests=new Map(),started=new Date().toISOString();
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const until=async(predicate,label,attempts=180)=>{for(let i=0;i<attempts;i++){const value=await predicate();if(value)return value;await wait(250);}throw Error('Timeout: '+label);};
  const check=(name,value)=>{if(!value)throw Error(name);checks.push({name,passed:true});};
  const button=label=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===label);
  const click=label=>{const node=button(label);if(!node)throw Error('Missing button: '+label);node.click();};
  let sequence=0;
  const rpc=(method,params={})=>new Promise((resolve,reject)=>{
    const requestId='acceptance-'+Date.now()+'-'+sequence++;
    const handler=event=>{const response=JSON.parse(event.detail.message);if(response.requestId!==requestId)return;window.removeEventListener('HybridWebViewMessageReceived',handler);clearTimeout(timer);if(response.error)reject(Error(response.error.message));else resolve(response.result);};
    const timer=setTimeout(()=>{window.removeEventListener('HybridWebViewMessageReceived',handler);reject(Error('RPC timeout '+method));},30000);
    window.addEventListener('HybridWebViewMessageReceived',handler);
    window.HybridWebView.SendRawMessage(JSON.stringify({protocolVersion:1,requestId,method,params}));
  });
  try{
    await until(()=>window.HybridWebView&&button('Settings'),'real app startup');
    await until(()=>document.documentElement.dataset.workspaceReady==='true','workspace restoration completed');
    check('Actual Android Release HybridWebView loaded',!!window.HybridWebView);
    const originalSend=window.HybridWebView.SendRawMessage.bind(window.HybridWebView);
    window.HybridWebView.SendRawMessage=message=>{
      try{const request=JSON.parse(message);if(request.method==='documents.save'){
        const params=request.params,record={requestId:request.requestId,bodyLength:params.body.length,blocks:params.blocks.length,payloadLength:message.length,invalidRanges:params.blocks.filter(block=>block.start<0||block.end<block.start||block.end>params.body.length).length,duplicateIds:params.blocks.length-new Set(params.blocks.map(block=>block.id)).size,started:performance.now()};saves.push(record);saveRequests.set(request.requestId,record);
      }}catch{/* Diagnostics cannot replace the actual transport result. */}
      originalSend(message);
    };
    window.addEventListener('HybridWebViewMessageReceived',event=>{try{const response=JSON.parse(event.detail.message),record=saveRequests.get(response.requestId);if(record){record.elapsedMs=performance.now()-record.started;record.error=response.error;record.revision=response.result?.sidecar?.revision;}}catch{/* Ignore unrelated native notifications. */}});
    checks.push({name:'Loaded embedded module',scripts:[...document.querySelectorAll('script[src]')].map(node=>node.getAttribute('src'))});
    const phase=window.__acceptancePhase;await wait(1500);
    if(phase==='smoke'){
      const previous=document.querySelector('.milkdown .ProseMirror');click('New note');
      const editor=await until(()=>{const node=document.querySelector('.milkdown .ProseMirror');return node?.isConnected&&node!==previous?node:null;},'default-bundle editor');
      editor.scrollIntoView({block:'center'});await wait(500);const rect=editor.getBoundingClientRect();NativeAcceptance.press(rect.x+30,rect.y+15,innerWidth,80);await wait(500);
      NativeAcceptance.paste('Signed candidate 中文 👩🏽‍💻 — restart qualification');
      await until(()=>editor.textContent.includes('Signed candidate 中文 👩🏽‍💻'),'default-bundle native clipboard input');click('Save');
      await until(()=>document.querySelector('footer [role=status]')?.textContent==='Local: Saved','candidate source saved');
      const id=document.querySelector('[role=tab][aria-selected=true]').title,note=await rpc('documents.load',{id});
      check('Candidate Unicode source and block IDs saved',note.body.includes('Signed candidate 中文 👩🏽‍💻')&&note.sidecar.blocks.some(block=>!block.deleted));
      const data=await until(async()=>{const value=await rpc('plugins.storage.read',{pluginId:'official-calendar-stats'});return value?.objectIds['calendar-statistics']&&value.values.activations?value:null;},'official plugin persistence');
      data.values.nativeAcceptance={noteId:id,blockIds:note.sidecar.blocks.filter(block=>!block.deleted).map(block=>block.id),pluginId:data.objectIds['calendar-statistics'],activations:data.values.activations};
      await rpc('plugins.storage.write',{pluginId:'official-calendar-stats',data});NativeAcceptance.hideKeyboard();await wait(300);NativeAcceptance.screenshot('candidate-unicode-saved');
    }else if(['smoke-restart','smoke-recreate','smoke-resume'].includes(phase)){
      const data=await until(async()=>{const value=await rpc('plugins.storage.read',{pluginId:'official-calendar-stats'});return value?.values.nativeAcceptance?value:null;},'candidate persistent state');
      const saved=data.values.nativeAcceptance,note=await rpc('documents.load',{id:saved.noteId});
      const editor=await until(()=>document.querySelector('.milkdown .ProseMirror'),'candidate restored workspace');
      check('Candidate workspace and Unicode survive native restart',editor.textContent.includes('Signed candidate 中文 👩🏽‍💻'));
      check('Candidate block UUIDs retained',JSON.stringify(note.sidecar.blocks.filter(block=>!block.deleted).map(block=>block.id))===JSON.stringify(saved.blockIds));
      check('Official plugin UUID retained',data.objectIds['calendar-statistics']===saved.pluginId);
      check('Official plugin activation count advanced',data.values.activations>saved.activations);
      NativeAcceptance.hideKeyboard();NativeAcceptance.screenshot('candidate-restored-'+phase);
    }else if(phase==='initial'){
      const toggle=document.querySelector('button.mobile-calendar-toggle');
      if(toggle?.getAttribute('aria-expanded')==='false'){toggle.click();await wait(300);}
      check('Full mobile calendar renders all dates',document.querySelectorAll('.calendar button').length>=28);
      check('Calendar retains usable height',document.querySelector('.calendar').getBoundingClientRect().height>150);
      await NativeAcceptance.screenshot('calendar-initial');
      const previousEditor=document.querySelector('.milkdown .ProseMirror[contenteditable=true]');
      click('New note');
      const editor=await until(()=>{const node=document.querySelector('.milkdown .ProseMirror[contenteditable=true]');return node&&node!==previousEditor&&node.getBoundingClientRect().width>0?node:null;},'new WYSIWYG editor');
      editor.scrollIntoView({block:'center'});await wait(1000);
      const activeEditor=await until(()=>{const node=document.querySelector('.milkdown .ProseMirror[contenteditable=true]');return node?.isConnected&&node.getBoundingClientRect().width>0?node:null;},'connected editable surface');
      if(activeEditor!==editor)throw Error('Editor unexpectedly replaced before input');
      const rect=editor.getBoundingClientRect();
      checks.push({name:'Input geometry',viewport:[innerWidth,innerHeight],webView:NativeAcceptance.geometry(),rect:rect.toJSON()});
      await NativeAcceptance.screenshot('editor-before-input');
      NativeAcceptance.press(rect.x+Math.min(40,rect.width/2),rect.y+15,innerWidth,80);await wait(1000);
      NativeAcceptance.paste('Android 验收 👩🏽‍💻 — native clipboard paste');
      await until(()=>editor.textContent.includes('Android 验收'),'native clipboard input');
      check('Chinese and emoji native clipboard input',editor.textContent.includes('👩🏽‍💻'));
      click('Save');await until(()=>document.querySelector('footer [role=status]')?.textContent==='Local: Saved','native save');
      const notes=await rpc('documents.list');check('Created note persisted through native bridge',notes.length>=1);
      const note=await rpc('documents.load',{id:notes[0].id});
      check('Unicode source persisted',note.body.includes('Android 验收 👩🏽‍💻'));
      check('Persistent block IDs created',note.sidecar.blocks.some(block=>!block.deleted));
      const plugin=await until(()=>[...document.querySelectorAll('.format-toolbar button')].find(node=>node.textContent.startsWith('SDK ')),'generated packaged plugin');
      plugin.click();check('Independent generated plugin active in actual packaged host',/SDK \d+ [0-9a-f-]{36}/.test(plugin.textContent));
      await NativeAcceptance.screenshot('unicode-editor-generated-plugin');
      const selectedRect=editor.getBoundingClientRect();NativeAcceptance.press(selectedRect.x+35,selectedRect.y+15,innerWidth,850);await wait(800);
      await NativeAcceptance.screenshot('long-press-selection');
      check('Long press selected text',window.getSelection()?.toString().length>0);
      const state={noteId:note.header.id,blockIds:note.sidecar.blocks.filter(block=>!block.deleted).map(block=>block.id),pluginLabel:plugin.textContent};
      // Use actual native plugin-owned storage, not WebView DOM-storage policy.
      const persisted=await until(async()=>{const data=await rpc('plugins.storage.read',{pluginId:'native-qualification-example'});return data?.values.lastCommandObjectId?data:null;},'generated plugin command persistence');
      persisted.values.nativeAcceptance=state;
      await rpc('plugins.storage.write',{pluginId:'native-qualification-example',data:persisted});
    }else if(phase==='inspect'){
      const id=document.querySelector('[role=tab][aria-selected=true]')?.title;
      const loaded=id?await rpc('documents.load',{id}):null;await wait(3000);
      checks.push({name:'Native inspection',title:document.querySelector('input[aria-label="Note title"]')?.value,selection:getSelection()?.toString(),editorState:document.querySelector('.ProseMirror')?.pmViewDesc?.view?.state.selection.toJSON(),generatedPluginStorageSha256:NativeAcceptance.pluginStorageDigest(),footer:document.querySelector('footer')?.textContent,message:document.querySelector('[role=alert]')?.textContent,note:loaded?{id,bodyLength:loaded.body.length,revision:loaded.sidecar.revision,blocks:loaded.sidecar.blocks.length}:null});
    }else if(phase==='uninstall'){
      check('Removed generated plugin has no command in the default bundle',![...document.querySelectorAll('.format-toolbar button')].some(node=>node.textContent.startsWith('SDK ')));
      check('Removed generated plugin storage remains on disk',/^[a-f0-9]{64}$/.test(NativeAcceptance.pluginStorageDigest()));
      let rejected=false;try{await rpc('plugins.storage.read',{pluginId:'native-qualification-example'});}catch{rejected=true;}
      check('Removed plugin cannot access its retained storage through RPC',rejected);
      checks.push({name:'Retained removed-plugin storage digest',sha256:NativeAcceptance.pluginStorageDigest()});
    }else if(phase==='clear'){
      const notes=await rpc('documents.list');check('Disposable clear fixture contains notes',notes.length>0);
      click('Settings');await until(()=>document.querySelector('[role=dialog][aria-label=Settings]'),'settings');
      click('Clear Local GitPad+ Data');await until(()=>document.querySelector('[role=alertdialog]'),'clear preview');
      check('Clear preview reports the actual native note count',document.querySelector('[role=alertdialog]').textContent.includes(notes.length+' notes;'));
      NativeAcceptance.screenshot('clear-native-preview');click('Cancel');
      check('Cancellation preserves all native notes',(await rpc('documents.list')).length===notes.length);
      click('Clear Local GitPad+ Data');await until(()=>document.querySelector('[role=alertdialog]'),'second explicit confirmation');
      // The Java runner performs the final UI click and verifies the reloaded page/files.
    }else if(phase.startsWith('performance')){
      const fixture=JSON.parse(NativeAcceptance.fixtureInfo());
      let start=performance.now();const notes=await rpc('documents.list');const listMs=performance.now()-start;
      check('Native app lists the 1000 generated source-pair fixtures',notes.length>=fixture.notes);
      start=performance.now();const found=await rpc('documents.list',{search:'Benchmark'});const searchMs=performance.now()-start;
      check('Native SQLite search returns all 1000 fixtures',found.length===1000);
      const previous=document.querySelector('.milkdown .ProseMirror');start=performance.now();NativeAcceptance.openUri('gitpadplus://note/'+fixture.longDocumentId);
      const editor=await until(()=>{const node=document.querySelector('.milkdown .ProseMirror');return node!==previous&&node?.isConnected&&document.querySelector('[role=tab][aria-selected=true]')?.title===fixture.longDocumentId&&node.querySelectorAll('p').length>=10000&&node.textContent.length>=150000?node:null;},'native long-document editor',360);
      const openLongDocumentMs=performance.now()-start;
      await until(()=>document.querySelector('footer [role=status]')?.textContent==='Local: Saved','long-document identities saved',360);
      const source=await rpc('documents.load',{id:fixture.longDocumentId});
      check('Long document retains its 250000 UTF-16 source units',source.body.length===250000);
      check('Long-document block identities persisted',source.sidecar.blocks.filter(block=>!block.deleted).length>=10000);
      NativeAcceptance.hideKeyboard();editor.querySelector('p').scrollIntoView({block:'center'});await wait(500);NativeAcceptance.screenshot('long-document-1000-notes-native');
      checks.push({name:'Native performance measurements',scope:'Single observed emulator run; fixture generation excluded; not physical-device latency',notes:notes.length,fixtureSearchResults:found.length,longUtf16Length:source.body.length,paragraphs:editor.querySelectorAll('p').length,listMs,searchMs,openLongDocumentMs,memory:JSON.parse(NativeAcceptance.memory())});
    }else if(phase==='features'||phase==='features-default'){
      NativeAcceptance.hideKeyboard();await wait(500);
      const path=await rpc('media.import',{filename:'native-pixel.png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZyoAAAAASUVORK5CYII='});
      const note=await rpc('documents.create',{date:'2026-10-31',title:'Native rich acceptance'});
      const body='## Native features\n\nSelection quote 中文 👩🏽‍💻 context\n\n> [!NOTE]\n> Native callout\n\n::::fold[Outer]{default="open"}\nOuter content\n\n:::fold[Inner]{default="closed"}\nInner content\n:::\n::::\n\n![Native image]('+path+')\n';
      await rpc('documents.save',{id:note.header.id,body,title:note.header.title,tags:[],expectedRevision:note.sidecar.revision,expectedHash:note.sidecar.contentHash,blocks:[],selections:[]});
      const previous=document.querySelector('.milkdown .ProseMirror');NativeAcceptance.openUri('gitpadplus://note/'+note.header.id);
      const editor=await until(()=>{const node=document.querySelector('.milkdown .ProseMirror');return node!==previous&&node?.isConnected&&document.querySelector('[role=tab][aria-selected=true]')?.title===note.header.id&&node.textContent.includes('Native features')?node:null;},'actual Android URI activation');
      check('Android intent opens the requested document',editor.textContent.includes('Native features'));
      check('Callout rendered',!!editor.querySelector('blockquote[data-callout=note]'));
      check('Nested fold containers rendered',editor.querySelectorAll('details[data-gitpad-fold]').length===2);
      click('Expand all');check('Expand all opens nested folds',[...editor.querySelectorAll('details[data-gitpad-fold]')].every(node=>node.open));
      click('Collapse all');check('Collapse all closes nested folds',[...editor.querySelectorAll('details[data-gitpad-fold]')].every(node=>!node.open));
      click('Expand all');
      await until(()=>[...editor.querySelectorAll('img')].some(image=>image.complete&&image.naturalWidth>0),'native image decoding');
      check('Imported image rendered from native vault',true);
      click('Source peek');await until(()=>document.querySelector('textarea[aria-label="Original Markdown source"]'),'source peek');
      check('Source peek retains original heading',document.querySelector('textarea[aria-label="Original Markdown source"]').value.includes('## Native features'));click('Close peek');
      const paragraph=[...editor.querySelectorAll('p')].find(node=>node.textContent.startsWith('Selection quote'));
      if(NativeAcceptance.dismissKeyboardOnboarding())await wait(500);
      paragraph.scrollIntoView({block:'center'});await wait(300);const paragraphRect=paragraph.getBoundingClientRect();NativeAcceptance.press(paragraphRect.x+40,paragraphRect.y+10,innerWidth,80);await wait(400);
      if(NativeAcceptance.dismissKeyboardOnboarding())await wait(500);NativeAcceptance.hideKeyboard();await wait(300);
      const text=paragraph.firstChild,range=document.createRange();range.setStart(text,10);range.setEnd(text,18);
      const selection=getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange'));
      await wait(300);
      check('Selection uses the current target editor',editor.isConnected);
      checks.push({name:'Selection before toolbar touch',quote:getSelection()?.toString(),focusedElement:document.activeElement?.tagName,editorSelection:editor.pmViewDesc?.view?.state.selection.toJSON()});
      const linkButton=button('Selection link');linkButton.scrollIntoView({block:'center'});await wait(300);const rect=linkButton.getBoundingClientRect();NativeAcceptance.press(rect.x+rect.width/2,rect.y+rect.height/2,innerWidth,80);
      await until(()=>{const alert=document.querySelector('.message')?.textContent;if(alert?.includes('Error'))throw Error(alert);return alert?.includes('Link copied');},'selection link copied by native touch');
      const link=NativeAcceptance.clipboardText();check('Persistent selection link copied',link.includes('?selection='));
      NativeAcceptance.openUri(link);
      await until(()=>document.querySelector('[role=alert]')?.textContent.includes('Selection located.'),'selection restored through Android intent');
      check('Selection quote restored after editor reconstruction',getSelection()?.toString()==='quote 中文');
      const loaded=await rpc('documents.load',{id:note.header.id});
      check('Nested identities persisted to actual sidecar',loaded.sidecar.blocks.some(block=>block.path?.length>1));
      check('Selection anchor persisted to actual sidecar',loaded.sidecar.selections.some(anchor=>anchor.exact==='quote 中文'));
      const result=await rpc('documents.list',{search:'Native callout'});check('Native SQLite full-text search finds rich document',result.some(item=>item.id===note.header.id));
      NativeAcceptance.hideKeyboard();await wait(300);NativeAcceptance.screenshot('rich-folds-image-selection-native');
      click('Settings');await until(()=>document.querySelector('[role=dialog][aria-label=Settings]'),'settings');
      const generated=phase==='features',label=generated?'Example command':'Official toolbar';
      const example=[...document.querySelectorAll('[role=dialog] label')].find(node=>node.textContent===label);
      const command=()=>[...document.querySelectorAll('.format-toolbar button')].some(node=>generated?node.textContent.startsWith('SDK '):node.textContent==='Bold');
      example.querySelector('input').click();await until(()=>!command(),'packaged plugin deactivation');
      check(label+' commands disposed on disable',true);example.querySelector('input').click();
      await until(command,'packaged plugin reactivation');
      check(label+' reactivated',true);click('Save settings');
      await until(()=>!document.querySelector('[role=dialog][aria-label=Settings]'),'settings saved');
      NativeAcceptance.screenshot('rich-native-settings-complete');
    }else if(['restart','recreate','resume'].includes(phase)){
      await until(()=>[...document.querySelectorAll('.format-toolbar button')].find(node=>node.textContent.startsWith('SDK ')),'generated plugin activation');
      const persisted=await rpc('plugins.storage.read',{pluginId:'native-qualification-example'});
      const state=persisted?.values.nativeAcceptance;check('Native test state survives process restart',!!state);
      const editor=await until(()=>document.querySelector('.milkdown .ProseMirror'),'workspace restoration');
      check('Workspace restored after process termination',editor.textContent.includes('Android 验收 👩🏽‍💻'));
      const note=await rpc('documents.load',{id:state.noteId});
      check('Block identity retained after process restart',JSON.stringify(note.sidecar.blocks.filter(block=>!block.deleted).map(block=>block.id))===JSON.stringify(state.blockIds));
      const plugin=await until(()=>[...document.querySelectorAll('.format-toolbar button')].find(node=>node.textContent.startsWith('SDK ')),'generated plugin restoration');
      const previous=state.pluginLabel.split(' '),current=plugin.textContent.split(' ');
      check('Generated plugin UUID retained across restart',current[2]===previous[2]);
      check('Generated plugin activation count persisted',Number(current[1])>Number(previous[1]));
      await NativeAcceptance.screenshot('process-restart-restored');
    }else throw Error('Unsupported phase '+phase);
    window.__nativeAcceptanceReport={passed:true,phase,started,finished:new Date().toISOString(),userAgent:navigator.userAgent,checks,saves,scope:'Actual signed Release APK; emulator only; clipboard Unicode input does not establish Chinese IME composition'};
  }catch(error){try{NativeAcceptance.screenshot('scenario-failure');}catch{/* Preserve original error. */}window.__nativeAcceptanceReport={passed:false,phase:window.__acceptancePhase,started,checks,saves,error:String(error),stack:error.stack,footer:document.querySelector('footer')?.textContent,message:document.querySelector('[role=alert]')?.textContent};}
})();
