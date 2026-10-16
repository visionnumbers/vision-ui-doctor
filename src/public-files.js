import {open,lstat,realpath,mkdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,relative,isAbsolute,parse,join} from 'node:path';
import {usage} from './public-workflow.js';

export const within=(root,path)=>{const rel=relative(root,path);return rel===''||(!rel.startsWith('..')&&!isAbsolute(rel));};

// Reject symlink/reparse ancestors as well as the final path. Never execute files.
export async function checkedPath(path,{directory=false,create=false}={}){
 if(typeof path!=='string'||!path||path.includes('\0')||/^(?:[\\/]{2}|[a-z]+:\/\/)/i.test(path))throw usage('Use an explicit local filesystem path, not a network path or URL');
 const absolute=resolve(path),parts=absolute.slice(parse(absolute).root.length).split(/[\\/]/).filter(Boolean);
 let current=parse(absolute).root;
 for(let i=0;i<parts.length;i++){
  current=join(current,parts[i]);let info;
  try{info=await lstat(current);}catch(error){
   if(error.code!=='ENOENT'||!create)throw error;
   if(i===parts.length-1&&!directory)return absolute;
   await mkdir(current);info=await lstat(current);
  }
  if(info.isSymbolicLink()||((i<parts.length-1||directory)&&!info.isDirectory()))throw usage('Symlink/reparse or non-directory path is not permitted');
 }
 return absolute;
}

export async function readBounded(path,maxBytes=8*1024*1024){
 const absolute=await checkedPath(path);const handle=await open(absolute,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
 try{
  const info=await handle.stat();
  if(!info.isFile()||info.nlink>1||info.size>maxBytes)throw usage('Input must be a bounded, uniquely linked regular file');
  if(await realpath(absolute)!==absolute)throw usage('Input path changed or escaped its boundary');
  const buffer=Buffer.alloc(Math.min(maxBytes+1,info.size+1));let count=0;
  while(count<buffer.length){const {bytesRead}=await handle.read(buffer,count,buffer.length-count,count);if(!bytesRead)break;count+=bytesRead;}
  const after=await lstat(absolute);
  if(count>maxBytes||count!==info.size||after.isSymbolicLink()||after.dev!==info.dev||after.ino!==info.ino||await realpath(absolute)!==absolute)throw usage('Input changed while reading or exceeds its boundary');
  return buffer.subarray(0,count).toString('utf8');
 }finally{await handle.close();}
}

export async function readJson(path){try{return JSON.parse(await readBounded(path));}catch(error){if(error.code==='LP1_USAGE')throw error;throw usage('Cannot read bounded local JSON file; check its path and JSON syntax');}}

export async function writeJson(path,value){
 const absolute=await checkedPath(path,{create:true});
 try{const info=await lstat(absolute);if(!info.isFile()||info.nlink>1)throw usage('Output must be a uniquely linked regular file');}catch(error){if(error.code!=='ENOENT')throw error;}
 const handle=await open(absolute,constants.O_WRONLY|constants.O_CREAT|constants.O_TRUNC|(constants.O_NOFOLLOW??0),0o600);
 try{await handle.writeFile(JSON.stringify(value));}finally{await handle.close();}
}
