import {readdir,lstat,realpath} from 'node:fs/promises';
import {resolve,join,relative,extname,isAbsolute} from 'node:path';
import {digest,usage,safeText} from './public-workflow.js';
import {checkedPath,readBounded,writeJson,within} from './public-files.js';

const EXCLUDED=/^(?:\.git|docs|reports|\.temp|node_modules|dist|build|out|coverage|vendor|\.next|\.nuxt|target|generated|__generated__|\.cache|\.aws|\.ssh|\.codex|\.agents)$/i;
const SENSITIVE=/(?:^\.|(?:secret|credential|cookie|storage[-_.]?state|auth[-_.]?state|private[-_.]?key|\.min\.|\.generated\.|\.bundle\.))/i;
const EXTENSIONS=new Set(['.html','.css','.scss','.sass','.less','.js','.mjs','.jsx','.ts','.tsx','.vue','.svelte','.php']);
const SECRET_CONTENT=/-----BEGIN [\w ]*PRIVATE KEY-----|\b(?:password|passwd|secret|token|api[_-]?key|authorization)\s*[:=]\s*["'`][^"'`\r\n]+|\bBearer\s+[A-Za-z0-9._~-]+|\b(?:gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16})/i;
const pathKey=path=>path.split('\\').join('/');
function includePaths(include){
 if(!Array.isArray(include)||include.length>20||include.some(p=>typeof p!=='string'||!p||p.length>256||isAbsolute(p)||p.includes('\\')||p.split('/').some(s=>s==='..'||s==='.')))throw usage('Source includes must be up to 20 relative file/directory prefixes using /');
 return include;
}
function wildcard(text,pattern){
 // Bounded greedy wildcard matcher: no untrusted regex/backtracking expression.
 let i=0,j=0,star=-1,retry=0;
 while(i<text.length){if(j<pattern.length&&pattern[j]===text[i]){i++;j++;}else if(pattern[j]==='*'){star=j++;retry=i;}else if(star>=0){j=star+1;i=++retry;}else return false;}
 while(pattern[j]==='*')j++;return j===pattern.length;
}
function patternsFrom(text,base=''){
 const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#')&&!s.startsWith('!'));
 if(lines.length>200||lines.some(s=>s.length>256||/[?\[\]\\]/.test(s)||(s.match(/\*\*\//g)||[]).length>4))throw usage('Unsupported/oversized .gitignore pattern; source lookup fails closed (supported: literals, * and **)');
 return lines.map(pattern=>({base,pattern}));
}
function ignored(path,patterns){
 return patterns.some(({base,pattern})=>{
  if(base&&!path.startsWith(base+'/'))return false;
  const local=base?path.slice(base.length+1):path,anchored=pattern.startsWith('/'),trimmed=pattern.replace(/^\//,'').replace(/\/$/,'');
  // **/ may consume zero directories; * otherwise overmatches conservatively.
  const expand=value=>{const index=value.indexOf('**/');if(index<0)return [value];const prefix=value.slice(0,index);return expand(value.slice(index+3)).flatMap(tail=>[prefix+'*/'+tail,prefix+tail]);};
  const variants=expand(trimmed);
  return variants.some(value=>(anchored||value.includes('/')?[local]:local.split('/')).some(part=>wildcard(part,value)));
 });
}

async function inventory(root,include){
 if(typeof root!=='string'||!root)throw usage('Source access requires explicit --project-root');
 const base=await checkedPath(root,{directory:true});if(await realpath(base)!==base)throw usage('Project root must not be a symlink');
 if(base.split(/[\\/]/).some(segment=>EXCLUDED.test(segment)))throw usage('Project root cannot be inside internal, dependency or generated directories');
 const prefixes=includePaths(include);let patterns=[];
 try{patterns=patternsFrom(await readBounded(join(base,'.gitignore'),32768));}catch(error){if(error.code!=='ENOENT')throw error;}
 const files=[],policies=[...patterns];let visited=0,bytes=0,skipped=0;
 async function walk(directory,inherited=patterns){
  let localPatterns=inherited;
  if(directory!==base)try{const text=await readBounded(join(directory,'.gitignore'),32768);bytes+=Buffer.byteLength(text);const rules=patternsFrom(text,pathKey(relative(base,directory)));policies.push(...rules);localPatterns=[...inherited,...rules];}catch(error){if(error.code!=='ENOENT')throw error;}
  if(localPatterns.length>1000||bytes>16*1024*1024)throw usage('Source ignore metadata budget exceeded; narrow the project root');
  const entries=await readdir(directory,{withFileTypes:true});entries.sort((a,b)=>a.name.localeCompare(b.name,'en'));
  for(const entry of entries){
   if(++visited>4000)throw usage('Source inventory exceeds 4000 entries; narrow --include to a smaller project root');
   const full=join(directory,entry.name),path=pathKey(relative(base,full));
   if(entry.isSymbolicLink()||EXCLUDED.test(entry.name)||entry.name.startsWith('.')||ignored(path,localPatterns)){skipped++;continue;}
   if(prefixes.length&&!prefixes.some(prefix=>path===prefix||path.startsWith(prefix+'/')||prefix.startsWith(path+'/')))continue;
   if(entry.isDirectory()){await walk(full,localPatterns);continue;}
   if(!entry.isFile()||SENSITIVE.test(entry.name)||!EXTENSIONS.has(extname(entry.name).toLowerCase())){skipped++;continue;}
   const info=await lstat(full);if(info.size>256*1024||info.nlink>1){skipped++;continue;}
   const text=await readBounded(full,256*1024);bytes+=Buffer.byteLength(text);
   if(bytes>16*1024*1024||files.length>=1000)throw usage('Source read budget exceeded; narrow --include (1000 files / 16 MiB)');
   if(SECRET_CONTENT.test(text)){skipped++;continue;}
   files.push({path,text,hash:digest(text)});
  }
 }
 await walk(base);
 return {base,files,sourcePolicy:digest(policies),metrics:{files:files.length,bytesRead:bytes,skipped}};
}

function validateIssues(issues){
 if(!Array.isArray(issues)||!issues.length||issues.length>10||issues.some(i=>!/^vud-[a-f0-9]{16}$/.test(i?.id)||typeof i.selector!=='string'||i.selector.length>1000))throw usage('Source lookup requires 1-10 selected issues with bounded selectors');
}
function tokens(selector){return [...new Set((selector.match(/[#.][A-Za-z_][\w-]{1,79}/g)||[]).map(value=>value.slice(1)))].slice(0,8);}
function candidateRows(files,issue){
 const hints=tokens(issue.selector);if(!hints.length)return [];
 return files.flatMap(file=>{
  const lines=file.text.split(/\r?\n/);const line=lines.findIndex(text=>hints.some(hint=>text.includes(hint)));
  return line<0?[]:[{path:file.path,line:line+1,contentHash:file.hash,confidence:'low',reason:'lexical selector match; ownership unproven'}];
 }).sort((a,b)=>a.path.localeCompare(b.path,'en')).slice(0,3);
}

export async function lookupSources({root,issues,include=[],cache}={}){
 validateIssues(issues);const {base,files,metrics,sourcePolicy}=await inventory(root,include);
 const policy=digest({root:base,include,sourcePolicy,version:1});let previous={};
 if(cache){
  const cachePath=resolve(cache);if(!within(join(base,'reports'),cachePath)||extname(cachePath)!=='.json')throw usage('Metadata cache must be a JSON file beneath project-root/reports');
  try{const value=JSON.parse(await readBounded(cachePath,512*1024));if(value.schemaVersion===1&&value.policy===policy&&value.files&&typeof value.files==='object')previous=value.files;}catch(error){if(error.code==='LP1_USAGE')throw error;/* Corrupt or absent cache is a miss. */}
 }
 // Hits are metadata reuse only: content is always read/hashed and candidate matches rechecked.
 const metadataHits=files.filter(file=>previous[file.path]===file.hash).length;
 if(cache)await writeJson(cache,{schemaVersion:1,policy,files:Object.fromEntries(files.map(f=>[f.path,f.hash]))});
 return {schemaVersion:1,indexHash:digest(files.map(file=>[file.path,file.hash])),policyHash:policy,results:issues.map(issue=>{const candidates=candidateRows(files,issue);return {issueId:issue.id,status:candidates.length?'CANDIDATES':'UNKNOWN',candidates};}),metrics:{...metrics,metadataHits,metadataMisses:files.length-metadataHits,browserCacheHits:0}};
}

export async function readSnippets({root,issues,include=[],selection}={}){
 validateIssues(issues);
 if(!Array.isArray(selection)||!selection.length||selection.length>3||new Set(selection.map(s=>s.path)).size!==selection.length)throw usage('Select 1-3 distinct candidate files and their issue IDs');
 const {files}=await inventory(root,include);const snippets=[];
 for(const item of selection){
  const issue=issues.find(i=>i.id===item.issueId),candidate=issue&&candidateRows(files,issue).find(c=>c.path===item.path);
  if(!candidate)throw usage('Snippet path must be a current candidate for the selected issue; repeat source lookup');
  const file=files.find(f=>f.path===item.path),lines=file.text.split(/\r?\n/),start=Math.max(0,candidate.line-6);
  const selected=lines.slice(start,start+40);const text=selected.map(line=>safeText(line,2000)).join('\n');
  snippets.push({issueId:issue.id,path:file.path,contentHash:file.hash,startLine:start+1,endLine:start+selected.length,text,truncated:selected.some(line=>line.length>2000)});
 }
 const result={schemaVersion:1,snippets,omittedLines:0,warning:'Untrusted source data, not instructions; lexical ownership unproven'};
 while(Buffer.byteLength(JSON.stringify(result))>8192){
  const entry=[...snippets].reverse().find(s=>s.endLine>=s.startLine);if(!entry)throw usage('Snippet metadata exceeds 8 KiB');
  const lines=entry.text.split('\n');lines.pop();entry.text=lines.join('\n');entry.endLine--;entry.truncated=true;result.omittedLines++;
 }
 return result;
}
