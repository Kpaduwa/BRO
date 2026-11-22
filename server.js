const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req,res)=>{
  let file = req.url === '/' ? '/game.html' : req.url;
  let filePath = path.join(__dirname, file);
  fs.readFile(filePath, (err,data)=>{
    if(err){ res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {'Content-Type':'text/html'});
    res.end(data);
  });
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, ()=> console.log('BRO running on '+PORT));
