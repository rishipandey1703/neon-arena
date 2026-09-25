const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT || 3000);
const ROOT = path.join(__dirname, 'public');
const rooms = new Map();
const rounds = [
  { id: 'FLASH', title: 'Flash', icon: '✦', how: 'Wait for the arena to light up, then tap the target as fast as you can. Early taps do not count.', detail: 'Fastest hit earns 100 pts · next hit 70 · every other hit 45', seconds: 9 },
  { id: 'MEMORY', title: 'Memory grid', icon: '▦', how: 'Watch the tiles light up in order. When they vanish, repeat the sequence from the first tile to the last.', detail: 'Each correct tile earns 25 pts · the sequence gets longer as you score', seconds: 18 },
  { id: 'DECOY', title: 'Decoy', icon: '◈', how: 'Read the rule above the choices. Find the one symbol that breaks it. One choice only.', detail: 'Correct answer: 100 pts · wrong answer: 0 pts', seconds: 12 },
  { id: 'RISK', title: 'Risk', icon: '⚡', how: 'Pick your play. Safe gives guaranteed points. Risky gives a bigger reward for a lucky call, but costs points if the arena rejects you.', detail: 'Safe: +40 pts · risky: +100 pts if right or −30 pts if wrong', seconds: 10 },
  { id: 'CHAOS', title: 'Chaos finale', icon: '✹', how: 'Tap as many targets as you can before the clock runs out. Every hit is worth 20 points, doubled in the finale.', detail: '20 pts per hit × 2 finale multiplier', seconds: 12 }
];

