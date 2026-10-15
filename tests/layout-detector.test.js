import test from 'node:test';
import assert from 'node:assert/strict';
import {LAYOUT_CATEGORY,classifyDocumentLayout,classifyElementLayout,findingId} from '../src/detectors/layout.js';

const viewport={width:320,height:700};
const base={selector:'#subject',rect:{left:0,top:20,right:200,bottom:80,width:200,height:60},viewport,interactive:false,decorative:false,inactive:false,position:'static',transform:'none',overflowPx:{left:0,right:0,top:0,bottom:0},scrollAncestor:null,clipAncestor:null,parentDisplay:'block',minWidth:'auto',longUnbrokenText:false};
const classify=overrides=>classifyElementLayout({...base,...overrides});

test('classifies genuine root document overflow as high severity',()=>{
 const findings=classifyDocumentLayout({viewportWidth:320,documentWidth:2000,tolerance:2});
 assert.equal(findings[0].category,LAYOUT_CATEGORY.DOCUMENT_OVERFLOW);
 assert.equal(findings[0].severity,'high');
 assert.equal(findings[0].confidence,'high');
});

test('classifies visible content clipped by overflow hidden without claiming document overflow',()=>{
 const findings=classify({rect:{left:0,top:20,right:2000,bottom:80,width:2000,height:60},clipAncestor:{selector:'#clip',overflowX:'hidden',overflowY:'hidden',rect:{left:0,top:0,right:180,bottom:100,width:180,height:100}}});
 assert.equal(findings[0].category,LAYOUT_CATEGORY.CONTENT_CLIPPED);
 assert.equal(findings[0].severity,'medium');
});

test('treats scrollable code blocks and responsive tables as diagnostics',()=>{
 for(const selector of ['#code-scroll','#table-scroll']){
  const findings=classify({selector,scrollAncestor:{selector,axis:'horizontal',overflowX:'auto',overflowY:'visible',clientWidth:280,scrollWidth:900}});
  assert.equal(findings[0].category,LAYOUT_CATEGORY.INTENTIONAL_SCROLL_REGION);
  assert.equal(findings[0].diagnostic,true);
  assert.equal(findings[0].severity,'info');
 }
});

test('classifies a clipped submit control as a high-confidence interactive defect',()=>{
 const findings=classify({interactive:true,clipAncestor:{selector:'#form-clip',overflowX:'hidden',overflowY:'hidden',rect:{left:0,top:0,right:160,bottom:100,width:160,height:100}}});
 assert.equal(findings[0].category,LAYOUT_CATEGORY.INTERACTIVE_ELEMENT_CLIPPED);
 assert.equal(findings[0].severity,'high');
 assert.equal(findings[0].confidence,'high');
});

test('classifies framework-independent editor overflow as element overflow',()=>{
 const findings=classify({selector:'#editor-surface',rect:{left:0,top:20,right:620,bottom:300,width:620,height:280},overflowPx:{left:0,right:300,top:0,bottom:0}});
 assert.equal(findings[0].category,LAYOUT_CATEGORY.ELEMENT_OVERFLOW);
 assert.equal(findings[0].severity,'medium');
});

test('ignores inactive drawers and deliberately hidden decorative content',()=>{
 assert.deepEqual(classify({inactive:true,interactive:true,transform:'matrix(1,0,0,1,-320,0)',overflowPx:{left:320,right:0,top:0,bottom:0}}),[]);
 assert.deepEqual(classify({decorative:true,clipAncestor:{selector:'#decorative-mask'}}),[]);
});

test('does not flag a correctly positioned sticky header',()=>{
 assert.deepEqual(classify({selector:'#sticky',position:'sticky'}),[]);
});

test('keeps partially offscreen fixed modal defects',()=>{
 const findings=classify({selector:'#modal',interactive:true,position:'fixed',rect:{left:200,top:30,right:440,bottom:400,width:240,height:370},overflowPx:{left:0,right:120,top:0,bottom:0}});
 assert.equal(findings[0].category,LAYOUT_CATEGORY.ELEMENT_OVERFLOW);
 assert.equal(findings[0].severity,'high');
});

test('identifies long unbroken flex content and grid min-content pressure',()=>{
 const flex=classify({selector:'#long-url',parentDisplay:'flex',longUnbrokenText:true,overflowPx:{left:0,right:180,top:0,bottom:0}})[0];
 const grid=classify({selector:'#grid-child',parentDisplay:'grid',minWidth:'600px',overflowPx:{left:0,right:280,top:0,bottom:0}})[0];
 assert.equal(flex.evidence.cause,'long-unbroken-content');
 assert.equal(grid.evidence.cause,'grid-min-content');
});

test('keeps transformed overflow as low-confidence evidence instead of suppressing it',()=>{
 const finding=classify({selector:'#transformed',transform:'matrix(1,0,0,1,180,0)',overflowPx:{left:0,right:80,top:0,bottom:0}})[0];
 assert.equal(finding.category,LAYOUT_CATEGORY.ELEMENT_OVERFLOW);
 assert.equal(finding.severity,'low');
 assert.equal(finding.confidence,'low');
});

test('stable finding IDs vary by route or viewport but not evidence wording',()=>{
 const first=findingId({category:'ELEMENT_OVERFLOW',route:'/app',viewport:'mobile',selector:'#subject'});
 assert.equal(first,findingId({category:'ELEMENT_OVERFLOW',route:'/app',viewport:'mobile',selector:'#subject',detail:'changed'}));
 assert.notEqual(first,findingId({category:'ELEMENT_OVERFLOW',route:'/app',viewport:'tablet',selector:'#subject'}));
 assert.match(first,/^vud-[a-f0-9]{16}$/);
});
