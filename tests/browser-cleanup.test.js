import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {mkdtemp,rm,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {removeOwnedProfile,stopOwnedProcess} from '../src/browser-cleanup.js';
import {browserSession} from '../src/cdp.js';

async function profile(t){const path=await mkdtemp(join(tmpdir(),'vision-ui-doctor-'));t.after(()=>rm(path,{recursive:true,force:true}));return path;}
const busy=code=>Object.assign(new Error('sensitive/path/lockfile?token=never-report'),{code,path:'sensitive/path/lockfile'});
const child=(pid=101)=>{
 const fixtureChild=Object.assign(new EventEmitter(),{pid,exitCode:null,signalCode:null,stderr:new PassThrough(),kill(){throw new Error('Must not kill only the Windows parent');}});
 const emit=fixtureChild.emit.bind(fixtureChild);
 fixtureChild.emit=(event,...args)=>{const result=emit(event,...args);if(event==='exit'&&pid===202)setImmediate(()=>{fixtureChild.stdout?.end();fixtureChild.stderr.end();emit('close',...args);});return result;};
 return fixtureChild;
};

for(const code of ['EBUSY','EPERM','ENOTEMPTY'])test(`transient ${code} retries only the owned profile and verifies removal`,async t=>{
 const path=await profile(t),delays=[];let calls=0;
 await removeOwnedProfile(path,{remove:async(target,options)=>{assert.equal(target,path);assert.equal(options.recursive,true);if(++calls<3)throw busy(code);await rm(target,options);},sleep:async ms=>delays.push(ms)});
 assert.equal(calls,3);assert.deepEqual(delays,[100,200]);
 await assert.rejects(lstat(path),{code:'ENOENT'});
});

test('persistent EBUSY fails explicitly after bounded retries and retains profile',async t=>{
 const path=await profile(t),delays=[];let calls=0;
 await assert.rejects(removeOwnedProfile(path,{remove:async()=>{calls++;throw busy('EBUSY');},sleep:async ms=>delays.push(ms)}),error=>{
  assert.equal(error.code,'EBUSY');assert.equal(error.stage,'Browser profile cleanup');
  assert.equal(error.pathType,'profile lockfile');assert.equal(error.attempts,7);
  assert.doesNotMatch(error.stack,/sensitive|never-report/);return true;
 });
 assert.equal(calls,7);assert.deepEqual(delays,[100,200,300,400,500,600]);assert.ok(await lstat(path));
});

test('non-transient removal error does not retry or leak raw filesystem details',async t=>{
 const path=await profile(t);let calls=0;
 await assert.rejects(removeOwnedProfile(path,{remove:async()=>{calls++;throw busy('EACCES');},sleep:async()=>assert.fail('Unexpected retry')}),error=>error.code==='EACCES'&&!/sensitive|never-report/.test(error.message));
 assert.equal(calls,1);
});

test('successful removal callback cannot report success while profile still exists',async t=>{
 const path=await profile(t);let calls=0;
 await assert.rejects(removeOwnedProfile(path,{remove:async()=>{calls++;},sleep:async()=>{}}),{code:'ENOTEMPTY'});
 assert.equal(calls,7);assert.ok(await lstat(path));
});

test('refuses unrelated or broad profile targets before invoking removal',async()=>{
 for(const target of [tmpdir(),join(tmpdir(),'normal-chrome-profile'),join(tmpdir(),'nested','vision-ui-doctor-abcdef')])
  await assert.rejects(removeOwnedProfile(target,{remove:async()=>assert.fail('Unsafe target reached filesystem')}),/owned temporary browser profile/);
});

test('Windows tree termination runs before root kill and waits for taskkill completion',async()=>{
 const browser=child(),killer=child(202);let command,args,options,settled=false;
 const done=stopOwnedProcess(browser,{platform:'win32',timeoutMs:1000,launch:(file,argv,opts)=>{command=file;args=argv;options=opts;return killer;},isAlive:()=>false}).then(()=>{settled=true;});
 assert.equal(command,'taskkill');assert.deepEqual(args,['/pid','101','/t','/f']);assert.equal(options.windowsHide,true);
 browser.exitCode=0;browser.emit('exit',0,null);await Promise.resolve();assert.equal(settled,false,'Parent exit alone does not prove tree cleanup');
 killer.exitCode=0;killer.emit('exit',0,null);await done;
 assert.equal(killer.listenerCount('error'),0);assert.equal(killer.listenerCount('exit'),0);
});

test('failed Windows tree termination is explicit and never targets a different process',async()=>{
 const browser=child(),killer=child(202);
 await assert.rejects(stopOwnedProcess(browser,{platform:'win32',launch:()=>{queueMicrotask(()=>{killer.exitCode=1;killer.emit('exit',1,null);});return killer;},isAlive:()=>true}),/process-tree shutdown.*taskkill.*1/i);
});

for(const descendantAlive of [false,true])test(`already-gone taskkill race requires every reported process dead (survivor=${descendantAlive})`,async()=>{
 const killer=child(202);killer.stdout=new PassThrough();
 const launch=()=>{queueMicrotask(()=>{
  killer.stdout.write('SUCCESS: The process with PID 102 (child process of PID 101) has been terminated.\nERROR: The process with PID 101 could not be terminated.\nReason: There is no running instance of the task.\n');
  killer.exitCode=255;killer.emit('exit',255,null);
 });return killer;};
 const stopping=stopOwnedProcess(child(),{platform:'win32',launch,isAlive:pid=>pid===102&&descendantAlive});
 if(descendantAlive)await assert.rejects(stopping,/taskkill exit code 255/);else await stopping;
});

test('unknown taskkill error is never treated as a harmless race even if parent is gone',async()=>{
 const killer=child(202);killer.stdout=new PassThrough();
 await assert.rejects(stopOwnedProcess(child(),{platform:'win32',isAlive:()=>false,launch:()=>{queueMicrotask(()=>{killer.stdout.write('ERROR: The process with PID 101 could not be terminated.\nReason: Access is denied.\n');killer.exitCode=255;killer.emit('exit',255,null);});return killer;}}),/taskkill exit code 255/);
});

test('taskkill output is fully drained after exit before interpreting an already-gone status',async()=>{
 const killer=Object.assign(new EventEmitter(),{pid:202,exitCode:null,signalCode:null,stderr:new PassThrough()});
 const launch=()=>{queueMicrotask(()=>{killer.exitCode=128;killer.emit('exit',128,null);setImmediate(()=>{if(!killer.stderr.destroyed)killer.stderr.write('ERROR: The process "101" not found.\r\n');killer.emit('close',128,null);});});return killer;};
 await stopOwnedProcess(child(),{platform:'win32',launch,isAlive:()=>false});
 assert.equal(killer.listenerCount('close'),0);
});

for(const rootAlive of [false,true])test(`taskkill missing-PID race requires verified root absence (alive=${rootAlive})`,async()=>{
 const killer=child(202);killer.stderr=new PassThrough();
 const stopping=stopOwnedProcess(child(),{platform:'win32',isAlive:()=>rootAlive,launch:()=>{queueMicrotask(()=>{killer.stderr.write('ERROR: The process "101" not found.\r\n');killer.exitCode=128;killer.emit('exit',128,null);});return killer;}});
 if(rootAlive)await assert.rejects(stopping,/taskkill exit code 128/);else await stopping;
});

test('tree tool spawn error settles and removes its listeners',async()=>{
 const killer=child(202);
 await assert.rejects(stopOwnedProcess(child(),{platform:'win32',launch:()=>{queueMicrotask(()=>killer.emit('error',new Error('private launch path')));return killer;}}),/process-tree shutdown failed: taskkill could not launch/);
 assert.equal(killer.listenerCount('error'),0);assert.equal(killer.listenerCount('exit'),0);
});

test('stuck tree tool has a bounded deadline and is stopped rather than left running',async()=>{
 const killer=child(202);let killed=false;killer.kill=signal=>{assert.equal(signal,'SIGKILL');killed=true;};
 await assert.rejects(stopOwnedProcess(child(),{platform:'win32',timeoutMs:20,launch:()=>killer}),/process-tree shutdown timed out/);
 assert.equal(killed,true);assert.equal(killer.listenerCount('error'),0);assert.equal(killer.listenerCount('exit'),0);
});

test('tree tool success cannot mask a still-running owned parent',async()=>{
 const browser=child(),killer=child(202);
 await assert.rejects(stopOwnedProcess(browser,{platform:'win32',timeoutMs:20,launch:()=>{queueMicrotask(()=>{killer.exitCode=0;killer.emit('exit',0,null);});return killer;},isAlive:()=>true}),/process.*shutdown.*timed out/i);
});

test('already-exited parent is never signalled by a potentially reused PID',async()=>{
 const browser=child();browser.exitCode=0;
 await stopOwnedProcess(browser,{platform:'win32',launch:()=>assert.fail('Exited PID must not be targeted')});
});

test('gracefully stopped native process needs no forced tree kill even if exit event is delayed',async()=>{
 await stopOwnedProcess(child(),{platform:'win32',graceful:true,isAlive:()=>false,launch:()=>assert.fail('Graceful shutdown already stopped owned process')});
});

test('parent exit during graceful wait is rechecked before any PID-based tree command',async()=>{
 const browser=child();
 queueMicrotask(()=>{browser.exitCode=0;browser.emit('exit',0,null);});
 await stopOwnedProcess(browser,{platform:'win32',graceful:true,isAlive:()=>true,launch:()=>assert.fail('Exited owned handle must win over a stale or reused numeric PID')});
});

async function fakeSession(t,{stopProcess,removeProfile,browserEndpoint=false,nativePipes=false,shutdownTimeout=5000}={}){
 const signals=new EventEmitter(),sockets=[],methods=[],browserChild=child();
 if(nativePipes)browserChild.stdio=[];
 const Original=globalThis.WebSocket;
 class Socket extends EventTarget{
  static OPEN=1;static CONNECTING=0;readyState=0;
  constructor(){super();sockets.push(this);queueMicrotask(()=>{this.readyState=1;this.dispatchEvent(new Event('open'));});}
  send(data){const request=JSON.parse(data);methods.push(request.method);queueMicrotask(()=>{if(request.method==='Browser.close'){browserChild.exitCode=0;browserChild.emit('exit',0,null);this.close();}else if(request.method==='Page.close')this.close();else this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({id:request.id,result:{}})}));});}
  close(){if(this.readyState===3)return;this.readyState=3;this.dispatchEvent(new Event('close'));}
 }
 globalThis.WebSocket=Socket;t.after(()=>{globalThis.WebSocket=Original;});
 t.mock.method(globalThis,'fetch',async url=>({ok:true,json:async()=>String(url).includes('/json/new')?{webSocketDebuggerUrl:'ws://127.0.0.1/fake'}:browserEndpoint?{webSocketDebuggerUrl:'ws://127.0.0.1/browser'}:{}}));
 const browser=await browserSession({chromium:process.execPath,launch:()=>browserChild,signalTarget:signals,stopProcess,removeProfile,shutdownTimeout});
 t.after(()=>rm(browser.profilePath,{recursive:true,force:true}));
 return {browser,signals,sockets,methods,browserChild};
}

