import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveBrowserExecutable} from '../src/browser-locator.js';

function fakeFiles(paths) {
  const available = new Set(paths);
  return path => available.has(path);
}

test('explicit browser path wins over environment and defaults', () => {
  const explicit = 'D:\\Browsers\\chrome.exe';
  assert.equal(resolveBrowserExecutable({
    explicit,
    env: {CHROMIUM_PATH: 'D:\\Env\\msedge.exe', ProgramFiles: 'C:\\Program Files'},
    platform: 'win32',
    isExecutable: fakeFiles([explicit, 'D:\\Env\\msedge.exe'])
  }), explicit);
});

test('CHROMIUM_PATH is the fallback after an omitted explicit path', () => {
  const configured = '/opt/team/chromium';
  assert.equal(resolveBrowserExecutable({
    env: {CHROMIUM_PATH: configured, PATH: '/usr/bin'},
    platform: 'linux',
    isExecutable: fakeFiles([configured, '/usr/bin/chromium'])
  }), configured);
});

test('finds Chrome or Edge in Windows install locations', () => {
  const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  assert.equal(resolveBrowserExecutable({
    env: {
      ProgramFiles: 'C:\\Program Files',
      'ProgramFiles(x86)': 'C:\\Program Files (x86)',
      LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local'
    },
    platform: 'win32',
    isExecutable: fakeFiles([edge])
  }), edge);
});

test('uses macOS and Linux known locations', () => {
  const chromeMac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  assert.equal(resolveBrowserExecutable({
    env: {},
    platform: 'darwin',
    isExecutable: fakeFiles([chromeMac])
  }), chromeMac);

  assert.equal(resolveBrowserExecutable({
    env: {PATH: ''},
    platform: 'linux',
    isExecutable: fakeFiles(['/usr/bin/chromium'])
  }), '/usr/bin/chromium');
});

test('searches PATH after platform install locations', () => {
  assert.equal(resolveBrowserExecutable({
    env: {PATH: '/custom/bin:/usr/local/bin'},
    platform: 'linux',
    isExecutable: fakeFiles(['/custom/bin/google-chrome'])
  }), '/custom/bin/google-chrome');
});

test('invalid explicit path fails without silently selecting another browser', () => {
  assert.throws(() => resolveBrowserExecutable({
    explicit: '/missing/chrome',
    env: {CHROMIUM_PATH: '/valid/env/chrome'},
    platform: 'linux',
    isExecutable: fakeFiles(['/valid/env/chrome'])
  }), error => error.code === 'BROWSER_NOT_FOUND' && /--chromium/.test(error.message));
});

test('missing browser error is actionable and platform-specific', () => {
  assert.throws(() => resolveBrowserExecutable({
    env: {PATH: ''},
    platform: 'linux',
    isExecutable: () => false
  }), error => error.code === 'BROWSER_NOT_FOUND'
    && /CHROMIUM_PATH/.test(error.message)
    && /--chromium/.test(error.message)
    && /linux/.test(error.message));
});
