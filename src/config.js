import {openSync,closeSync,fstatSync,lstatSync,readSync,constants} from 'node:fs';
import {normalizeRouteUrl,hasSensitiveUrlState} from './url.js';

export const CONFIG_VERSION=1;
export const CONFIG_MAX_BYTES=1024*1024;
export const CONFIG_VIEWPORTS=Object.freeze(['small','mobile','tablet','laptop','desktop']);
const DEFAULT_LIMITS=Object.freeze({maxRoutes:30,maxJourneys:20,maxSteps:50,maxPlannedStates:500,timeoutMs:10000});
const HARD_LIMITS={maxRoutes:100,maxJourneys:20,maxSteps:50,maxPlannedStates:1000,timeoutMs:60000};

export class ConfigError extends Error{
 constructor(path,rule){super(`${path}: ${rule}`);this.name='ConfigError';this.code='CONFIG_INVALID';}
}
const fail=(path,rule)=>{throw new ConfigError(path,rule);};
function object(value,path,keys){
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail(path,'must be a JSON object');
 if(Object.keys(value).some(key=>!keys.includes(key)))fail(path,'contains unsupported fields; use only documented schema fields (no credentials or executable code)');
 if(Object.values(value).some(item=>item===null))fail(path,'fields must not be null; omit optional fields to use defaults');
}
function text(value,path,max=2048){if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f\u007f]/.test(value))fail(path,`must be non-empty text of at most ${max} characters without control characters`);return value;}
function localPath(value,path){
 text(value,path,4096);
 if(/^[a-z][a-z0-9+.-]*:/i.test(value)&&! /^[a-z]:[\\/]/i.test(value)||/^[\\/]{2}/.test(value))fail(path,'must be a local filesystem path, not a URL or network share');
 return value;
}
function id(value,path){if(typeof value!=='string'||! /^[a-z][a-z0-9-]{0,47}$/.test(value))fail(path,'must be a lowercase slug, starting with a letter, at most 48 characters');return value;}
function integer(value,path,min,max){if(!Number.isSafeInteger(value)||value<min||value>max)fail(path,`must be an integer from ${min} to ${max}`);return value;}
function array(value,path,min,max){if(!Array.isArray(value)||value.length<min||value.length>max)fail(path,`must be an array with ${min} to ${max} entries`);return value;}
function unique(value,seen,path){if(seen.has(value))fail(path,'duplicates an existing identifier or canonical URL');seen.add(value);}

