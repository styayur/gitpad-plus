// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { v7 } from 'uuid';
import { Schema } from '@milkdown/kit/prose/model';
import { EditorState } from '@milkdown/kit/prose/state';
import { SourceDocument, preserveSource } from '../../web/markdown/source';
import { createAnchor, resolveAnchor, parseLink, SelectionSession, textFragment } from '../../web/anchors';
import { identityPlugin, blockKey } from '../../web/editor/identity';
import { MarkdownPeek } from '../../web/editor/peek';
import { PluginHost } from '../../web/plugin-host/host';
import type { PluginPort } from '../../web/plugin-host/host';
import { definePlugin } from '../../packages/sdk/index';
import toolbar from '../../plugins/official-toolbar';
import stats, { createCalendarStatsPlugin } from '../../plugins/official-calendar-stats';
import { RpcClient } from '../../web/bridge/client';
import type { Note, RpcRequest, RpcResponse, Transport, SaveRequest } from '../../web/bridge/types';
import { DocumentSession } from '../../web/editor/session';

describe('Markdown source fidelity',()=>{
  for(const file of readdirSync('tests/markdown-fixtures')) it(`preserves exact bytes: ${file}`,()=>{
    const raw=readFileSync('tests/markdown-fixtures/'+file,'utf8');const document=new SourceDocument(raw);
    expect(document.serialize()).toBe(raw);
    for(const [i,range] of document.ranges.entries())expect(document.slice(i)).toBe(raw.slice(range.start,range.end));
    const formatted=document.serialize(structuredClone(document.tree));
    expect(new SourceDocument(formatted).tree.children.map(n=>n.type)).toEqual(document.tree.children.map(n=>n.type));
  });
  it('retains untouched raw marker styles while editing another block',()=>{
    expect(preserveSource('__bold__\n\nold\n','**bold**\n\nnew\n')).toBe('__bold__\n\nnew\n');
  });
  it('source replacement does not normalize surrounding CRLF or whitespace',()=>{
    const source=new SourceDocument('  # title\r\n\r\nbody\r\n');expect(source.replace(1,'changed').raw).toBe('  # title\r\n\r\nchanged\r\n');
  });
});

describe('Persistent anchors and session positions',()=>{
  it('relocates after insertion without confusing UTF-16 emoji offsets',()=>{
    const text='中文 👩🏽‍💻 hello café';const start=text.indexOf('hello');const anchor=createAnchor(v7(),text,start,start+5);
    expect(resolveAnchor(anchor,'insert '+text)).toEqual({state:'resolved',start:start+7,end:start+12});
  });
  it('does not silently choose duplicate quotations even if old offsets still match',()=>{
    const anchor={...createAnchor(v7(),'same',0,4),prefix:'',suffix:''};expect(resolveAnchor(anchor,'same same').state).toBe('ambiguous');
  });
  it('uses context to disambiguate repeated strings',()=>{
    const text='one same two';const anchor=createAnchor(v7(),text,4,8);expect(resolveAnchor(anchor,'same '+text).state).toBe('resolved');
  });
  it('reports deletion and normalization mismatch',()=>{const anchor=createAnchor(v7(),'hello',0,5);expect(resolveAnchor(anchor,'gone').state).toBe('missing');});
  it('requires repair if only a quote in different context survives',()=>{const text='left same right',anchor=createAnchor(v7(),text,5,9);expect(resolveAnchor(anchor,'unrelated same elsewhere').state).toBe('ambiguous');});
  it('relative positions survive an insertion only inside their original Y.Doc',()=>{
    const session=new SelectionSession('hello'),position=session.relative(3);session.text.insert(0,'prefix ');expect(session.resolve(position)).toBe(10);
    const reopened=new SelectionSession(session.text.toString());expect(reopened.resolve(position)).toBeNull();session.dispose();reopened.dispose();
  });
  it('minimal replacement retains position identity outside the edit',()=>{const s=new SelectionSession('abcdef');const p=s.relative(5);s.update('abXXcdef');expect(s.resolve(p)).toBe(7);s.dispose();});
  it('strictly parses each link level and encodes fragment separators',()=>{
    const id=v7(),block=v7(),selection=v7();expect(parseLink(`gitpadplus://note/${id}`).id).toBe(id);
    expect(parseLink(`gitpadplus://note/${id}?block=${block}`).block).toBe(block);
    expect(parseLink(`gitpadplus://note/${id}?selection=${selection}`).selection).toBe(selection);
    for(const bad of [`gitpadplus://note/${id}?block=${block}&selection=${selection}`,`gitpadplus://note/${id}?block=${block}&block=${block}`,`https://note/${id}`,`gitpadplus://note/${id}/more`])expect(()=>parseLink(bad)).toThrow();
    expect(textFragment(createAnchor(block,'hello-world',0,11))).toContain('hello%2Dworld');
  });
});

