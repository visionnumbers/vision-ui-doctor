import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createServer as createTcpServer} from 'node:net';
import {spawnSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {audit} from '../src/audit.js';
import {startPhpFixture} from './helpers/php-fixture.js';

const chromium=process.env.CHROMIUM_PATH||'chromium';
const phpAvailable=spawnSync('php',['--version'],{stdio:'ignore',windowsHide:true,timeout:2000}).status===0;
const freePort=async()=>{const server=createTcpServer();await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;};

test('default audit concurrency is one against a single-threaded server',async t=>{
 let active=0,maxActive=0;
 const server=createServer((request,response)=>{active++;maxActive=Math.max(maxActive,active);setTimeout(()=>{response.setHeader('content-type','text/html');response.end(`<title>${request.url}</title><main>OK</main>`);active--;},40);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const out=await mkdtemp(join(tmpdir(),'vud-sequential-'));t.after(()=>rm(out,{recursive:true,force:true}));
 const base=`http://127.0.0.1:${server.address().port}`;
 const report=await audit({url:base,routes:['/one','/two','/three'],viewports:['mobile'],out,chromium,screenshots:false,waitMs:0,timeoutMs:10000});
 assert.equal(report.summary.pagesAudited,3);
 assert.equal(report.summary.pageFailures,0);
 assert.equal(report.config.concurrency,1);
 assert.equal(maxActive,1);
 assert.ok(report.pages.every(page=>page.status==='audited'&&!page.incomplete));
});

test('slow streamed navigation fails within its configured bound and is incomplete',async t=>{
 const server=createServer((request,response)=>{response.writeHead(200,{'content-type':'text/html'});response.write('<!doctype html><body>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const out=await mkdtemp(join(tmpdir(),'vud-timeout-'));t.after(()=>rm(out,{recursive:true,force:true}));
 const base=`http://127.0.0.1:${server.address().port}`;
 const started=Date.now();
 const report=await audit({url:base,routes:['/stream'],viewports:['mobile'],out,chromium,screenshots:false,waitMs:0,timeoutMs:500,browserStartupTimeoutMs:10000});
 assert.ok(Date.now()-started<10000,'startup, bounded navigation failure and cleanup should complete within ten seconds');
 assert.equal(report.summary.pagesAudited,0);
 assert.equal(report.summary.pageFailures,1);
 assert.equal(report.summary.incomplete,1);
 assert.match(report.pages[0].error,/timed out.*stream/i);
});

test('failed navigation closes the tab and browser and cannot report a clean page',async t=>{
 let tabClosed=false,browserClosed=false;
 const tab={send:async method=>method==='Page.navigate'?{errorText:'net::ERR_CONNECTION_REFUSED'}:{},evaluate:async()=>null,close:async()=>{tabClosed=true;}};
 const browserFactory=async options=>{assert.equal(options.shutdownTimeout,5000,'Short navigation deadlines must not shorten browser cleanup');return {tab:async()=>tab,close:async()=>{browserClosed=true;}};};
 const out=await mkdtemp(join(tmpdir(),'vud-failed-nav-'));t.after(()=>rm(out,{recursive:true,force:true}));
 const report=await audit({url:'http://127.0.0.1:4173',routes:['/offline'],viewports:['mobile'],out,screenshots:false,waitMs:0,timeoutMs:500,browserFactory});
 assert.equal(tabClosed,true);
 assert.equal(browserClosed,true);
 assert.equal(report.summary.pagesAudited,0);
 assert.equal(report.summary.pageFailures,1);
 assert.equal(report.summary.incomplete,1);
 assert.equal(report.pages[0].status,'failed');
 assert.match(report.pages[0].error,/Page navigation failed.*ERR_CONNECTION_REFUSED/);
});

test('PHP built-in single-threaded server handles sequential audited routes',{skip:!phpAvailable},async t=>{
 const port=await freePort();const fixtureDir=new URL('./fixtures/',import.meta.url);
 const php=startPhpFixture({port,cwd:fixtureDir});
 t.after(()=>php.close()); // Registered before readiness and every audit assertion.
 await php.ready();const base=php.base;
 const out=await mkdtemp(join(tmpdir(),'vud-php-'));t.after(()=>rm(out,{recursive:true,force:true}));
 const report=await audit({url:base,routes:['/one','/two','/three'],viewports:['mobile'],out,chromium,screenshots:false,waitMs:0,timeoutMs:10000});
 assert.equal(report.config.concurrency,1);
 assert.equal(report.summary.pagesAudited,3);
 assert.equal(report.summary.pageFailures,0);
});