const now = () => Date.now();
const cleanName = s => String(s || '').trim().replace(/\s+/g, ' ').slice(0, 18);
const rand = n => crypto.randomInt(n);
function uniqueCode() { const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let code; do { code = Array.from({ length: 5 }, () => chars[rand(chars.length)]).join(''); } while (rooms.has(code)); return code; }
function send(ws, type, data = {}) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, ...data })); }
function broadcast(room, type = 'state') { const payload = JSON.stringify({ type, state: publicState(room) }); for (const p of room.players.values()) if (p.ws?.readyState === WebSocket.OPEN) p.ws.send(payload); }
function publicState(r) {
  const current = r.round >= 0 ? rounds[r.round] : null;
  const remaining = r.phase === 'play' || r.phase === 'countdown' ? Math.max(0, Math.ceil((r.deadline - now()) / 1000)) : 0;
  let visibleChallenge = r.phase === 'play' ? r.challenge : null;
  if (visibleChallenge) { visibleChallenge = { ...visibleChallenge }; delete visibleChallenge.answer; delete visibleChallenge.riskyWin; }
  return { code: r.code, phase: r.phase, host: r.host, players: [...r.players.values()].map(p => ({ id: p.id, name: p.name, online: !!p.ws, score: p.score, ready: p.ready, answered: !!p.answer, hits: p.hits || 0 })), minPlayers: 2, round: r.round, totalRounds: rounds.length, roundInfo: current ? { ...current, duration: current.seconds, seconds: remaining, index: r.round + 1 } : null, challenge: visibleChallenge, deadline: r.deadline, results: r.results, winner: r.winner };
}
function challengeFor(index) {
  if (index === 0) return { target: ['✦', '◆', '⬟', '☼'][rand(4)] };
  if (index === 1) { const length = 4 + rand(3); return { sequence: Array.from({ length }, () => rand(9)) }; }
  if (index === 2) { const sets = [['◆', '◆', '◆', '●'], ['▲', '▲', '■', '▲'], ['✦', '✦', '✦', '☼']]; const set = sets[rand(sets.length)]; return { rule: 'Find the symbol that is different from the others.', options: set, answer: set.findIndex(x => x !== set[0]) }; }
  if (index === 3) return { riskyWin: rand(2) === 0 };
  return { target: ['✦', '◆', '⬟', '☼'][rand(4)] };
}
function createRoom() { const code = uniqueCode(); const room = { code, host: null, players: new Map(), phase: 'lobby', round: -1, challenge: null, deadline: 0, results: [], winner: null, timer: null, lock: false }; rooms.set(code, room); return room; }
function startRound(r) {
  clearTimeout(r.timer); r.phase = 'play'; r.challenge = challengeFor(r.round); r.deadline = now() + rounds[r.round].seconds * 1000;
  for (const p of r.players.values()) { p.answer = null; p.hits = 0; p.lastHitAt = 0; }
  broadcast(r, 'round'); r.timer = setTimeout(() => finishRound(r), rounds[r.round].seconds * 1000);
}
function finishRound(r) {
  if (r.phase !== 'play') return;
  clearTimeout(r.timer); r.phase = 'results';
  const delta = new Map([...r.players.values()].map(p => [p.id, 0]));
  const answers = [...r.players.values()].filter(p => p.answer !== null);
  const info = rounds[r.round];
  if (r.round === 0) {
    const eligible = answers.filter(p => p.answer === 'hit').sort((a, b) => a.answerAt - b.answerAt);
    eligible.forEach((p, i) => delta.set(p.id, [100, 70, 45][i] || 20));
  } else if (r.round === 4) {
    for (const p of r.players.values()) delta.set(p.id, Math.min(10, p.hits || 0) * 20 * 2);
  } else if (r.round === 1) {
    for (const p of answers) { const n = p.answer.correct; delta.set(p.id, Math.min(150, n * 25)); }
  } else if (r.round === 2) {
    for (const p of answers) if (p.answer === r.challenge.answer) delta.set(p.id, 100);
  } else {
    for (const p of answers) { if (p.answer === 'safe') delta.set(p.id, 40); else delta.set(p.id, r.challenge.riskyWin ? 100 : -30); }
  }
  for (const p of r.players.values()) p.score += delta.get(p.id) || 0;
  r.results = [...r.players.values()].map(p => ({ id: p.id, name: p.name, gained: delta.get(p.id) || 0, score: p.score, answer: p.answer })).sort((a, b) => b.gained - a.gained);
  broadcast(r, 'results');
  r.timer = setTimeout(() => {
    if (r.round < rounds.length - 1) { r.round++; r.phase = 'briefing'; r.challenge = null; broadcast(r, 'briefing'); }
    else { r.phase = 'final'; r.winner = [...r.players.values()].sort((a, b) => b.score - a.score)[0]?.id || null; broadcast(r, 'final'); }
  }, 4500);
}
function maybeFinish(r) { if (r.phase !== 'play' || r.round === 4) return; if ([...r.players.values()].filter(p => p.ws).every(p => p.answer !== null)) finishRound(r); }
function detach(ws, graceful = false) {
  const r = ws.room, p = ws.player; if (!r || !p || p.ws !== ws) return;
  p.ws = null; p.reconnectUntil = now() + (graceful ? 0 : 60_000);
  if (graceful) { r.players.delete(p.id); if (r.host === p.id) r.host = [...r.players.keys()][0] || null; }
  if (!r.players.size) { clearTimeout(r.timer); rooms.delete(r.code); return; }
  broadcast(r);
  if (r.phase === 'play') maybeFinish(r);
  setTimeout(() => { if (!p.ws && r.players.get(p.id) === p && p.reconnectUntil <= now()) { r.players.delete(p.id); if (r.host === p.id) r.host = [...r.players.keys()][0] || null; if (!r.players.size) rooms.delete(r.code); else broadcast(r); } }, graceful ? 0 : 60_100);
}
function handle(ws, msg) {
  const type = msg.type;
  if (type === 'create' || type === 'join' || type === 'reconnect') {
    const name = cleanName(msg.name), code = type === 'create' ? null : String(msg.code || '').toUpperCase().trim();
    if (!name && type !== 'reconnect') return send(ws, 'error', { message: 'Choose a nickname to enter the arena.' });
    let r = type === 'create' ? createRoom() : rooms.get(code);
    if (!r) return send(ws, 'error', { message: `Room ${code || ''} was not found. Check the code and try again.` });
    let p;
    if (type === 'reconnect') {
      p = r.players.get(String(msg.playerId)); if (!p || p.token !== msg.token || p.reconnectUntil < now()) return send(ws, 'error', { message: 'Your seat expired. Rejoin the room with your nickname.' });
      for (const old of [...r.players.values()]) if (old !== p && old.name.toLowerCase() === name.toLowerCase() && old.ws) return send(ws, 'error', { message: 'That nickname is already in this room.' });
      p.name = name || p.name;
    } else {
      if (r.phase !== 'lobby') return send(ws, 'error', { message: 'This match is already underway. Join the lobby before the host starts.' });
      if (r.players.size >= 8) return send(ws, 'error', { message: 'This arena is full (8 players max).' });
      if ([...r.players.values()].some(x => x.name.toLowerCase() === name.toLowerCase())) return send(ws, 'error', { message: 'That nickname is already in this room. Pick another.' });
      p = { id: crypto.randomUUID(), token: crypto.randomBytes(24).toString('hex'), name, score: 0, ready: false, answer: null, ws, reconnectUntil: 0 };
      r.players.set(p.id, p); if (!r.host) r.host = p.id;
    }
    if (p.ws && p.ws !== ws) { const old = p.ws; old.room = null; send(old, 'replaced'); old.close(); }
    p.ws = ws; ws.room = r; ws.player = p; p.reconnectUntil = 0;
    send(ws, 'joined', { state: publicState(r), playerId: p.id, token: p.token }); broadcast(r); return;
  }
  const r = ws.room, p = ws.player;
  if (!r || !p || r.players.get(p.id) !== p) return send(ws, 'error', { message: 'Join a room first.' });
  if (type === 'ready') { p.ready = !p.ready; broadcast(r); }
  else if (type === 'start') {
    if (p.id !== r.host) return send(ws, 'error', { message: 'Only the host can start the match.' });
    if (r.phase !== 'lobby' || r.players.size < 2) return send(ws, 'error', { message: 'At least two players are needed to start.' });
    r.round = 0; r.results = []; r.winner = null; for (const pl of r.players.values()) pl.score = 0; r.phase = 'briefing'; broadcast(r, 'briefing');
  } else if (type === 'begin') {
    if (p.id !== r.host) return send(ws, 'error', { message: 'Only the host can begin the round.' });
    if (r.phase === 'briefing') { r.phase = 'countdown'; r.deadline = now() + 3000; broadcast(r, 'countdown'); r.timer = setTimeout(() => startRound(r), 3000); }
  } else if (type === 'answer') {
    if (r.phase !== 'play' || p.answer !== null || now() >= r.deadline) return;
    const ms = Math.min(rounds[r.round].seconds * 1000, Math.max(0, msg.elapsed || 0));
    if (r.round === 0) { if (msg.value !== 'hit' || !msg.ready) return; p.answer = 'hit'; p.answerAt = now(); }
    else if (r.round === 1) { const sent = Array.isArray(msg.value) ? msg.value.slice(0, 12).map(Number) : []; let correct = 0; for (let i = 0; i < r.challenge.sequence.length && i < sent.length; i++) { if (sent[i] !== r.challenge.sequence[i]) break; correct++; } p.answer = { correct }; p.answerAt = now(); }
    else if (r.round === 2) { const n = Number(msg.value); if (!Number.isInteger(n) || n < 0 || n > 3) return; p.answer = n; p.answerAt = now(); }
    else if (r.round === 3) { if (!['safe', 'risky'].includes(msg.value)) return; p.answer = msg.value; p.answerAt = now(); }
    else if (r.round === 4) { const hitAt = now(); if (msg.value !== 'hit' || (p.hits || 0) >= 10 || hitAt - (p.lastHitAt || 0) < 100) return; p.hits = (p.hits || 0) + 1; p.lastHitAt = hitAt; p.answerAt = hitAt; }
    broadcast(r); maybeFinish(r);
  } else if (type === 'rematch') {
    if (p.id !== r.host || r.phase !== 'final') return;
    r.phase = 'lobby'; r.round = -1; r.results = []; r.challenge = null; r.winner = null;
    for (const pl of r.players.values()) { pl.score = 0; pl.ready = false; pl.answer = null; } broadcast(r, 'state');
  } else if (type === 'leave') { detach(ws, true); ws.room = null; ws.player = null; send(ws, 'left'); ws.close(); }
}

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true}'); }
  const file = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const full = path.resolve(ROOT, file);
  if (!full.startsWith(ROOT + path.sep) && full !== path.join(ROOT, 'index.html')) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(full, (err, body) => { if (err) { res.writeHead(404); return res.end('Not found'); } const ext = path.extname(full); const type = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' }[ext] || 'application/octet-stream'; res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' }); res.end(body); });
});
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
wss.on('connection', ws => { ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; }); ws.on('message', raw => { try { handle(ws, JSON.parse(raw.toString())); } catch { send(ws, 'error', { message: 'That move could not be processed.' }); } }); ws.on('close', () => detach(ws)); ws.on('error', () => detach(ws)); });
setInterval(() => { for (const ws of wss.clients) { if (ws.isAlive === false) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 25_000).unref();
server.listen(PORT, '0.0.0.0', () => console.log(`NEON ARENA listening on ${PORT}`));

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received; closing WebSocket clients and HTTP server.`);
  for (const room of rooms.values()) clearTimeout(room.timer);
  let openClients = wss.clients.size;
  let httpClosed = false;
  let websocketServerClosed = false;
  const finish = () => {
    if (!httpClosed || !websocketServerClosed || openClients > 0) return;
    clearTimeout(forceExit);
    process.exit();
  };
  const forceExit = setTimeout(() => {
    for (const ws of wss.clients) ws.terminate();
    process.exit(1);
  }, 10_000);
  forceExit.unref();
  for (const ws of wss.clients) {
    ws.once('close', () => { openClients--; finish(); });
    ws.close(1012, 'Service restarting');
  }
  wss.close(() => { websocketServerClosed = true; finish(); });
  server.close(error => {
    httpClosed = true;
    if (error) { console.error('HTTP server shutdown failed:', error); process.exitCode = 1; }
    finish();
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
