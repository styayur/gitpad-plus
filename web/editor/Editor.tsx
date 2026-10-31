// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useRef, useState } from 'react';
import { Crepe } from '@milkdown/crepe';
import { editorViewCtx, commandsCtx, parserCtx } from '@milkdown/kit/core';
import { $prose } from '@milkdown/kit/utils';
import { toggleStrongCommand, toggleEmphasisCommand, wrapInBulletListCommand, blockquoteSchema, toggleLinkCommand, insertImageCommand } from '@milkdown/kit/preset/commonmark';
import { toggleStrikethroughCommand } from '@milkdown/kit/preset/gfm';
import { toggleMark, wrapIn } from '@milkdown/kit/prose/commands';
import { Plugin, TextSelection } from '@milkdown/kit/prose/state';
import { prosemirrorToYXmlFragment } from 'y-prosemirror';
import * as Y from 'yjs';
import { identityPlugin, blockKey, sourceBlocks } from './identity';
import { directives, directiveMark, foldNode, opaqueDirective, calloutBlockquote } from './extensions';
import { MarkdownPeek } from './peek';
import { SourceDocument, preserveSource } from '../markdown/source';
import { createAnchor, resolveAnchor, SelectionSession } from '../anchors';
import type { DocumentSession } from './session';
import type { Settings } from '../bridge/types';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';