test('all page sockets close before graceful Browser.close and verified process/profile cleanup',async t=>{
 let stopped=false;
 const fixture=await fakeSession(t,{browserEndpoint:true,stopProcess:async(child,options)=>{assert.equal(child.exitCode,0);assert.equal(options.graceful,true);stopped=true;},removeProfile:async path=>{assert.equal(stopped,true);await removeOwnedProfile(path);}});
 await fixture.browser.tab();await fixture.browser.tab();await fixture.browser.close();
 assert.deepEqual(fixture.methods,['Page.close','Page.close','Browser.close']);
 assert.ok(fixture.sockets.every(ws=>ws.readyState===3));
 await assert.rejects(lstat(fixture.browser.profilePath),{code:'ENOENT'});
});

test('close settles all tabs and process termination before profile deletion; idempotent',async t=>{
 const order=[];let fixture;
 fixture=await fakeSession(t,{stopProcess:async()=>{assert.ok(fixture.sockets.every(ws=>ws.readyState===3));order.push('process-exit');fixture.browserChild.exitCode=0;},removeProfile:async path=>{assert.deepEqual(order,['process-exit']);order.push('profile');await removeOwnedProfile(path);}});
 await fixture.browser.tab();await fixture.browser.tab();
 const closing=fixture.browser.close();assert.equal(fixture.browser.close(),closing);await closing;
 assert.deepEqual(order,['process-exit','profile']);assert.equal(fixture.browser.openTabCount,0);
 await assert.rejects(lstat(fixture.browser.profilePath),{code:'ENOENT'});
});

