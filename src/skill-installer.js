import {createHash,randomUUID} from 'node:crypto';
import {lstat,readFile,mkdir,open,rename,unlink,rmdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,parse,join,dirname} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {AGENT_TARGETS,SKILL_NAME,destination,visibleDestinations,safeId} from './skill-adapters.js';
import {probeRuntime} from '../skills/vision-ui-doctor/scripts/vud.mjs';

const OWNER='vision-ui-doctor',MANIFEST='.vision-ui-doctor-install.json';
export const BUNDLE_FILES=['SKILL.md','references/cli.md','scripts/vud.mjs','runtime.json'];
const digest=data=>createHash('sha256').update(data).digest('hex');
const canonical=new URL('../skills/vision-ui-doctor/',import.meta.url);
export function validateCanonicalSkill(text){
 const block=/^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);if(!block)throw Error('Canonical SKILL.md needs YAML frontmatter.');
 const fields={};for(const line of block[1].split(/\r?\n/)){const pair=/^(name|description|license): ([^\r\n]+)$/.exec(line);if(!pair||Object.hasOwn(fields,pair[1]))throw Error('Use unique plain name/description/license fields in canonical skill metadata.');fields[pair[1]]=pair[2];}
 if(fields.name!==SKILL_NAME||!fields.description||fields.description.length>1024||/[<>]/.test(fields.description)||!text.slice(block[0].length).trim())throw Error('Canonical skill name, description or body is invalid.');return fields;
}
export const defaultRuntime=fileURLToPath(new URL('./public-cli.js',import.meta.url));
const context=ctx=>({project:resolve(ctx?.project??process.cwd()),home:resolve(ctx?.home??homedir())});
async function guard(path,missing=false){
 const absolute=resolve(path),root=parse(absolute).root;let cursor=root;
 for(const part of absolute.slice(root.length).split(/[\\/]/).filter(Boolean)){
  cursor=join(cursor,part);let info;try{info=await lstat(cursor);}catch(e){if(missing&&e.code==='ENOENT')return false;throw e;}
  if(info.isSymbolicLink()||!info.isDirectory())throw Error('Refusing a symlink/reparse or non-directory skill path.');
 }return true;
}
async function regular(path,max=128*1024){
 await guard(dirname(path));const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.nlink>1||info.size>max)throw Error('Skill files must be bounded, uniquely linked regular files.');return readFile(path);
}
async function createDirs(path){const absolute=resolve(path),root=parse(absolute).root;let cursor=root;for(const part of absolute.slice(root.length).split(/[\\/]/).filter(Boolean)){cursor=join(cursor,part);try{await mkdir(cursor);}catch(e){if(e.code!=='EEXIST')throw e;}await guard(cursor);}}
async function exclusive(path,data){await guard(dirname(path));const handle=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);try{await handle.writeFile(data);}finally{await handle.close();}}
function validManifest(m){return m&&m.schemaVersion===1&&m.owner===OWNER&&Object.keys(m).every(k=>['schemaVersion','owner','agents','files'].includes(k))&&Array.isArray(m.agents)&&m.agents.length>0&&m.agents.every(safeId)&&new Set(m.agents).size===m.agents.length&&m.files&&Object.keys(m.files).length===BUNDLE_FILES.length&&BUNDLE_FILES.every(f=>/^[a-f0-9]{64}$/.test(m.files[f]));}
async function inspect(path){
 if(!await guard(path,true))return {state:'absent',path};
 let manifest;try{manifest=JSON.parse((await regular(join(path,MANIFEST),16384)).toString('utf8'));}catch(e){return {state:'unmanaged-or-invalid',path};}
 if(!validManifest(manifest))return {state:'unmanaged-or-invalid',path};
 for(const file of BUNDLE_FILES)try{if(digest(await regular(join(path,file)))!==manifest.files[file])return {state:'modified',path};}catch{return {state:'modified',path};}
 return {state:'owned',path,manifest};
}
async function metadata(path,value){
 await guard(path);const temp=join(path,'.vud-manifest-'+randomUUID());
 await exclusive(temp,JSON.stringify(value,null,2)+'\n');
 try{await rename(temp,join(path,MANIFEST));}catch(e){await unlink(temp);throw e;}
}
function choose(ids,adapters){if(!Array.isArray(ids)||!ids.length)throw Error('Select at least one --agent.');return [...new Set(ids)].map(id=>{const agent=adapters.find(a=>a.id===id);if(!agent)throw Error('Unsupported agent; use install --list.');return agent;});}
function normalizeScope(scope){if(scope==='global')return 'user';if(!['project','user'].includes(scope))throw Error('Choose explicit --scope project or user (global is an alias).');return scope;}
function plans(agents,scope,ctx){const groups=new Map();for(const agent of agents){const path=destination(agent,scope,ctx);if(!groups.has(path))groups.set(path,{path,agents:[]});groups.get(path).agents.push(agent.id);}return [...groups.values()];}
async function bundle(runtime){
 const files={};for(const name of BUNDLE_FILES.filter(f=>f!=='runtime.json'))files[name]=await readFile(new URL(name,canonical));
 validateCanonicalSkill(files['SKILL.md'].toString());
 files['runtime.json']=Buffer.from(JSON.stringify({schemaVersion:1,cliPath:runtime.cliPath,nodePath:runtime.nodePath},null,2)+'\n');return files;
}
async function removeEmpty(path){for(const p of [join(path,'scripts'),join(path,'references'),path])try{await rmdir(p);}catch(e){if(!['ENOENT','ENOTEMPTY','EEXIST'].includes(e.code))throw e;}}

