/* App controller: navigation, settings, persistence, rendering. */

const KEYS = { settings: 'cue_settings', snooker: 'cue_snooker', billiards: 'cue_billiards', stats: 'cue_stats' };

const ICONS = {
  back: '<svg class="ico" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
  trophy: '<svg class="ico ico--lg" viewBox="0 0 24 24"><path d="M8 4.5h8v4a4 4 0 0 1-8 0v-4Z"/><path d="M8 6H5.5v1A3 3 0 0 0 8.5 10"/><path d="M16 6h2.5v1A3 3 0 0 1 15.5 10"/><path d="M12 12.5V16"/><path d="M9.5 19.5h5"/><path d="M10.5 19.5l.4-3.5h2.2l.4 3.5"/></svg>',
  check: '<svg class="ico ico--lg" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
  draw: '<svg class="ico ico--lg" viewBox="0 0 24 24"><path d="M5 9.5h14M5 14.5h14"/></svg>',
};

const App = {
  settings: { playerNames: ['Player 1', 'Player 2'], snookerBestOf: 5, snookerReds: 15, billiardsTarget: 100 },
  snooker: null,
  billiards: null,
  currentScreen: 'home',
  statsGame: 'snooker',

  init() {
    this._loadSettings();
    this._loadGames();
    this._bindNav();
    this._bindSettingsForm();
    this._bindGameDelegation();
    this._fillSettingsForm();
    this._updateHomePlayers();
    this._registerServiceWorker();
    showScreen('home');
  },

  playerName(i) {
    const n = (this.settings.playerNames[i] || '').trim();
    return n || ('Player ' + (i + 1));
  },

  newSnooker() {
    this._flushBreaks(this.snooker, 'snooker');
    this.snooker = new SnookerGame(this.settings.snookerBestOf, this.settings.snookerReds);
    this.saveGames();
  },

  newBilliards() {
    this._flushBreaks(this.billiards, 'billiards');
    this.billiards = new BilliardsGame(this.settings.billiardsTarget);
    this.saveGames();
  },

  // --- break statistics (all-time) ---

  loadStats() {
    try { const s = JSON.parse(localStorage.getItem(KEYS.stats)); if (s && Array.isArray(s.log)) return s; } catch (e) { /* ignore */ }
    return { log: [] };
  },

  saveStats(s) { try { localStorage.setItem(KEYS.stats, JSON.stringify(s)); } catch (e) { /* ignore */ } },

  // Move a finished game's visits into the persisted all-time log.
  _flushBreaks(game, type) {
    if (!game || !game.breaks || !game.breaks.length) return;
    const stats = this.loadStats();
    game.breaks.forEach(b => stats.log.push({
      g: type, p: this.playerName(b.player), v: b.value, s: b.scored, fr: b.frame || null, t: b.t || Date.now(),
    }));
    if (stats.log.length > 5000) stats.log = stats.log.slice(-5000);
    this.saveStats(stats);
    game.breaks = [];
  },

  // All-time records = persisted log + live (not-yet-flushed) breaks of current games.
  allRecords() {
    const out = this.loadStats().log.slice();
    const live = (game, type) => {
      if (!game || !game.breaks) return;
      game.breaks.forEach(b => out.push({ g: type, p: this.playerName(b.player), v: b.value, s: b.scored, fr: b.frame || null, t: b.t || 0 }));
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
      if (s && Array.isArray(s.playerNames)) {
        this.settings = Object.assign(this.settings, s);
      }
    } catch (e) { /* ignore */ }
  },

  _saveSettings() {
    try { localStorage.setItem(KEYS.settings, JSON.stringify(this.settings)); } catch (e) { /* ignore */ }
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
    document.getElementById('set-name-0').value = this.settings.playerNames[0] === 'Player 1' ? '' : this.settings.playerNames[0];
    document.getElementById('set-name-1').value = this.settings.playerNames[1] === 'Player 2' ? '' : this.settings.playerNames[1];

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
    const onName = (i, el) => {
      this.settings.playerNames[i] = el.value;
      this._saveSettings();
      this._updateHomePlayers();
      this._renderActive();
    };
    document.getElementById('set-name-0').addEventListener('input', e => onName(0, e.target));
    document.getElementById('set-name-1').addEventListener('input', e => onName(1, e.target));

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
        case 'score': g.score(t.dataset.key); afterBilliards(); break;
        case 'endturn': g.endTurn(); afterBilliards(); break;
        case 'undo': g.undo(); afterBilliards(); break;
        case 'finish': g.finishGame(); afterBilliards(); break;
        case 'newgame': App.newBilliards(); afterBilliards(); break;
      }
    });

    document.getElementById('screen-stats').addEventListener('click', e => {
      const t = e.target.closest('[data-action]');
      if (!t) return;
      if (t.dataset.action === 'stats-game') { this.statsGame = t.dataset.game; renderStats(); }
      else if (t.dataset.action === 'clear-stats') { confirmClearStats(); }
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
  if (id === 'stats') renderStats();
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

function renderSnooker() {
  const g = App.snooker;
  if (!g) return;
  const f = g.frame;
  const legal = g.legalKeys();
  const name = i => escapeHtml(App.playerName(i));

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
          <div class="stat"><span class="stat__value">${f.highBreaks[i]}</span><span class="stat__label">High break</span></div>
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
      <div class="status">
        <div class="status__next"><span class="status__label">Next</span>${nextDot}<span class="status__text">${nextText}</span></div>
        <div class="status__remain"><b>${g.pointsRemaining()}</b> remaining</div>
      </div>
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
  const opp = escapeHtml(App.playerName(1 - App.snooker.frame.currentPlayer));
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
    <div class="result__name">${escapeHtml(App.playerName(w))}</div>
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

function renderBilliards() {
  const g = App.billiards;
  if (!g) return;
  const name = i => escapeHtml(App.playerName(i));

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
        <div class="panel__name">${name(i)}</div>
        <div class="panel__score ${leading ? 'is-leading' : ''}">${g.scores[i]}</div>
        <div class="panel__turn">${turn}</div>
        <div class="panel__stats">${stats}</div>
      </div>`;
  }).join('');

  const strokes = BILLIARDS_STROKES.map(s => {
    const balls = s.balls.map(c => `<span class="bball bball--${c}"></span>`).join('');
    return `
      <button class="stroke" data-action="score" data-key="${s.key}" ${g.isOver ? 'disabled' : ''}>
        <span class="stroke__balls">${balls}</span>
        <span class="stroke__label">${s.label}</span>
        <span class="stroke__val">+${s.value}</span>
        <span class="stroke__sub">${s.sub}</span>
      </button>`;
  }).join('');

  document.getElementById('screen-billiards').innerHTML = `
    <header class="appbar">
      <button class="appbar__btn appbar__btn--icon" data-action="home">${ICONS.back}<span>Menu</span></button>
      <div class="appbar__title">English Billiards</div>
      <button class="appbar__btn" data-action="rules">Rules</button>
    </header>
    <div class="screen__body">
      <div class="tally"><span>${g.target ? `Target <b>${g.target}</b>` : 'No target'}</span><span class="tally__sep">${name(0)} v ${name(1)}</span></div>
      <div class="panels">${panels}</div>
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
    ${w === null ? '' : `<div class="result__name">${escapeHtml(App.playerName(w))}</div>`}
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

function aggregateBreaks(records, name) {
  const visits = records.filter(r => r.p === name);
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

function statCard(name, a) {
  const rows = [
    ['Breaks made', a.breaks],
    ['Average break', a.avg ? a.avg.toFixed(1) : '—'],
    ['Points / visit', a.ppv ? a.ppv.toFixed(1) : '—'],
    ['20+ / 50+ / 100+', `${a.c20} / ${a.c50} / ${a.c100}`],
    ['Consistency', a.visits ? Math.round(a.consistency) + '%' : '—'],
  ].map(([k, v]) => `<div class="srow"><span>${k}</span><b>${v}</b></div>`).join('');

  const maxB = Math.max(1, a.buckets[0], a.buckets[1], a.buckets[2], a.buckets[3], a.buckets[4]);
  const dist = a.buckets.map((c, i) => `
      <div class="dist__row">
        <span class="dist__label">${BUCKET_LABELS[i]}</span>
        <span class="dist__bar"><span class="dist__fill" style="width:${Math.round(c / maxB * 100)}%"></span></span>
        <span class="dist__count">${c}</span>
      </div>`).join('');

  return `
    <div class="scard">
      <div class="scard__name">${escapeHtml(name)}</div>
      <div class="scard__high"><span class="scard__highnum">${a.high}</span><span class="scard__highlbl">Highest break</span></div>
      <div class="srows">${rows}</div>
      <div class="dist">${dist}</div>
    </div>`;
}

function breakLog(records) {
  const items = records.filter(r => r.v > 0).sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, 60);
  if (!items.length) return '';
  return items.map(r => `
      <div class="logitem">
        <span class="logitem__val">${r.v}</span>
        <div class="logitem__meta">
          <span class="logitem__name">${escapeHtml(r.p)}</span>
          <span class="logitem__sub">${r.fr ? 'Frame ' + r.fr : 'Game'}</span>
        </div>
        <span class="logitem__time">${timeAgo(r.t)}</span>
      </div>`).join('');
}

function renderStats() {
  const game = App.statsGame;
  const records = App.allRecords().filter(r => r.g === game);
  const names = [App.playerName(0), App.playerName(1)];
  const label = game === 'snooker' ? 'snooker' : 'billiards';

  const toggle = `
    <div class="seg">
      <button class="seg__btn ${game === 'snooker' ? 'seg__btn--active' : ''}" data-action="stats-game" data-game="snooker">Snooker</button>
      <button class="seg__btn ${game === 'billiards' ? 'seg__btn--active' : ''}" data-action="stats-game" data-game="billiards">Billiards</button>
    </div>`;

  let body;
  if (!records.some(r => r.v > 0)) {
    body = `<div class="stats-empty">No ${label} breaks recorded yet.<br>Play a few visits and your stats will build up here automatically.</div>`;
  } else {
    const cards = names.map(n => statCard(n, aggregateBreaks(records, n))).join('');
    body = `
      <div class="statcards">${cards}</div>
      <h3 class="stats-h">Recent breaks</h3>
      <div class="log">${breakLog(records)}</div>
      <button class="cleared" data-action="clear-stats">Clear all statistics</button>`;
  }

  document.getElementById('stats-body').innerHTML = toggle + body;
}

function confirmClearStats() {
  openOverlay(`
    <h3>Clear statistics</h3>
    <p class="muted">This permanently deletes every recorded break for both games. It can’t be undone.</p>
    <button class="primary primary--danger" data-clear>Delete all stats</button>
    <button class="modal__cancel" data-cancel style="margin-top:10px">Cancel</button>`);
  const o = document.getElementById('overlay');
  o.querySelector('[data-clear]').onclick = () => { App.clearStats(); closeOverlay(); renderStats(); };
  o.querySelector('[data-cancel]').onclick = closeOverlay;
}

/* ---------- boot ---------- */

window.addEventListener('DOMContentLoaded', () => App.init());