test('process shutdown failure retains profile and close remains explicitly failed',async t=>{
 let removed=false;
 const {browser}=await fakeSession(t,{stopProcess:async()=>{throw new Error('Owned process shutdown failed');},removeProfile:async()=>{removed=true;}});
 const closing=browser.close();await assert.rejects(closing,AggregateError);
 assert.equal(browser.close(),closing);assert.equal(removed,false);assert.ok(await lstat(browser.profilePath));
});

test('persistent profile lock makes every idempotent close reject and leaves the profile visible',async t=>{
 const fixture=await fakeSession(t,{stopProcess:async()=>{},removeProfile:path=>removeOwnedProfile(path,{remove:async()=>{throw busy('EBUSY');},sleep:async()=>{}})});
 const closing=fixture.browser.close();
 await assert.rejects(closing,error=>error.errors.some(item=>item.code==='EBUSY'&&item.attempts===7));
 assert.equal(fixture.browser.close(),closing);await assert.rejects(fixture.browser.close(),AggregateError);
 assert.ok(await lstat(fixture.browser.profilePath));
});

test('profile deletion waits for child close after exit and inherited stream release',async t=>{
 let removed=false,stopped;
 const processStopped=new Promise(resolve=>{stopped=resolve;});
 const fixture=await fakeSession(t,{nativePipes:true,stopProcess:async child=>{child.exitCode=0;child.emit('exit',0,null);stopped();},removeProfile:async path=>{removed=true;await removeOwnedProfile(path);}});
 const closing=fixture.browser.close();await processStopped;
 assert.equal(removed,false);fixture.browserChild.emit('close',0,null);await closing;
 assert.equal(removed,true);assert.equal(fixture.browserChild.listenerCount('close'),0);
});

