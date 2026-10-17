import test from 'node:test';
import assert from 'node:assert/strict';
import {detectExperience} from '../src/detectors/experience.js';
import {validateSpaConfig,spaPacket,compareSpaRuns} from '../src/spa-workflow.js';

const snapshot=()=>({viewport:{width:320,height:700},fragmentation:[],content:[],toolbars:[],collisions:[],headers:[],checked:40,truncated:false});
const seeds={
 INLINE_PROSE_FRAGMENTATION:['fragmentation',{selector:'#prose',layout:'flex',inlineItems:2,blockSizedItems:2,proseChars:90,separatedRows:2}],
 CONTENT_SPACE_STARVATION:['content',{selector:'#reader',layout:'block',effectiveHeight:70,lineHeight:24,visibleLines:70/24,viewportFraction:.1,scrollRatio:8,nestedScrollers:2}],
 EXCESSIVE_CONTROL_WRAPPING:['toolbars',{selector:'#toolbar',layout:'flex',rows:3,controls:7,lastRowCount:2,lastRowWidth:100,availableWidth:300,firstRowFill:.9,height:120,viewportFraction:120/700}],
 TEXT_BADGE_COLLISION:['collisions',{selector:'#row',layout:'flex',related:'#badge',overlapWidth:28,overlapHeight:18,textMinWidthAuto:1}],
 MOBILE_CHROME_DENSITY:['headers',{selector:'#header',layout:'block',rows:3,height:210,viewportFraction:.3,contentLines:3,contentFraction:.1}]
};
for(const [category,[key,seed]] of Object.entries(seeds))test(category+' has measured evidence, one component result and conservative confidence',()=>{
 const s=snapshot();s[key]=[seed,seed];const result=detectExperience(s);
 assert.equal(result.issues.filter(i=>i.category===category).length,1);
 const issue=result.issues.find(i=>i.category===category);assert.ok(issue);assert.notEqual(issue.assessment,'confirmed');assert.equal(issue.cause.ancestor,seed.selector);assert.ok(issue.suggestion.length>20);
 assert.ok(Object.values(issue.evidence).every(v=>typeof v==='number'));
});
test('legitimate and corrected measurements do not trigger new defects',()=>{
 const s=snapshot();s.fragmentation=[{...seeds.INLINE_PROSE_FRAGMENTATION[1],proseChars:0},{...seeds.INLINE_PROSE_FRAGMENTATION[1],blockSizedItems:0}];
 s.content=[{...seeds.CONTENT_SPACE_STARVATION[1],visibleLines:12,viewportFraction:.5},{...seeds.CONTENT_SPACE_STARVATION[1],scrollRatio:1}];
 s.toolbars=[{...seeds.EXCESSIVE_CONTROL_WRAPPING[1],rows:2,lastRowCount:3},{...seeds.EXCESSIVE_CONTROL_WRAPPING[1],rows:1}];
 s.collisions=[{...seeds.TEXT_BADGE_COLLISION[1],overlapWidth:0}];s.headers=[{...seeds.MOBILE_CHROME_DENSITY[1],contentLines:20}];
 assert.deepEqual(detectExperience(s).issues,[]);
});
test('desktop orphan row is review-needed; caps expose omissions',()=>{
 const s=snapshot();s.viewport.width=1440;s.toolbars=[{...seeds.EXCESSIVE_CONTROL_WRAPPING[1],rows:2,lastRowCount:1,lastRowWidth:80,firstRowFill:.9}];
 assert.equal(detectExperience(s).issues[0].assessment,'needs-review');
 s.collisions=Array.from({length:25},(_,i)=>({...seeds.TEXT_BADGE_COLLISION[1],selector:'#row'+i}));s.truncated=true;
 const result=detectExperience(s);assert.equal(result.issues.length,20);assert.ok(result.coverage.omitted>0);assert.equal(result.coverage.truncated,true);
});
test('opt-in config, compact guidance, root membership, confidence and detector drift survive reporting',()=>{
 const input={schemaVersion:1,url:'http://127.0.0.1:4173/',viewports:['small'],scenarios:[{id:'demo',route:'/',steps:[{id:'open',click:'#open',purpose:'toggle',visible:['#reader']}]}],ux:{experience:true}};
 const config=validateSpaConfig(input);assert.equal(config.ux.experience,true);assert.deepEqual(validateSpaConfig(config),config);
 assert.throws(()=>validateSpaConfig({...input,ux:{experience:'yes'}}),{code:'LP1_USAGE'});
 const s=snapshot();s.fragmentation=[seeds.INLINE_PROSE_FRAGMENTATION[1]];
 const finding={...detectExperience(s).issues[0],id:'vud-0123456789abcdef',suggestion:'untrusted report string must not be echoed'};
 const state={scenario:'demo',step:'initial',viewport:'small',url:config.url,status:'audited',issues:[finding],experienceCoverage:{checked:40,truncated:false,total:1,omitted:0},post:{elements:[{selector:'#prose',exists:true}]}};
 const run={kind:'public-spa',schemaVersion:1,authAllowed:false,networkIsolation:'NONE',detectorsVersion:'ux-experience-3',config,states:[state]};
 const packet=spaPacket(run);assert.ok(packet.metrics.bytes<=16384);assert.equal(packet.issues[0].assessment,'probable');assert.match(packet.issues[0].guidance,/normal text flow/);
 assert.doesNotMatch(JSON.stringify(packet),/untrusted report string/);assert.equal(packet.rootCauseCandidates[0].representativeIssueIds[0],finding.id);assert.equal(packet.issues[0].layoutContext.ancestor,'#prose');
 assert.equal(packet.experienceCoverage.measuredStates,1);
 const fresh={...run,detectorsVersion:'ux-accuracy-2',states:[{...state,issues:[]}]};assert.equal(compareSpaRuns(run,fresh,[finding.id]).selected[0].status,'unknown');
 const partial={...run,states:[{...state,issues:[],auditIncomplete:true}]};assert.equal(compareSpaRuns(run,partial,[finding.id]).selected[0].status,'unknown');
 const existing={id:'vud-abcdef0123456789',category:'FORM_LABEL_MISSING',selector:'#field',severity:'high',confidence:'high',assessment:'confirmed',evidence:{resolvedLabels:0}};
 const mixed=spaPacket({...run,states:[{...state,issues:[existing,finding]}]});assert.ok(mixed.issues.some(f=>f.id===existing.id&&f.assessment==='confirmed'));assert.ok(mixed.issues.some(f=>f.id===finding.id&&f.assessment==='probable'));
});
