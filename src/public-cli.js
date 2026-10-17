#!/usr/bin/env node
import {parseArgs} from 'node:util';
import {readFileSync} from 'node:fs';
import {lstat} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {parseCliArgs} from './cli.js';
import {loadProjectConfig} from './config.js';
import {discoverRoutes} from './site.js';
import {routeFromUrl} from './url.js';
import {guardPublicOptions,scanPublic,createPacket,verifyPublic,publicStates,selectedIssues,usage,classifyPublicError} from './public-workflow.js';
import {lookupSources,readSnippets} from './public-source.js';
import {readJson,writeJson,writeLocalImage,writeLocalText,checkedPath,within} from './public-files.js';
import {scanSpa,spaStates,spaIssues,spaPacket,compareSpaRuns,validateSpaConfig} from './spa-workflow.js';
import {renderDeveloperReports} from './developer-report.js';

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
  vision-ui-doctor-public spa-audit --config spa.json --out reports/spa-before [--chromium PATH] [--screenshots]
  vision-ui-doctor-public spa-verify --report reports/spa-before/public-run.json --issue ID --out reports/spa-after [--chromium PATH] [--screenshots]
  vision-ui-doctor-public scan --url http://localhost:5173 --out reports/scan [--project-root PATH]
  vision-ui-doctor-public scan --config public-spa.json --out reports/scan [--screenshots]

