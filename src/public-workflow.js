import {createHash} from 'node:crypto';
import {audit,VIEWPORTS} from './audit.js';
import {normalizeRouteUrl,routeFromUrl,hasSensitiveUrlState} from './url.js';
import {redactSensitiveText} from './url.js';
import {browserSession,withStageTimeout} from './cdp.js';

export const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export function usage(message){return Object.assign(new Error(message),{code:'LP1_USAGE'});}

// Public opt-in is a trust assumption, NEVER attestation of network isolation.
export function guardPublicOptions(input={}){
 if(input.allowRemote!==undefined&&typeof input.allowRemote!=='boolean'||input.screenshots!==undefined&&typeof input.screenshots!=='boolean'||input.authAllowed!==undefined&&input.authAllowed!==false)throw usage('Public consent/screenshots must be booleans and authAllowed must remain false');
 if(['credentials','cookies','storageState','username','password','usernameEnv','passwordEnv','userEnv','passEnv'].some(key=>input[key]!==undefined))throw usage('Public workflow does not accept credentials or authentication state');
 if(input.mode&&input.mode!=='LOCAL_TRUSTED'||input.login||input.auth||input.authProject||input.endpointFile||input.backend?.length||input.journeys?.length)throw usage('Public workflow rejects authentication, backend execution, journeys and unavailable isolation modes');
 let target;try{target=new URL(input.url);}catch{throw usage('Provide a valid public HTTP(S) URL');}
 if(!['http:','https:'].includes(target.protocol)||target.username||target.password||hasSensitiveUrlState(target.href))throw usage('Public target must be HTTP(S), without credentials or sensitive query state');
 if(!input.allowRemote&&!['localhost','127.0.0.1','[::1]'].includes(target.hostname))throw usage('Remote public targets require explicit --allow-remote authorization');
 const routes=input.routes??[routeFromUrl(target.href)],viewports=input.viewports??['small','desktop'];
 const timeoutMs=input.timeoutMs??10000,concurrency=input.concurrency??1,waitMs=input.waitMs??550;
 if(!Array.isArray(routes)||!routes.length||routes.length>100||!Array.isArray(viewports)||!viewports.length||viewports.length>5||viewports.some(v=>!Object.hasOwn(VIEWPORTS,v)))throw usage('Use 1-100 public routes and supported viewports');
 if(!Number.isInteger(timeoutMs)||timeoutMs<250||timeoutMs>60000||!Number.isInteger(concurrency)||concurrency<1||concurrency>8||!Number.isInteger(waitMs)||waitMs<0||waitMs>10000)throw usage('Invalid timeout, concurrency or readiness wait bounds');
 const canonical=routes.map(route=>{
  if(typeof route!=='string'||route.length>2048)throw usage('Routes must be bounded public URL strings, not protected declarations');
  const value=normalizeRouteUrl(target.href,route);
  if(!value||hasSensitiveUrlState(value.navigationUrl))throw usage('Route is unsafe, sensitive or outside the authorized target scope');
  return routeFromUrl(value.identity);
 });
 return {mode:'LOCAL_TRUSTED',authAllowed:false,networkIsolation:'NONE',url:target.href,routes:[...new Set(canonical)],viewports:[...new Set(viewports)],timeoutMs,concurrency,waitMs,allowRemote:input.allowRemote===true,screenshots:input.screenshots===true};
}

export async function scanPublic(input,{auditFn=audit,browserFactory=browserSession,proofTargets=[]}={}){
 const options=guardPublicOptions(input);
 const selectorProofs=[];let browserVersion='UNVERIFIED';
 const observedFactory=async browserOptions=>{
  const browser=await browserFactory(browserOptions);
  // Decorate only owned sessions. Collection is bounded and occurs before their existing close.
  return {...browser,tab:async()=>{
   const session=await browser.tab();let closePromise;
   return {...session,close:()=>closePromise??=(async()=>{
    try{
     if(browserVersion==='UNVERIFIED'){
      const version=await withStageTimeout(session.send('Browser.getVersion'),{stage:'Public browser provenance',timeoutMs:options.timeoutMs});
      if(/^[A-Za-z]+\/[0-9.]{1,40}$/.test(version?.product))browserVersion=version.product;
     }
     if(proofTargets.length){
      const selectors=proofTargets.map(t=>({id:t.finding.id,selector:t.finding.selector}));
      const value=await withStageTimeout(session.evaluate(`(()=>{const items=${JSON.stringify(selectors)};return {url:location.href,width:innerWidth,height:innerHeight,items:items.map(i=>{try{return {id:i.id,exists:!!document.querySelector(i.selector)}}catch{return {id:i.id,exists:false}}})}})()`),{stage:'Public selector witness',timeoutMs:options.timeoutMs});
      const actual=normalizeRouteUrl(options.url,value.url)?.identity;
      for(const target of proofTargets)if(actual===target.state.requested&&value.width===VIEWPORTS[target.state.viewport].width&&value.height===VIEWPORTS[target.state.viewport].height){
       selectorProofs.push({route:target.state.route,viewport:target.state.viewport,id:target.finding.id,exists:value.items.some(i=>i.id===target.finding.id&&i.exists)});
      }
     }
    }catch{/* Missing witness means UNKNOWN, not resolution. No raw browser diagnostics exported. */}
    finally{await session.close();}
   })()};
  }};
 };
 // Navigation deadlines must not accidentally become a 1s Chrome startup budget.
 const report=await auditFn({...options,browserStartupTimeoutMs:Math.max(10000,options.timeoutMs),out:input.out,chromium:input.chromium,login:null,backend:[],browserFactory:observedFactory});
 return {schemaVersion:1,mode:options.mode,authAllowed:false,networkIsolation:'NONE',options,runId:digest({options,report}),browserVersion,selectorProofs,report};
}

