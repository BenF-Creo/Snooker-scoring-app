/* App controller: navigation, settings, persistence, rendering. */

const KEYS = { settings: 'cue_settings', snooker: 'cue_snooker', billiards: 'cue_billiards', stats: 'cue_stats', profiles: 'cue_profiles' };

const LEADER_METRICS = [
  { key: 'high', label: 'Highest break', fmt: a => a.high },
  { key: 'c100', label: 'Centuries (100+)', fmt: a => a.c100 },
  { key: 'c50', label: 'Breaks 50+', fmt: a => a.c50 },
  { key: 'avg', label: 'Average break', fmt: a => (a.avg ? a.avg.toFixed(1) : '0') },
  { key: 'breaks', label: 'Breaks made', fmt: a => a.breaks },
  { key: 'consistency', label: 'Consistency', fmt: a => Math.round(a.consistency) + '%' },
];
function metricValue(a, key) {
  if (key === 'avg') return a.avg;
  if (key === 'consistency') return a.consistency;
  return a[key] || 0;
}

const ICONS = {
  back: '<svg class="ico" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
  trophy: '<svg class="ico ico--lg" viewBox="0 0 24 24"><path d="M8 4.5h8v4a4 4 0 0 1-8 0v-4Z"/><path d="M8 6H5.5v1A3 3 0 0 0 8.5 10"/><path d="M16 6h2.5v1A3 3 0 0 1 15.5 10"/><path d="M12 12.5V16"/><path d="M9.5 19.5h5"/><path d="M10.5 19.5l.4-3.5h2.2l.4 3.5"/></svg>',
  check: '<svg class="ico ico--lg" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
  draw: '<svg class="ico ico--lg" viewBox="0 0 24 24"><path d="M5 9.5h14M5 14.5h14"/></svg>',
};

