import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseCliArgs,runCli,EXIT_CODES} from '../src/cli.js';

const packageVersion=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;

test('parses space-separated and equals option syntax identically',()=>{
 const spaced=parseCliArgs(['audit','--url','http://localhost:4173/search?q=a&lang=en','--wait-ms','250','--out','reports/check']);
 const equals=parseCliArgs(['audit','--url=http://localhost:4173/search?q=a&lang=en','--wait-ms=250','--out=reports/check']);
 assert.deepEqual(equals,spaced);
 assert.deepEqual(spaced.options.routes,['/search?q=a&lang=en']);
 assert.equal(spaced.options.concurrency,1);
 assert.equal(spaced.options.timeoutMs,10000);
});

test('parses boolean flags and repeated or comma-separated routes',()=>{
 const parsed=parseCliArgs(['audit','--url','http://localhost:4173','--discover','--allow-remote','--no-screenshots','--no-fail','--routes','/,/search?q=a','--routes','/search?q=b']);
 assert.equal(parsed.options.discover,true);
 assert.equal(parsed.options.allowRemote,true);
 assert.equal(parsed.options.screenshots,false);
 assert.equal(parsed.options.noFail,true);
 assert.deepEqual(parsed.options.routes,['/','/search?q=a','/search?q=b']);
});

