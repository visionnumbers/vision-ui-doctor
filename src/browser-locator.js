import {accessSync, constants} from 'node:fs';
import {posix, win32} from 'node:path';

const COMMANDS = {
  win32: ['chrome', 'msedge', 'chromium'],
  darwin: ['google-chrome', 'microsoft-edge', 'chromium'],
  linux: ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']
};

export class BrowserNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BrowserNotFoundError';
    this.code = 'BROWSER_NOT_FOUND';
  }
}

function defaultIsExecutable(file) {
  try {
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function envValue(env, name, platform) {
  if (platform !== 'win32') return env[name];
  const key = Object.keys(env).find(candidate => candidate.toLowerCase() === name.toLowerCase());
  return key ? env[key] : undefined;
}

function knownLocations(platform, env) {
  if (platform === 'win32') {
    const path = win32;
    const programFiles = envValue(env, 'ProgramFiles', platform);
    const programFilesX86 = envValue(env, 'ProgramFiles(x86)', platform);
    const localAppData = envValue(env, 'LOCALAPPDATA', platform);
    return [
      programFiles && path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      programFiles && path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      programFilesX86 && path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      programFilesX86 && path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      localAppData && path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      localAppData && path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      localAppData && path.join(localAppData, 'Chromium', 'Application', 'chrome.exe')
    ].filter(Boolean);
  }
  if (platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    ];
  }
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    '/usr/local/bin/google-chrome',
    '/usr/local/bin/chromium'
  ];
}

function pathMatches(command, {env, platform, isExecutable}) {
  const pathValue = envValue(env, 'PATH', platform) || '';
  const directories = pathValue.split(platform === 'win32' ? ';' : ':').filter(Boolean);
  const extensions = platform === 'win32'
    ? (envValue(env, 'PATHEXT', platform) || '.EXE;.CMD;.BAT;.COM').split(';')
    : [''];
  const path = platform === 'win32' ? win32 : posix;
  const hasExtension = platform === 'win32' && /\.[^\\/]+$/.test(command);
  const suffixes = hasExtension ? [''] : extensions;
  for (const directory of directories) {
    for (const suffix of suffixes) {
      const candidate = path.join(directory, command + suffix.toLowerCase());
      if (isExecutable(candidate)) return candidate;
    }
  }
  return null;
}

function configuredPath(value, source, options) {
  if (!value) return null;
  if (options.isExecutable(value)) return value;
  if (!/[\\/]/.test(value)) {
    const match = pathMatches(value, options);
    if (match) return match;
  }
  throw new BrowserNotFoundError(
    `${source} does not point to an executable browser. Supply a valid Chrome, Edge, or Chromium executable with --chromium or CHROMIUM_PATH.`
  );
}

export function resolveBrowserExecutable({
  explicit,
  env = process.env,
  platform = process.platform,
  isExecutable = defaultIsExecutable
} = {}) {
  const options = {env, platform, isExecutable};
  const selected = configuredPath(explicit, '--chromium', options);
  if (selected) return selected;

  const environmentPath = envValue(env, 'CHROMIUM_PATH', platform);
  const configured = configuredPath(environmentPath, 'CHROMIUM_PATH', options);
  if (configured) return configured;

  for (const candidate of knownLocations(platform, env)) {
    if (isExecutable(candidate)) return candidate;
  }
  for (const command of COMMANDS[platform] || COMMANDS.linux) {
    const candidate = pathMatches(command, options);
    if (candidate) return candidate;
  }

  throw new BrowserNotFoundError(
    `No supported browser executable was found on ${platform}. Install Chrome, Edge, or Chromium, set CHROMIUM_PATH, or pass --chromium with the executable path.`
  );
}
