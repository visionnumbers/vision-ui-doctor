#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {audit,VIEWPORTS} from './audit.js';
import {discoverRoutes,checkBackend} from './site.js';
import {normalizeRouteUrl,routeFromUrl} from './url.js';

const VERSION=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;

export const EXIT_CODES=Object.freeze({SUCCESS:0,RUNTIME_FAILURE:1,FINDINGS:2,INVALID_ARGUMENT:64});

const OPTION_DEFINITIONS={
 url:{type:'string'},routes:{type:'string',multiple:true},discover:{type:'boolean'},'max-routes':{type:'string'},
 'login-url':{type:'string'},'user-env':{type:'string'},'pass-env':{type:'string'},'user-selector':{type:'string'},
 'pass-selector':{type:'string'},'submit-selector':{type:'string'},endpoints:{type:'string'},
 viewports:{type:'string',multiple:true},out:{type:'string'},chromium:{type:'string'},'wait-ms':{type:'string'},'timeout-ms':{type:'string'},concurrency:{type:'string'},
 'no-screenshots':{type:'boolean'},'allow-remote':{type:'boolean'},'no-fail':{type:'boolean'},
 help:{type:'boolean',short:'h'},version:{type:'boolean',short:'V'}
};

export const help=`Vision UI Doctor v${VERSION}\n\nUsage:\n  vision-ui-doctor audit --url https://your-site.example --allow-remote --discover\n  vision-ui-doctor --help\n  vision-ui-doctor --version\n\nOptions:\n  --url URL                          Website root to audit (required for audit)\n  --routes ROUTES                    Comma-separated route list; may be repeated\n  --discover                         Crawl same-origin links under URL path prefix\n  --max-routes NUMBER                Discovery cap from 1 to 100 (default: 30)\n  --login-url PATH                   Login form URL (same origin)\n  --user-env NAME                    Login username environment variable\n  --pass-env NAME                    Login password environment variable\n  --user-selector SELECTOR           Login username field selector\n  --pass-selector SELECTOR           Login password field selector\n  --submit-selector SELECTOR         Login submit control selector\n  --endpoints FILE                   Read-only backend GET/HEAD checks\n  --viewports NAMES                  Comma-separated viewport names\n  --out DIRECTORY                    Report directory (default: reports/ui-audit)\n  --chromium PATH                    Chrome, Edge, or Chromium executable\n  --wait-ms NUMBER                   Post-load wait from 0 to 10000 (default: 550)\n  --no-screenshots                   Disable screenshot capture\n  --allow-remote                     Allow an explicitly authorized remote target\n  --no-fail                          Return success despite reported findings\n  -h, --help                         Show this help\n  -V, --version                      Show the package version\n\nExit codes:\n  0  Clean scan, --no-fail, help, or version\n  1  Runtime or environment failure\n  2  UI findings, backend failures, or page failures\n  64 Invalid command-line arguments\n\nSecurity: scan only websites you own or have authorization to test. Credentials are loaded from environment variables and not written to reports. Remote backend checks are GET/HEAD only.\n`;

export const lifecycleHelp=`\nLifecycle options:\n  --timeout-ms NUMBER                Per-page/CDP/backend timeout, 250-60000 (default: 10000)\n  --concurrency NUMBER               Simultaneous audit pages, 1-8 (default: 1)\n`;

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

export function parseCliArgs(argv=[]){
 let parsed;
 try{parsed=parseArgs({args:argv,options:OPTION_DEFINITIONS,allowPositionals:true,strict:true});}
 catch(error){throw usageError(error.message);}
 const {values,positionals}=parsed;
 if(values.help)return {action:'help'};
 if(values.version)return {action:'version'};
 if(!positionals.length)return {action:'help'};
 if(positionals.length===1&&positionals[0]==='help')return {action:'help'};
 if(positionals.length!==1||positionals[0]!=='audit')throw usageError(`Unknown command or unexpected argument: ${positionals.join(' ')||'(missing)'}`);

 for(const name of ['url','login-url','user-env','pass-env','user-selector','pass-selector','submit-selector','endpoints','out','chromium'])nonEmpty(values,name);
 if(!values.url)throw usageError('--url is required for audit');
 let target;
 try{target=new URL(values.url);}catch{throw usageError('--url must be a valid HTTP(S) URL');}
 if(!['http:','https:'].includes(target.protocol))throw usageError('--url must use http: or https:');
 if(target.username||target.password)throw usageError('--url must not contain credentials');

 const routes=list(values,'routes')||[target.pathname+target.search];
 const viewports=list(values,'viewports')||Object.keys(VIEWPORTS);
 const invalidViewports=viewports.filter(name=>!Object.hasOwn(VIEWPORTS,name));
 if(invalidViewports.length)throw usageError(`Unknown viewport: ${invalidViewports.join(', ')}. Use ${Object.keys(VIEWPORTS).join(', ')}`);
 const maxRoutes=boundedInteger(values['max-routes'],'max-routes',{min:1,max:100,defaultValue:30});
 const waitMs=boundedInteger(values['wait-ms'],'wait-ms',{min:0,max:10000,defaultValue:550});
 const timeoutMs=boundedInteger(values['timeout-ms'],'timeout-ms',{min:250,max:60000,defaultValue:10000});
 const concurrency=boundedInteger(values.concurrency,'concurrency',{min:1,max:8,defaultValue:1});
 const login=values['login-url']?{loginUrl:values['login-url'],usernameEnv:values['user-env']||'VISION_UI_USERNAME',passwordEnv:values['pass-env']||'VISION_UI_PASSWORD',userSelector:values['user-selector']||'input[name="email"]',passwordSelector:values['pass-selector']||'input[type="password"]',submitSelector:values['submit-selector']||'button[type="submit"]'}:null;

 return {action:'audit',options:{url:values.url,routes,discover:!!values.discover,maxRoutes,login,endpointFile:values.endpoints,viewports,out:values.out||'reports/ui-audit',chromium:values.chromium,waitMs,timeoutMs,concurrency,screenshots:!values['no-screenshots'],allowRemote:!!values['allow-remote'],noFail:!!values['no-fail']}};
}

export async function runCli(argv,{auditFn=audit,discoverRoutesFn=discoverRoutes,checkBackendFn=checkBackend,stdout=message=>console.log(message),stderr=message=>console.error(message)}={}){
 let parsed;
 try{parsed=parseCliArgs(argv);}catch(error){
  if(error?.code==='CLI_USAGE'){stderr(`vision-ui-doctor: ${error.message}\nTry 'vision-ui-doctor --help' for usage.`);return EXIT_CODES.INVALID_ARGUMENT;}
  stderr(`vision-ui-doctor: ${error?.message||String(error)}`);return EXIT_CODES.RUNTIME_FAILURE;
 }
 if(parsed.action==='help'){stdout(help+lifecycleHelp);return EXIT_CODES.SUCCESS;}
 if(parsed.action==='version'){stdout(VERSION);return EXIT_CODES.SUCCESS;}
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
 }catch(error){stderr(`vision-ui-doctor: ${error?.message||String(error)}`);return EXIT_CODES.RUNTIME_FAILURE;}
}

const isMain=process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url;
if(isMain)process.exitCode=await runCli(process.argv.slice(2));
