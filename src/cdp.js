import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {resolveBrowserExecutable} from './browser-locator.js';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const waitForExit=(child,timeoutMs)=>child.exitCode!==null?Promise.resolve(true):new Promise(resolve=>{const timer=setTimeout(()=>{cleanup();resolve(false);},timeoutMs);timer.unref?.();const exited=()=>{cleanup();resolve(true);};const cleanup=()=>{clearTimeout(timer);child.off('exit',exited);};child.once('exit',exited);});
const processAlive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};

export class StageTimeoutError extends Error{
 constructor(stage,timeoutMs,route){super(`${stage} timed out after ${timeoutMs} ms${route?` for ${route}`:''}`);this.name='StageTimeoutError';this.code='VUD_TIMEOUT';this.stage=stage;this.route=route;this.timeoutMs=timeoutMs;}
}

export async function withStageTimeout(value,{stage='Operation',timeoutMs=10000,route}={}){
 let timer;
 const timeout=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new StageTimeoutError(stage,timeoutMs,route)),timeoutMs);timer.unref?.();});
 try{return await Promise.race([Promise.resolve(value),timeout]);}finally{clearTimeout(timer);}
}

async function freePort(){const server=createServer();await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}

async function poll(url,timeoutMs){
 const deadline=Date.now()+timeoutMs;
 while(Date.now()<deadline){
  const remaining=Math.max(1,Math.min(1000,deadline-Date.now()));
  try{const response=await fetch(url,{signal:AbortSignal.timeout(remaining)});if(response.ok)return await response.json();}catch{}
  await delay(Math.min(100,Math.max(1,deadline-Date.now())));
 }
 throw new StageTimeoutError('Browser startup',timeoutMs);
}

async function killProcessTree(child,timeoutMs){
 if(child.exitCode!==null)return;
 child.kill('SIGTERM');
 if(await waitForExit(child,Math.min(1000,timeoutMs)))return;
 if(!processAlive(child.pid))return;
 if(process.platform==='win32'){
  const killer=spawn('taskkill',['/pid',String(child.pid),'/t','/f'],{stdio:'ignore',windowsHide:true});
  await waitForExit(killer,Math.min(2000,timeoutMs));
 }else child.kill('SIGKILL');
 if(!processAlive(child.pid))return;
 if(!await waitForExit(child,timeoutMs)&&processAlive(child.pid))throw new Error(`Browser shutdown timed out after ${timeoutMs} ms for owned PID ${child.pid}`);
}

