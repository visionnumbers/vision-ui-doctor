import {resolve,join,isAbsolute} from 'node:path';
import {readFile,lstat} from 'node:fs/promises';

const shared='.agents/skills';
export const AGENT_TARGETS=Object.freeze([
 {id:'codex',name:'OpenAI Codex',project:shared,user:shared,aliases:['.codex/skills'],docs:'https://learn.chatgpt.com/docs/build-skills',verify:'Open /skills or mention $vision-ui-doctor; restart if discovery has not refreshed.'},
 {id:'claude-code',name:'Anthropic Claude Code',project:'.claude/skills',user:'.claude/skills',aliases:[],docs:'https://code.claude.com/docs/en/skills',verify:'In a local Claude Code session, invoke /vision-ui-doctor.'},
 {id:'gemini-cli',name:'Google Gemini CLI',project:shared,user:shared,aliases:['.gemini/skills'],docs:'https://geminicli.com/docs/cli/using-agent-skills/',verify:'Run /skills reload then /skills list; activation still follows Gemini consent.'},
 {id:'antigravity',name:'Google Antigravity IDE',project:shared,user:'.gemini/config/skills',aliases:['.agent/skills'],userAliases:['.gemini/antigravity/skills'],docs:'https://antigravity.google/docs/skills?app=antigravity-ide',verify:'Open the agent side panel Customizations menu and find vision-ui-doctor.'},
 {id:'cursor',name:'Cursor',project:shared,user:shared,aliases:['.cursor/skills','.claude/skills','.codex/skills'],docs:'https://cursor.com/docs/skills',verify:'Open Customize > Skills; confirm vision-ui-doctor appears in Agent Decides.'}
]);
export const SKILL_NAME='vision-ui-doctor';
export const safeId=id=>typeof id==='string'&&/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)&&id.length<=64;
export function validateAdapter(value){
 if(!value||value.schemaVersion!==1||!safeId(value.id)||AGENT_TARGETS.some(a=>a.id===value.id)||Object.keys(value).some(k=>!['schemaVersion','id','name','project','user'].includes(k)))throw Error('Custom adapter requires schemaVersion1, a unique id, name and project/user relative skill roots.');
 for(const key of ['project','user'])if(typeof value[key]!=='string'||value[key].length>200||isAbsolute(value[key])||value[key].includes('\\')||value[key].split('/').some(p=>!p||p==='.'||p==='..'||p==='.git'||p.includes(':'))||!value[key].endsWith('/skills'))throw Error('Adapter roots must be relative forward-slash paths ending in /skills, without traversal or .git.');
 if(typeof value.name!=='string'||value.name.length>100||/[\r\n\0]/.test(value.name))throw Error('Adapter name must be a short single line.');
 return {...value,aliases:[],verify:'User-supplied adapter: verify discovery in that host; runtime compatibility has not been tested.'};
}
export async function loadAdapter(path){
 let value;try{const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.size>16384)throw Error();value=JSON.parse(await readFile(path,'utf8'));}catch{throw Error('Adapter must be a readable local regular JSON file <=16KiB; invalid contents withheld.');}
 return validateAdapter(value);
}
export function destination(adapter,scope,{project,home}){if(!['project','user'].includes(scope))throw Error('Scope must be project, user or global (alias for user).');return join(resolve(scope==='project'?project:home),...adapter[scope].split('/'),SKILL_NAME);}
export function visibleDestinations(adapter,{project,home}){
 const paths=[];
 for(const scope of ['project','user'])for(const root of [adapter[scope],...(scope==='user'&&adapter.userAliases?adapter.userAliases:adapter.aliases??[])])paths.push(join(resolve(scope==='project'?project:home),...root.split('/'),SKILL_NAME));
 return [...new Set(paths)];
}
