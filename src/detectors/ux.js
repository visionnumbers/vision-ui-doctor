import {createHash} from 'node:crypto';
import {isPaintedElement} from './visibility.js';

const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0,16);
const result=(category,selector,evidence,cause,confidence='medium')=>({category,selector,severity:category==='VISIBLE_REGION_OVERLAP'?'high':'medium',confidence,evidence,cause});
export function detectUxIssues(snapshot){
 const issues=[];
 for(const r of snapshot.regions??[]){
  if(!r.visible)continue;
  const parent=r.parent;
  if(parent&&!parent.intentionalScroll&&r.rect.width>parent.width+2&&['flex','grid'].includes(parent.display))issues.push(result('RESPONSIVE_CONTAINER_FAILURE',r.selector,{width:r.rect.width,parentWidth:parent.width,overflowPx:r.rect.width-parent.width},{ancestor:parent.selector,layout:parent.display},'high'));
  if(r.minWidthPx&&r.rect.width<r.minWidthPx)issues.push(result('NARROW_CONTENT_REGION',r.selector,{width:r.rect.width,declaredMinimum:r.minWidthPx},{ancestor:parent?.selector??r.selector,layout:parent?.display??'block'},'high'));
 }
 for(const pair of snapshot.overlaps??[])if(pair.confirmed)issues.push(result('VISIBLE_REGION_OVERLAP',pair.a,{width:pair.width,height:pair.height},{ancestor:pair.a,related:pair.b,layout:'overlap'}));
 for(const a of snapshot.alignments??[]){
  if(a.values.length<2)continue;
  const values=a.values.map(v=>v.value),spread=Math.max(...values)-Math.min(...values);
  if(spread>a.tolerancePx)for(const v of a.values.filter(v=>v.value!==Math.min(...values)))issues.push(result('DECLARED_ALIGNMENT_DEVIATION',v.selector,{spreadPx:spread,declaredTolerancePx:a.tolerancePx},{ancestor:a.values[0].selector,related:v.selector,layout:'alignment',expectation:a.id},'high'));
 }
 return issues.slice(0,30);
}

// Called only in a page by an engine-owned expression. No page text/HTML exported.
function collectUx(options,issueSelectors){
 const select=s=>{try{return document.querySelector(s);}catch{return null;}};
 const name=e=>{if(e.id)return '#'+CSS.escape(e.id);let path=[];for(let n=e;n&&path.length<5;n=n.parentElement){let part=n.tagName.toLowerCase();if(n.classList.length)part+='.'+[...n.classList].slice(0,2).map(x=>CSS.escape(x)).join('.');path.unshift(part);}return path.join(' > ');};
 const rect=e=>Object.fromEntries(['left','top','right','bottom','width','height'].map(k=>[k,Math.round(e.getBoundingClientRect()[k])]));
 const context=e=>{
  for(let n=e.parentElement;n&&n!==document.documentElement;n=n.parentElement){
   const s=getComputedStyle(n),clip=/hidden|clip/.test(s.overflowX+' '+s.overflowY);
   if(clip||['flex','grid','inline-flex','inline-grid'].includes(s.display))return {ancestor:name(n),layout:clip?'clip':s.display.replace('inline-','')};
  }
  return {ancestor:e.parentElement?name(e.parentElement):'html',layout:'block'};
 };
 const regions=options.regions.map(r=>{
  const count=document.querySelectorAll(r.selector).length,e=select(r.selector),visible=count===1&&!!e&&isPaintedElement(e);
  if(!visible)return {selector:r.selector,visible:false,exists:!!e,count};
  const p=e.parentElement,style=p?getComputedStyle(p):null;
  return {selector:r.selector,visible:true,exists:true,count,rect:rect(e),minWidthPx:r.minWidthPx,parent:p?{selector:name(p),width:p.clientWidth,display:style.display.replace('inline-',''),intentionalScroll:/auto|scroll/.test(style.overflowX)}:null,context:context(e)};
 });
 const overlaps=[];
 for(let i=0;i<regions.length;i++)for(let j=i+1;j<regions.length;j++){
  const a=regions[i],b=regions[j];if(!a.visible||!b.visible)continue;
  const ea=select(a.selector),eb=select(b.selector);if(ea.contains(eb)||eb.contains(ea))continue;
  if(options.regions[i].allowOverlapWith.includes(b.selector)||options.regions[j].allowOverlapWith.includes(a.selector))continue;
  const left=Math.max(a.rect.left,b.rect.left,0),right=Math.min(a.rect.right,b.rect.right,innerWidth),top=Math.max(a.rect.top,b.rect.top,0),bottom=Math.min(a.rect.bottom,b.rect.bottom,innerHeight);
  if(right-left<4||bottom-top<4)continue;
  // Confirm which configured sibling region receives the overlap's center hit.
  const hit=document.elementFromPoint((left+right)/2,(top+bottom)/2);
  if(hit&&(ea===hit||eb===hit||ea.contains(hit)||eb.contains(hit)))overlaps.push({a:a.selector,b:b.selector,width:right-left,height:bottom-top,confirmed:true});
 }
 const alignments=options.alignments.map(a=>({...a,values:a.selectors.flatMap(selector=>{const e=select(selector);return document.querySelectorAll(selector).length===1&&e&&isPaintedElement(e)?[{selector,value:rect(e)[a.axis]}]:[]})}));
 const allSelectors=[...new Set([...options.regions.map(r=>r.selector),...options.alignments.flatMap(a=>a.selectors)])];
 const checks={missing:allSelectors.filter(s=>!select(s)),ambiguous:allSelectors.filter(s=>document.querySelectorAll(s).length>1),hidden:allSelectors.filter(s=>select(s)&&!isPaintedElement(select(s)))};
 const contexts=issueSelectors.flatMap(selector=>{const e=select(selector);return e&&isPaintedElement(e)?[{selector,...context(e)}]:[]});
 const observed=issueSelectors.map(selector=>{const e=select(selector);return {selector,visible:!!e&&isPaintedElement(e),rect:e?rect(e):null};});
 const animated=[...new Set([...options.regions.map(r=>select(r.selector)),...issueSelectors.map(select)].filter(Boolean).flatMap(e=>e.getAnimations({subtree:true})))];
 const activeAnimations=animated.some(a=>a.playState==='running'&&a.effect?.getKeyframes().some(frame=>Object.keys(frame).some(k=>/^(transform|translate|scale|rotate|width|height|left|right|top|bottom|opacity|visibility|margin.*|padding.*|flex.*|grid.*|gap)$/.test(k))));
 return {regions,overlaps,alignments,contexts,checks,observed,activeAnimations};
}
export function buildUxSnapshotScript(options,issueSelectors=[]){
 return `(()=>{const isPaintedElement=${isPaintedElement.toString()};return (${collectUx.toString()})(${JSON.stringify(options)},${JSON.stringify(issueSelectors)});})()`;
}
export function uxGeometryStamp(snapshot){return JSON.stringify([snapshot.regions.map(r=>[r.selector,r.visible,r.rect]),snapshot.alignments.map(a=>a.values),snapshot.observed]);}

