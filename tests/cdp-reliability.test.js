import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {access} from 'node:fs/promises';
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

test('early browser exit reports launch cause promptly and cleans its profile',async()=>{
 let profile;
 const launch=(executable,args)=>{
  profile=args.find(arg=>arg.startsWith('--user-data-dir=')).slice('--user-data-dir='.length);
  const child=new EventEmitter();Object.assign(child,{exitCode:null,signalCode:null,stderr:new PassThrough()});
  queueMicrotask(()=>{child.stderr.write('No usable sandbox! https://private.example/?token=never-log-this'+'\ncrash frame'.repeat(2000));child.exitCode=1;child.emit('exit',1,null);});
  return child;
 };
 const started=Date.now();
 await assert.rejects(browserSession({chromium:process.execPath,timeout:1000,launch}),error=>{
  assert.match(error.message,/Browser startup.*exited.*1.*sandbox/i);
  assert.doesNotMatch(error.message,/private\.example|never-log-this/);
  return true;
 });
 assert.ok(Date.now()-started<900);
 await assert.rejects(access(profile));
});

test('spawn errors report launch failure and settle cleanup',async()=>{
 const launch=()=>{const child=new EventEmitter();Object.assign(child,{exitCode:null,signalCode:null,stderr:new PassThrough()});queueMicrotask(()=>child.emit('error',Object.assign(new Error('sensitive launch detail'),{code:'ENOENT'})));return child;};
 await assert.rejects(browserSession({chromium:process.execPath,timeout:100,launch}),/Browser startup.*ENOENT/);
});
