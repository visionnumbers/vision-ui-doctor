#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {lstat,readFile} from 'node:fs/promises';
import {isAbsolute,basename,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export async function probeRuntime({cliPath,nodePath=process.execPath}){
 for(const [label,path] of [['Node.js',nodePath],['scanner runtime',cliPath]]){
  if(typeof path!=='string'||!isAbsolute(path))throw Error(`${label} needs an absolute local path; reinstall from the maintained Vision UI Doctor checkout.`);
  try{const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink())throw Error();}catch{throw Error(`${label} is missing or not a regular file. Install Node.js 22+ separately, then reinstall the skill from a complete Vision UI Doctor checkout.`);}
 }
 if(basename(cliPath)!=='public-cli.js')throw Error('Use the Vision UI Doctor public-cli.js runtime, not the legacy authentication CLI.');
 const version=spawnSync(nodePath,['--version'],{encoding:'utf8',windowsHide:true,timeout:5000,maxBuffer:65536});
 if(version.error||version.status!==0||Number(/^v(\d+)/.exec(version.stdout??'')?.[1]??0)<22)throw Error('Node.js 22+ is required. Install it separately, then reinstall the skill.');
 const help=spawnSync(nodePath,[cliPath,'--help'],{encoding:'utf8',windowsHide:true,timeout:5000,maxBuffer:256*1024});
 if(help.error||help.status!==0||!help.stdout.includes('Vision UI Doctor public workflow')||!help.stdout.includes('scan --url'))throw Error('Scanner runtime is incomplete or lacks DX1 scan. Use a maintained checkout/package containing src/public-cli.js and its dependencies, then reinstall.');
 return {cliPath,nodePath,nodeVersion:version.stdout.trim()};
}
export async function skillRuntime(){
 const binding=new URL('../runtime.json',import.meta.url);let runtime;
 try{const info=await lstat(binding);if(!info.isFile()||info.isSymbolicLink()||info.size>8192)throw Error('invalid');runtime=JSON.parse(await readFile(binding,'utf8'));if(runtime.schemaVersion!==1)throw Error('invalid');}
 catch(e){if(e.code!=='ENOENT')throw Error('Invalid local runtime binding; reinstall this skill.');runtime={cliPath:fileURLToPath(new URL('../../../src/public-cli.js',import.meta.url)),nodePath:process.execPath};}
 return probeRuntime(runtime);
}
export async function runSkill(argv=process.argv.slice(2)){
 try{
  const runtime=await skillRuntime();
  if(argv.length===1&&argv[0]==='--check'){console.log(JSON.stringify({ok:true,...runtime}));return 0;}
  const child=spawnSync(runtime.nodePath,[runtime.cliPath,...argv],{stdio:'inherit',windowsHide:true});
  if(child.error||child.status===null)throw Error('Could not launch the bound public scanner; check Node/runtime accessibility and reinstall.');return child.status;
 }catch(e){console.error('Vision UI Doctor skill: '+e.message);return 1;}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)process.exitCode=await runSkill();
