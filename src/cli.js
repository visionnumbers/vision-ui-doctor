#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {audit,VIEWPORTS} from './audit.js';
import {discoverRoutes,checkBackend} from './site.js';
import {normalizeRouteUrl,routeFromUrl} from './url.js';
import {loadProjectConfig,validateProjectConfig,ConfigError} from './config.js';
import {createExecutionPlan} from './plan.js';

const VERSION=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;

export const EXIT_CODES=Object.freeze({SUCCESS:0,RUNTIME_FAILURE:1,FINDINGS:2,INVALID_ARGUMENT:64});

const OPTION_DEFINITIONS={
 config:{type:'string'},
 url:{type:'string'},routes:{type:'string',multiple:true},discover:{type:'boolean'},'max-routes':{type:'string'},
 'login-url':{type:'string'},'user-env':{type:'string'},'pass-env':{type:'string'},'user-selector':{type:'string'},
 'pass-selector':{type:'string'},'submit-selector':{type:'string'},endpoints:{type:'string'},
 viewports:{type:'string',multiple:true},out:{type:'string'},chromium:{type:'string'},'wait-ms':{type:'string'},'timeout-ms':{type:'string'},concurrency:{type:'string'},
 screenshots:{type:'boolean'},'no-screenshots':{type:'boolean'},'allow-remote':{type:'boolean'},'no-fail':{type:'boolean'},
 help:{type:'boolean',short:'h'},version:{type:'boolean',short:'V'}
};

export const help=`Vision UI Doctor v${VERSION}\n\nUsage:\n  vision-ui-doctor audit --url https://your-site.example --allow-remote --discover\n  vision-ui-doctor --help\n  vision-ui-doctor --version\n\nOptions:\n  --url URL                          Website root to audit (required for audit)\n  --routes ROUTES                    Comma-separated route list; may be repeated\n  --discover                         Crawl same-origin links under URL path prefix\n  --max-routes NUMBER                Discovery cap from 1 to 100 (default: 30)\n  --login-url PATH                   Login form URL (same origin)\n  --user-env NAME                    Login username environment variable\n  --pass-env NAME                    Login password environment variable\n  --user-selector SELECTOR           Login username field selector\n  --pass-selector SELECTOR           Login password field selector\n  --submit-selector SELECTOR         Login submit control selector\n  --endpoints FILE                   Read-only backend GET/HEAD checks\n  --viewports NAMES                  Comma-separated viewport names\n  --out DIRECTORY                    Report directory (default: reports/ui-audit)\n  --chromium PATH                    Chrome, Edge, or Chromium executable\n  --wait-ms NUMBER                   Post-load wait from 0 to 10000 (default: 550)\n  --no-screenshots                   Disable screenshot capture\n  --allow-remote                     Allow an explicitly authorized remote target\n  --no-fail                          Return success despite reported findings\n  -h, --help                         Show this help\n  -V, --version                      Show the package version\n\nExit codes:\n  0  Clean scan, --no-fail, help, or version\n  1  Runtime or environment failure\n  2  UI findings, backend failures, or page failures\n  64 Invalid command-line arguments\n\nSecurity: scan only websites you own or have authorization to test. Credentials are loaded from environment variables and not written to reports. Remote backend checks are GET/HEAD only.\n`;

export const lifecycleHelp=`\nLifecycle options:\n  --timeout-ms NUMBER                Per-page/CDP/backend timeout, 250-60000 (default: 10000)\n  --concurrency NUMBER               Simultaneous audit pages, 1-8 (default: 1)\n`;

const configHelp=`\nProject configuration (schemaVersion 1):\n  vision-ui-doctor validate --config FILE\n  vision-ui-doctor plan --config FILE\n  vision-ui-doctor audit --config FILE [--allow-remote]\n  --config FILE                     Local JSON only; explicit flags > config > defaults\nvalidate/plan are offline and never start a browser. Plans are sanitized, not coverage.\nConfig audits support public routes only; protected routes/journeys are schema-only.\n`;

class CliUsageError extends Error{
 constructor(message){super(message);this.name='CliUsageError';this.code='CLI_USAGE';}
}
const usageError=message=>new CliUsageError(message);

function nonEmpty(values,name){
 const value=values[name];
 if(value!==undefined&&(!value.trim()||value.includes('\0')))throw usageError(`--${name} requires a non-empty value`);
 return value;
}

function boundedInteger(value,name,{min,max,defaultValue}){
 if(value===undefined)return defaultValue;
 if(!/^\d+$/.test(value))throw usageError(`--${name} must be an integer from ${min} to ${max}`);
 const number=Number(value);
 if(!Number.isSafeInteger(number)||number<min||number>max)throw usageError(`--${name} must be an integer from ${min} to ${max}`);
 return number;
}

function list(values,name){
 const supplied=values[name];
 if(supplied===undefined)return null;
 const entries=supplied.flatMap(value=>value.split(',')).map(value=>value.trim()).filter(Boolean);
 if(!entries.length)throw usageError(`--${name} requires at least one value`);
 return entries;
}

