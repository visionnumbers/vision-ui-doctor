import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {writeFile,mkdir,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {browserSession,withStageTimeout,sleep} from '../src/cdp.js';
import {buildExperienceSnapshotScript,detectExperience} from '../src/detectors/experience.js';
import {experienceCases,experienceFixture} from './fixtures/experience-cases.js';

test('real experience: five broken/corrected/legitimate triples with bounded DOM evidence',async t=>{
 // Model a normal UA button line-height even on platforms inheriting body metrics.
 // Specific fixture typography must override it, rather than depend on host fonts.
 const server=createServer((req,res)=>{const [,pattern,variant]=req.url.split('/');res.setHeader('content-type','text/html');res.end(experienceFixture(pattern,variant).replace('<style>','<style>button{line-height:normal}'));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const before=new Set((await readdir(tmpdir())).filter(n=>n.startsWith('vision-ui-doctor-'))),out=resolve('reports',`experience-fixture-${Date.now()}-${process.pid}`);await mkdir(out);
 const browser=await browserSession({chromium:process.env.CHROMIUM_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',timeout:10000,operationTimeout:3000,shutdownTimeout:5000});
 const results=[];let cleanup;
 try{
  const deadline=Date.now()+45000;
  for(const [pattern,category] of experienceCases)for(const variant of ['broken','corrected','legitimate']){
   const tab=await browser.tab();
   try{
    await tab.send('Page.enable');await tab.send('Emulation.setDeviceMetricsOverride',{width:320,height:700,deviceScaleFactor:1,mobile:false});
    const url=`http://127.0.0.1:${server.address().port}/${pattern}/${variant}`;await tab.send('Page.navigate',{url});
    await withStageTimeout((async()=>{while(!await tab.evaluate(`document.readyState==='complete'&&location.pathname===${JSON.stringify('/'+pattern+'/'+variant)}`)){await sleep(20);}})(),{stage:'Fixture ready',timeoutMs:Math.min(3000,Math.max(1,deadline-Date.now()))});
    const snapshot=await tab.evaluate(buildExperienceSnapshotScript()),result=detectExperience(snapshot);
    results.push({pattern,variant,category,detected:result.issues.some(i=>i.category===category),issues:result.issues,snapshot,coverage:result.coverage});
   }finally{await tab.close();}
   if(Date.now()>deadline)throw Error('Fixture batch deadline exceeded');
  }
 }finally{try{await browser.close();}catch(e){cleanup={failed:true,stages:e.errors?.map(e=>({stage:e.stage??'cleanup',code:e.code??'RUNTIME'}))};}await writeFile(join(out,'results.json'),JSON.stringify({results,cleanup},null,2));}
 const after=(await readdir(tmpdir())).filter(n=>n.startsWith('vision-ui-doctor-')&&!before.has(n));
 t.diagnostic(JSON.stringify({output:out,results:results.map(({pattern,variant,detected})=>({pattern,variant,detected})),newProfiles:after.length,cleanup}));
 assert.equal(cleanup,undefined,'cleanup failures remain fatal');assert.deepEqual(after,[]);
 assert.equal(results.length,15);for(const r of results)assert.equal(r.detected,r.variant==='broken',r.pattern+'/'+r.variant);
 assert.equal(results.some(r=>r.variant!=='broken'&&r.issues.length>0),false,'no new-rule findings on any of the ten counterexamples/corrections');
});
