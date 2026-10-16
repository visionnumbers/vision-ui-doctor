import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,cp,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runPublicCli} from '../src/public-cli.js';
import {lookupSources,readSnippets} from '../src/public-source.js';
import {compareRuns,scanPublic} from '../src/public-workflow.js';

test('real public audit -> packet -> source -> external fixture patch -> fresh cross-route verification',async t=>{
 const root=await mkdtemp(join(tmpdir(),'lp1-demo-project-'));t.after(()=>rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
 await cp(fileURLToPath(new URL('./fixtures/public-project/',import.meta.url)),root,{recursive:true});
 let unavailable=false;
 const server=createServer(async(req,res)=>{
  if(unavailable){req.socket.destroy();return;}
  const path=req.url.split('?')[0];const file=({'/':'index.html','/about':'about.html','/style.css':'style.css'})[path];
  if(!file){res.writeHead(404);res.end('Missing');return;}
  res.setHeader('content-type',file.endsWith('.css')?'text/css':'text/html');res.setHeader('cache-control','no-store');res.end(await readFile(join(root,file)));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const url=`http://127.0.0.1:${server.address().port}/`,stamp=`lp1-demo-${Date.now()}-${process.pid}`,before=resolve('reports',stamp,'before'),after=resolve('reports',stamp,'after');
 const messages=[],deps={stdout:message=>messages.push(message),stderr:message=>messages.push(message)};
 const chromium=process.env.CHROMIUM_PATH||'chromium';
 const beforeProfiles=new Set((await readdir(tmpdir())).filter(name=>/^vision-ui-doctor-/.test(name)));
 assert.equal(await runPublicCli(['audit','--url',url,'--routes','/,/about','--viewports','small,desktop','--chromium',chromium,'--wait-ms','0','--out',before],deps),2,messages.join('\n'));
 const baseline=JSON.parse(await readFile(join(before,'public-run.json'),'utf8')),packet=JSON.parse(await readFile(join(before,'agent-packet.json'),'utf8'));
 assert.equal(baseline.report.pages.length,4);assert.equal(packet.coverage.incomplete,0);assert.equal(packet.provenance.browserVersion.startsWith('Chrome/'),true);
 assert.equal(packet.metrics.bytes,Buffer.byteLength(JSON.stringify(packet)));assert.ok(packet.metrics.bytes<=16384);
 const finding=baseline.report.pages.flatMap(p=>p.issues).find(i=>i.selector==='#wide'&&i.category==='ELEMENT_OVERFLOW');assert.ok(finding);
 assert.ok(baseline.report.pages.some(p=>p.issues.some(i=>i.category==='UNLABELED_FORM_CONTROL')));
 const issues=[{id:finding.id,selector:finding.selector}],cache=join(root,'reports','lp1-source-index.json');
 const sources=await lookupSources({root,issues,cache}),cached=await lookupSources({root,issues,cache});
 assert.ok(sources.results[0].candidates.some(c=>c.path==='style.css'));assert.equal(cached.metrics.metadataHits,cached.metrics.files);
 const snippets=await readSnippets({root,issues,selection:[{issueId:finding.id,path:'style.css'}]});assert.match(snippets.snippets[0].text,/#wide/);
 const cliOutput=[],offline={stdout:m=>cliOutput.push(JSON.parse(m)),stderr:m=>assert.fail(m)};
 assert.equal(await runPublicCli(['packet','--report',join(before,'public-run.json'),'--issue',finding.id],offline),0);
 assert.equal(cliOutput.at(-1).issues[0].id,finding.id);
 assert.equal(await runPublicCli(['sources','--report',join(before,'public-run.json'),'--issue',finding.id,'--project-root',root],offline),0);
 assert.ok(cliOutput.at(-1).results[0].candidates.some(c=>c.path==='style.css'));
 assert.equal(await runPublicCli(['snippet','--report',join(before,'public-run.json'),'--issue',finding.id,'--project-root',root,'--file','style.css'],offline),0);
 assert.match(cliOutput.at(-1).snippets[0].text,/#wide/);
 // External, explicitly authorized edit of a DISPOSABLE fixture, never by the engine.
 await writeFile(join(root,'style.css'),(await readFile(join(root,'style.css'),'utf8')).replace('width: 900px','width: min(100%, 900px)').replace('#sibling { width: 100%','#sibling { width: 1800px'));
 assert.equal(await runPublicCli(['verify','--report',join(before,'public-run.json'),'--issue',finding.id,'--out',after,'--chromium',chromium],deps),2,messages.join('\n'));
 const comparison=JSON.parse(await readFile(join(after,'comparison.json'),'utf8'));
 assert.equal(comparison.selected[0].status,'resolved-for-this-check');assert.equal(comparison.browserCacheHits,0);assert.equal(comparison.coverageIncomplete,0);
 assert.ok(comparison.newIssues.some(i=>i.route==='/about'&&i.category==='ELEMENT_OVERFLOW'));
 // Failed loading is unknown/incomplete, not a successful resolution.
 unavailable=true;
 const failed=await scanPublic({...baseline.options,out:join(resolve('reports',stamp),'failed'),chromium,timeoutMs:1000});
 assert.ok(failed.report.pages.every(p=>p.status==='failed'));
 assert.equal(compareRuns(baseline,failed,[finding.id]).selected[0].status,'unknown');
 const afterProfiles=(await readdir(tmpdir())).filter(name=>/^vision-ui-doctor-/.test(name)&&!beforeProfiles.has(name));assert.deepEqual(afterProfiles,[]);
 const changed=await lookupSources({root,issues,cache});assert.equal(changed.metrics.metadataMisses,1);
 t.diagnostic(JSON.stringify({evidence:resolve('reports',stamp),packetBytes:packet.metrics.bytes,baselineIssues:baseline.report.summary.totalIssues,selected:finding.id,result:comparison.selected,newIssues:comparison.newIssues.map(i=>({route:i.route,viewport:i.viewport,category:i.category})),cacheFirst:sources.metrics,cacheSecond:cached.metrics,cacheAfterPatch:changed.metrics,failedPages:failed.report.summary.pageFailures,newProfiles:afterProfiles.length}));
});