const App = {
  settings: { playerNames: ['Player 1', 'Player 2'], players: null, snookerBestOf: 5, snookerReds: 15, billiardsTarget: 100 },
  profiles: [],
  snooker: null,
  billiards: null,
  currentScreen: 'home',
  statsGame: 'snooker',
  viewProfileId: null,
  leaderMetric: 'high',

  init() {
    this._loadSettings();
    this._loadProfiles();
    this._loadGames();
    this._bindNav();
    this._bindSettingsForm();
    this._bindGameDelegation();
    this._fillSettingsForm();
    this._updateHomePlayers();
    this._registerServiceWorker();
    showScreen('home');
  },

  // --- profiles ---

  _newId() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },

  profileById(id) { return this.profiles.find(p => p.id === id) || null; },

  profileName(id, fallbackIndex) {
    const p = this.profileById(id);
    if (p) return p.name;
    return (fallbackIndex != null) ? ('Player ' + (fallbackIndex + 1)) : 'Player';
  },

  // Name of the player currently selected for table seat i (used on home/setup).
  playerName(i) { return this.profileName(this.settings.players ? this.settings.players[i] : null, i); },

  // Name of the player actually assigned to a given game's seat i.
  gamePlayerName(game, i) {
    const id = (game && game.players) ? game.players[i] : (this.settings.players ? this.settings.players[i] : null);
    return this.profileName(id, i);
  },

  addProfile(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    const prof = { id: this._newId(), name: trimmed };
    this.profiles.push(prof);
    this._saveProfiles();
    return prof;
  },

  renameProfile(id, name) {
    const p = this.profileById(id);
    if (p) { p.name = (name || '').trim() || p.name; this._saveProfiles(); }
  },

  deleteProfile(id) {
    this.profiles = this.profiles.filter(p => p.id !== id);
    while (this.profiles.length < 2) this.profiles.push({ id: this._newId(), name: 'Player ' + (this.profiles.length + 1) });
    this._saveProfiles();
    this.settings.players = this.settings.players.map(pid => this.profileById(pid) ? pid : this.profiles[0].id);
    this._saveSettings();
  },

  newSnooker() {
    this._flushBreaks(this.snooker, 'snooker');
    this.snooker = new SnookerGame(this.settings.snookerBestOf, this.settings.snookerReds);
    this.snooker.players = this.settings.players.slice();
    this.saveGames();
  },

  newBilliards() {
    this._flushBreaks(this.billiards, 'billiards');
    this.billiards = new BilliardsGame(this.settings.billiardsTarget);
    this.billiards.players = this.settings.players.slice();
    this.saveGames();
  },

  // --- break statistics (all-time) ---

  loadStats() {
    try { const s = JSON.parse(localStorage.getItem(KEYS.stats)); if (s && Array.isArray(s.log)) return s; } catch (e) { /* ignore */ }
    return { log: [] };
  },

  saveStats(s) { try { localStorage.setItem(KEYS.stats, JSON.stringify(s)); } catch (e) { /* ignore */ } },

  _seatId(game, seat) {
    const players = (game && game.players) || this.settings.players;
    return players ? players[seat] : null;
  },

  // Move a finished game's visits into the persisted all-time log.
  _flushBreaks(game, type) {
    if (!game || !game.breaks || !game.breaks.length) return;
    const stats = this.loadStats();
    game.breaks.forEach(b => {
      const pid = this._seatId(game, b.player);
      stats.log.push({ g: type, pid, p: this.profileName(pid, b.player), v: b.value, s: b.scored, fr: b.frame || null, opening: !!b.opening, breakOff: !!b.breakOff, t: b.t || Date.now() });
    });
    if (stats.log.length > 5000) stats.log = stats.log.slice(-5000);
    this.saveStats(stats);
    game.breaks = [];
  },

  // All-time records = persisted log + live (not-yet-flushed) breaks of current games.
  allRecords() {
    const out = this.loadStats().log.slice();
    const live = (game, type) => {
      if (!game || !game.breaks) return;
      game.breaks.forEach(b => {
        const pid = this._seatId(game, b.player);
        out.push({ g: type, pid, p: this.profileName(pid, b.player), v: b.value, s: b.scored, fr: b.frame || null, opening: !!b.opening, breakOff: !!b.breakOff, t: b.t || 0 });
      });
    };
    live(this.snooker, 'snooker');
    live(this.billiards, 'billiards');
    return out;
  },

  clearStats() {
    this.saveStats({ log: [] });
    if (this.snooker) this.snooker.breaks = [];
    if (this.billiards) this.billiards.breaks = [];
    this.saveGames();
  },

  saveGames() {
    try {
      if (this.snooker) localStorage.setItem(KEYS.snooker, JSON.stringify(this.snooker));
      if (this.billiards) localStorage.setItem(KEYS.billiards, JSON.stringify(this.billiards));
    } catch (e) { /* storage unavailable — ignore */ }
  },

  // --- persistence ---

  _loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(KEYS.settings));
      if (s && typeof s === 'object') {
        this.settings = Object.assign(this.settings, s);
      }
    } catch (e) { /* ignore */ }
  },

  _saveSettings() {
    try { localStorage.setItem(KEYS.settings, JSON.stringify(this.settings)); } catch (e) { /* ignore */ }
  },

  _loadProfiles() {
    try {
      const p = JSON.parse(localStorage.getItem(KEYS.profiles));
      if (Array.isArray(p) && p.length) this.profiles = p;
    } catch (e) { /* ignore */ }

    if (!this.profiles.length) {
      // First run (or migrating from name-only settings): seed two profiles.
      const names = (this.settings.playerNames && this.settings.playerNames.length === 2)
        ? this.settings.playerNames : ['Player 1', 'Player 2'];
      this.profiles = names.map((n, i) => ({ id: this._newId(), name: (n && n.trim()) || ('Player ' + (i + 1)) }));
      this._saveProfiles();
    }

    // Ensure a valid current selection of two existing profiles.
    const ok = this.settings.players && this.settings.players.length === 2 &&
      this.profileById(this.settings.players[0]) && this.profileById(this.settings.players[1]);
    if (!ok) {
      this.settings.players = [this.profiles[0].id, this.profiles[Math.min(1, this.profiles.length - 1)].id];
      this._saveSettings();
    }
  },

  _saveProfiles() {
    try { localStorage.setItem(KEYS.profiles, JSON.stringify(this.profiles)); } catch (e) { /* ignore */ }
  },

  _loadGames() {
    try {
      const a = JSON.parse(localStorage.getItem(KEYS.snooker));
      if (a && a.frame) { const g = new SnookerGame(a.bestOf); Object.assign(g, a); this.snooker = g; }
    } catch (e) { /* ignore */ }
    try {
      const b = JSON.parse(localStorage.getItem(KEYS.billiards));
      if (b && Array.isArray(b.scores)) { const g = new BilliardsGame(b.target); Object.assign(g, b); this.billiards = g; }
    } catch (e) { /* ignore */ }
  },

  // --- settings form ---

  _fillSettingsForm() {
    const reds = document.getElementById('set-reds');
    reds.innerHTML = [15, 10].map(n => `<option value="${n}">${n} reds${n === 15 ? ' (standard)' : ' (short game)'}</option>`).join('');
    reds.value = String(this.settings.snookerReds);

    const bestOf = document.getElementById('set-bestof');
    bestOf.innerHTML = [1, 3, 5, 7, 9, 11, 15, 19, 25, 35]
      .map(n => `<option value="${n}">Best of ${n} (first to ${Math.floor(n / 2) + 1})</option>`).join('');
    bestOf.value = String(this.settings.snookerBestOf);

    document.getElementById('set-target').value = this.settings.billiardsTarget ? String(this.settings.billiardsTarget) : '';
  },

  _bindSettingsForm() {
    document.getElementById('set-reds').addEventListener('change', e => {
      this.settings.snookerReds = parseInt(e.target.value, 10) === 10 ? 10 : 15;
      this._saveSettings();
      this._refreshPristineGames();
    });
    document.getElementById('set-bestof').addEventListener('change', e => {
      this.settings.snookerBestOf = parseInt(e.target.value, 10);
      this._saveSettings();
      this._refreshPristineGames();
    });
    document.getElementById('set-target').addEventListener('input', e => {
      const raw = e.target.value.trim();
      const v = parseInt(raw, 10);
      this.settings.billiardsTarget = (raw === '' || isNaN(v) || v <= 0) ? null : v;
      this._saveSettings();
      this._refreshPristineGames();
    });
  },

  // Apply length/reds/target changes to a game that hasn't been scored yet, so
  // the setting feels live; an in-progress game is left untouched.
  _refreshPristineGames() {
    const s = this.snooker;
    if (s && s.frameNumber === 1 && s.framesWon[0] === 0 && s.framesWon[1] === 0 &&
        s.frame.scores[0] === 0 && s.frame.scores[1] === 0 && !s.frame.isOver) {
      this.newSnooker();
    }
    const b = this.billiards;
    if (b && b.scores[0] === 0 && b.scores[1] === 0 && !b.isOver) {
      this.newBilliards();
    }
    this._renderActive();
  },

  _updateHomePlayers() {
    document.getElementById('home-players').textContent = this.playerName(0) + ' & ' + this.playerName(1);
  },

  // --- navigation ---

  _bindNav() {
    document.addEventListener('click', e => {
      const t = e.target.closest('[data-nav]');
      if (!t) return;
      const dst = t.dataset.nav;
      if (dst === 'snooker' && !this.snooker) this.newSnooker();
      if (dst === 'billiards' && !this.billiards) this.newBilliards();
      showScreen(dst);
    });
  },

  _renderActive() {
    if (this.currentScreen === 'snooker') renderSnooker();
    else if (this.currentScreen === 'billiards') renderBilliards();
  },

  // --- game event delegation ---

  _bindGameDelegation() {
    document.getElementById('screen-snooker').addEventListener('click', e => {
      const t = e.target.closest('[data-action]');
      if (!t || t.disabled) return;
      const g = this.snooker;
      switch (t.dataset.action) {
        case 'home': showScreen('home'); break;
        case 'rules': showScreen('rules-snooker'); break;
        case 'breaker': g.setBreaker(+t.dataset.seat); afterSnooker(); break;
        case 'pot': g.pot(t.dataset.key); afterSnooker(); break;
        case 'endturn': g.endTurn(); afterSnooker(); break;
        case 'foul': openFoulModal(); break;
        case 'undo': g.undo(); afterSnooker(); break;
        case 'concede': g.concede(); afterSnooker(); break;
        case 'restart': g.restartFrame(); afterSnooker(); break;
        case 'newmatch': App.newSnooker(); afterSnooker(); break;
      }
    });

    document.getElementById('screen-billiards').addEventListener('click', e => {
      const t = e.target.closest('[data-action]');
      if (!t || t.disabled) return;
      const g = this.billiards;
      switch (t.dataset.action) {
        case 'home': showScreen('home'); break;
        case 'rules': showScreen('rules-billiards'); break;
        case 'breaker': g.setBreaker(+t.dataset.seat); afterBilliards(); break;
        case 'swapcue': g.swapCues(); afterBilliards(); break;
        case 'score': g.score(t.dataset.key); afterBilliards(); break;
        case 'endturn': g.endTurn(); afterBilliards(); break;
        case 'undo': g.undo(); afterBilliards(); break;
        case 'finish': g.finishGame(); afterBilliards(); break;
        case 'newgame': App.newBilliards(); afterBilliards(); break;
      }
    });

    // Players (profile management + selection)
    const players = document.getElementById('screen-players');
    players.addEventListener('click', e => {
      const t = e.target.closest('[data-action], [data-viewstats], [data-del]');
      if (!t) return;
      if (t.dataset.action === 'add-profile') {
        const inp = document.getElementById('add-name');
        if (this.addProfile(inp.value)) { inp.value = ''; renderPlayers(); this._updateHomePlayers(); }
      } else if (t.dataset.viewstats) {
        this.viewProfileId = t.dataset.viewstats; showScreen('player');
      } else if (t.dataset.del) {
        confirmDeleteProfile(t.dataset.del);
      }
    });
    players.addEventListener('change', e => {
      const sel = e.target.closest('[data-sel]');
      if (sel) { this.settings.players[+sel.dataset.sel] = sel.value; this._saveSettings(); this._refreshPristineGames(); this._updateHomePlayers(); return; }
      const ren = e.target.closest('[data-rename]');
      if (ren) { this.renameProfile(ren.dataset.rename, ren.value); this._updateHomePlayers(); }
    });

    // Individual player stats
    document.getElementById('screen-player').addEventListener('click', e => {
      const t = e.target.closest('[data-action]');
      if (!t) return;
      if (t.dataset.action === 'stats-game') { this.statsGame = t.dataset.game; renderPlayer(); }
    });

    // Leaderboard
    const lb = document.getElementById('screen-leaderboard');
    lb.addEventListener('click', e => {
      const t = e.target.closest('[data-action], [data-viewstats]');
      if (!t) return;
      if (t.dataset.action === 'stats-game') { this.statsGame = t.dataset.game; renderLeaderboard(); }
      else if (t.dataset.action === 'clear-stats') { confirmClearStats(); }
      else if (t.dataset.viewstats) { this.viewProfileId = t.dataset.viewstats; showScreen('player'); }
    });
    lb.addEventListener('change', e => {
      const m = e.target.closest('[data-metric]');
      if (m) { this.leaderMetric = m.value; renderLeaderboard(); }
    });
  },

  _registerServiceWorker() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline support optional */ });
    }
  },
};

