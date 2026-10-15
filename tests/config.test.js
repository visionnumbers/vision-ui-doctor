import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateProjectConfig,loadProjectConfig} from '../src/config.js';
import {createExecutionPlan} from '../src/plan.js';
import {parseCliArgs,runCli} from '../src/cli.js';

const config=()=>({schemaVersion:1,baseUrl:'http://localhost:4173/app/',viewports:['mobile'],routes:[{id:'home',url:'./',access:'public'},{id:'editor',url:'./?lang=js&tag=a&tag=b#/editor?mode=one',access:'protected'}],journeys:[{id:'open-menu',routeId:'editor',steps:[{id:'open',action:'click',selector:'button[data-test="menu"]'},{id:'check',action:'assertVisible',selector:'[role=menu]'}]}]});
const publicConfig=()=>({...config(),routes:[config().routes[0]],journeys:[]});
function file(t,value=publicConfig(),name='project config.json'){
 const dir=mkdtempSync(join(tmpdir(),'vud-config-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const path=join(dir,name);writeFileSync(path,typeof value==='string'?value:JSON.stringify(value));return path;
}
const invalid=value=>assert.throws(()=>validateProjectConfig(value),error=>error.code==='CONFIG_INVALID');

test('versioned config validates without mutating caller and preserves repeated query/hash navigation',()=>{
 const input=config(),before=structuredClone(input),result=validateProjectConfig(input);
 assert.deepEqual(input,before);assert.equal(result.schemaVersion,1);
 assert.equal(result.routes[1].url,'http://localhost:4173/app/?lang=js&tag=a&tag=b#/editor?mode=one');
 assert.equal(result.routes[1].access,'protected');assert.equal(result.limits.timeoutMs,10000);
});

test('strict version, type, required field and unknown-field validation never reflects untrusted data',()=>{
 const canary='DO_NOT_ECHO_CONFIG_SECRET';
 for(const value of [null,[],{}, {...config(),schemaVersion:2},{...config(),schemaVersion:'1'}, {...config(),[canary]:canary},{...config(),routes:'/'},{...config(),routes:[{...config().routes[0],password:canary}]},{...config(),allowRemote:true}]){
  assert.throws(()=>validateProjectConfig(value),error=>error.code==='CONFIG_INVALID'&&!error.message.includes(canary));
 }
});

test('URL/base scope rejects credentials, schemes, external origins, traversal and ambiguous encoded paths',()=>{
 for(const baseUrl of ['ftp://localhost/app/','http://user:pass@localhost/app/','not-url','http://localhost/app/%2fprivate/','http://localhost/app/../','http://localhost/app/?q=one','http://localhost/app/#/x'])invalid({...config(),baseUrl});
 for(const url of ['https://external.example/app/','//external.example/app/','javascript:alert(1)','../outside','/other/','./%2e%2e/out','./%2foutside','./%5coutside','./%25252525252foutside'])invalid({...publicConfig(),routes:[{id:'bad',url,access:'public'}]});
 for(const url of ['../app/page','./page','/app/page','//localhost:4173/app/page','http://localhost:4173/app/page'])assert.equal(validateProjectConfig({...publicConfig(),routes:[{id:'page',url,access:'public'}]}).routes[0].url,'http://localhost:4173/app/page');
});

test('route and journey/step identifiers are stable, unique and references must exist',()=>{
 invalid({...config(),routes:[config().routes[0],{id:'home',url:'./second',access:'public'}]});
 invalid({...config(),routes:[{id:'bad:id',url:'./',access:'public'}]});
 invalid({...config(),routes:[{id:'x',url:'./',access:'admin'}]});
 invalid({...config(),journeys:[{...config().journeys[0],routeId:'missing'}]});
 invalid({...config(),journeys:[config().journeys[0],config().journeys[0]]});
 invalid({...config(),journeys:[{...config().journeys[0],steps:[config().journeys[0].steps[0],config().journeys[0].steps[0]]}]});
});

test('canonical duplicate detection sorts keys safely, preserves repeated values and ignores tracking/section anchors',()=>{
 const first={id:'first',url:'./page?b=2&a=one&a=two',access:'public'};
 invalid({...publicConfig(),routes:[first,{id:'second',url:'./page?a=one&a=two&b=2#section',access:'public'}]});
 invalid({...publicConfig(),routes:[{id:'first',url:'./?utm_source=x',access:'public'},{id:'second',url:'./',access:'public'}]});
 const result=validateProjectConfig({...publicConfig(),routes:[first,{id:'second',url:'./page?a=two&a=one&b=2',access:'public'}]});assert.equal(result.routes.length,2);
});

test('all six planned actions validate, exact per-action keys and safe selector subset are enforced',()=>{
 const steps=[{id:'nav',action:'navigate',url:'./?q=one#/dashboard'},...['click','assertVisible','assertHidden','waitForVisible'].map((action,index)=>({id:'s'+index,action,selector:'main > button.primary[data-id="one"]'})),{id:'url',action:'assertUrl',url:'./?q=one#/dashboard'}];
 assert.equal(validateProjectConfig({...config(),journeys:[{id:'all',routeId:'home',steps}]}).journeys[0].steps.length,6);
 for(const step of [{id:'x',action:'evaluate',script:'secret'},{id:'x',action:'click',selector:'a',url:'./'},{id:'x',action:'navigate',url:'https://evil.example/'},{id:'x',action:'click',selector:'a:has(script)'},{id:'x',action:'click',selector:'button['},{id:'x',action:'click',selector:'[role=menu]div'},{id:'x',action:'click',selector:'x'.repeat(513)},{id:'x',action:'click',selector:''}])invalid({...config(),journeys:[{id:'bad',routeId:'home',steps:[step]}]});
});

test('bounds reject invalid numbers, excessive arrays, duplicate viewports and planned-state multiplication',()=>{
 for(const [key,value] of Object.entries({maxRoutes:101,maxJourneys:21,maxSteps:51,maxPlannedStates:1001,timeoutMs:249}))invalid({...config(),limits:{[key]:value}});
 for(const value of [0,1.5,'30',NaN,Infinity])invalid({...config(),limits:{maxRoutes:value}});
 invalid({...config(),viewports:['watch']});invalid({...config(),viewports:['mobile','mobile']});
 invalid({...config(),limits:{maxRoutes:1}});invalid({...config(),limits:{maxPlannedStates:3}});
 invalid({...config(),journeys:[{...config().journeys[0],steps:[{id:'long',action:'click',selector:'button',timeoutMs:10001}]}]});
 for(const extra of [{concurrency:9},{waitMs:10001},{screenshots:'false'},{out:''},{out:'https://external.example/reports'},{out:'\\\\server\\share\\reports'}])invalid({...config(),...extra});
});

test('sensitive URL keys in routes and SPA states rejected without leaking values',()=>{
 for(const url of ['./?token=URL_SECRET_CANARY','./#/editor?api_key=URL_SECRET_CANARY','./?%70assword=URL_SECRET_CANARY'])assert.throws(()=>validateProjectConfig({...publicConfig(),routes:[{id:'home',url,access:'public'}]}),e=>e.code==='CONFIG_INVALID'&&!JSON.stringify(e).includes('URL_SECRET_CANARY')&&!e.message.includes('URL_SECRET_CANARY'));
});

test('plan is deterministic, explicitly planned, bounded and excludes selectors and local output paths',()=>{
 const input=validateProjectConfig({...config(),out:'C:\\PRIVATE_REPORT_CANARY',journeys:[{id:'open-menu',routeId:'editor',steps:[{id:'open',action:'click',selector:'[data-value="SELECTOR_PRIVATE_CANARY"]'}]}]});
 const a=createExecutionPlan(input),b=createExecutionPlan(validateProjectConfig(JSON.parse(JSON.stringify(configForPlan()))));
 function configForPlan(){return {...config(),out:'C:\\PRIVATE_REPORT_CANARY',journeys:[{id:'open-menu',routeId:'editor',steps:[{id:'open',action:'click',selector:'[data-value="SELECTOR_PRIVATE_CANARY"]'}]}]};}
 assert.deepEqual(a,b);assert.equal(a.schemaVersion,1);assert.equal(a.status,'planned');assert.equal(a.states.length,3);
 assert.deepEqual(a.options,{concurrency:1,waitMs:550,screenshots:true});
 assert.equal(new Set(a.states.map(x=>x.id)).size,3);assert.ok(a.states.every(x=>x.status==='planned'));
 assert.doesNotMatch(JSON.stringify(a),/SELECTOR_PRIVATE_CANARY|PRIVATE_REPORT_CANARY|createdAt|navigationUrl/);
 assert.deepEqual(createExecutionPlan(input),a);
});

test('local JSON loader accepts spaced paths; rejects remote sources, malformed/oversized JSON and non-files safely',t=>{
 assert.equal(loadProjectConfig(file(t)).routes[0].id,'home');
 for(const path of ['https://example.test/config.json','file:///secret.json','\\\\server\\share\\config.json'])assert.throws(()=>loadProjectConfig(path),e=>e.code==='CONFIG_INVALID');
 for(const contents of ['{"password":"JSON_SECRET_CANARY",', ' '.repeat(1024*1024+1)])assert.throws(()=>loadProjectConfig(file(t,contents)),e=>e.code==='CONFIG_INVALID'&&!e.message.includes('JSON_SECRET_CANARY'));
 assert.throws(()=>loadProjectConfig(join(tmpdir(),'ABSENT_CONFIG_CANARY.json')),e=>!e.message.includes('ABSENT_CONFIG_CANARY'));
 assert.throws(()=>loadProjectConfig(tmpdir()),e=>e.code==='CONFIG_INVALID');
 if(process.platform!=='win32'){
  const dir=mkdtempSync(join(tmpdir(),'vud-config-pipe-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const fifo=join(dir,'pipe.json');
  assert.equal(spawnSync('mkfifo',[fifo],{encoding:'utf8'}).status,0);
  const moduleUrl=new URL('../src/config.js',import.meta.url).href;
  const source=`import {loadProjectConfig} from ${JSON.stringify(moduleUrl)};try{loadProjectConfig(${JSON.stringify(fifo)});process.exitCode=1;}catch(e){if(e.code!=='CONFIG_INVALID')throw e;}`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',source],{encoding:'utf8',timeout:10000});assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);
 }
});

test('config CLI precedence: explicit flags replace arrays/scalars, omitted flags preserve config then defaults',t=>{
 const path=file(t,{...publicConfig(),viewports:['tablet'],waitMs:12,concurrency:2,screenshots:false,out:'reports/config',limits:{timeoutMs:1234,maxRoutes:10}});
 const defaults=parseCliArgs(['audit','--config',path]);assert.equal(defaults.options.waitMs,12);assert.equal(defaults.options.screenshots,false);assert.deepEqual(defaults.options.viewports,['tablet']);
 assert.equal(parseCliArgs(['audit','--config',path,'--screenshots']).options.screenshots,true);
 assert.throws(()=>parseCliArgs(['audit','--config',path,'--screenshots','--no-screenshots']));
 const override=parseCliArgs(['audit','--config='+path,'--routes=/app/search?q=a&tag=one&tag=two#/editor','--viewports=mobile','--timeout-ms=2500','--out','D:\\UI Reports\\run']);
 assert.deepEqual(override.options.routes,['/app/search?q=a&tag=one&tag=two#/editor']);assert.equal(override.options.timeoutMs,2500);assert.equal(override.options.out,'D:\\UI Reports\\run');assert.deepEqual(override.options.viewports,['mobile']);
 assert.equal(parseCliArgs(['plan','--config',path,'--url','http://localhost/else/']).project.routes[0].url,'http://localhost/else/');
 assert.throws(()=>parseCliArgs(['plan','--config',path,'--routes=/outside']),/routes/);
});

test('validate and plan are offline; unsupported config execution is rejected before every effect',async t=>{
 const path=file(t,config()),messages=[];
 const effects={auditFn:()=>assert.fail('No audit'),discoverRoutesFn:()=>assert.fail('No discovery'),checkBackendFn:()=>assert.fail('No backend'),stdout:s=>messages.push(s),stderr:s=>messages.push(s)};
 assert.equal(await runCli(['validate','--config',path],effects),0);
 assert.equal(await runCli(['plan','--config',path],effects),0);
 assert.ok(messages.some(x=>x.includes('planned')));
 assert.equal(await runCli(['audit','--config',path],effects),64);
 assert.equal(await runCli(['plan'],effects),64);
});

test('public config audit uses legacy engine, while remote consent cannot be granted by config',async t=>{
 let options;const messages=[];
 const effects={stdout:s=>messages.push(s),stderr:s=>messages.push(s),checkBackendFn:async()=>[],auditFn:async value=>{options=value;return {summary:{totalIssues:0,pageFailures:0,backendFailures:0}};}};
 assert.equal(await runCli(['audit','--config',file(t)],effects),0);assert.deepEqual(options.routes,['/app/']);
 const remote=file(t,{...publicConfig(),baseUrl:'https://example.test/app/'});options=null;
 assert.equal(await runCli(['audit','--config',remote],effects),64);assert.equal(options,null);
 assert.equal(await runCli(['audit','--config',remote,'--allow-remote'],effects),0);
 assert.equal(await runCli(['audit','--config',remote,'--allow-remote','--discover'],effects),64);
});

test('actual CLI validate/plan need no browser and failures never echo untrusted JSON or path values',t=>{
 const cli=fileURLToPath(new URL('../src/cli.js',import.meta.url)),path=file(t,config());
 for(const command of ['validate','plan']){const result=spawnSync(process.execPath,[cli,command,'--config',path],{encoding:'utf8',env:{...process.env,CHROMIUM_PATH:'NOT_A_BROWSER'}});assert.equal(result.status,0,result.stderr);assert.ok(result.stdout.length>0);}
 const bad=spawnSync(process.execPath,[cli,'plan','--config',file(t,'{"token":"JSON_CANARY_SECRET",')],{encoding:'utf8'});assert.equal(bad.status,64);assert.doesNotMatch(bad.stderr,/JSON_CANARY_SECRET/);
});

test('optional fields reject explicit null rather than silently taking defaults',()=>{
 for(const key of ['viewports','journeys','waitMs','concurrency','out','limits'])invalid({...publicConfig(),[key]:null});
 invalid({...config(),journeys:[{id:'bad',routeId:'home',steps:[{id:'x',action:'click',selector:'button',timeoutMs:null}]}]});
});

test('config routes preserve comma and encoded URL query values through CLI adapter',t=>{
 const url='./search?values=a,b&next=https%3A%2F%2Fexample.test%2Fa%3Fx%3D1%26y%3D2#/editor';
 const path=file(t,{...publicConfig(),routes:[{id:'search',url,access:'public'}]});
 assert.deepEqual(parseCliArgs(['audit','--config',path]).options.routes,['/app/search?values=a,b&next=https%3A%2F%2Fexample.test%2Fa%3Fx%3D1%26y%3D2#/editor']);
});

test('CLI parse failures never echo values attached to unknown or boolean options',async()=>{
 for(const argv of [['plan','--unknown=PARSE_SECRET_CANARY'],['plan','--allow-remote=PARSE_SECRET_CANARY']]){
  const messages=[];assert.equal(await runCli(argv,{stderr:s=>messages.push(s)}),64);assert.doesNotMatch(messages.join('\n'),/PARSE_SECRET_CANARY/);
 }
});

test('configured soft limits bound journeys and steps before plan allocation',()=>{
 invalid({...config(),limits:{maxSteps:1}});
 invalid({...config(),limits:{maxJourneys:1},journeys:[config().journeys[0],{...config().journeys[0],id:'another'}]});
 const model=validateProjectConfig({...config(),viewports:['mobile','tablet'],limits:{maxPlannedStates:8}});
 assert.equal(createExecutionPlan(model).states.length,8);
});

test('configured runtime errors do not echo secret-looking values or local paths',async t=>{
 const messages=[];const exit=await runCli(['audit','--config',file(t)],{stdout:()=>{},stderr:s=>messages.push(s),checkBackendFn:async()=>[],auditFn:async()=>{throw new Error('PRIVATE_RUNTIME_CANARY in config path');}});
 assert.equal(exit,1);assert.doesNotMatch(messages.join('\n'),/PRIVATE_RUNTIME_CANARY/);
});

test('public examples validate and stable state IDs survive route reordering',()=>{
 for(const name of ['project','journeys'])assert.equal(loadProjectConfig(fileURLToPath(new URL(`../examples/${name}.config.json`,import.meta.url))).schemaVersion,1);
 const first=createExecutionPlan(config()),second=createExecutionPlan({...config(),routes:[...config().routes].reverse()});
 assert.deepEqual(first.states.map(x=>x.id).sort(),second.states.map(x=>x.id).sort());
});

test('adversarial selector token fails in a bounded isolated process without regex backtracking',()=>{
 const moduleUrl=new URL('../src/config.js',import.meta.url).href;
 const source=`import {validateProjectConfig} from ${JSON.stringify(moduleUrl)}; const input=${JSON.stringify(config())};input.journeys[0].steps[0].selector='a'.repeat(100)+'!';try{validateProjectConfig(input);process.exitCode=1;}catch(e){if(e.code!=='CONFIG_INVALID')throw e;}`;
 // This generous kill guard prevents a broken validator hanging CI; it is not
 // an elapsed-time performance assertion and includes subprocess scheduling.
 const result=spawnSync(process.execPath,['--input-type=module','-e',source],{encoding:'utf8',timeout:10000,windowsHide:true});
 assert.equal(result.error,undefined,'Selector validation must not exhaust the isolated process deadline');assert.equal(result.status,0,result.stderr);
});
