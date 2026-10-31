// SPDX-License-Identifier: AGPL-3.0-only
import { $nodeSchema, $markSchema, $remark } from '@milkdown/kit/utils';
import remarkDirective from 'remark-directive';
import { blockquoteSchema } from '@milkdown/kit/preset/commonmark';

export const directives = $remark('gitpad-directives', () => remarkDirective);
const safeColor = (value: unknown) => typeof value === 'string' && /^(#[0-9a-f]{3,8}|yellow|pink|green|blue|orange)$/i.test(value) ? value : '#fff29a';
export const directiveMark = $markSchema('gitpad_format', () => ({
  attrs: {name: {default: 'underline'}, color: {default: 'yellow'}},
  parseDOM: [{tag: 'span[data-gitpad-format]', getAttrs: element => ({name: element.getAttribute('data-gitpad-format'), color: safeColor(element.getAttribute('data-color'))})}],
  toDOM: mark => ['span', {'data-gitpad-format': mark.attrs.name, 'data-color': safeColor(mark.attrs.color), style: mark.attrs.name === 'underline' ? 'text-decoration:underline' : mark.attrs.name === 'color' ? `color:${safeColor(mark.attrs.color)}` : `background-color:${safeColor(mark.attrs.color)}`}, 0],
  parseMarkdown: {
    match: node => node.type === 'textDirective' && ['underline','mark','color'].includes(String(node.name)),
    runner: (state, node, type) => {
      const attributes = node.attributes as Record<string, string> | undefined;
      state.openMark(type, {name: node.name, color: safeColor(attributes?.color ?? attributes?.value)}).next(node.children).closeMark(type);
    },
  },
  toMarkdown: {match: mark => mark.type.name === 'gitpad_format', runner: (state, mark) => { state.withMark(mark, 'textDirective', undefined, {name: String(mark.attrs.name), attributes: mark.attrs.name === 'underline' ? {} : {[mark.attrs.name === 'color' ? 'value' : 'color']: safeColor(mark.attrs.color)}}); }},
}));

export const foldNode = $nodeSchema('gitpad_fold', () => ({
  content: 'block+', group: 'block', defining: true,
  attrs: {title: {default: 'Details'}, closed: {default: false}},
  parseDOM: [{tag: 'details[data-gitpad-fold]', contentElement: '[data-fold-body]', getAttrs: element => ({title: element.querySelector('summary')?.textContent ?? 'Details', closed: !element.hasAttribute('open')})}],
  toDOM: node => ['details', {'data-gitpad-fold': '', ...(node.attrs.closed ? {} : {open: 'open'})}, ['summary', {contenteditable: 'false'}, String(node.attrs.title)], ['div', {'data-fold-body': ''}, 0]],
  parseMarkdown: {
    match: node => node.type === 'containerDirective' && node.name === 'fold',
    runner: (state, node, type) => {
      const children = node.children ?? [];
      const label = (children[0]?.data as {directiveLabel?: boolean} | undefined)?.directiveLabel ? children[0] : undefined;
      const attrs = node.attributes as Record<string,string> | undefined;
      const title = label?.children?.map(n => n.value ?? '').join('') ?? 'Details';
      state.openNode(type, {title, closed: attrs?.default === 'closed'}).next(label ? children.slice(1) : children).closeNode();
    },
  },
  toMarkdown: {match: node => node.type.name === 'gitpad_fold', runner: (state, node) => {
    state.openNode('containerDirective', undefined, {name: 'fold', attributes: {default: node.attrs.closed ? 'closed' : 'open'}});
    state.addNode('paragraph', [{type:'text', value:String(node.attrs.title)}], undefined, {data:{directiveLabel:true}});
    state.next(node.content).closeNode();
  }},
}));

/** Unsupported directives are an opaque AST payload, never silently discarded. */
export const opaqueDirective = $nodeSchema('gitpad_unknown', () => ({
  group: 'block', atom: true, selectable: true,
  attrs: {ast: {default: '{}'}},
  parseDOM: [{tag: 'pre[data-gitpad-unknown]', getAttrs: element => ({ast: element.getAttribute('data-gitpad-unknown') ?? '{}'})}],
  toDOM: node => ['pre', {'data-gitpad-unknown': String(node.attrs.ast), contenteditable:'false', 'aria-label':'Preserved unsupported directive'}, 'Preserved extension: ' + String(JSON.parse(String(node.attrs.ast)).name)],
  parseMarkdown: {match: node => ['containerDirective','leafDirective','textDirective'].includes(node.type) && !(node.type === 'containerDirective' && node.name === 'fold') && !(node.type === 'textDirective' && ['underline','mark','color'].includes(String(node.name))), runner: (state, node, type) => { state.addNode(type, {ast: JSON.stringify(node)}); }},
  toMarkdown: {match: node => node.type.name === 'gitpad_unknown', runner: (state, node) => { const ast = JSON.parse(String(node.attrs.ast)); state.addNode(ast.type, ast.children, ast.value, {...ast, children: undefined}); }},
}));

export const calloutBlockquote = blockquoteSchema.extendSchema(previous => ctx => ({...previous(ctx),
  toDOM: node => {
    const callout = /^\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]/i.exec(node.textContent);
    return ['blockquote', callout ? {'data-callout':callout[1].toLowerCase()} : {}, 0];
  },
}));
