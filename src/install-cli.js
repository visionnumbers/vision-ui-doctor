import {parseArgs} from 'node:util';
import {createInterface} from 'node:readline/promises';
import {stdin,stdout as terminalOut} from 'node:process';
import {resolve} from 'node:path';
import {AGENT_TARGETS,loadAdapter,destination} from './skill-adapters.js';
import {installSkills,installedStatus,uninstallSkills} from './skill-installer.js';
import {homedir} from 'node:os';

export const installerHelp=`Vision UI Doctor skill installer (local, no downloads)
  vision-ui-doctor install                              Interactive agent(s), scope and confirmation
  vision-ui-doctor install --agent codex --scope project --project-root PATH
  vision-ui-doctor install --agent codex,claude-code --scope user
  vision-ui-doctor install --list
  vision-ui-doctor install --status --scope project [--agent cursor]
  vision-ui-doctor uninstall --agent codex --scope project --project-root PATH
Options: --agent repeated or comma-separated; --scope project|user|global;
--project-root defaults to the calling directory; user scope uses the OS user home.
--runtime PATH binds an explicit existing public-cli.js; no scanner/Node/Chrome install.
--adapter FILE adds a declarative Agent Skills host with verified-by-you relative roots.
Existing/modified skill files are never overwritten. Uninstall removes only hash-verified owned files.
Filesystem tests do not certify live discovery in an installed agent version.
From a source checkout use node /absolute/path/src/cli.js install; no npx/registry fetch required.
`;
export async function runInstallerCli(argv,{stdout=console.log,stderr=console.error,ask,interactive=Boolean(stdin.isTTY&&terminalOut.isTTY),project=process.cwd(),home=homedir()}={}){
 let readline;
 try{
  const {values,positionals}=parseArgs({args:argv,strict:true,allowPositionals:true,options:{agent:{type:'string',multiple:true},scope:{type:'string'},'project-root':{type:'string'},runtime:{type:'string'},adapter:{type:'string'},list:{type:'boolean'},status:{type:'boolean'},help:{type:'boolean',short:'h'}}});
  if(values.help){stdout(installerHelp);return 0;}
  if(positionals.length!==1||!['install','uninstall'].includes(positionals[0]))throw Error('Use install or uninstall; see install --help.');
  const action=positionals[0],adapters=values.adapter?[...AGENT_TARGETS,await loadAdapter(resolve(values.adapter))]:AGENT_TARGETS;
  if(values.list&&values.status||action==='uninstall'&&(values.list||values.status)||values.runtime&&(values.list||values.status||action==='uninstall'))throw Error('Do not combine list/status/uninstall/runtime actions.');
  if(values.list){stdout(JSON.stringify(adapters.map(a=>({agent:a.id,name:a.name,project:a.project+'/vision-ui-doctor',user:'~/'+a.user+'/vision-ui-doctor',documentation:a.docs??'user-supplied adapter; host discovery unverified',verify:a.verify})),null,2));return 0;}
  let agents=values.agent?.flatMap(s=>s.split(',').map(x=>x.trim()).filter(Boolean)),scope=values.scope;
  const ctx={project:resolve(values['project-root']??project),home:resolve(home),adapters};
  if(values.status){stdout(JSON.stringify(await installedStatus({...ctx,agents,scope:scope??'project'}),null,2));return 0;}
  if(!agents?.length||!scope){
   if(!interactive&&!ask)throw Error('Non-interactive installation requires explicit --agent and --scope. Use install --list for targets.');
   if(!ask){readline=createInterface({input:stdin,output:terminalOut});ask=q=>readline.question(q);}
   stdout(adapters.map((a,i)=>`${i+1}. ${a.name} (${a.id})`).join('\n'));
   if(!agents?.length){const answer=await ask('Choose agent number(s) or IDs, separated by commas: ');agents=answer.split(',').map(x=>x.trim()).filter(Boolean).map(x=>/^\d+$/.test(x)?adapters[Number(x)-1]?.id:x);}
   if(!scope)scope=(await ask('Scope: project or user/global? [project] ')).trim()||'project';
   const normalized=scope==='global'?'user':scope;
   const targets=agents.map(id=>{const a=adapters.find(a=>a.id===id);if(!a)throw Error('Unsupported agent; use install --list.');return destination(a,normalized,ctx);});
   stdout([...new Set(targets)].join('\n'));
   if(!/^y(?:es)?$/i.test((await ask(`${action==='install'?'Install':'Uninstall'} owned Vision UI Doctor skill files at these locations? [y/N] `)).trim())){stdout('Cancelled; no installation files changed.');return 0;}
  }
  const result=action==='install'?await installSkills({...ctx,agents,scope,...(values.runtime?{runtime:resolve(values.runtime)}:{})}):await uninstallSkills({...ctx,agents,scope});
  stdout(JSON.stringify(result,null,2));return 0;
 }catch(e){stderr('Vision UI Doctor installer: '+(e.code?.startsWith('ERR_PARSE_ARGS')?'Invalid option syntax; use install --help.':e.message));return 1;}
 finally{readline?.close();}
}
