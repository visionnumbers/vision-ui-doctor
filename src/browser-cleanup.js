import {spawn} from 'node:child_process';
import {rm,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,dirname,resolve} from 'node:path';

const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const exited=child=>child.exitCode!==null||child.signalCode!=null;
const alive=pid=>{try{process.kill(pid,0);return true;}catch(error){return error.code!=='ESRCH';}};
const waitForExit=(child,timeoutMs)=>exited(child)?Promise.resolve(true):new Promise(done=>{
 const finish=value=>{clearTimeout(timer);child.off('exit',onExit);done(value);};
 const onExit=()=>finish(true),timer=setTimeout(()=>finish(false),timeoutMs);
 child.once('exit',onExit);
});

export async function stopOwnedProcess(child,{timeoutMs=5000,platform=process.platform,launch=spawn,isAlive=alive,graceful=false}={}){
 if(!child.pid||exited(child))return; // Never signal a PID after its owned process exited.
 if(graceful){
  if(exited(child)||!isAlive(child.pid))return;
  await waitForExit(child,timeoutMs);
  if(exited(child)||!isAlive(child.pid))return;
 }
 if(platform==='win32'){
  // Windows SIGTERM kills just the parent. Terminate its tree while the root exists.
  const killer=launch('taskkill',['/pid',String(child.pid),'/t','/f'],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  let output='',overflow=false;
  const capture=chunk=>{output+=chunk.toString();if(output.length>65536){overflow=true;output=output.slice(0,65536);}};
  killer.stdout?.on('data',capture);killer.stderr?.on('data',capture);
  let onError,onClose,timer;
  try{
   const code=await new Promise((done,reject)=>{
    onError=()=>reject(new Error('Browser process-tree shutdown failed: taskkill could not launch'));
    onClose=code=>done(code);
    timer=setTimeout(()=>{try{if(!exited(killer))killer.kill('SIGKILL');}catch{reject(new Error('Browser process-tree shutdown timed out; taskkill cleanup also failed'));return;}reject(new Error('Browser process-tree shutdown timed out waiting for taskkill'));},timeoutMs);
    // Read complete output only after stdio close, not merely process exit.
    killer.once('error',onError);killer.once('close',onClose);
   });
   if(code!==0){
    // taskkill races Chrome's own exit and reports errors for already-gone PIDs.
    // Accept only that known race, and independently prove every reported PID gone.
    // Unknown/localized errors or truncated output fail closed; raw output is never emitted.
    const pids=new Set([...output.matchAll(/\bPID\s+(\d+)\b/gi)].map(match=>Number(match[1])));
    const notFound=[...output.matchAll(/^ERROR:\s*The process "(\d+)" not found\.\s*$/gim)];
    for(const match of notFound)pids.add(Number(match[1]));
    const reasons=[...output.matchAll(/^Reason:\s*(.+)$/gim)].map(match=>match[1].trim());
    const errors=(output.match(/^ERROR:/gim)||[]).length;
    const goneRace=[128,255].includes(code)&&!overflow&&errors>0&&reasons.length+notFound.length===errors&&reasons.every(reason=>/^There is no running instance of the task\.?$/i.test(reason))&&pids.has(child.pid)&&[...pids].every(pid=>(pid===child.pid&&exited(child))||!isAlive(pid));
    if(!goneRace)throw new Error(`Browser process-tree shutdown failed: taskkill exit code ${code??'none'}`);
   }
  }finally{clearTimeout(timer);killer.off('error',onError);killer.off('close',onClose);killer.stdout?.off('data',capture);killer.stderr?.off('data',capture);killer.stdout?.destroy();killer.stderr?.destroy();output='';}
 }else{
  child.kill('SIGTERM');
  if(!await waitForExit(child,Math.min(1000,timeoutMs))&&isAlive(child.pid))child.kill('SIGKILL');
 }
 if(!exited(child)&&isAlive(child.pid)){
  await waitForExit(child,timeoutMs);
  if(!exited(child)&&isAlive(child.pid))throw new Error('Browser process shutdown timed out; owned temporary profile retained');
 }
}

export async function removeOwnedProfile(path,{remove=rm,stat=lstat,sleep:pause=sleep}={}){
 if(resolve(dirname(path))!==resolve(tmpdir())||!/^vision-ui-doctor-[a-z0-9]+$/i.test(basename(path)))throw new Error('Refusing to remove a path outside the owned temporary browser profile scope');
 const retryable=new Set(['EBUSY','EPERM','ENOTEMPTY']);
 for(let attempt=0;attempt<=6;attempt++){
  try{
   // One attempt at a time: bounded linear backoff is observable/testable without
   // layering retries over fs.rm's own retries (total requested backoff 2100 ms).
   await remove(path,{force:true,recursive:true,maxRetries:0});
   try{await stat(path);}catch(error){if(error.code==='ENOENT')return;throw error;}
   throw Object.assign(new Error('Owned profile still exists'),{code:'ENOTEMPTY'});
  }catch(error){
   if(retryable.has(error.code)&&attempt<6){await pause((attempt+1)*100);continue;}
   const code=/^[A-Z_]+$/.test(error.code||'')?error.code:'UNKNOWN';
   const pathType=/(?:^|[\\/])lockfile$/i.test(error.path||'')?'profile lockfile':'temporary profile entry';
   // Never retain the raw filesystem message/path/cause in reportable errors.
   const failure=new Error(`Browser profile cleanup failed (${code}; ${pathType}) after ${attempt+1} attempts; owned profile retained for cleanup`);
   Object.assign(failure,{code,stage:'Browser profile cleanup',pathType,attempts:attempt+1});
   throw failure;
  }
 }
}
