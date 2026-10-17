// Small synthetic reproductions, not copies of any application's source.
export const experienceCases=[
 ['prose','INLINE_PROSE_FRAGMENTATION'],['space','CONTENT_SPACE_STARVATION'],['wrap','EXCESSIVE_CONTROL_WRAPPING'],['collision','TEXT_BADGE_COLLISION'],['density','MOBILE_CHROME_DENSITY']
];
export function experienceFixture(pattern,variant){
 const broken=variant==='broken',legitimate=variant==='legitimate';
 const prose='This sentence explains useful concepts in ordinary prose with enough words to require a comfortable reading area. '.repeat(15);
 let body='',css='';
 if(pattern==='prose'){
  body=legitimate?'<nav id="subject"><strong>Home</strong><code>Code</code><strong>Docs</strong></nav>':`<div id="subject">A sentence with ordinary words introduces <code>inline code</code> and continues with more ordinary prose before <strong>an emphasized phrase</strong> and concludes without changing paragraphs.</div>`;
  css=`#subject { ${broken||legitimate?'display:flex;flex-direction:column;':'display:block;'} width:300px; }`;
 }
 if(pattern==='space'){
  body=`<article id="subject">${legitimate?'A short summary.':prose}</article>`;
  css=`#subject { height:${broken||legitimate?70:360}px; overflow:auto; font-size:20px; line-height:26px; }`;
 }
 if(pattern==='wrap'){
  const tag=legitimate?'nav':'div';body=`<${tag} id="subject" ${legitimate?'aria-label="Grouped navigation"':'role="toolbar"'}>${Array.from({length:7},(_,i)=>`<button type="button">Action ${i}</button>`).join('')}</${tag}>`;
  // Explicit metrics keep 36px buttons below the detector's 2.5-line card exclusion.
  css=`#subject { display:flex;flex-flow:row wrap;gap:4px; width:${broken||legitimate?210:320}px; } #subject button { height:36px; width:${broken||legitimate?95:40}px; font-size:10px; line-height:16px; padding:0; }`;
 }
 if(pattern==='collision'){
  body=`<div id="subject"><span id="title">A very long readable title about important concepts</span><span id="badge" ${legitimate?'aria-hidden="true"':''}>5 min</span></div>`;
  css=`#subject { display:flex; width:300px; } #title { white-space:nowrap; ${broken||legitimate?'width:260px;flex-shrink:0;':'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;'} } #badge { position:relative;background:#eee;color:black; flex-shrink:0; width:80px; ${broken||legitimate?'margin-left:-60px;':''} }`;
 }
 if(pattern==='density'){
  body=`<header id="subject">${Array.from({length:3},(_,i)=>`<div><button type="button">Control ${i}</button></div>`).join('')}</header><article id="reader">${prose}</article>`;
  css=`header {height:${broken||legitimate?210:90}px;} header div {height:${broken||legitimate?70:30}px;} #reader {height:${broken?70:400}px;overflow:auto;font-size:20px;line-height:26px;}`;
 }
 return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Synthetic experience case</title><style>*{box-sizing:border-box}body{margin:0;color:black;background:white;font:16px/24px sans-serif}button{min-height:24px}${css}</style>${body}</html>`;
}