const guidance={
 flex:'Inspect child min-width/flex-basis, wrapping and the owning flex container at affected widths.',
 grid:'Inspect grid-template columns, minmax(0, 1fr) and child min-width at affected widths.',
 clip:'Inspect the shared clipping ancestor and whether its descendants should be hidden or reachable.',
 overlap:'Review sibling region stacking/positioning; declare intentional overlap rather than globally disabling detection.',
 alignment:'Check the declared alignment baseline, spacing tokens and responsive override; intent comes from configuration.',
 block:'Inspect the shared region sizing and its responsive CSS; source candidates are lexical, not proven ownership.'
};
export function rootCauseCandidates(states){
 const groups=new Map();
 for(const state of states)for(const f of state.issues??[]){
  const cause=f.cause??{ancestor:f.selector,layout:'block'};
  const key=JSON.stringify([cause.ancestor,cause.layout]);
  if(!groups.has(key))groups.set(key,{id:'root-'+hash(key),ancestor:cause.ancestor,layout:cause.layout,status:'candidate-not-proven',confidence:'medium',severity:f.severity,issueIds:[],categories:[],affected:[],assessments:{confirmed:0,probable:0,'needs-review':0,unsupported:0},guidance:guidance[cause.layout]??guidance.block});
  const g=groups.get(key);g.issueIds.push(f.id);if(!g.categories.includes(f.category))g.categories.push(f.category);
  g.assessments[f.assessment??'probable']++;
  if(f.severity==='high')g.severity='high';
  const affected={scenario:state.scenario,step:state.step,viewport:state.viewport,url:state.url};if(!g.affected.some(v=>JSON.stringify(v)===JSON.stringify(affected)))g.affected.push(affected);
 }
 for(const group of groups.values()){group.issueIds=[...new Set(group.issueIds)];group.assessment='probable';}
 return [...groups.values()].sort((a,b)=>(b.severity==='high')-(a.severity==='high')||b.assessments.confirmed-a.assessments.confirmed||b.affected.length-a.affected.length||b.issueIds.length-a.issueIds.length||a.id.localeCompare(b.id));
}