export interface EditorHandle { command(name: string): void; selectionLink(): string | null; blockLink(): string | null; navigate(target: {block?: string; selection?: string}): string }
export function Editor({session, settings, handle, upload, imageUrl}: {session: DocumentSession; settings: Settings; handle: (value: EditorHandle | null) => void; upload: (file: File) => Promise<string>; imageUrl: (path: string) => Promise<string>}) {
  const root = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false), [failure, setFailure] = useState('');
  const [, redraw] = useState(0);
  const peek = useRef<MarkdownPeek>(null), peekIndex = useRef(0);
  const [peekText, setPeekText] = useState('');
  const crepeRef = useRef<Crepe | null>(null);
  useEffect(() => {
    let alive = true;
    const ySession = new SelectionSession(session.body);
    const yTree = new Y.Doc();
    peek.current = new MarkdownPeek(() => { if (alive) redraw(n => n + 1); });
    const original = new SourceDocument(session.body);
    if (original.unsupported().length) {
      setFailure('This document contains HTML/frontmatter inside its body. Preserved read-only; export or edit the Markdown externally.');
      return () => { alive=false; peek.current?.dispose(); ySession.dispose(); yTree.destroy(); };
    }
    // Crepe's stable LaTeX feature requires its optional code-block component.
    // ProseMirror remains the document editor; CodeMirror is confined to code blocks.
    const editor = new Crepe({root: root.current, defaultValue: session.body, features: {[Crepe.Feature.CodeMirror]:true, [Crepe.Feature.AI]:false, [Crepe.Feature.Toolbar]:false, [Crepe.Feature.TopBar]:false},
      featureConfigs: {[Crepe.Feature.ImageBlock]:{onUpload:upload, inlineOnUpload:upload, blockOnUpload:upload, proxyDomURL:imageUrl}},
    });
    crepeRef.current = editor;
    void editor.editor.remove(blockquoteSchema);
    editor.editor.use(calloutBlockquote).use(directives).use(directiveMark).use(foldNode).use(opaqueDirective).use($prose(() => identityPlugin(session.blocks)));
    let initialized = false;
    const capture = (value: string) => {
      if (!alive || !initialized) return;
      const body = preserveSource(session.body, value);
      editor.editor.action(ctx => {
        const view = ctx.get(editorViewCtx);
        // A ProseMirror/Yjs projection is maintained in the same session. W3C remains persistent authority.
        prosemirrorToYXmlFragment(view.state.doc, yTree.getXmlFragment('prosemirror'));
        ySession.update(view.state.doc.textContent);
        if (body !== session.body) session.edit(body, sourceBlocks(blockKey.getState(view.state), body));
      });
    };
    editor.editor.use($prose(() => new Plugin({view: () => ({update: (view, previous) => {
      if (!view.state.doc.eq(previous.doc)) capture(editor.getMarkdown());
    }})})));
    const onDoubleClick = (event: MouseEvent) => {
      if (!settings.markdownPeek || settings.nativeWordSelection) return;
      editor.editor.action(ctx => {
        const view = ctx.get(editorViewCtx), position = view.posAtCoords({left:event.clientX, top:event.clientY})?.pos;
        if (position == null) return;
        let index = 0; view.state.doc.forEach((node, offset, n) => { if (offset <= position && position <= offset + node.nodeSize) index = n; });
        peekIndex.current = index;
        const text = new SourceDocument(session.body).slice(index); setPeekText(text); peek.current?.show(text);
      });
    };
    const onClick = (event: MouseEvent) => {
      const summary=(event.target as HTMLElement).closest('summary');
      if(summary?.parentElement?.matches('details[data-gitpad-fold]')){
        event.preventDefault();editor.editor.action(ctx=>{const view=ctx.get(editorViewCtx);const transaction=view.state.tr;view.state.doc.descendants((node,pos)=>{if(node.type.name==='gitpad_fold'&&view.nodeDOM(pos)===summary.parentElement)transaction.setNodeMarkup(pos,undefined,{...node.attrs,closed:!node.attrs.closed});});if(transaction.docChanged)view.dispatch(transaction);});
      }
      const anchor = (event.target as HTMLElement).closest('a');
      if (anchor) { event.preventDefault(); if (anchor.getAttribute('href')?.startsWith('gitpadplus:')) window.dispatchEvent(new CustomEvent('gitpad-navigate', {detail: anchor.getAttribute('href')})); }
    };
    root.current?.addEventListener('dblclick', onDoubleClick); root.current?.addEventListener('click', onClick);
    void editor.create().then(() => {
      if (!alive) { void editor.destroy(); return; }
      initialized = true; setReady(true);
      handle({
        navigate(target) { return editor.editor.action(ctx=>{
          const view=ctx.get(editorViewCtx),live=blockKey.getState(view.state)?.live??[];
          const anchor=target.selection?session.selections.find(a=>a.id===target.selection):undefined;
          const blockId=anchor?.blockId??target.block;
          const block=live.find(b=>b.id===blockId||b.aliases.includes(blockId??''));
          if(!block)return 'Link target missing or deleted; repair required.';
          if(anchor){const result=resolveAnchor(anchor,block.node.textContent);if(result.state!=='resolved')return `Selection ${result.state}; repair required.`;view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,block.pos+1+result.start,block.pos+1+result.end)).scrollIntoView());}
          else view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(Math.min(block.pos+1,view.state.doc.content.size)))).scrollIntoView());
          view.focus();return anchor?'Selection located.':'Block located.';
        }); },
        command(name) {
          if (name === 'peek') { editor.editor.action(ctx => { const view = ctx.get(editorViewCtx); const blocks = blockKey.getState(view.state)?.live ?? []; peekIndex.current = Math.max(0, blocks.findIndex(b => b.pos <= view.state.selection.from && view.state.selection.from <= b.pos+b.node.nodeSize)); const text = new SourceDocument(session.body).slice(peekIndex.current); setPeekText(text); peek.current?.show(text); }); return; }
          if (name === 'expandAll' || name === 'collapseAll') { editor.editor.action(ctx=>{const view=ctx.get(editorViewCtx),transaction=view.state.tr;view.state.doc.descendants((node,pos)=>{if(node.type.name==='gitpad_fold')transaction.setNodeMarkup(pos,undefined,{...node.attrs,closed:name==='collapseAll'});});view.dispatch(transaction);}); return; }
          editor.editor.action(ctx => {
            const commands = ctx.get(commandsCtx), view = ctx.get(editorViewCtx); view.focus();
            if (name === 'bold') commands.call(toggleStrongCommand.key);
            else if (name === 'italic') commands.call(toggleEmphasisCommand.key);
            else if (name === 'bullet') commands.call(wrapInBulletListCommand.key);
            else if (name === 'strike') commands.call(toggleStrikethroughCommand.key);
            else if (name === 'link') { const href = window.prompt('Link URL (https:// or gitpadplus://)'); if (href && /^(https?:\/\/|gitpadplus:\/\/)/.test(href)) commands.call(toggleLinkCommand.key, {href}); }
            else if (name === 'fold') wrapIn(foldNode.type(ctx), {title:'Details', closed:false})(view.state, view.dispatch);
            else if (name === 'image') { void (async () => { const input = document.createElement('input'); input.type='file'; input.accept='image/png,image/jpeg,image/gif'; input.onchange = () => { const file = input.files?.[0]; if (file) void upload(file).then(src => editor.editor.action(next => next.get(commandsCtx).call(insertImageCommand.key, {src, alt:file.name}))).catch(e => setFailure(String(e))); }; input.click(); })(); }
            else if (['underline','mark','color'].includes(name)) { const color = name === 'color' ? window.prompt('Hex font color', '#C24B52') : 'yellow'; if (color) toggleMark(directiveMark.type(ctx), {name, color})(view.state, view.dispatch); }
          });
        },
        selectionLink() {
          return editor.editor.action(ctx => {
            const view = ctx.get(editorViewCtx), selection = view.state.selection;
            const block = blockKey.getState(view.state)?.live.find(b => b.pos <= selection.from && selection.to <= b.pos+b.node.nodeSize);
            if (!block || selection.empty || !block.node.isTextblock) return null;
            const anchor = createAnchor(block.id, block.node.textContent, selection.from-block.pos-1, selection.to-block.pos-1);
            session.blocks = sourceBlocks(blockKey.getState(view.state), session.body);
            session.addSelection(anchor);
            return `gitpadplus://note/${session.note.header.id}?selection=${anchor.id}`;
          });
        },
        blockLink() { return editor.editor.action(ctx => { const view=ctx.get(editorViewCtx); const block=blockKey.getState(view.state)?.live.find(b => b.pos<=view.state.selection.from && view.state.selection.from <= b.pos+b.node.nodeSize); if(!block)return null; session.edit(session.body, sourceBlocks(blockKey.getState(view.state),session.body)); return `gitpadplus://note/${session.note.header.id}?block=${block.id}`; }); },
      });
    }).catch(e => { if (alive) setFailure(String(e)); });
    return () => { alive = false; initialized = false; peek.current?.dispose(); handle(null); root.current?.removeEventListener('dblclick',onDoubleClick); root.current?.removeEventListener('click',onClick); void editor.destroy(); ySession.dispose(); yTree.destroy(); };
  // A document instance owns one editor/undo history. Settings changes reopen only after flush in the parent.
  }, [session]);
  return <section className="editor-pane" aria-label="Markdown editor">
    {!ready && !failure && <p role="status">Loading editor…</p>}
    {failure && <p role="alert">{failure}</p>}
    <div ref={root} data-testid="milkdown" />
    {peek.current?.source != null && <div className="peek" role="dialog" aria-label="Markdown source peek"><label>Original Markdown source<textarea aria-label="Original Markdown source" value={peekText} onChange={e => { peek.current?.edit(); setPeekText(e.target.value); }} /></label>
      {peek.current.editing && <button onClick={() => {
        const active=crepeRef.current;if(!active)return;
        active.editor.action(ctx=>{const view=ctx.get(editorViewCtx),block=blockKey.getState(view.state)?.live[peekIndex.current];if(!block)return;
          const updated=new SourceDocument(session.body).replace(peekIndex.current,peekText).raw,replacement=ctx.get(parserCtx)(peekText);
          // One ordinary editor transaction retains the existing undo history.
          session.body=updated;view.dispatch(view.state.tr.replaceWith(block.pos,block.pos+block.node.nodeSize,replacement.content));
          session.edit(updated,sourceBlocks(blockKey.getState(view.state),updated));view.focus();
        });peek.current?.close();
      }}>Apply source edit</button>}
      <button onClick={() => peek.current?.close()}>Close peek</button></div>}
  </section>;
}