function deduplicateRoutes(base,routes){
 const unique=new Map();
 for(const route of routes){const normalized=normalizeRouteUrl(base,route);const key=normalized?.identity||`invalid:${route}`;if(!unique.has(key))unique.set(key,normalized?routeFromUrl(normalized.navigationUrl):route);}
 return [...unique.values()];
}

function configuredValues(values,command){
 const source=loadProjectConfig(nonEmpty(values,'config'),{raw:true});
 const original=validateProjectConfig(source);
 // Do not silently drop declarations that the M1 executor cannot honor.
 if(command==='audit'&&(original.journeys.length||original.routes.some(route=>route.access==='protected')||['discover','login-url','endpoints','user-env','pass-env','user-selector','pass-selector','submit-selector'].some(key=>values[key]!==undefined)))throw new ConfigError('audit --config','M2.1 executes public manifests only, without journeys, discovery, login or backend options; use validate/plan for future capabilities');
 const input={...original,routes:source.routes,journeys:source.journeys??[],baseUrl:values.url??original.baseUrl};
 if(values.routes!==undefined)input.routes=list(values,'routes').map(url=>{
  const normalized=normalizeRouteUrl(input.baseUrl,url);
  return {id:'route-'+createHash('sha256').update(normalized?.identity||url).digest('hex').slice(0,16),url,access:'public'};
 });
 if(values.viewports!==undefined)input.viewports=list(values,'viewports');
 input.limits={...original.limits};
 for(const [flag,key] of [['max-routes','maxRoutes'],['timeout-ms','timeoutMs']])if(values[flag]!==undefined)input.limits[key]=boundedInteger(values[flag],flag,{min:key==='timeoutMs'?250:1,max:key==='timeoutMs'?60000:100});
 for(const [flag,key,min,max] of [['wait-ms','waitMs',0,10000],['concurrency','concurrency',1,8]])if(values[flag]!==undefined)input[key]=boundedInteger(values[flag],flag,{min,max});
 if(values.out!==undefined)input.out=values.out;
 if(values.screenshots)input.screenshots=true;
 if(values['no-screenshots'])input.screenshots=false;
 const project=validateProjectConfig(input);
 if(command==='audit'&&!values['allow-remote']&&!['localhost','127.0.0.1','[::1]'].includes(new URL(project.baseUrl).hostname))throw new ConfigError('audit --config','remote execution requires explicit --allow-remote authorization');
 const merged={...values,url:project.baseUrl,routes:project.routes.map(route=>routeFromUrl(route.url)),viewports:project.viewports,out:project.out,'max-routes':String(project.limits.maxRoutes),'timeout-ms':String(project.limits.timeoutMs),'wait-ms':String(project.waitMs),concurrency:String(project.concurrency),'no-screenshots':!project.screenshots};
 return {project,values:merged};
}

export function parseCliArgs(argv=[]){
 let parsed;
 try{parsed=parseArgs({args:argv,options:OPTION_DEFINITIONS,allowPositionals:true,strict:true});}
 catch(error){
  const option=error.message.match(/--[a-z][a-z0-9-]{0,47}/i)?.[0];
  throw usageError(error.code==='ERR_PARSE_ARGS_UNKNOWN_OPTION'?`Unknown option ${option||'(unsupported)'}`:`Invalid option syntax${option?' for '+option:''}; check required values and boolean flags`);
 }
 let {values,positionals}=parsed;
 if(values.help)return {action:'help'};
 if(values.version)return {action:'version'};
 if(!positionals.length)return {action:'help'};
 if(positionals.length===1&&positionals[0]==='help')return {action:'help'};
 if(positionals.length!==1||!['audit','validate','plan'].includes(positionals[0]))throw usageError('Unknown command or unexpected argument; use audit, validate or plan');
 const command=positionals[0];
 if(values.screenshots&&values['no-screenshots'])throw usageError('Use only one of --screenshots and --no-screenshots');
 let configProject;
 if(['validate','plan'].includes(command)&&!values.config)throw usageError('--config is required for validate and plan');
 if(values.config!==undefined){
  nonEmpty(values,'config');
  if(command!=='audit'&&Object.keys(values).some(key=>!['config','url','routes','viewports','max-routes','timeout-ms','wait-ms','concurrency','out','screenshots','no-screenshots','allow-remote'].includes(key)))throw usageError('validate/plan accept configuration overrides only, not browser/login/backend options');
  const configured=configuredValues(values,command);values=configured.values;configProject=configured.project;
  if(command!=='audit')return {action:command,project:configured.project};
 }

 for(const name of ['url','login-url','user-env','pass-env','user-selector','pass-selector','submit-selector','endpoints','out','chromium'])nonEmpty(values,name);
 if(!values.url)throw usageError('--url is required for audit');
 let target;
 try{target=new URL(values.url);}catch{throw usageError('--url must be a valid HTTP(S) URL');}
 if(!['http:','https:'].includes(target.protocol))throw usageError('--url must use http: or https:');
 if(target.username||target.password)throw usageError('--url must not contain credentials');

 const routes=configProject?configProject.routes.map(route=>routeFromUrl(route.url)):list(values,'routes')||[target.pathname+target.search];
 const viewports=list(values,'viewports')||Object.keys(VIEWPORTS);
 const invalidViewports=viewports.filter(name=>!Object.hasOwn(VIEWPORTS,name));
 if(invalidViewports.length)throw usageError(`Unknown viewport: ${invalidViewports.join(', ')}. Use ${Object.keys(VIEWPORTS).join(', ')}`);
 const maxRoutes=boundedInteger(values['max-routes'],'max-routes',{min:1,max:100,defaultValue:30});
 const waitMs=boundedInteger(values['wait-ms'],'wait-ms',{min:0,max:10000,defaultValue:550});
 const timeoutMs=boundedInteger(values['timeout-ms'],'timeout-ms',{min:250,max:60000,defaultValue:10000});
 const concurrency=boundedInteger(values.concurrency,'concurrency',{min:1,max:8,defaultValue:1});
 const login=values['login-url']?{loginUrl:values['login-url'],usernameEnv:values['user-env']||'VISION_UI_USERNAME',passwordEnv:values['pass-env']||'VISION_UI_PASSWORD',userSelector:values['user-selector']||'input[name="email"]',passwordSelector:values['pass-selector']||'input[type="password"]',submitSelector:values['submit-selector']||'button[type="submit"]'}:null;

 return {action:'audit',...(configProject?{configured:true}:{}),options:{url:values.url,routes,discover:!!values.discover,maxRoutes,login,endpointFile:values.endpoints,viewports,out:values.out||'reports/ui-audit',chromium:values.chromium,waitMs,timeoutMs,concurrency,screenshots:!values['no-screenshots'],allowRemote:!!values['allow-remote'],noFail:!!values['no-fail']}};
}

