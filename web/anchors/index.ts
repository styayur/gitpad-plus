// SPDX-License-Identifier: AGPL-3.0-only
import { v7, validate, version } from 'uuid';
import * as Y from 'yjs';
import type { Anchor } from '../bridge/types';

export function requireId(id: string): string { if (!validate(id) || version(id) !== 7) throw new Error('UUIDv7 required'); return id.toLowerCase(); }
export function parseLink(value: string) {
  const uri = new URL(value);
  if (uri.protocol !== 'gitpadplus:' || uri.hostname !== 'note' || uri.username || uri.password || uri.port || value.includes('#') || uri.pathname.split('/').length !== 2) throw new Error('Invalid note URI');
  const id = requireId(uri.pathname.slice(1));
  const entries = [...uri.searchParams];
  if (entries.length > 1 || entries.some(([key]) => key !== 'block' && key !== 'selection')) throw new Error('Invalid link target');
  return {id, block: entries[0]?.[0] === 'block' ? requireId(entries[0][1]) : undefined, selection: entries[0]?.[0] === 'selection' ? requireId(entries[0][1]) : undefined};
}
export function createAnchor(blockId: string, text: string, start: number, end: number): Anchor {
  requireId(blockId);
  const boundary=(offset:number)=>offset===0||offset===text.length||!(text.charCodeAt(offset-1)>=0xd800&&text.charCodeAt(offset-1)<=0xdbff&&text.charCodeAt(offset)>=0xdc00&&text.charCodeAt(offset)<=0xdfff);
  if (!Number.isInteger(start)||!Number.isInteger(end)||start < 0 || end <= start || end > text.length||!boundary(start)||!boundary(end)) throw new Error('Invalid selection');
  let prefixStart=Math.max(0,start-32),suffixEnd=Math.min(text.length,end+32);
  if(!boundary(prefixStart))prefixStart--;if(!boundary(suffixEnd))suffixEnd++;
  return {id: v7(), blockId, exact: text.slice(start, end), prefix: text.slice(prefixStart, start), suffix: text.slice(end, suffixEnd), start, end, normalizationVersion: 1};
}
export type Resolution = {state: 'resolved'; start: number; end: number} | {state: 'ambiguous'; candidates: number[]} | {state: 'missing'};
export function resolveAnchor(anchor: Anchor, text: string): Resolution {
  if (anchor.normalizationVersion !== 1 || !anchor.exact) return {state: 'missing'};
  const matches: number[] = [];
  let offset = text.indexOf(anchor.exact);
  while (offset >= 0) { matches.push(offset); offset = text.indexOf(anchor.exact, offset + 1); }
  const contextual = matches.filter(start => text.slice(Math.max(0, start - anchor.prefix.length), start) === anchor.prefix && text.slice(start + anchor.exact.length, start + anchor.exact.length + anchor.suffix.length) === anchor.suffix);
  // A lone quote in a different context may be a surviving duplicate after the
  // original selection was deleted. Uniqueness alone must not silently retarget it.
  if (!contextual.length && matches.length && (anchor.prefix || anchor.suffix)) return {state:'ambiguous',candidates:matches};
  const candidates = contextual.length ? contextual : matches;
  // Stored positions are hints, never sufficient to choose among duplicate quotations.
  if (candidates.length === 1) return {state: 'resolved', start: candidates[0], end: candidates[0] + anchor.exact.length};
  return candidates.length ? {state: 'ambiguous', candidates} : {state: 'missing'};
}
export function textFragment(anchor: Anchor) {
  // Percent-encode delimiters that encodeURIComponent deliberately leaves alone.
  const encode = (s: string) => encodeURIComponent(s).replace(/[-!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return '#:~:text=' + (anchor.prefix ? encode(anchor.prefix) + '-,' : '') + encode(anchor.exact) + (anchor.suffix ? ',-' + encode(anchor.suffix) : '');
}

/** Relative positions are scoped to one continuous Y.Doc. Never deserialize into a fresh session. */
export class SelectionSession {
  readonly doc = new Y.Doc();
  readonly text = this.doc.getText('body');
  private readonly token = v7();
  constructor(content: string) { this.text.insert(0, content); }
  relative(index: number) { return {session: this.token, position: Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(this.text, index))}; }
  resolve(value: ReturnType<SelectionSession['relative']>): number | null {
    if (value.session !== this.token) return null;
    return Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(value.position), this.doc)?.index ?? null;
  }
  update(next: string) {
    const previous = this.text.toString(); let start = 0;
    while (start < previous.length && start < next.length && previous[start] === next[start]) start++;
    let end = 0;
    while (end < previous.length - start && end < next.length - start && previous[previous.length - 1 - end] === next[next.length - 1 - end]) end++;
    this.doc.transact(() => { this.text.delete(start, previous.length - start - end); this.text.insert(start, next.slice(start, next.length - end)); });
  }
  dispose() { this.doc.destroy(); }
}

/** Session positions are never persisted or reconstructed from saved offsets. */
export class LiveAnchors {
  private blocks = new Map<string, SelectionSession>();
  private positions = new Map<string, {blockId:string; start:ReturnType<SelectionSession['relative']>; end:ReturnType<SelectionSession['relative']>}>();
  update(blockId:string,text:string) {
    const current=this.blocks.get(blockId);
    if(current)current.update(text);
  }
  track(anchor:Anchor,text:string) {
    if(!this.blocks.has(anchor.blockId))this.blocks.set(anchor.blockId,new SelectionSession(text));else this.update(anchor.blockId,text);const session=this.blocks.get(anchor.blockId)!;
    this.positions.set(anchor.id,{blockId:anchor.blockId,start:session.relative(anchor.start),end:session.relative(anchor.end)});
  }
  resolve(anchor:Anchor,text:string):Resolution {
    const live=this.positions.get(anchor.id),session=this.blocks.get(anchor.blockId);
    if(live&&session&&live.blockId===anchor.blockId){
      const start=session.resolve(live.start),end=session.resolve(live.end);
      if(start!==null&&end!==null&&end>start&&text.slice(start,end)===anchor.exact)return {state:'resolved',start,end};
    }
    return resolveAnchor(anchor,text);
  }
  dispose(){for(const session of this.blocks.values())session.dispose();this.blocks.clear();this.positions.clear();}
}
