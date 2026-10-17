import {isPaintedElement,hasPaintedViewportIntersection} from './visibility.js';

export function contrastRatio(foreground,background){
 const luminance=rgb=>rgb.map(v=>{v/=255;return v<=0.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 const a=luminance(foreground),b=luminance(background);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}
const make=(category,e,evidence,assessment,explanation,suggestion,severity='medium')=>({category,selector:e.selector,severity,confidence:assessment==='confirmed'?'high':assessment==='probable'?'medium':'low',assessment,evidence,explanation,suggestion});
export function detectUsability(snapshot){
 const issues=[],diagnostics=[];let unsupportedContrast=0,contrastMeasured=0;
 for(const e of snapshot.elements){
  if(e.hiddenTabStop)issues.push(make('HIDDEN_CONTROL_IN_TAB_ORDER',e,{tabIndex:e.tabIndex},'probable','A rendered, enabled sequential tab stop is visually hidden or collapsed.','Remove it from the tab order while collapsed and restore it when visible.','high'));
  if(!e.visible)continue;
  const t=e.text,c=e.contrast,f=e.form,control=e.control;
  if(t?.hasText&&t.clipped){
   if(t.ellipsis||t.lineClamp)diagnostics.push({category:'INTENTIONAL_TEXT_TRUNCATION',selector:e.selector,classification:'intentional',assessment:'needs-review'});
   else issues.push(make('TEXT_CONTENT_CLIPPED',e,{clientWidth:t.clientWidth,scrollWidth:t.scrollWidth,clientHeight:t.clientHeight,scrollHeight:t.scrollHeight},'probable','Text exceeds a non-scrollable clipping box without explicit ellipsis or line clamp.','Inspect width/height, wrapping and overflow; preserve an accessible expansion if truncation is intended.'));
  }
  if(c?.unsupported)unsupportedContrast++;
  else if(c?.foreground&&c.background){contrastMeasured++;const ratio=contrastRatio(c.foreground,c.background);if(ratio<c.threshold)issues.push(make('LOW_TEXT_CONTRAST',e,{ratio:Math.round(ratio*1000)/1000,threshold:c.threshold,fontSize:c.fontSize,foreground:{red:c.foreground[0],green:c.foreground[1],blue:c.foreground[2]},background:{red:c.background[0],green:c.background[1],blue:c.background[2]}},'confirmed','Computed opaque foreground/background contrast falls below the size-specific text threshold.','Increase text/background contrast; complex compositing still requires separate visual review.'));}
  if(f?.needsLabel&&!f.labeled)issues.push(make('FORM_LABEL_MISSING',e,{resolvedLabels:f.resolvedLabels??0,brokenReferences:f.brokenReferences??0},'confirmed','A visible form control has no resolved non-empty label relationship.','Associate a label or a valid aria-labelledby/aria-label; placeholder alone is not a label.','high'));
  if(f?.invalid&&f.errorReferences===0)issues.push(make('FORM_ERROR_NOT_ASSOCIATED',e,{invalid:1,errorReferences:0},'needs-review','The control declares aria-invalid but no error description relationship resolves.','Check error feedback and associate a meaningful description; live-region announcements need separate verification.'));
  if(control?.enabled&&control.keyboardMissing)issues.push(make('CONTROL_NOT_KEYBOARD_REACHABLE',e,{tabIndex:e.tabIndex??-1},'probable','A button-like control is absent from sequential keyboard navigation.','Use a native button or implement focus and keyboard operation; managed roving controls are excluded.','high'));
  if(control?.enabled&&!control.inline&&(e.rect.width<24||e.rect.height<24)&&control.nearestDistance<24)issues.push(make('SMALL_CROWDED_TARGET',e,{width:e.rect.width,height:e.rect.height,nearestCenterDistance:Math.round(control.nearestDistance)},'probable','A sub-24px target has another target center within 24px.','Increase hit area or spacing; inline and isolated small targets are not treated as this defect.'));
  if(control?.fixedBlocker)issues.push(make('FIXED_OVERLAY_BLOCKS_CONTROL',e,{width:e.rect.width,height:e.rect.height},'probable','A fixed/sticky layer receives the control center hit.','Inspect the shared header/overlay stacking and reserved content space.','high'));
 }
 return {issues:issues.slice(0,40),diagnostics:diagnostics.slice(0,30),coverage:{examined:snapshot.elements.length,truncated:!!snapshot.truncated,issueTotal:issues.length,issueOmitted:Math.max(0,issues.length-40),diagnosticOmitted:Math.max(0,diagnostics.length-30),contrastMeasured,unsupportedContrast,focusVisibility:'unsupported',keyboardTraversal:'unsupported',contrast:'opaque-srgb-text-only',families:['text-clipping','text-contrast','form-labels-errors','keyboard-semantics','crowded-targets','fixed-overlay-control']}};
}

// Fixed source evaluated in CDP. Exports no text, form values, HTML or credential state.
function collectUsability(){
 const name=e=>{if(e.id)return '#'+CSS.escape(e.id);const path=[];for(let n=e;n&&path.length<5;n=n.parentElement){let p=n.tagName.toLowerCase();if(n.classList.length)p+='.'+[...n.classList].slice(0,2).map(x=>CSS.escape(x)).join('.');path.unshift(p);}return path.join(' > ');};
 const rgb=s=>{const m=/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(s);return m?{value:m.slice(1,4).map(Number),alpha:m[4]===undefined?1:Number(m[4])}:null;};
 const nonempty=e=>!!e&&(e.textContent||'').trim().length>0;
 const labelContent=e=>nonempty(e)||!!e&&((e.getAttribute('aria-label')||'').trim().length>0||[...e.querySelectorAll('img[alt]')].some(img=>(img.getAttribute('alt')||'').trim().length));
 const refs=(e,attr)=>(e.getAttribute(attr)||'').trim().split(/\s+/).filter(Boolean);
 const elements=[];let checked=0,truncated=false;
 for(const e of document.body.querySelectorAll('*')){
  if(checked++>=4000||elements.length>=300){truncated=true;break;}
  if(e.closest('script,style,template,svg,canvas'))continue;
  const s=getComputedStyle(e),r=e.getBoundingClientRect(),visible=isPaintedElement(e),tag=e.tagName.toLowerCase(),role=e.getAttribute('role');
  const target=e.matches('button,a[href],input:not([type="hidden"]),select,textarea,[role="button"],[role="tab"]');
  const enabled=!e.matches(':disabled,[aria-disabled="true"]')&&!e.closest('[inert]');
  let rendered=!!(e.getClientRects().length&&r.width&&r.height&&s.visibility==='visible');for(let p=e;p&&rendered;p=p.parentElement)if(getComputedStyle(p).display==='none')rendered=false;
  const hiddenTabStop=target&&rendered&&enabled&&e.tabIndex>=0&&!visible;
  if(!visible&&!hiddenTabStop)continue;
  const ownText=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim().length);
  if(!target&&!ownText)continue;
  const item={selector:name(e),visible,hiddenTabStop,tabIndex:e.tabIndex,rect:{left:Math.round(r.left),top:Math.round(r.top),width:Math.round(r.width),height:Math.round(r.height)}};
  if(visible&&ownText&&!e.closest(':disabled,[aria-disabled="true"],[inert]')&&!e.matches('[role="img"]')){
   const textX=e.scrollWidth>e.clientWidth+2&&/hidden|clip/.test(s.overflowX),textY=e.scrollHeight>e.clientHeight+2&&/hidden|clip/.test(s.overflowY);
   item.text={hasText:true,clipped:textX||textY,ellipsis:s.textOverflow==='ellipsis',lineClamp:parseInt(s.webkitLineClamp)>0,clientWidth:e.clientWidth,scrollWidth:e.scrollWidth,clientHeight:e.clientHeight,scrollHeight:e.scrollHeight};
   let background=null,unsupported=false;
   for(let p=e;p;p=p.parentElement){const ps=getComputedStyle(p);if(Number(ps.opacity)!==1||ps.filter!=='none'||ps.mixBlendMode!=='normal'){unsupported=true;break;}if(background)continue;if(ps.backgroundImage!=='none'){unsupported=true;break;}const color=rgb(ps.backgroundColor);if(!color){unsupported=true;break;}if(color.alpha===1)background=color.value;else if(color.alpha!==0){unsupported=true;break;}}
   const foreground=rgb(s.color);if(!foreground||foreground.alpha!==1||s.textShadow!=='none')unsupported=true;
   for(const pseudo of ['::before','::after']){const ps=getComputedStyle(e,pseudo);if(ps.content!=='none'&&ps.content!=='normal')unsupported=true;}
   const fontSize=parseFloat(s.fontSize),large=fontSize>=24||fontSize>=18.6666667&&Number(s.fontWeight)>=700;
   item.contrast=!hasPaintedViewportIntersection(e)?{unsupported:'outside-painted-viewport'}:unsupported||!background?{unsupported:'complex-or-unresolved-paint'}:{foreground:foreground.value,background,threshold:large?3:4.5,fontSize};
  }
  if(visible&&e.matches('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]),select,textarea')){
   const references=refs(e,'aria-labelledby'),resolved=references.map(id=>document.getElementById(id));
   const labels=[...(e.labels??[])],aria=(e.getAttribute('aria-label')||'').trim();
   const errorRefs=[...refs(e,'aria-describedby'),...refs(e,'aria-errormessage')].filter(id=>nonempty(document.getElementById(id)));
   const fallback=(e.getAttribute('title')||'').trim()||(e.matches('input[type="image"]')?(e.getAttribute('alt')||'').trim():'');
   item.form={needsLabel:enabled,labeled:!!aria||!!fallback||labels.some(labelContent)||references.length>0&&resolved.every(labelContent),resolvedLabels:labels.filter(labelContent).length+resolved.filter(labelContent).length,brokenReferences:resolved.filter(x=>!x).length,invalid:e.getAttribute('aria-invalid')==='true',errorReferences:errorRefs.length};
  }
  if(target){
   const x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);
   let blocker=null;if(visible&&hit&&!e.contains(hit)&&hit!==e){for(let p=hit;p;p=p.parentElement){if(['fixed','sticky'].includes(getComputedStyle(p).position)){blocker=name(p);break;}}}
   const managed=!!e.closest('[role="tablist"],[role="menu"],[role="listbox"],[role="grid"]')&&!!e.parentElement?.querySelector('[tabindex="0"]');
   item.control={enabled,inline:tag==='a'&&s.display==='inline',keyboardMissing:enabled&&!managed&&(role==='button'||tag==='button')&&e.tabIndex<0,nearestDistance:Infinity,fixedBlocker:blocker};
  }
  elements.push(item);
 }
 const targets=elements.filter(e=>e.visible&&e.control?.enabled);
 for(const a of targets){let nearest=Infinity;for(const b of targets)if(a!==b)nearest=Math.min(nearest,Math.hypot((a.rect.left+a.rect.width/2)-(b.rect.left+b.rect.width/2),(a.rect.top+a.rect.height/2)-(b.rect.top+b.rect.height/2)));a.control.nearestDistance=Number.isFinite(nearest)?nearest:1000000;}
 return {elements,truncated,checked};
}
export function buildUsabilitySnapshotScript(){return `(()=>{const isPaintedElement=${isPaintedElement.toString()};const hasPaintedViewportIntersection=${hasPaintedViewportIntersection.toString()};return (${collectUsability.toString()})()})()`;}
