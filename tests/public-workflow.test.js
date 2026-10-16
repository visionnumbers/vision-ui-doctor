import test from 'node:test';
import assert from 'node:assert/strict';
import {guardPublicOptions,scanPublic,createPacket,compareRuns,verifyPublic} from '../src/public-workflow.js';

const options=()=>({url:'http://127.0.0.1:4173/',routes:['/','/about?b=2&a=1#/details'],viewports:['small','desktop'],timeoutMs:1000,concurrency:1});

test('public guard permits bounded public routes but does not claim isolation',()=>{
 const value=guardPublicOptions(options());
 assert.equal(value.mode,'LOCAL_TRUSTED');
 assert.equal(value.authAllowed,false);
 assert.equal(value.networkIsolation,'NONE');
 assert.equal(value.routes[1],'/about?a=1&b=2#/details');
});

test('public guard rejects credential paths, protected declarations and journeys before effects',()=>{
 for(const extra of [{login:{}},{authProject:{}},{auth:{}},{mode:'SECURE_ISOLATED'},{endpointFile:'private.json'},{backend:[{}]},{routes:[{url:'/',access:'protected'}]},{journeys:[{id:'one'}]}]){
  assert.throws(()=>guardPublicOptions({...options(),...extra}),{code:'LP1_USAGE'});
 }
});

test('public guard rejects unsafe/sensitive/out-of-scope URLs and invalid limits',()=>{
 for(const extra of [{url:'https://example.test/'},{url:'http://user:pass@localhost/'},{routes:['//external.test/']},{routes:['/?token=SYNTHETIC']},{routes:['/#/x?password=SYNTHETIC']},{timeoutMs:0},{concurrency:9},{viewports:['unknown']},{routes:[]},{routes:Array(101).fill('/')}]){
  assert.throws(()=>guardPublicOptions({...options(),...extra}),{code:'LP1_USAGE'});
 }
 assert.doesNotThrow(()=>guardPublicOptions({...options(),url:'https://example.test/',allowRemote:true}));
 assert.throws(()=>guardPublicOptions({...options(),allowRemote:'true'}),{code:'LP1_USAGE'});
 assert.throws(()=>guardPublicOptions({...options(),password:'SYNTHETIC'}),{code:'LP1_USAGE'});
});

export function sampleRun(){
 const settings=guardPublicOptions(options());
 return {schemaVersion:1,options:settings,runId:'sample',report:{schemaVersion:3,version:'0.2.0',pages:[
  {route:'/',viewport:'small',url:settings.url,status:'audited',issues:[{id:'vud-0000000000000001',category:'ELEMENT_OVERFLOW',severity:'medium',confidence:'high',selector:'#wide',evidence:{overflowPx:{right:120},detail:'token=SYNTHETIC'}}]},
  {route:'/',viewport:'desktop',status:'failed',issues:[],error:'private diagnostic'},
 ]}};
}

test('public scan rejects auth before injected scanner and strips all execution extras',async()=>{
 let calls=0;
 await assert.rejects(scanPublic({...options(),authProject:{}},{auditFn:()=>{calls++;}}),{code:'LP1_USAGE'});
 const run=await scanPublic(options(),{auditFn:async passed=>{calls++;assert.equal(passed.login,null);assert.equal(passed.authProject,undefined);assert.equal(passed.timeoutMs,1000);assert.equal(passed.browserStartupTimeoutMs,10000);return sampleRun().report;}});
 assert.equal(calls,1);assert.equal(run.authAllowed,false);assert.equal(run.runId.length,64);
});

test('packet keeps finding identity and complete expected coverage without raw logs or source',()=>{
 const packet=createPacket(sampleRun());
 assert.equal(packet.schemaVersion,1);assert.equal(packet.issues[0].id,'vud-0000000000000001');
 assert.equal(packet.issues[0].confidence,'high');assert.equal(packet.issues[0].evidence.overflowPx.right,120);
 assert.equal(packet.coverage.states.length,4);assert.equal(packet.coverage.incomplete,3);
 assert.equal(packet.coverage.states[1].status,'failed');
 assert.doesNotMatch(JSON.stringify(packet),/SYNTHETIC|private diagnostic/);
 assert.deepEqual(createPacket(sampleRun()),packet);
 assert.equal(packet.metrics.bytes,Buffer.byteLength(JSON.stringify(packet)));
});

