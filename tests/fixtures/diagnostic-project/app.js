const panel=document.getElementById('panel');
document.getElementById('open-panel').onclick=()=>{panel.hidden=false;requestAnimationFrame(()=>requestAnimationFrame(()=>panel.classList.add('open')));};
document.getElementById('close-panel').onclick=()=>{panel.classList.remove('open');setTimeout(()=>{panel.hidden=true;},800);};
