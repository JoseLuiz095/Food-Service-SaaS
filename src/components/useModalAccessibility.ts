import { useEffect, useRef, type RefObject } from 'react';

/** Foco contido, fundo inerte, Escape seguro e retorno ao acionador. */
export function useModalAccessibility(open: boolean, ref: RefObject<HTMLElement|null>, close: ()=>void, canClose = true) {
  const options=useRef({close,canClose}); options.current={close,canClose};
  useEffect(()=>{
    const dialog=ref.current;
    if(!open||!dialog)return;
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const changed:Array<{node:HTMLElement;inert:boolean}>=[];
    let branch:HTMLElement=dialog;
    while(branch.parentElement){
      for(const node of Array.from(branch.parentElement.children))if(node!==branch&&node instanceof HTMLElement){changed.push({node,inert:node.inert});node.inert=true;}
      if(branch.parentElement===document.body)break;
      branch=branch.parentElement;
    }
    const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
    const controls=()=>Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(node=>node.getClientRects().length>0);
    (controls()[0]||dialog).focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(options.current.canClose)options.current.close();}
      if(event.key==='Tab'){
        const nodes=controls();const first=nodes[0],last=nodes[nodes.length-1];
        if(!first){event.preventDefault();dialog.focus();return;}
        if(!dialog.contains(document.activeElement)){event.preventDefault();first.focus();}
        else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    };
    document.addEventListener('keydown',onKey,true);
    return()=>{document.removeEventListener('keydown',onKey,true);for(const item of changed)item.node.inert=item.inert;document.body.style.overflow=oldOverflow;if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[open,ref]);
}