test('packet enforces issue/UTF-8 budgets with continuation and selected issue lookup',()=>{
 const run=sampleRun();run.report.pages[0].issues=Array.from({length:20},(_,i)=>({...run.report.pages[0].issues[0],id:'vud-'+i.toString(16).padStart(16,'0'),selector:'#'+('界'.repeat(120))}));
 const packet=createPacket(run);assert.equal(packet.issues.length,10);assert.equal(packet.omitted,10);assert.equal(packet.nextIssueId,run.report.pages[0].issues[10].id);assert.ok(packet.metrics.bytes<=16384);
 assert.equal(createPacket(run,{issueIds:[packet.nextIssueId]}).issues[0].id,packet.nextIssueId);
 assert.throws(()=>createPacket(run,{issueIds:['vud-ffffffffffffffff']}),{code:'LP1_USAGE'});
 assert.throws(()=>createPacket(run,{maxBytes:20}),{code:'LP1_USAGE'});
 assert.throws(()=>createPacket(run,{maxIssues:11}),{code:'LP1_USAGE'});
 const limited=createPacket(run,{maxBytes:4000});assert.ok(limited.metrics.bytes<=4000);assert.ok(limited.omitted>0);
});

test('fresh comparison distinguishes resolution, persistence, failure, selector drift and regressions',()=>{
 const baseline=sampleRun();const fresh=structuredClone(baseline);
 fresh.report.pages[0].issues=[];fresh.selectorProofs=[{route:'/',viewport:'small',id:'vud-0000000000000001',exists:true}];
 assert.equal(compareRuns(baseline,fresh,['vud-0000000000000001']).selected[0].status,'resolved-for-this-check');
 fresh.selectorProofs[0].exists=false;assert.equal(compareRuns(baseline,fresh,['vud-0000000000000001']).selected[0].status,'unknown');
 fresh.report.pages[0].status='failed';assert.equal(compareRuns(baseline,fresh,['vud-0000000000000001']).selected[0].status,'unknown');
 fresh.report.pages[0].status='blocked';assert.equal(compareRuns(baseline,fresh,['vud-0000000000000001']).selected[0].status,'blocked');
 fresh.report.pages[0]=structuredClone(baseline.report.pages[0]);assert.equal(compareRuns(baseline,fresh,['vud-0000000000000001']).selected[0].status,'persistent');
 fresh.report.pages[0].issues.push({...fresh.report.pages[0].issues[0],id:'vud-0000000000000002'});assert.equal(compareRuns(baseline,fresh,['vud-0000000000000001']).newIssues.length,1);
 fresh.report.pages[0].issues=[];fresh.report.pages[0].url='http://127.0.0.1:4173/login';fresh.selectorProofs[0].exists=true;
 assert.equal(compareRuns(baseline,fresh,['vud-0000000000000001']).selected[0].status,'unknown');
});

test('verification freshly rescans all configured routes/viewports when dependencies are unknown',async()=>{
 const baseline=sampleRun();let calls=0;
 const result=await verifyPublic(baseline,{issueIds:['vud-0000000000000001'],out:'unused'},{auditFn:async options=>{calls++;assert.deepEqual(options.routes,baseline.options.routes);assert.deepEqual(options.viewports,baseline.options.viewports);return baseline.report;}});
 assert.equal(calls,1);assert.equal(result.comparison.browserCacheHits,0);assert.equal(result.comparison.scope,'all configured public routes/viewports; dependencies unproven');
});

test('stored remote consent is not reused for verification and scope drift cannot resolve issues',async()=>{
 const baseline=sampleRun();baseline.options.url='https://example.test/';baseline.options.allowRemote=true;
 let calls=0;await assert.rejects(verifyPublic(baseline,{issueIds:['vud-0000000000000001']},{auditFn:()=>{calls++;}}),{code:'LP1_USAGE'});assert.equal(calls,0);
 const fresh=sampleRun();fresh.options.waitMs=42;fresh.report.pages[0].issues=[];fresh.selectorProofs=[{id:'vud-0000000000000001',route:'/',viewport:'small',exists:true}];
 assert.equal(compareRuns(sampleRun(),fresh,['vud-0000000000000001']).selected[0].status,'unknown');
});