function safeUrlText(value,path,{base=false}={}){
 text(value,path);
 if(value!==value.trim()||/[\s\\]/.test(value))fail(path,'URL must not contain whitespace or backslashes');
 const pathname=value.split(/[?#]/,1)[0];
 // Reject encoded path separators/dots before WHATWG URL can erase traversal.
 if(/%(?:25)*(?:2e|2f|5c)/i.test(pathname))fail(path,'encoded path separators or dots are not supported');
 if(base&&/(?:^|\/)\.{1,2}(?:\/|$)/.test(pathname))fail(path,'base URL must not contain dot path segments');
}
function routeUrl(base,value,path){
 safeUrlText(value,path);
 const normalized=normalizeRouteUrl(base,value);
 if(!normalized)fail(path,'must be HTTP(S), same-origin and within baseUrl path scope');
 if(hasSensitiveUrlState(normalized.navigationUrl))fail(path,'sensitive query parameters are not allowed in configuration; use non-secret route state');
 return normalized;
}

// Deliberately a documented CSS subset, not a partial browser selector parser.
// No pseudo-classes, escapes, lists, scripts or interpolation. DOM semantics are
// checked later by the executor; validating a selector does not prove it exists.
const atom=String.raw`(?:[a-zA-Z][a-zA-Z0-9_-]*|[.#][a-zA-Z_][a-zA-Z0-9_-]*|\[[a-zA-Z_][a-zA-Z0-9_-]*(?:=(?:"[^"\\\]\r\n]*"|'[^'\\\]\r\n]*'|[a-zA-Z0-9_-]+))?\])`;
const selectorAtom=new RegExp(atom,'y');
function selector(value,path){
 text(value,path,512);
 const invalid=()=>fail(path,'must use the supported CSS subset: tags, IDs, classes, attributes and combinators');
 let offset=0,needsAtom=true;
 // Consume one token at a time: nested repetitions around variable-length tag
 // tokens would permit exponential backtracking on an untrusted invalid suffix.
 while(offset<value.length){
  selectorAtom.lastIndex=offset;const token=selectorAtom.exec(value);
  if(token){
   if(!needsAtom&&/^[a-zA-Z]/.test(token[0]))invalid(); // A type selector must start its compound.
   offset=selectorAtom.lastIndex;needsAtom=false;continue;
  }
  if(needsAtom)invalid();
  const separator=/^(?:\s*[>+~]\s*|\s+)/.exec(value.slice(offset));
  if(!separator)invalid();offset+=separator[0].length;needsAtom=true;
 }
 if(needsAtom)invalid();return value;
}

export function validateProjectConfig(input){
 object(input,'config',['schemaVersion','baseUrl','routes','journeys','viewports','limits','waitMs','concurrency','screenshots','out']);
 if(input.schemaVersion!==CONFIG_VERSION)fail('config.schemaVersion','must be 1; unsupported configuration version');
 safeUrlText(input.baseUrl,'config.baseUrl',{base:true});
 let base;
 try{base=new URL(input.baseUrl);}catch{fail('config.baseUrl','must be an absolute HTTP(S) URL');}
 if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.search||base.hash)fail('config.baseUrl','must be HTTP(S), without credentials, query or fragment');
 if(!base.pathname.endsWith('/'))base.pathname+='/';
 const limits={...DEFAULT_LIMITS};
 if(input.limits!==undefined){object(input.limits,'config.limits',Object.keys(HARD_LIMITS));for(const key of Object.keys(input.limits))limits[key]=integer(input.limits[key],`config.limits.${key}`,key==='timeoutMs'?250:1,HARD_LIMITS[key]);}
 const viewports=[...array(input.viewports??CONFIG_VIEWPORTS,'config.viewports',1,5)];
 if(viewports.some(value=>!CONFIG_VIEWPORTS.includes(value))||new Set(viewports).size!==viewports.length)fail('config.viewports','must contain unique known viewport names: '+CONFIG_VIEWPORTS.join(', '));
 const ids=new Set(),identities=new Set();
 const routes=array(input.routes,'config.routes',1,limits.maxRoutes).map((route,index)=>{
  const path=`config.routes[${index}]`;object(route,path,['id','url','access']);
  unique(id(route.id,path+'.id'),ids,path+'.id');
  if(!['public','protected'].includes(route.access))fail(path+'.access','must be public or protected');
  const normalized=routeUrl(base.href,route.url,path+'.url');unique(normalized.identity,identities,path+'.url');
  return {id:route.id,url:normalized.navigationUrl,access:route.access};
 });
 const journeyIds=new Set();
 const journeys=array(input.journeys??[],'config.journeys',0,limits.maxJourneys).map((journey,index)=>{
  const path=`config.journeys[${index}]`;object(journey,path,['id','routeId','steps']);
  unique(id(journey.id,path+'.id'),journeyIds,path+'.id');
  if(!ids.has(journey.routeId))fail(path+'.routeId','must reference a configured route id');
  const stepIds=new Set();
  const steps=array(journey.steps,path+'.steps',1,limits.maxSteps).map((step,stepIndex)=>{
   const location=`${path}.steps[${stepIndex}]`;
   object(step,location,['id','action','url','selector','timeoutMs']);unique(id(step.id,location+'.id'),stepIds,location+'.id');
   const navigate=['navigate','assertUrl'].includes(step.action),select=['click','assertVisible','assertHidden','waitForVisible'].includes(step.action);
   if(!navigate&&!select)fail(location+'.action','must be navigate, click, assertVisible, assertHidden, assertUrl or waitForVisible');
   if(navigate&&Object.hasOwn(step,'selector')||select&&Object.hasOwn(step,'url'))fail(location,'contains fields incompatible with its action');
   const timeoutMs=integer(step.timeoutMs??limits.timeoutMs,location+'.timeoutMs',250,limits.timeoutMs);
   return {id:step.id,action:step.action,...(navigate?{url:routeUrl(base.href,step.url,location+'.url').navigationUrl}:{selector:selector(step.selector,location+'.selector')}),timeoutMs};
  });
  return {id:journey.id,routeId:journey.routeId,steps};
 });
 const plannedStates=(routes.length+journeys.reduce((sum,journey)=>sum+journey.steps.length,0))*viewports.length;
 if(plannedStates>limits.maxPlannedStates)fail('config.limits.maxPlannedStates','planned route/step/viewport combinations exceed this limit; reduce the manifest or raise the bounded limit');
 const waitMs=integer(input.waitMs??550,'config.waitMs',0,10000),concurrency=integer(input.concurrency??1,'config.concurrency',1,8);
 if(input.screenshots!==undefined&&typeof input.screenshots!=='boolean')fail('config.screenshots','must be boolean');
 const out=localPath(input.out??'reports/ui-audit','config.out');
 return {schemaVersion:CONFIG_VERSION,baseUrl:base.href,routes,journeys,viewports,limits,waitMs,concurrency,screenshots:input.screenshots??true,out};
}

export function loadProjectConfig(path,{raw=false}={}){
 localPath(path,'--config');
 let fd,buffer;
 try{
  if(!lstatSync(path).isFile())fail('--config','must be a regular local JSON file, not a link, directory or pipe');
  // Non-blocking/no-follow where supported also guards a file-to-FIFO/symlink
  // swap between lstat and open; fstat validates the actual opened descriptor.
  fd=openSync(path,constants.O_RDONLY|(constants.O_NONBLOCK||0)|(constants.O_NOFOLLOW||0));const stat=fstatSync(fd);
  if(!stat.isFile()||stat.size>CONFIG_MAX_BYTES)fail('--config','must be a regular JSON file no larger than 1 MiB');
  buffer=Buffer.alloc(CONFIG_MAX_BYTES+1);let count=0,read;
  while(count<buffer.length&&(read=readSync(fd,buffer,count,buffer.length-count,null))>0)count+=read;
  if(count>CONFIG_MAX_BYTES)fail('--config','JSON file exceeds 1 MiB');
  buffer=buffer.subarray(0,count).toString('utf8');
 }catch(error){if(error instanceof ConfigError)throw error;fail('--config','cannot read local JSON file; check path and permissions');}
 finally{if(fd!==undefined)closeSync(fd);}
 let input;try{input=JSON.parse(buffer);}catch{fail('--config','invalid JSON; check JSON syntax (input contents withheld)');}
 const validated=validateProjectConfig(input);
 // CLI needs the already-validated relative declarations to apply a base URL
 // override before normalization. Default callers receive the private model.
 return raw?input:validated;
}
