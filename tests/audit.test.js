import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,readdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {audit} from '../src/audit.js';
const chromium=process.env.CHROMIUM_PATH||'chromium';
test('detects real mobile overflow and writes compact report',async t=>{
 const canary='VUD_SECRET_CANARY_DO_NOT_REPORT';const source=await readFile(new URL('../examples/buggy.html',import.meta.url),'utf8');const fixture=source.replace('</main>',`<input type="hidden" value="${canary}"></main>`);const server=createServer((req,res)=>{res.setHeader('content-type','text/html');res.end(fixture)});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());const output=await mkdtemp(join(tmpdir(),'ui-doctor-test-'));t.after(()=>rm(output,{recursive:true,force:true}));
 const report=await audit({url:`http://127.0.0.1:${server.address().port}`,routes:['/'],viewports:['mobile'],out:output,chromium,waitMs:50,screenshots:true,fixtureHtml:fixture});assert.equal(report.summary.pagesAudited,1);assert.ok(report.pages[0].issues.some(x=>x.kind==='horizontal-document-overflow'));assert.ok(report.pages[0].issues.some(x=>x.kind==='unlabeled-form-control'));assert.equal(report.pages[0].screenshot,'screenshot-1-mobile.png');const compact=JSON.parse(await readFile(join(output,'agent-findings.json'),'utf8'));delete compact.target;const expected=JSON.parse(await readFile(new URL('./fixtures/acceptance-agent-findings.json',import.meta.url),'utf8'));assert.deepEqual(compact,expected);const md=await readFile(join(output,'AGENT_REPORT.md'),'utf8');assert.match(md,/Vision UI Doctor — Agent Report/);assert.ok((await readdir(output)).includes('screenshot-1-mobile.png'));for(const file of (await readdir(output)).filter(file=>!file.endsWith('.png'))){const artifact=await readFile(join(output,file),'utf8');assert.doesNotMatch(artifact,new RegExp(canary),`${file} must not contain the secret canary`);}
});
test('remote URL requires consent',async()=>{await assert.rejects(audit({url:'https://example.com',out:'/tmp/ui-should-not-write'}),/--allow-remote/)});

test('redacts sensitive route values from every report artifact',async t=>{
 const secret='URL_QUERY_SECRET_CANARY';const hashSecret='HASH_SECRET_CANARY';const output=await mkdtemp(join(tmpdir(),'ui-doctor-redaction-'));t.after(()=>rm(output,{recursive:true,force:true}));
 const report=await audit({url:'http://127.0.0.1:4173/app/',routes:[`/app/private?token=${secret}&view=dashboard#/editor?session=${hashSecret}&mode=js`],viewports:['mobile'],out:output,chromium,waitMs:0,screenshots:true,fixtureHtml:`<!doctype html><title>${secret}</title><main>Safe</main>`});
 assert.doesNotMatch(JSON.stringify(report),new RegExp(`${secret}|${hashSecret}`));
 assert.match(report.pages[0].route,/token=%5BREDACTED%5D/);
 assert.match(report.pages[0].route,/session=%5BREDACTED%5D/);
 const files=await readdir(output);assert.equal(files.some(file=>file.endsWith('.png')),false,'sensitive URL routes must not create screenshots');
 for(const file of files){const artifact=await readFile(join(output,file),'utf8');assert.doesNotMatch(artifact,new RegExp(`${secret}|${hashSecret}`),`${file} must redact URL secrets`);}
});
