import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,cp,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runPublicCli} from '../src/public-cli.js';
import {spaIssues} from '../src/spa-workflow.js';

test('real UX: responsive/overlap/alignment/state defect, hidden exclusion, parent grouping, local images and fresh external fix',async t=>{
 const root=await mkdtemp(join(tmpdir(),'vud-ux-demo-'));t.after(()=>rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
 await cp(fileURLToPath(new URL('./fixtures/ux-project/',import.meta.url)),root,{recursive:true});
 const server=createServer(async(req,res)=>{
  const file=({'/':'index.html','/style.css':'style.css','/app.js':'app.js'})[req.url.split('?')[0]];
  if(!file){res.writeHead(404);res.end();return;}
  res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.setHeader('cache-control','no-store');res.end(await readFile(join(root,file)));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const config=JSON.parse(await readFile(new URL('../examples/public-ux.json',import.meta.url),'utf8'));config.url=`http://127.0.0.1:${server.address().port}/`;
 const configPath=join(root,'ux.json');await writeFile(configPath,JSON.stringify(config));
 const out=resolve('reports',`ux-demo-${Date.now()}-${process.pid}`),before=join(out,'before'),after=join(out,'after');
 const chromium=process.env.CHROMIUM_PATH||'chromium';
 const profiles=new Set((await readdir(tmpdir())).filter(n=>n.startsWith('vision-ui-doctor-'))),messages=[];
 const io={stdout:m=>messages.push(m),stderr:m=>messages.push(m)};
 assert.equal(await runPublicCli(['spa-audit','--config',configPath,'--out',before,'--chromium',chromium,'--screenshots'],io),2,messages.join('\n'));
 const run=JSON.parse(await readFile(join(before,'public-run.json'),'utf8')),packet=JSON.parse(await readFile(join(before,'agent-packet.json'),'utf8')),issues=spaIssues(run);
 const kinds=['RESPONSIVE_CONTAINER_FAILURE','VISIBLE_REGION_OVERLAP','DECLARED_ALIGNMENT_DEVIATION','EXPECTED_HIDDEN_FAILED'];
 for(const category of kinds){assert.ok(issues.some(i=>i.finding.category===category),category);assert.ok(packet.issues.some(i=>i.category===category),'default packet represents '+category);}
 assert.equal(run.states.length,6);assert.equal(packet.coverage.incomplete,1);
 assert.equal(issues.some(i=>/hidden-child|visibility-child|display-child|scroll-child/.test(i.finding.selector)),false,'paint-hidden chains and intentional scroll do not become child defects');
 assert.ok(run.states.every(s=>s.ux.hiddenOrMissing.includes('#hidden-child')));
 const rootGroup=run.rootCauseCandidates.find(g=>g.ancestor==='#layout'&&g.layout==='flex');assert.ok(rootGroup);assert.ok(rootGroup.issueIds.length>=4);
 assert.ok(issues.filter(i=>/^#child-/.test(i.finding.selector)).every(i=>rootGroup.issueIds.includes(i.finding.id)),'all child IDs retained in shared parent candidate');
 assert.equal(rootGroup.status,'candidate-not-proven');assert.ok(packet.rootCauseCandidates.some(g=>g.ancestor==='#layout'));
 assert.ok(packet.metrics.bytes<=16384);assert.equal(packet.metrics.bytes,Buffer.byteLength(JSON.stringify(packet)));
 const images=(await readdir(before)).filter(f=>f.endsWith('.png'));assert.equal(images.length,6);const png=await readFile(join(before,images[0]));assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 const ids=kinds.map(kind=>issues.find(i=>i.finding.category===kind).finding.id);
 const offline=[],jsonIO={stdout:m=>offline.push(JSON.parse(m)),stderr:m=>assert.fail(m)};
 assert.equal(await runPublicCli(['sources','--report',join(before,'public-run.json'),'--issue',ids[0],'--project-root',root],jsonIO),0);assert.ok(offline.at(-1).results[0].candidates.some(c=>c.path==='style.css'));
 assert.equal(await runPublicCli(['snippet','--report',join(before,'public-run.json'),'--issue',ids[0],'--project-root',root,'--file','style.css'],jsonIO),0);assert.match(offline.at(-1).snippets[0].text,/#content/);
 // Explicitly authorized EXTERNAL fix, only inside disposable fixture copy.
 await writeFile(join(root,'style.css'),(await readFile(join(root,'style.css'),'utf8')).replace('min-width: 900px','min-width: 0').replace('left: 70px','left: 150px').replace('margin-top: 16px','margin-top: 0'));
 await writeFile(join(root,'app.js'),(await readFile(join(root,'app.js'),'utf8')).replace('if(innerWidth>500)',''));
 const args=['spa-verify','--report',join(before,'public-run.json'),'--out',after,'--chromium',chromium,'--screenshots'];for(const id of ids)args.push('--issue',id);
 assert.equal(await runPublicCli(args,io),0,messages.join('\n'));
 const comparison=JSON.parse(await readFile(join(after,'comparison.json'),'utf8')),fresh=JSON.parse(await readFile(join(after,'public-run.json'),'utf8'));
 assert.ok(comparison.selected.every(i=>i.status==='resolved-for-this-check'));assert.equal(comparison.coverageIncomplete,0);assert.equal(spaIssues(fresh).length,0);assert.equal(comparison.browserCacheHits,0);
 assert.equal(comparison.visualEvidence.pixelDiffImplemented,false);assert.ok(comparison.visualEvidence.pairs.every(p=>p.before&&p.after));
 const newProfiles=(await readdir(tmpdir())).filter(n=>n.startsWith('vision-ui-doctor-')&&!profiles.has(n));assert.deepEqual(newProfiles,[]);
 t.diagnostic(JSON.stringify({evidence:out,browser:run.browserVersion,beforeIssues:issues.length,categories:[...new Set(issues.map(i=>i.finding.category))],rootCandidate:{ancestor:rootGroup.ancestor,issueCount:rootGroup.issueIds.length,confidence:rootGroup.confidence},packetBytes:packet.metrics.bytes,packetIssueIds:packet.issues.map(i=>({id:i.id,category:i.category,selector:i.selector})),screenshotsBefore:images.length,selected:comparison.selected,freshIssues:spaIssues(fresh).length,coverageIncomplete:comparison.coverageIncomplete,newProfiles:newProfiles.length}));
});
