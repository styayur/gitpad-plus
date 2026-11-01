// SPDX-License-Identifier: AGPL-3.0-only
import { v7 } from 'uuid';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { Step, StepMap, StepResult, type Mappable } from '@milkdown/kit/prose/transform';
import type { Node } from '@milkdown/kit/prose/model';
import type { Block } from '../bridge/types';
import { SourceDocument } from '../markdown/source';

export interface LiveBlock { id: string; pos: number; node: Node; aliases: string[]; path: number[] }
export interface BlockState { live: LiveBlock[]; deleted: Block[] }
export const blockKey = new PluginKey<BlockState>('gitpad-block-identity');
type StoredState = {live: {id:string;pos:number;aliases:string[];kind:string}[];deleted:Block[]};
const snapshot=(state:BlockState):StoredState=>({live:state.live.map(b=>({id:b.id,pos:b.pos,aliases:[...b.aliases],kind:b.node.type.name})),deleted:state.deleted});
// Store identity changes in the same ProseMirror history event as content.
// Undo inverses these steps; no content-equality guess or separate undo cache.
class IdentityStep extends Step {
  constructor(readonly before:StoredState,readonly after:StoredState){super();}
  apply(doc:Node){return StepResult.ok(doc);}
  invert(){return new IdentityStep(this.after,this.before);}
  getMap(){return StepMap.empty;}
  map(mapping:Mappable){
    const mapped=(state:StoredState):StoredState=>({...state,live:state.live.flatMap(b=>{const next=mapping.mapResult(b.pos,1);return next.deletedAcross?[]:[{...b,pos:next.pos}];})});
    return new IdentityStep(mapped(this.before),mapped(this.after));
  }
  toJSON(){return {stepType:'gitpadIdentity',before:this.before,after:this.after};}
  static fromJSON(_schema:unknown,json:{before:StoredState;after:StoredState}){return new IdentityStep(json.before,json.after);}
}
Step.jsonID('gitpadIdentity',IdentityStep);
function blocks(doc: Node) {
  const result: Omit<LiveBlock, 'id' | 'aliases'>[] = [];
  const visit = (parent: Node, offset: number, path: number[]) => parent.forEach((node, pos, index) => {
    const next = [...path, index], absolute = offset + pos;
    if (node.isBlock) result.push({node, pos: absolute, path: next});
    if (!node.isLeaf) visit(node, absolute + 1, next);
  });
  visit(doc, 0, []);
  return result;
}
export function identityPlugin(saved: Block[] = []) {
  return new Plugin<BlockState>({
    key: blockKey,
    appendTransaction(transactions,before,after){
      if(before.doc.eq(after.doc)||transactions.some(t=>t.steps.some(step=>step instanceof IdentityStep)))return null;
      const previous=blockKey.getState(before),next=blockKey.getState(after);
      return previous&&next?after.tr.step(new IdentityStep(snapshot(previous),snapshot(next))):null;
    },
    state: {
      init: (_, state) => {
        const active = saved.filter(b => !b.deleted), legacy = active.every(b => !b.path);
        const byPath=new Map(active.filter(b=>b.path).map(b=>[b.path!.join('.'),b]));
        let top = 0;
        return {live: blocks(state.doc).map(item => {
          const previous = legacy ? (item.path.length === 1 ? active[top++] : undefined) : byPath.get(item.path.join('.'));
          return {...item, id: previous?.id ?? v7(), aliases: [...previous?.aliases ?? []]};
        }), deleted: saved.filter(b => b.deleted)};
      },
      apply: (transaction, before) => {
        if(transaction.getMeta(blockKey)==='restoreSavedTail'){
          const byPath=new Map(saved.filter(b=>!b.deleted&&b.path).map(b=>[b.path!.join('.'),b]));
          const current=new Map(before.live.map(b=>[b.pos,b]));
          return {live:blocks(transaction.doc).map(node=>{
            const candidate=byPath.get(node.path.join('.')),previous=candidate?.kind===node.node.type.name?candidate:undefined,existing=current.get(node.pos);
            return {...node,id:previous?.id??existing?.id??v7(),aliases:[...previous?.aliases??existing?.aliases??[]]};
          }),deleted:before.deleted};
        }
        if (!transaction.docChanged) return before;
        const nodes = blocks(transaction.doc), used = new Set<string>(), assigned = new Map<number, LiveBlock>();
        const byPosition=new Map(nodes.map(node=>[node.pos,node]));
        const identity=[...transaction.steps].reverse().find(step=>step instanceof IdentityStep);
        if(identity instanceof IdentityStep){
          const restored=new Map(identity.after.live.map(b=>[b.pos,b])),retained=new Map(before.live.map(b=>[transaction.mapping.map(b.pos,1),b]));
          return {live:nodes.map(node=>{const saved=restored.get(node.pos),previous=retained.get(node.pos);return {...node,id:(saved?.kind===node.node.type.name?saved.id:undefined)??previous?.id??v7(),aliases:[...saved?.aliases??previous?.aliases??[]]};}),deleted:identity.after.deleted};
        }
        for (const old of before.live) {
          const mapped = transaction.mapping.mapResult(old.pos, 1);
          const match = byPosition.get(mapped.pos);
          if (!mapped.deleted && match && !assigned.has(match.pos)) { assigned.set(match.pos, {...match, id: old.id, aliases: [...old.aliases]}); used.add(old.id); }
        }
        // Moves reuse the original identity; copies leave the mapped original intact and get new IDs.
        for (const old of before.live.filter(b => !used.has(b.id))) {
          const matches = nodes.filter(n => !assigned.has(n.pos) && n.node.eq(old.node));
          if (matches.length === 1) { const match = matches[0]; assigned.set(match.pos, {...match, id: old.id, aliases: [...old.aliases]}); used.add(old.id); }
        }
        // Replacing/reformatting one block retains its primary identity. A merge's
        // position is already assigned, so the secondary ID still becomes a tombstone.
        for (const old of before.live.filter(b => !used.has(b.id))) {
          const pos=transaction.mapping.map(old.pos,-1),match=assigned.has(pos)?undefined:byPosition.get(pos);
          if(match&&!transaction.mapping.mapResult(old.pos,1).deletedAcross){assigned.set(match.pos,{...match,id:old.id,aliases:[...old.aliases]});used.add(old.id);}
        }
        const deleted = [...before.deleted];
        for (const old of before.live.filter(b => !used.has(b.id))) {
          if(!deleted.some(b=>b.id===old.id))deleted.push({id: old.id, kind: old.node.type.name, start: 0, end: 0, deleted: true, aliases: old.aliases, path:old.path});
          const pos = transaction.mapping.map(old.pos, -1);
          const survivor = [...assigned.values()].find(n => n.node.isTextblock && n.pos <= pos && pos <= n.pos + n.node.nodeSize);
          if (survivor) survivor.aliases = [...survivor.aliases, old.id];
        }
        return {live: nodes.map(n => assigned.get(n.pos) ?? {...n, id: v7(), aliases: []}), deleted};
      },
    },
  });
}
export function sourceBlocks(state: BlockState | undefined, body: string): Block[] {
  const ranges = new SourceDocument(body).blockRanges,byKind=new Map<string,typeof ranges>(),cursor=new Map<string,number>();
  for(const range of ranges){const list=byKind.get(range.kind)??[];list.push(range);byKind.set(range.kind,list);}
  return [...(state?.live ?? []).map(b => {
    const kind=b.node.type.name,index=cursor.get(kind)??0,range=byKind.get(kind)?.[index];cursor.set(kind,index+1);
    return {id:b.id,kind,start:range?.start??body.length,end:range?.end??body.length,deleted:false,aliases:b.aliases,path:b.path};
  }), ...(state?.deleted ?? [])];
}
