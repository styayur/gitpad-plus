// SPDX-License-Identifier: AGPL-3.0-only
import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import { RpcClient, NativeTransport } from '../bridge/client';
import { HttpTransport } from '../bridge/http';
import type { Note, Summary, Settings } from '../bridge/types';
import { DocumentSession } from '../editor/session';
import { Editor, type EditorHandle } from '../editor/Editor';
import { parseLink } from '../anchors';
import { PluginHost } from '../plugin-host/host';
import toolbar from '../../plugins/official-toolbar';
import stats from '../../plugins/official-calendar-stats';
import './style.css';

const rpc = new RpcClient(import.meta.env.DEV ? new HttpTransport() : new NativeTransport());
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const tabLabel = (n: Summary) => n.date.slice(8)+n.date.slice(5,7)+n.date.slice(2,4)+(n.tags[0] ?? n.title);
interface Preview { confirmation: string; notes: number; attachments: number; attachmentBytes: number; indexBytes: number }
function App() {
  const [, redraw] = useState(0), [notes,setNotes]=useState<Summary[]>([]), [date,setDate]=useState(iso(new Date())), [month,setMonth]=useState(new Date(new Date().getFullYear(),new Date().getMonth(),1));
  const [tabs,setTabs]=useState<Summary[]>([]), [session,setSession]=useState<DocumentSession|null>(null), [message,setMessage]=useState(''), [search,setSearch]=useState('');
  const [settings,setSettings]=useState<Settings>({markdownPeek:true,nativeWordSelection:false,theme:'system'}), [showSettings,setShowSettings]=useState(false), [preview,setPreview]=useState<Preview|null>(null);
  const [enabled,setEnabled]=useState({toolbar:true,stats:true}), [editorKey,setEditorKey]=useState(0);
  const sessionRef = useRef<DocumentSession|null>(null), editor = useRef<EditorHandle|null>(null), generation=useRef(0), loadGeneration=useRef(0);
  const hostRef = useRef<PluginHost|null>(null);
  const pendingNavigation = useRef<ReturnType<typeof parseLink>|null>(null);
  const error = (e: unknown) => setMessage(String(e));
  const refresh = async () => { const current = ++loadGeneration.current; const result=await rpc.call<Summary[]>('documents.list',{search:search||null}); if(current===loadGeneration.current)setNotes(result); };
  if(!hostRef.current) hostRef.current=new PluginHost({
    queryCalendar: (day, pluginId) => rpc.call('plugins.invoke',{pluginId,method:'calendar.query',params:{date:day??null}}),
    readDocument: (id, pluginId) => rpc.call('plugins.invoke',{pluginId,method:'documents.load',params:{id}}),
    editDocument: async () => { throw new Error('No bundled plugin has write permission'); },
    editorCommand: name => editor.current?.command(name), theme: () => settings.theme,
  }, () => redraw(n=>n+1));
  const host=hostRef.current;
  const updateDirty = () => { const active=sessionRef.current; redraw(n=>n+1); void rpc.call('documents.dirty',!!active?.dirty).catch(error); };
  async function flush() { await sessionRef.current?.flush(); }
  async function open(id: string) {
    const current=++generation.current;
    try {
      await flush(); const note=await rpc.call<Note>('documents.load',{id}); if(current!==generation.current)return;
      sessionRef.current?.dispose();
      const next=new DocumentSession(note, async request => { const saved=await rpc.call<Note>('documents.save',request); void refresh().catch(error); host.emit('documents.changed',{}); return saved; }, updateDirty);
      sessionRef.current=next; setSession(next);
      setDate(note.header.date);setMonth(new Date(Number(note.header.date.slice(0,4)),Number(note.header.date.slice(5,7))-1,1));
      const summary={id:note.header.id,date:note.header.date,title:note.header.title,tags:note.header.tags};
      setTabs(before=>before.some(n=>n.id===id)?before.map(n=>n.id===id?summary:n):[...before,summary]);setMessage('');
    } catch(e){error(e);}
  }
  useEffect(()=>{ void refresh().catch(error); },[search]);
  useEffect(()=>{
    void rpc.call<Settings>('settings.get').then(setSettings).catch(error);
    void rpc.call<{documentId:string|null;code:string}[]>('recovery.list').then(issues=>{if(issues.length)setMessage(`${issues.length} recovery issue(s): original files retained; repair is required before opening affected notes.`);}).catch(error);
    for(const plugin of [toolbar,stats])void rpc.call('plugins.activate',{pluginId:plugin.manifest.id}).then(()=>host.activate(plugin,plugin.manifest.permissions)).catch(error);
    const key=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();void flush().catch(error);}};
    const before=(event:BeforeUnloadEvent)=>{if(sessionRef.current?.dirty){event.preventDefault();}};
    const visible=()=>{if(document.visibilityState==='hidden')void flush().catch(error);};
    const reopen=()=>{const current=sessionRef.current;if(current)void open(current.note.header.id);};
    const navigate=(event:Event)=>{void navigateLink((event as CustomEvent<string>).detail);};
    const native=(event:Event)=>{try{const message=JSON.parse((event as CustomEvent<{message:string}>).detail.message);if(message.type==='native-date')setDate(message.date);if(message.type==='flush')void flush().catch(error);}catch{/* RPC responses handled by transport. */}};
    window.addEventListener('keydown',key);window.addEventListener('beforeunload',before);document.addEventListener('visibilitychange',visible);window.addEventListener('gitpad-reopen',reopen);window.addEventListener('gitpad-navigate',navigate);window.addEventListener('HybridWebViewMessageReceived',native);
    return()=>{window.removeEventListener('keydown',key);window.removeEventListener('beforeunload',before);document.removeEventListener('visibilitychange',visible);window.removeEventListener('gitpad-reopen',reopen);window.removeEventListener('gitpad-navigate',navigate);window.removeEventListener('HybridWebViewMessageReceived',native);void host.dispose();sessionRef.current?.dispose();};
  },[]);
  useEffect(()=>{document.documentElement.dataset.theme=settings.theme;},[settings]);
  async function navigateLink(value:string){
    try{
      const target=parseLink(value);await open(target.id);const current=sessionRef.current;if(current?.note.header.id!==target.id)return;
      if(target.block&&!current.blocks.some(b=>b.id===target.block&&!b.deleted))throw new Error('Block deleted or unavailable; repair required');
      if(target.block||target.selection){pendingNavigation.current=target;setMessage('Locating link…');}
    }catch(e){error(e);}
  }
  async function create(){try{await flush();const note=await rpc.call<Note>('documents.create',{date,title:'Untitled'});await refresh();host.emit('documents.changed',{});await open(note.header.id);}catch(e){error(e);}}
  async function copy(level:'note'|'block'|'selection') {try{const value=level==='note'&&session?`gitpadplus://note/${session.note.header.id}`:level==='block'?editor.current?.blockLink():editor.current?.selectionLink();if(!value)throw new Error('Select text inside one paragraph first');await flush();await navigator.clipboard.writeText(value);setMessage('Link copied');}catch(e){error(e);}}
  const upload=async(file:File)=>{const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return await rpc.call<string>('media.import',{filename:file.name,base64:btoa(binary)});};
  const imageUrl=async(path:string)=>{if(!path.startsWith('../Assets/'))return /^(https?:|data:|javascript:)/i.test(path)?'':path;return rpc.call<string>('media.read',{path});};
  async function togglePlugin(which:'toolbar'|'stats') {
    const previous=enabled[which];setEnabled(before=>({...before,[which]:!previous}));
    try{const plugin=which==='toolbar'?toolbar:stats;if(previous){await host.deactivate(plugin.manifest.id);await rpc.call('plugins.deactivate',{pluginId:plugin.manifest.id});}else{await rpc.call('plugins.activate',{pluginId:plugin.manifest.id});await host.activate(plugin,plugin.manifest.permissions);}}
    catch(e){setEnabled(before=>({...before,[which]:previous}));error(e);}
  }
  const count = new Date(month.getFullYear(),month.getMonth()+1,0).getDate(), offset=(month.getDay()+6)%7;
  return <div className="shell"><header><div><strong>GitPad+</strong><span className="alpha">Development · unreleased</span></div><button onClick={()=>setShowSettings(true)}>Settings</button></header>
    <div className="workspace"><aside aria-label="Calendar navigation"><div className="month"><button aria-label="Previous month" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}>‹</button><h2>{month.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</h2><button aria-label="Next month" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}>›</button></div>
      <div className="weekdays">{['M','T','W','T','F','S','S'].map((s,i)=><span key={i}>{s}</span>)}</div><div className="calendar">{Array.from({length:offset},(_,i)=><span key={'blank'+i}/>)}{Array.from({length:count},(_,i)=>{const day=iso(new Date(month.getFullYear(),month.getMonth(),i+1));const notesCount=notes.filter(n=>n.date===day).length;const decoration=[...host.decorations.values()].find(d=>d.date===day);return <button key={day} aria-label={day} aria-pressed={date===day} className={`${day===iso(new Date())?'today':''} ${notesCount?'has-notes':''}`} onClick={()=>setDate(day)}><span>{i+1}</span><small title={decoration?.label}>{decoration?.label??(notesCount?String(notesCount):'')}</small></button>;})}</div>
      <div className="day-heading"><h3>{date}</h3><button onClick={()=>void create()}>New note</button></div><label className="search">Search<input aria-label="Search notes" value={search} onChange={e=>setSearch(e.target.value)}/></label><nav aria-label="Notes">{notes.filter(n=>search||n.date===date).map(n=><button key={n.id} onClick={()=>void open(n.id)}><strong>{n.title}</strong><small>{n.date} · {n.id.slice(-6)}</small></button>)}</nav>
    </aside><main><div className="tabs" role="tablist">{tabs.map(n=><div className="tab" key={n.id}><button role="tab" aria-selected={session?.note.header.id===n.id} title={n.id} onClick={()=>void open(n.id)}>{tabLabel(n)}</button><button aria-label={'Close '+n.title} onClick={()=>void(async()=>{try{await flush();setTabs(before=>before.filter(t=>t.id!==n.id));if(session?.note.header.id===n.id){sessionRef.current?.dispose();sessionRef.current=null;setSession(null);}}catch(e){error(e);}})()}>×</button></div>)}</div>
      {session?<><div className="note-heading"><input aria-label="Note title" value={session.title} onChange={e=>session.rename(e.target.value)}/><button onClick={()=>void flush().catch(error)}>Save</button><button onClick={()=>void copy('note')}>Copy note link</button><button onClick={()=>void copy('block')}>Block link</button><button onClick={()=>void copy('selection')}>Selection link</button><button onClick={()=>editor.current?.command('peek')}>Source peek</button><button onClick={()=>editor.current?.command('image')}>Image</button><button onClick={()=>void(async()=>{try{await flush();if(!window.confirm('Delete this note? A recovery copy is retained in the local trash.'))return;await rpc.call('documents.delete',{id:session.note.header.id,revision:session.note.sidecar.revision});session.dispose();sessionRef.current=null;setSession(null);setTabs(before=>before.filter(n=>n.id!==session.note.header.id));await refresh();host.emit('documents.changed',{});}catch(e){error(e);}})()}>Delete</button></div>
      <div className="format-toolbar" role="toolbar" aria-label="Formatting">{[...host.commands.values()].filter(c=>c.toolbar).map(c=><button key={c.id} onMouseDown={e=>e.preventDefault()} onClick={()=>void c.run()}>{c.title}</button>)}</div>
      <Editor key={session.note.header.id+':'+editorKey} session={session} settings={settings} handle={value=>{editor.current=value;if(value&&pendingNavigation.current){setMessage(value.navigate(pendingNavigation.current));pendingNavigation.current=null;}}} upload={upload} imageUrl={imageUrl}/></>:<section className="welcome"><h1>A place for today’s thoughts</h1><p>Choose a day, then create a note. Your Markdown stays on this device.</p><button onClick={()=>void create()}>Create a note</button><label>Import Markdown<input type="file" accept=".md,.markdown,text/markdown" onChange={event=>{const file=event.target.files?.[0];if(file)void(async()=>{try{await create();const current=sessionRef.current;if(!current)return;current.edit(await file.text(),[]);await current.flush();await open(current.note.header.id);}catch(e){error(e);}})();}}/></label></section>}
      <footer><span role="status">Local: {session?.state??'Saved'}</span><span>Git: NotConfigured</span><span>{session?.error}</span></footer></main></div>
    {message&&<div className="message" role="alert">{message}<button aria-label="Dismiss message" onClick={()=>setMessage('')}>×</button></div>}
    {showSettings&&<div className="modal"><section role="dialog" aria-label="Settings"><h2>Settings</h2><label>Theme<select value={settings.theme} onChange={e=>setSettings({...settings,theme:e.target.value as Settings['theme']})}><option>system</option><option>light</option><option>dark</option></select></label><label><input type="checkbox" checked={settings.markdownPeek} onChange={e=>setSettings({...settings,markdownPeek:e.target.checked})}/>Markdown Peek</label><label><input type="checkbox" checked={settings.nativeWordSelection} onChange={e=>setSettings({...settings,nativeWordSelection:e.target.checked})}/>Native word selection</label><h3>Bundled plugins</h3><label><input type="checkbox" checked={enabled.toolbar} onChange={()=>void togglePlugin('toolbar')}/>Official toolbar</label><label><input type="checkbox" checked={enabled.stats} onChange={()=>void togglePlugin('stats')}/>Calendar statistics</label><button onClick={()=>void(async()=>{try{await flush();await rpc.call('settings.update',settings);setEditorKey(n=>n+1);setShowSettings(false);}catch(e){error(e);}})()}>Save settings</button><h3>Data &amp; Storage</h3><p>Only this app’s managed vault is eligible. External vaults are not supported.</p><button onClick={()=>void rpc.call<Preview>('app.previewClear').then(setPreview).catch(error)}>Clear Local GitPad+ Data</button><button onClick={()=>setShowSettings(false)}>Close settings</button></section></div>}
    {preview&&<div className="modal"><section role="alertdialog" aria-label="Confirm clear local data"><h2>Permanently clear this device?</h2><p>{preview.notes} notes; {preview.attachments} attachments ({preview.attachmentBytes} bytes); index {preview.indexBytes} bytes. Unsaved edits are blocked. Local trash is also removed.</p><p>This cannot be undone. No remote repositories or external directories are deleted.</p><button onClick={()=>void(async()=>{try{await rpc.call('app.clearLocalData',{confirmation:preview.confirmation});sessionRef.current?.dispose();sessionRef.current=null;setSession(null);setTabs([]);setPreview(null);setShowSettings(false);await refresh();host.emit('documents.changed',{});}catch(e){error(e);}})()}>Confirm permanent deletion</button><button onClick={()=>setPreview(null)}>Cancel</button></section></div>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
