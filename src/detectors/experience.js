import {isPaintedElement} from './visibility.js';

// These rules measure layout symptoms. None proves author intent or visual quality.
export function detectExperience(snapshot){
 const issues=[],seen=new Set(),add=(category,e,evidence,suggestion,assessment='probable')=>{
  const key=category+'|'+e.selector;if(seen.has(key))return;seen.add(key);
  issues.push({category,selector:e.selector,severity:'medium',confidence:assessment==='probable'?'medium':'low',assessment,evidence,cause:{ancestor:e.selector,layout:e.layout??'block',...(e.related?{related:e.related}:{})},suggestion});
 };
 for(const e of snapshot.fragmentation??[])if(e.proseChars>=30&&e.inlineItems>=2&&e.blockSizedItems>=2&&e.separatedRows>=2)add('INLINE_PROSE_FRAGMENTATION',e,{inlineItems:e.inlineItems,blockSizedItems:e.blockSizedItems,proseChars:e.proseChars,separatedRows:e.separatedRows},'Inspect the prose parent display/grid placement; keep semantic inline tokens in normal text flow.');
 for(const e of snapshot.content??[])if(snapshot.viewport.width<=768&&e.visibleLines<3&&e.viewportFraction<.22&&e.scrollRatio>=1.5)add('CONTENT_SPACE_STARVATION',e,{effectiveHeight:e.effectiveHeight,lineHeight:e.lineHeight,visibleLines:e.visibleLines,viewportFraction:e.viewportFraction,scrollRatio:e.scrollRatio,nestedScrollers:e.nestedScrollers},'Review pane sizing and reserved controls; expose more readable lines or an explicit expanded view.');
 for(const e of snapshot.toolbars??[]){
  const excessive=e.rows>=3&&e.viewportFraction>=.13,orphan=e.rows===2&&e.controls>=4&&e.lastRowCount===1&&e.firstRowFill>=.65&&e.lastRowWidth/e.availableWidth<.35;
  if(excessive||orphan)add('EXCESSIVE_CONTROL_WRAPPING',e,{rows:e.rows,controls:e.controls,lastRowCount:e.lastRowCount,height:e.height,viewportFraction:e.viewportFraction,availableWidth:e.availableWidth},'Review toolbar wrapping, label widths and action grouping; verify whether the extra or orphan row is intended.',excessive?'probable':'needs-review');
 }
 for(const e of snapshot.collisions??[])if(e.overlapWidth>=4&&e.overlapHeight>=4)add('TEXT_BADGE_COLLISION',e,{overlapWidth:e.overlapWidth,overlapHeight:e.overlapHeight,textMinWidthAuto:e.textMinWidthAuto},'Inspect text min-width/shrink, badge sizing and stacking; preserve ellipsis while preventing painted text obstruction.');
 for(const e of snapshot.headers??[])if(snapshot.viewport.width<=768&&e.rows>=3&&e.viewportFraction>=.14&&e.contentLines<=6&&e.contentFraction<.35)add('MOBILE_CHROME_DENSITY',e,{rows:e.rows,height:e.height,viewportFraction:e.viewportFraction,contentLines:e.contentLines,contentFraction:e.contentFraction},'Review header/control height together with the usable content area; confirm priorities at this viewport.','needs-review');
 return {issues:issues.slice(0,20),coverage:{checked:snapshot.checked??0,truncated:!!snapshot.truncated,total:issues.length,omitted:Math.max(0,issues.length-20),families:5,classification:'heuristic-layout-symptoms'}};
}

