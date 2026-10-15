import {access,readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {platform,release} from 'node:os';
import {resolveBrowserExecutable} from '../src/browser-locator.js';
import {browserSession} from '../src/cdp.js';

console.log(`Node ${process.version}; ${platform()} ${release()}`);
if(process.platform==='linux'){
 const os=await readFile('/etc/os-release','utf8');
 console.log(os.split('\n').find(line=>line.startsWith('PRETTY_NAME='))||'Linux distribution unknown');
 const policy=await readFile('/proc/sys/kernel/apparmor_restrict_unprivileged_userns','utf8').catch(()=> 'unavailable');
 console.log(`AppArmor unprivileged user namespaces restricted: ${policy.trim()}`);
}
const executable=resolveBrowserExecutable();
await access(executable,constants.X_OK);
const version=process.platform==='win32'
 ?spawnSync('powershell.exe',['-NoProfile','-Command','(Get-Item -LiteralPath $env:VUD_SMOKE_BROWSER).VersionInfo.ProductVersion'],{env:{...process.env,VUD_SMOKE_BROWSER:executable},encoding:'utf8',timeout:5000,windowsHide:true})
 :spawnSync(executable,['--version'],{encoding:'utf8',timeout:5000,windowsHide:true});
if(version.error||version.status!==0)throw new Error('Configured Chrome version check failed');
console.log(version.stdout.trim());
const browser=await browserSession();
try{
 const tab=await browser.tab();
 if(await tab.evaluate('1+1')!==2)throw new Error('DevTools evaluation failed');
}finally{await browser.close();}
try{await access(browser.profilePath);throw new Error('Temporary browser profile survived cleanup');}
catch(error){if(error.code!=='ENOENT')throw error;}
try{process.kill(browser.pid,0);throw new Error('Owned browser process survived cleanup');}
catch(error){if(error.code!=='ESRCH')throw error;}
console.log('Chrome/DevTools smoke passed; owned process and profile removed');