export async function installSkills({agents,scope,project,home,runtime=defaultRuntime,nodePath=process.execPath,adapters=AGENT_TARGETS}={}){
 scope=normalizeScope(scope);const ctx=context({project,home}),selected=choose(agents,adapters),plan=plans(selected,scope,ctx);
 await guard(ctx.project);await guard(ctx.home);
 const resolvedRuntime=await probeRuntime({cliPath:resolve(runtime),nodePath}),files=await bundle(resolvedRuntime),hashes=Object.fromEntries(Object.entries(files).map(([f,data])=>[f,digest(data)]));
 const existing=new Map();for(const p of plan){const state=await inspect(p.path);existing.set(p.path,state);
  if(state.state!=='absent'&&(state.state!=='owned'||BUNDLE_FILES.some(f=>state.manifest.files[f]!==hashes[f])))throw Error('Existing skill collision or modified/older installation; nothing overwritten. Preserve it, then uninstall the owned copy or choose another scope.');
 }
 // Reject conflicting aliases/opposite scopes. Planned host-specific copies have
 // exactly the same content/runtime and are intentional, not divergent skills.
 for(const agent of selected)for(const path of visibleDestinations(agent,ctx))if(!existing.has(path)&&await guard(path,true))throw Error('A same-name skill already exists in another visible scope/alias. Resolve that duplicate explicitly before installing.');
 const results=[];
 for(const p of plan){const previous=existing.get(p.path),ids=[...new Set([...(previous.manifest?.agents??[]),...p.agents])].sort(),manifest={schemaVersion:1,owner:OWNER,agents:ids,files:hashes};
  if(previous.state==='owned'){
   if(JSON.stringify(previous.manifest.agents)!==JSON.stringify(ids))await metadata(p.path,manifest);
   results.push({path:p.path,agents:p.agents,status:'already-installed'});continue;
  }
  await createDirs(dirname(p.path));await mkdir(p.path);const created=[];
  try{for(const [name,data] of Object.entries(files)){await createDirs(dirname(join(p.path,name)));await exclusive(join(p.path,name),data);created.push(name);}await exclusive(join(p.path,MANIFEST),JSON.stringify(manifest,null,2)+'\n');}
  catch(e){for(const name of created.reverse())await unlink(join(p.path,name));await removeEmpty(p.path);throw e;}
  results.push({path:p.path,agents:p.agents,status:'installed'});
 }
 return {scope,runtime:resolvedRuntime,installations:results,notes:['Only skill instructions/helper/runtime binding installed; Node/Chrome/scanner are not copied or installed.','Documented shared .agents locations are deduplicated. Mixed Claude + shared installs may also both be discovered by Cursor; their skill content/runtime is identical.','Discovery is host/version/policy dependent; filesystem installation is not live-agent activation proof.'],verify:selected.map(a=>({agent:a.id,instruction:a.verify}))};
}
export async function installedStatus({agents,scope='project',project,home,adapters=AGENT_TARGETS}={}){
 scope=normalizeScope(scope);const ctx=context({project,home}),selected=choose(agents??adapters.map(a=>a.id),adapters),out=[];
 for(const a of selected){const path=destination(a,scope,ctx);let info;try{info=await inspect(path);}catch{info={state:'unsafe-path',path};}
  let runtime='not-checked';if(info.state==='owned')try{await probeRuntime(JSON.parse((await regular(join(path,'runtime.json'))).toString()));runtime='available';}catch{runtime='missing-or-incompatible';}
  out.push({agent:a.id,path,status:info.state,registered:info.manifest?.agents.includes(a.id)??false,runtime,verify:a.verify});
 }return {scope,installations:out,discovery:'Filesystem status only; verify in each actual agent.'};
}
export async function uninstallSkills({agents,scope,project,home,adapters=AGENT_TARGETS}={}){
 scope=normalizeScope(scope);const ctx=context({project,home}),selected=choose(agents,adapters),plan=plans(selected,scope,ctx),states=[];
 for(const p of plan){const info=await inspect(p.path);if(!['absent','owned'].includes(info.state))throw Error('Refusing uninstall: unmanaged or modified skill files are preserved.');states.push({...p,...info});}
 const results=[];for(const p of states){if(p.state==='absent'){results.push({path:p.path,status:'absent'});continue;}
  const remaining=p.manifest.agents.filter(a=>!p.agents.includes(a));
  if(remaining.length){await metadata(p.path,{...p.manifest,agents:remaining});results.push({path:p.path,status:'retained-for-other-agents',remaining});continue;}
  // Fixed allowlist + verified hashes; no recursive deletion or agent config edits.
  for(const file of BUNDLE_FILES){if(digest(await regular(join(p.path,file)))!==p.manifest.files[file])throw Error('Skill changed during uninstall; modified files preserved.');}
  for(const file of BUNDLE_FILES)await unlink(join(p.path,file));await unlink(join(p.path,MANIFEST));await removeEmpty(p.path);results.push({path:p.path,status:'uninstalled',preserved:'Any unrelated files/directories remain.'});
 }return {scope,installations:results};
}
