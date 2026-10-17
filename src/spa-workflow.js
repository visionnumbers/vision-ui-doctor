// Explicit, public, trusted-app interactions. This is NOT a network security boundary.
import {browserSession,sleep,withStageTimeout} from './cdp.js';
import {VIEWPORTS} from './audit.js';
import {guardPublicOptions,digest,usage,safeText} from './public-workflow.js';
import {normalizeRouteUrl,hasSensitiveUrlState} from './url.js';
import {buildLayoutSnapshotScript,detectLayoutIssues,findingId} from './detectors/layout.js';
import {isPaintedElement} from './detectors/visibility.js';
import {buildUxSnapshotScript,detectUxIssues,rootCauseCandidates,uxGeometryStamp} from './detectors/ux.js';
import {buildUsabilitySnapshotScript,detectUsability} from './detectors/usability.js';
import {waitForStableGeometry} from './state-stability.js';
import {buildExperienceSnapshotScript,detectExperience} from './detectors/experience.js';

const keys=(v,allowed)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!allowed.includes(k)))throw usage('Unknown or invalid public SPA configuration fields (values withheld)');};
const id=v=>{if(typeof v!=='string'||!/^[-a-zA-Z0-9_]{1,40}$/.test(v))throw usage('Use unique 1-40 character state IDs');return v;};
const selector=v=>{if(typeof v!=='string'||v.length>120||! /^(?:#[a-zA-Z_][\w-]*|\.[a-zA-Z_][\w-]*|\[data-testid="[\w-]+"\])$/.test(v)||/password|credential|token|secret/i.test(v))throw usage('Use a single non-sensitive #id, .class or [data-testid="name"] selector');return v;};
const list=v=>{if(!Array.isArray(v)||v.length>8||new Set(v).size!==v.length)throw usage('Expectations allow at most 8 unique selectors each');return v.map(selector);};
const safeUrl=(base,value)=>{const n=typeof value==='string'&&value.length<=2048?normalizeRouteUrl(base,value):null;if(!n||hasSensitiveUrlState(n.navigationUrl))throw usage('SPA URL must be public, non-sensitive and within the explicit base scope');return n.identity;};
function validateUx(ux){
 keys(ux,['regions','alignments','usability','experience','stabilizeMs']);
 if(ux.usability!==undefined&&typeof ux.usability!=='boolean')throw usage('UX usability must be an explicit boolean');
 if(ux.experience!==undefined&&typeof ux.experience!=='boolean')throw usage('UX experience must be an explicit boolean');
 if(ux.stabilizeMs!==undefined&&(!Number.isInteger(ux.stabilizeMs)||ux.stabilizeMs<250||ux.stabilizeMs>15000))throw usage('Explicit stabilization budget is 250-15000ms within the shared run deadline');
 const regions=ux.regions??[],alignments=ux.alignments??[];
 if(!Array.isArray(regions)||regions.length>20||!Array.isArray(alignments)||alignments.length>10)throw usage('UX checks allow at most 20 regions and 10 alignment expectations');
 const r=regions.map(v=>{keys(v,['selector','minWidthPx','allowOverlapWith']);selector(v.selector);const allowed=list(v.allowOverlapWith??[]);if(v.minWidthPx!==undefined&&(!Number.isInteger(v.minWidthPx)||v.minWidthPx<24||v.minWidthPx>2000))throw usage('Declared region minimum is 24-2000 CSS pixels');return {selector:v.selector,...(v.minWidthPx!==undefined?{minWidthPx:v.minWidthPx}:{}),allowOverlapWith:allowed};});
 if(new Set(r.map(x=>x.selector)).size!==r.length||r.some(v=>v.allowOverlapWith.some(s=>!r.some(x=>x.selector===s))))throw usage('UX regions must be unique and allowed overlaps reference declared regions');
 const a=alignments.map(v=>{keys(v,['id','selectors','axis','tolerancePx']);id(v.id);const selectors=list(v.selectors);if(selectors.length<2||!['left','right','top','bottom'].includes(v.axis)||!Number.isInteger(v.tolerancePx)||v.tolerancePx<0||v.tolerancePx>40)throw usage('Alignment needs 2-8 peers, a rectangle edge and 0-40px declared tolerance');return {id:v.id,selectors,axis:v.axis,tolerancePx:v.tolerancePx};});
 if(new Set(a.map(x=>x.id)).size!==a.length)throw usage('Duplicate alignment IDs');
 return {regions:r,alignments:a,...(ux.usability!==undefined?{usability:ux.usability}:{}),...(ux.experience!==undefined?{experience:ux.experience}:{}),...(ux.stabilizeMs!==undefined?{stabilizeMs:ux.stabilizeMs}:{})};
}
export function validateSpaConfig(input,{allowRemote=false}={}){
 keys(input,['schemaVersion','url','viewports','timeoutMs','scenarios','ux']);
 if(input.schemaVersion!==1||!Array.isArray(input.scenarios)||!input.scenarios.length||input.scenarios.length>10)throw usage('SPA schemaVersion 1 requires 1-10 explicit public scenarios');
 const common=guardPublicOptions({url:input.url,viewports:input.viewports,timeoutMs:input.timeoutMs??1500,allowRemote});
 if(common.timeoutMs>5000)throw usage('SPA step timeout must be 250-5000 ms');
 const scenarios=input.scenarios.map(s=>{
  keys(s,['id','route','steps']);id(s.id);
  if(!Array.isArray(s.steps)||!s.steps.length||s.steps.length>12)throw usage('Each SPA scenario requires 1-12 steps');
  const route=safeUrl(common.url,s.route);
  const steps=s.steps.map(step=>{
   keys(step,['id','click','purpose','visible','hidden','url']);id(step.id);selector(step.click);
   if(!['toggle','navigation','tab'].includes(step.purpose))throw usage('Every selected control needs purpose toggle, navigation or tab');
   const visible=list(step.visible??[]),hidden=list(step.hidden??[]);
   if(!visible.length&&!hidden.length&&!step.url||visible.some(x=>hidden.includes(x)))throw usage('Every click needs consistent visible, hidden or exact URL expectations');
   return {id:step.id,click:step.click,purpose:step.purpose,visible,hidden,...(step.url?{url:safeUrl(common.url,step.url)}:{})};
  });
  if(new Set(steps.map(x=>x.id)).size!==steps.length)throw usage('Duplicate step IDs');
  const selectors=new Set(steps.flatMap(x=>[x.click,...x.visible,...x.hidden]));if(selectors.size>40)throw usage('Scenario exceeds 40 observed selectors');
  return {id:s.id,route,steps};
 });
 if(new Set(scenarios.map(s=>s.id)).size!==scenarios.length||scenarios.some(s=>s.steps.some(x=>x.id==='initial')))throw usage('Duplicate/reserved scenario or step IDs');
 if(scenarios.reduce((n,s)=>n+s.steps.length+1,0)*common.viewports.length>100)throw usage('SPA run exceeds 100 planned viewport states');
 return {schemaVersion:1,url:common.url,viewports:common.viewports,timeoutMs:common.timeoutMs,scenarios,...(input.ux!==undefined?{ux:validateUx(input.ux)}:{})};
}

// Fixed engine-owned JS. Configuration contributes only JSON-literal selectors.
function observe(selectors){
 const elements=selectors.map(selector=>{
  const matches=document.querySelectorAll(selector),e=matches[0];
  if(!e)return {selector,exists:false,visible:false,count:0};
  const r=e.getBoundingClientRect(),s=getComputedStyle(e);
  const visible=isPaintedElement(e);
  const x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);
  const clipped=r.left<0||r.top<0||r.right>innerWidth||r.bottom>innerHeight;
  const reachable=visible&&s.pointerEvents!=='none'&&!e.closest('[inert]')&&!clipped&&!!hit&&(e===hit||e.contains(hit));
  const tag=e.tagName.toLowerCase(),role=e.getAttribute('role');
  const unsafe=!!e.form||!!e.closest('form,[contenteditable="true"]')||e.matches(':disabled,[aria-disabled="true"],[download],input,textarea,select')||e.hasAttribute('target')&&e.getAttribute('target')!=='_self'||!(['button','a'].includes(tag)||['button','tab','link'].includes(role))||/\b(delete|remove|submit|purchase|pay|logout|sign.?out|login|sign.?in)\b/i.test((e.textContent||'').slice(0,500)+' '+(e.getAttribute('aria-label')||''));
  return {selector,exists:true,count:matches.length,visible,reachable,clipped,pointerEvents:s.pointerEvents,inert:!!e.closest('[inert]'),unsafe,href:tag==='a'?e.href:null,rect:Object.fromEntries(['left','top','right','bottom','width','height'].map(k=>[k,Math.round(r[k])]))};
 });
 return {url:location.href,elements};
}
const script=selectors=>`(()=>{const isPaintedElement=${isPaintedElement.toString()};return (${observe.toString()})(${JSON.stringify(selectors)})})()`;
const planned=config=>config.scenarios.flatMap(s=>config.viewports.flatMap(viewport=>['initial',...s.steps.map(x=>x.id)].map(step=>({scenario:s.id,step,viewport}))));
const stateKey=s=>JSON.stringify([s.scenario,s.step,s.viewport]);
const observed=(snapshot,selector)=>snapshot?.elements.find(e=>e.selector===selector);
function issue(state,category,selector,evidence={}){
 return {id:findingId({category,route:state.scenario+'/'+state.step,viewport:state.viewport,selector}),category,selector,severity:'high',confidence:'high',evidence};
}
function numeric(value,depth=0){
 if(depth>4)return undefined;if(typeof value==='number'&&Number.isFinite(value))return value;
 if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
 return Object.fromEntries(Object.entries(value).filter(([k])=>/^[a-zA-Z]{1,40}$/.test(k)).map(([k,v])=>[k,numeric(v,depth+1)]).filter(([,v])=>v!==undefined));
}
function publicSnapshot(raw,base){
 const url=safeUrl(base,raw.url);
 return {url,elements:raw.elements.map(({href,unsafe,...e})=>e)};
}
function expectation(step,snap,base){
 if(safeUrl(base,snap.url)!== (step.url??safeUrl(base,snap.url)))return {category:'EXPECTED_URL_FAILED',selector:step.click};
 for(const s of [...step.visible,...step.hidden])if(observed(snap,s)?.count>1)return {category:'EXPECTED_SELECTOR_AMBIGUOUS',selector:s};
 for(const s of step.visible)if(!observed(snap,s)?.visible)return {category:'EXPECTED_VISIBLE_FAILED',selector:s};
 for(const s of step.hidden)if(observed(snap,s)?.visible)return {category:'EXPECTED_HIDDEN_FAILED',selector:s};
 return null;
}

export async function scanSpa(input,{chromium,allowRemote=false,browserFactory=browserSession,proofSelectors=[],captureImage}={}){
 const config=validateSpaConfig(input,{allowRemote});
 // Proof selectors are report-supplied untrusted data too.
 if(!Array.isArray(proofSelectors)||proofSelectors.length>10)throw usage('Select at most 10 verification issues');
 proofSelectors.forEach(s=>{if(typeof s!=='string'||! /^[#.\w >:[\]="()-]{1,250}$/.test(s)||safeText(s)!==s)throw usage('Invalid bounded proof selector');});
 if(captureImage!==undefined&&typeof captureImage!=='function')throw usage('Invalid local screenshot sink');
 const states=[],runDeadline=Date.now()+60000;let imageBytes=0;
 const browser=await browserFactory({chromium,timeout:10000,operationTimeout:config.timeoutMs,shutdownTimeout:5000});
 let browserVersion='UNVERIFIED';
 try{
  for(const scenario of config.scenarios)for(const viewport of config.viewports){
   let tab,failed=false;
   const selectors=[...new Set([...scenario.steps.flatMap(x=>[x.click,...x.visible,...x.hidden]),...(config.ux?.regions.map(r=>r.selector)??[]),...(config.ux?.alignments.flatMap(a=>a.selectors)??[]),...proofSelectors])];
   // Per-state command budgets share the run deadline. Cleanup retains its own existing budget.
   let deadline,stage='setup';
   const bounded=(fn,label='cdp')=>{stage=label;const left=Math.min(deadline,runDeadline)-Date.now();if(left<=0)throw Object.assign(Error('State deadline'),{code:'VUD_TIMEOUT'});return withStageTimeout(fn(),{stage:'SPA state',timeoutMs:left});};
   const snapshot=()=>bounded(()=>tab.evaluate(script(selectors)),'observe');
   for(const step of [{id:'initial'},...scenario.steps]){
    const state={scenario:scenario.id,step:step.id,viewport,status:failed?'skipped':'unknown',url:null,issues:[]};states.push(state);
    if(failed)continue;
    deadline=Math.min(runDeadline,Date.now()+config.timeoutMs);
    try{
     if(step.id==='initial'){
      tab=await bounded(()=>browser.tab());await bounded(()=>tab.send('Page.enable'));await bounded(()=>tab.send('Runtime.enable'));
      await bounded(()=>tab.send('Emulation.setDeviceMetricsOverride',{...VIEWPORTS[viewport],deviceScaleFactor:1,mobile:false}));
      await bounded(()=>tab.send('Page.navigate',{url:scenario.route}),'navigate');
      while(true){const ready=await bounded(()=>tab.evaluate('document.readyState'));if(ready==='complete'){const snap=await snapshot();if(safeUrl(config.url,snap.url)===scenario.route)break;}await sleep(25);}
      const version=await bounded(()=>tab.send('Browser.getVersion'));if(/^[A-Za-z]+\/[0-9.]{1,40}$/.test(version?.product))browserVersion=version.product;
      state.post=publicSnapshot(await snapshot(),config.url);state.url=state.post.url;
     }else{
      const pre=await snapshot();state.pre=publicSnapshot(pre,config.url);state.url=state.pre.url;
      const control=observed(pre,step.click);
      let problem=!control?.exists||control.count!==1?'CONTROL_MISSING_OR_AMBIGUOUS':control.unsafe?'CONTROL_NOT_SAFE':!control.visible?'CONTROL_HIDDEN':control.inert?'CONTROL_INERT':control.pointerEvents==='none'?'CONTROL_POINTER_EVENTS_DISABLED':control.clipped?'CONTROL_CLIPPED':!control.reachable?'CONTROL_OCCLUDED':null;
      if(control?.href){const target=safeUrl(config.url,control.href);if(!step.url||target!==step.url)problem='CONTROL_DESTINATION_NOT_DECLARED';}
      if(problem){state.issues.push(issue(state,problem,step.click,control?.rect?{rect:control.rect}:{}));state.post=state.pre;}
      else{
       const {left,top,width,height}=control.rect,x=left+width/2,y=top+height/2;
       for(const [type,buttons] of [['mouseMoved',0],['mousePressed',1],['mouseReleased',0]])await bounded(()=>tab.send('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons,clickCount:type==='mouseMoved'?0:1}));
       let post,unmet;const assertionDeadline=Date.now()+Math.max(0,(deadline-Date.now())*.7);
       do{post=await snapshot();unmet=expectation(step,post,config.url);if(!unmet)break;if(Date.now()+30>=assertionDeadline)break;await sleep(25);}while(true);
       state.post=publicSnapshot(post,config.url);state.url=state.post.url;
       if(unmet)state.issues.push(issue(state,unmet.category,unmet.selector));
      }
     }
     // Wait BEFORE measuring layout: never keep transient findings from an earlier DOM.
     let stable=true,measured;
     if(config.ux){
      if(config.ux.stabilizeMs)deadline=Math.min(runDeadline,deadline+config.ux.stabilizeMs);
      const budget=Math.max(1,Math.min(config.ux.stabilizeMs??1500,deadline-Date.now()-400));
      const expression=buildUxSnapshotScript(config.ux,selectors);
      const settled=await waitForStableGeometry({sample:()=>bounded(()=>tab.evaluate(expression),'ux-stabilization'),stamp:uxGeometryStamp,timeoutMs:budget});
      stable=settled.stable;measured=settled.value;
      state.ux={stable,stabilityWindowMs:160,samples:settled.samples,elapsedMs:settled.elapsedMs,activeAnimations:measured.activeAnimations,visibleRegions:measured.regions.filter(r=>r.visible).length,hiddenOrMissing:measured.regions.filter(r=>!r.visible).map(r=>r.selector),regions:measured.regions,alignments:measured.alignments,checks:measured.checks};
      state.auditIncomplete=!!(measured.checks.missing.length||measured.checks.ambiguous.length);
      if(!stable){state.failure='MEASURED_GEOMETRY_UNSTABLE';state.issues.push(issue(state,'STATE_UNSTABLE','html'));}
     }
     if(stable){
      const layoutSnapshot=await bounded(()=>tab.evaluate(buildLayoutSnapshotScript()),'layout');
      const layout=detectLayoutIssues(layoutSnapshot);state.layoutCheckedElements=layoutSnapshot.checkedElements??0;
      state.diagnostics=layout.diagnostics.map(f=>({id:findingId({category:f.originalCategory??f.category,route:state.scenario+'/'+state.step,viewport,selector:f.selector}),category:f.category,selector:safeText(f.selector),classification:f.classification??'intentional',assessment:f.assessment??'confirmed',evidence:numeric(f.evidence),...(f.originalCategory?{originalCategory:f.originalCategory,reason:'paired-textarea-presentation',synchronization:'unsupported'}:{})}));
      for(const f of layout.issues)state.issues.push({...issue(state,f.category,safeText(f.selector),numeric(f.evidence)),severity:f.severity,confidence:f.confidence});
      if(config.ux){
       state.post=publicSnapshot(await snapshot(),config.url);state.url=state.post.url;
       if(step.id!=='initial'){const unmet=expectation(step,state.post,config.url);if(unmet)state.issues.push(issue(state,unmet.category,unmet.selector));}
       measured=await bounded(()=>tab.evaluate(buildUxSnapshotScript(config.ux,[...selectors,...state.issues.map(f=>f.selector)])),'ux-measurement');
       for(const f of state.issues){const c=measured.contexts.find(c=>c.selector===f.selector);if(c)f.cause={ancestor:safeText(c.ancestor),layout:c.layout};}
       for(const f of detectUxIssues(measured)){
       const next={...issue(state,f.category,f.selector,numeric(f.evidence)),severity:f.severity,confidence:f.confidence,cause:f.cause};
       // Pair/expectation identity distinguishes multiple issues on the same element.
       next.id=findingId({category:f.category,route:state.scenario+'/'+state.step+'/'+(f.cause.related??'')+'/'+(f.cause.expectation??''),viewport,selector:f.selector});state.issues.push(next);
       }
       if(config.ux.usability){
        const result=detectUsability(await bounded(()=>tab.evaluate(buildUsabilitySnapshotScript()),'usability'));
        state.detectorCoverage=result.coverage;if(result.coverage.truncated||result.coverage.issueOmitted)state.auditIncomplete=true;
        state.diagnostics.push(...result.diagnostics.map(f=>({...f,selector:safeText(f.selector)})));
        for(const f of result.issues)state.issues.push({...issue(state,f.category,safeText(f.selector),numeric(f.evidence)),severity:f.severity,confidence:f.confidence,assessment:f.assessment,explanation:f.explanation,suggestion:f.suggestion});
       }
       if(config.ux.experience){
        const result=detectExperience(await bounded(()=>tab.evaluate(buildExperienceSnapshotScript(config.ux)),'experience'));
        state.experienceCoverage=result.coverage;if(result.coverage.truncated||result.coverage.omitted)state.auditIncomplete=true;
        for(const f of result.issues)state.issues.push({...issue(state,f.category,safeText(f.selector),numeric(f.evidence)),severity:f.severity,confidence:f.confidence,assessment:f.assessment,suggestion:f.suggestion,cause:{...f.cause,ancestor:safeText(f.cause.ancestor),...(f.cause.related?{related:safeText(f.cause.related)}:{})}});
       }
      }
      }
     state.rawFindingCount=state.issues.length+(state.diagnostics??[]).filter(d=>d.originalCategory).length;
     const unique=new Map();for(const f of state.issues){f.assessment??=/^STATE_/.test(f.category)?'unsupported':/^(CONTROL_|EXPECTED_)/.test(f.category)?'confirmed':'probable';const old=unique.get(f.id);if(old)old.observationCount=(old.observationCount??1)+1;else unique.set(f.id,f);}state.issues=[...unique.values()];
     if(state.layoutCheckedElements>4000){state.failure='DOM_LIMIT_REACHED';state.issues.push(issue(state,'STATE_INCOMPLETE','html'));}
     if(captureImage){
      const image=await bounded(()=>tab.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}),'screenshot');
      if(typeof image.data!=='string'||image.data.length>12*1024*1024)throw Error('Screenshot bound');
      const data=Buffer.from(image.data,'base64');imageBytes+=data.length;if(imageBytes>32*1024*1024)throw Error('Run screenshot budget');
      const file='state-'+digest([state.scenario,state.step,viewport]).slice(0,16)+'.png';
      await bounded(()=>captureImage(file,data));state.screenshot={file,...VIEWPORTS[viewport],regions:(state.post?.elements??[]).filter(e=>e.visible&&e.rect).map(e=>({selector:e.selector,rect:e.rect}))};
     }
     state.status=state.failure||state.issues.some(f=>/^(CONTROL_|EXPECTED_)/.test(f.category)&&f.assessment==='confirmed')?'failed':'audited';
     failed=state.status!=='audited';
    }catch(error){
     state.status='failed';state.failure='STATE_TIMEOUT_OR_UNSAFE_NAVIGATION_OR_CDP_FAILURE';state.failureStage=stage;state.failureCode=error.code==='VUD_TIMEOUT'?'TIMEOUT':error.code==='LP1_USAGE'?'UNSAFE_INPUT_OR_URL':'CDP_OR_ARTIFACT';state.issues.push(issue(state,'STATE_INCOMPLETE',step.click??'html'));failed=true;
    }
   }
   // Never convert cleanup errors to findings/success.
   if(tab)await tab.close();
  }
 }finally{await browser.close();}
 return {kind:'public-spa',schemaVersion:1,authAllowed:false,networkIsolation:'NONE',mode:'LOCAL_TRUSTED',browserVersion,config,states,runId:digest({config,states}),...(config.ux?{detectorsVersion:config.ux.experience?'ux-experience-3':'ux-accuracy-2',rootCauseCandidates:rootCauseCandidates(states)}:{})};
}

export function spaStates(run){
 if(run?.kind!=='public-spa'||run.schemaVersion!==1||run.authAllowed!==false||run.networkIsolation!=='NONE')throw usage('Expected public SPA run schema 1');
 const config=validateSpaConfig(run.config,{allowRemote:true});
 if(!Array.isArray(run.states)||run.states.length>100)throw usage('Invalid bounded SPA states');
 const expected=planned(config),seen=new Set();
 for(const s of run.states){const key=stateKey(s);if(seen.has(key)||!expected.some(p=>stateKey(p)===key)||!['audited','failed','skipped','unknown'].includes(s.status)||!Array.isArray(s.issues)||s.issues.length>(config.ux?.experience?130:config.ux?.usability?110:config.ux?70:40))throw usage('Invalid or duplicate SPA report state');seen.add(key);}
 return expected.map(p=>({...p,...run.states.find(s=>stateKey(s)===stateKey(p)),status:run.states.find(s=>stateKey(s)===stateKey(p))?.status??'unknown'}));
}
export function spaIssues(run,ids){
 const all=spaStates(run).flatMap(state=>(state.issues??[]).map(finding=>({state,finding}))),seen=new Set();
 for(const {finding:f} of all){
  if(!/^vud-[a-f0-9]{16}$/.test(f.id)||seen.has(f.id))throw usage('Invalid SPA issue IDs');seen.add(f.id);
  if(f.assessment!==undefined&&!['confirmed','probable','needs-review','unsupported'].includes(f.assessment))throw usage('Invalid diagnostic confidence classification');
  if(!/^[A-Z_]{1,60}$/.test(f.category)||!['high','medium','low'].includes(f.severity)||!['high','medium','low'].includes(f.confidence)||typeof f.selector!=='string'||! /^[#.\w >:[\]="()-]{1,250}$/.test(f.selector)||safeText(f.selector)!==f.selector)throw usage('Invalid SPA issue fields');
  if(f.cause){keys(f.cause,['ancestor','related','layout','expectation']);if(!['flex','grid','clip','block','overlap','alignment'].includes(f.cause.layout))throw usage('Invalid root candidate context');for(const name of ['ancestor','related','expectation'])if(f.cause[name]!==undefined&&(typeof f.cause[name]!=='string'||f.cause[name].length>250||safeText(f.cause[name])!==f.cause[name]))throw usage('Invalid root candidate identity');}
 }
 if(ids===undefined)return all;
 if(!Array.isArray(ids)||!ids.length||ids.length>10||new Set(ids).size!==ids.length)throw usage('Select 1-10 unique SPA issue IDs');
 return ids.map(id=>{const found=all.find(x=>x.finding.id===id);if(!found)throw usage('SPA issue ID not found');return found;});
}
export function spaPacket(run,{issueIds,maxIssues=10,maxBytes=16384}={}){
 if(!Number.isInteger(maxIssues)||maxIssues<1||maxIssues>10||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>16384)throw usage('Packet bounds: 1-10 issues, at most 16 KiB');
 const states=spaStates(run);let all=spaIssues(run,issueIds);
 if(run.config.ux&&!issueIds){
  const priority=f=>(/^(STATE_|EXPECTED_)/.test(f.category)?-10:0)+({high:0,medium:4,low:8}[f.severity]??8)+({confirmed:0,probable:1,'needs-review':2,unsupported:3}[f.assessment??'probable']??1);
  const sorted=[...all].sort((a,b)=>priority(a.finding)-priority(b.finding));const seen=new Set(),representatives=[],repeated=[];
  for(const item of sorted){const key=JSON.stringify([item.finding.category,item.finding.cause?.ancestor??item.finding.selector]);if(seen.has(key))repeated.push(item);else{seen.add(key);representatives.push(item);}}
  const categories=new Set(),firstCategories=[],otherRoots=[];for(const item of representatives){if(categories.has(item.finding.category))otherRoots.push(item);else{categories.add(item.finding.category);firstCategories.push(item);}}
  all=[...firstCategories,...otherRoots,...repeated];
 }
 const group=({state:s,finding:f})=>digest([s.url,f.category,f.selector]).slice(0,16);
 const issues=all.slice(0,maxIssues).map(({state:s,finding:f})=>({id:f.id,category:f.category,severity:f.severity,confidence:f.confidence,selector:safeText(f.selector),scenario:s.scenario,step:s.step,viewport:s.viewport,stateFingerprint:digest([run.config,s.scenario,s.step,s.viewport,s.url,run.detectorsVersion??'layout-1']),url:s.url,groupId:group({state:s,finding:f}),evidence:numeric(f.evidence),...(f.cause?{layoutContext:{ancestor:safeText(f.cause.ancestor),layout:f.cause.layout,...(f.cause.related?{relatedSelector:safeText(f.cause.related)}:{}),...(f.cause.expectation?{expectation:safeText(f.cause.expectation)}:{})}}:{})}));
 const packet={schemaVersion:1,kind:'public-spa',authAllowed:false,networkIsolation:'NONE',coverage:{scope:'Only explicitly configured public scenarios and viewports; no arbitrary interaction discovery',states:states.map(s=>({scenario:s.scenario,step:s.step,viewport:s.viewport,status:s.auditIncomplete&&s.status==='audited'?'partial':s.status})),incomplete:states.filter(s=>s.status!=='audited'||s.auditIncomplete).length},issues,omitted:all.length-issues.length,metrics:{bytes:0,estimatedTokens:0,browserCacheHits:0}};
 // Read reports are untrusted: never echo arbitrary text fields from them.
 for(const f of issues){if(!/^[A-Z_]{1,60}$/.test(f.category)||!['high','medium','low'].includes(f.severity)||!['high','medium','low'].includes(f.confidence))throw usage('Invalid SPA finding');if(f.url)f.url=safeUrl(run.config.url,f.url);if(f.selector!=='html'&&!/^[#.\w >:[\]="()-]{1,250}$/.test(f.selector))throw usage('Invalid finding selector');}
 const roots=rootCauseCandidates(states);
 if(['ux-accuracy-2','ux-experience-3'].includes(run.detectorsVersion)){
  packet.findingSummary={raw:states.reduce((n,s)=>n+(Number.isSafeInteger(s.rawFindingCount)?s.rawFindingCount:s.issues?.length??0),0),reported:spaIssues(run).length,intentionalObservations:states.reduce((n,s)=>n+(s.diagnostics??[]).filter(d=>d.classification==='intentional').length,0),intentionalCandidates:states.reduce((n,s)=>n+(s.diagnostics??[]).filter(d=>d.classification==='intentional-candidate').length,0),assessments:Object.fromEntries(['confirmed','probable','needs-review','unsupported'].map(a=>[a,spaIssues(run).filter(x=>(x.finding.assessment??'probable')===a).length]))};
  const total=key=>states.reduce((n,s)=>n+(Number.isSafeInteger(s.detectorCoverage?.[key])?s.detectorCoverage[key]:0),0);
  packet.detectorCoverage={geometry:'bounded',scrollAndVisibility:'bounded',animation:'bounded-observation',usability:run.config.ux?.usability?'bounded':'not-requested',measuredUsabilityStates:states.filter(s=>s.detectorCoverage).length,plannedStates:states.length,examinedElements:total('examined'),measuredContrast:total('contrastMeasured'),unsupportedContrast:total('unsupportedContrast'),omittedNewFindings:total('issueOmitted'),unsupported:['keyboard-traversal','focus-appearance','composited-contrast','scroll-trap-execution','typography-hierarchy','automatic-component-consistency','full-visual-understanding']};
  const advice={LOW_TEXT_CONTRAST:'Increase text/background contrast; only opaque sRGB combinations were measured.',TEXT_CONTENT_CLIPPED:'Inspect wrapping and clip dimensions; preserve accessible expansion if truncation is intended.',FORM_LABEL_MISSING:'Associate a non-empty label; placeholder alone is not a label.',FORM_ERROR_NOT_ASSOCIATED:'Associate meaningful error feedback and verify announcements separately.',SMALL_CROWDED_TARGET:'Increase hit area or spacing; isolated and inline small targets were excluded.',CONTROL_NOT_KEYBOARD_REACHABLE:'Use native button semantics or implement focus and keyboard operation.',HIDDEN_CONTROL_IN_TAB_ORDER:'Remove collapsed controls from the tab order and restore them when visible.',FIXED_OVERLAY_BLOCKS_CONTROL:'Inspect fixed/sticky layering and reserved content space.'};
  for(const item of issues){const source=all.find(x=>x.finding.id===item.id)?.finding;item.assessment=source?.assessment??(/^STATE_/.test(item.category)?'unsupported':'probable');if(advice[item.category])item.guidance=advice[item.category];}
 }
 if(run.config.ux?.experience){
  packet.experienceCoverage={classification:'heuristic-layout-symptoms',measuredStates:states.filter(s=>s.experienceCoverage).length,plannedStates:states.length,truncatedStates:states.filter(s=>s.experienceCoverage?.truncated).length,omitted:states.reduce((n,s)=>n+(Number.isSafeInteger(s.experienceCoverage?.omitted)?s.experienceCoverage.omitted:0),0)};
  const advice={INLINE_PROSE_FRAGMENTATION:'Inspect prose parent display and keep inline semantic tokens in normal text flow.',CONTENT_SPACE_STARVATION:'Review pane sizing and reserved controls using measured readable lines.',EXCESSIVE_CONTROL_WRAPPING:'Review toolbar wrapping and orphan action rows; confirm grouping intent.',TEXT_BADGE_COLLISION:'Inspect text min-width/shrink, badge sizing and stacking; retain valid ellipsis.',MOBILE_CHROME_DENSITY:'Review header/control height together with the remaining usable content area.'};
  for(const item of issues)if(advice[item.category])item.guidance=advice[item.category];
 }
 for(const f of issues){const state=states.find(s=>s.scenario===f.scenario&&s.step===f.step&&s.viewport===f.viewport);if(/^state-[a-f0-9]{16}\.png$/.test(state?.screenshot?.file)){const region=state.screenshot.regions?.find(r=>r.selector===f.selector);f.visualEvidence={file:state.screenshot.file,rect:region?numeric(region.rect):null,localOnly:true};}}
 function size(){
  packet.groups=[...new Set(issues.map(i=>i.groupId))].map(id=>({id,issueIds:issues.filter(i=>i.groupId===id).map(i=>i.id),occurrencesInSelection:all.filter(i=>group(i)===id).length}));
  if(run.config.ux)packet.rootCauseCandidates=roots.filter(r=>r.issueIds.some(id=>issues.some(i=>i.id===id))).slice(0,5).map(r=>({id:r.id,ancestor:safeText(r.ancestor),layout:['flex','grid','clip','alignment','overlap','block'].includes(r.layout)?r.layout:'block',confidence:'medium',status:r.status,severity:r.severity,representativeIssueIds:r.issueIds.filter(id=>issues.some(i=>i.id===id)).slice(0,3),totalIssues:r.issueIds.length,affected:r.affected.slice(0,5).map(a=>({...a,url:a.url?safeUrl(run.config.url,a.url):null})),affectedOmitted:Math.max(0,r.affected.length-5),guidance:r.guidance}));
  for(let n=0;n<8;n++){packet.metrics.bytes=Buffer.byteLength(JSON.stringify(packet));packet.metrics.estimatedTokens=Math.ceil(packet.metrics.bytes/4);}return Buffer.byteLength(JSON.stringify(packet));
 }
 while(size()>maxBytes&&issues.length){issues.pop();packet.omitted++;}
 if(size()>maxBytes)throw usage('Coverage exceeds packet budget; narrow scenario scope');
 return packet;
}
export function compareSpaRuns(baseline,fresh,ids){
 const selected=spaIssues(baseline,ids),freshStates=spaStates(fresh),freshIssues=spaIssues(fresh),same=digest(baseline.config)===digest(fresh.config)&&(baseline.detectorsVersion??'layout-1')===(fresh.detectorsVersion??'layout-1');
 const old=new Set(spaIssues(baseline).map(x=>x.finding.id));
 const imageRef=s=>/^state-[a-f0-9]{16}\.png$/.test(s?.screenshot?.file)?s.screenshot.file:null;
 const visuals=selected.map(({state,finding})=>{const next=freshStates.find(s=>stateKey(s)===stateKey(state));return {issueId:finding.id,before:imageRef(state),after:imageRef(next)};});
 return {browserCacheHits:0,visualEvidence:{method:'local-viewport-references-only',pixelDiffImplemented:false,pairs:visuals},coverageIncomplete:freshStates.filter(s=>s.status!=='audited'||s.auditIncomplete).length,selected:selected.map(({state,finding})=>{
  const next=freshStates.find(s=>stateKey(s)===stateKey(state));
  const witness=[...(next?.pre?.elements??[]),...(next?.post?.elements??[])].some(e=>e.selector===finding.selector&&e.exists);
  const status=!same?'unknown':freshIssues.some(x=>x.finding.id===finding.id)?'persistent':next?.status==='audited'&&!next.auditIncomplete&&witness?'resolved-for-this-check':'unknown';
  return {id:finding.id,status};
 }),newIssues:freshIssues.filter(x=>!old.has(x.finding.id)).map(({finding,state})=>({id:finding.id,category:finding.category,scenario:state.scenario,step:state.step,viewport:state.viewport})),scope:'All configured states freshly replayed; not a universal regression guarantee'};
}
