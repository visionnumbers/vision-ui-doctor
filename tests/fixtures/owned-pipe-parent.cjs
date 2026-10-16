// Controlled test-only tree. The holder self-expires even if the test crashes.
const {spawn}=require('node:child_process');
const net=require('node:net');
const [, ,mode,port]=process.argv;
setTimeout(()=>process.exit(2),10000);
if(mode==='holder'){
 const socket=net.createConnection({host:'127.0.0.1',port:Number(port)},()=>process.send?.('ready'));
 socket.on('data',()=>process.exit(0));socket.on('end',()=>process.exit(0));socket.on('error',()=>process.exit(2));
}else{
 const holder=spawn(process.execPath,[__filename,'holder',port],{stdio:['ignore','ignore',2,'ipc'],windowsHide:true,detached:true});
 holder.on('message',()=>process.send?.('ready'));
 holder.on('error',()=>process.exit(2));
 process.on('message',()=>process.exit(0));
}
