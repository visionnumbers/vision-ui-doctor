import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runPublicCli} from '../src/public-cli.js';

test('one DX1 browser smoke: discover existing public fixture -> readable reports -> opt-in source candidates',async t=>{
 const fixture=new URL('./fixtures/public-project/',import.meta.url);
 const server=createServer(async(req,res)=>{
  const name=({'/':'index.html','/about':'about.html','/style.css':'style.css'})[req.url.split('?')[0]];
  if(!name){res.writeHead(404);res.end();return;}
  res.setHeader('content-type',name.endsWith('.css')?'text/css':'text/html');res.setHeader('cache-control','no-store');res.end(await readFile(new URL(name,fixture)));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const before=new Set((await readdir(tmpdir())).filter(n=>n.startsWith('vision-ui-doctor-'))),out=resolve('reports',`dx1-smoke-${Date.now()}-${process.pid}`),messages=[];
 const result=await runPublicCli(['scan','--url',`http://127.0.0.1:${server.address().port}/`,'--max-routes','2','--timeout-ms','3000','--wait-ms','0','--screenshots','--project-root',fileURLToPath(fixture),'--out',out,'--chromium',process.env.CHROMIUM_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'],{stdout:m=>messages.push(m),stderr:m=>messages.push(m)});
 const after=(await readdir(tmpdir())).filter(n=>n.startsWith('vision-ui-doctor-')&&!before.has(n));
 t.diagnostic(JSON.stringify({output:out,result,newProfiles:after.length,messages}));
 assert.equal(result,2,'seeded overflow findings must remain nonzero');assert.deepEqual(after,[]);
 const status=JSON.parse(await readFile(join(out,'scan-status.json'))),human=await readFile(join(out,'REPORT.md'),'utf8'),agent=await readFile(join(out,'AGENT_HANDOFF.md'),'utf8');
 assert.equal(status.coverage.planned,4);assert.equal(status.coverage.incomplete,0);assert.equal(status.discovery.requested,true);assert.equal(status.discovery.capMayHaveLimited,true);
 assert.match(human,/\/about/);assert.match(human,/screenshot-1-small.png/);assert.match(agent,/style.css/);assert.match(agent,/node \$vud verify/);assert.ok(Buffer.byteLength(agent)<=16384);assert.ok(status.rootCauseGroups.length>0);
});
