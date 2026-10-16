import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runPublicCli} from '../src/public-cli.js';

test('public CLI rejects login/unknown/isolated execution before any scanner',async()=>{
 let calls=0;const deps={scanFn:()=>{calls++;},stderr:()=>{},stdout:()=>{}};
 for(const args of [['audit','--url','http://localhost','--login-url','/login'],['audit','--url','http://localhost','--mode','SECURE_ISOLATED'],['audit','--url','http://localhost','--user-env','SYNTHETIC'],['audit','--url','http://localhost','--no-fail'],['audit','--unknown']])assert.equal(await runPublicCli(args,deps),64);
 assert.equal(calls,0);
});

test('public CLI config refuses protected routes, journeys and auth before browser effects',async t=>{
 const root=await mkdtemp(join(tmpdir(),'lp1-cli space-'));t.after(()=>rm(root,{recursive:true,force:true}));const file=join(root,'project.json');let calls=0;
 for(const config of [{schemaVersion:1,baseUrl:'http://localhost',routes:[{id:'protected',url:'/private',access:'protected'}]},{schemaVersion:1,baseUrl:'http://localhost',routes:[{id:'home',url:'/',access:'public'}],journeys:[{id:'visit',routeId:'home',steps:[{id:'go',action:'navigate',url:'/'}]}]},{schemaVersion:2,auth:{},baseUrl:'http://localhost',routes:[]}]){
  await writeFile(file,JSON.stringify(config));assert.equal(await runPublicCli(['audit','--config',file],{scanFn:()=>{calls++;},stderr:()=>{},stdout:()=>{}}),64);
 }
 assert.equal(calls,0);
});

test('help/version are offline and errors do not echo paths or secrets',async()=>{
 const messages=[];const deps={stdout:m=>messages.push(m),stderr:m=>messages.push(m)};
 assert.equal(await runPublicCli(['--help'],deps),0);assert.match(messages.join(''),/LOCAL_TRUSTED/);
 assert.equal(await runPublicCli(['--version'],deps),0);
 assert.equal(await runPublicCli(['packet','--report','SYNTHETIC_PRIVATE_PATH'],deps),64);
 assert.doesNotMatch(messages.join(''),/SYNTHETIC_PRIVATE_PATH/);
});
