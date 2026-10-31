// SPDX-License-Identifier: AGPL-3.0-only
import { v7 } from 'uuid';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { Node } from '@milkdown/kit/prose/model';
import type { Block } from '../bridge/types';
import { SourceDocument } from '../markdown/source';

export interface LiveBlock { id: string; pos: number; node: Node; aliases: string[] }
export interface BlockState { live: LiveBlock[]; deleted: Block[] }
export const blockKey = new PluginKey<BlockState>('gitpad-block-identity');
const topLevel = (doc: Node) => { const nodes: {pos: number; node: Node}[] = []; doc.forEach((node, pos) => nodes.push({node, pos})); return nodes; };
export function identityPlugin(saved: Block[] = []) {
  return new Plugin<BlockState>({
    key: blockKey,
    state: {
      init: (_, state) => ({live: topLevel(state.doc).map((item, index) => ({...item, id: saved.filter(b => !b.deleted)[index]?.id ?? v7(), aliases: saved.filter(b => !b.deleted)[index]?.aliases ?? []})), deleted: saved.filter(b => b.deleted)}),
      apply: (transaction, before) => {
        if (!transaction.docChanged) return before;
        const nodes = topLevel(transaction.doc), used = new Set<string>(), assigned = new Map<number, LiveBlock>();
        for (const old of before.live) {
          const mapped = transaction.mapping.mapResult(old.pos, 1);
          const match = nodes.find(n => n.pos === mapped.pos && n.node.type === old.node.type);
          if (!mapped.deleted && match && !assigned.has(match.pos)) { assigned.set(match.pos, {...match, id: old.id, aliases: old.aliases}); used.add(old.id); }
        }
        // Moves reuse the original identity; copies leave the mapped original intact and get new IDs.
        for (const old of before.live.filter(b => !used.has(b.id))) {
          const matches = nodes.filter(n => !assigned.has(n.pos) && n.node.eq(old.node));
          if (matches.length === 1) { const match = matches[0]; assigned.set(match.pos, {...match, id: old.id, aliases: old.aliases}); used.add(old.id); }
        }
        const deleted = [...before.deleted];
        for (const old of before.live.filter(b => !used.has(b.id))) {
          deleted.push({id: old.id, kind: old.node.type.name, start: 0, end: 0, deleted: true, aliases: old.aliases});
          const pos = transaction.mapping.map(old.pos, -1);
          const survivor = [...assigned.values()].find(n => n.pos <= pos && pos <= n.pos + n.node.nodeSize);
          if (survivor) survivor.aliases = [...survivor.aliases, old.id];
        }
        return {live: nodes.map(n => assigned.get(n.pos) ?? {...n, id: v7(), aliases: []}), deleted};
      },
    },
  });
}
export function sourceBlocks(state: BlockState | undefined, body: string): Block[] {
  const ranges = new SourceDocument(body).ranges;
  return [...(state?.live ?? []).map((b, index) => ({id: b.id, kind: ranges[index]?.kind ?? b.node.type.name, start: ranges[index]?.start ?? 0, end: ranges[index]?.end ?? 0, deleted: false, aliases: b.aliases})), ...(state?.deleted ?? [])];
}