export async function browserSession({chromium,timeout=12000,operationTimeout=10000,shutdownTimeout=5000,signalTarget=process}={}){
 const executable=resolveBrowserExecutable({explicit:chromium});
 const port=await freePort();
 const profilePath=await mkdtemp(join(tmpdir(),'vision-ui-doctor-'));
 const child=spawn(executable,['--headless=new',...(process.env.VISION_UI_NO_SANDBOX==='1'?['--no-sandbox']:[]),'--no-first-run','--no-default-browser-check','--no-proxy-server','--disable-background-networking','--disable-extensions','--disable-dev-shm-usage','--remote-allow-origins=*','--remote-debugging-address=127.0.0.1',`--remote-debugging-port=${port}`,`--user-data-dir=${profilePath}`,'about:blank'],{stdio:'ignore',windowsHide:true});
 const tabs=new Set();let closePromise=null,closed=false,resolveInterrupted,rejectInterrupted;
 const interrupted=new Promise((resolve,reject)=>{resolveInterrupted=resolve;rejectInterrupted=reject;});
 const signalHandlers=new Map();

 const removeSignalHandlers=()=>{for(const [signal,handler] of signalHandlers)signalTarget?.off?.(signal,handler);signalHandlers.clear();};
 const close=()=>{
  if(closePromise)return closePromise;
  closePromise=(async()=>{
   removeSignalHandlers();const errors=[];
   for(const tab of [...tabs])try{await tab.close();}catch(error){errors.push(error);}
   try{await killProcessTree(child,shutdownTimeout);}catch(error){errors.push(error);}
   try{await rm(profilePath,{force:true,recursive:true,maxRetries:3,retryDelay:100});}catch(error){errors.push(new Error(`Temporary browser profile cleanup failed: ${error.message}`));}
   closed=true;
   if(errors.length)throw new AggregateError(errors,'Browser cleanup failed');
  })();
  return closePromise;
 };
 for(const signal of ['SIGINT','SIGTERM']){
  const handler=()=>{if(signalTarget===process)process.exitCode=signal==='SIGINT'?130:143;close().then(resolveInterrupted,rejectInterrupted);};
  signalHandlers.set(signal,handler);signalTarget?.once?.(signal,handler);
 }

 try{await poll(`http://127.0.0.1:${port}/json/version`,timeout);}catch(error){
  let cleanupError;try{await close();}catch(caught){cleanupError=caught;}
  const suffix='Install Chromium or supply --chromium /path/to/browser';
  throw new Error(`${error.message}. ${suffix}${cleanupError?`; cleanup also failed: ${cleanupError.message}`:''}`,{cause:error});
 }

 async function tab(){
  if(closed||closePromise)throw new Error('Browser session is closed');
  const response=await withStageTimeout(fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT',signal:AbortSignal.timeout(operationTimeout)}),{stage:'Open browser tab',timeoutMs:operationTimeout});
  if(!response.ok)throw new Error(`Unable to open browser tab: DevTools returned HTTP ${response.status}`);
  const target=await response.json();
  const socket=await cdpSocket(target.webSocketDebuggerUrl,{timeoutMs:operationTimeout,onClose:()=>tabs.delete(socket)});
  tabs.add(socket);return socket;
 }

 return {tab,close,interrupted,pid:child.pid,profilePath,get closed(){return closed;},get openTabCount(){return tabs.size;}};
}

export async function cdpSocket(url,{timeoutMs=10000,onClose=()=>{}}={}){
 const ws=new WebSocket(url);const pending=new Map();let next=0,closed=false,closePromise=null;
 await withStageTimeout(new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',()=>reject(new Error('CDP WebSocket connection failed')),{once:true});}),{stage:'CDP connection',timeoutMs});
 const rejectPending=reason=>{for(const request of pending.values()){clearTimeout(request.timer);request.reject(new Error(`${reason} while waiting for ${request.method}`));}pending.clear();};
 ws.addEventListener('message',event=>{let message;try{message=JSON.parse(event.data);}catch{return;}if(!message.id)return;const request=pending.get(message.id);if(!request)return;pending.delete(message.id);clearTimeout(request.timer);if(message.error)request.reject(new Error(`CDP ${request.method} failed: ${message.error.message}`));else request.resolve(message.result||{});});
 ws.addEventListener('close',()=>{closed=true;rejectPending('Browser connection closed');onClose();});
 ws.addEventListener('error',()=>rejectPending('Browser WebSocket error'));
 const send=(method,params={})=>new Promise((resolve,reject)=>{
  if(closed||ws.readyState!==WebSocket.OPEN){reject(new Error(`Browser connection closed before ${method}`));return;}
  const id=++next;const timer=setTimeout(()=>{if(pending.delete(id))reject(new StageTimeoutError(`CDP ${method}`,timeoutMs));},timeoutMs);timer.unref?.();pending.set(id,{resolve,reject,method,timer});
  try{ws.send(JSON.stringify({id,method,params}));}catch(error){clearTimeout(timer);pending.delete(id);reject(new Error(`CDP ${method} send failed: ${error.message}`));}
 });
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.text||'Evaluation failed');return result.result?.value;};
 const close=()=>{
  if(closePromise)return closePromise;
  closePromise=(async()=>{if(closed){onClose();return;}try{await send('Page.close');}catch(error){const forcedFallback=error.code==='VUD_TIMEOUT'&&/CDP Page\.close/.test(error.message);if(!forcedFallback&&!/connection closed|websocket error|not attached to an active page/i.test(error.message))throw error;}finally{if(ws.readyState===WebSocket.OPEN||ws.readyState===WebSocket.CONNECTING)ws.close();}await withStageTimeout(new Promise(resolve=>{if(closed)resolve();else ws.addEventListener('close',resolve,{once:true});}),{stage:'CDP tab shutdown',timeoutMs});})();
  return closePromise;
 };
 return {send,evaluate,close,get closed(){return closed;}};
}

export const sleep=delay;
