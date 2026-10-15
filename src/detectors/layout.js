import {createHash} from 'node:crypto';

export const LAYOUT_CATEGORY=Object.freeze({
 DOCUMENT_OVERFLOW:'DOCUMENT_OVERFLOW',
 ELEMENT_OVERFLOW:'ELEMENT_OVERFLOW',
 CONTENT_CLIPPED:'CONTENT_CLIPPED',
 INTERACTIVE_ELEMENT_CLIPPED:'INTERACTIVE_ELEMENT_CLIPPED',
 INTENTIONAL_SCROLL_REGION:'INTENTIONAL_SCROLL_REGION'
});

const LEGACY_KIND={
 [LAYOUT_CATEGORY.DOCUMENT_OVERFLOW]:'horizontal-document-overflow',
 [LAYOUT_CATEGORY.ELEMENT_OVERFLOW]:'element-overflow',
 [LAYOUT_CATEGORY.CONTENT_CLIPPED]:'content-clipped',
 [LAYOUT_CATEGORY.INTERACTIVE_ELEMENT_CLIPPED]:'interactive-element-clipped',
 [LAYOUT_CATEGORY.INTENTIONAL_SCROLL_REGION]:'intentional-scroll-region'
};

const roundRect=rect=>rect?Object.fromEntries(['left','top','right','bottom','width','height'].map(key=>[key,Math.round(rect[key]??0)])):null;

function finding({category,severity,confidence,selector,detail,evidence,explanation,suggestion,diagnostic=false}){
 return {kind:LEGACY_KIND[category],category,severity,confidence,selector,detail,evidence,explanation,suggestion,diagnostic};
}

export function classifyDocumentLayout({viewportWidth,documentWidth,tolerance=2}={}){
 const overflow=Math.max(0,(documentWidth||0)-(viewportWidth||0));
 if(overflow<=tolerance)return [];
 return [finding({category:LAYOUT_CATEGORY.DOCUMENT_OVERFLOW,severity:'high',confidence:'high',selector:'html',detail:`scrollWidth=${Math.round(documentWidth)} viewport=${Math.round(viewportWidth)}`,evidence:{viewportWidth:Math.round(viewportWidth),documentWidth:Math.round(documentWidth),overflowPx:Math.round(overflow)},explanation:'The root document is wider than the visible viewport.',suggestion:'Inspect wide descendants and flex/grid minimum sizing; keep intentional horizontal scrolling inside a bounded container.'})];
}

