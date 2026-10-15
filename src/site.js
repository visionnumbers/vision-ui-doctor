import {readFile} from 'node:fs/promises';
import {browserSession,sleep,withStageTimeout} from './cdp.js';
import {normalizeRouteUrl,redactSensitiveText,redactUrl,routeFromUrl} from './url.js';

const MAX_QUERY_VARIANTS_PER_PATH=3;

async function waitForDocumentReady(tab,timeoutMs=10000,route='discovery route'){
 const deadline=Date.now()+timeoutMs;
 while(Date.now()<deadline){
  const state=await withStageTimeout(tab.evaluate('document.readyState'),{stage:'Discovery DOM readiness',timeoutMs:Math.max(1,deadline-Date.now()),route}).catch(error=>{if(error.code==='VUD_TIMEOUT')throw error;return null;});
  if(state==='complete')return;
  await sleep(100);
 }
 throw Error(`Discovery DOM readiness timed out after ${timeoutMs} ms for ${route}`);
}

export function scopeUrl(base, candidate){
 const normalized=normalizeRouteUrl(base,candidate);
 return normalized?.navigationUrl||null;
}
export async function authenticate(browser,{baseUrl,loginUrl,usernameEnv='VISION_UI_USERNAME',passwordEnv='VISION_UI_PASSWORD',userSelector='input[name="email"]',passwordSelector='input[type="password"]',submitSelector='button[type="submit"]',waitMs=1200,timeoutMs=10000}){
 const username=process.env[usernameEnv],password=process.env[passwordEnv];if(!username||!password)throw Error(`Set ${usernameEnv} and ${passwordEnv} in your terminal environment`);
 const dest=new URL(loginUrl,baseUrl);if(dest.origin!==new URL(baseUrl).origin)throw Error('Login must remain on target origin');
 const tab=await browser.tab();try{
  await withStageTimeout(tab.send('Page.enable'),{stage:'Login page setup',timeoutMs,route:dest.pathname});await withStageTimeout(tab.send('Runtime.enable'),{stage:'Login runtime setup',timeoutMs,route:dest.pathname});const nav=await withStageTimeout(tab.send('Page.navigate',{url:dest.href}),{stage:'Login navigation',timeoutMs,route:dest.pathname});if(nav.errorText)throw Error(`Login navigation failed for ${dest.pathname}: ${nav.errorText}`);
  await sleep(1300);
  const payload=JSON.stringify({username,password,userSelector,passwordSelector,submitSelector});
  const outcome=await withStageTimeout(tab.evaluate(`(async()=>{const a=${payload};const input=(selector,value)=>{const el=document.querySelector(selector);if(!el)return false;const proto=Object.getPrototypeOf(el);const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;if(setter)setter.call(el,value);else el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true};if(!input(a.userSelector,a.username)||!input(a.passwordSelector,a.password))return 'missing-login-input';const button=document.querySelector(a.submitSelector);if(!button)return 'missing-submit';button.click();return 'submitted'})()`),{stage:'Login form submission',timeoutMs,route:dest.pathname});
  if(outcome!=='submitted')throw Error('Login controls not found: '+outcome);
  await sleep(waitMs);const state=await withStageTimeout(tab.evaluate(`({url:location.origin+location.pathname,passwordVisible:!!document.querySelector(${JSON.stringify(passwordSelector)})})`),{stage:'Login result inspection',timeoutMs,route:dest.pathname});
  return {submitted:true,loginPageStillVisible:state.passwordVisible,landingUrl:state.url};
 }finally{await tab.close();}
}
export async function discoverRoutes({url,chromium,allowRemote=false,maxRoutes=30,login=null,waitMs=350,timeoutMs=10000,browserFactory=browserSession}){
 const base=new URL(url);if(!allowRemote&&!['localhost','127.0.0.1','[::1]'].includes(base.hostname))throw Error('Remote audit requires --allow-remote');
 const initial=normalizeRouteUrl(url,url);if(!initial)throw Error('Audit URL is outside its own route scope');
 // A short discovery deadline must not interrupt independent browser cleanup.
 const browser=await browserFactory({chromium,timeout:timeoutMs,operationTimeout:timeoutMs,shutdownTimeout:5000});const found=new Map([[initial.identity,initial.navigationUrl]]),queryVariants=new Map(),errors=[];
 const addCandidate=candidate=>{const normalized=normalizeRouteUrl(url,candidate);if(!normalized||found.has(normalized.identity)||found.size>=maxRoutes)return null;const parsed=new URL(normalized.navigationUrl);const hasQueryState=!!(parsed.search||parsed.hash.includes('?'));if(hasQueryState){const variants=queryVariants.get(normalized.pathKey)||new Set();if(variants.size>=MAX_QUERY_VARIANTS_PER_PATH)return null;variants.add(normalized.identity);queryVariants.set(normalized.pathKey,variants);}found.set(normalized.identity,normalized.navigationUrl);return normalized;};
 if(new URL(initial.navigationUrl).search||new URL(initial.navigationUrl).hash.includes('?'))queryVariants.set(initial.pathKey,new Set([initial.identity]));
 try{if(login)await authenticate(browser,{baseUrl:url,timeoutMs,...login});const queue=[initial.navigationUrl];while(queue.length&&found.size<maxRoutes){const next=queue.shift();const route=routeFromUrl(next);const tab=await browser.tab();try{await withStageTimeout(tab.send('Page.enable'),{stage:'Discovery page setup',timeoutMs,route});await withStageTimeout(tab.send('Runtime.enable'),{stage:'Discovery runtime setup',timeoutMs,route});const nav=await withStageTimeout(tab.send('Page.navigate',{url:next}),{stage:'Discovery navigation',timeoutMs,route});if(nav.errorText)throw Error(`Discovery navigation failed for ${route}: ${nav.errorText}`);await waitForDocumentReady(tab,timeoutMs,route);const finalUrl=await withStageTimeout(tab.evaluate('location.href'),{stage:'Discovery URL inspection',timeoutMs,route});if(!normalizeRouteUrl(url,finalUrl))throw Error('Navigation redirected outside target scope');if(waitMs)await sleep(waitMs);const links=await withStageTimeout(tab.evaluate(`Array.from(document.querySelectorAll('a[href]')).map(x=>x.href).slice(0,1200)`),{stage:'Discovery link inspection',timeoutMs,route});for(const link of links){const added=addCandidate(link);if(added)queue.push(added.navigationUrl);}}catch(e){errors.push({url:redactUrl(next),error:redactSensitiveText(e.message)});}finally{try{await tab.close();}catch(error){errors.push({url:redactUrl(next),error:redactSensitiveText(`Discovery tab cleanup failed: ${error.message}`)});}}}
 }finally{await browser.close();}
 return {routes:[...found.values()].map(routeFromUrl),errors,discovery:`same-origin in-base links only; query variants capped at ${MAX_QUERY_VARIANTS_PER_PATH} per path/state; non-route fragments ignored; button-driven SPA states require explicit routes or scripts`};
}
export async function checkBackend({baseUrl,endpointFile,allowRemote=false,timeoutMs=8000}){
 if(!endpointFile)return [];
 const origin=new URL(baseUrl);if(!allowRemote&&!['localhost','127.0.0.1','[::1]'].includes(origin.hostname))throw Error('Remote audit requires --allow-remote');
 const data=JSON.parse(await readFile(endpointFile,'utf8'));
 if(!Array.isArray(data))throw Error('Endpoint config must be an array');
 const out=[];
 for(const entry of data.slice(0,100)){
  const p=typeof entry==='string'?{path:entry}:entry;const method=(p.method||'GET').toUpperCase();if(!['GET','HEAD'].includes(method))throw Error('Only GET and HEAD backend checks supported');
  const target=new URL(p.path,baseUrl);if(target.origin!==origin.origin)throw Error('Endpoint origin mismatch');
  const start=Date.now();try{const response=await fetch(target,{method,redirect:'manual',signal:AbortSignal.timeout(timeoutMs),headers:{'accept':'application/json, text/plain, */*'}});out.push({path:target.pathname,method,status:response.status,ok:(p.expectedStatus??200)===response.status,durationMs:Date.now()-start,expectedStatus:p.expectedStatus??200,contentType:response.headers.get('content-type')||''});}catch(e){out.push({path:target.pathname,method,ok:false,error:e.name==='TimeoutError'?`Backend request timed out after ${timeoutMs} ms for ${target.pathname}`:`Backend request failed for ${target.pathname}: ${e.message}`,durationMs:Date.now()-start});}
 }
 return out;
}