test('preserves quoted Windows browser and output paths',()=>{
 const parsed=parseCliArgs(['audit','--url','http://localhost:4173','--chromium','C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','--out','D:\\UI Reports\\current run']);
 assert.equal(parsed.options.chromium,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
 assert.equal(parsed.options.out,'D:\\UI Reports\\current run');
});

test('preserves all v0.2 audit options',()=>{
 const parsed=parseCliArgs(['audit','--url','http://localhost:4173/app?tab=one','--routes','/app?tab=two','--discover','--max-routes','12','--login-url','/login','--user-env','TEST_USER','--pass-env','TEST_PASS','--user-selector','#user','--pass-selector','#pass','--submit-selector','#submit','--endpoints','fixtures/endpoints.json','--viewports','small,mobile','--out','reports/test','--chromium','C:\\Browser\\chrome.exe','--wait-ms','50','--no-screenshots','--allow-remote','--no-fail']);
 assert.deepEqual(parsed.options.viewports,['small','mobile']);
 assert.equal(parsed.options.maxRoutes,12);
 assert.equal(parsed.options.login.loginUrl,'/login');
 assert.equal(parsed.options.login.usernameEnv,'TEST_USER');
 assert.equal(parsed.options.login.passwordEnv,'TEST_PASS');
 assert.equal(parsed.options.login.userSelector,'#user');
 assert.equal(parsed.options.login.passwordSelector,'#pass');
 assert.equal(parsed.options.login.submitSelector,'#submit');
 assert.equal(parsed.options.endpointFile,'fixtures/endpoints.json');
 assert.equal(parsed.options.waitMs,50);
});

test('supports help and version commands and safe aliases',()=>{
 assert.equal(parseCliArgs([]).action,'help');
 assert.equal(parseCliArgs(['help']).action,'help');
 assert.equal(parseCliArgs(['--help']).action,'help');
 assert.equal(parseCliArgs(['-h']).action,'help');
 assert.equal(parseCliArgs(['--version']).action,'version');
 assert.equal(parseCliArgs(['-V']).action,'version');
});

test('rejects unknown options, missing values and invalid commands',()=>{
 for(const argv of [
  ['audit','--url','http://localhost:4173','--unknown'],
  ['audit','--url'],
  ['audit','--url','http://localhost:4173','--out'],
  ['audit','--url','http://localhost:4173','extra'],
  ['doctor']
 ]) assert.throws(()=>parseCliArgs(argv),error=>error.code==='CLI_USAGE');
});

test('validates URL, numeric bounds, viewports, routes and output',()=>{
 for(const argv of [
  ['audit'],
  ['audit','--url','not-a-url'],
  ['audit','--url','ftp://localhost/file'],
  ['audit','--url','http://localhost','--max-routes','0'],
  ['audit','--url','http://localhost','--max-routes','101'],
  ['audit','--url','http://localhost','--max-routes','1.5'],
  ['audit','--url','http://localhost','--wait-ms','-1'],
  ['audit','--url','http://localhost','--wait-ms','10001'],
  ['audit','--url','http://localhost','--timeout-ms','249'],
  ['audit','--url','http://localhost','--timeout-ms','60001'],
  ['audit','--url','http://localhost','--concurrency','0'],
  ['audit','--url','http://localhost','--concurrency','9'],
  ['audit','--url','http://localhost','--viewports','mobile,watch'],
  ['audit','--url','http://localhost','--routes='],
  ['audit','--url','http://localhost','--out=']
 ]) assert.throws(()=>parseCliArgs(argv),error=>error.code==='CLI_USAGE');
});

test('parses bounded lifecycle timeout and concurrency options',()=>{
 const parsed=parseCliArgs(['audit','--url','http://localhost:4173','--timeout-ms=2500','--concurrency','2']);
 assert.equal(parsed.options.timeoutMs,2500);
 assert.equal(parsed.options.concurrency,2);
});

test('runCli returns stable exit codes for clean, findings, usage and runtime outcomes',async()=>{
 const quiet={stdout:()=>{},stderr:()=>{},discoverRoutesFn:async()=>({routes:[]}),checkBackendFn:async()=>[]};
 const clean=await runCli(['audit','--url','http://localhost:4173'],{...quiet,auditFn:async()=>({summary:{totalIssues:0,backendFailures:0,pageFailures:0}})});
 const findings=await runCli(['audit','--url','http://localhost:4173'],{...quiet,auditFn:async()=>({summary:{totalIssues:1,backendFailures:0,pageFailures:0}})});
 const noFail=await runCli(['audit','--url','http://localhost:4173','--no-fail'],{...quiet,auditFn:async()=>({summary:{totalIssues:1,backendFailures:0,pageFailures:0}})});
 const usage=await runCli(['audit','--url','http://localhost:4173','--bad-option'],quiet);
 const runtime=await runCli(['audit','--url','http://localhost:4173'],{...quiet,auditFn:async()=>{throw Error('browser crashed')}});
 assert.deepEqual({clean,findings,noFail,usage,runtime},{clean:EXIT_CODES.SUCCESS,findings:EXIT_CODES.FINDINGS,noFail:EXIT_CODES.SUCCESS,usage:EXIT_CODES.INVALID_ARGUMENT,runtime:EXIT_CODES.RUNTIME_FAILURE});
});

test('deduplicates explicit and discovered routes by normalized query identity',async()=>{
 let auditedRoutes;
 const exit=await runCli(['audit','--url','http://localhost:4173/app/','--routes','/app/search?b=2&a=one&a=two','--discover'],{
  stdout:()=>{},stderr:()=>{},
  discoverRoutesFn:async()=>({routes:['/app/search?a=one&a=two&b=2','/app/#section','/app/'],errors:[]}),
  checkBackendFn:async()=>[],
  auditFn:async options=>{auditedRoutes=options.routes;return {summary:{totalIssues:0,backendFailures:0,pageFailures:0}};}
 });
 assert.equal(exit,EXIT_CODES.SUCCESS);
 assert.deepEqual(auditedRoutes,['/app/search?b=2&a=one&a=two','/app/']);
});

test('forwards authentication configuration with protected query routes unchanged',async()=>{
 let received;
 const exit=await runCli(['audit','--url','http://localhost:4173/app/','--routes','/app/private?view=dashboard','--login-url','/app/login','--user-env','AUTH_USER','--pass-env','AUTH_PASS'],{
  stdout:()=>{},stderr:()=>{},checkBackendFn:async()=>[],auditFn:async options=>{received=options;return {summary:{totalIssues:0,backendFailures:0,pageFailures:0}};}
 });
 assert.equal(exit,EXIT_CODES.SUCCESS);
 assert.deepEqual(received.routes,['/app/private?view=dashboard']);
 assert.deepEqual(received.login,{loginUrl:'/app/login',usernameEnv:'AUTH_USER',passwordEnv:'AUTH_PASS',userSelector:'input[name="email"]',passwordSelector:'input[type="password"]',submitSelector:'button[type="submit"]'});
});

test('actual CLI prints help/version and classifies unknown options',()=>{
 const cli=fileURLToPath(new URL('../src/cli.js',import.meta.url));
 const help=spawnSync(process.execPath,[cli,'--help'],{encoding:'utf8'});
 const version=spawnSync(process.execPath,[cli,'--version'],{encoding:'utf8'});
 const invalid=spawnSync(process.execPath,[cli,'audit','--url','http://localhost:4173','--wat'],{encoding:'utf8'});
 assert.equal(help.status,EXIT_CODES.SUCCESS);
 assert.match(help.stdout,/Usage:/);
 assert.match(help.stdout,/--timeout-ms NUMBER/);
 assert.match(help.stdout,/--concurrency NUMBER/);
 assert.equal(version.status,EXIT_CODES.SUCCESS);
 assert.equal(version.stdout.trim(),packageVersion);
 assert.equal(invalid.status,EXIT_CODES.INVALID_ARGUMENT);
 assert.match(invalid.stderr,/Unknown option.*--wat/i);
});
