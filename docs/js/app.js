/* App controller: navigation, settings, persistence, rendering. */

const KEYS = { settings: 'cue_settings', snooker: 'cue_snooker', billiards: 'cue_billiards' };

const App = {
  settings: { playerNames: ['Player 1', 'Player 2'], snookerBestOf: 5, snookerReds: 15, billiardsTarget: 100 },
  snooker: null,
  billiards: null,
  currentScreen: 'home',

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
    this.snooker = new SnookerGame(this.settings.snookerBestOf, this.settings.snookerReds);
    this.saveGames();
  },

  newBilliards() {
    this.billiards = new BilliardsGame(this.settings.billiardsTarget);
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
    return `<div class="panel ${active ? 'panel--active' : ''}">
        <div class="panel__name">${active ? '<span class="dot"></span>' : ''}${name(i)}</div>
        <div class="panel__score ${leading ? 'is-leading' : ''}">${f.scores[i]}</div>
        <div class="panel__meta"><span>🏆 ${g.framesWon[i]}</span><span>🔥 ${f.highBreaks[i]}</span></div>
        ${active && f.currentBreak > 0 ? `<div class="panel__break">Break ${f.currentBreak}</div>` : ''}
      </div>`;
  }).join('');

  const balls = SNOOKER_BALLS.map(b => {
    const isLegal = legal.includes(b.key);
    const badge = (b.key === 'red' && isLegal) ? `<span class="ball__badge">×${f.redsRemaining}</span>` : '';
    return `<button class="ball ball--${b.key} ${isLegal ? '' : 'is-disabled'}" data-action="pot" data-key="${b.key}" ${isLegal ? '' : 'disabled'}>
        <span class="ball__val">${b.value}</span>${badge}
      </button>`;
  }).join('');

  document.getElementById('screen-snooker').innerHTML = `
    <header class="appbar">
      <button class="appbar__btn" data-action="home">‹ Menu</button>
      <div class="appbar__title">Frame ${g.frameNumber} · Best of ${g.bestOf}</div>
      <button class="appbar__btn" data-action="rules">Rules</button>
    </header>
    <div class="screen__body">
      <div class="tally"><span><b>${g.framesWon[0]}</b> frames <b>${g.framesWon[1]}</b></span><span>First to ${g.framesToWin}</span></div>
      <div class="panels">${panels}</div>
      <div class="status"><span>🎯 ${g.nextUp()}</span><span>${g.pointsRemaining()} pts left</span></div>
      <div class="balls">${balls}</div>
      <div class="actions">
        <button class="act act--blue" data-action="endturn" ${f.isOver ? 'disabled' : ''}>End Turn</button>
        <button class="act act--orange" data-action="foul" ${f.isOver ? 'disabled' : ''}>Foul</button>
        <button class="act act--grey" data-action="undo" ${g.undoStack.length ? '' : 'disabled'}>Undo</button>
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
    <div class="result__icon">${matchOver ? '🏆' : '✅'}</div>
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
    return `<div class="panel ${active ? 'panel--active' : ''}">
        <div class="panel__name">${active ? '<span class="dot"></span>' : ''}${name(i)}</div>
        <div class="panel__score ${leading ? 'is-leading' : ''}">${g.scores[i]}</div>
        <div class="panel__meta"><span>🔥 ${g.highBreaks[i]}</span>${toGo !== null ? `<span>${toGo} to go</span>` : ''}</div>
        ${active && g.currentBreak > 0 ? `<div class="panel__break">Break ${g.currentBreak}</div>` : ''}
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
      <button class="appbar__btn" data-action="home">‹ Menu</button>
      <div class="appbar__title">English Billiards</div>
      <button class="appbar__btn" data-action="rules">Rules</button>
    </header>
    <div class="screen__body">
      <div class="tally"><span>${g.target ? `Target ${g.target}` : 'No target'}</span><span>${name(0)} v ${name(1)}</span></div>
      <div class="panels">${panels}</div>
      <div class="strokes">${strokes}</div>
      <div class="actions">
        <button class="act act--blue" data-action="endturn" ${g.isOver ? 'disabled' : ''}>End Break</button>
        ${g.target ? '' : `<button class="act act--green" data-action="finish" ${g.isOver ? 'disabled' : ''}>Finish</button>`}
        <button class="act act--grey" data-action="undo" ${g.undoStack.length ? '' : 'disabled'}>Undo</button>
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
    <div class="result__icon">${w === null ? '🤝' : '🏆'}</div>
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

/* ---------- boot ---------- */

window.addEventListener('DOMContentLoaded', () => App.init());
