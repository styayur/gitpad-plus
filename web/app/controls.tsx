// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useRef, type ReactNode } from 'react';

const paths: Record<string, ReactNode> = {
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/></>,
  settings: <><path d="m9 3-.7 2.4-2.4 1L3.7 6l-2 3.5 1.7 1.8v2.8l-1.7 1.8 2 3.5 2.2-.4 2.4 1L9 22h4l.7-2.4 2.4-1 2.2.4 2-3.5-1.7-1.8v-2.8l1.7-1.8-2-3.5-2.2.4-2.4-1L13 3Z"/><circle cx="11" cy="12.5" r="3"/></>,
  recovery: <><path d="M3 10a9 9 0 1 1 1 8M3 4v6h6m3-3v5l3 2"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 3-3 6 6"/></>,
  save: <><path d="M5 3h12l4 4v14H3V3h2Zm2 0v7h10V3M7 21v-7h10v7"/></>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  link: <><path d="m9 15 6-6m-7 3-2 2a4 4 0 0 0 6 6l3-3m-6-10 3-3a4 4 0 0 1 6 6l-2 2"/></>,
  source: <path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>,
  bullet: <><path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r=".6"/><circle cx="4" cy="12" r=".6"/><circle cx="4" cy="18" r=".6"/></>,
  fold: <><path d="M3 5h18M3 19h18m5-10 4 4 4-4"/></>,
  expandAll: <path d="M4 3h16M4 21h16m-12-11 4-4 4 4m-8 4 4 4 4-4"/>,
  collapseAll: <path d="M4 3h16M4 21h16M8 6l4 4 4-4m-8 12 4-4 4 4"/>,
  mark: <><path d="m4 14 9-9 6 6-9 9H4v-6Zm3-3 6 6M3 22h10"/></>,
};
export function Icon({ name }: { name: string }) {
  return <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]??paths.more}</svg>;
}

// Native HTML owns modal focus, inertness and Escape. Nested confirmations stay
// above settings; closing one returns focus to its invoking control.
export function Modal({ label, onClose, alert=false, children }: {label:string;onClose:()=>void;alert?:boolean;children:ReactNode}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const node=dialog.current!,trigger=document.activeElement as HTMLElement|null;node.showModal();return()=>{node.close();if(trigger?.isConnected)trigger.focus();};},[]);
  return <dialog ref={dialog} className="modal" role={alert?'alertdialog':'dialog'} aria-label={label} onCancel={event=>{event.preventDefault();onClose();}} onKeyDown={event=>{
    if(event.key!=='Tab')return;
    const controls=[...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,a[href],[tabindex="0"]')].filter(node=>node.checkVisibility());
    const edge=event.shiftKey?controls[0]:controls.at(-1);
    if(document.activeElement===edge){event.preventDefault();(event.shiftKey?controls.at(-1):controls[0])?.focus();}
  }}><section>{children}</section></dialog>;
}

export function NoteActions({children}:{children:ReactNode}) {
  return <details className="note-actions" onClick={event=>{
    if((event.target as HTMLElement).closest('button'))event.currentTarget.open=false;
  }} onKeyDown={event=>{if(event.key==='Escape'){event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus();}}}>
    <summary aria-label="Note actions" title="Note actions"><Icon name="more"/></summary>
    <div className="action-menu">{children}</div>
  </details>;
}

export function CommandLabel({id,title}:{id:string;title:string}) {
  const mark:Record<string,string>={bold:'B',italic:'I',underline:'U',strike:'S',color:'A'};
  return mark[id]?<span aria-hidden="true" className={'command-mark command-'+id}>{mark[id]}</span>:<><Icon name={id in paths?id:'more'}/><span className="command-caption">{title}</span></>;
}
