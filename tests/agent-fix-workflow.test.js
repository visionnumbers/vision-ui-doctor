import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateSpaConfig,compareSpaRuns} from '../src/spa-workflow.js';
import {renderDeveloperReports} from '../src/developer-report.js';

const id='vud-0123456789abcdef';
function fixture(){
 const config=validateSpaConfig({schemaVersion:1,url:'http://localhost:4173/',viewports:['small','desktop'],scenarios:[{id:'menu',route:'/',steps:[{id:'open',click:'#open',purpose:'toggle',visible:['#panel']}]}]});
 const issue={id,category:'ELEMENT_OVERFLOW',selector:'#panel',assessment:'confirmed',confidence:'high',severity:'medium',evidence:{overflowPx:{right:40}}};
 const states=config.viewports.flatMap(viewport=>['initial','open'].map(step=>({scenario:'menu',step,viewport,status:'audited',url:config.url,issues:[],post:{elements:[{selector:'#panel',exists:true}]}})));
 states[1].issues=[issue];
 return {kind:'public-spa',schemaVersion:1,authAllowed:false,networkIsolation:'NONE',config,states};
}

test('canonical skill routes to approval/no-action policy before patching (instruction contract, not host enforcement)',async()=>{
 const skill=await readFile('skills/vision-ui-doctor/SKILL.md','utf8');
 const link=/\[fix-and-verify procedure\]\(([^)]+)\)/.exec(skill);assert.ok(link);
 assert.equal(link[1],'references/cli.md','Prompt diagnostics require a file-only resource link');
 const reference=await readFile(new URL('../skills/vision-ui-doctor/'+link[1],import.meta.url),'utf8');
 assert.match(reference,/## Agent-guided fix and verify/);
 assert.match(skill,/ONLY after explicit user authorization/);
 assert.match(reference,/Approval to audit is not approval to edit/);
 assert.match(reference,/No actionable defects -> STOP without application edits/);
 assert.match(reference,/Probable: reproduce and confirm/);
 assert.match(reference,/Needs-review: obtain the missing visual\/intent judgment/);
 assert.match(reference,/Unsupported: measurement\/coverage limitation, not a UI defect/);
});

test('zero actionable UI findings with failed/skipped states retains incomplete coverage in compact artifacts',()=>{
 const run=fixture();run.states.forEach(s=>s.issues=[]);
 run.states[1].status='failed';run.states[2].status='skipped';
 const result=renderDeveloperReports({run,cliPath:'D:/tool/src/public-cli.js'});
 assert.equal(result.status.totalIssues,0);assert.equal(result.status.coverage.audited,2);assert.equal(result.status.coverage.incomplete,2);assert.equal(result.status.outcome,2);
 assert.deepEqual(result.selectedIssueIds,[]);assert.match(result.agent,/Incomplete states: 2/);
});

test('fresh native comparison never resolves absence in skipped, failed, partial or missing-element states',()=>{
 const baseline=fixture();
 for(const mode of ['skipped','failed','partial','removed','drift']){
  const fresh=structuredClone(baseline);fresh.states[1].issues=[];
  if(mode==='partial')fresh.states[1].auditIncomplete=true;
  else if(mode==='removed')fresh.states[1].post.elements=[];
  else if(mode==='drift')fresh.detectorsVersion='different';
  else fresh.states[1].status=mode;
  assert.equal(compareSpaRuns(baseline,fresh,[id]).selected[0].status,'unknown',mode);
 }
});

test('fresh native comparison separates scoped resolution, persistent IDs, new sibling findings and global gaps',()=>{
 const baseline=fixture(),fresh=structuredClone(baseline);
 assert.equal(compareSpaRuns(baseline,fresh,[id]).selected[0].status,'persistent');
 fresh.states[1].issues=[];
 fresh.states[3].issues=[{...baseline.states[1].issues[0],id:'vud-abcdef0123456789'}];
 fresh.states[0].status='skipped';
 const result=compareSpaRuns(baseline,fresh,[id]);
 assert.equal(result.selected[0].status,'resolved-for-this-check');
 assert.equal(result.newIssues.length,1);assert.equal(result.newIssues[0].viewport,'desktop');assert.equal(result.coverageIncomplete,1);assert.equal(result.browserCacheHits,0);
});