/* ---------- shared helpers ---------- */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function showScreen(id) {
  App.currentScreen = id;
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.toggle('active', s.id === 'screen-' + id);
  });
  if (id === 'snooker') renderSnooker();
  if (id === 'billiards') renderBilliards();
  if (id === 'players') renderPlayers();
  if (id === 'player') renderPlayer();
  if (id === 'leaderboard') renderLeaderboard();
  window.scrollTo(0, 0);
}

function openOverlay(html) {
  const o = document.getElementById('overlay');
  o.innerHTML = '<div class="overlay__backdrop"></div><div class="modal">' + html + '</div>';
  o.classList.add('active');
  return o;
}

function closeOverlay() {
  const o = document.getElementById('overlay');
  o.classList.remove('active');
  o.innerHTML = '';
}

/* ---------- snooker rendering ---------- */

function afterSnooker() { App.saveGames(); renderSnooker(); }

// Cue-ball chooser (billiards) shown before a game has started.
function cueChooser(g) {
  const cues = g.cues || ['white', 'yellow'];
  return `<div class="breakoff">
      <span class="breakoff__label">Cue balls</span>
      <button class="cueswap" data-action="swapcue">
        <span class="cueswap__p">${escapeHtml(App.gamePlayerName(g, 0))} <span class="cuedot cuedot--${cues[0]}"></span></span>
        <span class="cueswap__icon">⇄</span>
        <span class="cueswap__p"><span class="cuedot cuedot--${cues[1]}"></span> ${escapeHtml(App.gamePlayerName(g, 1))}</span>
      </button>
    </div>`;
}

