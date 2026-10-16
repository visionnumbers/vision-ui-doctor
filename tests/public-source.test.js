import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,utimes} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {lookupSources,readSnippets} from '../src/public-source.js';

const issue={id:'vud-0000000000000001',selector:'#wide'};
async function project(t){const root=await mkdtemp(join(tmpdir(),'lp1-project space-'));t.after(()=>rm(root,{recursive:true,force:true,maxRetries:3}));await writeFile(join(root,'page.css'),'#wide { width: 900px; }\n');return root;}

test('source lookup is opt-in, bounded, lexical and uses content hashes, not timestamps',async t=>{
 const root=await project(t),cache=join(root,'reports','source-cache.json');
 const first=await lookupSources({root,issues:[issue],cache});
 assert.equal(first.results[0].status,'CANDIDATES');assert.equal(first.results[0].candidates[0].path,'page.css');assert.equal(first.metrics.metadataMisses,1);
 const second=await lookupSources({root,issues:[issue],cache});assert.equal(second.metrics.metadataHits,1);assert.ok(second.metrics.bytesRead>0);
 const timestamp=new Date(1000000);await utimes(join(root,'page.css'),timestamp,timestamp);
 await writeFile(join(root,'page.css'),'#gone { width: 900px; }\n');await utimes(join(root,'page.css'),timestamp,timestamp);
 const third=await lookupSources({root,issues:[issue],cache});assert.equal(third.metrics.metadataMisses,1);assert.equal(third.results[0].status,'UNKNOWN');
 await rm(join(root,'page.css'));assert.equal((await lookupSources({root,issues:[issue],cache})).metrics.files,0);
 assert.doesNotMatch(await readFile(cache,'utf8'),/width|900px/);
 await assert.rejects(lookupSources({issues:[issue]}),{code:'LP1_USAGE'});
});

test('hard exclusions, project ignores, secret files, symlinks and include boundaries',async t=>{
 const root=await project(t);
 for(const directory of ['Docs','reports','.temp','.git','node_modules','dist','build','vendor']){await mkdir(join(root,directory),{recursive:true});await writeFile(join(root,directory,'hidden.css'),'#wide{}');}
 await writeFile(join(root,'.gitignore'),'ignored.css\n');await writeFile(join(root,'ignored.css'),'#wide{}');
 await writeFile(join(root,'secret.js'),'const token="SYNTHETIC_SECRET"; // #wide');
 await writeFile(join(root,'.env'),'#wide');
 await symlink(join(root,'page.css'),join(root,'linked.css')).catch(error=>{if(error.code!=='EPERM')throw error;});
 const found=await lookupSources({root,issues:[issue]});assert.deepEqual(found.results[0].candidates.map(c=>c.path),['page.css']);
 assert.equal((await lookupSources({root,issues:[issue],include:['Docs']})).metrics.files,0);
 await assert.rejects(lookupSources({root:join(root,'.temp'),issues:[issue]}),{code:'LP1_USAGE'});
 await assert.rejects(lookupSources({root,issues:[issue],include:['../']}),{code:'LP1_USAGE'});
});

test('snippet selection requires issue/candidate binding and stays under file/line/byte budgets',async t=>{
 const root=await project(t);
 for(let i=0;i<4;i++)await writeFile(join(root,`style${i}.css`),'#wide{}\n'+('a'.repeat(100)+'\n').repeat(70));
 const found=await lookupSources({root,issues:[issue]});assert.equal(found.results[0].candidates.length,3);
 const selection=found.results[0].candidates.map(c=>({issueId:issue.id,path:c.path}));
 const result=await readSnippets({root,issues:[issue],selection});assert.ok(result.snippets.every(s=>s.endLine-s.startLine+1<=40));assert.ok(Buffer.byteLength(JSON.stringify(result))<=8192);
 await assert.rejects(readSnippets({root,issues:[issue],selection:[{issueId:issue.id,path:'../outside.css'}]}),{code:'LP1_USAGE'});
 await assert.rejects(readSnippets({root,issues:[issue],selection:[{issueId:'vud-ffffffffffffffff',path:'page.css'}]}),{code:'LP1_USAGE'});
 await assert.rejects(readSnippets({root,issues:[issue],selection:[...selection,selection[0]]}),{code:'LP1_USAGE'});
});

test('corrupt cache is a miss and ambiguity/missing selectors are truthful',async t=>{
 const root=await project(t),cache=join(root,'reports','source-cache.json');await mkdir(join(root,'reports'));await writeFile(cache,'not JSON');
 const found=await lookupSources({root,issues:[issue,{id:'vud-0000000000000002',selector:'html'}],cache});assert.equal(found.metrics.metadataMisses,1);assert.equal(found.results[1].status,'UNKNOWN');
 assert.equal(found.results[0].candidates[0].confidence,'low');
});

test('nested project ignore rules exclude source and unsupported patterns fail closed',async t=>{
 const root=await project(t);await mkdir(join(root,'src'));await writeFile(join(root,'src','.gitignore'),'**/private.css\n');await writeFile(join(root,'src','private.css'),'#wide{}');
 const found=await lookupSources({root,issues:[issue]});assert.deepEqual(found.results[0].candidates.map(c=>c.path),['page.css']);
 await writeFile(join(root,'.gitignore'),'[private]*.css\n');await assert.rejects(lookupSources({root,issues:[issue]}),{code:'LP1_USAGE'});
});

test('ignore policy changes invalidate metadata and multiple zero-directory globs stay excluded',async t=>{
 const root=await project(t),cache=join(root,'reports','source-cache.json');await mkdir(join(root,'src'));await writeFile(join(root,'src','private.css'),'#wide{}');
 await lookupSources({root,issues:[issue],cache});await writeFile(join(root,'.gitignore'),'**/src/**/private.css\n');
 const found=await lookupSources({root,issues:[issue],cache});assert.equal(found.metrics.metadataHits,0);assert.deepEqual(found.results[0].candidates.map(c=>c.path),['page.css']);
});
