// SPDX-License-Identifier: AGPL-3.0-only
import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import { RpcClient, NativeTransport } from '../bridge/client';
import { HttpTransport } from '../bridge/http';
import type { Note, Summary, Settings } from '../bridge/types';
import { DocumentSession } from '../editor/session';
import { Editor, type EditorHandle } from '../editor/Editor';
import { parseLink } from '../anchors';
import { PluginHost, type PluginData } from '../plugin-host/host';
import toolbar from '../../plugins/official-toolbar';
import stats from '../../plugins/official-calendar-stats';
import { packagedPlugins as reviewedBundles } from 'virtual:gitpad-packaged-plugins';
import type { GitPadPlugin } from '../../packages/sdk/index';
import './style.css';
import { Icon, Modal, NoteActions, NoteRow, CommandLabel } from './controls';

const rpc = new RpcClient(import.meta.env.DEV ? new HttpTransport() : new NativeTransport());
const packagedPlugins=reviewedBundles as GitPadPlugin[];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const tabLabel = (n: Summary) => n.tags[0] ?? n.title;
interface Preview { confirmation: string; notes: number; attachments: number; attachmentBytes: number; indexBytes: number }
interface Recovery { id: string; fingerprint: string; versions: {name:string;markdown:string;sidecar:string}[] }
function App() {
  const [, redraw] = useState(0), [notes,setNotes]=useState<Summary[]>([]), [date,setDate]=useState(iso(new Date())), [month,setMonth]=useState(new Date(new Date().getFullYear(),new Date().getMonth(),1));
  const [tabs,setTabs]=useState<Summary[]>([]), [session,setSession]=useState<DocumentSession|null>(null), [message,setMessage]=useState(''), [search,setSearch]=useState('');
  const [settings,setSettings]=useState<Settings>({markdownPeek:true,nativeWordSelection:false,theme:'system'}), [showSettings,setShowSettings]=useState(false), [preview,setPreview]=useState<Preview|null>(null);
  const [enabled,setEnabled]=useState({toolbar:true,stats:true}), [editorKey,setEditorKey]=useState(0);
  const [pendingPlugins,setPendingPlugins]=useState<string[]>([]),pendingPluginIds=useRef(new Set<string>());
  const [issues,setIssues]=useState<{documentId:string|null;code:string}[]>([]),[recovery,setRecovery]=useState<Recovery|null>(null),[recoveryText,setRecoveryText]=useState('');
  const [repairSelection,setRepairSelection]=useState<string|null>(null);
  const [secondary,setSecondary]=useState<DocumentSession|null>(null),secondaryRef=useRef<DocumentSession|null>(null),secondaryEditor=useRef<EditorHandle|null>(null);
  const sessionRef = useRef<DocumentSession|null>(null), editor = useRef<EditorHandle|null>(null), generation=useRef(0), loadGeneration=useRef(0);
  const hostRef = useRef<PluginHost|null>(null);
  const activePane = useRef<'primary'|'secondary'>('primary');
  const secondaryGeneration=useRef(0);
  const pendingNavigation = useRef<ReturnType<typeof parseLink>|null>(null);
  const [workspaceRestored,setWorkspaceRestored]=useState(false),workspaceSequence=useRef(0);
  const [calendarOpen,setCalendarOpen]=useState(true);
  const [expandedNote,setExpandedNote]=useState<string|null>(null);
  const [trash,setTrash]=useState<Summary[]|null>(null),[undoId,setUndoId]=useState<string|null>(null);
  const [trashError,setTrashError]=useState('');
  const recycling=useRef(false);
  const [recyclingNote,setRecyclingNote]=useState(false);
  useEffect(()=>{setExpandedNote(null);},[calendarOpen,date,search]);
  useEffect(()=>{if(!undoId)return;const timer=setTimeout(()=>setUndoId(null),10000);return()=>clearTimeout(timer);},[undoId]);

  const error = (e: unknown) => setMessage(String(e));
  const calendar=useRef<HTMLDivElement>(null);
  function calendarKey(event:React.KeyboardEvent<HTMLDivElement>){
    const target=(event.target as HTMLElement).closest<HTMLButtonElement>('button[data-date]');if(!target)return;
    const current=new Date(target.dataset.date!+'T12:00:00');const day=current.getDay();
    const delta:Record<string,number>={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7,Home:-((day+6)%7),End:6-((day+6)%7)};
    if(event.key in delta)current.setDate(current.getDate()+delta[event.key]);
    else if(event.key==='PageUp'||event.key==='PageDown'){const wanted=current.getDate();current.setDate(1);current.setMonth(current.getMonth()+(event.key==='PageUp'?-1:1));current.setDate(Math.min(wanted,new Date(current.getFullYear(),current.getMonth()+1,0).getDate()));}
    else return;
    event.preventDefault();setMonth(new Date(current.getFullYear(),current.getMonth(),1));
    requestAnimationFrame(()=>calendar.current?.querySelector<HTMLButtonElement>(`button[data-date="${iso(current)}"]`)?.focus());
  }
  function tabKey(event:React.KeyboardEvent<HTMLDivElement>){
    const items=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')],index=items.indexOf(event.target as HTMLButtonElement);
    if(index<0)return;const next=event.key==='ArrowRight'?(index+1)%items.length:event.key==='ArrowLeft'?(index+items.length-1)%items.length:event.key==='Home'?0:event.key==='End'?items.length-1:-1;
    if(next>=0){event.preventDefault();items[next].focus();items[next].click();}
  }
  useEffect(()=>{
    const appearance=(event:Event)=>{try{const value=JSON.parse((event as CustomEvent<{message:string}>).detail.message);if(value.type!=='appearance')return;
      if(/^#[0-9a-f]{6}$/i.test(value.accent)){document.documentElement.style.setProperty('--system-accent',value.accent);const [r,g,b]=[1,3,5].map(i=>parseInt(value.accent.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);document.documentElement.style.setProperty('--system-accent-ink',.2126*r+.7152*g+.0722*b>.179?'#000000':'#ffffff');}
      document.documentElement.dataset.highContrast=String(value.highContrast===true);
    }catch{/* Other native messages are handled by their own listeners. */}};
    window.addEventListener('HybridWebViewMessageReceived',appearance);return()=>window.removeEventListener('HybridWebViewMessageReceived',appearance);
  },[]);
  const refresh = async () => { const current = ++loadGeneration.current; const result=await rpc.call<Summary[]>('documents.list',{search:search||null}); if(current===loadGeneration.current){setNotes(result);const byId=new Map(result.map(note=>[note.id,note]));setTabs(before=>{const next=before.map(tab=>byId.get(tab.id)??tab);return next.some((tab,index)=>tab.title!==before[index].title||tab.date!==before[index].date||JSON.stringify(tab.tags)!==JSON.stringify(before[index].tags))?next:before;});} };
  if(!hostRef.current) hostRef.current=new PluginHost({
    queryCalendar: (day, pluginId) => rpc.call('plugins.invoke',{pluginId,method:'calendar.query',params:{date:day??null}}),
    readDocument: (id, pluginId) => rpc.call('plugins.invoke',{pluginId,method:'documents.load',params:{id}}),
    editDocument: async () => { throw new Error('No bundled plugin has write permission'); },
    editorCommand: name => (activePane.current==='secondary'&&secondaryEditor.current?secondaryEditor.current:editor.current)?.command(name), theme: () => settings.theme,
  }, () => redraw(n=>n+1), {
    load: pluginId=>rpc.call<PluginData|null>('plugins.storage.read',{pluginId}),
    save: (pluginId,data)=>rpc.call('plugins.storage.write',{pluginId,data}),
  });
  const host=hostRef.current;
  const updateDirty = () => { redraw(n=>n+1); void rpc.call('documents.dirty',!!sessionRef.current?.dirty||!!secondaryRef.current?.dirty).catch(error); };
  async function flush() { await sessionRef.current?.flush();await secondaryRef.current?.flush(); }
  async function openBeside(id:string){
    if(recycling.current)return;
    setExpandedNote(null);
    const current=++secondaryGeneration.current;
    try{
      if(id===sessionRef.current?.note.header.id)throw new Error('Choose a different note for the second pane');
      await flush();const note=await rpc.call<Note>('documents.load',{id});if(current!==secondaryGeneration.current)return;secondaryRef.current?.dispose();
      const next=new DocumentSession(note,async request=>{const saved=await rpc.call<Note>('documents.save',request,undefined,60_000);void refresh().catch(error);host.emit('documents.changed',{});return saved;},updateDirty);
      secondaryRef.current=next;setSecondary(next);
    }catch(e){error(e);}
  }
  async function open(id: string) {
    if(recycling.current)return;
    setExpandedNote(null);
    const current=++generation.current;
    try {
      if(id===secondaryRef.current?.note.header.id)throw new Error('This note is already open in the second pane. Close that pane before opening it here.');
      await flush(); const note=await rpc.call<Note>('documents.load',{id}); if(current!==generation.current)return;
      sessionRef.current?.dispose();
      const next=new DocumentSession(note, async request => { const saved=await rpc.call<Note>('documents.save',request,undefined,60_000); void refresh().catch(error); host.emit('documents.changed',{}); return saved; }, updateDirty);
      sessionRef.current=next; setSession(next);
      setCalendarOpen(false);
      setDate(note.header.date);setMonth(new Date(Number(note.header.date.slice(0,4)),Number(note.header.date.slice(5,7))-1,1));
      const summary={id:note.header.id,date:note.header.date,title:note.header.title,tags:note.header.tags};
      setTabs(before=>before.some(n=>n.id===id)?before.map(n=>n.id===id?summary:n):[...before,summary]);setMessage('');
    } catch(e){error(e);}
  }
  useEffect(()=>{ void refresh().catch(error); },[search]);
  useEffect(()=>{
    void rpc.call<Settings>('settings.get').then(async saved=>{
      setSettings(saved);setEnabled({toolbar:!saved.disabledPlugins?.includes(toolbar.manifest.id),stats:!saved.disabledPlugins?.includes(stats.manifest.id)});
      for(const plugin of packagedPlugins)if(!saved.disabledPlugins?.includes(plugin.manifest.id)){
        await rpc.call('plugins.activate',{pluginId:plugin.manifest.id});await host.activate(plugin,plugin.manifest.permissions);
      }
    }).catch(error);
    void rpc.call<{documentId:string|null;code:string}[]>('recovery.list').then(issues=>{setIssues(issues);if(issues.length)setMessage(`${issues.length} recovery issue(s): original files retained. Open Recovery to compare versions.`);}).catch(error);
    void(async()=>{try{
      const saved=await rpc.call<{tabs:string[];activeId:string|null;sequence:number;secondaryId?:string|null}>('workspace.get');workspaceSequence.current=saved.sequence;
      const available=await rpc.call<Summary[]>('documents.list');setTabs(saved.tabs.map(id=>available.find(n=>n.id===id)).filter((n):n is Summary=>!!n));
      if(saved.activeId&&available.some(n=>n.id===saved.activeId))await open(saved.activeId);
      if(saved.secondaryId&&available.some(n=>n.id===saved.secondaryId))await openBeside(saved.secondaryId);
      setWorkspaceRestored(true);
    }catch(e){error(e);setWorkspaceRestored(true);}})();
    const key=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();void flush().catch(error);}};
    const before=(event:BeforeUnloadEvent)=>{if(sessionRef.current?.dirty||secondaryRef.current?.dirty){event.preventDefault();}};
    const visible=()=>{if(document.visibilityState==='hidden')void flush().catch(error);};
    const reopen=()=>{const current=sessionRef.current;if(current)void open(current.note.header.id);};
    const navigate=(event:Event)=>{void navigateLink((event as CustomEvent<string>).detail);};
    const native=(event:Event)=>{try{const message=JSON.parse((event as CustomEvent<{message:string}>).detail.message);if(message.type==='native-date'){setDate(message.date);setMonth(new Date(Number(message.date.slice(0,4)),Number(message.date.slice(5,7))-1,1));};if(message.type==='navigate')void navigateLink(message.uri);if(message.type==='flush')void flush().then(()=>rpc.call('app.flushed')).catch(error);}catch{/* RPC responses handled by transport. */}};
    window.addEventListener('keydown',key);window.addEventListener('beforeunload',before);document.addEventListener('visibilitychange',visible);window.addEventListener('gitpad-reopen',reopen);window.addEventListener('gitpad-navigate',navigate);window.addEventListener('HybridWebViewMessageReceived',native);
    return()=>{window.removeEventListener('keydown',key);window.removeEventListener('beforeunload',before);document.removeEventListener('visibilitychange',visible);window.removeEventListener('gitpad-reopen',reopen);window.removeEventListener('gitpad-navigate',navigate);window.removeEventListener('HybridWebViewMessageReceived',native);void host.dispose();sessionRef.current?.dispose();secondaryRef.current?.dispose();};
  },[]);
  useEffect(()=>{document.documentElement.dataset.theme=settings.theme;},[settings]);
  useEffect(()=>{document.documentElement.dataset.workspaceReady=String(workspaceRestored);},[workspaceRestored]);
  useEffect(()=>{if(workspaceRestored)void rpc.call('app.ready').catch(error);},[workspaceRestored]);
  useEffect(()=>{if(workspaceRestored)void rpc.call('workspace.save',{tabs:tabs.map(n=>n.id),activeId:session?.note.header.id??null,sequence:++workspaceSequence.current,secondaryId:secondary?.note.header.id??null}).catch(error);},[tabs,session,secondary,workspaceRestored]);
  async function navigateLink(value:string){
    try{
      const target=parseLink(value);await open(target.id);const current=sessionRef.current;if(current?.note.header.id!==target.id)return;
      if(target.block&&!current.blocks.some(b=>!b.deleted&&(b.id===target.block||b.aliases?.includes(target.block!))))throw new Error('Block deleted or unavailable; repair required');
      if(target.selection)setRepairSelection(target.selection);
      if(target.block||target.selection){pendingNavigation.current=target;setMessage('Locating link…');}
    }catch(e){error(e);}
  }
  async function create(){if(!workspaceRestored)return;try{await flush();const note=await rpc.call<Note>('documents.create',{date,title:'Untitled'});await refresh();host.emit('documents.changed',{});await open(note.header.id);}catch(e){error(e);}}
  async function recycle(id:string) {
    if(recycling.current)return;
    recycling.current=true;setRecyclingNote(true);
    generation.current++;secondaryGeneration.current++;
    try {
      const opened=[sessionRef.current,secondaryRef.current].find(item=>item?.note.header.id===id);
      if(opened?.dirty||opened?.state==='Saving'||opened?.state==='SaveError')throw new Error('Save this note successfully before moving it to trash.');
      const note=opened?.note??await rpc.call<Note>('documents.load',{id});
      await rpc.call('documents.delete',{id,revision:note.sidecar.revision});
      if(sessionRef.current?.note.header.id===id){sessionRef.current.dispose();sessionRef.current=null;setSession(null);}
      if(secondaryRef.current?.note.header.id===id){secondaryRef.current.dispose();secondaryRef.current=null;setSecondary(null);}
      setTabs(before=>before.filter(item=>item.id!==id));setExpandedNote(null);setUndoId(id);
      await refresh();host.emit('documents.changed',{});
    }catch(e){error(e);}finally{recycling.current=false;setRecyclingNote(false);}
  }
  async function restore(id:string) {
    setTrashError('');
    try {
      await rpc.call('documents.restore',{id});
      setUndoId(null);await refresh();host.emit('documents.changed',{});
      if(trash)setTrash(await rpc.call<Summary[]>('documents.trash'));
    }catch(e){if(trash)setTrashError(String(e));else error(e);}
  }
  async function copy(level:'note'|'block'|'selection') {try{const value=level==='note'&&session?`gitpadplus://note/${session.note.header.id}`:level==='block'?editor.current?.blockLink():editor.current?.selectionLink();if(!value)throw new Error('Select text inside one paragraph first');await flush();await navigator.clipboard.writeText(value);setMessage('Link copied');}catch(e){error(e);}}
  const upload=async(file:File)=>{if(file.size>16_000_000)throw new Error('Images must be at most 16 MB.');const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return await rpc.call<string>('media.import',{filename:file.name,base64:btoa(binary)});};
  const imageUrl=async(path:string)=>{if(!path.startsWith('../Assets/'))return /^(https?:|data:|javascript:)/i.test(path)?'':path;return rpc.call<string>('media.read',{path});};
  const pickImage=import.meta.env.DEV?undefined:async()=>{await flush();return rpc.call<string|null>('media.pickImage',{},undefined,300_000);};
  async function importMarkdown(text:string){await create();const current=sessionRef.current;if(!current)return;current.edit(text,[]);await current.flush();await open(current.note.header.id);}
  async function toggleBundle(plugin:GitPadPlugin) {
    if(pendingPluginIds.current.size>0)return;
    pendingPluginIds.current.add(plugin.manifest.id);setPendingPlugins([...pendingPluginIds.current]);
    const previous=!(settings.disabledPlugins??[]).includes(plugin.manifest.id),which=plugin.manifest.id===toolbar.manifest.id?'toolbar':plugin.manifest.id===stats.manifest.id?'stats':null;
    if(which)setEnabled(before=>({...before,[which]:!previous}));
    try{if(previous){await host.deactivate(plugin.manifest.id);await rpc.call('plugins.deactivate',{pluginId:plugin.manifest.id});}else{await rpc.call('plugins.activate',{pluginId:plugin.manifest.id});await host.activate(plugin,plugin.manifest.permissions);}
      const next={...settings,disabledPlugins:previous?[...new Set([...settings.disabledPlugins??[],plugin.manifest.id])]:(settings.disabledPlugins??[]).filter(id=>id!==plugin.manifest.id)};
      await rpc.call('settings.update',next);setSettings(next);
    }
    catch(e){if(which)setEnabled(before=>({...before,[which]:previous}));error(e);}
    finally{pendingPluginIds.current.delete(plugin.manifest.id);setPendingPlugins([...pendingPluginIds.current]);}
  }
  const count = new Date(month.getFullYear(),month.getMonth()+1,0).getDate(), offset=(month.getDay()+6)%7;
  const visibleNotes=notes.filter(n=>search||n.date===date);
  const selectedDate=new Date(date+'T12:00:00');
  return <div className="shell" data-writing={!!session} data-calendar-open={calendarOpen}><a className="skip-link" href="#writing-workspace">Skip to writing workspace</a><header className="app-header">{session&&<button className="mobile-only text-button" onClick={()=>setCalendarOpen(false)}>Back to writing</button>}<div className="brand"><Icon name="calendar"/><strong>GitPad<span>+</span></strong><span className="alpha">Journal · Early Alpha</span></div><button className="calendar-toggle" aria-label="Calendar" aria-expanded={calendarOpen} onClick={()=>setCalendarOpen(value=>!value)}><Icon name="calendar"/><span>Calendar</span></button><select aria-label="Open beside" value="" onChange={e=>{if(e.target.value)void openBeside(e.target.value);}}><option value="">Open beside…</option>{notes.filter(n=>n.id!==session?.note.header.id).map(n=><option key={n.id} value={n.id}>{n.title}</option>)}</select><button className="icon-button recovery-button" aria-label="Check recovery" title="Check recovery" onClick={()=>void rpc.call<typeof issues>('recovery.list').then(setIssues).catch(error)}><Icon name="recovery"/></button><button className="icon-button" aria-label="Settings" title="Settings" onClick={()=>setShowSettings(true)}><Icon name="settings"/></button></header>
    <div className="workspace" data-calendar-open={calendarOpen} inert={recovery||recyclingNote?true:undefined}><aside aria-label="Calendar navigation"><div className="navigation-caption"><span>Journal</span><button className="text-button" onClick={()=>{const today=new Date();setDate(iso(today));setMonth(new Date(today.getFullYear(),today.getMonth(),1));}}>Today</button></div><div className="month"><h2>{month.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</h2><div><button className="icon-button" aria-label="Previous month" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}>‹</button><button className="icon-button" aria-label="Next month" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}>›</button></div></div>
      <div className="weekdays" aria-hidden="true">{['M','T','W','T','F','S','S'].map((s,i)=><span key={i}>{s}</span>)}</div><div className="calendar" ref={calendar} onKeyDown={calendarKey}>{Array.from({length:offset},(_,i)=><span key={'blank'+i}/>)}{Array.from({length:count},(_,i)=>{const day=iso(new Date(month.getFullYear(),month.getMonth(),i+1));const notesCount=notes.filter(n=>n.date===day).length;const decoration=[...host.decorations.values()].find(d=>d.date===day);return <button key={day} data-date={day} aria-label={day} aria-pressed={date===day} aria-current={day===iso(new Date())?'date':undefined} className={`${day===iso(new Date())?'today':''} ${notesCount?'has-notes':''}`} onClick={()=>setDate(day)}><span className="date-number">{i+1}</span><small title={decoration?.label}>{decoration?.label??(notesCount?String(notesCount):'')}</small></button>;})}</div>
      {!import.meta.env.DEV&&<button className="native-date-button" onClick={()=>window.HybridWebView?.SendRawMessage('{"type":"show-native-calendar"}')}>Open date picker</button>}
      <div className="day-heading"><div><span className="section-caption">{search?'Search results':'Notes for'}</span><h3><time dateTime={date}>{selectedDate.toLocaleDateString(undefined,{month:'short',day:'numeric',weekday:'short'})}</time></h3></div><button className="new-note" title="New note" aria-label="New note" disabled={!workspaceRestored} onClick={()=>void create()}><Icon name="plus"/></button></div><label className="search"><Icon name="search"/><input type="search" aria-label="Search notes" placeholder="Search your notes" value={search} onChange={e=>setSearch(e.target.value)}/></label><nav aria-label="Notes">{visibleNotes.map(n=><NoteRow key={n.id} id={n.id} title={n.title} date={n.date} current={session?.note.header.id===n.id} expanded={expandedNote===n.id} onExpand={setExpandedNote} onOpen={()=>void open(n.id)} onTrash={()=>void recycle(n.id)}/>)}</nav>{visibleNotes.length===0&&<p className="empty-notes">{search?'No notes match this search.':'No notes for this day yet.'}</p>}
    </aside><main onFocusCapture={event=>{const target=event.target as HTMLElement;if(target.closest('.editor-pane'))activePane.current=target.closest('.secondary-pane')?'secondary':'primary';}} id="writing-workspace" aria-label="Writing workspace" tabIndex={secondary?0:-1}><div className="tabs" role="tablist" aria-label="Open notes" onKeyDown={tabKey}>{tabs.map(n=><div className="tab" data-selected={session?.note.header.id===n.id} key={n.id}><button role="tab" aria-selected={session?.note.header.id===n.id} tabIndex={session?.note.header.id===n.id?0:-1} title={n.id} onClick={()=>void open(n.id)}><time dateTime={n.date}>{n.date.slice(8)}<span>{new Date(n.date+'T12:00:00').toLocaleDateString(undefined,{month:'short'})}</span></time><span className="tab-title">{tabLabel(n)}</span></button><button className="close-tab" aria-label={'Close '+n.title} onClick={()=>void(async()=>{try{await flush();setTabs(before=>before.filter(t=>t.id!==n.id));if(session?.note.header.id===n.id){sessionRef.current?.dispose();sessionRef.current=null;setSession(null);}}catch(e){error(e);}})()}>×</button></div>)}</div>
      {session?<><div className="note-heading"><div className="page-title"><time dateTime={session.note.header.date}>{new Date(session.note.header.date+'T12:00:00').toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</time><input aria-label="Note title" value={session.title} onChange={e=>session.rename(e.target.value)}/></div><div className="page-actions"><button className="mobile-only icon-button" aria-label="Calendar" title="Calendar" onClick={()=>setCalendarOpen(true)}><Icon name="calendar"/></button><button className="mobile-only mobile-optional icon-button" aria-label="Settings" title="Settings" onClick={()=>setShowSettings(true)}><Icon name="settings"/></button><button className="icon-button" aria-label="Save" title="Save" onClick={()=>void flush().catch(error)}><Icon name="save"/></button><button className="mobile-optional icon-button" aria-label="Image" title="Insert image" onClick={()=>editor.current?.command('image')}><Icon name="image"/></button><NoteActions><button className="mobile-overflow" onClick={()=>setShowSettings(true)}>Settings</button><button className="mobile-overflow" onClick={()=>editor.current?.command('image')}>Image</button><button className="mobile-only" onClick={()=>void rpc.call<typeof issues>('recovery.list').then(setIssues).catch(error)}>Check recovery</button><label className="mobile-only">Open beside<select aria-label="Open beside in menu" value="" onChange={e=>{if(e.target.value){e.currentTarget.closest('details')?.removeAttribute('open');void openBeside(e.target.value);}}}><option value="">Choose a note…</option>{notes.filter(n=>n.id!==session.note.header.id).map(n=><option key={n.id} value={n.id}>{n.title}</option>)}</select></label><button onClick={()=>void copy('note')}>Copy note link</button><button onClick={()=>void copy('block')}>Block link</button><button onClick={()=>void copy('selection')}>Selection link</button><button onClick={()=>editor.current?.command('peek')}>Source peek</button><button onClick={()=>editor.current?.command('pasteImage')}>Paste image</button><button onClick={()=>void recycle(session.note.header.id)}>Move to trash</button></NoteActions></div></div>
      <div className="format-toolbar" role="toolbar" aria-label="Formatting">{[...host.commands.values()].filter(c=>c.toolbar).map(c=><button key={c.id} aria-label={c.title} title={c.title} data-command={c.id} onPointerDown={e=>e.preventDefault()} onClick={()=>void c.run()}><CommandLabel id={c.id.split(':').at(-1)!} title={c.title}/></button>)}</div>
      <Editor key={session.instanceId+':'+editorKey} session={session} settings={settings} handle={value=>{editor.current=value;if(value&&pendingNavigation.current){setMessage(value.navigate(pendingNavigation.current));pendingNavigation.current=null;}}} upload={upload} imageUrl={imageUrl} pasteImage={()=>rpc.call<string>('media.importClipboard')} pickImage={pickImage}/></>:<section className="welcome"><div className="welcome-date"><span>{selectedDate.toLocaleDateString(undefined,{day:'2-digit'})}</span><div>{selectedDate.toLocaleDateString(undefined,{month:'long',year:'numeric'})}<small>{selectedDate.toLocaleDateString(undefined,{weekday:'long'})}</small></div></div><h1>A place for today’s thoughts</h1><p>Choose a day, then create a note. Your Markdown stays on this device.</p><button disabled={!workspaceRestored} onClick={()=>void create()}>Create a note</button>{import.meta.env.DEV?<label>Import Markdown<input disabled={!workspaceRestored} type="file" accept=".md,.markdown,text/markdown" onChange={event=>{const file=event.target.files?.[0];if(file)void file.text().then(importMarkdown).catch(error);}}/></label>:<button disabled={!workspaceRestored} onClick={()=>void rpc.call<{filename:string;text:string}|null>('files.pickMarkdown',{},undefined,300_000).then(file=>file?importMarkdown(file.text):undefined).catch(error)}>Import Markdown</button>}</section>}
      {secondary&&<section className="secondary-pane" aria-label="Second document pane"><div className="note-heading"><input aria-label="Second note title" value={secondary.title} onChange={e=>secondary.rename(e.target.value)}/><span role="status">Local: {secondary.state}</span><button className="secondary-bold" onClick={()=>secondaryEditor.current?.command('bold')}>Bold in second pane</button><button className="secondary-save" aria-label="Save second pane" onClick={()=>void secondary.flush().catch(error)}><Icon name="save"/><span>Save second pane</span></button><button className="secondary-close" aria-label="Close second pane" onClick={()=>void(async()=>{try{await secondary.flush();secondary.dispose();secondaryRef.current=null;setSecondary(null);}catch(e){error(e);}})()}><span>Close second pane</span><b aria-hidden="true">×</b></button></div><Editor key={secondary.instanceId+':'+editorKey} session={secondary} settings={settings} handle={value=>{secondaryEditor.current=value;}} upload={upload} imageUrl={imageUrl} pasteImage={()=>rpc.call<string>('media.importClipboard')} pickImage={pickImage}/></section>}
</main></div><footer><span className="local-state" data-state={session?.state??'Saved'} role="status">Local: {session?.state??'Saved'}</span><span className="git-state">Git: NotConfigured</span>{secondary&&<span className="mobile-only" data-state={secondary.state}>Second: {secondary.state} {secondary.error}</span>}<span>{session?.error}</span></footer>
    {undoId&&<div className="trash-snackbar" role="status">Moved to trash<button onClick={()=>void restore(undoId)}>Undo</button></div>}
    {trash&&<Modal label="Trash" onClose={()=>{setTrash(null);setTrashError('');}}><h2>Trash</h2>{trashError&&<p role="alert" className="dialog-error">{trashError}</p>}{trash.length===0?<p>Trash is empty.</p>:trash.map(note=><div key={note.id} className="trash-entry"><strong>{note.title||'Untitled'}</strong><time dateTime={note.date}>{note.date}</time><button onClick={()=>void restore(note.id)}>Restore {note.title||'Untitled'}</button></div>)}<button onClick={()=>{setTrash(null);setTrashError('');}}>Close trash</button></Modal>}
    {message&&<div className="message" role="alert">{message}<button aria-label="Dismiss message" onClick={()=>setMessage('')}>×</button></div>}
    {repairSelection&&<section aria-label="Selection link repair"><p>Original quote: {session?.selections.find(a=>a.id===repairSelection)?.exact}. If the location needs repair, select the intended text in one paragraph and explicitly rebind this link.</p><button onMouseDown={e=>e.preventDefault()} onClick={()=>void(async()=>{try{if(!editor.current?.repairSelection(repairSelection))throw new Error('Select replacement text in one paragraph first');await flush();setRepairSelection(null);setMessage('Selection link repaired.');}catch(e){error(e);}})()}>Rebind link to selected text</button><button onClick={()=>setRepairSelection(null)}>Close repair</button></section>}
    {issues.length>0&&<section aria-label="Recovery issues"><h2>Recovery</h2>{issues.map((issue,index)=><p key={index}>{issue.code} {issue.documentId}{issue.documentId&&<button onClick={()=>void rpc.call<Recovery>('recovery.inspect',{id:issue.documentId}).then(value=>{setRecovery(value);setRecoveryText(value.versions[0].markdown);}).catch(error)}>Compare retained versions</button>}</p>)}</section>}
    {recovery&&<Modal label="Reconcile external changes" onClose={()=>setRecovery(null)}><h2>Reconcile external changes</h2><p>All current and transaction versions are archived locally before applying. Existing block/selection links will require explicit repair. Keep the frontmatter document ID.</p>{recovery.versions.map(version=><details key={version.name}><summary>{version.name}</summary><pre>{version.markdown}</pre><pre>{version.sidecar}</pre><button onClick={()=>setRecoveryText(version.markdown)}>Use this Markdown as starting point</button></details>)}<details><summary>Open editor buffer (also archived)</summary><pre>{[sessionRef.current,secondaryRef.current].find(item=>item?.note.header.id===recovery.id)?.body??"No open buffer for this note"}</pre></details><label>Merged Markdown<textarea aria-label="Merged Markdown" value={recoveryText} onChange={e=>setRecoveryText(e.target.value)}/></label><button onClick={()=>void(async()=>{try{const buffered=[sessionRef.current,secondaryRef.current].find(item=>item?.note.header.id===recovery.id);await rpc.call('recovery.reconcile',{id:recovery.id,expectedFingerprint:recovery.fingerprint,markdown:recoveryText,buffer:buffered?{body:buffered.body,title:buffered.title,blocks:buffered.blocks,selections:buffered.selections}:null});if(sessionRef.current?.note.header.id===recovery.id){sessionRef.current.dispose();sessionRef.current=null;setSession(null);}if(secondaryRef.current?.note.header.id===recovery.id){secondaryRef.current.dispose();secondaryRef.current=null;setSecondary(null);}setRecovery(null);setIssues(await rpc.call('recovery.list'));await refresh();await open(recovery.id);}catch(e){error(e);}})()}>Archive versions and apply</button><button onClick={()=>setRecovery(null)}>Cancel recovery</button></Modal>}
    {showSettings&&<Modal label="Settings" onClose={()=>setShowSettings(false)}><h2>Settings</h2><p className="dialog-intro">Appearance, editing and extensions for this device.</p><h3>Appearance &amp; editing</h3><label>Theme<select aria-label="Theme" disabled={pendingPlugins.length>0} value={settings.theme} onChange={e=>setSettings({...settings,theme:e.target.value as Settings['theme']})}><option value="system">Use system setting</option><option value="light">Light</option><option value="dark">Dark</option></select></label><label><input type="checkbox" disabled={pendingPlugins.length>0} checked={settings.markdownPeek} onChange={e=>setSettings({...settings,markdownPeek:e.target.checked})}/>Markdown Peek</label><label><input type="checkbox" disabled={pendingPlugins.length>0} checked={settings.nativeWordSelection} onChange={e=>setSettings({...settings,nativeWordSelection:e.target.checked})}/>Native word selection</label><h3>Bundled plugins</h3><label><input type="checkbox" disabled={pendingPlugins.length>0} checked={enabled.toolbar} onChange={()=>void toggleBundle(toolbar)}/>Official toolbar</label><label><input type="checkbox" disabled={pendingPlugins.length>0} checked={enabled.stats} onChange={()=>void toggleBundle(stats)}/>Calendar statistics</label>{packagedPlugins.filter(plugin=>![toolbar.manifest.id,stats.manifest.id].includes(plugin.manifest.id)).map(plugin=><label key={plugin.manifest.id}><input type="checkbox" disabled={pendingPlugins.length>0} checked={!(settings.disabledPlugins??[]).includes(plugin.manifest.id)} onChange={()=>void toggleBundle(plugin)}/>{plugin.manifest.name}</label>)}{pendingPlugins.length>0&&<p role="status">Updating plugin…</p>}<button disabled={pendingPlugins.length>0} onClick={()=>void(async()=>{try{await flush();await rpc.call('settings.update',settings);setEditorKey(n=>n+1);setShowSettings(false);}catch(e){error(e);}})()}>Save settings</button><h3>Data &amp; Storage</h3><button onClick={()=>void rpc.call<Summary[]>('documents.trash').then(setTrash).catch(error)}>Trash</button><p>Only this app’s managed vault is eligible. External vaults are not supported.</p><button disabled={pendingPlugins.length>0} onClick={()=>{if(sessionRef.current?.dirty||secondaryRef.current?.dirty){error('Save all panes before clearing local data');return;}void rpc.call<Preview>('app.previewClear').then(setPreview).catch(error);}}>Clear Local GitPad+ Data</button><button onClick={()=>setShowSettings(false)}>Close settings</button></Modal>}
    {preview&&<Modal label="Confirm clear local data" alert onClose={()=>setPreview(null)}><h2>Permanently clear this device?</h2><p>{preview.notes} notes; {preview.attachments} attachments ({preview.attachmentBytes} bytes); index {preview.indexBytes} bytes. Unsaved edits are blocked. Local trash is also removed.</p><p>This cannot be undone. No remote repositories or external directories are deleted.</p><button onClick={()=>void(async()=>{try{await host.dispose();await rpc.call('app.clearLocalData',{confirmation:preview.confirmation});sessionRef.current?.dispose();sessionRef.current=null;setSession(null);secondaryRef.current?.dispose();secondaryRef.current=null;setSecondary(null);setTabs([]);setPreview(null);setShowSettings(false);window.location.reload();}catch(e){error(e);}})()}>Confirm permanent deletion</button><button onClick={()=>setPreview(null)}>Cancel</button></Modal>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