export async function runCli(argv,{auditFn=audit,discoverRoutesFn=discoverRoutes,checkBackendFn=checkBackend,stdout=message=>console.log(message),stderr=message=>console.error(message)}={}){
 if(['install','uninstall'].includes(argv[0]))return (await import('./install-cli.js')).runInstallerCli(argv,{stdout,stderr});
 let parsed;
 try{parsed=parseCliArgs(argv);}catch(error){
  if(['CLI_USAGE','CONFIG_INVALID'].includes(error?.code)){stderr(`vision-ui-doctor: ${error.message}\nTry 'vision-ui-doctor --help' for usage.`);return EXIT_CODES.INVALID_ARGUMENT;}
  stderr(`vision-ui-doctor: ${error?.message||String(error)}`);return EXIT_CODES.RUNTIME_FAILURE;
 }
 if(parsed.action==='help'){stdout(help+lifecycleHelp+configHelp+'\nAgent skills: vision-ui-doctor install [--list|--status] or uninstall; use install --help. No runtime downloads.\n');return EXIT_CODES.SUCCESS;}
 if(parsed.action==='version'){stdout(VERSION);return EXIT_CODES.SUCCESS;}
 if(parsed.action==='validate'){stdout(JSON.stringify({schemaVersion:parsed.project.schemaVersion,status:'valid'}));return EXIT_CODES.SUCCESS;}
 if(parsed.action==='plan'){stdout(JSON.stringify(createExecutionPlan(parsed.project),null,2));return EXIT_CODES.SUCCESS;}
 try{
  const options=parsed.options;
  let routes=[...options.routes],discovery=null;
  if(options.discover){discovery=await discoverRoutesFn({url:options.url,chromium:options.chromium,allowRemote:options.allowRemote,maxRoutes:options.maxRoutes,waitMs:options.waitMs,timeoutMs:options.timeoutMs,login:options.login});routes=[...routes,...discovery.routes];}
  routes=deduplicateRoutes(options.url,routes);
  const backend=await checkBackendFn({baseUrl:options.url,endpointFile:options.endpointFile,allowRemote:options.allowRemote,timeoutMs:options.timeoutMs});
  const report=await auditFn({url:options.url,routes,viewports:options.viewports,out:options.out,chromium:options.chromium,screenshots:options.screenshots,allowRemote:options.allowRemote,waitMs:options.waitMs,timeoutMs:options.timeoutMs,concurrency:options.concurrency,login:options.login,backend,discovery});
  stdout(JSON.stringify({summary:report.summary,output:options.out,agentReport:options.out+'/AGENT_REPORT.md'},null,2));
  const hasFailures=report.summary.totalIssues||report.summary.backendFailures||report.summary.pageFailures;
  return hasFailures&&!options.noFail?EXIT_CODES.FINDINGS:EXIT_CODES.SUCCESS;
 }catch(error){
  if(parsed.configured){
   const code=['BROWSER_NOT_FOUND','VUD_TIMEOUT','ENOENT','EACCES','EPERM'].includes(error?.code)?error.code:'RUNTIME_FAILURE';
   stderr(`vision-ui-doctor: Configured audit failed (${code}); check browser, authorized target and output permissions. Raw runtime details withheld to protect configuration values.`);
  }else stderr(`vision-ui-doctor: ${error?.message||String(error)}`);
  return EXIT_CODES.RUNTIME_FAILURE;
 }
}

const isMain=process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url;
if(isMain)process.exitCode=await runCli(process.argv.slice(2));
