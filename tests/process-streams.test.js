import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {stopOwnedProcess} from '../src/browser-cleanup.js';
import {withStageTimeout} from '../src/cdp.js';

async function tree(t){
 let socket,released=false;const controlErrors=[];
 // Keep setup independent from timings or PID polling.
 const server=await new Promise(resolve=>{
  const listener=createServer(connected=>{socket=connected;socket.on('error',error=>controlErrors.push(error.code));});
  listener.listen(0,'127.0.0.1',()=>resolve(listener));
 });
 t.after(()=>new Promise(resolve=>{socket?.destroy();server.close(resolve);}));
 const release=()=>{if(!released&&!socket?.destroyed){released=true;socket?.write('release');}};
 const child=spawn(process.execPath,[fileURLToPath(new URL('./fixtures/owned-pipe-parent.cjs',import.meta.url)),'parent',String(server.address().port)],{stdio:['ignore','ignore','pipe','ipc'],windowsHide:true});
 child.stderr.resume();const events=[];
 child.once('exit',()=>events.push('exit'));child.stderr.once('close',()=>events.push('stderr-close'));child.once('close',()=>events.push('close'));
 const exited=once(child,'exit'),closed=once(child,'close');
 t.after(async()=>{
  release();if(child.connected)child.send('exit-root');
  await withStageTimeout(closed,{stage:'Owned fixture cleanup',timeoutMs:12000});
  assert.ok(controlErrors.every(code=>code==='ECONNRESET'),'Only reset from deliberate fixture termination is expected');
 });
 await withStageTimeout(once(child,'message'),{stage:'Owned fixture readiness',timeoutMs:5000});
 return {child,events,exited,closed,release,get socket(){return socket;}};
}

test('native parent exit precedes inherited stderr and close while a controlled descendant remains alive',async t=>{
 const fixture=await tree(t);fixture.child.send('exit-root');await fixture.exited;
 assert.equal(fixture.child.exitCode,0);assert.deepEqual(fixture.events,['exit']);
 await stopOwnedProcess(fixture.child,{launch:()=>assert.fail('Never taskkill a stale root PID')});
 assert.deepEqual(fixture.events,['exit'],'Root-only stop is not full lifecycle proof');
 assert.equal(fixture.child.stderr.destroyed,false);
 fixture.release();await fixture.closed;
 assert.equal(fixture.events[0],'exit');assert.deepEqual(new Set(fixture.events.slice(1)),new Set(['stderr-close','close']));
});

test('Windows termination of a live owned fixture tree releases the descendant and inherited pipe',{skip:process.platform!=='win32'},async t=>{
 const fixture=await tree(t);
 assert.equal(fixture.child.exitCode,null);
 await stopOwnedProcess(fixture.child,{timeoutMs:5000});
 await withStageTimeout(fixture.closed,{stage:'Owned tree streams',timeoutMs:5000});
 assert.equal(fixture.child.stderr.destroyed,true);assert.ok(fixture.socket.destroyed||fixture.socket.readableEnded);
 assert.ok(fixture.events.indexOf('exit')<fixture.events.indexOf('close'));
});