audit reuses existing public CLI/config/discovery options; CLI > config > defaults.
Screenshots default OFF in this workflow; --screenshots opts into local capture only.
Audit/verify output must be a NEW directory beneath ./reports. No source writes.
sources: up to 3 lexical candidates/issue; snippets: 3 files, 40 lines/file, 8 KiB total.
Sources require --issue and explicit project-root. Repeat --include for relative prefixes.
Source hash metadata cache: PROJECT/reports/lp1-source-index.json; browser scans are never cached.
verify freshly scans ALL configured public routes/viewports; --allow-remote must be renewed.
spa-audit executes ONLY explicit public toggle/navigation/tab steps in the separate SPA schema.
packet/sources/snippet also accept SPA public-run.json. No arbitrary control discovery/clicks.
Optional ux regions/alignments add responsive, overlap and declared-alignment evidence with root-cause candidates.
ux.usability:true adds bounded text/contrast/form/control checks; ux.stabilizeMs opts into a longer bounded transition observation phase.
ux.experience:true adds conservative prose, content-space, toolbar-wrap, text/badge and mobile-header diagnostics.
SPA screenshots are opt-in local viewport PNGs; no pixel diff or AI image upload.
Protected/auth/M2 journeys/backend execution and SECURE_ISOLATED are unavailable.
Exits: 0 successful command/no findings; 2 findings/incomplete/unknown verification; 64 invalid input; 1 runtime/cleanup failure.
Existing vision-ui-doctor entrypoint remains unchanged. No AI API or automatic patches.
scan: auto-discover same-origin anchors unless --routes supplies explicit scope; public defaults small,desktop.
scan --config reuses public SPA config/states (do not combine with URL/routes/runtime overrides).
scan writes REPORT.md, AGENT_HANDOFF.md (<=16 KiB), scan-status.json and public-run.json when the engine completes.
Source candidates require --project-root; optional --include narrows lookup. No target metadata-cache writes.
Undiscovered routes and unconfigured interactive states remain unknown; runtime/cleanup failures produce failure reports.
`;

function number(value,fallback,max){if(value===undefined)return fallback;if(!/^\d+$/.test(value)||Number(value)<1||Number(value)>max)throw usage('Invalid bounded numeric option');return Number(value);}
async function outputDirectory(value,extraFiles=[]){
 const out=resolve(value??'reports/public');if(!within(resolve('reports'),out))throw usage('Output must be beneath ./reports, never a source directory');
 await checkedPath(out,{directory:true,create:true});
 // Preserve immutable baseline evidence and prevent report collisions.
 const entries=['public-run.json','report.json','report.html','agent-packet.json',...extraFiles];
 for(const file of entries)try{await lstat(join(out,file));throw usage('Output already contains evidence; choose a fresh --out directory');}catch(error){if(error.code!=='ENOENT')throw error;}
 return out;
}

export async function runPublicCli(argv,{stdout=message=>console.log(message),stderr=message=>console.error(message),scanFn=scanPublic,verifyFn=verifyPublic,discoverFn=discoverRoutes,spaFn=scanSpa}={}){
 let parsed;
 try{parsed=parseArgs({args:argv,options:schema,strict:true,allowPositionals:true});}catch{stderr('public: invalid/unknown option or missing value; use --help (input withheld)');return 64;}
 const {values,positionals}=parsed;
 if(values.help||!argv.length){stdout(publicHelp);return 0;}
 if(values.version){stdout(VERSION);return 0;}
 try{
  if(positionals.length!==1||!['audit','packet','sources','snippet','verify','spa-audit','spa-verify','scan'].includes(positionals[0]))throw usage('Choose scan, audit, spa-audit, packet, sources, snippet, verify or spa-verify; see --help');
  const command=positionals[0];
  const allowed={scan:[...auditFlags,'out','project-root','include'],audit:[...auditFlags,'out','mode'],'spa-audit':['config','out','chromium','allow-remote','screenshots'],'spa-verify':['report','issue','out','chromium','allow-remote','screenshots'],packet:['report','issue','max-issues','max-bytes'],sources:['report','issue','project-root','include'],snippet:['report','issue','project-root','include','file'],verify:['report','issue','out','chromium','allow-remote']}[command];
  if(Object.keys(values).some(key=>!allowed.includes(key)))throw usage('Option is not supported for this public command; see --help');
  if(command==='scan'){
   if(values.include&&!values['project-root'])throw usage('--include requires explicit --project-root consent');
   if(values.include?.some(p=>!p||p.length>256||p.includes('\\')||p.startsWith('/')||/^[a-z]:/i.test(p)||p.split('/').some(s=>s==='.'||s==='..'))||values.include?.length>20)throw usage('Use at most 20 relative --include prefixes');
   if(values.screenshots&&values['no-screenshots'])throw usage('Use only one screenshots option');
   let config,options;
   if(values.config){
    if(Object.keys(values).some(k=>!['config','out','chromium','allow-remote','screenshots','no-screenshots','project-root','include'].includes(k)))throw usage('scan --config uses the public SPA schema; do not combine with route/runtime overrides');
    config=validateSpaConfig(await readJson(values.config),{allowRemote:values['allow-remote']===true});
   }else{
    const forwarded=['audit'];for(const flag of auditFlags.filter(f=>f!=='config'))if(values[flag]!==undefined)for(const v of Array.isArray(values[flag])?values[flag]:[values[flag]])forwarded.push(...(typeof v==='boolean'?[`--${flag}`]:[`--${flag}`,v]));
    options=parseCliArgs(forwarded).options;
    if(!values.routes)options.routes=[routeFromUrl(options.url)];
    if(!values.viewports)options.viewports=guardPublicOptions({url:options.url,allowRemote:options.allowRemote}).viewports;
    options.screenshots=values.screenshots===true;guardPublicOptions(options);
    if(options.routes.length>options.maxRoutes)throw usage('Explicit routes exceed --max-routes');
   }
   if(values['project-root'])try{await checkedPath(values['project-root'],{directory:true});}catch{throw usage('--project-root must be an existing local directory without symlink/reparse ancestors');}
   const out=await outputDirectory(values.out??'reports/scan',['REPORT.md','AGENT_HANDOFF.md','scan-status.json']);
   const baseline=join(out,'public-run.json'),cliPath=new URL('./public-cli.js',import.meta.url);
   let run,discovery={requested:false,errors:0},sourceResults,phase='browser';
   const render=failure=>renderDeveloperReports({run,baseline,cliPath:resolve(fileURLToPath(cliPath)),discovery,failure,sourceResults,projectRoot:values['project-root']});
   const save=async rendered=>{await writeLocalText(join(out,'REPORT.md'),rendered.report);await writeLocalText(join(out,'AGENT_HANDOFF.md'),rendered.agent,16384);await writeJson(join(out,'scan-status.json'),{...rendered.status,rootCauseGroups:rendered.rootCauseGroups});};
   try{
    if(config)run=await spaFn(config,{chromium:values.chromium,allowRemote:values['allow-remote']===true,captureImage:values.screenshots?(file,data)=>writeLocalImage(join(out,file),data):undefined});
    else{
     if(values.discover===true||!values.routes){
      phase='discovery';const found=await discoverFn({...guardPublicOptions(options),chromium:options.chromium,maxRoutes:options.maxRoutes,login:null});
      const routes=guardPublicOptions({...options,routes:[...new Set([...options.routes,...found.routes])]}).routes;
      discovery={requested:true,errors:found.errors?.length??0,cap:options.maxRoutes,capMayHaveLimited:found.routes.length>=options.maxRoutes||routes.length>options.maxRoutes,knownRoutesOmitted:Math.max(0,routes.length-options.maxRoutes)};
      options.routes=routes.slice(0,options.maxRoutes);
     }
     phase='browser';options.out=out;run=await scanFn(options);
    }
    phase='artifacts';await writeJson(baseline,run);
    let rendered=render();
    if(values['project-root']&&rendered.selectedIssueIds.length){
     phase='source-lookup';const selected=(config?spaIssues:selectedIssues)(run,rendered.selectedIssueIds).map(i=>({id:i.finding.id,selector:i.finding.selector}));
     sourceResults=(await lookupSources({root:values['project-root'],issues:selected,include:values.include??[]})).results;rendered=render();
    }
    phase='artifacts';await save(rendered);
    stdout(JSON.stringify({output:relative(resolve('.'),out).split('\\').join('/'),report:'REPORT.md',handoff:'AGENT_HANDOFF.md',...rendered.status}));return rendered.status.outcome;
   }catch(error){
    const failure=classifyPublicError(error).map(e=>({...e,phase}));
    // No synthetic successful baseline after startup/navigation/cleanup failure.
    await save(render(failure));stderr(`public scan: incomplete workflow ${JSON.stringify(failure)}`);return 1;
   }
  }
  if(command==='spa-audit'){
   if(!values.config)throw usage('spa-audit requires --config with a local SPA JSON file');
   const config=validateSpaConfig(await readJson(values.config),{allowRemote:values['allow-remote']===true});
   const out=await outputDirectory(values.out??'reports/spa');
   const run=await scanSpa(config,{chromium:values.chromium,allowRemote:values['allow-remote']===true,captureImage:values.screenshots?(file,data)=>writeLocalImage(join(out,file),data):undefined});
   const packet=spaPacket(run);await writeJson(join(out,'public-run.json'),run);await writeJson(join(out,'agent-packet.json'),packet);
   stdout(JSON.stringify({output:relative(resolve('.'),out),issues:spaIssues(run).length,coverageIncomplete:packet.coverage.incomplete,packet:packet.metrics,authAllowed:false,networkIsolation:'NONE'}));
   return packet.coverage.incomplete||spaIssues(run).length?2:0;
  }
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
  const run=await readJson(values.report);
  const spa=run?.kind==='public-spa';const select=spa?spaIssues:selectedIssues,packetFor=spa?spaPacket:createPacket;
  if(spa)spaStates(run);else publicStates(run);
  if(command==='spa-verify'){
   if(!spa)throw usage('spa-verify requires a SPA baseline');
   const chosen=spaIssues(run,values.issue);if(!values.issue)throw usage('Select --issue ID for fresh verification');
   validateSpaConfig(run.config,{allowRemote:values['allow-remote']===true});
   const out=await outputDirectory(values.out??'reports/spa-verify');
   const fresh=await scanSpa(run.config,{chromium:values.chromium,allowRemote:values['allow-remote']===true,proofSelectors:[...new Set(chosen.map(x=>x.finding.selector))],captureImage:values.screenshots?(file,data)=>writeLocalImage(join(out,file),data):undefined});
   const comparison=compareSpaRuns(run,fresh,values.issue);await writeJson(join(out,'public-run.json'),fresh);await writeJson(join(out,'comparison.json'),comparison);await writeJson(join(out,'agent-packet.json'),spaPacket(fresh));
   stdout(JSON.stringify(comparison));return comparison.coverageIncomplete||comparison.selected.some(x=>x.status!=='resolved-for-this-check')||spaIssues(fresh).length?2:0;
  }
  if(spa&&command==='verify')throw usage('Use spa-verify to freshly replay a SPA baseline');
  if(command==='packet'){stdout(JSON.stringify(packetFor(run,{issueIds:values.issue,maxIssues:number(values['max-issues'],10,10),maxBytes:number(values['max-bytes'],16384,16384)})));return 0;}
  if(!values.issue?.length)throw usage('--issue ID is required; get IDs from packet');
  if(command==='verify'){
   guardPublicOptions({...run.options,allowRemote:values['allow-remote']===true});selectedIssues(run,values.issue);
   const out=await outputDirectory(values.out??'reports/verify');
   const {fresh,comparison}=await verifyFn(run,{issueIds:values.issue,out,chromium:values.chromium,allowRemote:values['allow-remote']===true});
   await writeJson(join(out,'public-run.json'),fresh);await writeJson(join(out,'comparison.json'),comparison);await writeJson(join(out,'agent-packet.json'),createPacket(fresh));
   stdout(JSON.stringify(comparison));
   return comparison.coverageIncomplete||comparison.selected.some(item=>item.status!=='resolved-for-this-check')||fresh.report.pages.some(p=>p.issues.length)?2:0;
  }
  const issues=select(run,values.issue).map(i=>({id:i.finding.id,selector:i.finding.selector}));
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
