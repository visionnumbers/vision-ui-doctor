#!/usr/bin/env node
import {parseArgs} from 'node:util';
import {readFileSync} from 'node:fs';
import {lstat} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseCliArgs} from './cli.js';
import {loadProjectConfig} from './config.js';
import {discoverRoutes} from './site.js';
import {routeFromUrl} from './url.js';
import {guardPublicOptions,scanPublic,createPacket,verifyPublic,publicStates,selectedIssues,usage,classifyPublicError} from './public-workflow.js';
import {lookupSources,readSnippets} from './public-source.js';
import {readJson,writeJson,checkedPath,within} from './public-files.js';

const VERSION=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
const auditFlags=['url','routes','config','viewports','chromium','timeout-ms','wait-ms','concurrency','max-routes','discover','allow-remote','screenshots','no-screenshots'];
const schema=Object.fromEntries(['url','config','chromium','timeout-ms','wait-ms','concurrency','max-routes','out','report','project-root','mode','max-issues','max-bytes'].map(key=>[key,{type:'string'}]));
for(const key of ['routes','viewports','issue','file','include'])schema[key]={type:'string',multiple:true};
for(const key of ['discover','allow-remote','screenshots','no-screenshots','help','version'])schema[key]={type:'boolean'};
schema.help.short='h';schema.version.short='V';

export const publicHelp=`Vision UI Doctor public workflow v${VERSION}
LOCAL_TRUSTED: explicitly trusted public code, NOT network isolation. authAllowed:false.
Use only a dev server/site you own or are explicitly authorized to audit. No credentials.

  vision-ui-doctor-public audit --url http://127.0.0.1:4173 --routes /,/about --viewports small,desktop --out reports/before
  vision-ui-doctor-public packet --report reports/before/public-run.json [--issue ID] [--max-issues 10] [--max-bytes 16384]
  vision-ui-doctor-public sources --report reports/before/public-run.json --issue ID --project-root PATH [--include src]
  vision-ui-doctor-public snippet --report reports/before/public-run.json --issue ID --project-root PATH --file src/page.css
  vision-ui-doctor-public verify --report reports/before/public-run.json --issue ID --out reports/after [--chromium PATH]

audit reuses existing public CLI/config/discovery options; CLI > config > defaults.
Screenshots default OFF in this workflow; --screenshots opts into local capture only.
Audit/verify output must be a NEW directory beneath ./reports. No source writes.
sources: up to 3 lexical candidates/issue; snippets: 3 files, 40 lines/file, 8 KiB total.
Sources require --issue and explicit project-root. Repeat --include for relative prefixes.
Source hash metadata cache: PROJECT/reports/lp1-source-index.json; browser scans are never cached.
verify freshly scans ALL configured public routes/viewports; --allow-remote must be renewed.
Protected/auth/journey/backend execution and SECURE_ISOLATED are unavailable.
Exits: 0 successful command/no findings; 2 findings/incomplete/unknown verification; 64 invalid input; 1 runtime/cleanup failure.
Existing vision-ui-doctor entrypoint remains unchanged. No AI API or automatic patches.
`;

function number(value,fallback,max){if(value===undefined)return fallback;if(!/^\d+$/.test(value)||Number(value)<1||Number(value)>max)throw usage('Invalid bounded numeric option');return Number(value);}
async function outputDirectory(value){
 const out=resolve(value??'reports/public');if(!within(resolve('reports'),out))throw usage('Output must be beneath ./reports, never a source directory');
 await checkedPath(out,{directory:true,create:true});
 // Preserve immutable baseline evidence and prevent report collisions.
 const entries=['public-run.json','report.json','report.html','agent-packet.json'];
 for(const file of entries)try{await lstat(join(out,file));throw usage('Output already contains evidence; choose a fresh --out directory');}catch(error){if(error.code!=='ENOENT')throw error;}
 return out;
}

