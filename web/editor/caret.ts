// SPDX-License-Identifier: AGPL-3.0-only
import {Plugin} from '@milkdown/kit/prose/state';

// Native paste can update Android's selection without scrolling nested editors.
// Scroll only the focused, collapsed caret after layout; never change selection,
// document content, undo history or an unfocused pane's reading position.
export function caretVisibilityPlugin(){
  return new Plugin({view:()=>{
    let frame=0;
    return {
      update(view,previous){
        if(!view.hasFocus()||!view.state.selection.empty||view.state.doc.eq(previous.doc)&&view.state.selection.eq(previous.selection))return;
        cancelAnimationFrame(frame);
        frame=requestAnimationFrame(()=>{
          if(!view.hasFocus()||!view.state.selection.empty||!view.dom.isConnected)return;
          for(let parent=view.dom.parentElement;parent;parent=parent.parentElement){
            if(!/^(auto|scroll)$/.test(getComputedStyle(parent).overflowY)||parent.scrollHeight<=parent.clientHeight)continue;
            const bounds=parent.getBoundingClientRect(),caret=view.coordsAtPos(view.state.selection.head);
            const top=bounds.top+12,bottom=bounds.bottom-12;
            if(caret.bottom>bottom)parent.scrollTop+=caret.bottom-bottom;
            else if(caret.top<top)parent.scrollTop-=top-caret.top;
          }
        });
      },
      destroy(){cancelAnimationFrame(frame);},
    };
  }});
}
