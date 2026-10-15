const ASSET_PATH=/\.(?:png|jpe?g|gif|svg|pdf|zip|css|js|mjs|woff2?|ttf|ico|mp4|webm|webp)$/i;
const TRACKING_KEYS=new Set(['gclid','dclid','fbclid','msclkid','mc_cid','mc_eid','_ga']);
const SENSITIVE_KEYS=new Set(['token','accesstoken','refreshtoken','idtoken','apikey','key','session','sessionid','sid','secret','clientsecret','password','passwd','authorization','auth','code','signature','sig','xamzsignature','xgoogsignature','nonce']);

function decodedKey(segment){
 const raw=segment.split('=',1)[0];
 try{return decodeURIComponent(raw.replaceAll('+',' '));}catch{return raw;}
}

function isTrackingKey(key){return /^utm_/i.test(key)||TRACKING_KEYS.has(key.toLowerCase());}
function isSensitiveKey(key){return SENSITIVE_KEYS.has(key.toLowerCase().replace(/[-_.]/g,''));}

function filterRawSearch(search,predicate){
 if(!search)return '';
 const kept=search.slice(1).split('&').filter(segment=>predicate(decodedKey(segment)));
 return kept.length?'?'+kept.join('&'):'';
}

function stripTrackingSearch(search){return filterRawSearch(search,key=>!isTrackingKey(key));}

function normalizeSpaHash(hash,{canonical=false}={}){
 if(!/^#(?:\/|!\/)/.test(hash))return '';
 const queryIndex=hash.indexOf('?');
 if(queryIndex<0)return hash;
 const path=hash.slice(0,queryIndex);
 const search=stripTrackingSearch(hash.slice(queryIndex));
 if(!canonical)return path+search;
 return path+canonicalSearch(search);
}

function withinBasePath(root,candidate){
 const basePath=root.pathname||'/';
 if(basePath==='/')return true;
 const prefix=basePath.endsWith('/')?basePath:basePath+'/';
 return candidate.pathname===basePath||candidate.pathname.startsWith(prefix);
}

function canonicalSearch(search){
 const params=new URLSearchParams(search);
 if([...params.keys()].some(isSensitiveKey))return search;
 params.sort();
 const normalized=params.toString();
 return normalized?'?'+normalized:'';
}

export function normalizeRouteUrl(base,candidate){
 let root,resolved;
 try{root=new URL(base);resolved=new URL(candidate,root);}catch{return null;}
 if(!['http:','https:'].includes(root.protocol)||!['http:','https:'].includes(resolved.protocol))return null;
 if(root.username||root.password||resolved.username||resolved.password)return null;
 if(resolved.origin!==root.origin||!withinBasePath(root,resolved)||ASSET_PATH.test(resolved.pathname))return null;

 const navigation=new URL(resolved.href);
 navigation.search=stripTrackingSearch(navigation.search);
 navigation.hash=normalizeSpaHash(navigation.hash);
 const identity=new URL(navigation.href);
 identity.search=canonicalSearch(identity.search);
 identity.hash=normalizeSpaHash(identity.hash,{canonical:true});
 const hashPath=identity.hash.split('?',1)[0];
 return {navigationUrl:navigation.href,identity:identity.href,pathKey:identity.origin+identity.pathname+hashPath};
}

export function routeFromUrl(value){
 const url=new URL(value);
 return url.pathname+url.search+url.hash;
}

function redactSearch(search){
 if(!search)return '';
 const params=new URLSearchParams(search);
 for(const key of new Set(params.keys()))if(isSensitiveKey(key))params.set(key,'[REDACTED]');
 const redacted=params.toString();
 return redacted?'?'+redacted:'';
}

function redactHash(hash){
 if(!hash)return '';
 const queryIndex=hash.indexOf('?');
 if(queryIndex<0)return hash;
 return hash.slice(0,queryIndex)+redactSearch(hash.slice(queryIndex));
}

export function redactSensitiveText(value){
 return String(value).replace(/([?&#](?:token|access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|key|session(?:id)?|sid|secret|client[_-]?secret|password|passwd|authorization|auth|code)=)[^&#\s)]*/gi,'$1[REDACTED]');
}

function sensitiveValues(value,base){
 let url;try{url=base?new URL(value,base):new URL(value);}catch{return [];}
 const values=[];
 for(const [key,item] of url.searchParams)if(isSensitiveKey(key)&&item)values.push(item);
 const queryIndex=url.hash.indexOf('?');
 if(queryIndex>=0)for(const [key,item] of new URLSearchParams(url.hash.slice(queryIndex+1)))if(isSensitiveKey(key)&&item)values.push(item);
 return values;
}

export function hasSensitiveUrlState(value,base){return sensitiveValues(value,base).length>0;}

export function redactWithUrlSecrets(value,...urls){
 let redacted=redactSensitiveText(value);
 for(const url of urls)for(const secret of sensitiveValues(url)){
  redacted=redacted.replaceAll(secret,'[REDACTED]').replaceAll(encodeURIComponent(secret),'%5BREDACTED%5D').replaceAll(encodeURIComponent(secret).replaceAll('%20','+'),'%5BREDACTED%5D');
 }
 return redacted;
}

export function redactUrl(value,base){
 try{
  const url=base?new URL(value,base):new URL(value);
  url.search=redactSearch(url.search);
  url.hash=redactHash(url.hash);
  return url.href;
 }catch{return redactSensitiveText(value);}
}

export function redactRoute(route,base){
 try{return routeFromUrl(redactUrl(route,base));}
 catch{return redactSensitiveText(route);}
}