export function safeText(value,max=250){
 return redactSensitiveText(String(value??'')).replace(/(?:Bearer\s+\S+|(?:password|secret|token|api[_-]?key|authorization)\s*[:=]\s*[^\s,;]+)/gi,'[WITHHELD]').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,max);
}

export function publicStates(run){
 if(run?.schemaVersion!==1||run.authAllowed===true||run.report?.authentication||run.report?.schemaVersion!==3||!Array.isArray(run.report.pages)||run.report.pages.length>500)throw usage('Expected a bounded public-run.json schema 1 containing public report schema 3');
 const options=guardPublicOptions(run.options),seen=new Set();
 for(const page of run.report.pages){
  if(!page||page.access==='protected'||!options.routes.includes(page.route)||!options.viewports.includes(page.viewport)||!Array.isArray(page.issues)||page.issues.length>200)throw usage('Report pages must match the authorized public run scope');
  const key=JSON.stringify([page.route,page.viewport]);if(seen.has(key))throw usage('Duplicate report state');seen.add(key);
 }
 return options.routes.flatMap(route=>options.viewports.map(viewport=>{
  const page=run.report.pages.find(p=>p.route===route&&p.viewport===viewport);
  const requested=normalizeRouteUrl(options.url,route).identity;
  const actual=typeof page?.url==='string'&&!hasSensitiveUrlState(page.url)?normalizeRouteUrl(options.url,page.url)?.identity:null;
  const status=page?.status==='audited'&&!page.incomplete&&!page.error&&actual===requested?'audited':['failed','blocked','skipped'].includes(page?.status)?page.status:'unknown';
  const state={route,viewport,dimensions:{...VIEWPORTS[viewport],dpr:1},status,requested,actual:actual??null,explicitState:'document',fingerprint:digest([requested,actual,VIEWPORTS[viewport],1,'document',options,run.report.version,'lp1-detectors-1'])};
  return {...state,page};
 }));
}

export function publicIssues(run){
 const issues=[];const seen=new Set();
 for(const state of publicStates(run))for(const finding of state.page?.issues??[]){
  if(!/^vud-[a-f0-9]{16}$/.test(finding.id)||seen.has(finding.id))throw usage('Findings require unique stable vud issue IDs');
  seen.add(finding.id);issues.push({finding,state});
 }
 return issues;
}

export function selectedIssues(run,ids){
 const issues=publicIssues(run);
 if(ids===undefined)return issues;
 if(!Array.isArray(ids)||!ids.length||ids.length>100||new Set(ids).size!==ids.length)throw usage('Select 1-100 unique issue IDs');
 const selected=ids.map(id=>issues.find(item=>item.finding.id===id));
 if(selected.some(item=>!item))throw usage('Issue ID not found in this baseline; obtain IDs from its packet');
 return selected;
}

function numericEvidence(value,depth=0){
 if(depth>3)return undefined;
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
 return Object.fromEntries(Object.entries(value).slice(0,20).filter(([key])=>/^[a-zA-Z][a-zA-Z0-9]{0,30}$/.test(key)).map(([key,item])=>[key,numericEvidence(item,depth+1)]).filter(([,item])=>item!==undefined));
}

function packetIssue({finding,state}){
 return {id:finding.id,route:state.route,viewport:state.viewport,stateFingerprint:state.fingerprint,category:/^[A-Z_]{1,64}$/.test(finding.category)?finding.category:'UNKNOWN',severity:['high','medium','low'].includes(finding.severity)?finding.severity:'unknown',confidence:['high','medium','low'].includes(finding.confidence)?finding.confidence:'unknown',selector:safeText(finding.selector),evidence:numericEvidence(finding.evidence)||{}};
}