// Break-off chooser shown before a frame/game has started.
function breakoffChooser(g, name) {
  const seat = g.frame ? g.frame.currentPlayer : g.currentPlayer;
  return `<div class="breakoff">
      <span class="breakoff__label">Who breaks off?</span>
      <div class="seg seg--mini">
        <button class="seg__btn ${seat === 0 ? 'seg__btn--active' : ''}" data-action="breaker" data-seat="0">${name(0)}</button>
        <button class="seg__btn ${seat === 1 ? 'seg__btn--active' : ''}" data-action="breaker" data-seat="1">${name(1)}</button>
      </div>
    </div>`;
}

// Best break this match for a seat: recorded visits plus the live break.
function snookerMatchHigh(g, seat) {
  let hi = 0;
  g.breaks.forEach(b => { if (b.player === seat) hi = Math.max(hi, b.value); });
  if (!g.frame.isOver && g.frame.currentPlayer === seat) hi = Math.max(hi, g.frame.currentBreak);
  return hi;
}

function renderSnooker() {
  const g = App.snooker;
  if (!g) return;
  const f = g.frame;
  const legal = g.legalKeys();
  const name = i => escapeHtml(App.gamePlayerName(g, i));

  const panels = [0, 1].map(i => {
    const active = !f.isOver && f.currentPlayer === i;
    const leading = g.leader() === i && f.scores[0] !== f.scores[1];
    const turn = !active ? '&nbsp;'
      : (f.currentBreak > 0 ? `<span class="panel__turn--break">Break ${f.currentBreak}</span>` : 'At table');
    return `<div class="panel ${active ? 'panel--active' : ''}">
        <div class="panel__name">${name(i)}</div>
        <div class="panel__score ${leading ? 'is-leading' : ''}">${f.scores[i]}</div>
        <div class="panel__turn">${turn}</div>
        <div class="panel__stats">
          <div class="stat"><span class="stat__value">${g.framesWon[i]}</span><span class="stat__label">Frames</span></div>
          <div class="stat"><span class="stat__value">${snookerMatchHigh(g, i)}</span><span class="stat__label">Match high</span></div>
        </div>
      </div>`;
  }).join('');

  const balls = SNOOKER_BALLS.map(b => {
    const isLegal = legal.includes(b.key);
    const badge = (b.key === 'red' && isLegal) ? `<span class="ball__badge">×${f.redsRemaining}</span>` : '';
    return `<button class="ball ball--${b.key} ${isLegal ? '' : 'is-disabled'}" data-action="pot" data-key="${b.key}" ${isLegal ? '' : 'disabled'}>
        <span class="ball__val">${b.value}</span>${badge}
      </button>`;
  }).join('');

  // Next-ball indicator
  let nextText, nextDot = '';
  if (f.isOver) {
    nextText = 'Frame over';
  } else if (f.phase.type === 'red') {
    nextText = 'Red'; nextDot = '<span class="dot-ball chip--red"></span>';
  } else if (f.phase.type === 'colour') {
    nextText = 'Any colour';
  } else {
    const b = ballByValue(f.phase.value);
    nextText = b ? b.name : '';
    nextDot = b ? `<span class="dot-ball chip--${b.key}"></span>` : '';
  }

  document.getElementById('screen-snooker').innerHTML = `
    <header class="appbar">
      <button class="appbar__btn appbar__btn--icon" data-action="home">${ICONS.back}<span>Menu</span></button>
      <div class="appbar__title">Frame ${g.frameNumber} · Best of ${g.bestOf}</div>
      <button class="appbar__btn" data-action="rules">Rules</button>
    </header>
    <div class="screen__body">
      <div class="tally"><span><b>${g.framesWon[0]}</b> &ndash; <b>${g.framesWon[1]}</b> frames</span><span class="tally__sep">First to ${g.framesToWin}</span></div>
      <div class="panels">${panels}</div>
      ${g.frameFresh ? breakoffChooser(g, name) : `
      <div class="status">
        <div class="status__next"><span class="status__label">Next</span>${nextDot}<span class="status__text">${nextText}</span></div>
        <div class="status__remain"><b>${g.pointsRemaining()}</b> remaining</div>
      </div>`}
      <div class="balls">${balls}</div>
      <div class="actions">
        <button class="act act--primary" data-action="endturn" ${f.isOver ? 'disabled' : ''}>End Turn</button>
        <button class="act act--warn" data-action="foul" ${f.isOver ? 'disabled' : ''}>Foul</button>
        <button class="act" data-action="undo" ${g.undoStack.length ? '' : 'disabled'}>Undo</button>
      </div>
      <div class="links">
        <button data-action="concede" ${f.isOver ? 'disabled' : ''}>Concede frame</button>
        <button data-action="restart">Restart frame</button>
        <button data-action="newmatch">New match</button>
      </div>
    </div>`;

  if (f.isOver) showSnookerResult();
}

