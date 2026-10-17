const byId=id=>document.getElementById(id);
byId('open-menu').onclick=()=>{byId('sidebar').hidden=false;};
byId('close-menu').onclick=()=>{byId('sidebar').hidden=true;};
function route(){const dashboard=location.hash==='#/dashboard';byId('home').hidden=dashboard;byId('dashboard').hidden=!dashboard;}
addEventListener('hashchange',route);route();
for(const name of ['summary','details'])byId(name+'-tab').onclick=()=>{
 for(const panel of ['summary','details']){byId(panel+'-panel').hidden=panel!==name;byId(panel+'-tab').setAttribute('aria-selected',String(panel===name));}
};
