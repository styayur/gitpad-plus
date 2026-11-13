// SPDX-License-Identifier: AGPL-3.0-only
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import remarkGfm from 'remark-gfm';
import remarkDirective from 'remark-directive';
import remarkFrontmatter from 'remark-frontmatter';
import remarkMath from 'remark-math';
import type { Root, RootContent } from 'mdast';

export const markdown = unified().use(remarkParse).use(remarkGfm).use(remarkDirective).use(remarkFrontmatter, ['yaml']).use(remarkMath).use(remarkStringify);
export interface SourceRange { start: number; end: number; kind: string }
// Milkdown serializes an intentional empty paragraph with this exact marker
// and parses it back as a paragraph, never as a rendered HTML element. Keep its
// source bytes and range; other HTML still takes the read-only path.
const emptyParagraph = (node: {type:string;value?:string}) => node.type==='html'&&node.value?.trim()==='<br />';
const emptyParagraphContainers=new Set(['root','blockquote','listItem','containerDirective']);
export class SourceDocument {
  readonly tree: Root;
  readonly ranges: SourceRange[];
  readonly blockRanges: SourceRange[];
  constructor(readonly raw: string) {
    this.tree = markdown.parse(raw);
    this.ranges = this.tree.children.map(n => ({start: n.position?.start.offset ?? 0, end: n.position?.end.offset ?? raw.length, kind: n.type}));
    this.blockRanges = [];
    const visit = (node: {type: string; value?: string; name?: string; ordered?: boolean; data?: {directiveLabel?: boolean}; position?: {start: {offset?: number}; end: {offset?: number}}; children?: unknown[]},tableHeader=false,parentType='') => {
      if (node.data?.directiveLabel) return;
      const image=node.type==='paragraph'&&node.children?.length===1&&['image','imageReference'].includes((node.children[0] as {type:string}).type);
      const names: Record<string,string> = {paragraph:image?'image-block':'paragraph',heading:'heading',blockquote:'blockquote',list:node.ordered?'ordered_list':'bullet_list',listItem:'list_item',code:'code_block',thematicBreak:'hr',table:'table',tableRow:tableHeader?'table_header_row':'table_row',tableCell:tableHeader?'table_header':'table_cell',containerDirective:node.name==='fold'?'gitpad_fold':'gitpad_unknown',leafDirective:'gitpad_unknown'};
      const kind=emptyParagraph(node)&&emptyParagraphContainers.has(parentType)?'paragraph':names[node.type];
      if (kind) this.blockRanges.push({kind,start:node.position?.start.offset??0,end:node.position?.end.offset??0});
      // Milkdown wraps each cell's inline content in a paragraph; mdast does not.
      if(node.type==='tableCell')this.blockRanges.push({kind:'paragraph',start:node.position?.start.offset??0,end:node.position?.end.offset??0});
      if(node.type==='table'){for(const [index,child] of (node.children??[]).entries())visit(child as Parameters<typeof visit>[0],index===0,node.type);return;}
      if (names[node.type]!=='gitpad_unknown') for (const child of node.children??[])visit(child as Parameters<typeof visit>[0],tableHeader,node.type);
    };
    visit(this.tree);
  }
  slice(index: number): string {
    const range = this.ranges[index];
    return range ? this.raw.slice(range.start, range.end) : '';
  }
  /** Only unchanged ASTs take the byte-preserving path. Changed nodes retain unknown AST structures. */
  serialize(tree: Root = this.tree): string { return tree === this.tree ? this.raw : markdown.stringify(tree); }
  replace(index: number, source: string): SourceDocument {
    const range = this.ranges[index];
    if (!range) throw new RangeError('Unknown source block');
    return new SourceDocument(this.raw.slice(0, range.start) + source + this.raw.slice(range.end));
  }
  unsupported(): RootContent[] {
    return this.tree.children.filter(n => (n.type === 'html'&&!emptyParagraph(n)) || n.type === 'yaml');
  }
}

/** Keeps untouched top-level source slices exact after an editor serialization. */
export function preserveSource(previous: string, serialized: string): string {
  if(previous===serialized)return previous;
  const before = new SourceDocument(previous), after = new SourceDocument(serialized);
  const semantic = (node: unknown): string => JSON.stringify(node, (key, value: unknown) => key === 'position' ? undefined : value);
  const originals=new Map<string,number[]>(),next=new Map<string,number>();
  before.tree.children.forEach((node,index)=>{const key=semantic(node),queue=originals.get(key)??[];queue.push(index);originals.set(key,queue);});
  const parts:string[]=[];let cursor=0;
  for(let index=0;index<after.tree.children.length;index++){
    const key=semantic(after.tree.children[index]),offset=next.get(key)??0,match=originals.get(key)?.[offset],range=after.ranges[index];
    parts.push(serialized.slice(cursor,range.start),match===undefined?serialized.slice(range.start,range.end):before.slice(match));
    if(match!==undefined)next.set(key,offset+1);
    cursor=range.end;
  }
  parts.push(serialized.slice(cursor));return parts.join('');
}
