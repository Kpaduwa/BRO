const http=require('http'), fs=require('fs'), path=require('path');
let DB_FILE='./db.json';
let db={users:{}, devices:{}, friends:{}, rooms:{}, queue:{solo:[],duo:[],squad:[]}, matches:{}};
try{ db=JSON.parse(fs.readFileSync(DB_FILE,'utf8')); }catch(e){}
function save(){ fs.writeFileSync(DB_FILE, JSON.stringify(db)); }
function hash(s){ let h=0; for(let i=0;i<s.length;i++){ h=(h*31 + s.charCodeAt(i))>>>0; } return 'D'+h.toString(16); }
setInterval(save, 5000);

http.createServer((req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS'); res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS'){ res.writeHead(200); return res.end(); }
  if(req.url.startsWith('/api/')){
    let body=''; req.on('data',d=>body+=d); req.on('end',()=>{
      let d={}; try{ d=JSON.parse(body||'{}'); }catch(e){}
      res.setHeader('Content-Type','application/json');
      if(req.url==='/api/register'){
        let u=(d.username||'').trim(); let pw=d.password||''; let dev=d.deviceId||'';
        if(!u||!pw) return res.end(JSON.stringify({error:'Username + Password needed'}));
        if(db.users[u]) return res.end(JSON.stringify({error:'Username don taken! Choose another'}));
        if(dev && db.devices[dev] && db.devices[dev]!==u) return res.end(JSON.stringify({error:'This phone don already create account: '+db.devices[dev]+'. Login with that account. You no fit create second account.'}));
        db.users[u]={password:pw, kills:0, wins:0, matches:0, gunKills:{smg:0,shotgun:0,pistol:0}, skin:1, deviceId:dev, created:Date.now(), lastSeen:Date.now(), online:true};
        if(dev) db.devices[dev]=u;
        db.friends[u]=[];
        save(); return res.end(JSON.stringify({ok:true, username:u}));
      }
      if(req.url==='/api/login'){
        let u=d.username, pw=d.password;
        if(!db.users[u] || db.users[u].password!==pw) return res.end(JSON.stringify({error:'Wrong username or password'}));
        db.users[u].online=true; db.users[u].lastSeen=Date.now(); save();
        return res.end(JSON.stringify({ok:true, username:u, user:db.users[u]}));
      }
      if(req.url==='/api/search'){
        let q=(d.q||'').toLowerCase(); let out=[];
        for(let name in db.users){ if(name.toLowerCase().includes(q)) out.push({name, kills:db.users[name].kills, wins:db.users[name].wins, gunKills:db.users[name].gunKills, skin:db.users[name].skin, online:db.users[name].online}); }
        return res.end(JSON.stringify({results:out}));
      }
      if(req.url==='/api/leaderboard'){
        let all=Object.entries(db.users).map(([name,u])=>({name, kills:u.kills, wins:u.wins, gunKills:u.gunKills}));
        all.sort((a,b)=>b.kills-a.kills);
        let byGun={smg:[...all].sort((a,b)=>b.gunKills.smg-a.gunKills.smg).slice(0,10), shotgun:[...all].sort((a,b)=>b.gunKills.shotgun-a.gunKills.shotgun).slice(0,10), pistol:[...all].sort((a,b)=>b.gunKills.pistol-a.gunKills.pistol).slice(0,10)};
        return res.end(JSON.stringify({top10:all.slice(0,10), byGun}));
      }
      if(req.url==='/api/friends/add'){
        if(!db.users[d.me]||!db.users[d.friend]) return res.end(JSON.stringify({error:'User not found'}));
        if(!db.friends[d.me].includes(d.friend)) db.friends[d.me].push(d.friend);
        save(); return res.end(JSON.stringify({ok:true}));
      }
      if(req.url==='/api/friends/list'){
        let list=(db.friends[d.me]||[]).map(n=>({name:n, online:db.users[n]?db.users[n].online:false, kills:db.users[n]?db.users[n].kills:0}));
        return res.end(JSON.stringify({friends:list}));
      }
      if(req.url==='/api/heartbeat'){
        if(db.users[d.username]){ db.users[d.username].online=true; db.users[d.username].lastSeen=Date.now(); }
        return res.end(JSON.stringify({ok:true}));
      }
      if(req.url==='/api/queue/join'){
        let mode=d.mode;
        if(!db.queue[mode].includes(d.username)) db.queue[mode].push(d.username);
        return res.end(JSON.stringify({ok:true, inQueue:db.queue[mode].length}));
      }
      if(req.url==='/api/queue/status'){
        let mode=d.mode; let count=db.queue[mode].length;
        let players=[...db.queue[mode]];
        return res.end(JSON.stringify({count, started:count>=2, players}));
      }
      if(req.url==='/api/rooms/list'){
        let list=Object.entries(db.rooms).map(([code,r])=>({code, mode:r.mode, players:r.players, max:r.max}));
        return res.end(JSON.stringify({rooms:list}));
      }
      if(req.url==='/api/rooms/create'){
        let code=Math.floor(1000+Math.random()*9000).toString();
        let max = d.mode==='solo'?30 : d.mode==='duo'?4 : 8;
        db.rooms[code]={mode:d.mode, players:[d.username], max, created:Date.now()};
        save(); return res.end(JSON.stringify({code, room:db.rooms[code]}));
      }
      if(req.url==='/api/rooms/join'){
        let r=db.rooms[d.code]; if(!r) return res.end(JSON.stringify({error:'Room not found'}));
        if(r.players.length>=r.max) return res.end(JSON.stringify({error:'Room full'}));
        if(!r.players.includes(d.username)) r.players.push(d.username);
        save(); return res.end(JSON.stringify({ok:true, room:r}));
      }
      if(req.url==='/api/updateStats'){
        if(db.users[d.username]){ db.users[d.username].kills+=d.kills||0; db.users[d.username].wins+=d.wins||0; db.users[d.username].matches+=1; if(d.gun){ db.users[d.username].gunKills[d.gun]+=d.kills||0; } save(); }
        return res.end(JSON.stringify({ok:true}));
      }
      return res.end(JSON.stringify({error:'unknown'}));
    }); return;
  }
  let file=req.url==='/'?'/public/index.html':req.url; let full=path.join(__dirname,file);
  fs.readFile(full,(e,data)=>{ if(e){ res.writeHead(404); return res.end('Not found'); } res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); res.end(data); });
}).listen(process.env.PORT || 8000,'0.0.0.0',()=>console.log('BRO ONLINE READY'));
