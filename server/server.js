// ============================================================
// Stickman MMO — optional authoritative-lite multiplayer server.
// A thin relay: tracks connected players and broadcasts their
// movement/chat to everyone else. Combat & enemies are simulated
// client-side (each client runs its own world), so this stays a
// lightweight presence/positions server. Run: `node server.js`.
// ============================================================
import { WebSocketServer } from 'ws';
import http from 'http';

const PORT = process.env.PORT || 8080;

// Serve a tiny health page so you can confirm it's up in a browser.
const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`Stickman MMO server up. ${wss ? wss.clients.size : 0} client(s) connected.\n`);
});

const wss = new WebSocketServer({ server: httpServer });

let nextId = 1;
const players = new Map(); // ws -> { id, name, classId, x,y,z, facing, state, hp, level }

function broadcast(obj, exceptWs = null) {
  const data = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === 1 && client !== exceptWs) client.send(data);
  }
}

function snapshot(p) {
  return { id: p.id, name: p.name, classId: p.classId, x: p.x, y: p.y, z: p.z,
           facing: p.facing, state: p.state, hp: p.hp, level: p.level };
}

wss.on('connection', (ws) => {
  const id = nextId++;
  const p = { id, name: `Stick${id}`, classId: 'fighter', x: 0, y: 0, z: 6,
              facing: 0, state: 'ground', hp: 100, level: 1 };
  players.set(ws, p);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    switch (msg.type) {
      case 'join': {
        p.name = String(msg.name || `Stick${id}`).slice(0, 16);
        p.classId = String(msg.classId || 'fighter');
        // Send the newcomer the full roster, then announce them.
        const roster = [];
        for (const other of players.values()) roster.push(snapshot(other));
        ws.send(JSON.stringify({ type: 'welcome', id, players: roster }));
        broadcast({ type: 'spawn', player: snapshot(p) }, ws);
        console.log(`[+] ${p.name} (#${id}) joined — ${players.size} online`);
        break;
      }
      case 'state': {
        p.x = msg.x; p.y = msg.y; p.z = msg.z;
        p.facing = msg.facing; p.state = msg.state;
        p.hp = msg.hp; p.level = msg.level;
        broadcast({ type: 'state', id, x: p.x, y: p.y, z: p.z,
                    facing: p.facing, state: p.state, hp: p.hp, level: p.level }, ws);
        break;
      }
      case 'chat': {
        const text = String(msg.text || '').slice(0, 120);
        // Exclude the sender — the client already shows its own message locally.
        if (text) broadcast({ type: 'chat', id, name: p.name, text }, ws);
        break;
      }
      // ---- Party / grouping ----
      case 'party_invite': {
        const target = findByName(String(msg.targetName || ''));
        if (target && target !== ws) target.send(JSON.stringify({ type: 'party_invited', fromId: id, fromName: p.name }));
        break;
      }
      case 'party_accept': {
        const leader = findById(msg.leaderId);
        if (!leader) break;
        const lp = players.get(leader);
        const party = lp.party || new Set([leader]);
        party.add(leader); party.add(ws);
        for (const m of party) players.get(m).party = party;
        broadcastParty(party);
        break;
      }
      case 'party_leave': {
        leaveParty(ws);
        break;
      }
      // Relay shared kill XP / notable loot to the rest of the sender's party.
      case 'party_xp': {
        if (p.party) relayToParty(p.party, ws, { type: 'party_xp', amount: msg.amount || 0, fromName: p.name });
        break;
      }
      case 'party_loot': {
        if (p.party && msg.item) relayToParty(p.party, ws, { type: 'party_loot', item: msg.item, fromName: p.name });
        break;
      }
    }
  });

  ws.on('close', () => {
    leaveParty(ws);
    players.delete(ws);
    broadcast({ type: 'despawn', id });
    console.log(`[-] #${id} left — ${players.size} online`);
  });
});

function findByName(name) {
  for (const [ws, p] of players) if (p.name === name) return ws;
  return null;
}
function findById(pid) {
  for (const [ws, p] of players) if (p.id === pid) return ws;
  return null;
}
function broadcastParty(party) {
  const members = [...party].map((ws) => { const p = players.get(ws); return { id: p.id, name: p.name, classId: p.classId, level: p.level, hp: p.hp }; });
  const data = JSON.stringify({ type: 'party_update', members });
  for (const ws of party) if (ws.readyState === 1) ws.send(data);
}
function relayToParty(party, sender, data) {
  const json = JSON.stringify(data);
  for (const ws of party) if (ws !== sender && ws.readyState === 1) ws.send(json);
}
function leaveParty(ws) {
  const p = players.get(ws); if (!p || !p.party) return;
  const party = p.party; party.delete(ws); p.party = null;
  ws.readyState === 1 && ws.send(JSON.stringify({ type: 'party_update', members: [] }));
  if (party.size <= 1) { for (const m of party) { const mp = players.get(m); if (mp) mp.party = null; if (m.readyState === 1) m.send(JSON.stringify({ type: 'party_update', members: [] })); } }
  else broadcastParty(party);
}

httpServer.listen(PORT, () => {
  console.log(`Stickman MMO server listening on ws://localhost:${PORT}`);
});