const schema=new Schema({nodes:{doc:{content:'paragraph+'},paragraph:{content:'text*',group:'block'},text:{group:'inline'}}});
const paragraph=(text:string)=>schema.node('paragraph',null,text?schema.text(text):undefined);
const state=(...values:string[])=>EditorState.create({schema,doc:schema.node('doc',null,values.map(paragraph)),plugins:[identityPlugin()]});
describe('ProseMirror block identities',()=>{
  it('ordinary text edits preserve IDs',()=>{const before=state('hello','world'),ids=blockKey.getState(before)!.live.map(b=>b.id);const after=before.apply(before.tr.insertText('!',2));expect(blockKey.getState(after)!.live.map(b=>b.id)).toEqual(ids);});
  it('split retains first ID and allocates a new second ID',()=>{const before=state('hello'),id=blockKey.getState(before)!.live[0].id;const after=before.apply(before.tr.split(3));expect(blockKey.getState(after)!.live[0].id).toBe(id);expect(blockKey.getState(after)!.live[1].id).not.toBe(id);});
  it('copy gets a new ID and preserves original',()=>{const before=state('hello');const id=blockKey.getState(before)!.live[0].id;const after=before.apply(before.tr.insert(before.doc.content.size,paragraph('hello')));const ids=blockKey.getState(after)!.live.map(b=>b.id);expect(ids[0]).toBe(id);expect(new Set(ids).size).toBe(2);});
  it('move keeps identity; merge tombstones the secondary ID',()=>{
    const before=state('one','two'),ids=blockKey.getState(before)!.live.map(b=>b.id);const node=before.doc.child(0);
    const moved=before.apply(before.tr.delete(0,node.nodeSize).insert(before.doc.content.size-node.nodeSize,node));expect(blockKey.getState(moved)!.live.map(b=>b.id)).toEqual([ids[1],ids[0]]);
    const joined=before.apply(before.tr.join(before.doc.child(0).nodeSize));expect(blockKey.getState(joined)!.live[0].id).toBe(ids[0]);expect(blockKey.getState(joined)!.deleted.map(b=>b.id)).toContain(ids[1]);
  });
  it('reload uses persisted identities and never resurrects tombstones',()=>{const id=v7(),deleted=v7();const editor=EditorState.create({schema,doc:schema.node('doc',null,[paragraph('saved')]),plugins:[identityPlugin([{id,kind:'paragraph',start:0,end:5,deleted:false},{id:deleted,kind:'paragraph',start:0,end:0,deleted:true}])]});expect(blockKey.getState(editor)!.live[0].id).toBe(id);expect(blockKey.getState(editor)!.deleted[0].id).toBe(deleted);});
});

describe('Markdown Peek state machine',()=>{
  it('shows actual source for 3000ms and cancels timeout on editing',()=>{vi.useFakeTimers();const peek=new MarkdownPeek(()=>{});peek.show('__original__');vi.advanceTimersByTime(2999);expect(peek.source).toBe('__original__');vi.advanceTimersByTime(1);expect(peek.source).toBeNull();peek.show('  source');peek.edit();vi.advanceTimersByTime(9000);expect(peek.source).toBe('  source');peek.close();expect(peek.source).toBeNull();vi.useRealTimers();});
});