// Engine-owned DOM observation; only selectors, layout enums and numbers leave CDP.
function collectExperience(options){
 const name=e=>{if(e.id)return '#'+CSS.escape(e.id);const path=[];for(let n=e;n&&path.length<5;n=n.parentElement){let part=n.tagName.toLowerCase();if(n.classList.length)part+='.'+[...n.classList].slice(0,2).map(CSS.escape).join('.');path.unshift(part);}return path.join(' > ');};
 const rect=e=>e.getBoundingClientRect(),round=n=>Math.round(n*100)/100;
 const layout=e=>{const s=getComputedStyle(e);return s.display.includes('flex')?'flex':s.display.includes('grid')?'grid':'block';};
 const line=e=>{const s=getComputedStyle(e);return parseFloat(s.lineHeight)||parseFloat(s.fontSize)*1.2||20;};
 const visible=e=>isPaintedElement(e)&&rect(e).bottom>0&&rect(e).top<innerHeight&&rect(e).right>0&&rect(e).left<innerWidth;
 const rows=controls=>{const groups=[];for(const e of [...controls].sort((a,b)=>rect(a).top-rect(b).top)){const r=rect(e);let g=groups.find(g=>Math.abs(g.top-r.top)<=Math.max(4,Math.min(g.height,r.height)*.45));if(!g){g={top:r.top,height:r.height,items:[]};groups.push(g);}g.items.push(e);}return groups;};
 const interactive=e=>e.matches('button,a[href],input,select,textarea,[role="button"],[role="tab"]');
 const intention=e=>!!e.closest('nav,[role="navigation"],[role="tablist"],[role="grid"],[data-ui-audit-intent="multirow"],[data-ui-audit-intent="decorative"]');
 const nodes=[],walker=document.createTreeWalker(document.body,NodeFilter.SHOW_ELEMENT);let checked=0,n;
 while((n=walker.nextNode())&&checked<4000){nodes.push(n);checked++;}
 const truncated=!!n,out={viewport:{width:innerWidth,height:innerHeight},fragmentation:[],content:[],toolbars:[],collisions:[],headers:[],checked,truncated};
 const regions=new Set((options.regions??[]).flatMap(r=>[...document.querySelectorAll(r.selector)])),contents=[],headers=[];
 let candidates=0;
 for(const e of nodes){
  if(!visible(e)||e.closest('script,style,svg,pre code,[data-ui-audit-intent="decorative"]'))continue;
  const s=getComputedStyle(e),r=rect(e),kind=layout(e),children=[...e.children].slice(0,24).filter(visible);
  const ownChars=[...e.childNodes].filter(n=>n.nodeType===3).reduce((sum,n)=>sum+n.textContent.trim().length,0);
  const inline=children.filter(c=>c.matches('code,strong,em,b,i,mark,kbd,samp')&&!interactive(c)&&!c.querySelector('button,a,input'));
  if(kind!=='block'&&!intention(e)&&ownChars>=30&&inline.length>=2){
   const blockSized=inline.filter(c=>rect(c).width>=r.width*.6),separated=rows(inline).length;
   out.fragmentation.push({selector:name(e),layout:kind,proseChars:ownChars,inlineItems:inline.length,blockSizedItems:blockSized.length,separatedRows:separated});candidates++;
  }
  const content=e.matches('article,[role="document"],textarea,[role="textbox"],pre')||regions.has(e)||(/auto|scroll/.test(s.overflowY)&&(e.querySelector('p')||ownChars>=120));
  if(content&&!intention(e)&&r.width>=120&&((e.textContent||'').trim().length>=120||e.matches('textarea,[role="textbox"]'))){
   // A wrapper containing another scrolling reader isn't itself an independent reader.
   let top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom),nested=0;
   for(let p=e.parentElement;p;p=p.parentElement){const ps=getComputedStyle(p),pr=rect(p);if(/hidden|clip|auto|scroll/.test(ps.overflowY)){top=Math.max(top,pr.top+p.clientTop);bottom=Math.min(bottom,pr.top+p.clientTop+p.clientHeight);if(/auto|scroll/.test(ps.overflowY)&&p.scrollHeight>p.clientHeight+2)nested++;}}
   const effective=Math.max(0,bottom-top),lh=line(e),scrollRatio=e.scrollHeight/Math.max(1,e.clientHeight);
   contents.push({element:e,selector:name(e),layout:kind,effectiveHeight:round(effective),lineHeight:round(lh),visibleLines:round(effective/lh),viewportFraction:round(effective/innerHeight),scrollRatio:round(scrollRatio),nestedScrollers:nested});candidates++;
  }
  if(e.matches('header,[role="banner"]')&&!e.parentElement?.closest('header,[role="banner"]'))headers.push(e);
  const controls=children.filter(c=>interactive(c)&&!c.matches('input,textarea,select')&&(c.textContent||'').length<=80&&rect(c).height<=line(c)*2.5&&!c.querySelector('h1,h2,h3,h4,h5,h6,p,img'));
  if(kind==='flex'&&s.flexDirection.startsWith('row')&&s.flexWrap!=='nowrap'&&controls.length>=3&&controls.length===children.length&&!intention(e)){
   const groups=rows(controls),last=groups.at(-1),first=groups[0],lastWidth=last?Math.max(...last.items.map(x=>rect(x).right))-Math.min(...last.items.map(x=>rect(x).left)):0;
   const firstWidth=first?Math.max(...first.items.map(x=>rect(x).right))-Math.min(...first.items.map(x=>rect(x).left)):0;
   out.toolbars.push({selector:name(e),layout:kind,rows:groups.length,controls:controls.length,lastRowCount:last?.items.length??0,lastRowWidth:round(lastWidth),firstRowFill:round(firstWidth/Math.max(1,r.width)),availableWidth:round(r.width),height:round(r.height),viewportFraction:round(r.height/innerHeight)});candidates++;
  }
  if(kind!=='block'&&!intention(e)&&children.length>=2&&children.length<=16){
   // Inspect actual text-range ink boxes, clipped by real overflow ancestors.
   let found=false;
   for(const text of children){
    if(found)break;if(interactive(text)||text.getAttribute('aria-hidden')==='true'||!(text.textContent||'').trim()||text.querySelector('button,input,svg'))continue;
    const texts=document.createTreeWalker(text,NodeFilter.SHOW_TEXT);let tn,count=0;
    while((tn=texts.nextNode())&&count++<8&&!found){if(!tn.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(tn);
     for(const ink of [...range.getClientRects()].slice(0,8)){
      let left=ink.left,right=ink.right,top=ink.top,bottom=ink.bottom;
      for(let p=text;p&&p!==e;p=p.parentElement){const ps=getComputedStyle(p),pr=rect(p);if(/hidden|clip|auto|scroll/.test(ps.overflowX)){left=Math.max(left,pr.left);right=Math.min(right,pr.right);}if(/hidden|clip|auto|scroll/.test(ps.overflowY)){top=Math.max(top,pr.top);bottom=Math.min(bottom,pr.bottom);}}
      for(const badge of children){if(badge===text||badge.getAttribute('aria-hidden')==='true'||badge.getAttribute('role')==='presentation'||!((badge.textContent||'').trim())||rect(badge).width>Math.min(r.width*.5,200))continue;
       const b=rect(badge),x1=Math.max(left,b.left,0),x2=Math.min(right,b.right,innerWidth),y1=Math.max(top,b.top,0),y2=Math.min(bottom,b.bottom,innerHeight);
       if(x2-x1<4||y2-y1<4)continue;
       const hit=document.elementFromPoint((x1+x2)/2,(y1+y2)/2);
       if(hit&&(badge===hit||badge.contains(hit))){out.collisions.push({selector:name(e),layout:kind,related:name(badge),overlapWidth:round(x2-x1),overlapHeight:round(y2-y1),textMinWidthAuto:Number(getComputedStyle(text).minWidth==='auto')});candidates++;found=true;break;}
      }
      if(found)break;
     }
    }
   }
  }
  if(candidates>=80){out.truncated=true;break;}
 }
 // Retain innermost content surfaces to avoid reporting reader + wrapper duplicates.
 const leaves=contents.filter(c=>!contents.some(other=>other!==c&&c.element.contains(other.element)));
 out.content=leaves.map(({element,...c})=>c);
 for(const header of headers){const controls=[...header.querySelectorAll('button,a[href],input,select')].slice(0,40).filter(visible),r=rect(header),content=leaves.slice().sort((a,b)=>b.effectiveHeight-a.effectiveHeight)[0];
  if(!content||controls.length<3||r.top>8)continue;
  out.headers.push({selector:name(header),layout:layout(header),rows:rows(controls).length,height:round(Math.min(innerHeight,r.bottom)-Math.max(0,r.top)),viewportFraction:round(Math.max(0,Math.min(innerHeight,r.bottom)-Math.max(0,r.top))/innerHeight),contentLines:content.visibleLines,contentFraction:content.viewportFraction});
 }
 return out;
}
export function buildExperienceSnapshotScript(options={}){return `(()=>{const isPaintedElement=${isPaintedElement.toString()};return (${collectExperience.toString()})(${JSON.stringify({regions:options.regions??[]})});})()`;}