function openFoulModal() {
  const opp = escapeHtml(App.gamePlayerName(App.snooker, 1 - App.snooker.frame.currentPlayer));
  openOverlay(`
    <h3>Foul</h3>
    <p class="muted">Penalty points to ${opp}</p>
    <div class="foul-grid">${[4, 5, 6, 7].map(p => `<button class="foul-btn" data-foul="${p}">${p}</button>`).join('')}</div>
    <button class="modal__cancel" data-cancel>Cancel</button>`);
  const o = document.getElementById('overlay');
  o.querySelectorAll('[data-foul]').forEach(b => b.onclick = () => {
    App.snooker.foul(parseInt(b.dataset.foul, 10));
    closeOverlay();
    afterSnooker();
  });
  o.querySelector('[data-cancel]').onclick = closeOverlay;
}

function showSnookerResult() {
  const g = App.snooker;
  const f = g.frame;
  const w = f.winner === null ? f.currentPlayer : f.winner;
  const matchOver = g.matchWinner !== null;
  openOverlay(`
    <div class="result__badge">${matchOver ? ICONS.trophy : ICONS.check}</div>
    <h3>${matchOver ? 'Match Won' : 'Frame Won'}</h3>
    <div class="result__name">${escapeHtml(App.gamePlayerName(g, w))}</div>
    <div class="result__score">${f.scores[0]} – ${f.scores[1]}</div>
    <p class="muted">Frames ${g.framesWon[0]} – ${g.framesWon[1]}</p>
    ${matchOver
      ? `<button class="primary" data-newmatch>New Match</button>`
      : `<button class="primary" data-next>Next Frame</button>`}`);
  const o = document.getElementById('overlay');
  const next = o.querySelector('[data-next]');
  if (next) next.onclick = () => { g.advanceFrame(); closeOverlay(); afterSnooker(); };
  const nm = o.querySelector('[data-newmatch]');
  if (nm) nm.onclick = () => { App.newSnooker(); closeOverlay(); afterSnooker(); };
}

/* ---------- billiards rendering ---------- */

function afterBilliards() { App.saveGames(); renderBilliards(); }

function cueDot(color) { return `<span class="cuedot cuedot--${color}"></span>`; }

