import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveBrowserExecutable} from '../src/browser-locator.js';

test('real configured public audit preserves query/hash routes and existing report contract',async t=>{
 const server=createServer((req,res)=>{res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="en"><title>Fixture</title><main>Ready</main></html>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const dir=await mkdtemp(join(tmpdir(),'vud-config-audit-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const configFile=join(dir,'project config.json'),out=join(dir,'reports');
 await writeFile(configFile,JSON.stringify({schemaVersion:1,baseUrl:`http://127.0.0.1:${server.address().port}/app/`,routes:[{id:'editor',url:'./?values=a,b&tag=one&tag=two#/editor',access:'public'}],viewports:['mobile'],waitMs:0,screenshots:false,out}));
 const result=await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../src/cli.js',import.meta.url)),'audit','--config',configFile],{env:{...process.env,CHROMIUM_PATH:resolveBrowserExecutable()},timeout:45000,windowsHide:true});
 assert.equal(JSON.parse(result.stdout).summary.pagesAudited,1);
 const report=JSON.parse(await readFile(join(out,'report.json'),'utf8'));
 // M1 report redaction reserializes commas as %2C without changing their value.
 assert.equal(report.schemaVersion,3);assert.equal(report.pages[0].route,'/app/?values=a%2Cb&tag=one&tag=two#/editor');assert.equal(report.pages[0].status,'audited');
 assert.equal(new URL(report.pages[0].url).searchParams.get('values'),'a,b');
 assert.ok((await readFile(join(out,'AGENT_REPORT.md'),'utf8')).includes('Coverage limitations'));
});