export function classifyElementLayout(snapshot={}){
 if(snapshot.inactive||snapshot.decorative)return [];
 const evidence={rect:roundRect(snapshot.rect),viewport:snapshot.viewport,overflowPx:snapshot.overflowPx,position:snapshot.position,transform:snapshot.transform,direction:snapshot.direction};
 if(snapshot.scrollAncestor){
  evidence.scrollingAncestor=snapshot.scrollAncestor;
  return [finding({category:LAYOUT_CATEGORY.INTENTIONAL_SCROLL_REGION,severity:'info',confidence:'high',selector:snapshot.scrollAncestor.selector||snapshot.selector,detail:`${snapshot.scrollAncestor.axis||'content'} scrolling: client=${snapshot.scrollAncestor.clientWidth??snapshot.scrollAncestor.clientHeight} scroll=${snapshot.scrollAncestor.scrollWidth??snapshot.scrollAncestor.scrollHeight}`,evidence,explanation:'Overflow is contained by an explicitly scrollable region and remains reachable.',suggestion:'No responsive fix is required unless scrolling is unintended or controls are inaccessible.',diagnostic:true})];
 }
 if(snapshot.clipAncestor){
  evidence.clippingAncestor=snapshot.clipAncestor;
  const interactive=!!snapshot.interactive;
  return [finding({category:interactive?LAYOUT_CATEGORY.INTERACTIVE_ELEMENT_CLIPPED:LAYOUT_CATEGORY.CONTENT_CLIPPED,severity:interactive?'high':'medium',confidence:interactive?'high':'medium',selector:snapshot.selector,detail:`Content extends beyond ${snapshot.clipAncestor.selector||'a clipping ancestor'}`,evidence,explanation:interactive?'An interactive control is partially hidden by a clipping ancestor and may be unreachable.':'Visible content extends beyond an ancestor that clips overflow; intent cannot be proven from geometry alone.',suggestion:interactive?'Resize or reposition the control, or make the containing region intentionally scrollable.':'Confirm whether the clipping is decorative; otherwise adjust sizing, wrapping, or overflow behavior.'})];
 }
 const overflow=snapshot.overflowPx||{};
 const maximum=Math.max(overflow.left||0,overflow.right||0,overflow.top||0,overflow.bottom||0);
 if(maximum<=2)return [];
 let severity='medium',confidence='medium',cause='viewport-boundary';
 if(snapshot.position==='fixed'&&snapshot.interactive){severity='high';confidence='high';cause='fixed-interactive-overlay';}
 else if(snapshot.transform&&snapshot.transform!=='none'){severity='low';confidence='low';cause='transformed-boundary';}
 else if(snapshot.longUnbrokenText){severity='medium';confidence='high';cause='long-unbroken-content';}
 else if(snapshot.parentDisplay==='grid'){severity='medium';confidence='high';cause='grid-min-content';}
 else if(snapshot.parentDisplay==='flex'&&snapshot.minWidth!=='0px'){severity='medium';confidence='high';cause='flex-min-width';}
 evidence.cause=cause;
 return [finding({category:LAYOUT_CATEGORY.ELEMENT_OVERFLOW,severity,confidence,selector:snapshot.selector,detail:`right=${Math.round(snapshot.rect?.right||0)} viewport=${Math.round(snapshot.viewport?.width||0)}`,evidence,explanation:confidence==='low'?'A transformed element crosses the viewport boundary; this may be an animation or an actual visible defect.':'The element crosses the viewport boundary without a containing scroll region.',suggestion:confidence==='low'?'Verify the active animation state and whether visible or interactive content becomes unreachable.':'Inspect width, min-width, wrapping, and parent flex/grid constraints at this viewport.'})];
}

export function detectLayoutIssues(snapshot={}){
 const findings=[...classifyDocumentLayout(snapshot.document)];
 for(const element of snapshot.elements||[])findings.push(...classifyElementLayout(element));
 const seen=new Set(),issues=[],diagnostics=[];
 for(const item of findings){const key=`${item.category}|${item.selector}`;if(seen.has(key))continue;seen.add(key);(item.diagnostic?diagnostics:issues).push(item);}
 return {issues:issues.slice(0,35),diagnostics:diagnostics.slice(0,20)};
}

export function findingId({category,route,viewport,selector}){
 return 'vud-'+createHash('sha256').update([category,route,viewport,selector].join('|')).digest('hex').slice(0,16);
}