function renderBilliards() {
  const g = App.billiards;
  if (!g) return;
  const name = i => escapeHtml(App.gamePlayerName(g, i));
  const cues = g.cues || ['white', 'yellow'];

  const panels = [0, 1].map(i => {
    const active = !g.isOver && g.currentPlayer === i;
    const leading = g.scores[i] > g.scores[1 - i];
    const toGo = g.pointsToGo(i);
    const turn = !active ? '&nbsp;'
      : (g.currentBreak > 0 ? `<span class="panel__turn--break">Break ${g.currentBreak}</span>` : 'At table');
    const stats = `
        <div class="stat"><span class="stat__value">${g.highBreaks[i]}</span><span class="stat__label">High break</span></div>
        ${toGo !== null ? `<div class="stat"><span class="stat__value">${toGo}</span><span class="stat__label">To go</span></div>` : ''}`;
    return `<div class="panel ${active ? 'panel--active' : ''}">
        <div class="panel__name">${cueDot(cues[i])} ${name(i)}</div>
        <div class="panel__score ${leading ? 'is-leading' : ''}">${g.scores[i]}</div>
        <div class="panel__turn">${turn}</div>
        <div class="panel__stats">${stats}</div>
      </div>`;
  }).join('');

  // Stroke buttons drawn from the current striker's point of view.
  const cue = cues[g.currentPlayer];
  const opp = cues[1 - g.currentPlayer];
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const renderStroke = s => {
    const label = s.object === 'opp' ? `${s.base} ${cap(opp)}` : s.base;
    const scene = s.scene.map(part => {
      const color = part.role === 'red' ? 'red' : (part.role === 'cue' ? cue : opp);
      const badge = part.badge === 'pot' ? '<span class="bbadge bbadge--pot">P</span>'
        : part.badge === 'inoff' ? '<span class="bbadge bbadge--inoff">↘</span>' : '';
      return `<span class="bball bball--${color}">${badge}</span>`;
    }).join('');
    return `
      <button class="stroke" data-action="score" data-key="${s.key}" ${g.isOver ? 'disabled' : ''}>
        <span class="stroke__balls">${scene}</span>
        <span class="stroke__label">${escapeHtml(label)}</span>
        <span class="stroke__val">+${s.value}</span>
        <span class="stroke__sub">${s.sub}</span>
      </button>`;
  };
  const strokes =
    BILLIARDS_STROKES.filter(s => s.group !== 'combo').map(renderStroke).join('') +
    '<div class="strokes__sep">Combinations · one stroke, one tap</div>' +
    BILLIARDS_STROKES.filter(s => s.group === 'combo').map(renderStroke).join('');

  document.getElementById('screen-billiards').innerHTML = `
    <header class="appbar">
      <button class="appbar__btn appbar__btn--icon" data-action="home">${ICONS.back}<span>Menu</span></button>
      <div class="appbar__title">English Billiards</div>
      <button class="appbar__btn" data-action="rules">Rules</button>
    </header>
    <div class="screen__body">
      <div class="tally"><span>${g.target ? `Target <b>${g.target}</b>` : 'No target'}</span><span class="tally__sep">${name(0)} v ${name(1)}</span></div>
      <div class="panels">${panels}</div>
      ${g.frameFresh ? breakoffChooser(g, name) + cueChooser(g) : ''}
      <div class="strokes">${strokes}</div>
      <div class="actions">
        <button class="act act--primary" data-action="endturn" ${g.isOver ? 'disabled' : ''}>End Break</button>
        ${g.target ? '' : `<button class="act" data-action="finish" ${g.isOver ? 'disabled' : ''}>Finish</button>`}
        <button class="act" data-action="undo" ${g.undoStack.length ? '' : 'disabled'}>Undo</button>
      </div>
      <div class="links">
        <button data-action="newgame">New game</button>
      </div>
    </div>`;

  if (g.isOver) showBilliardsResult();
}

function showBilliardsResult() {
  const g = App.billiards;
  const w = g.winner;
  openOverlay(`
    <div class="result__badge">${w === null ? ICONS.draw : ICONS.trophy}</div>
    <h3>${w === null ? 'Game Drawn' : 'Game Won'}</h3>
    ${w === null ? '' : `<div class="result__name">${escapeHtml(App.gamePlayerName(g, w))}</div>`}
    <div class="result__score">${g.scores[0]} – ${g.scores[1]}</div>
    <button class="primary" data-newgame>New Game</button>`);
  document.getElementById('overlay').querySelector('[data-newgame]').onclick = () => {
    App.newBilliards();
    closeOverlay();
    afterBilliards();
  };
}

/* ---------- statistics rendering ---------- */

const BUCKET_LABELS = ['1–9', '10–19', '20–49', '50–99', '100+'];

function bucketize(values) {
  const b = [0, 0, 0, 0, 0];
  values.forEach(v => {
    if (v >= 100) b[4]++;
    else if (v >= 50) b[3]++;
    else if (v >= 20) b[2]++;
    else if (v >= 10) b[1]++;
    else b[0]++;
  });
  return b;
}

