import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyElementLayout} from '../src/detectors/layout.js';
import {detectUsability,contrastRatio} from '../src/detectors/usability.js';
import {waitForStableGeometry} from '../src/state-stability.js';

test('scroll intent never masks an inner clip or overflow on an unprotected axis',()=>{
 const item={selector:'#control',interactive:true,scrollAncestor:{selector:'#editor',axis:'horizontal',protectsOverflow:true},clipAncestor:{selector:'#clip',rect:{width:40,height:40}}};
 assert.equal(classifyElementLayout(item)[0].category,'INTERACTIVE_ELEMENT_CLIPPED');
 const cross={selector:'#wide',scrollAncestor:{selector:'#vertical',axis:'vertical',protectsOverflow:false},rect:{right:900},viewport:{width:320},overflowPx:{right:580}};
 assert.equal(classifyElementLayout(cross)[0].category,'ELEMENT_OVERFLOW');
 assert.equal(classifyElementLayout({...cross,scrollAncestor:{...cross.scrollAncestor,protectsOverflow:true}})[0].diagnostic,true);
 const mirror={...item,interactive:false,clipAncestor:{...item.clipAncestor,presentation:{kind:'paired-textarea-mirror'}}};
 assert.equal(classifyElementLayout(mirror)[0].classification,'intentional-candidate');assert.equal(classifyElementLayout(mirror)[0].originalCategory,'CONTENT_CLIPPED');
 assert.equal(classifyElementLayout({...mirror,interactive:true})[0].category,'INTERACTIVE_ELEMENT_CLIPPED','interactive children are never hidden by mirror classification');
});
test('contrast/text/forms/control families return evidence, valid counterexamples and explicit unsupported counts',()=>{
 assert.equal(contrastRatio([0,0,0],[255,255,255]),21);
 const base={selector:'#x',visible:true,rect:{width:16,height:16},text:{hasText:true,clipped:true,ellipsis:false,lineClamp:false},contrast:{foreground:[180,180,180],background:[255,255,255],threshold:4.5},form:{needsLabel:true,labeled:false},control:{enabled:true,nearestDistance:16,inline:false,keyboardMissing:true}};
 const result=detectUsability({elements:[base],truncated:false});
 for(const category of ['TEXT_CONTENT_CLIPPED','LOW_TEXT_CONTRAST','FORM_LABEL_MISSING','SMALL_CROWDED_TARGET','CONTROL_NOT_KEYBOARD_REACHABLE'])assert.ok(result.issues.some(i=>i.category===category),category);
 const valid={...base,text:{...base.text,ellipsis:true},contrast:{foreground:[0,0,0],background:[255,255,255],threshold:4.5},form:{needsLabel:true,labeled:true},control:{enabled:true,nearestDistance:48,inline:false,keyboardMissing:false}};
 assert.equal(detectUsability({elements:[valid]}).issues.length,0);
 assert.ok(detectUsability({elements:[{...valid,contrast:{unsupported:'complex-paint'}}]}).coverage.unsupportedContrast>0);
});
test('stabilization waits through a legitimate transition, requires repeated stable samples and bounds endless motion',async()=>{
 let time=0,index=0;const values=[0,10,20,30,30,30];
 const result=await waitForStableGeometry({sample:async()=>({x:values[Math.min(index++,values.length-1)],activeAnimations:index<4}),stamp:v=>v.x,now:()=>time,sleep:async ms=>{time+=ms;},timeoutMs:1200,intervalMs:100});
 assert.equal(result.stable,true);assert.ok(result.samples>=6);
 index=0;time=0;const endless=await waitForStableGeometry({sample:async()=>({x:index++,activeAnimations:true}),stamp:v=>v.x,now:()=>time,sleep:async ms=>{time+=ms;},timeoutMs:500,intervalMs:100});
 assert.equal(endless.stable,false);assert.ok(time<=500);
});
