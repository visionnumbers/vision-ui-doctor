import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {setImmediate as yieldEvent} from 'node:timers/promises';
import {startPhpFixture} from './helpers/php-fixture.js';

function harness({code=null,signal=null,onKill=()=>true,request=async()=>({ok:true}),timeoutMs=2000}={}){
 const child=Object.assign(new EventEmitter(),{pid:101,exitCode:code,signalCode:signal,kill:action=>onKill(action,child)}),timers=[];
 const fixture=startPhpFixture({port:4173,cwd:new URL('./fixtures/',import.meta.url),launch:(file,args,options)=>{assert.equal(file,'php');assert.equal(options.windowsHide,true);assert.equal(options.env.PHP_CLI_SERVER_WORKERS,undefined);return child;},setTimer:(callback,ms)=>{const timer={callback,ms,active:true};timers.push(timer);return timer;},clearTimer:timer=>{timer.active=false;},request,timeoutMs});
 return {child,fixture,timers,fire(){const timer=timers.find(item=>item.active);assert.ok(timer,'Expected a pending bounded deadline');timer.active=false;timer.callback();}};
}
function finish(child,code,signal){child.exitCode=code;child.signalCode=signal;child.emit('exit',code,signal);child.emit('close',code,signal);}

test('PHP normal owned teardown waits for close after exit and is idempotent',async()=>{
 const {child,fixture,timers}=harness({onKill:(signal,child)=>{assert.equal(signal,'SIGTERM');child.signalCode=signal;child.emit('exit',null,signal);return true;}});
 await fixture.ready();let settled=false;const done=fixture.close().then(()=>{settled=true;});assert.equal(fixture.close(),fixture.close());
 await Promise.resolve();assert.equal(settled,false);child.emit('close',null,'SIGTERM');await done;
 assert.equal(timers.filter(item=>item.active).length,0);assert.equal(child.listenerCount('error'),0);
});

test('PHP natural abnormal exit255 is reported, not accepted as deliberate termination',async()=>{
 const {child,fixture}=harness({onKill:()=>assert.fail('An exited/reused PID must never be signalled')});
 finish(child,255,null);await assert.rejects(fixture.close(),/PHP fixture exited unexpectedly.*255/);
});

test('PHP nonzero crash after termination request is not hidden',async()=>{
 const {fixture}=harness({onKill:(signal,child)=>{finish(child,255,null);return true;}});
 await assert.rejects(fixture.close(),/PHP fixture exited unexpectedly.*255/);
});

test('PHP natural clean exit is accepted after close without signalling a stale PID',async()=>{
 const {child,fixture}=harness({onKill:()=>assert.fail('No stale signal')});finish(child,0,null);await fixture.close();
});

test('PHP teardown timeout escalates only the owned handle and still reports deadline failure',async()=>{
 const signals=[];const state=harness({onKill:(signal,child)=>{signals.push(signal);if(signal==='SIGKILL')finish(child,null,signal);return true;}});
 const done=assert.rejects(state.fixture.close(),/PHP fixture teardown timed out/);state.fire();await done;assert.deepEqual(signals,['SIGTERM','SIGKILL']);
});

test('PHP persistent teardown failure is bounded and reports the still-live fixture',async()=>{
 const state=harness();const done=assert.rejects(state.fixture.close(),/PHP fixture teardown failed.*still running/);
 state.fire();await yieldEvent();state.fire();await done;assert.equal(state.timers.filter(item=>item.active).length,0);
 // Settle the synthetic handle after classification; never hide the failure.
 finish(state.child,null,'SIGKILL');
});

test('PHP exited process with delayed streams must not be signalled again',async()=>{
 const signals=[];const state=harness({onKill:(signal,child)=>{signals.push(signal);child.signalCode=signal;child.emit('exit',null,signal);return true;}});
 const done=assert.rejects(state.fixture.close(),/PHP fixture teardown failed.*streams did not close/);state.fire();await yieldEvent();state.fire();await done;assert.deepEqual(signals,['SIGTERM']);state.child.emit('close',null,'SIGTERM');
});

test('PHP launch errors are sanitized and settle readiness/teardown',async()=>{
 const {child,fixture}=harness();child.emit('error',new Error('PRIVATE_PHP_PATH_CANARY'));child.emit('close',-2,null);
 for(const operation of [()=>fixture.ready(),()=>fixture.close()])await assert.rejects(operation(),error=>/PHP fixture launch failed/.test(error.message)&&!error.message.includes('PRIVATE_PHP_PATH_CANARY'));
});

test('PHP readiness stops immediately when server exited abnormally',async()=>{
 const {child,fixture}=harness();finish(child,255,null);await assert.rejects(fixture.ready(),/PHP fixture exited unexpectedly.*255/);await assert.rejects(fixture.close());
});

test('PHP hung readiness is bounded and fixture still tears down after startup failure',async()=>{
 const state=harness({timeoutMs:100,request:()=>new Promise(()=>{}),onKill:(signal,child)=>{finish(child,null,signal);return true;}});
 const ready=assert.rejects(state.fixture.ready(),/PHP fixture readiness timed out/);state.fire();await ready;await state.fixture.close();assert.equal(state.timers.filter(item=>item.active).length,0);
});