function collectLayoutSnapshot(){
 const viewportWidth=document.documentElement.clientWidth||innerWidth,viewportHeight=innerHeight;
 const tolerance=Math.max(2,1/(devicePixelRatio||1));
 const rectValue=rect=>({left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,width:rect.width,height:rect.height});
 const selector=element=>{if(element.id)return '#'+CSS.escape(element.id);const parts=[];let current=element;while(current&&current.nodeType===1&&parts.length<5){let part=current.tagName.toLowerCase();if(current.classList.length)part+='.'+Array.from(current.classList).slice(0,2).map(value=>CSS.escape(value)).join('.');parts.unshift(part);current=current.parentElement;}return parts.join(' > ');};
 const isScrollable=(style,element)=>{const horizontal=/^(auto|scroll)$/.test(style.overflowX)&&element.scrollWidth>element.clientWidth+tolerance;const vertical=/^(auto|scroll)$/.test(style.overflowY)&&element.scrollHeight>element.clientHeight+tolerance;return horizontal||vertical?{selector:selector(element),axis:horizontal&&vertical?'horizontal and vertical':horizontal?'horizontal':'vertical',overflowX:style.overflowX,overflowY:style.overflowY,clientWidth:element.clientWidth,scrollWidth:element.scrollWidth,clientHeight:element.clientHeight,scrollHeight:element.scrollHeight}:null;};
 const clippingAncestor=(element,rect)=>{for(let parent=element.parentElement;parent&&parent!==document.documentElement;parent=parent.parentElement){const style=getComputedStyle(parent),parentRect=parent.getBoundingClientRect();const clipX=/^(hidden|clip)$/.test(style.overflowX)&&(rect.left<parentRect.left-tolerance||rect.right>parentRect.right+tolerance);const clipY=/^(hidden|clip)$/.test(style.overflowY)&&(rect.top<parentRect.top-tolerance||rect.bottom>parentRect.bottom+tolerance);if(clipX||clipY)return {selector:selector(parent),overflowX:style.overflowX,overflowY:style.overflowY,rect:rectValue(parentRect)};}return null;};
 const scrollingAncestor=element=>{for(let current=element;current&&current!==document.documentElement;current=current.parentElement){const scroll=isScrollable(getComputedStyle(current),current);if(scroll)return scroll;}return null;};
 const elements=[];let checked=0;
 for(const element of document.body.querySelectorAll('*')){
  if(checked++>=4000)break;
  const style=getComputedStyle(element),rect=element.getBoundingClientRect();
  if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0||rect.width<=0||rect.height<=0)continue;
  const inactive=!!element.closest('[hidden],[inert],[aria-hidden="true"],details:not([open])');
  const interactive=element.matches('button,a[href],input:not([type="hidden"]),textarea,select,[role="button"],[role="link"],[role="dialog"],[aria-modal="true"]');
  const text=(element.textContent||'').trim().slice(0,2000),longest=text.split(/\s+/).reduce((length,value)=>Math.max(length,value.length),0);
  const parentStyle=element.parentElement?getComputedStyle(element.parentElement):null;
  const scroll=scrollingAncestor(element),clip=clippingAncestor(element,rect);
  const fixedToViewport=style.position==='fixed';
  const overflowPx={left:Math.max(0,-rect.left),right:Math.max(0,rect.right-viewportWidth),top:fixedToViewport?Math.max(0,-rect.top):0,bottom:fixedToViewport?Math.max(0,rect.bottom-viewportHeight):0};
  const boundary=Math.max(overflowPx.left,overflowPx.right,overflowPx.top,overflowPx.bottom)>tolerance;
  const fullyOffscreen=rect.right<=0||rect.left>=viewportWidth||(fixedToViewport&&(rect.bottom<=0||rect.top>=viewportHeight));
  const decorative=['presentation','none'].includes(element.getAttribute('role'))||(!interactive&&!text&&element.children.length===0);
  if(!scroll&&!clip&&!boundary)continue;
  elements.push({selector:selector(element),rect:rectValue(rect),viewport:{width:viewportWidth,height:viewportHeight},interactive,decorative,inactive:inactive||(fullyOffscreen&&!interactive&&(style.transform!=='none'||['fixed','absolute'].includes(style.position))),position:style.position,transform:style.transform,overflowPx,scrollAncestor:scroll,clipAncestor:clip,parentDisplay:parentStyle?.display||'',minWidth:style.minWidth,direction:style.direction,longUnbrokenText:longest>=40&&['nowrap','pre'].includes(style.whiteSpace)&&!['anywhere','break-word'].includes(style.overflowWrap)});
 }
 return {document:{viewportWidth,documentWidth:document.documentElement.scrollWidth,tolerance},elements,checkedElements:checked};
}

export function buildLayoutSnapshotScript(){return `(${collectLayoutSnapshot.toString()})()`;}
