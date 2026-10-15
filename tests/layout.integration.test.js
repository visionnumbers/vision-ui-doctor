import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {audit} from '../src/audit.js';

const chromium=process.env.CHROMIUM_PATH||'chromium';
const viewports=['small','mobile','tablet','laptop','desktop'];

test('classifies rendered layout cases across all supported widths',async t=>{
 const fixture=await readFile(new URL('./fixtures/layout-cases.html',import.meta.url),'utf8');
 const output=await mkdtemp(join(tmpdir(),'ui-doctor-layout-'));t.after(()=>rm(output,{recursive:true,force:true}));
 const report=await audit({url:'http://127.0.0.1:4173/',routes:['/layout'],viewports,out:output,chromium,waitMs:0,screenshots:false,fixtureHtml:fixture});
 assert.equal(report.schemaVersion,3);
 assert.equal(report.pages.length,5);
 for(const page of report.pages){
  assert.ok(page.issues.some(issue=>issue.category==='DOCUMENT_OVERFLOW'));
  assert.ok(page.issues.some(issue=>issue.category==='INTERACTIVE_ELEMENT_CLIPPED'&&issue.selector==='#clipped-submit'));
  assert.ok(page.issues.some(issue=>issue.category==='ELEMENT_OVERFLOW'&&issue.selector==='#modal'));
  assert.equal(page.issues.some(issue=>issue.selector==='#mobile-drawer'),false);
  assert.equal(page.issues.some(issue=>issue.selector==='#sticky'),false);
  if(['small','mobile','tablet'].includes(page.viewport)){
   assert.ok(page.diagnostics.some(issue=>issue.category==='INTENTIONAL_SCROLL_REGION'&&issue.selector==='#code-scroll'));
   assert.ok(page.diagnostics.some(issue=>issue.category==='INTENTIONAL_SCROLL_REGION'&&issue.selector==='#table-scroll'));
  }
  for(const finding of [...page.issues,...page.diagnostics]){
   assert.match(finding.id,/^vud-[a-f0-9]{16}$/);
   assert.equal(finding.route,'/layout');
   assert.equal(finding.viewport,page.viewport);
   assert.ok(finding.confidence);
   assert.ok(finding.evidence);
   if(['ELEMENT_OVERFLOW','CONTENT_CLIPPED','INTERACTIVE_ELEMENT_CLIPPED','INTENTIONAL_SCROLL_REGION'].includes(finding.category))assert.ok(finding.evidence.rect);
   assert.ok(finding.explanation);
   assert.ok(finding.suggestion);
  }
 }
 const mobile=report.pages.find(page=>page.viewport==='small');
 assert.ok(mobile.issues.some(issue=>issue.selector==='#editor-surface'));
 assert.ok(mobile.issues.some(issue=>issue.selector==='#long-url'&&issue.evidence.cause==='long-unbroken-content'));
 assert.ok(mobile.issues.some(issue=>issue.selector==='#grid-child'&&issue.evidence.cause==='grid-min-content'));
 assert.ok(mobile.issues.some(issue=>issue.selector==='#transformed'&&issue.confidence==='low'));
 assert.equal(report.summary.totalIssues,report.pages.reduce((sum,page)=>sum+page.issues.length,0));
 assert.equal(report.summary.diagnostics,report.pages.reduce((sum,page)=>sum+page.diagnostics.length,0));
});
