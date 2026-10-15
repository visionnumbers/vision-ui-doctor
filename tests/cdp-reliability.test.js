import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {access} from 'node:fs/promises';
import {setTimeout as schedule} from 'node:timers';
import {browserSession} from '../src/cdp.js';

const moduleUrl=new URL('../src/cdp.js',import.meta.url).href;
function isolated(code){
 const result=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',timeout:5000});
 assert.equal(result.error,undefined);
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/SETTLED/);
}

test('stage deadline settles even when it is the only remaining event-loop handle',()=>{
 isolated(`import {withStageTimeout} from ${JSON.stringify(moduleUrl)}; try {await withStageTimeout(new Promise(()=>{}),{timeoutMs:20});process.exitCode=1;} catch(e){if(e.code!=='VUD_TIMEOUT')throw e;console.log('SETTLED');}`);
});

for(const mode of ['timeout','disconnect','socket-error','connect-close','connect-timeout'])test(`CDP ${mode} settles with no unrelated handles`,()=>{
 isolated(`import {cdpSocket} from ${JSON.stringify(moduleUrl)};
 class Socket extends EventTarget {static OPEN=1;static CONNECTING=0;readyState=0;constructor(){super();queueMicrotask(()=>{${mode==='connect-timeout'?'':mode==='connect-close'?"this.readyState=3;this.dispatchEvent(new Event('close'));":"this.readyState=1;this.dispatchEvent(new Event('open'));"}});}send(){${mode==='disconnect'?"queueMicrotask(()=>{this.readyState=3;this.dispatchEvent(new Event('close'));});":mode==='socket-error'?"queueMicrotask(()=>this.dispatchEvent(new Event('error')));":''}}close(){this.readyState=3;this.dispatchEvent(new Event('close'));}}
 globalThis.WebSocket=Socket;
 try{const tab=await cdpSocket('ws://127.0.0.1',{timeoutMs:20});await tab.send('Runtime.evaluate');process.exitCode=1;}catch(e){if(!/timed out|connection closed|WebSocket error/i.test(e.message))throw e;console.log('SETTLED');}`);
});

test('CDP shutdown deadline settles when peer never closes',()=>{
 isolated(`import {cdpSocket} from ${JSON.stringify(moduleUrl)};
 class Socket extends EventTarget {static OPEN=1;static CONNECTING=0;readyState=0;constructor(){super();queueMicrotask(()=>{this.readyState=1;this.dispatchEvent(new Event('open'));});}send(){}close(){this.readyState=2;}}
 globalThis.WebSocket=Socket;
 const tab=await cdpSocket('ws://127.0.0.1',{timeoutMs:20});
 try{await tab.close();process.exitCode=1;}catch(e){if(!/CDP tab shutdown timed out/.test(e.message))throw e;console.log('SETTLED');}`);
});

function startupHarness(t,{exit=true,alreadyExited=false}={}){
 let now=0,profile,child,probes=0;
 const delays=[];
 const signals=new EventEmitter();
 // Advance only startup's logical time, independently of slow filesystem/CPU work.
 // Yield through a real timer so pending filesystem cleanup can still complete.
 t.mock.method(Date,'now',()=>now);
 t.mock.method(globalThis,'setTimeout',(callback,ms,...args)=>{
  delays.push(ms);
  return schedule(()=>{now+=ms;callback(...args);},0);
 });
 t.mock.method(globalThis,'fetch',async()=>{probes++;throw new Error('Simulated DevTools unavailable');});
 const launch=(executable,args)=>{
  profile=args.find(arg=>arg.startsWith('--user-data-dir=')).slice('--user-data-dir='.length);
  child=new EventEmitter();Object.assign(child,{exitCode:null,signalCode:null,stderr:new PassThrough()});
  const exited=()=>{child.stderr.write('No usable sandbox! https://private.example/?token=never-log-this'+'\ncrash frame'.repeat(2000));child.exitCode=1;child.emit('exit',1,null);};
  if(alreadyExited)child.exitCode=1;
  else if(exit)queueMicrotask(exited);
  return child;
 };
 return {
  start:()=>browserSession({chromium:process.execPath,timeout:1000,launch,signalTarget:signals}),
  delays,get now(){return now;},get probes(){return probes;},
  async assertClean(){
   await assert.rejects(access(profile),error=>error.code==='ENOENT');
   assert.equal(child.stderr.destroyed,true);
   assert.equal(child.listenerCount('error'),0);
   assert.equal(signals.listenerCount('SIGINT'),0);
   assert.equal(signals.listenerCount('SIGTERM'),0);
  }
 };
}

test('early browser exit reports launch cause promptly and cleans its profile',async t=>{
 const startup=startupHarness(t);
 await assert.rejects(startup.start(),error=>{
  assert.match(error.message,/Browser startup exited \(code 1, signal none\); Chromium sandbox unavailable/);
  assert.doesNotMatch(error.message,/private\.example|never-log-this|crash frame|timed out/);
  assert.notEqual(error.cause?.code,'VUD_TIMEOUT');
  return true;
 });
 // Exit during the first probe is recognized on the next poll, not at the deadline.
 assert.equal(startup.probes,1);
 assert.deepEqual(startup.delays,[100]);
 assert.equal(startup.now,100);
 await startup.assertClean();
});

test('already exited browser is rejected without a DevTools probe or deadline wait',async t=>{
 const startup=startupHarness(t,{alreadyExited:true});
 await assert.rejects(startup.start(),/Browser startup exited \(code 1, signal none\)/);
 assert.equal(startup.probes,0);
 assert.deepEqual(startup.delays,[]);
 assert.equal(startup.now,0);
 await startup.assertClean();
});

test('live browser without DevTools reaches the actual startup deadline and cleans up',async t=>{
 const startup=startupHarness(t,{exit:false});
 await assert.rejects(startup.start(),error=>{
  assert.match(error.message,/Browser startup timed out after 1000 ms/);
  assert.doesNotMatch(error.message,/exited/);
  assert.equal(error.cause?.code,'VUD_TIMEOUT');
  assert.equal(error.cause.stage,'Browser startup');
  assert.equal(error.cause.timeoutMs,1000);
  return true;
 });
 assert.equal(startup.now,1000);
 assert.equal(startup.probes,10);
 assert.deepEqual(startup.delays,Array(10).fill(100));
 await startup.assertClean();
});

test('spawn errors report launch failure and settle cleanup',async()=>{
 const launch=()=>{const child=new EventEmitter();Object.assign(child,{exitCode:null,signalCode:null,stderr:new PassThrough()});queueMicrotask(()=>child.emit('error',Object.assign(new Error('sensitive launch detail'),{code:'ENOENT'})));return child;};
 await assert.rejects(browserSession({chromium:process.execPath,timeout:100,launch}),/Browser startup.*ENOENT/);
});