const port:PluginPort={queryCalendar:async()=>[{id:v7(),date:'2026-10-31',title:'Test'}],readDocument:async()=>({body:'read'}),editDocument:async()=>{},editorCommand:()=>{},theme:()=> 'system'};
describe('Plugin SDK',()=>{
  it('loads official plugins through SDK and disposes all registrations',async()=>{const host=new PluginHost(port);await host.activate(toolbar,toolbar.manifest.permissions);await host.activate(stats,stats.manifest.permissions);expect(host.commands.size).toBe(11);expect(host.decorations.size).toBe(1);await host.dispose();expect(host.commands.size).toBe(0);expect(host.decorations.size).toBe(0);});
  it('denies ungranted permissions and incompatible API versions',async()=>{const host=new PluginHost(port);await expect(host.activate(toolbar,[])).rejects.toThrow('Permission');await expect(host.activate({...toolbar,manifest:{...toolbar.manifest,apiVersion:2 as 1}},toolbar.manifest.permissions)).rejects.toThrow('Incompatible');});
  it('enforces capabilities at use and invalidates retained contexts on unload',async()=>{
    let action=()=>{};const host=new PluginHost(port);const plugin=definePlugin({manifest:{id:'test-plugin',name:'Test',version:'1',apiVersion:1,level:1,permissions:[]},activate:api=>{action=()=>api.editorCommand('bold');}});await host.activate(plugin,[]);expect(action).toThrow('denied');await host.dispose();expect(action).toThrow('denied');
  });
  it('isolates a failing command and failing deactivate while releasing resources',async()=>{
    const host=new PluginHost(port);const plugin=definePlugin({manifest:{...toolbar.manifest,id:'failing-plugin'},activate:api=>{api.registerCommand({id:'fail',title:'fail',run:()=>{throw new Error('plugin bug');}});},deactivate:()=>{throw new Error('cleanup bug');}});
    await host.activate(plugin,plugin.manifest.permissions);await host.commands.get('failing-plugin:fail')!.run();expect(host.errors).toHaveLength(1);await host.dispose();expect(host.commands.size).toBe(0);expect(host.errors).toHaveLength(2);
  });
  it('does not register late calendar results after unloading',async()=>{
    let finish!:(value:{id:string;date:string;title:string}[])=>void;
    const host=new PluginHost({...port,queryCalendar:()=>new Promise(resolve=>{finish=resolve;})});
    const plugin=createCalendarStatsPlugin();const activating=host.activate(plugin,plugin.manifest.permissions);
    await host.deactivate(plugin.manifest.id);finish([{id:v7(),date:'2026-10-31',title:'late'}]);await activating;expect(host.decorations.size).toBe(0);
  });
});

describe('Bridge client',()=>{
  class Fake implements Transport {sent:RpcRequest[]=[];listener?:(r:RpcResponse)=>void;send(r:RpcRequest){this.sent.push(r);}subscribe(l:(r:RpcResponse)=>void){this.listener=l;return()=>{this.listener=undefined;};}}
  it('matches concurrent out-of-order responses by request ID',async()=>{const transport=new Fake(),client=new RpcClient(transport);const a=client.call('a'),b=client.call('b');transport.listener!({protocolVersion:1,requestId:transport.sent[1].requestId,result:'b',error:null});transport.listener!({protocolVersion:1,requestId:transport.sent[0].requestId,result:'a',error:null});expect(await a).toBe('a');expect(await b).toBe('b');client.dispose();});
  it('cancels pending requests and ignores late responses',async()=>{const transport=new Fake(),client=new RpcClient(transport),abort=new AbortController();const request=client.call('a',{},abort.signal);abort.abort();await expect(request).rejects.toThrow('Aborted');transport.listener!({protocolVersion:1,requestId:transport.sent[0].requestId,result:'late',error:null});client.dispose();});
  it('rejects protocol mismatches and disconnects',async()=>{const transport=new Fake(),client=new RpcClient(transport);const a=client.call('a');transport.listener!({protocolVersion:2,requestId:transport.sent[0].requestId,result:'bad',error:null});await expect(a).rejects.toThrow('Protocol');const b=client.call('b');client.dispose();await expect(b).rejects.toThrow('disconnected');});
});

describe('Serialized autosave',()=>{
  it('never lets an older response replace a newer buffer; follows with latest revision',async()=>{
    const id=v7(),note:Note={header:{schemaVersion:1,id,date:'2026-10-31',title:'Test',tags:[],createdAt:'',updatedAt:''},body:'',sidecar:{schemaVersion:1,documentId:id,revision:1,contentHash:'hash1',blocks:[],selections:[]}};
    let complete!:(note:Note)=>void;const requests:SaveRequest[]=[];
    const session=new DocumentSession(note,async request=>{requests.push(request);if(requests.length===1)return new Promise(resolve=>{complete=resolve;});return {...note,body:request.body,sidecar:{...note.sidecar,revision:3,contentHash:'hash3'}};},()=>{});
    session.edit('first',[]);const saving=session.flush();session.edit('second',[]);complete({...note,body:'first',sidecar:{...note.sidecar,revision:2,contentHash:'hash2'}});await saving;
    expect(session.body).toBe('second');expect(requests[1].expectedRevision).toBe(2);expect(session.state).toBe('Saved');session.dispose();
  });
  it('retains unsaved content after storage failure',async()=>{const id=v7();const note:Note={header:{schemaVersion:1,id,date:'',title:'',tags:[],createdAt:'',updatedAt:''},body:'',sidecar:{schemaVersion:1,documentId:id,revision:1,contentHash:'h',blocks:[],selections:[]}};const session=new DocumentSession(note,async()=>{throw new Error('disk full');},()=>{});session.edit('retain me',[]);await expect(session.flush()).rejects.toThrow('disk full');expect(session.body).toBe('retain me');expect(session.dirty).toBe(true);expect(session.state).toBe('SaveError');session.dispose();});
});