export function createPacket(run,{issueIds,maxIssues=10,maxBytes=16384}={}){
 if(!Number.isInteger(maxIssues)||maxIssues<1||maxIssues>10||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>16384)throw usage('Packet limits are 1-10 issues and at most 16384 UTF-8 bytes');
 const states=publicStates(run),issues=selectedIssues(run,issueIds);
 const packet={schemaVersion:1,mode:'LOCAL_TRUSTED',authAllowed:false,networkIsolation:'NONE',runId:digest({options:run.options,report:run.report}),provenance:{tool:'vision-ui-doctor',reportSchema:3,detectors:'lp1-detectors-1',browserVersion:/^[A-Za-z]+\/[0-9.]{1,40}$/.test(run.browserVersion)?run.browserVersion:'UNVERIFIED',configHash:digest(guardPublicOptions(run.options))},coverage:{inventory:'explicit routes only; undiscovered app states unknown',incomplete:states.filter(s=>s.status!=='audited').length,states:states.map(({page,...state})=>state)},issues:issues.slice(0,maxIssues).map(packetIssue),omitted:0,nextIssueId:null,artifacts:['report.json','report.html'],metrics:{bytes:0,estimatedTokens:0,tokenEstimateMethod:'UTF-8 bytes / 4 heuristic; not provider usage'}};
 // Recompute self-describing sizes until digit lengths stabilize.
 const measure=()=>{for(let i=0;i<8;i++){const bytes=Buffer.byteLength(JSON.stringify(packet));if(packet.metrics.bytes===bytes)break;packet.metrics.bytes=bytes;packet.metrics.estimatedTokens=Math.ceil(bytes/4);}return Buffer.byteLength(JSON.stringify(packet));};
 while(true){
  packet.omitted=issues.length-packet.issues.length;packet.nextIssueId=issues[packet.issues.length]?.finding.id??null;
  if(measure()<=maxBytes)return packet;
  if(!packet.issues.length)throw usage('Coverage metadata exceeds packet budget; reduce route/viewport scope or increase budget up to 16384 bytes');
  packet.issues.pop();
 }
}

export function compareRuns(baseline,fresh,issueIds){
 const selected=selectedIssues(baseline,issueIds),states=publicStates(fresh),freshIssues=publicIssues(fresh),oldIds=new Set(publicIssues(baseline).map(i=>i.finding.id));
 const selectedResults=selected.map(({finding,state})=>{
  const after=states.find(s=>s.route===state.route&&s.viewport===state.viewport);
  let status='unknown';
  if(after?.status==='blocked')status='blocked';
  else if(state.status==='audited'&&after?.status==='audited'&&state.actual===state.requested&&after.actual===state.actual&&digest(guardPublicOptions(baseline.options))===digest(guardPublicOptions(fresh.options))){
   if(freshIssues.some(i=>i.finding.id===finding.id))status='persistent';
   else if(fresh.selectorProofs?.some(p=>p.route===state.route&&p.viewport===state.viewport&&p.id===finding.id&&p.exists===true))status='resolved-for-this-check';
  }
  return {id:finding.id,route:state.route,viewport:state.viewport,status};
 });
 return {schemaVersion:1,baselineRunId:digest({options:baseline.options,report:baseline.report}),freshRunId:digest({options:fresh.options,report:fresh.report}),scope:'all configured public routes/viewports; dependencies unproven',browserCacheHits:0,coverageIncomplete:states.filter(s=>s.status!=='audited').length,selected:selectedResults,newIssues:freshIssues.filter(i=>!oldIds.has(i.finding.id)).map(packetIssue)};
}

export async function verifyPublic(baseline,{issueIds,out,chromium,allowRemote=false}={},dependencies={}){
 // Persisted consent is NOT authorization for a later remote scan.
 const input={...baseline.options,allowRemote,out,chromium};guardPublicOptions(input);publicStates(baseline);
 const proofTargets=selectedIssues(baseline,issueIds);
 if(proofTargets.length>10)throw usage('Verify at most 10 selected issue IDs per request');
 const fresh=await scanPublic(input,{...dependencies,proofTargets});
 return {fresh,comparison:compareRuns(baseline,fresh,issueIds)};
}

export function classifyPublicError(error){
 const children=Array.isArray(error?.errors)?error.errors.slice(0,8):[error];
 return children.map(item=>{
  const match=/^Browser process-tree shutdown failed: taskkill exit code (\d+)$/.exec(item?.message??'');
  if(match)return {category:'OWNED_TREE_STOP_FAILED',exitCode:Number(match[1])};
  if(item?.code==='VUD_TIMEOUT')return {category:'TIMEOUT',stage:['Browser process streams shutdown','Browser startup','Public selector witness','Public browser provenance'].includes(item.stage)?item.stage:'bounded browser operation'};
  if(item?.stage==='Browser profile cleanup')return {category:'PROFILE_CLEANUP_FAILED',code:['EBUSY','EPERM','ENOTEMPTY'].includes(item.code)?item.code:'UNKNOWN',profile:'RETAINED'};
  return {category:'RUNTIME_FAILURE',details:'WITHHELD'};
 });
}
