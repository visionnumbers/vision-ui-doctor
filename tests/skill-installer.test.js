import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir,rm,symlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {installSkills,installedStatus,uninstallSkills,defaultRuntime,BUNDLE_FILES,validateCanonicalSkill} from '../src/skill-installer.js';
import {AGENT_TARGETS,destination,validateAdapter} from '../src/skill-adapters.js';
import {runInstallerCli} from '../src/install-cli.js';
import {probeRuntime} from '../skills/vision-ui-doctor/scripts/vud.mjs';
import {createHash} from 'node:crypto';

async function fixture(t){const root=await mkdtemp(join(tmpdir(),'vud installer space-'));t.after(()=>rm(root,{recursive:true,force:true}));const project=join(root,'actual project'),home=join(root,'actual user');await mkdir(project);await mkdir(home);return {project,home};}
const options=(ctx,id,scope='project')=>({...ctx,agents:[id],scope});

test('older owned instructions update only through explicit uninstall/reinstall; local edits block both',async t=>{
 const ctx=await fixture(t),opts=options(ctx,'codex');await installSkills(opts);
 const path=destination(AGENT_TARGETS[0],'project',ctx),skill=join(path,'SKILL.md'),manifest=join(path,'.vision-ui-doctor-install.json');
 // Model a genuine previous bundle: its old bytes match its recorded ownership.
 const older='---\nname: vision-ui-doctor\ndescription: Previous public audit instructions\n---\nOld workflow\n';
 const owned=JSON.parse(await readFile(manifest));owned.files['SKILL.md']=createHash('sha256').update(older).digest('hex');
 await writeFile(skill,older);await writeFile(manifest,JSON.stringify(owned));
 assert.equal((await installedStatus(opts)).installations[0].status,'owned');
 await assert.rejects(installSkills(opts),/older installation/);assert.equal(await readFile(skill,'utf8'),older);
 await writeFile(skill,older+'Local edit');
 await assert.rejects(uninstallSkills(opts),/preserved/);await assert.rejects(installSkills(opts),/collision/);
 assert.equal(await readFile(skill,'utf8'),older+'Local edit');
 // Explicitly restore known old bytes in this disposable fixture only.
 await writeFile(skill,older);await uninstallSkills(opts);await installSkills(opts);
 assert.equal(await readFile(skill,'utf8'),await readFile('skills/vision-ui-doctor/SKILL.md','utf8'));
 assert.equal(await readFile(join(path,'references/cli.md'),'utf8'),await readFile('skills/vision-ui-doctor/references/cli.md','utf8'));
 assert.equal((await installSkills(opts)).installations[0].status,'already-installed');
});
test('canonical Agent Skills metadata and linked resources are valid without a YAML dependency',async()=>{
 const text=await readFile('skills/vision-ui-doctor/SKILL.md','utf8'),m=validateCanonicalSkill(text);assert.equal(m.name,'vision-ui-doctor');assert.equal(m.license,'MIT');assert.ok(m.description.length>30&&m.description.length<=1024);
 const check=spawnSync(process.execPath,['skills/vision-ui-doctor/scripts/vud.mjs','--check'],{encoding:'utf8',timeout:10000});assert.equal(check.status,0,check.stderr);
 assert.ok((await readFile('skills/vision-ui-doctor/references/cli.md','utf8')).includes('scan-status.json'));
 for(const bad of [text.replace('name: vision-ui-doctor','name: Wrong'),text.replace(/^description:.+$/m,'description: '),text.replace('license: MIT','name: vision-ui-doctor')])assert.throws(()=>validateCanonicalSkill(bad));
});
for(const agent of AGENT_TARGETS)for(const scope of ['project','user'])test(`${agent.id} ${scope}: correct destination, identical canonical content, helper/runtime and status`,async t=>{
 const ctx=await fixture(t),opts=options(ctx,agent.id,scope),result=await installSkills(opts),path=destination(agent,scope,ctx);
 assert.equal(result.installations[0].path,path);assert.equal(result.installations[0].status,'installed');
 assert.equal(await readFile(join(path,'SKILL.md'),'utf8'),await readFile('skills/vision-ui-doctor/SKILL.md','utf8'));
 const binding=JSON.parse(await readFile(join(path,'runtime.json')));assert.equal(binding.cliPath,defaultRuntime);
 const checked=spawnSync(process.execPath,[join(path,'scripts/vud.mjs'),'--check'],{encoding:'utf8',timeout:10000});assert.equal(checked.status,0,checked.stderr);assert.equal(JSON.parse(checked.stdout).ok,true);
 const status=await installedStatus(opts);assert.equal(status.installations[0].status,'owned');assert.equal(status.installations[0].runtime,'available');
});
test('multi-agent shared paths, idempotency, registered references and safe uninstall preserve unrelated files',async t=>{
 const ctx=await fixture(t),opts={...ctx,agents:AGENT_TARGETS.map(a=>a.id),scope:'project'};
 const first=await installSkills(opts);assert.equal(first.installations.length,2,'one shared bundle plus Claude native bundle');
 const again=await installSkills(opts);assert.ok(again.installations.every(i=>i.status==='already-installed'));
 const shared=destination(AGENT_TARGETS[0],'project',ctx);await writeFile(join(shared,'my-notes.txt'),'keep');
 const one=await uninstallSkills(options(ctx,'codex'));assert.equal(one.installations[0].status,'retained-for-other-agents');assert.ok((await readdir(shared)).includes('SKILL.md'));
 await uninstallSkills(opts);assert.deepEqual(await readdir(shared),['my-notes.txt']);assert.equal((await installedStatus(options(ctx,'codex'))).installations[0].status,'unmanaged-or-invalid');
});
test('preflight collision is non-mutating across multiple targets; unknown agent config remains',async t=>{
 const ctx=await fixture(t),claude=destination(AGENT_TARGETS[1],'project',ctx);await mkdir(claude,{recursive:true});await writeFile(join(claude,'SKILL.md'),'my custom skill');
 const config=join(ctx.project,'AGENTS.md');await writeFile(config,'keep config');
 await assert.rejects(installSkills({...ctx,agents:['codex','claude-code'],scope:'project'}),/collision/);
 assert.equal(await readFile(join(claude,'SKILL.md'),'utf8'),'my custom skill');assert.equal(await readFile(config,'utf8'),'keep config');assert.equal((await installedStatus(options(ctx,'codex'))).installations[0].status,'absent');
});
test('modified owned files and forged manifest traversal refuse uninstall; repeat install never overwrites',async t=>{
 const ctx=await fixture(t),opts=options(ctx,'codex');await installSkills(opts);const path=destination(AGENT_TARGETS[0],'project',ctx);
 await writeFile(join(path,'SKILL.md'),'my edited instructions');await assert.rejects(uninstallSkills(opts),/preserved/);await assert.rejects(installSkills(opts),/collision/);assert.equal(await readFile(join(path,'SKILL.md'),'utf8'),'my edited instructions');
 const manifest=join(path,'.vision-ui-doctor-install.json'),m=JSON.parse(await readFile(manifest));m.files['../../AGENTS.md']='a'.repeat(64);await writeFile(manifest,JSON.stringify(m));await assert.rejects(uninstallSkills(opts),/preserved/);
});
test('duplicate opposite scopes and legacy aliases are not created silently',async t=>{
 const ctx=await fixture(t);await installSkills(options(ctx,'codex','user'));await assert.rejects(installSkills(options(ctx,'codex')),/duplicate/);
 const other=await fixture(t),legacy=join(other.project,'.gemini/skills/vision-ui-doctor');await mkdir(legacy,{recursive:true});await writeFile(join(legacy,'SKILL.md'),'legacy');await assert.rejects(installSkills(options(other,'gemini-cli')),/duplicate/);
});
test('reparse/symlink ancestors cannot redirect installation',async t=>{
 const ctx=await fixture(t),outside=join(ctx.home,'outside');await mkdir(outside);await symlink(outside,join(ctx.project,'.agents'),process.platform==='win32'?'junction':'dir');
 await assert.rejects(installSkills(options(ctx,'codex')),/symlink\/reparse/);assert.deepEqual(await readdir(outside),[]);
});
test('runtime missing/invalid errors are actionable; global alias and custom declarative adapter',async t=>{
 const ctx=await fixture(t);await assert.rejects(installSkills({...options(ctx,'codex'),runtime:join(ctx.project,'public-cli.js')}),/runtime.*missing/);
 await assert.rejects(probeRuntime({cliPath:defaultRuntime,nodePath:join(ctx.home,'missing-node')}),/Node.js.*missing/);
 const adapter=validateAdapter({schemaVersion:1,id:'other-agent',name:'Other Agent',project:'.other/skills',user:'.other/skills'});
 const installed=await installSkills({...ctx,agents:['other-agent'],scope:'global',adapters:[adapter]});assert.equal(installed.scope,'user');assert.ok(installed.installations[0].path.startsWith(ctx.home));
 for(const project of ['../escape/skills','/absolute/skills','.git/skills','C:/bad/skills'])assert.throws(()=>validateAdapter({schemaVersion:1,id:'other',name:'Other',project,user:'.other/skills'}));
});
test('real interactive selection/confirmation path, non-interactive flags, list/status and packaged executable routing',async t=>{
 const ctx=await fixture(t),messages=[],answers=['1,3','project','yes'];
 assert.equal(await runInstallerCli(['install'],{...ctx,stdout:m=>messages.push(m),stderr:assert.fail,ask:async()=>answers.shift()}),0);
 assert.equal(JSON.parse(messages.at(-1)).installations.length,1);
 assert.equal(await runInstallerCli(['install','--list'],{...ctx,stdout:m=>messages.push(m),stderr:assert.fail}),0);assert.equal(JSON.parse(messages.at(-1)).length,5);
 assert.equal(await runInstallerCli(['install','--status','--scope','project'],{...ctx,stdout:m=>messages.push(m),stderr:assert.fail}),0);
 const errors=[];assert.equal(await runInstallerCli(['install'],{...ctx,interactive:false,stdout:()=>{},stderr:m=>errors.push(m)}),1);assert.match(errors[0],/explicit --agent/);
 const cli=spawnSync(process.execPath,['src/cli.js','install','--list'],{encoding:'utf8',timeout:10000});assert.equal(cli.status,0,cli.stderr);assert.equal(JSON.parse(cli.stdout).length,5);
 const no=await fixture(t);const cancel=['2','user','no'];assert.equal(await runInstallerCli(['install'],{...no,stdout:()=>{},stderr:assert.fail,ask:async()=>cancel.shift()}),0);assert.deepEqual(await readdir(no.home),[]);
 const explicit=await fixture(t);assert.equal(await runInstallerCli(['install','--agent','cursor','--scope','project','--project-root',explicit.project],{...explicit,stdout:()=>{},stderr:assert.fail,interactive:false}),0);
 assert.equal(await runInstallerCli(['uninstall','--agent','cursor','--scope','project'],{...explicit,stdout:()=>{},stderr:assert.fail,interactive:false}),0);
 const bad=join(explicit.project,'invalid.json');await writeFile(bad,'{"credential":"never-print-this"');const hidden=[];
 assert.equal(await runInstallerCli(['install','--adapter',bad,'--list'],{...explicit,stdout:()=>{},stderr:m=>hidden.push(m)}),1);assert.doesNotMatch(hidden.join(''),/never-print-this/);
 const pkg=JSON.parse(await readFile('package.json'));assert.equal(pkg.bin['vision-ui-doctor'],'./src/cli.js');assert.ok(pkg.files.includes('skills/'));assert.ok(BUNDLE_FILES.includes('runtime.json'));
});