// Records belonging to a profile: by id, or by name for older id-less records.
function recordsForProfile(records, profile) {
  return records.filter(r => (r.pid && r.pid === profile.id) || (!r.pid && r.p === profile.name));
}

function aggregateBreaks(records, profile) {
  const all = recordsForProfile(records, profile);
  // Exclude opening safety / break-off visits (before the first pot of a frame)
  // so they don't drag down averages and consistency.
  const visits = all.filter(r => !r.opening);
  const scoring = visits.filter(r => r.v > 0);
  const values = scoring.map(r => r.v);
  const sum = values.reduce((a, b) => a + b, 0);
  const allSum = visits.reduce((a, b) => a + b.v, 0);
  return {
    visits: visits.length,
    breaks: scoring.length,
    high: values.length ? Math.max.apply(null, values) : 0,
    avg: scoring.length ? sum / scoring.length : 0,
    ppv: visits.length ? allSum / visits.length : 0,
    c20: values.filter(v => v >= 20).length,
    c50: values.filter(v => v >= 50).length,
    c100: values.filter(v => v >= 100).length,
    consistency: visits.length ? (scoring.length / visits.length * 100) : 0,
    buckets: bucketize(values),
    breakOffs: all.filter(r => r.breakOff).length,
    safeties: all.filter(r => r.opening).length,
  };
}

function timeAgo(t) {
  if (!t) return '';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24); if (d < 7) return d + 'd ago';
  const w = Math.floor(d / 7); if (w < 5) return w + 'w ago';
  const mo = Math.floor(d / 30); if (mo < 12) return mo + 'mo ago';
  return Math.floor(d / 365) + 'y ago';
}

function gameToggle() {
  const game = App.statsGame;
  return `<div class="seg">
      <button class="seg__btn ${game === 'snooker' ? 'seg__btn--active' : ''}" data-action="stats-game" data-game="snooker">Snooker</button>
      <button class="seg__btn ${game === 'billiards' ? 'seg__btn--active' : ''}" data-action="stats-game" data-game="billiards">Billiards</button>
    </div>`;
}

function statDetail(a) {
  const rows = [
    ['Breaks made', a.breaks],
    ['Average break', a.avg ? a.avg.toFixed(1) : '—'],
    ['Points / visit', a.ppv ? a.ppv.toFixed(1) : '—'],
    ['Centuries (100+)', a.c100],
    ['Breaks 50+ / 20+', `${a.c50} / ${a.c20}`],
    ['Consistency', a.visits ? Math.round(a.consistency) + '%' : '—'],
    ['Break-offs', a.breakOffs],
    ['Visits (after opening)', a.visits],
  ].map(([k, v]) => `<div class="srow"><span>${k}</span><b>${v}</b></div>`).join('');

  const maxB = Math.max(1, a.buckets[0], a.buckets[1], a.buckets[2], a.buckets[3], a.buckets[4]);
  const dist = a.buckets.map((c, i) => `
      <div class="dist__row">
        <span class="dist__label">${BUCKET_LABELS[i]}</span>
        <span class="dist__bar"><span class="dist__fill" style="width:${Math.round(c / maxB * 100)}%"></span></span>
        <span class="dist__count">${c}</span>
      </div>`).join('');

  return `
    <div class="scard scard--wide">
      <div class="scard__high"><span class="scard__highnum">${a.high}</span><span class="scard__highlbl">Highest break</span></div>
      <div class="srows">${rows}</div>
      <h4 class="dist-h">Break sizes</h4>
      <div class="dist">${dist}</div>
    </div>`;
}

function breakLog(records, profile) {
  let items = records.filter(r => r.v > 0);
  if (profile) items = recordsForProfile(items, profile);
  items = items.sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, 60);
  if (!items.length) return '<div class="stats-empty">No breaks yet.</div>';
  return items.map(r => `
      <div class="logitem">
        <span class="logitem__val">${r.v}</span>
        <div class="logitem__meta">
          <span class="logitem__name">${profile ? (r.fr ? 'Frame ' + r.fr : 'Game') : escapeHtml(r.p)}</span>
          ${profile ? '' : `<span class="logitem__sub">${r.fr ? 'Frame ' + r.fr : 'Game'}</span>`}
        </div>
        <span class="logitem__time">${timeAgo(r.t)}</span>
      </div>`).join('');
}

/* Players (profile management + selection) */

