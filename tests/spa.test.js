import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSpaConfig,spaPacket,compareSpaRuns,scanSpa} from '../src/spa-workflow.js';
import {runPublicCli} from '../src/public-cli.js';

export const config=()=>({schemaVersion:1,url:'http://127.0.0.1:4173/',viewports:['small','desktop'],scenarios:[{id:'menu',route:'/#/home',steps:[{id:'open',click:'#open',purpose:'toggle',visible:['#sidebar'],hidden:['#closed'],url:'/#/home'}]}]});
test('bounded public-only schema preserves hash/query identities and rejects unsafe input before launch',async()=>{
 const c=config();c.scenarios[0].route='/#/home?q=a%26b';assert.match(validateSpaConfig(c).scenarios[0].route,/#\/home\?q=a%26b/);
 for(const edit of [c=>c.auth={},c=>c.scenarios[0].access='protected',c=>c.scenarios[0].steps[0].script='alert(1)',c=>c.scenarios[0].steps[0].click='input[type=password]',c=>c.scenarios[0].steps[0].url='https://other.invalid/',c=>c.scenarios[0].route='/?token=synthetic',c=>c.scenarios[0].steps.push({...c.scenarios[0].steps[0]}),c=>c.viewports=['unknown'],c=>c.timeoutMs=0,c=>c.scenarios[0].steps[0].visible=[]]){
  const bad=config();edit(bad);if(bad.scenarios[0].steps[0].visible?.length===0){bad.scenarios[0].steps[0].hidden=[];delete bad.scenarios[0].steps[0].url;}await assert.rejects(scanSpa(bad,{browserFactory:()=>assert.fail('must not launch')}),{code:'LP1_USAGE'});
 }
});
test('failed state prevents false resolution and coverage never drops skipped states',()=>{
 const c=validateSpaConfig(config());const issue={id:'vud-0123456789abcdef',category:'CONTROL_OCCLUDED',selector:'#open',severity:'high',confidence:'high',evidence:{}};
 const state={scenario:'menu',step:'open',viewport:'small',status:'failed',url:c.url,issues:[issue],pre:{elements:[{selector:'#open',exists:true}]},post:{elements:[]}};
 const run={kind:'public-spa',schemaVersion:1,authAllowed:false,networkIsolation:'NONE',config:c,states:[state]};
 const packet=spaPacket(run);assert.equal(packet.coverage.incomplete,4);assert.equal(packet.coverage.states.length,4);assert.ok(packet.metrics.bytes<=16384);
 assert.equal(compareSpaRuns(run,{...run,states:[]},[issue.id]).selected[0].status,'unknown');
 assert.equal(compareSpaRuns(run,{...run,states:[{...state,status:'audited',issues:[]}]},[issue.id]).selected[0].status,'resolved-for-this-check');
 assert.throws(()=>spaPacket(run,{maxBytes:1}),{code:'LP1_USAGE'});
 const removed={...run,states:[{...state,status:'audited',issues:[],pre:{elements:[]}}]};
 assert.equal(compareSpaRuns(run,removed,[issue.id]).selected[0].status,'unknown');
 assert.equal(compareSpaRuns(run,run,[issue.id]).selected[0].status,'persistent');
 const regression={...issue,id:'vud-abcdef0123456789',category:'ELEMENT_OVERFLOW'};
 assert.equal(compareSpaRuns(run,{...run,states:[{...state,status:'audited',issues:[regression]}]},[issue.id]).newIssues.length,1);
 const tainted={...run,states:[{...state,issues:[{...issue,evidence:{password:'synthetic-secret',rect:{width:42},html:'private markup'}}]}]};
 assert.doesNotMatch(JSON.stringify(spaPacket(tainted)),/synthetic-secret|private markup/);
});

test('missing/obscured/unsafe controls fail without clicking; successors skip and owned resources close',async()=>{
 for(const problem of ['missing','ambiguous','unsafe','clipped','occluded','external','undeclared','cdp']){
  const c=config();c.viewports=['small'];c.scenarios[0].steps.push({id:'later',click:'#open',purpose:'toggle',visible:['#sidebar']});
  const log=[];let closeTab=0,closeBrowser=0;
  const browser={tab:async()=>({close:async()=>closeTab++,send:async(method)=>{log.push(method);return method==='Browser.getVersion'?{product:'Chrome/152.0.0'}:{};},evaluate:async expression=>{
   if(expression==='document.readyState')return 'complete';
   if(expression.includes('const elements=selectors.map')){
    const control={selector:'#open',exists:problem!=='missing',count:problem==='ambiguous'?2:1,visible:true,reachable:problem!=='occluded',clipped:problem==='clipped',unsafe:problem==='unsafe',href:problem==='external'?'https://outside.invalid/':problem==='undeclared'?'http://127.0.0.1:4173/#/other':null,rect:{left:0,top:0,width:50,height:50}};
    return {url:c.url+'#/home',elements:[control]};
   }
   if(problem==='cdp')throw Error('sanitized synthetic CDP failure');
   return {document:{viewportWidth:320,documentWidth:320},elements:[]};
  }}),close:async()=>closeBrowser++};
  const run=await scanSpa(c,{browserFactory:async()=>browser});
  assert.equal(run.states.find(s=>s.step==='later').status,'skipped');
  assert.equal(run.states.some(s=>s.status==='failed'),true);assert.equal(closeTab,1);assert.equal(closeBrowser,1);
  if(problem!=='cdp')assert.equal(log.some(m=>m==='Input.dispatchMouseEvent'),false,problem);
 }
});
test('cleanup failure propagates instead of producing a successful run',async()=>{
 const c=config();c.viewports=['small'];
 await assert.rejects(scanSpa(c,{browserFactory:async()=>({tab:async()=>{throw Error('tab fails');},close:async()=>{throw Error('cleanup must remain fatal');}})}),/cleanup must remain fatal/);
});
test('SPA CLI refuses credentials and unknown flags with sanitized errors; help stays offline',async()=>{
 const output=[],io={stdout:m=>output.push(m),stderr:m=>output.push(m)};
 assert.equal(await runPublicCli(['spa-audit','--password','synthetic-secret'],io),64);
 assert.doesNotMatch(output.join(''),/synthetic-secret/);
 assert.equal(await runPublicCli(['--help'],io),0);assert.match(output.at(-1),/spa-audit/);
});
