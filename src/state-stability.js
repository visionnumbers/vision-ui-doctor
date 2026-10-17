// Bounded observational polling: no animation cancellation or page style mutation.
export async function waitForStableGeometry({sample,stamp,timeoutMs,intervalMs=80,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 const start=now(),deadline=start+Math.max(0,timeoutMs);let last,value,samples=0,equal=0;
 do{
  value=await sample();samples++;const key=stamp(value);
  equal=key===last?equal+1:0;last=key;
  if(equal>=2&&!value.activeAnimations)return {stable:true,value,samples,elapsedMs:now()-start};
  const left=deadline-now();if(left<=0)break;await sleep(Math.min(intervalMs,left));
 }while(now()<deadline);
 return {stable:false,value,samples,elapsedMs:now()-start};
}
