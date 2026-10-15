import test from 'node:test';
import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import {EventEmitter} from 'node:events';
import {browserSession,withStageTimeout} from '../src/cdp.js';

const chromium=process.env.CHROMIUM_PATH||'chromium';
const exists=path=>access(path).then(()=>true,()=>false);
const alive=pid=>{try{process.kill(pid,0);return true;}catch(error){return error.code!=='ESRCH';}};

test('stage timeout identifies the operation and route',async()=>{
 await assert.rejects(withStageTimeout(new Promise(()=>{}),{stage:'Page navigation',route:'/slow',timeoutMs:20}),error=>error.code==='VUD_TIMEOUT'&&/Page navigation timed out after 20 ms for \/slow/.test(error.message));
});

test('clean close is idempotent, closes tabs and removes the owned profile',async t=>{
 const browser=await browserSession({chromium,timeout:10000});
 t.after(()=>browser.close());
 const profile=browser.profilePath;
 const tab=await browser.tab();
 await tab.send('Runtime.enable');
 const second=await browser.tab();await second.send('Runtime.enable');
 assert.equal(browser.openTabCount,2);
 await tab.close();
 assert.equal(browser.openTabCount,1);
 await browser.close();
 await browser.close();
 assert.equal(browser.closed,true);
 assert.equal(second.closed,true);
 assert.equal(browser.openTabCount,0);
 assert.equal(alive(browser.pid),false);
 assert.equal(await exists(profile),false);
});

test('forced browser disconnect rejects pending CDP work with an actionable error',async t=>{
 const browser=await browserSession({chromium,timeout:10000});
 t.after(()=>browser.close());
 const tab=await browser.tab();
 await tab.send('Runtime.enable');
 const pending=tab.evaluate('new Promise(()=>{})');
 const rejected=assert.rejects(pending,/browser (connection closed|websocket error).*Runtime\.evaluate/i);
 await browser.close();
 await rejected;
});

test('interrupt signal cleans owned resources without exiting the host process',async t=>{
 const signals=new EventEmitter();
 const browser=await browserSession({chromium,timeout:10000,signalTarget:signals});
 t.after(()=>browser.close());
 const profile=browser.profilePath;
 signals.emit('SIGTERM');
 await browser.interrupted;
 assert.equal(browser.closed,true);
 assert.equal(alive(browser.pid),false);
 assert.equal(await exists(profile),false);
});

test('repeated browser sessions do not leak profiles',async t=>{
 const owned=[];
 for(let index=0;index<3;index++){
  const browser=await browserSession({chromium,timeout:10000});
  t.after(()=>browser.close());
  owned.push(browser.profilePath);
  const tab=await browser.tab();
  await tab.close();
  await browser.close();
  assert.equal(alive(browser.pid),false);
 }
 for(const profile of owned)assert.equal(await exists(profile),false);
});
