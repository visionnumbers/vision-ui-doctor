// For maintainers: generate a controlled test report without navigating an external site.
import {readFile} from 'node:fs/promises';
import {audit} from '../src/audit.js';
const html=await readFile(new URL('./buggy.html',import.meta.url),'utf8');
const report=await audit({url:'http://127.0.0.1:4173/',fixtureHtml:html,viewports:['small','mobile','tablet','desktop'],out:'examples/sample-report',chromium:process.env.CHROMIUM_PATH||'chromium',waitMs:100});
console.log('Sample report:',report.summary);
