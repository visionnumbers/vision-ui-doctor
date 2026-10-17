import test from 'node:test';
import assert from 'node:assert/strict';
import {detectUxIssues,rootCauseCandidates} from '../src/detectors/ux.js';
import {validateSpaConfig,spaPacket,compareSpaRuns} from '../src/spa-workflow.js';

test('independent responsive, overlap and declared alignment diagnostics exclude hidden regions',()=>{
 const rect=(left,width,top=0)=>({left,right:left+width,top,bottom:top+40,width,height:40});
 const regions=[{selector:'#wide',visible:true,rect:rect(0,900),parent:{selector:'#layout',width:320,display:'flex',intentionalScroll:false}},
 {selector:'#a',visible:true,rect:rect(0,100),parent:{selector:'#layout',width:320}},
 {selector:'#b',visible:true,rect:rect(70,100),parent:{selector:'#layout',width:320}},
 {selector:'#hidden',visible:false,rect:rect(0,2000)}];
 const snapshot={regions,overlaps:[{a:'#a',b:'#b',width:30,height:40,confirmed:true}],alignments:[{id:'toolbar',axis:'top',tolerancePx:4,values:[{selector:'#a',value:0},{selector:'#b',value:20}]}]};
 const findings=detectUxIssues(snapshot);assert.ok(findings.some(f=>f.category==='RESPONSIVE_CONTAINER_FAILURE'));assert.ok(findings.some(f=>f.category==='VISIBLE_REGION_OVERLAP'));assert.ok(findings.some(f=>f.category==='DECLARED_ALIGNMENT_DEVIATION'));assert.equal(findings.some(f=>f.selector==='#hidden'),false);
 const intentional=detectUxIssues({...snapshot,regions:[{...regions[0],parent:{...regions[0].parent,intentionalScroll:true}}],overlaps:[],alignments:[]});assert.deepEqual(intentional,[]);
});
test('root candidates retain all IDs, rank shared ancestors and state uncertainty',()=>{
 const states=[{scenario:'demo',step:'open',viewport:'small',url:'http://localhost/#/home',issues:['a','b','c'].map((id,index)=>({id,selector:'#child'+index,category:'ELEMENT_OVERFLOW',severity:'high',cause:{ancestor:'#layout',layout:'flex'}}))}];
 const groups=rootCauseCandidates(states);assert.equal(groups.length,1);assert.deepEqual(groups[0].issueIds,['a','b','c']);assert.equal(groups[0].ancestor,'#layout');assert.equal(groups[0].confidence,'medium');assert.equal(groups[0].status,'candidate-not-proven');
});
test('UX config is strict, bounded and stable when normalized repeatedly',()=>{
 const config={schemaVersion:1,url:'http://127.0.0.1:4173/',viewports:['small'],scenarios:[{id:'demo',route:'/#/home',steps:[{id:'open',click:'#open',purpose:'toggle',visible:['#panel']}]}],ux:{regions:[{selector:'#panel',minWidthPx:220}],alignments:[{id:'toolbar',selectors:['#a','#b'],axis:'top',tolerancePx:4}]}};
 assert.deepEqual(validateSpaConfig(validateSpaConfig(config)),validateSpaConfig(config));
 for(const ux of [{regions:[{selector:'body *'}]},{regions:Array.from({length:21},(_,i)=>({selector:'#x'+i}))},{alignments:[{id:'bad',selectors:['#a','#b'],axis:'script',tolerancePx:4}]},{screenshots:true},{regions:[{selector:'#x',minWidthPx:0}]}])assert.throws(()=>validateSpaConfig({...config,ux}),{code:'LP1_USAGE'});
});

test('partial configured checks remain incomplete and cannot resolve selected issues; root evidence cannot echo raw secrets',()=>{
 const config=validateSpaConfig({schemaVersion:1,url:'http://127.0.0.1:4173/',viewports:['small'],scenarios:[{id:'demo',route:'/#/home',steps:[{id:'open',click:'#open',purpose:'toggle',visible:['#panel']}]}],ux:{regions:[{selector:'#panel'}]}});
 const finding={id:'vud-0123456789abcdef',category:'ELEMENT_OVERFLOW',selector:'#panel',severity:'high',confidence:'high',evidence:{password:'synthetic-secret',width:400},cause:{ancestor:'#layout',layout:'flex'}};
 const state={scenario:'demo',step:'initial',viewport:'small',status:'audited',url:config.scenarios[0].route,issues:[finding],post:{elements:[{selector:'#panel',exists:true}]}};
 const run={schemaVersion:1,kind:'public-spa',authAllowed:false,networkIsolation:'NONE',config,states:[state]};
 const packet=spaPacket(run);assert.doesNotMatch(JSON.stringify(packet),/synthetic-secret/);assert.ok(packet.rootCauseCandidates[0].guidance.includes('min-width'));assert.equal(packet.issues[0].layoutContext.ancestor,'#layout');
 const partial={...run,states:[{...state,issues:[],auditIncomplete:true}]};assert.equal(spaPacket(partial).coverage.states[0].status,'partial');assert.equal(compareSpaRuns(run,partial,[finding.id]).selected[0].status,'unknown');
 assert.equal(compareSpaRuns(run,{...run,detectorsVersion:'ux-future',states:[{...state,issues:[]}]},[finding.id]).selected[0].status,'unknown','changed detector contract cannot establish resolution');
 const confirmed={...finding,id:'vud-abcdef0123456789',category:'FORM_LABEL_MISSING',assessment:'confirmed'};
 const ranked=spaPacket({...run,states:[{...state,issues:[finding,confirmed]}]});assert.equal(ranked.issues[0].id,confirmed.id,'same-impact confirmed measurements rank above probable findings');
 assert.throws(()=>spaPacket({...run,states:[{...state,issues:[{...finding,cause:{ancestor:'password=synthetic-secret',layout:'flex'}}]}]}),{code:'LP1_USAGE'});
});
