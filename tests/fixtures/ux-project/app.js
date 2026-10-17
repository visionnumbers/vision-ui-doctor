const byId=id=>document.getElementById(id);
byId('open-panel').onclick=()=>{byId('panel').hidden=false;};
byId('close-panel').onclick=()=>{if(innerWidth>500)byId('panel').hidden=true;};