export async function runPublicCli(argv,{stdout=message=>console.log(message),stderr=message=>console.error(message),scanFn=scanPublic,verifyFn=verifyPublic,discoverFn=discoverRoutes}={}){
 let parsed;
 try{parsed=parseArgs({args:argv,options:schema,strict:true,allowPositionals:true});}catch{stderr('public: invalid/unknown option or missing value; use --help (input withheld)');return 64;}
 const {values,positionals}=parsed;
 if(values.help||!argv.length){stdout(publicHelp);return 0;}
 if(values.version){stdout(VERSION);return 0;}
 try{
  if(positionals.length!==1||!['audit','packet','sources','snippet','verify'].includes(positionals[0]))throw usage('Choose audit, packet, sources, snippet or verify; see --help');
  const command=positionals[0];
  const allowed={audit:[...auditFlags,'out','mode'],packet:['report','issue','max-issues','max-bytes'],sources:['report','issue','project-root','include'],snippet:['report','issue','project-root','include','file'],verify:['report','issue','out','chromium','allow-remote']}[command];
  if(Object.keys(values).some(key=>!allowed.includes(key)))throw usage('Option is not supported for this public command; see --help');
  if(command==='audit'){
   if(values.mode&&values.mode!=='LOCAL_TRUSTED')throw usage('SECURE_ISOLATED is unavailable; no downgrade or authentication bypass');
   if(values.config){
    const project=loadProjectConfig(values.config);
    if(project.auth||project.schemaVersion!==1||project.journeys.length||project.routes.some(route=>route.access!=='public'))throw usage('Public workflow requires schema 1 public routes without auth or journeys');
   }
   const forwarded=['audit'];
   for(const flag of auditFlags)if(values[flag]!==undefined){for(const value of Array.isArray(values[flag])?values[flag]:[values[flag]])forwarded.push(...(typeof value==='boolean'?[`--${flag}`]:[`--${flag}`,value]));}
   const parsedAudit=parseCliArgs(forwarded);const options=parsedAudit.options;
   if(!values.config&&!values.routes)options.routes=[routeFromUrl(options.url)];
   options.screenshots=values.screenshots===true;guardPublicOptions(options);
   options.out=await outputDirectory(values.out??(values.config?loadProjectConfig(values.config).out:undefined));
   if(options.discover){
    const discovery=await discoverFn({...guardPublicOptions(options),chromium:options.chromium,maxRoutes:options.maxRoutes,login:null});
    options.routes=[...new Set([...options.routes,...discovery.routes])];
    if(discovery.errors?.length)throw Object.assign(new Error('Discovery incomplete'),{code:'LP1_DISCOVERY_INCOMPLETE'});
   }
   if(options.routes.length>options.maxRoutes)throw usage('Combined route scope exceeds --max-routes; narrow explicit routes/discovery');
   const run=await scanFn(options);await writeJson(join(options.out,'public-run.json'),run);
   const packet=createPacket(run);await writeJson(join(options.out,'agent-packet.json'),packet);
   stdout(JSON.stringify({output:relative(resolve('.'),options.out).split('\\').join('/'),packet:packet.metrics,issues:run.report.summary?.totalIssues,coverageIncomplete:packet.coverage.incomplete,authAllowed:false,networkIsolation:'NONE'}));
   return packet.coverage.incomplete||run.report.pages.some(p=>p.issues.length)?2:0;
  }
  if(!values.report)throw usage('--report public-run.json is required');
  const run=await readJson(values.report);publicStates(run);
  if(command==='packet'){stdout(JSON.stringify(createPacket(run,{issueIds:values.issue,maxIssues:number(values['max-issues'],10,10),maxBytes:number(values['max-bytes'],16384,16384)})));return 0;}
  if(!values.issue?.length)throw usage('--issue ID is required; get IDs from packet');
  if(command==='verify'){
   guardPublicOptions({...run.options,allowRemote:values['allow-remote']===true});selectedIssues(run,values.issue);
   const out=await outputDirectory(values.out??'reports/verify');
   const {fresh,comparison}=await verifyFn(run,{issueIds:values.issue,out,chromium:values.chromium,allowRemote:values['allow-remote']===true});
   await writeJson(join(out,'public-run.json'),fresh);await writeJson(join(out,'comparison.json'),comparison);await writeJson(join(out,'agent-packet.json'),createPacket(fresh));
   stdout(JSON.stringify(comparison));
   return comparison.coverageIncomplete||comparison.selected.some(item=>item.status!=='resolved-for-this-check')||fresh.report.pages.some(p=>p.issues.length)?2:0;
  }
  const issues=selectedIssues(run,values.issue).map(i=>({id:i.finding.id,selector:i.finding.selector}));
  if(command==='sources'){
   const result=await lookupSources({root:values['project-root'],issues,include:values.include??[],cache:values['project-root']?join(resolve(values['project-root']),'reports','lp1-source-index.json'):undefined});stdout(JSON.stringify(result));return 0;
  }
  if(values.issue.length!==1||!values.file?.length)throw usage('snippet requires one --issue and 1-3 repeated --file candidate paths');
  stdout(JSON.stringify(await readSnippets({root:values['project-root'],issues,include:values.include??[],selection:values.file.map(path=>({issueId:values.issue[0],path}))})));return 0;
 }catch(error){
  const invalid=['LP1_USAGE','CLI_USAGE','CONFIG_INVALID'].includes(error?.code);
  stderr(invalid?`public: ${error.code==='LP1_USAGE'?error.message:'invalid public audit configuration/options (values withheld)'}; see --help`:`public: runtime/discovery/browser/cleanup failure; evidence incomplete ${JSON.stringify(classifyPublicError(error))}`);
  return invalid?64:1;
 }
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)process.exitCode=await runPublicCli(process.argv.slice(2));
