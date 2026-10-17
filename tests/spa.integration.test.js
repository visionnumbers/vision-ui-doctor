import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,cp,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runPublicCli} from '../src/public-cli.js';
import {spaIssues,spaPacket} from '../src/spa-workflow.js';

test('real SPA: sidebar/hash/tabs -> mobile defects -> agent/source -> external fix -> fresh replay',async t=>{
 const root=await mkdtemp(join(tmpdir(),'vud-spa-demo-'));t.after(()=>rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
 await cp(fileURLToPath(new URL('./fixtures/spa-project/',import.meta.url)),root,{recursive:true});
 const server=createServer(async(req,res)=>{
  const file=({'/':'index.html','/style.css':'style.css','/app.js':'app.js'})[req.url.split('?')[0]];
  if(!file){res.writeHead(404);res.end();return;}
  res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.setHeader('cache-control','no-store');res.end(await readFile(join(root,file)));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const config=JSON.parse(await readFile(new URL('../examples/public-spa.json',import.meta.url),'utf8'));config.url=`http://127.0.0.1:${server.address().port}/`;
 const configPath=join(root,'spa.json');await writeFile(configPath,JSON.stringify(config));
 const out=resolve('reports',`spa-demo-${Date.now()}-${process.pid}`),before=join(out,'before'),after=join(out,'after');
 const chromium=process.env.CHROMIUM_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';
 const profiles=new Set((await readdir(tmpdir())).filter(n=>n.startsWith('vision-ui-doctor-'))),messages=[];
 const io={stdout:m=>messages.push(m),stderr:m=>messages.push(m)};
 assert.equal(await runPublicCli(['spa-audit','--config',configPath,'--out',before,'--chromium',chromium],io),2,messages.join('\n'));
 const run=JSON.parse(await readFile(join(before,'public-run.json'),'utf8')),packet=spaPacket(run),find=(scenario,step,viewport)=>run.states.find(s=>s.scenario===scenario&&s.step===step&&s.viewport===viewport);
 assert.equal(run.states.length,20);assert.equal(find('sidebar','close','desktop').status,'audited');
 assert.equal(find('sidebar','open','small').post.elements.find(e=>e.selector==='#sidebar').visible,true);
 assert.equal(find('sidebar','close','small').status,'failed');
 assert.ok(find('sidebar','close','small').issues.some(f=>f.category==='CONTROL_OCCLUDED'&&f.selector==='#close-menu'));
 assert.match(find('navigation','dashboard','small').post.url,/#\/dashboard$/);assert.match(find('navigation','home','small').post.url,/#\/home$/);
 assert.equal(find('tabs','details','small').status,'audited');assert.equal(find('tabs','summary','small').status,'audited');
 const overflow=find('navigation','dashboard','small').issues.find(f=>f.category==='ELEMENT_OVERFLOW'&&f.selector==='#wide-panel');assert.ok(overflow);
 assert.equal(find('navigation','open','small').issues.some(f=>f.selector==='#wide-panel'),false,'hidden route not prematurely audited');
 const blocked=find('sidebar','close','small').issues.find(f=>f.category==='CONTROL_OCCLUDED');
 assert.ok(packet.metrics.bytes<=16384);assert.equal(packet.metrics.bytes,Buffer.byteLength(JSON.stringify(packet)));assert.equal(packet.coverage.incomplete,1);
 assert.ok(packet.groups.some(g=>g.occurrencesInSelection>1),'duplicate geometry grouped across replayed states');
 const ids=[blocked.id,overflow.id],offline=[],jsonIO={stdout:m=>offline.push(JSON.parse(m)),stderr:m=>assert.fail(m)};
 assert.equal(await runPublicCli(['packet','--report',join(before,'public-run.json'),'--issue',blocked.id],jsonIO),0);assert.equal(offline.at(-1).issues[0].step,'close');
 for(const id of ids){assert.equal(await runPublicCli(['sources','--report',join(before,'public-run.json'),'--issue',id,'--project-root',root],jsonIO),0);assert.ok(offline.at(-1).results[0].candidates.some(c=>c.path==='style.css'));}
 assert.equal(await runPublicCli(['snippet','--report',join(before,'public-run.json'),'--issue',overflow.id,'--project-root',root,'--file','style.css'],jsonIO),0);assert.match(offline.at(-1).snippets[0].text,/#wide-panel/);
 // External authorized patch of ONLY the disposable fixture, not automatic engine repair.
 await writeFile(join(root,'style.css'),(await readFile(join(root,'style.css'),'utf8')).replace('display: block; position: absolute','display: none; position: absolute').replace('width: 900px','width: 100%'));
 assert.equal(await runPublicCli(['spa-verify','--report',join(before,'public-run.json'),'--issue',ids[0],'--issue',ids[1],'--out',after,'--chromium',chromium],io),0,messages.join('\n'));
 const comparison=JSON.parse(await readFile(join(after,'comparison.json'),'utf8')),fresh=JSON.parse(await readFile(join(after,'public-run.json'),'utf8'));
 assert.deepEqual(comparison.selected.map(x=>x.status),['resolved-for-this-check','resolved-for-this-check']);assert.equal(comparison.coverageIncomplete,0);assert.equal(spaIssues(fresh).length,0);assert.equal(comparison.browserCacheHits,0);
 const newProfiles=(await readdir(tmpdir())).filter(n=>n.startsWith('vision-ui-doctor-')&&!profiles.has(n));assert.deepEqual(newProfiles,[]);
 t.diagnostic(JSON.stringify({evidence:out,browser:run.browserVersion,states:run.states.length,beforeIssues:spaIssues(run).length,incompleteBefore:packet.coverage.incomplete,packetBytes:packet.metrics.bytes,selected:ids,afterIssues:spaIssues(fresh).length,comparison,newProfiles:newProfiles.length}));
});
