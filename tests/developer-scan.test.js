import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,readdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {runPublicCli} from '../src/public-cli.js';
import {renderDeveloperReports} from '../src/developer-report.js';
import {guardPublicOptions} from '../src/public-workflow.js';

function runFor(options){return {schemaVersion:1,authAllowed:false,networkIsolation:'NONE',options:guardPublicOptions(options),report:{schemaVersion:3,version:'0.2.0',pages:options.routes.flatMap((route,index)=>options.viewports.map(viewport=>({route,viewport,url:new URL(route,options.url).href,status:'audited',issues:index?[]:[{id:'vud-'+(viewport==='small'?'1':'2').padStart(16,'0'),category:'ELEMENT_OVERFLOW',selector:'#wide',severity:'medium',confidence:'high',evidence:{overflowPx:{right:120},secret:'token=never-export'}}]})))}};}
async function output(t){const root=await mkdtemp(join(resolve('reports'),'dx1-unit-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
const io=()=>({stdout:()=>{},stderr:()=>{}});

test('scan defaults use existing public viewports/discovery and write readable local handoffs',async t=>{
 const out=await output(t);let discoveryCalls=0,scanCalls=0;
 const code=await runPublicCli(['scan','--url','http://127.0.0.1:4173/','--out',out],{...io(),discoverFn:async opts=>{discoveryCalls++;assert.equal(opts.login,null);return {routes:['/','/about'],errors:[]};},scanFn:async opts=>{scanCalls++;assert.deepEqual(opts.viewports,guardPublicOptions({url:opts.url}).viewports);return runFor(opts);}});
 assert.equal(code,2);assert.equal(discoveryCalls,1);assert.equal(scanCalls,1);
 const human=await readFile(join(out,'REPORT.md'),'utf8'),agent=await readFile(join(out,'AGENT_HANDOFF.md'),'utf8');
 assert.match(human,/\/about/);assert.match(human,/Undiscovered routes and interactive states remain unknown/);assert.match(human,/Probable: 2/);assert.doesNotMatch(human,/Confirmed: 2/);
 assert.match(agent,/vud-0000000000000001/);assert.match(agent,/#wide/);assert.match(agent,/verify/);assert.match(agent,/NOT_REQUESTED/);assert.ok(Buffer.byteLength(agent)<=16384);assert.doesNotMatch(human+agent,/never-export|token=/);
 assert.equal(JSON.parse(await readFile(join(out,'scan-status.json'))).outcome,2);
});
test('explicit routes skip discovery; failed coverage and bounded discovery are not clean',async t=>{
 const out=await output(t);
 const code=await runPublicCli(['scan','--url','http://localhost:4173/','--routes','/','--out',out],{...io(),discoverFn:()=>assert.fail('explicit routes do not auto-discover'),scanFn:async opts=>{const run=runFor(opts);run.report.pages[0].status='failed';run.report.pages[0].error='private diagnostic https://private/?token=never-export';return run;}});
 assert.equal(code,2);const human=await readFile(join(out,'REPORT.md'),'utf8');assert.match(human,/failed/);assert.doesNotMatch(human,/never-export|private diagnostic/);
 const another=await output(t);const partial=await runPublicCli(['scan','--url','http://localhost/','--max-routes','1','--out',another],{...io(),discoverFn:async()=>({routes:['/'],errors:[{error:'private diagnostic'}]}),scanFn:async opts=>{const run=runFor(opts);run.report.pages.forEach(p=>p.issues=[]);return run;}});
 assert.equal(partial,2);const report=await readFile(join(another,'REPORT.md'),'utf8');assert.match(report,/Discovery errors: 1/);assert.match(report,/cap/i);assert.doesNotMatch(report,/private diagnostic/);
 const clean=await output(t);assert.equal(await runPublicCli(['scan','--url','http://localhost/','--routes','/','--out',clean],{...io(),scanFn:async opts=>{const run=runFor(opts);run.report.pages.forEach(p=>p.issues=[]);return run;}}),0);
});
test('browser/cleanup failure writes sanitized incomplete reports and remains exit1; output is immutable',async t=>{
 const out=await output(t);const args=['scan','--url','http://localhost/','--routes','/','--out',out];
 const deps={...io(),scanFn:async()=>{throw new AggregateError([Object.assign(new Error('private diagnostic'),{code:'VUD_TIMEOUT',stage:'Browser process streams shutdown'})],'raw private failure');}};
 assert.equal(await runPublicCli(args,deps),1);
 const human=await readFile(join(out,'REPORT.md'),'utf8');assert.match(human,/Browser process streams shutdown/);assert.match(human,/No completed browser run/);assert.doesNotMatch(human,/private diagnostic|raw private/);
 assert.equal((await readdir(out)).includes('public-run.json'),false);assert.equal(await runPublicCli(args,deps),64);
});
test('scan rejects auth, remote consent omissions and incompatible options before effects',async t=>{
 let effects=0;const deps={...io(),scanFn:()=>effects++,discoverFn:()=>effects++};
 for(const args of [['scan','--url','https://example.test/'],['scan','--url','http://localhost/?token=never-export'],['scan','--url','http://localhost/','--password','never-export'],['scan','--url','http://localhost/','--include','src'],['scan','--config','unread','--url','http://localhost/']])assert.equal(await runPublicCli(args,deps),64);
 assert.equal(effects,0);
});
test('source candidates are opt-in, bounded and do not write to target; SPA handoffs retain actual states',async t=>{
 const root=await mkdtemp(join(tmpdir(),'dx1-source-'));t.after(()=>rm(root,{recursive:true,force:true}));await writeFile(join(root,'page.css'),'#wide { width:900px; }');const out=await output(t);
 assert.equal(await runPublicCli(['scan','--url','http://localhost/','--routes','/','--out',out,'--project-root',root],{...io(),scanFn:async opts=>runFor(opts)}),2);
 const agent=await readFile(join(out,'AGENT_HANDOFF.md'),'utf8');assert.match(agent,/page.css/);assert.deepEqual(await readdir(root),['page.css']);
 const config={schemaVersion:1,url:'http://localhost/',viewports:['small'],scenarios:[{id:'menu',route:'/',steps:[{id:'open',click:'#open',purpose:'toggle',visible:['#panel']}]}]};
 const configFile=join(root,'spa.json');await writeFile(configFile,JSON.stringify(config));const spaOut=await output(t);
 const spaFn=async normalized=>({kind:'public-spa',schemaVersion:1,authAllowed:false,networkIsolation:'NONE',config:normalized,states:[{scenario:'menu',step:'initial',viewport:'small',status:'audited',url:config.url,issues:[]},{scenario:'menu',step:'open',viewport:'small',status:'failed',url:config.url,issues:[{id:'vud-0000000000000003',category:'STATE_INCOMPLETE',selector:'#open',severity:'high',confidence:'high',assessment:'unsupported',evidence:{}}],failure:'STATE_TIMEOUT_OR_UNSAFE_NAVIGATION_OR_CDP_FAILURE'}]});
 assert.equal(await runPublicCli(['scan','--config',configFile,'--out',spaOut],{...io(),spaFn}),2);
 const human=await readFile(join(spaOut,'REPORT.md'),'utf8');assert.match(human,/menu.*open.*small.*failed/);assert.match(human,/spa-verify/);
});
test('compact handoff stays bounded for large coverage and escapes Markdown; all states remain in human report',()=>{
 const options=guardPublicOptions({url:'http://localhost/',routes:Array.from({length:30},(_,i)=>'/page'+i)}),run=runFor(options);
 const result=renderDeveloperReports({run,baseline:'reports/run/public-run.json',cliPath:'C:/tool path/public-cli.js',discovery:{requested:true,errors:0,cap:30,capMayHaveLimited:true}});
 assert.ok(Buffer.byteLength(result.agent)<=16384);assert.match(result.report,/\/page29/);assert.match(result.report,/candidate-not-proven/);assert.equal(result.status.coverage.planned,60);
 assert.match(result.report,/http:\/\/localhost\/page29/);
 run.report.pages[0].screenshot='screenshot-1-small.png';run.report.pages[0].issues[0].selector='#wide|odd';
 const escaped=renderDeveloperReports({run,cliPath:'C:/tool/public-cli.js'});assert.ok(escaped.report.includes('#wide\\|odd'));assert.match(escaped.report,/\[screenshot-1-small.png\]\(screenshot-1-small.png\)/);
});
