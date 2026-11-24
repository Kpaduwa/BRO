const http=require('http'), fs=require('fs'), path=require('path');
let DB_FILE='./db.json';
let db={users:{}, devices:{}, friends:{}, rooms:{}, queue:{solo:[],duo:[],squad:[]}, bots:{}, invites:{}, parties:{}};
try{ db=JSON.parse(fs.readFileSync(DB_FILE,'utf8')); if(!db.bots) db.bots={}; if(!db.invites) db.invites={}; if(!db.parties) db.parties={}; if(!db.queue) db.queue={solo:[],duo:[],squad:[]}; }catch(e){}
function save(){ try{ fs.writeFileSync(DB_FILE, JSON.stringify(db)); }catch(e){} }
setInterval(save, 5000);
const CAP={solo:30,duo:30,squad:32};
http.createServer((req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS'); res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS'){ res.writeHead(200); return res.end(); }
  if(req.url.startsWith('/api/')){
    let body=''; req.on('data',d=>body+=d); req.on('end',()=>{
      let d={}; try{ d=JSON.parse(body||'{}'); }catch(e){}
      res.setHeader('Content-Type','application/json');
      if(req.url==='/api/register'){
        let u=(d.username||'').trim(); let pw=d.password||''; let dev=d.deviceId||'';
        if(!u||!pw) return res.end(JSON.stringify({error:'Username and password are required'}));
        if(db.users[u]) return res.end(JSON.stringify({error:'Username is already taken. Please choose another.'}));
        if(dev && db.devices[dev] && db.devices[dev]!==u) return res.end(JSON.stringify({error:'This device already created an account: '+db.devices[dev]+'. Please log in with that account.'}));
        db.users[u]={password:pw,kills:0,wins:0,matches:0,gunKills:{smg:0,shotgun:0,pistol:0},skin:1,deviceId:dev,created:Date.now(),lastSeen:Date.now(),online:true};
        if(dev) db.devices[dev]=u;
        db.friends[u]=[]; db.parties[u]=[u];
        save(); return res.end(JSON.stringify({ok:true,username:u}));
      }
      if(req.url==='/api/login'){
        let u=d.username, pw=d.password;
        if(!db.users[u] || db.users[u].password!==pw) return res.end(JSON.stringify({error:'Incorrect username or password'}));
        db.users[u].online=true; db.users[u].lastSeen=Date.now(); if(!db.parties[u]) db.parties[u]=[u];
        save(); return res.end(JSON.stringify({ok:true,username:u,user:db.users[u]}));
      }
      if(req.url==='/api/checkDevice'){ return res.end(JSON.stringify({hasAccount: !!(d.deviceId && db.devices[d.deviceId]), username: d.deviceId ? (db.devices[d.deviceId]||'') : ''})); }
      if(req.url==='/api/search'){
        let q=(d.q||'').toLowerCase(); let out=[];
        for(let name in db.users){ if(name.toLowerCase().includes(q)) out.push({name,kills:db.users[name].kills,wins:db.users[name].wins,gunKills:db.users[name].gunKills,skin:db.users[name].skin,online:db.users[name].online}); }
        return res.end(JSON.stringify({results:out}));
      }
      if(req.url==='/api/leaderboard'){
        let all=Object.entries(db.users).map(([name,u])=>({name,kills:u.kills,wins:u.wins,gunKills:u.gunKills,isBot:false}));
        let bots=Object.entries(db.bots||{}).map(([name,b])=>({name,kills:b.kills,wins:b.wins||0,gunKills:b.gunKills||{smg:0,shotgun:0,pistol:0},isBot:true}));
        let merged=[...all,...bots]; merged.sort((a,b)=>b.kills-a.kills);
        let byGun={smg:[...merged].sort((a,b)=>b.gunKills.smg-a.gunKills.smg).slice(0,10),shotgun:[...merged].sort((a,b)=>b.gunKills.shotgun-a.gunKills.shotgun).slice(0,10),pistol:[...merged].sort((a,b)=>b.gunKills.pistol-a.gunKills.pistol).slice(0,10)};
        return res.end(JSON.stringify({top10:merged.slice(0,10),byGun}));
      }
      if(req.url==='/api/friends/add'){ if(!db.users[d.me]||!db.users[d.friend]) return res.end(JSON.stringify({error:'User not found'})); if(!db.friends[d.me].includes(d.friend)) db.friends[d.me].push(d.friend); save(); return res.end(JSON.stringify({ok:true})); }
      if(req.url==='/api/friends/list'){ let list=(db.friends[d.me]||[]).map(n=>({name:n,online:db.users[n]?db.users[n].online:false,kills:db.users[n]?db.users[n].kills:0})); return res.end(JSON.stringify({friends:list})); }
      if(req.url==='/api/heartbeat'){ if(db.users[d.username]){ db.users[d.username].online=true; db.users[d.username].lastSeen=Date.now(); } return res.end(JSON.stringify({ok:true})); }
      if(req.url==='/api/party/get'){ return res.end(JSON.stringify({party:db.parties[d.username]||[d.username]})); }
      if(req.url==='/api/invite/send'){
        if(!db.users[d.to]) return res.end(JSON.stringify({error:'User not found'}));
        let party=db.parties[d.from]||[d.from];
        if(party.length>=4) return res.end(JSON.stringify({error:'Party is full (4/4). You cannot invite more.'}));
        let id='INV'+Date.now()+Math.floor(Math.random()*999);
        db.invites[id]={id,from:d.from,to:d.to,created:Date.now()};
        save(); return res.end(JSON.stringify({ok:true,id}));
      }
      if(req.url==='/api/invite/list'){ let list=Object.values(db.invites||{}).filter(x=>x.to===d.username); return res.end(JSON.stringify({invites:list})); }
      if(req.url==='/api/invite/respond'){
        let inv=db.invites[d.id]; if(!inv) return res.end(JSON.stringify({error:'Invite expired'}));
        delete db.invites[d.id];
        if(d.accept){ let party=db.parties[inv.from]||[inv.from]; if(party.length>=4) return res.end(JSON.stringify({error:'Party is full'})); if(!party.includes(inv.to)) party.push(inv.to); db.parties[inv.from]=party; db.parties[inv.to]=party; }
        save(); return res.end(JSON.stringify({ok:true}));
      }
      if(req.url==='/api/queue/join'){ let mode=d.mode; let cap=CAP[mode]||30; if(db.queue[mode].length>=cap) return res.end(JSON.stringify({error:'This mode is full ('+cap+' players). Please try again.',full:true})); if(!db.queue[mode].includes(d.username)) db.queue[mode].push(d.username); return res.end(JSON.stringify({ok:true})); }
      if(req.url==='/api/queue/status'){ return res.end(JSON.stringify({players:[...db.queue[d.mode]]})); }
      if(req.url==='/api/rooms/list'){ let list=Object.entries(db.rooms).map(([code,r])=>({code,mode:r.mode,players:r.players,max:r.max})); return res.end(JSON.stringify({rooms:list})); }
      if(req.url==='/api/rooms/create'){ let code=Math.floor(1000+Math.random()*9000).toString(); let max=d.mode==='solo'?30:d.mode==='duo'?30:32; db.rooms[code]={mode:d.mode,players:[d.username],max,created:Date.now()}; save(); return res.end(JSON.stringify({code,room:db.rooms[code]})); }
      if(req.url==='/api/rooms/join'){ let r=db.rooms[d.code]; if(!r) return res.end(JSON.stringify({error:'Room not found'})); if(r.players.length>=r.max) return res.end(JSON.stringify({error:'Room is full ('+r.max+' players)'})); if(!r.players.includes(d.username)) r.players.push(d.username); save(); return res.end(JSON.stringify({ok:true,room:r})); }
      if(req.url==='/api/updateStats'){
        if(db.users[d.username]){ db.users[d.username].kills+=d.kills||0; db.users[d.username].wins+=d.wins||0; db.users[d.username].matches+=1; if(d.gun){ db.users[d.username].gunKills[d.gun]+=d.kills||0; } }
        if(d.bots && Array.isArray(d.bots)){ d.bots.forEach(b=>{ if(!db.bots[b.name]) db.bots[b.name]={kills:0,wins:0,matches:0,gunKills:{smg:0,shotgun:0,pistol:0}}; db.bots[b.name].kills+=b.kills||0; db.bots[b.name].matches+=1; db.bots[b.name].wins+=b.wins||0; if(b.gun) db.bots[b.name].gunKills[b.gun]+=b.kills||0; }); }
        save(); return res.end(JSON.stringify({ok:true}));
      }
      return res.end(JSON.stringify({error:'unknown'}));
    }); return;
  }
  let file=req.url==='/'?'/index.html':req.url; let full=path.join(__dirname,file);
  fs.readFile(full,(e,data)=>{ if(e){ res.writeHead(404); return res.end('Not found'); } res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); res.end(data); });
}).listen(process.env.PORT || 8000,'0.0.0.0',()=>console.log('BRO ONLINE READY'));
