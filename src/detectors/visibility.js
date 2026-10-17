// Paint visibility, not accessibility-tree membership. No text is collected.
export function isPaintedElement(element){
 const rect=element.getBoundingClientRect();
 if(!element.getClientRects().length||rect.width<=0||rect.height<=0||getComputedStyle(element).visibility!=='visible')return false;
 for(let node=element;node;node=node.parentElement){
  const style=getComputedStyle(node);
  if(style.display==='none'||Number(style.opacity)===0||style.contentVisibility==='hidden')return false;
  if(node!==element){
   const bounds=node.getBoundingClientRect();
   const clipX=/^(hidden|clip|auto|scroll)$/.test(style.overflowX),clipY=/^(hidden|clip|auto|scroll)$/.test(style.overflowY);
   if(clipX&&node.clientWidth<=1||clipY&&node.clientHeight<=1)return false;
   // A declared inaccessible/collapsed subtree with no painted intersection is not visible clipping.
   // Keyboard reachability is audited separately; aria-hidden alone never hides painted content.
   if((node.hasAttribute('inert')||node.getAttribute('aria-hidden')==='true')&&((clipX&&(rect.right<=bounds.left||rect.left>=bounds.right))||(clipY&&(rect.bottom<=bounds.top||rect.top>=bounds.bottom))))return false;
  }
 }
 return true;
}

export function hasPaintedViewportIntersection(element){
 const r=element.getBoundingClientRect();let left=Math.max(0,r.left),right=Math.min(innerWidth,r.right),top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom);
 for(let p=element.parentElement;p;p=p.parentElement){const s=getComputedStyle(p),box=p.getBoundingClientRect();if(/^(hidden|clip|auto|scroll)$/.test(s.overflowX)){left=Math.max(left,box.left+p.clientLeft);right=Math.min(right,box.left+p.clientLeft+p.clientWidth);}if(/^(hidden|clip|auto|scroll)$/.test(s.overflowY)){top=Math.max(top,box.top+p.clientTop);bottom=Math.min(bottom,box.top+p.clientTop+p.clientHeight);}}
 return right>left&&bottom>top;
}

// Resolve scroll/clip chains nearest-first, clamping to inner scrollports before
// checking outer clips. A scroll region protects only its own overflowing axes.
export function measureOverflowChain(element,rect,selector){
 const presentation=(p,s,r)=>{
  const input=p.parentElement?.querySelector('textarea');if(!input||!isPaintedElement(input)||input.disabled||input.closest('[inert]')||p.tabIndex>=0||p.querySelector('button,a[href],input,select,textarea,[tabindex],[contenteditable="true"]'))return null;
  const tr=input.getBoundingClientRect();if(!tr.width||!tr.height||Math.abs(tr.top-r.top)>3||Math.abs(tr.height-r.height)>3)return null;
  const mirror=p.tagName==='PRE'&&s.pointerEvents==='none'&&Math.abs(tr.left-r.left)<=3&&Math.abs(tr.width-r.width)<=3;
  const gutter=p.childElementCount>0&&p.textContent.length<20000&&/^[\d\s]+$/.test(p.textContent)&&r.right<=tr.left+3&&tr.left-r.right<=4;
  return mirror||gutter?{kind:mirror?'paired-textarea-mirror':'paired-textarea-number-gutter',assessment:'probable',synchronization:'unsupported'}:null;
 };
 let effective={left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom},scroll=null,clip=null;
 for(let p=element.parentElement;p&&p!==document.documentElement;p=p.parentElement){
  const s=getComputedStyle(p),r=p.getBoundingClientRect(),box={left:r.left+p.clientLeft,top:r.top+p.clientTop};box.right=box.left+p.clientWidth;box.bottom=box.top+p.clientHeight;
  const hiddenX=/^(hidden|clip)$/.test(s.overflowX),hiddenY=/^(hidden|clip)$/.test(s.overflowY);
  if(!clip&&((hiddenX&&(effective.left<box.left-2||effective.right>box.right+2))||(hiddenY&&(effective.top<box.top-2||effective.bottom>box.bottom+2))))clip={selector:selector(p),overflowX:s.overflowX,overflowY:s.overflowY,rect:box,presentation:presentation(p,s,r)};
  const x=/^(auto|scroll)$/.test(s.overflowX)&&p.scrollWidth>p.clientWidth+2,y=/^(auto|scroll)$/.test(s.overflowY)&&p.scrollHeight>p.clientHeight+2;
  if(!scroll&&(x||y)){
   const horizontalOutside=rect.left<0||rect.right>innerWidth,verticalOutside=(getComputedStyle(element).position==='fixed')&&(rect.top<0||rect.bottom>innerHeight);
   scroll={selector:selector(p),axis:x&&y?'horizontal and vertical':x?'horizontal':'vertical',clientWidth:p.clientWidth,scrollWidth:p.scrollWidth,clientHeight:p.clientHeight,scrollHeight:p.scrollHeight,protectsOverflow:(!horizontalOutside||x&&box.left>=-2&&box.right<=innerWidth+2)&&(!verticalOutside||y&&box.top>=-2&&box.bottom<=innerHeight+2)};
  }
  if(x){effective.left=Math.max(effective.left,box.left);effective.right=Math.min(effective.right,box.right);}
  if(y){effective.top=Math.max(effective.top,box.top);effective.bottom=Math.min(effective.bottom,box.bottom);}
 }
 return {scrollAncestor:scroll,clipAncestor:clip};
}
