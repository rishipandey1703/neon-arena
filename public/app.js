(() => {
  const app = document.querySelector('#app');
  const connEl = document.querySelector('#connection');
  const toastEl = document.querySelector('#toast');
  const sounds = { enabled: false, ctx: null };
  let ws, state = null, selfId = null, credentials = null, toastTimer, reconnecting = false, pendingReady = null, memoryInput = [], memoryBusy = false, chaosHits = 0, flashVisibleAt = 0, countdownValue = 0;
  const saved = (() => { try { return JSON.parse(localStorage.getItem('neon-seat') || 'null'); } catch { return null; } })();
  const $ = (s, root = document) => root.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function sound(freq = 620, duration = .07, wave = 'sine') { if (!sounds.enabled) return; try { sounds.ctx ||= new (window.AudioContext || window.webkitAudioContext)(); const o = sounds.ctx.createOscillator(), g = sounds.ctx.createGain(); o.type = wave; o.frequency.value = freq; g.gain.setValueAtTime(.055, sounds.ctx.currentTime); g.gain.exponentialRampToValueAtTime(.001, sounds.ctx.currentTime + duration); o.connect(g).connect(sounds.ctx.destination); o.start(); o.stop(sounds.ctx.currentTime + duration); } catch {} }
  function toast(message) { toastEl.textContent = message; toastEl.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200); }
  function connection(mode, text) { connEl.className = `connection ${mode}`; connEl.innerHTML = `<i></i><b>${text}</b>`; }
  function send(type, data = {}) { if (!ws || ws.readyState !== WebSocket.OPEN) return toast('Reconnecting to the arena…'); ws.send(JSON.stringify({ type, ...data })); }
  function connect(onReady) {
    if (ws && [WebSocket.OPEN, WebSocket.CONNECTING].includes(ws.readyState)) { if (ws.readyState === WebSocket.OPEN) onReady?.(); else if (onReady) pendingReady = onReady; return; }
    if (onReady) pendingReady = onReady;
    connection('connecting', 'CONNECTING');
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}/ws`);
    ws.onopen = () => { connection('online', 'LIVE'); reconnecting = false; if (credentials?.playerId && credentials?.token) { send('reconnect', credentials); } else { const ready = pendingReady; pendingReady = null; ready?.(); } };
    ws.onmessage = event => { let m; try { m = JSON.parse(event.data); } catch { return; }
      if (m.type === 'error') { if (credentials?.playerId) { credentials = null; selfId = null; state = null; localStorage.removeItem('neon-seat'); renderHome(); toast(m.message); } else toast(m.message); app.dataset.busy = ''; return; }
      if (m.type === 'joined') { selfId = m.playerId; credentials = { ...credentials, code: m.state.code, playerId: m.playerId, token: m.token }; localStorage.setItem('neon-seat', JSON.stringify(credentials)); state = m.state; update(); return; }
      if (m.type === 'state' || ['round', 'results', 'briefing', 'countdown', 'final'].includes(m.type)) { if (m.state) { const old = state; state = m.state; if (state.phase !== 'play') { memoryInput = []; chaosHits = 0; memoryBusy = false; } if (old?.phase === 'play' && state.phase === 'play' && old.round === state.round && old.players.find(p => p.id === selfId)?.answered === state.players.find(p => p.id === selfId)?.answered) updateLivePlay(); else update(); } return; }
      if (m.type === 'left' || m.type === 'replaced') { state = null; selfId = null; credentials = null; localStorage.removeItem('neon-seat'); renderHome(); }
    };
    ws.onclose = () => { connection('connecting', 'RECONNECTING'); if (!reconnecting) { reconnecting = true; setTimeout(() => { reconnecting = false; if (!ws || ws.readyState === WebSocket.CLOSED) connect(); }, 1400); } };
    ws.onerror = () => connection('connecting', 'RETRYING');
  }
  function startCreate() { const name = clean($('#createName')?.value); if (!name) return toast('Add your nickname first.'); credentials = { name }; connect(() => send('create', { name })); }
  function startJoin() { const name = clean($('#joinName')?.value), code = ($('#roomInput')?.value || '').trim().toUpperCase(); if (!name) return toast('Add your nickname first.'); if (!/^[A-Z0-9]{5}$/.test(code)) return toast('Enter the 5-character room code.'); credentials = { name, code }; connect(() => send('join', { name, code })); }
  function clean(s) { return (s || '').trim().replace(/\s+/g, ' ').slice(0, 18); }
  function renderHome() {
    app.dataset.busy = '';
    app.innerHTML = `<div class="home screen"><section class="hero"><div><div class="eyebrow">A multiplayer mind battle</div><h1>THINK FAST.<br><span>PLAY LOUD.</span></h1><p class="hero-copy">Five quick-fire rounds. One arena. Rally your crew and find out who’s got the sharpest reflexes, memory, and nerve.</p></div><div class="hero-visual"><div class="orbit"></div><div class="core"><span>✦</span></div><div class="float-chip float-a">02—08 PLAYERS</div><div class="float-chip float-b">LIVE / MULTIPLAYER</div></div></section><div class="section-label">Your arena awaits</div><section class="entry-layout"><form class="card entry-card create" id="createForm"><div class="card-head"><div class="card-icon">＋</div><div><h2>Create a room</h2><p>Start a new arena and invite your crew.</p></div></div><div class="fields"><input class="input" id="createName" maxlength="18" autocomplete="nickname" placeholder="Your nickname" aria-label="Your nickname"><button class="button" type="submit">Create room <span>↗</span></button></div></form><form class="card entry-card join" id="joinForm"><div class="card-head"><div class="card-icon">⌁</div><div><h2>Join a room</h2><p>Got a code? Jump right into the action.</p></div></div><div class="fields"><input class="input" id="joinName" maxlength="18" autocomplete="nickname" placeholder="Your nickname" aria-label="Your nickname"><input class="input code" id="roomInput" maxlength="5" placeholder="CODE" aria-label="Room code"><button class="button secondary" type="submit">Join <span>→</span></button></div></form></section><div class="features"><div class="feature"><b>05</b> unique rounds</div><div class="feature"><b>LIVE</b> synced gameplay</div><div class="feature"><b>FREE</b> no accounts</div><div class="feature"><b>PLAY</b> any device</div></div></div>`;
    $('#createForm').addEventListener('submit', e => { e.preventDefault(); startCreate(); }); $('#joinForm').addEventListener('submit', e => { e.preventDefault(); startJoin(); }); $('#roomInput').addEventListener('input', e => e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5));
  }
  function playersSorted() { return [...(state?.players || [])].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)); }
  function updateLivePlay() {
    const list = $('.score-panel .player-list');
    if (list) list.innerHTML = playersSorted().map((p, i) => playerRow(p, i)).join('');
    const tags = document.querySelectorAll('.game-main .tag');
    if (tags[0]) tags[0].textContent = `${state.players.filter(p => p.answered).length} / ${state.players.length} LOCKED`;
    if (state.round === 4) { const mine = state.players.find(p => p.id === selfId), note = $('#chaosNote'); if (note && mine) note.textContent = `${mine.hits} TARGET${mine.hits === 1 ? '' : 'S'} HIT`; }
  }
  function playerRow(p, rank = null) { const isSelf = p.id === selfId; return `<div class="player ${isSelf ? 'self' : ''}">${rank !== null ? `<span class="rank">${String(rank + 1).padStart(2, '0')}</span>` : ''}<div class="avatar">${esc(p.name.slice(0, 1).toUpperCase())}</div><div class="player-meta"><div class="player-name">${esc(p.name)}${isSelf ? ' <span class="small-label">(YOU)</span>' : ''}${p.id === state.host ? '<span class="host-pill">HOST</span>' : ''}</div><div class="player-sub">${p.online ? '<i class="dot-online"></i> ONLINE' : '<i class="dot-online dot-away"></i> RECONNECTING'} ${p.answered && state.phase === 'play' ? ' · LOCKED IN' : ''}</div></div>${p.id !== state.host && p.ready ? '<span class="ready-pill">READY</span>' : ''}<span class="score">${p.score}</span></div>`; }
  function roundStrip() { return `<div class="round-strip">${Array.from({ length: state.totalRounds }, (_, i) => `<i class="round-dot ${i < state.round ? 'done' : ''}"></i>`).join('')}</div>`; }
  function renderLobby() {
    const host = selfId === state.host, players = state.players;
    app.innerHTML = `<div class="screen"><div class="screen-head"><div><div class="eyebrow">Lobby / ${players.length} pilot${players.length === 1 ? '' : 's'} connected</div><h1>Squad up.</h1><p>Bring your crew in. You’ll need at least two players to launch.</p></div><button class="room-code" id="copyCode" title="Copy room code">${esc(state.code)} <small>⧉</small></button></div><div class="lobby-grid"><section class="panel lobby-roster"><div class="panel-title"><h2>Players in the arena</h2><span class="counter">${players.length} / 8 MAX</span></div><div class="player-list">${players.map(p => playerRow(p)).join('')}${players.length < 2 ? '<div class="empty-slots">WAITING FOR YOUR FIRST OPPONENT…</div>' : ''}</div>${roundStrip()}</section><aside class="panel lobby-aside"><div class="panel-title"><h2>Invite your crew</h2><span class="small-label">1 MINUTE TO RECONNECT</span></div><div class="invite-box"><p>Share the room code with a friend. They can join from any device.</p><strong>${esc(state.code)}</strong></div>${host ? `<button class="button wide" id="startGame" ${players.length < 2 ? 'disabled' : ''}>Start the mind battle <span>↗</span></button><p class="waiting-note">${players.length < 2 ? 'Waiting for another player to join.' : 'Everyone can see the lobby update live.'}</p>` : `<button class="button secondary wide" id="readyToggle">${state.players.find(p => p.id === selfId)?.ready ? '✓ You’re ready' : 'I’m ready'}</button><p class="waiting-note">The host starts when the squad is ready. The arena needs at least 2 players.</p>`}<button class="button ghost wide" id="leaveRoom" style="margin-top:12px">Leave room</button></aside></div><section class="rules-list">${[['✦','Flash','React first when your target appears.'],['▦','Memory','Repeat the glowing tile sequence.'],['◈','Decoy','Spot the one symbol that breaks the rule.'],['⚡','Risk','Choose a safe score or gamble big.'],['✹','Chaos','Tap targets fast in the double-points finale.']].map(x => `<article class="rule-mini"><div class="rule-icon">${x[0]}</div><h3>${x[1]}</h3><p>${x[2]}</p></article>`).join('')}</section></div>`;
    $('#copyCode').onclick = async () => { try { await navigator.clipboard.writeText(state.code); toast('Room code copied. Send it to your crew!'); } catch { toast(`Room code: ${state.code}`); } };
    $('#startGame')?.addEventListener('click', () => send('start'));
    $('#readyToggle')?.addEventListener('click', () => send('ready'));
    $('#leaveRoom').onclick = () => { credentials = null; send('leave'); };
  }
  function leaderboard() { const ordered = playersSorted(); return `<aside class="panel score-panel"><div class="panel-title"><h2>Live leaderboard</h2><span class="small-label">TOTAL PTS</span></div><div class="player-list">${ordered.map((p, i) => playerRow(p, i)).join('')}</div><p class="other-note">Your score updates as soon as each round ends. Stay sharp to climb the board.</p></aside>`; }
  function beginCountdown() { send('begin'); }
  function renderBriefing() {
    const info = state.roundInfo, host = selfId === state.host;
    app.innerHTML = `<div class="screen"><div class="screen-head"><div><div class="eyebrow">Round ${String(info.index).padStart(2, '0')} / ${state.totalRounds} · ${esc(info.title)}</div><h1>Ready your reflexes.</h1><p>Read the rules, get set, then the host launches the countdown.</p></div><span class="tag">${state.players.length} PLAYERS</span></div><div class="game-layout"><section class="panel game-main"><div class="game-topline"><span class="tag">ROUND ${info.index} / 5</span><span class="small-label">INSTRUCTIONS</span></div><h1>${esc(info.icon)} ${esc(info.title)}</h1><p class="instruction">${esc(info.how)}</p><div class="points-note">${esc(info.detail)}</div><div class="instruction-card">Your progress and points are saved on the game server. Everyone plays the same challenge.</div><div class="arena"><div class="center-message">${host ? 'ARENA IS YOURS, HOST' : 'HOST IS GETTING READY'}<strong>${host ? 'Launch when everyone has read the rules.' : 'Take a breath. Your turn is coming.'}</strong></div></div>${host ? '<button class="button wide" id="beginRound" style="margin-top:14px">Start round <span>↗</span></button>' : ''}</section>${leaderboard()}</div>${roundStrip()}</div>`;
    $('#beginRound')?.addEventListener('click', beginCountdown);
  }
  function renderCountdown() {
    const info = state.roundInfo;
    const value = Math.max(1, Math.ceil((state.deadline - Date.now()) / 1000));
    app.innerHTML = `<div class="screen"><div class="game-layout"><section class="panel game-main"><div class="game-topline"><span class="tag">ROUND ${info.index} / 5</span><span class="small-label">SYNCED START</span></div><h1>${esc(info.icon)} ${esc(info.title)}</h1><p class="instruction">${esc(info.how)}</p><div class="points-note">${esc(info.detail)}</div><div class="arena"><div class="countdown-number" id="countValue">${value}</div></div><p class="waiting-note">Get ready — all players start together.</p></section>${leaderboard()}</div>${roundStrip()}</div>`;
    countdownValue = value;
  }
  function renderPlay() {
    const info = state.roundInfo, roundIdx = state.round, mine = state.players.find(p => p.id === selfId), time = info.seconds;
    const answered = !!mine?.answered;
    let arena = '';
    if (roundIdx === 0) arena = `<div class="arena" id="arena"><div class="arena-note" id="flashNote">WAIT FOR THE SIGNAL…</div><div class="center-message" id="flashWaiting">Hold it. Target only counts after the signal.</div></div>`;
    if (roundIdx === 1) arena = `<div class="arena"><div class="arena-note" id="memoryNote">${answered ? 'ANSWER LOCKED IN' : 'WATCH THE SEQUENCE'}</div><div class="memory-grid" id="memoryGrid">${Array.from({ length: 9 }, (_, i) => `<button class="memory-tile" data-tile="${i}" ${answered ? 'disabled' : ''}>${i + 1}</button>`).join('')}</div></div>`;
    if (roundIdx === 2) arena = `<div class="arena"><div class="arena-note">${esc(state.challenge.rule)}</div><div class="choice-row">${state.challenge.options.map((o, i) => `<button class="choice-button" data-choice="${i}" ${answered ? 'disabled' : ''}>${esc(o)}</button>`).join('')}</div></div>`;
    if (roundIdx === 3) arena = `<div class="arena"><div class="arena-note">COMMIT YOUR CHOICE · NO TAKEBACKS</div><div class="choice-row"><button class="choice-button wager safe" data-wager="safe" ${answered ? 'disabled' : ''}>SAFE<br>+40</button><button class="choice-button wager risky" data-wager="risky" ${answered ? 'disabled' : ''}>RISKY<br>+100 / −30</button></div></div>`;
    if (roundIdx === 4) arena = `<div class="arena" id="chaosArena"><div class="arena-note" id="chaosNote">${answered ? `${chaosHits} TARGETS HIT` : 'TAP THE TARGET AS MANY TIMES AS YOU CAN'}</div>${answered ? '<div class="center-message">NICE RUN!<strong>20 pts per hit · double finale multiplier</strong></div>' : `<button class="flash-target" id="chaosTarget" aria-label="Hit target">${esc(state.challenge.target)}</button>`}</div>`;
    app.innerHTML = `<div class="screen"><div class="screen-head"><div><div class="eyebrow">Round ${String(info.index).padStart(2, '0')} / ${state.totalRounds} · ${esc(info.title)}</div><h1>Make your move.</h1><p>Your score <b style="color:var(--cyan)">${mine?.score || 0}</b> pts · ${answered ? 'Move locked in. Waiting for the rest of the squad.' : 'Your action is live. One answer per player.'}</p></div><span class="tag">${state.players.filter(p => p.answered).length} / ${state.players.length} LOCKED</span></div><div class="game-layout"><section class="panel game-main"><div class="game-topline"><span class="tag">${esc(info.title.toUpperCase())}</span><span class="timer ${time <= 3 ? 'urgent' : ''}" id="timer">00:${String(time).padStart(2, '0')}</span></div><h1>${esc(info.icon)} ${esc(info.title)}</h1><p class="instruction">${esc(info.how)}</p><div class="points-note">${esc(info.detail)}</div>${arena}<div class="progress-wrap"><span>TIME LEFT</span><div class="progress"><i style="width:${Math.max(0, time / info.duration * 100)}%" id="timeProgress"></i></div><span id="timeLeft">${time}s</span></div></section>${leaderboard()}</div>${roundStrip()}</div>`;
    if (!answered && roundIdx === 0) startFlash();
    if (!answered && roundIdx === 1) playMemory();
    if (!answered && roundIdx === 4) { chaosHits = 0; setChaosTarget(); }
    if (!answered && roundIdx === 2) document.querySelectorAll('[data-choice]').forEach(b => b.onclick = () => send('answer', { value: Number(b.dataset.choice) }));
    if (!answered && roundIdx === 3) document.querySelectorAll('[data-wager]').forEach(b => b.onclick = () => send('answer', { value: b.dataset.wager }));
    updateTimer();
  }
  function startFlash() {
    const target = state.challenge.target, delay = 800 + Math.random() * 2300;
    $('#flashNote').textContent = 'WAIT FOR THE SIGNAL…'; $('#flashWaiting').hidden = false;
    setTimeout(() => { if (state?.phase !== 'play' || state.round !== 0 || state.players.find(p => p.id === selfId)?.answered) return; const arena = $('#arena'); if (!arena) return; $('#flashWaiting').hidden = true; $('#flashNote').textContent = 'TAP NOW!'; arena.insertAdjacentHTML('beforeend', `<button class="flash-target" id="flashTarget">${esc(target)}</button>`); flashVisibleAt = Date.now(); sound(880, .12); $('#flashTarget').onclick = () => { send('answer', { value: 'hit', ready: true, elapsed: Date.now() - flashVisibleAt }); $('#flashTarget')?.remove(); $('#flashNote').textContent = 'NICE REACTION — MOVE LOCKED IN'; }; }, delay);
  }
  async function playMemory() {
    const seq = state.challenge.sequence, grid = $('#memoryGrid'); if (!grid) return;
    await new Promise(resolve => setTimeout(resolve, 650));
    for (const n of seq) { if (state?.phase !== 'play' || state.round !== 1) return; grid.querySelector(`[data-tile="${n}"]`)?.classList.add('lit'); sound(360 + n * 45, .11); await new Promise(resolve => setTimeout(resolve, 390)); grid.querySelector(`[data-tile="${n}"]`)?.classList.remove('lit'); await new Promise(resolve => setTimeout(resolve, 170)); }
    if (state?.phase !== 'play' || state.round !== 1) return;
    const note = $('#memoryNote'); if (note) note.textContent = 'YOUR TURN — REPEAT THE SEQUENCE';
    grid.querySelectorAll('[data-tile]').forEach(b => b.onclick = () => { if (memoryBusy || state?.phase !== 'play') return; const n = Number(b.dataset.tile); memoryInput.push(n); b.classList.add('selected'); setTimeout(() => b.classList.remove('selected'), 220); sound(450 + n * 36, .08); if (memoryInput.length === seq.length) { memoryBusy = true; send('answer', { value: memoryInput }); } });
  }
  function setChaosTarget() { const btn = $('#chaosTarget'), arena = $('#chaosArena'); if (!btn || !arena) return; const maxX = Math.max(0, arena.clientWidth - 96), maxY = Math.max(35, arena.clientHeight - 104); btn.style.left = `${Math.random() * maxX + 8}px`; btn.style.top = `${Math.random() * maxY + 42}px`; btn.onclick = e => { e.stopPropagation(); chaosHits = Math.min(10, chaosHits + 1); const note = $('#chaosNote'); if (note) note.textContent = `${chaosHits} TARGET${chaosHits === 1 ? '' : 'S'} HIT`; sound(700, .04, 'square'); if (chaosHits >= 10) { send('answer', { value: chaosHits }); return; } btn.textContent = ['✦', '◆', '⬟', '☼'][Math.floor(Math.random() * 4)]; setChaosTarget(); }; }
  function updateTimer() {
    const tick = () => { if (state?.phase !== 'play') return; const time = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000)); const el = $('#timer'); if (el) { el.textContent = `00:${String(time).padStart(2, '0')}`; el.classList.toggle('urgent', time <= 3); } const tl = $('#timeLeft'); if (tl) tl.textContent = `${time}s`; const prog = $('#timeProgress'); if (prog) prog.style.width = `${Math.max(0, time / state.roundInfo.duration * 100)}%`; if (time > 0) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  function renderResults() {
    const info = state.roundInfo; const mine = state.results.find(x => x.id === selfId);
    app.innerHTML = `<div class="screen"><div class="screen-head"><div><div class="eyebrow">Round ${String(info.index).padStart(2, '0')} complete</div><h1>Here’s the damage.</h1><p>${esc(info.title)} is in the books. Scores are locked on the arena server.</p></div><span class="tag">LIVE SCORE UPDATE</span></div><div class="game-layout"><section class="panel game-main"><div class="game-topline"><span class="tag">ROUND RESULTS</span><span class="small-label">${state.results.length} PLAYERS</span></div><div class="earned">${mine?.gained > 0 ? '+' : ''}${mine?.gained || 0} pts</div><p class="instruction">${mine ? `${esc(mine.name)}, you now have ${mine.score} points.` : 'Round scores updated.'}</p><div class="results-list" style="margin-top:20px">${state.results.map((x, i) => `<div class="result-row"><div class="result-place">${String(i + 1).padStart(2, '0')}</div><div><div class="result-name">${esc(x.name)}${x.id === selfId ? ' <span class="small-label">YOU</span>' : ''}</div><div class="result-sub">TOTAL SCORE</div></div><div class="gain">${x.gained > 0 ? '+' : ''}${x.gained}</div><div class="total">${x.score}</div></div>`).join('')}</div><p class="waiting-note">Next round begins in a moment. Keep an eye on the leaderboard.</p></section>${leaderboard()}</div>${roundStrip()}</div>`;
  }
  function renderFinal() {
    const ordered = playersSorted(), winner = state.players.find(p => p.id === state.winner), host = selfId === state.host;
    app.innerHTML = `<div class="screen"><section class="final-hero"><div class="final-crown">✦</div><div class="eyebrow">Match complete / 5 rounds played</div><h1>${winner ? `${esc(winner.name)} takes the arena!` : 'Arena complete.'}</h1><p>${winner?.id === selfId ? 'Legendary run. The crown looks good on you.' : `${winner ? esc(winner.name) : 'Your crew'} came out on top — run it back?`}</p><div class="final-actions">${host ? '<button class="button" id="rematch">Run it back ↗</button>' : '<span class="tag">WAITING FOR HOST TO REMATCH</span>'}<button class="button ghost" id="leaveFinal">Leave room</button></div></section><div class="game-layout"><section class="panel game-main"><div class="panel-title"><h2>Final standings</h2><span class="small-label">THE FINAL BOARD</span></div><div class="results-list">${ordered.map((p, i) => `<div class="result-row"><div class="result-place">${i === 0 ? '✦' : String(i + 1).padStart(2, '0')}</div><div><div class="result-name">${esc(p.name)}${p.id === selfId ? ' <span class="small-label">YOU</span>' : ''}</div><div class="result-sub">${p.id === state.winner ? 'ARENA CHAMPION' : 'ARENA PILOT'}</div></div><div class="gain">${p.score}</div><div class="total">PTS</div></div>`).join('')}</div></section>${leaderboard()}</div><section class="rules-list">${[['✦','Flash','React first when your target appears.'],['▦','Memory','Repeat the glowing tile sequence.'],['◈','Decoy','Spot the one symbol that breaks the rule.'],['⚡','Risk','Choose a safe score or gamble big.'],['✹','Chaos','Tap targets fast in the double-points finale.']].map(x => `<article class="rule-mini"><div class="rule-icon">${x[0]}</div><h3>${x[1]}</h3><p>${x[2]}</p></article>`).join('')}</section></div>`;
    $('#rematch')?.addEventListener('click', () => send('rematch')); $('#leaveFinal').onclick = () => { credentials = null; send('leave'); };
  }
  function update() {
    if (!state) return renderHome();
    if (state.phase === 'lobby') renderLobby();
    else if (state.phase === 'briefing') renderBriefing();
    else if (state.phase === 'countdown') renderCountdown();
    else if (state.phase === 'play') renderPlay();
    else if (state.phase === 'results') renderResults();
    else if (state.phase === 'final') renderFinal();
    if (state.phase === 'countdown') countdownTick();
  }
  function countdownTick() { if (state?.phase !== 'countdown') return; const value = Math.max(1, Math.ceil((state.deadline - Date.now()) / 1000)); const el = $('#countValue'); if (el && value !== countdownValue) { el.textContent = value; countdownValue = value; sound(460 + value * 90, .09); } setTimeout(countdownTick, 100); }
  $('#soundToggle').onclick = e => { sounds.enabled = !sounds.enabled; e.currentTarget.classList.toggle('active', sounds.enabled); e.currentTarget.textContent = sounds.enabled ? '♫' : '♬'; if (sounds.enabled) sound(700, .08); };
  if (saved?.playerId && saved?.code && saved?.token) { credentials = saved; credentials.name ||= ''; connect(); }
  else { renderHome(); connect(); }
  window.addEventListener('online', () => { if (credentials) connect(); });
})();
