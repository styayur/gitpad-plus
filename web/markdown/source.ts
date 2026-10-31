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
export class SourceDocument {
  readonly tree: Root;
  readonly ranges: SourceRange[];
  constructor(readonly raw: string) {
    this.tree = markdown.parse(raw);
    this.ranges = this.tree.children.map(n => ({start: n.position?.start.offset ?? 0, end: n.position?.end.offset ?? raw.length, kind: n.type}));
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
    return this.tree.children.filter(n => n.type === 'html' || n.type === 'yaml');
  }
}

/** Keeps untouched top-level source slices exact after an editor serialization. */
export function preserveSource(previous: string, serialized: string): string {
  const before = new SourceDocument(previous), after = new SourceDocument(serialized);
  const semantic = (node: unknown): string => JSON.stringify(node, (key, value: unknown) => key === 'position' ? undefined : value);
  const used = new Set<number>();
  let result = serialized;
  for (let index = after.tree.children.length - 1; index >= 0; index--) {
    const key = semantic(after.tree.children[index]);
    const match = before.tree.children.findIndex((n, i) => !used.has(i) && semantic(n) === key);
    if (match >= 0) {
      used.add(match);
      const range = after.ranges[index];
      result = result.slice(0, range.start) + before.slice(match) + result.slice(range.end);
    }
  }
  return result;
}