test('inherited streams that never close reject within their bound and retain profile',async t=>{
 let removed=false;
 const fixture=await fakeSession(t,{nativePipes:true,shutdownTimeout:20,stopProcess:async child=>{child.exitCode=0;},removeProfile:async()=>{removed=true;}});
 await assert.rejects(fixture.browser.close(),error=>error.errors.some(item=>item.code==='VUD_TIMEOUT'&&item.stage==='Browser process streams shutdown'));
 assert.equal(removed,false);assert.equal(fixture.browserChild.listenerCount('close'),0);assert.ok(await lstat(fixture.browser.profilePath));
});

test('Windows-style interrupt settles multiple tabs, processes and profile before interrupted resolves',async t=>{
 const stages=[];
 const fixture=await fakeSession(t,{stopProcess:async()=>stages.push('process'),removeProfile:async path=>{stages.push('profile');await removeOwnedProfile(path);}});
 await fixture.browser.tab();await fixture.browser.tab();fixture.signals.emit('SIGTERM');await fixture.browser.interrupted;
 assert.deepEqual(stages,['process','profile']);assert.ok(fixture.sockets.every(ws=>ws.readyState===3));
 assert.equal(fixture.signals.listenerCount('SIGTERM'),0);
 await assert.rejects(lstat(fixture.browser.profilePath),{code:'ENOENT'});
});

for(const code of [128,255])for(const reason of ['There is no running instance of the task.','The operation attempted is not supported.'])test(`known native race ${code}/${reason} checks subject PIDs, not a live caller ancestor`,async()=>{
 const browser=child(),killer=child(202);killer.stdout=new PassThrough();
 await stopOwnedProcess(browser,{platform:'win32',isAlive:pid=>pid===999,launch:()=>{queueMicrotask(()=>{
  killer.stdout.write(`ERROR: The process with PID 102 (child process of PID 101) could not be terminated.\r\nReason: ${reason}\r\nERROR: The process with PID 101 (child process of PID 999) could not be terminated.\r\nReason: ${reason}\r\n`);
  killer.exitCode=code;killer.emit('exit',code,null);
 });return killer;}});
});

for(const code of [128,255])test(`known race ${code} must fail if a reported descendant is live or its PID reused`,async()=>{
 const killer=child(202);killer.stdout=new PassThrough();
 await assert.rejects(stopOwnedProcess(child(),{platform:'win32',isAlive:pid=>pid===102,launch:()=>{queueMicrotask(()=>{
  killer.stdout.write('ERROR: The process with PID 102 (child process of PID 101) could not be terminated.\nReason: The operation attempted is not supported.\nERROR: The process with PID 101 (child process of PID 999) could not be terminated.\nReason: The operation attempted is not supported.\n');killer.exitCode=code;killer.emit('exit',code,null);
 });return killer;}}),new RegExp(`taskkill exit code ${code}`));
});

for(const output of [
 'ERROR: The process with PID 101 could not be terminated.\nReason: Access is denied.\n',
 'ERROR: Der Prozess mit PID 101 konnte nicht beendet werden.\nGrund: Nicht gefunden.\n',
 'ERROR: The process with PID 101 could not be terminated.\nReason: There is no running instance of the task.\nUNRECOGNIZED PRIVATE_DIAGNOSTIC_CANARY\n',
 'SUCCESS: The process with PID 777 (child process of PID 888) has been terminated.\nERROR: The process with PID 101 could not be terminated.\nReason: There is no running instance of the task.\n'
])test('unknown/localized/trailing/unrelated taskkill records fail closed without raw diagnostics',async()=>{
 const killer=child(202);killer.stdout=new PassThrough();
 await assert.rejects(stopOwnedProcess(child(),{platform:'win32',isAlive:()=>false,launch:()=>{queueMicrotask(()=>{killer.stdout.write(output);killer.exitCode=128;killer.emit('exit',128,null);});return killer;}}),error=>/taskkill exit code 128/.test(error.message)&&!/PRIVATE_DIAGNOSTIC_CANARY|Der Prozess/.test(error.message));
});
