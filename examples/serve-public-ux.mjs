// Synthetic fixture only. No authentication or application source modifications.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const files=new Map([['/',['index.html','text/html']],['/style.css',['style.css','text/css']],['/app.js',['app.js','text/javascript']]]);
const server=createServer(async(req,res)=>{
 const file=files.get(req.url.split('?')[0]);if(!file){res.writeHead(404);res.end();return;}
 try{const body=await readFile(new URL('../tests/fixtures/ux-project/'+file[0],import.meta.url));res.writeHead(200,{'content-type':file[1],'cache-control':'no-store'});res.end(body);}catch{res.writeHead(500);res.end('Fixture unavailable');}
});
server.listen(4173,'127.0.0.1',()=>console.log('Disposable UX fixture: http://127.0.0.1:4173/#/home; Ctrl+C to stop'));
process.once('SIGINT',()=>server.close());process.once('SIGTERM',()=>server.close());
