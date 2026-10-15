import {spawn} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';

// Test-only owner for this repository's single-process PHP router fixture.
// No PID-based commands or generic process-tree killer are exposed here.
export function startPhpFixture({port,cwd,launch=spawn,request=fetch,timeoutMs=2000,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 const env={...process.env};delete env.PHP_CLI_SERVER_WORKERS;
 const base=`http://127.0.0.1:${port}`;
 const child=launch('php',['-S',`127.0.0.1:${port}`,'router.php'],{cwd,env,stdio:'ignore',windowsHide:true});
 let exitSeen=false,closeSeen=false,launchFailed=false,exitCode=null,exitSignal=null,requestedSignal=null,closePromise,readyPromise,resolveClosed;
 const closed=new Promise(resolve=>{resolveClosed=resolve;});
 const onError=()=>{launchFailed=true;};
 const onExit=(code,signal)=>{exitSeen=true;exitCode=code;exitSignal=signal;};
 const detach=()=>{child.off('error',onError);child.off('exit',onExit);child.off('close',onClose);};
 const onClose=()=>{closeSeen=true;resolveClosed();detach();};
 child.on('error',onError);child.once('exit',onExit);child.once('close',onClose);
 const hasExited=()=>exitSeen||child.exitCode!==null||child.signalCode!=null;
 const unexpected=()=>new Error(`PHP fixture exited unexpectedly (code ${exitCode??child.exitCode??'none'}, signal ${exitSignal??child.signalCode??'none'})`);
 const failure=()=>launchFailed?new Error('PHP fixture launch failed (raw diagnostics withheld)'):hasExited()?unexpected():null;
 async function bounded(work,stage,ms=timeoutMs){
  let timer;try{return await Promise.race([work,new Promise((resolve,reject)=>{timer=setTimer(()=>reject(new Error(`PHP fixture ${stage} timed out`)),ms);})]);}finally{clearTimer(timer);}
 }
 function ready(){
  if(readyPromise)return readyPromise;
  readyPromise=(async()=>{
   const deadline=Date.now()+timeoutMs;
   for(let attempt=0;attempt<40;attempt++){
    if(failure())throw failure();const remaining=deadline-Date.now();if(remaining<=0)break;
    const controller=new AbortController();let response;
    try{response=await bounded(request(base,{signal:controller.signal}),'readiness',Math.min(250,remaining));}
    catch{if(remaining<=250)break;}
    finally{controller.abort();}
    if(failure())throw failure();if(response?.ok)return;
    await pause(Math.min(50,Math.max(0,deadline-Date.now())));
   }
   throw failure()||new Error('PHP fixture readiness timed out');
  })();return readyPromise;
 }
 function close(){
  if(closePromise)return closePromise;
  closePromise=(async()=>{
   try{
    if(!hasExited()&&!launchFailed&&child.pid){
     try{if(child.kill('SIGTERM'))requestedSignal='SIGTERM';}catch{/* Bounded forced cleanup below still owns only this handle. */}
    }
    try{if(!closeSeen)await bounded(closed,'teardown');}
    catch(timeout){
     // A handle that emitted exit is never signalled again, even if its numeric
     // PID now identifies another process. A delayed close still remains failure.
     if(!hasExited()&&child.pid)try{if(child.kill('SIGKILL'))requestedSignal='SIGKILL';}catch{}
     try{if(!closeSeen)await bounded(closed,'forced teardown');}
     catch{throw new Error(`PHP fixture teardown failed: ${hasExited()?'process streams did not close':'owned process still running'}`);}
     throw timeout; // Recovery must not turn a shutdown deadline breach green.
    }
    if(launchFailed)throw new Error('PHP fixture launch failed (raw diagnostics withheld)');
    if(!exitSeen)throw new Error('PHP fixture process exit was not confirmed');
    if(exitCode===0&&exitSignal===null)return;
    if(requestedSignal&&exitSignal===requestedSignal&&exitCode===null)return;
    throw unexpected();
   }finally{if(closeSeen)detach();}
  })();return closePromise;
 }
 return {pid:child.pid,base,ready,close,snapshot:()=>({exitSeen,closeSeen,exitCode,exitSignal,requestedSignal})};
}
