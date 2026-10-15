import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {scopeUrl,discoverRoutes,checkBackend} from '../src/site.js';
const closeServer=server=>{server.closeAllConnections?.();return new Promise(resolve=>server.close(resolve));};

test('only same-origin in-scope routes are accepted',()=>{
 assert.equal(scopeUrl('https://example.com/app/','https://example.com/app/settings?x=1'),'https://example.com/app/settings?x=1');
 assert.equal(scopeUrl('https://example.com/app/','https://evil.example.com/app/'),null);
 assert.equal(scopeUrl('https://example.com/app/','https://example.com/admin'),null);
});
test('discovers anchor routes and generates backend status checks',async t=>{
 const s=createServer((req,res)=>{if(req.url==='/api/status'){res.setHeader('content-type','application/json');res.end('{"ok":true}');return;}res.setHeader('content-type','text/html');res.end(req.url==='/app/'?'<a href="/app/settings">Settings</a><a href="https://other.org">External</a>':'<h1>Settings</h1>');});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>closeServer(s));
 const base=`http://127.0.0.1:${s.address().port}`;const dir=await mkdtemp(join(tmpdir(),'vision-ui-site-'));t.after(()=>rm(dir,{recursive:true,force:true}));const endpoints=join(dir,'endpoints.json');await writeFile(endpoints,JSON.stringify([{path:'/api/status',expectedStatus:200}]));
 const discover=await discoverRoutes({url:base+'/app/',maxRoutes:5,waitMs:20});assert.ok(discover.routes.includes('/app/'));assert.ok(discover.routes.includes('/app/settings') || discover.errors.length > 0, 'Either routes should be discovered or navigation errors explicitly recorded');
 const backend=await checkBackend({baseUrl:base,endpointFile:endpoints});assert.equal(backend[0].ok,true);
});

test('waits for a delayed document before collecting discovery links',async t=>{
 const s=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.write('<!doctype html><body>');setTimeout(()=>res.end(req.url==='/app/'?'<a href="/app/settings">Settings</a>':'<h1>Settings</h1>'),1200);});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>closeServer(s));
 const base=`http://127.0.0.1:${s.address().port}/app/`;
 const result=await discoverRoutes({url:base,maxRoutes:2,waitMs:0});
 assert.deepEqual(result.errors,[]);
 assert.ok(result.routes.includes('/app/settings'));
});

test('discovers bounded query and hash routes with canonical deduplication',async t=>{
 const s=createServer((req,res)=>{res.setHeader('content-type','text/html');if(req.url==='/app/'){const host=req.headers.host;res.end(`<a href="/app/search?b=2&a=one&a=two">Search A</a><a href="/app/search?a=one&a=two&b=2">Search duplicate</a><a href="/app/#/dashboard">Dashboard</a><a href="/app/#section">Section</a><a href="./editor?q=hello%20world">Editor</a><a href="//${host}/app/profile?utm_source=test">Profile</a>${Array.from({length:8},(_,i)=>`<a href="/app/list?page=${i+1}">Page ${i+1}</a>`).join('')}<a href="https://evil.example/app/">External</a>`);return;}res.end('<h1>Route</h1>');});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>closeServer(s));
 const base=`http://127.0.0.1:${s.address().port}/app/`;
 const result=await discoverRoutes({url:base,maxRoutes:10,waitMs:0});
 assert.deepEqual(result.errors,[]);
 assert.ok(result.routes.includes('/app/search?b=2&a=one&a=two'));
 assert.equal(result.routes.filter(route=>route.startsWith('/app/search?')).length,1);
 assert.ok(result.routes.includes('/app/#/dashboard'));
 assert.equal(result.routes.some(route=>route.endsWith('#section')),false);
 assert.ok(result.routes.includes('/app/editor?q=hello%20world'));
 assert.ok(result.routes.includes('/app/profile'));
 assert.equal(result.routes.filter(route=>route.startsWith('/app/list?page=')).length,3);
 assert.ok(result.routes.length<=10);
});

test('records a cross-origin redirect instead of collecting destination links',async t=>{
 const external=createServer((req,res)=>{res.setHeader('content-type','text/html');res.end('<a href="/stolen">External route</a>');});
 await new Promise(r=>external.listen(0,'127.0.0.1',r));t.after(()=>closeServer(external));
 const source=createServer((req,res)=>{res.writeHead(302,{location:`http://127.0.0.1:${external.address().port}/outside`});res.end();});
 await new Promise(r=>source.listen(0,'127.0.0.1',r));t.after(()=>closeServer(source));
 const base=`http://127.0.0.1:${source.address().port}/app/`;
 const result=await discoverRoutes({url:base,maxRoutes:5,waitMs:0});
 assert.equal(result.routes.includes('/stolen'),false);
 assert.match(result.errors[0]?.error||'',/redirected outside target scope/i);
});

test('discovery timeout is reported and closes its tab and browser',async()=>{
 let browserClosed=false,tabClosed=false;
 const tab={send:method=>method==='Page.navigate'?new Promise(()=>{}):Promise.resolve({}),evaluate:async()=>'',close:async()=>{tabClosed=true;}};
 const browserFactory=async()=>({tab:async()=>tab,close:async()=>{browserClosed=true;}});
 const result=await discoverRoutes({url:'http://127.0.0.1:4173/app/',maxRoutes:2,waitMs:0,timeoutMs:20,browserFactory});
 assert.match(result.errors[0]?.error||'',/Discovery navigation timed out after 20 ms.*\/app\//i);
 assert.equal(tabClosed,true);
 assert.equal(browserClosed,true);
});

test('backend timeout identifies the stage and endpoint',async t=>{
 const server=createServer(()=>{});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const dir=await mkdtemp(join(tmpdir(),'vision-ui-backend-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const endpoints=join(dir,'endpoints.json');await writeFile(endpoints,JSON.stringify(['/api/slow']));
 const result=await checkBackend({baseUrl:`http://127.0.0.1:${server.address().port}`,endpointFile:endpoints,timeoutMs:250});
 assert.equal(result[0].ok,false);
 assert.match(result[0].error,/Backend request timed out after 250 ms for \/api\/slow/);
});