function renderPlayers() {
  const profs = App.profiles;
  const opts = selId => profs.map(p => `<option value="${p.id}" ${p.id === selId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
  const list = profs.map(p => `
      <div class="prow">
        <input class="prow__name" data-rename="${p.id}" value="${escapeHtml(p.name)}" maxlength="20" aria-label="Player name" autocomplete="off" />
        <button class="prow__stats" data-viewstats="${p.id}">Stats ›</button>
        <button class="prow__del" data-del="${p.id}" aria-label="Delete player">✕</button>
      </div>`).join('');

  document.getElementById('players-body').innerHTML = `
    <h3 class="stats-h">Now playing</h3>
    <div class="nowplaying">
      <label class="field"><span class="field__label">Player 1</span><select class="field__input" data-sel="0">${opts(App.settings.players[0])}</select></label>
      <label class="field"><span class="field__label">Player 2</span><select class="field__input" data-sel="1">${opts(App.settings.players[1])}</select></label>
    </div>
    <p class="form__note">Whoever is selected here is tracked when you start a new game. Changing it updates a game that hasn’t been scored yet.</p>
    <h3 class="stats-h">Profiles</h3>
    <div class="plist">${list}</div>
    <div class="addrow">
      <input id="add-name" class="field__input" type="text" placeholder="Add a player…" maxlength="20" autocomplete="off" />
      <button class="btn btn--primary" data-action="add-profile">Save</button>
    </div>`;
}

/* Individual player stats */

function renderPlayer() {
  const prof = App.profileById(App.viewProfileId);
  if (!prof) { showScreen('players'); return; }
  document.getElementById('player-name').textContent = prof.name;

  const game = App.statsGame;
  const records = App.allRecords().filter(r => r.g === game);
  const a = aggregateBreaks(records, prof);
  const label = game === 'snooker' ? 'snooker' : 'billiards';

  let body;
  if (a.breaks === 0) {
    body = gameToggle() + `<div class="stats-empty">No ${label} breaks recorded for ${escapeHtml(prof.name)} yet.</div>`;
  } else {
    body = gameToggle() + statDetail(a) +
      `<h3 class="stats-h">Recent breaks</h3><div class="log">${breakLog(records, prof)}</div>`;
  }
  document.getElementById('player-body').innerHTML = body;
}

/* Leaderboard */

function renderLeaderboard() {
  const game = App.statsGame;
  const metric = App.leaderMetric;
  const records = App.allRecords().filter(r => r.g === game);
  const rows = App.profiles
    .map(p => ({ p, a: aggregateBreaks(records, p) }))
    .filter(x => x.a.breaks > 0)
    .sort((x, y) => metricValue(y.a, metric) - metricValue(x.a, metric));

  const metricDef = LEADER_METRICS.find(m => m.key === metric) || LEADER_METRICS[0];
  const metricSel = `<select class="field__input" data-metric>${LEADER_METRICS.map(m => `<option value="${m.key}" ${m.key === metric ? 'selected' : ''}>${m.label}</option>`).join('')}</select>`;

  let listHtml;
  if (!rows.length) {
    listHtml = `<div class="stats-empty">No ${game} breaks recorded yet.<br>Play some frames and your players will be ranked here.</div>`;
  } else {
    listHtml = '<div class="lb">' + rows.map((x, i) => `
        <div class="lbrow" data-viewstats="${x.p.id}">
          <span class="lbrank ${i < 3 ? 'lbrank--' + (i + 1) : ''}">${i + 1}</span>
          <span class="lbname">${escapeHtml(x.p.name)}</span>
          <span class="lbval">${metricDef.fmt(x.a)}</span>
        </div>`).join('') + '</div>';
  }

  document.getElementById('leaderboard-body').innerHTML =
    gameToggle() +
    `<label class="field"><span class="field__label">Rank by</span>${metricSel}</label>` +
    listHtml +
    (rows.length ? `<button class="cleared" data-action="clear-stats">Clear all statistics</button>` : '');
}

function confirmDeleteProfile(id) {
  const p = App.profileById(id);
  openOverlay(`
    <h3>Delete player</h3>
    <p class="muted">Remove ${p ? escapeHtml(p.name) : 'this player'}? Their recorded breaks stay in the history, but the profile is removed and at least two players are always kept.</p>
    <button class="primary primary--danger" data-confirm>Delete player</button>
    <button class="modal__cancel" data-cancel style="margin-top:10px">Cancel</button>`);
  const o = document.getElementById('overlay');
  o.querySelector('[data-confirm]').onclick = () => { App.deleteProfile(id); closeOverlay(); renderPlayers(); App._updateHomePlayers(); };
  o.querySelector('[data-cancel]').onclick = closeOverlay;
}

function confirmClearStats() {
  openOverlay(`
    <h3>Clear statistics</h3>
    <p class="muted">This permanently deletes every recorded break for both games. It can’t be undone.</p>
    <button class="primary primary--danger" data-clear>Delete all stats</button>
    <button class="modal__cancel" data-cancel style="margin-top:10px">Cancel</button>`);
  const o = document.getElementById('overlay');
  o.querySelector('[data-clear]').onclick = () => { App.clearStats(); closeOverlay(); renderLeaderboard(); };
  o.querySelector('[data-cancel]').onclick = closeOverlay;
}

/* ---------- boot ---------- */

window.addEventListener('DOMContentLoaded', () => App.init());
