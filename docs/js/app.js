/* App controller: navigation, settings, persistence, rendering. */

const KEYS = { settings: 'cue_settings', snooker: 'cue_snooker', billiards: 'cue_billiards', stats: 'cue_stats', profiles: 'cue_profiles' };

// Leaderboard metrics operate on a full per-profile summary {breaks, frames, matches}.
// `val` is used for ranking (higher = better; -1 hides players with no data).
const LEADER_METRICS = [
  { key: 'high',       label: 'Highest break',  val: s => s.breaks.high,            fmt: s => s.breaks.high },
  { key: 'c100',       label: 'Centuries (100+)', val: s => s.breaks.ms[6],         fmt: s => s.breaks.ms[6] },
  { key: 'avg',        label: 'Average break',   val: s => s.breaks.avg,            fmt: s => (s.breaks.avg ? s.breaks.avg.toFixed(1) : '0') },
  { key: 'breaks',     label: 'Breaks made',     val: s => s.breaks.breaks,         fmt: s => s.breaks.breaks },
  { key: 'framesWon',  label: 'Frames won',      val: s => s.frames.won,            fmt: s => s.frames.won },
  { key: 'matchesWon', label: 'Matches won',     val: s => (s.matches ? s.matches.won : 0), fmt: s => (s.matches ? s.matches.won : 0) },
  { key: 'winPct',     label: 'Frame win %',     val: s => (s.frames.played ? s.frames.winPct : -1), fmt: s => (s.frames.played ? Math.round(s.frames.winPct) + '%' : '—') },
  { key: 'potPct',     label: 'Pot success %',   val: s => ((s.frames.pots + s.frames.misses) ? s.frames.potPct : -1), fmt: s => ((s.frames.pots + s.frames.misses) ? Math.round(s.frames.potPct) + '%' : '—') },
  { key: 'consistency', label: 'Consistency',    val: s => (s.breaks.visits ? s.breaks.consistency : -1), fmt: s => (s.breaks.visits ? Math.round(s.breaks.consistency) + '%' : '—') },
];

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
  drill: null,          // active DrillSession
  drillGame: 'snooker', // drills list filter
  setupDrillId: null,

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
    setInterval(tickTimers, 1000);
    showScreen('home');
  },

  // --- profiles ---

  _newId() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },

  profileById(id) { return this.profiles.find(p => p.id === id) || null; },

  profileName(id, fallbackIndex) {
    if (typeof id === 'string' && id.slice(-3) === '::2') {
      const base = this.profileById(id.slice(0, -3));
      return base ? base.name + ' (2)' : 'Player (2)';
    }
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

  // soloPid: a profile id for a solo game (you play both sides; seat 1 is
  // "<you> (2)"). undefined = inherit the current game's mode; null = normal.
  newSnooker(soloPid) {
    if (soloPid === undefined) soloPid = (this.snooker && this.snooker.solo) ? this.snooker.soloPid : null;
    this._flushBreaks(this.snooker, 'snooker');
    this.snooker = new SnookerGame(this.settings.snookerBestOf, this.settings.snookerReds);
    this.snooker.solo = !!soloPid;
    this.snooker.soloPid = soloPid || null;
    this.snooker.players = soloPid ? [soloPid, soloSideId(soloPid)] : this.settings.players.slice();
    this.saveGames();
  },

  newBilliards(soloPid) {
    if (soloPid === undefined) soloPid = (this.billiards && this.billiards.solo) ? this.billiards.soloPid : null;
    this._flushBreaks(this.billiards, 'billiards');
    this.billiards = new BilliardsGame(this.settings.billiardsTarget);
    this.billiards.solo = !!soloPid;
    this.billiards.soloPid = soloPid || null;
    this.billiards.players = soloPid ? [soloPid, soloSideId(soloPid)] : this.settings.players.slice();
    this.saveGames();
  },

  // --- break statistics (all-time) ---

  loadStats() {
    let s = { log: [], frames: [], matches: [], bgames: [], drills: [] };
    try {
      const loaded = JSON.parse(localStorage.getItem(KEYS.stats));
      if (loaded && Array.isArray(loaded.log)) s = loaded;
    } catch (e) { /* ignore */ }
    // ensure newer arrays exist on older saves
    s.frames = s.frames || [];
    s.matches = s.matches || [];
    s.bgames = s.bgames || [];
    s.drills = s.drills || [];
    return s;
  },

  // --- drills ---

  startDrill(drillId, opts) {
    const d = drillById(drillId);
    if (!d) return;
    this.drill = new DrillSession(d, opts);
    showScreen('drill');
  },

  finishDrill() {
    if (!this.drill) return;
    const results = this.drill.results();
    if (results.length) {
      const stats = this.loadStats();
      results.forEach(r => stats.drills.push(r));
      if (stats.drills.length > 5000) stats.drills = stats.drills.slice(-5000);
      this.saveStats(stats);
    }
    this.drill = null;
  },

  allDrillRecords() { return this.loadStats().drills; },

  saveStats(s) { try { localStorage.setItem(KEYS.stats, JSON.stringify(s)); } catch (e) { /* ignore */ } },

  _seatId(game, seat) {
    const players = (game && game.players) || this.settings.players;
    return players ? players[seat] : null;
  },

  // Move a finished game's visits, frames and match result into persisted stats.
  _flushBreaks(game, type) {
    if (!game) return;
    const hasData = (game.breaks && game.breaks.length) ||
      (game.frameLog && game.frameLog.length) || game.isOver;
    if (!hasData) return;
    const stats = this.loadStats();

    (game.breaks || []).forEach(b => {
      const pid = this._seatId(game, b.player);
      stats.log.push({ g: type, pid, p: this.profileName(pid, b.player), v: b.value, s: b.scored, fr: b.frame || null, opening: !!b.opening, breakOff: !!b.breakOff, t: b.t || Date.now() });
    });
    if (stats.log.length > 5000) stats.log = stats.log.slice(-5000);

    const pids = (game.players || this.settings.players || []).slice();

    if (type === 'snooker') {
      (game.frameLog || []).forEach(fr => {
        stats.frames.push({
          g: 'snooker', pids, winner: pids[fr.winner],
          scores: fr.scores, durationMs: fr.durationMs, breaker: pids[fr.breaker],
          pots: fr.pots, misses: fr.misses, safeties: fr.safeties, fouls: fr.fouls,
          casual: !!game.casual, t: Date.now(),
        });
      });
      if (game.matchWinner !== null && !game.casual) {
        stats.matches.push({ g: 'snooker', pids, winner: pids[game.matchWinner], framesWon: game.framesWon.slice(), t: Date.now() });
      }
    } else if (type === 'billiards' && game.isOver) {
      stats.bgames.push({
        g: 'billiards', pids,
        winner: game.winner === null ? null : pids[game.winner],
        scores: game.scores.slice(), durationMs: (game.startTime && game.endTime) ? (game.endTime - game.startTime) : 0,
        t: Date.now(),
      });
    }

    this.saveStats(stats);
    game.breaks = [];
    if (game.frameLog) game.frameLog = [];
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

  // Completed snooker frames = persisted + the current match's not-yet-flushed frames.
  allFrames() {
    const out = this.loadStats().frames.slice();
    const g = this.snooker;
    if (g && g.frameLog && g.frameLog.length) {
      const pids = (g.players || this.settings.players || []);
      g.frameLog.forEach(fr => out.push({
        g: 'snooker', pids, winner: pids[fr.winner], scores: fr.scores,
        durationMs: fr.durationMs, breaker: pids[fr.breaker],
        pots: fr.pots, misses: fr.misses, safeties: fr.safeties, fouls: fr.fouls, casual: !!g.casual,
      }));
    }
    return out;
  },

  allMatches() {
    const out = this.loadStats().matches.slice();
    const g = this.snooker;
    if (g && g.matchWinner !== null && !g.casual) {
      const pids = (g.players || this.settings.players || []);
      out.push({ g: 'snooker', pids, winner: pids[g.matchWinner], framesWon: g.framesWon.slice() });
    }
    return out;
  },

  allBilliardsGames() {
    const out = this.loadStats().bgames.slice();
    const g = this.billiards;
    if (g && g.isOver) {
      const pids = (g.players || this.settings.players || []);
      out.push({
        g: 'billiards', pids, winner: g.winner === null ? null : pids[g.winner],
        scores: g.scores.slice(), durationMs: (g.startTime && g.endTime) ? (g.endTime - g.startTime) : 0,
      });
    }
    return out;
  },

  clearStats() {
    this.saveStats({ log: [], frames: [], matches: [], bgames: [], drills: [] });
    if (this.snooker) { this.snooker.breaks = []; this.snooker.frameLog = []; }
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
      if (a && a.frame) { const g = new SnookerGame(a.bestOf, a.reds); Object.assign(g, a); this._migrateSnooker(g); this.snooker = g; }
    } catch (e) { /* ignore */ }
    try {
      const b = JSON.parse(localStorage.getItem(KEYS.billiards));
      if (b && Array.isArray(b.scores)) { const g = new BilliardsGame(b.target); Object.assign(g, b); this._migrateBilliards(g); this.billiards = g; }
    } catch (e) { /* ignore */ }
  },

  // Backfill fields added after a save was made, and convert an old in-progress
  // frame (which had a pre-selected break-off player) to the new "pick first" model.
  _migrateSnooker(g) {
    if (!Array.isArray(g.frameLog)) g.frameLog = [];
    if (!Array.isArray(g.breaks)) g.breaks = [];
    const f = g.frame;
    if (f.pots === undefined) f.pots = [0, 0];
    if (f.misses === undefined) f.misses = [0, 0];
    if (f.safeties === undefined) f.safeties = [0, 0];
    if (f.fouls === undefined) f.fouls = [0, 0];
    if (f.endTime === undefined) f.endTime = null;
    if (f.startTime === undefined) {
      f.startTime = null;
      // old fresh frame: require a break-off pick instead of pre-selecting
      if (!f.isOver && f.visits === 0 && f.currentBreak === 0 && f.scores[0] === 0 && f.scores[1] === 0) {
        f.currentPlayer = null;
        f.breaker = null;
      }
    }
  },

  _migrateBilliards(g) {
    if (!Array.isArray(g.breaks)) g.breaks = [];
    if (g.endTime === undefined) g.endTime = null;
    if (g.startTime === undefined) {
      g.startTime = null;
      if (!g.isOver && g.visits === 0 && g.currentBreak === 0 && g.scores[0] === 0 && g.scores[1] === 0) {
        g.currentPlayer = null;
        g.breaker = null;
      }
    }
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
      if (dst === 'snooker' && (!this.snooker || this.snooker.frame.isOver)) this.newSnooker(null);
      if (dst === 'billiards' && (!this.billiards || this.billiards.isOver)) this.newBilliards(null);
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
        case 'safety': g.safety(); afterSnooker(); break;
        case 'miss': g.miss(); afterSnooker(); break;
        case 'foul': openFoulModal(); break;
        case 'undo': g.undo(); afterSnooker(); break;
        case 'concede': openConcedeModal(); break;
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
        case 'miss': g.endTurn(); afterBilliards(); break;
        case 'foul': g.foul(); afterBilliards(); break;
        case 'undo': g.undo(); afterBilliards(); break;
        case 'finish': g.finishGame(); afterBilliards(); break;
        case 'concede': openBilliardsConcede(); break;
        case 'leave': confirmLeaveBilliards(); break;
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

    // Drills list
    document.getElementById('screen-drills').addEventListener('click', e => {
      const t = e.target.closest('[data-action]');
      if (!t) return;
      if (t.dataset.action === 'drill-game') { this.drillGame = t.dataset.game; renderDrills(); }
      else if (t.dataset.action === 'pick-drill') { this.setupDrillId = t.dataset.drill; showScreen('drill-setup'); }
      else if (t.dataset.action === 'solo-game') { openSoloPicker(); }
    });

    // Drill setup
    const setup = document.getElementById('screen-drill-setup');
    setup.addEventListener('click', e => {
      const t = e.target.closest('[data-action]');
      if (!t) return;
      if (t.dataset.action === 'start-drill') startDrillFromSetup();
      else if (t.dataset.action === 'setup-mode' || t.dataset.action === 'setup-reds' || t.dataset.action === 'setup-colour') {
        handleSetupToggle(t.dataset);
      }
    });
    setup.addEventListener('change', e => {
      const sel = e.target.closest('[data-setupsel]');
      if (sel) { DRILL_SETUP[sel.dataset.setupsel] = sel.value; renderDrillSetup(); }
    });

    // Drill play
    document.getElementById('screen-drill').addEventListener('click', e => {
      const t = e.target.closest('[data-action]');
      if (!t || t.disabled) return;
      const g = this.drill;
      switch (t.dataset.action) {
        case 'drill-exit': this.finishDrill(); showScreen('drills'); break;
        case 'drill-press': g.press(t.dataset.key); afterDrill(); break;
        case 'drill-miss': g.miss(); afterDrill(); break;
        case 'drill-undo': g.undo(); afterDrill(); break;
        case 'drill-finish': openDrillSummary(); break;
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

// Derived id for the "second side" of a solo game (you playing both sides).
function soloSideId(pid) { return pid + '::2'; }

function fmtElapsed(start, end) {
  if (!start) return '0:00';
  const ms = (end || Date.now()) - start;
  const s = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// A subtle frame timer. Live while the game is running (ticks via interval),
// frozen once `end` is set.
function timerChip(start, end) {
  if (!start) return '';
  const live = end ? '' : ` data-timer="${start}"`;
  return ` · <span class="timer"${live}>${fmtElapsed(start, end)}</span>`;
}

function tickTimers() {
  document.querySelectorAll('[data-timer]').forEach(el => {
    el.textContent = fmtElapsed(parseInt(el.getAttribute('data-timer'), 10), null);
  });
}

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
  if (id === 'drills') renderDrills();
  if (id === 'drill-setup') renderDrillSetup();
  if (id === 'drill') renderDrillPlay();
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
      <div class="appbar__title">${g.solo ? 'Solo · ' : ''}Frame ${g.frameNumber} · Best of ${g.bestOf}</div>
      <button class="appbar__btn" data-action="rules">Rules</button>
    </header>
    <div class="screen__body">
      <div class="tally">
        <span><b>${g.framesWon[0]}</b> &ndash; <b>${g.framesWon[1]}</b> ${g.casual ? 'casual frame' : 'frames'}</span>
        <span class="tally__sep">${g.casual ? 'Single frame' : 'First to ' + g.framesToWin}${timerChip(g.frame.startTime, g.frame.endTime)}</span>
      </div>
      <div class="panels">${panels}</div>
      ${g.frameFresh ? breakoffChooser(g, name) : `
      <div class="status">
        <div class="status__next"><span class="status__label">Next</span>${nextDot}<span class="status__text">${nextText}</span></div>
        <div class="status__remain"><b>${g.pointsRemaining()}</b> remaining</div>
      </div>`}
      <div class="balls">${balls}</div>
      <div class="actions">
        <button class="act act--primary" data-action="safety" ${f.isOver || !g.started ? 'disabled' : ''}>Safety</button>
        <button class="act act--primary" data-action="miss" ${f.isOver || !g.started ? 'disabled' : ''}>Miss</button>
        <button class="act act--warn" data-action="foul" ${f.isOver || !g.started ? 'disabled' : ''}>Foul</button>
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

function openConcedeModal() {
  const g = App.snooker;
  if (g.frame.isOver) return;
  openOverlay(`
    <h3>Concede frame</h3>
    <p class="muted">Who is conceding?</p>
    <div class="foul-grid" style="grid-template-columns:1fr 1fr">
      <button class="foul-btn" data-loser="0" style="font-size:16px">${escapeHtml(App.gamePlayerName(g, 0))}</button>
      <button class="foul-btn" data-loser="1" style="font-size:16px">${escapeHtml(App.gamePlayerName(g, 1))}</button>
    </div>
    <button class="modal__cancel" data-cancel>Cancel</button>`);
  const o = document.getElementById('overlay');
  o.querySelectorAll('[data-loser]').forEach(b => b.onclick = () => {
    g.concede(parseInt(b.dataset.loser, 10));
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
  const isMatch = matchOver && !g.casual;     // best-of-1 is a casual frame, not a match
  openOverlay(`
    <div class="result__badge">${isMatch ? ICONS.trophy : ICONS.check}</div>
    <h3>${isMatch ? 'Match Won' : 'Frame Won'}</h3>
    <div class="result__name">${escapeHtml(App.gamePlayerName(g, w))}</div>
    <div class="result__score">${f.scores[0]} – ${f.scores[1]}</div>
    ${g.casual ? '' : `<p class="muted">Frames ${g.framesWon[0]} – ${g.framesWon[1]}</p>`}
    ${matchOver
      ? `<button class="primary" data-newmatch>${g.casual ? 'Play Again' : 'New Match'}</button>`
      : `<button class="primary" data-next>Next Frame</button>`}
    <button class="modal__cancel" data-menu style="margin-top:10px">Main menu</button>`);
  const o = document.getElementById('overlay');
  const next = o.querySelector('[data-next]');
  if (next) next.onclick = () => { g.advanceFrame(); closeOverlay(); afterSnooker(); };
  const nm = o.querySelector('[data-newmatch]');
  if (nm) nm.onclick = () => { App.newSnooker(); closeOverlay(); afterSnooker(); };
  o.querySelector('[data-menu]').onclick = () => { closeOverlay(); showScreen('home'); };
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
  const seat = g.currentPlayer === null ? (g.breaker == null ? 0 : g.breaker) : g.currentPlayer;
  const cue = cues[seat];
  const opp = cues[1 - seat];
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
      <button class="strokerow" data-action="score" data-key="${s.key}" ${g.isOver || !g.started ? 'disabled' : ''}>
        <span class="strokerow__main">
          <span class="strokerow__label">${escapeHtml(label)}</span>
          <span class="strokerow__sub">${s.sub}</span>
        </span>
        <span class="strokerow__balls">${scene}</span>
        <span class="strokerow__val">+${s.value}</span>
      </button>`;
  };
  const strokes =
    BILLIARDS_STROKES.filter(s => s.group !== 'combo').map(renderStroke).join('') +
    '<div class="strokelist__sep">Combinations · one stroke, one tap</div>' +
    BILLIARDS_STROKES.filter(s => s.group === 'combo').map(renderStroke).join('');

  const lock = g.isOver || !g.started;
  document.getElementById('screen-billiards').innerHTML = `
    <header class="appbar">
      <button class="appbar__btn appbar__btn--icon" data-action="home">${ICONS.back}<span>Menu</span></button>
      <div class="appbar__title">${g.solo ? 'Solo · ' : ''}English Billiards</div>
      <button class="appbar__btn" data-action="rules">Rules</button>
    </header>
    <div class="screen__body">
      <div class="tally"><span>${g.target ? `Target <b>${g.target}</b>` : 'No target'}</span><span class="tally__sep">${name(0)} v ${name(1)}${timerChip(g.startTime, g.endTime)}</span></div>
      <div class="panels">${panels}</div>
      ${g.frameFresh ? breakoffChooser(g, name) + cueChooser(g) : ''}
      <div class="actions">
        <button class="act act--warn" data-action="foul" ${lock ? 'disabled' : ''}>Foul +2</button>
        <button class="act act--primary" data-action="miss" ${lock ? 'disabled' : ''}>Miss</button>
        ${g.target ? '' : `<button class="act" data-action="finish" ${lock ? 'disabled' : ''}>Finish</button>`}
        <button class="act" data-action="undo" ${g.undoStack.length ? '' : 'disabled'}>Undo</button>
      </div>
      <div class="strokelist">${strokes}</div>
      <div class="links">
        <button data-action="concede" ${lock ? 'disabled' : ''}>Concede</button>
        <button data-action="leave">Leave (don’t count)</button>
        <button data-action="newgame">New game</button>
      </div>
    </div>`;

  if (g.isOver) showBilliardsResult();
}

function openBilliardsConcede() {
  const g = App.billiards;
  if (g.isOver || g.currentPlayer === null) return;
  openOverlay(`
    <h3>Concede game</h3>
    <p class="muted">Who is conceding?</p>
    <div class="foul-grid" style="grid-template-columns:1fr 1fr">
      <button class="foul-btn" data-loser="0" style="font-size:16px">${escapeHtml(App.gamePlayerName(g, 0))}</button>
      <button class="foul-btn" data-loser="1" style="font-size:16px">${escapeHtml(App.gamePlayerName(g, 1))}</button>
    </div>
    <button class="modal__cancel" data-cancel>Cancel</button>`);
  const o = document.getElementById('overlay');
  o.querySelectorAll('[data-loser]').forEach(b => b.onclick = () => {
    g.concede(parseInt(b.dataset.loser, 10));
    closeOverlay();
    afterBilliards();
  });
  o.querySelector('[data-cancel]').onclick = closeOverlay;
}

function confirmLeaveBilliards() {
  openOverlay(`
    <h3>Leave game</h3>
    <p class="muted">End this game without counting it? Nothing from this game will be saved.</p>
    <button class="primary primary--danger" data-leave>Leave, don’t count</button>
    <button class="modal__cancel" data-cancel style="margin-top:10px">Cancel</button>`);
  const o = document.getElementById('overlay');
  o.querySelector('[data-leave]').onclick = () => {
    App.billiards = null;
    try { localStorage.removeItem(KEYS.billiards); } catch (e) { /* ignore */ }
    closeOverlay();
    showScreen('home');
  };
  o.querySelector('[data-cancel]').onclick = closeOverlay;
}

function showBilliardsResult() {
  const g = App.billiards;
  const w = g.winner;
  openOverlay(`
    <div class="result__badge">${w === null ? ICONS.draw : ICONS.trophy}</div>
    <h3>${w === null ? 'Game Drawn' : 'Game Won'}</h3>
    ${w === null ? '' : `<div class="result__name">${escapeHtml(App.gamePlayerName(g, w))}</div>`}
    <div class="result__score">${g.scores[0]} – ${g.scores[1]}</div>
    <button class="primary" data-newgame>New Game</button>
    <button class="modal__cancel" data-menu style="margin-top:10px">Main menu</button>`);
  const o = document.getElementById('overlay');
  o.querySelector('[data-newgame]').onclick = () => { App.newBilliards(); closeOverlay(); afterBilliards(); };
  o.querySelector('[data-menu]').onclick = () => { closeOverlay(); showScreen('home'); };
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
    ms: BREAK_MILESTONES.map(t => values.filter(v => v >= t).length),
  };
}

function fmtDuration(ms) {
  if (!ms || ms <= 0) return '—';
  const s = Math.round(ms / 1000);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// Frames/matches/games aggregated for one profile (snooker frames or billiards games).
function recordStatsFor(records, pid) {
  let played = 0, won = 0, durSum = 0, durCount = 0, fastest = null, pots = 0, misses = 0;
  records.forEach(r => {
    const seat = (r.pids || []).indexOf(pid);
    if (seat < 0) return;
    played++;
    if (r.winner === pid) won++;
    if (r.durationMs > 0) { durSum += r.durationMs; durCount++; if (fastest === null || r.durationMs < fastest) fastest = r.durationMs; }
    if (r.pots) pots += r.pots[seat] || 0;
    if (r.misses) misses += r.misses[seat] || 0;
  });
  return {
    played, won,
    winPct: played ? won / played * 100 : 0,
    avgDur: durCount ? durSum / durCount : 0,
    fastest: fastest,
    pots, misses,
    potPct: (pots + misses) ? pots / (pots + misses) * 100 : 0,
    ballsPerFrame: played ? pots / played : 0,
  };
}

// Everything for one profile + game, for the player page and leaderboard.
function summarize(profile, gameType) {
  const a = aggregateBreaks(App.allRecords().filter(r => r.g === gameType), profile);
  let frames, matches = null;
  if (gameType === 'snooker') {
    frames = recordStatsFor(App.allFrames(), profile.id);
    matches = recordStatsFor(App.allMatches(), profile.id);
  } else {
    frames = recordStatsFor(App.allBilliardsGames(), profile.id);
  }
  return { breaks: a, frames, matches };
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

function rowsHtml(rows) {
  return rows.map(([k, v]) => `<div class="srow"><span>${k}</span><b>${v}</b></div>`).join('');
}

function statDetail(a) {
  const rows = rowsHtml([
    ['Breaks made', a.breaks],
    ['Average break', a.avg ? a.avg.toFixed(1) : '—'],
    ['Points / visit', a.ppv ? a.ppv.toFixed(1) : '—'],
    ['Consistency', a.visits ? Math.round(a.consistency) + '%' : '—'],
    ['Break-offs', a.breakOffs],
    ['Visits (after opening)', a.visits],
  ]);

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

function milestoneCard(a) {
  const chips = BREAK_MILESTONES.map((t, i) =>
    `<div class="mschip ${a.ms[i] > 0 ? 'mschip--on' : ''}"><span class="mschip__n">${a.ms[i]}</span><span class="mschip__t">${t}+</span></div>`).join('');
  return `<div class="scard scard--wide"><h4 class="dist-h">Milestone breaks</h4><div class="msrow">${chips}</div></div>`;
}

function recordCard(game, fs, ms) {
  let rows;
  if (game === 'snooker') {
    rows = [
      ['Frames played', fs.played],
      ['Frames won', `${fs.won} · ${fs.played ? Math.round(fs.winPct) : 0}%`],
    ];
    if (ms) rows.push(['Matches played', ms.played], ['Matches won', `${ms.won} · ${ms.played ? Math.round(ms.winPct) : 0}%`]);
  } else {
    rows = [
      ['Games played', fs.played],
      ['Games won', `${fs.won} · ${fs.played ? Math.round(fs.winPct) : 0}%`],
      ['Avg game time', fmtDuration(fs.avgDur)],
      ['Fastest game', fmtDuration(fs.fastest)],
    ];
  }
  return `<div class="scard scard--wide"><h4 class="dist-h">Record</h4><div class="srows">${rowsHtml(rows)}</div></div>`;
}

function playCard(fs) {
  const rows = rowsHtml([
    ['Pot success', (fs.pots + fs.misses) ? Math.round(fs.potPct) + '%' : '—'],
    ['Balls potted / frame', fs.played ? fs.ballsPerFrame.toFixed(1) : '—'],
    ['Avg frame time', fmtDuration(fs.avgDur)],
    ['Fastest frame', fmtDuration(fs.fastest)],
  ]);
  return `<div class="scard scard--wide"><h4 class="dist-h">Potting &amp; pace</h4><div class="srows">${rows}</div></div>`;
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
  const s = summarize(prof, game);
  const a = s.breaks, fs = s.frames, ms = s.matches;
  const label = game === 'snooker' ? 'snooker' : 'billiards';
  const drills = drillCard(prof.id, game);

  // Side B = the "(2)" identity from this player's solo games.
  const sbProf = { id: soloSideId(prof.id), name: prof.name + ' (2)' };
  const sb = summarize(sbProf, game);
  const sbDrills = drillCard(sbProf.id, game);
  const hasSideB = sb.breaks.breaks > 0 || sb.frames.played > 0 || !!sbDrills;

  if (a.breaks === 0 && fs.played === 0 && !drills && !hasSideB) {
    document.getElementById('player-body').innerHTML = gameToggle() +
      `<div class="stats-empty">No ${label} data recorded for ${escapeHtml(prof.name)} yet.</div>`;
    return;
  }

  let body = gameToggle();
  if (a.breaks > 0 || fs.played > 0) {
    body += statDetail(a) + milestoneCard(a) + recordCard(game, fs, ms);
    if (game === 'snooker') body += playCard(fs);
  }
  body += drills;
  body += `<h3 class="stats-h">Recent breaks</h3><div class="log">${breakLog(App.allRecords().filter(r => r.g === game), prof)}</div>`;

  if (hasSideB) {
    body += `<h3 class="stats-h">Solo — Side B (“${escapeHtml(sbProf.name)}”)</h3>`;
    if (sb.breaks.breaks > 0 || sb.frames.played > 0) {
      body += statDetail(sb.breaks) + milestoneCard(sb.breaks) + recordCard(game, sb.frames, sb.matches);
      if (game === 'snooker') body += playCard(sb.frames);
    }
    body += sbDrills;
  }

  document.getElementById('player-body').innerHTML = body;
}

/* Leaderboard */

function renderLeaderboard() {
  const game = App.statsGame;
  const metric = App.leaderMetric;
  const metricDef = LEADER_METRICS.find(m => m.key === metric) || LEADER_METRICS[0];

  const rows = App.profiles
    .map(p => ({ p, s: summarize(p, game) }))
    .filter(x => x.s.breaks.breaks > 0 || x.s.frames.played > 0)
    .map(x => { x.v = metricDef.val(x.s); return x; })
    .filter(x => x.v >= 0)
    .sort((x, y) => y.v - x.v);

  const metricSel = `<select class="field__input" data-metric>${LEADER_METRICS.map(m => `<option value="${m.key}" ${m.key === metric ? 'selected' : ''}>${m.label}</option>`).join('')}</select>`;

  let listHtml;
  if (!rows.length) {
    listHtml = `<div class="stats-empty">No ${game} data recorded yet.<br>Play some frames and your players will be ranked here.</div>`;
  } else {
    listHtml = '<div class="lb">' + rows.map((x, i) => `
        <div class="lbrow" data-viewstats="${x.p.id}">
          <span class="lbrank ${i < 3 ? 'lbrank--' + (i + 1) : ''}">${i + 1}</span>
          <span class="lbname">${escapeHtml(x.p.name)}</span>
          <span class="lbval">${metricDef.fmt(x.s)}</span>
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

/* ---------- drills ---------- */

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

let DRILL_SETUP = { drillId: null };

function initDrillSetup(drill) {
  const players = App.settings.players || [];
  DRILL_SETUP = {
    drillId: drill.id,
    mode: 'solo',
    p0: players[0], p1: players[1],
    reds: (drill.setup && drill.setup.reds) ? drill.setup.reds.def : null,
    colours: (drill.setup && drill.setup.colours) ? drill.setup.colours.def.slice() : null,
  };
}

function renderDrills() {
  const game = App.drillGame;
  const gname = game === 'snooker' ? 'Snooker' : 'Billiards';
  const list = DRILLS.filter(d => d.game === game).map(d => `
      <button class="card card--drill" data-action="pick-drill" data-drill="${d.id}">
        <div><h2 class="card__title">${escapeHtml(d.name)}</h2><p class="card__sub">${escapeHtml(d.blurb)}</p></div>
        <span class="card__go">›</span>
      </button>`).join('');
  document.getElementById('screen-drills').innerHTML = `
    <header class="appbar">
      <button class="appbar__btn appbar__btn--icon" data-nav="home">${ICONS.back}<span>Menu</span></button>
      <div class="appbar__title">Practice</div>
      <span class="appbar__btn appbar__btn--ghost"></span>
    </header>
    <div class="screen__body">
      <div class="seg">
        <button class="seg__btn ${game === 'snooker' ? 'seg__btn--active' : ''}" data-action="drill-game" data-game="snooker">Snooker</button>
        <button class="seg__btn ${game === 'billiards' ? 'seg__btn--active' : ''}" data-action="drill-game" data-game="billiards">Billiards</button>
      </div>
      <h3 class="stats-h">Solo game</h3>
      <button class="card card--drill" data-action="solo-game">
        <div><h2 class="card__title">Solo ${gname}</h2><p class="card__sub">Play a full game by yourself — your two sides are tracked separately (you and “you (2)”).</p></div>
        <span class="card__go">›</span>
      </button>
      <h3 class="stats-h">Drills</h3>
      ${list}
    </div>`;
}

function openSoloPicker() {
  const game = App.drillGame;
  openOverlay(`
    <h3>Solo ${game === 'snooker' ? 'snooker' : 'billiards'}</h3>
    <p class="muted">Which player is this game for?</p>
    <div class="foul-grid" style="grid-template-columns:1fr">
      ${App.profiles.map(p => `<button class="foul-btn" data-solo="${p.id}" style="font-size:16px">${escapeHtml(p.name)}</button>`).join('')}
    </div>
    <button class="modal__cancel" data-cancel>Cancel</button>`);
  const o = document.getElementById('overlay');
  o.querySelectorAll('[data-solo]').forEach(b => b.onclick = () => {
    const pid = b.dataset.solo;
    closeOverlay();
    if (game === 'snooker') { App.newSnooker(pid); showScreen('snooker'); }
    else { App.newBilliards(pid); showScreen('billiards'); }
  });
  o.querySelector('[data-cancel]').onclick = closeOverlay;
}

function handleSetupToggle(d) {
  if (d.action === 'setup-mode') DRILL_SETUP.mode = d.mode;
  else if (d.action === 'setup-reds') DRILL_SETUP.reds = parseInt(d.reds, 10);
  else if (d.action === 'setup-colour') {
    const arr = DRILL_SETUP.colours, i = arr.indexOf(d.colour);
    if (i >= 0) { if (arr.length > 1) arr.splice(i, 1); } else arr.push(d.colour);
  }
  renderDrillSetup();
}

function renderDrillSetup() {
  const drill = drillById(App.setupDrillId);
  if (!drill) { showScreen('drills'); return; }
  if (DRILL_SETUP.drillId !== drill.id) initDrillSetup(drill);
  const s = DRILL_SETUP;
  const profOpts = sel => App.profiles.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('');

  let html = `
    <header class="appbar">
      <button class="appbar__btn appbar__btn--icon" data-nav="drills">${ICONS.back}<span>Drills</span></button>
      <div class="appbar__title">${escapeHtml(drill.name)}</div>
      <span class="appbar__btn appbar__btn--ghost"></span>
    </header>
    <div class="screen__body">
      <p class="home__intro">${escapeHtml(drill.blurb)}</p>
      <h3 class="stats-h">Players</h3>
      <div class="seg">
        <button class="seg__btn ${s.mode === 'solo' ? 'seg__btn--active' : ''}" data-action="setup-mode" data-mode="solo">Solo</button>
        <button class="seg__btn ${s.mode === '2p' ? 'seg__btn--active' : ''}" data-action="setup-mode" data-mode="2p">2 players</button>
      </div>
      <div class="nowplaying">
        <label class="field"><span class="field__label">${s.mode === '2p' ? 'Player 1' : 'Player'}</span><select class="field__input" data-setupsel="p0">${profOpts(s.p0)}</select></label>
        ${s.mode === '2p' ? `<label class="field"><span class="field__label">Player 2</span><select class="field__input" data-setupsel="p1">${profOpts(s.p1)}</select></label>` : ''}
      </div>`;

  if (drill.setup && drill.setup.reds) {
    html += `<h3 class="stats-h">${drill.setup.reds.label}</h3><div class="seg seg--wrap">` +
      drill.setup.reds.options.map(n => `<button class="seg__btn ${s.reds === n ? 'seg__btn--active' : ''}" data-action="setup-reds" data-reds="${n}">${n}</button>`).join('') + `</div>`;
  }
  if (drill.setup && drill.setup.colours) {
    html += `<h3 class="stats-h">${drill.setup.colours.label}</h3><div class="cset">` +
      ['yellow', 'green', 'brown', 'blue', 'pink', 'black'].map(c => `<button class="cbtn ${s.colours.includes(c) ? 'cbtn--on' : ''}" data-action="setup-colour" data-colour="${c}"><span class="chip chip--${c}"></span>${cap(c)}</button>`).join('') + `</div>`;
  } else if (drill.setup && drill.setup.coloursFixed) {
    html += `<h3 class="stats-h">Colours</h3><p class="form__note">This drill uses the ${drill.setup.coloursFixed.map(cap).join(' &amp; ')}.</p>`;
  }
  html += `<button class="btn btn--primary btn--block" data-action="start-drill">Start drill</button></div>`;
  document.getElementById('screen-drill-setup').innerHTML = html;
}

function startDrillFromSetup() {
  const drill = drillById(App.setupDrillId);
  const s = DRILL_SETUP;
  const players = s.mode === '2p' ? [s.p0, s.p1] : [s.p0];
  const opts = { players };
  if (drill.setup && drill.setup.reds) opts.reds = s.reds;
  if (drill.setup && drill.setup.colours) opts.colours = s.colours.slice();
  App.startDrill(drill.id, opts);
}

function afterDrill() { renderDrillPlay(); }

function renderDrillPlay() {
  const g = App.drill;
  if (!g) { showScreen('drills'); return; }
  const d = g.drill;
  const pname = i => escapeHtml(App.profileName(g.players[i], i));

  const panels = g.players.map((pid, i) => {
    const active = g.solo || g.cp === i;
    let big, sub;
    if (d.mode === 'attempts') {
      big = g.attempts[i] ? Math.round(g.made[i] / g.attempts[i] * 100) + '%' : '0%';
      sub = `${g.made[i]}/${g.attempts[i]} · best ${g.bestStreak[i]}`;
    } else {
      big = active ? g.currentBreak : 0;
      sub = `High ${g.highBreaks[i]}`;
    }
    return `<div class="panel ${active && !g.solo ? 'panel--active' : ''}">
        <div class="panel__name">${pname(i)}</div>
        <div class="panel__score">${big}</div>
        <div class="panel__turn">${sub}</div>
      </div>`;
  }).join('');

  let status = '';
  if (d.mode === 'lineup' || d.mode === 'clearance') {
    const lk = g.legalKeys();
    const nb = lk.length === 1 ? SNOOKER_BALLS.find(x => x.key === lk[0]) : null;
    const txt = d.mode === 'clearance' ? (nb ? 'Pot ' + nb.name.toLowerCase() : '')
      : (g.phase.type === 'red' ? 'Pot a red' : g.phase.type === 'colour' ? 'Pot a colour' : (nb ? 'Pot ' + nb.name.toLowerCase() : ''));
    status = `<div class="status"><div class="status__next"><span class="status__label">Next</span><span class="status__text">${txt}</span></div><div class="status__remain">Break <b>${g.currentBreak}</b></div></div>`;
  } else if (d.consecutive) {
    status = `<div class="status"><div class="status__next"><span class="status__label">In a row</span><span class="status__text">${g.consecutive}</span></div><div class="status__remain">Break <b>${g.currentBreak}</b></div></div>`;
  }

  let controls;
  if (d.mode === 'lineup' || d.mode === 'clearance') {
    const legal = g.legalKeys();
    const set = d.mode === 'clearance' ? ['yellow', 'green', 'brown', 'blue', 'pink', 'black'] : ['red'].concat(g.colours || []);
    const balls = set.map(k => {
      const b = SNOOKER_BALLS.find(x => x.key === k);
      const isLegal = legal.includes(k);
      return `<button class="ball ball--${k} ${isLegal ? '' : 'is-disabled'}" data-action="drill-press" data-key="${k}" ${isLegal ? '' : 'disabled'}><span class="ball__val">${b.value}</span></button>`;
    }).join('');
    controls = `<div class="balls">${balls}</div>
      <div class="actions">
        <button class="act act--primary" data-action="drill-miss">Miss</button>
        <button class="act" data-action="drill-undo" ${g.undoStack.length ? '' : 'disabled'}>Undo</button>
      </div>`;
  } else {
    const btns = d.buttons.map(b => `
        <button class="drillbtn drillbtn--${b.tone}" data-action="drill-press" data-key="${b.key}">
          <span class="drillbtn__label">${b.label}</span>
          ${b.value ? `<span class="drillbtn__val">+${b.value}</span>` : ''}
          ${b.sub ? `<span class="drillbtn__sub">${b.sub}</span>` : ''}
        </button>`).join('');
    controls = `<div class="drillbtns">${btns}</div>
      <div class="actions"><button class="act" data-action="drill-undo" ${g.undoStack.length ? '' : 'disabled'}>Undo</button></div>`;
  }

  document.getElementById('screen-drill').innerHTML = `
    <header class="appbar">
      <button class="appbar__btn appbar__btn--icon" data-action="drill-exit">${ICONS.back}<span>Drills</span></button>
      <div class="appbar__title">${escapeHtml(d.name)}</div>
      <button class="appbar__btn" data-action="drill-finish">Finish</button>
    </header>
    <div class="screen__body">
      <div class="panels">${panels}</div>
      ${status}
      ${controls}
    </div>`;
}

function openDrillSummary() {
  const g = App.drill, d = g.drill;
  const lines = g.players.map((pid, i) => {
    const nm = escapeHtml(App.profileName(pid, i));
    if (d.mode === 'attempts') {
      const pct = g.attempts[i] ? Math.round(g.made[i] / g.attempts[i] * 100) : 0;
      return `${nm}: ${pct}% (${g.made[i]}/${g.attempts[i]}), best streak ${g.bestStreak[i]}`;
    }
    return `${nm}: high break ${g.highBreaks[i]}`;
  }).join('<br>');
  openOverlay(`
    <div class="result__badge">${ICONS.trophy}</div>
    <h3>Drill summary</h3>
    <p class="muted">${lines}</p>
    <button class="primary" data-save>Save &amp; exit</button>
    <button class="modal__cancel" data-keep style="margin-top:10px">Keep practising</button>`);
  const o = document.getElementById('overlay');
  o.querySelector('[data-save]').onclick = () => { App.finishDrill(); closeOverlay(); showScreen('drills'); };
  o.querySelector('[data-keep]').onclick = closeOverlay;
}

// Per-profile drill bests for the player stats page.
function drillSummaryFor(pid, game) {
  const recs = App.allDrillRecords().filter(r => r.g === game && r.pid === pid);
  const byDrill = {};
  recs.forEach(r => { (byDrill[r.drill] = byDrill[r.drill] || []).push(r); });
  return DRILLS.filter(d => d.game === game).map(d => {
    const rs = byDrill[d.id] || [];
    if (!rs.length) return null;
    if (d.mode === 'attempts') {
      let made = 0, att = 0, streak = 0;
      rs.forEach(r => { made += r.made || 0; att += r.attempts || 0; streak = Math.max(streak, r.bestStreak || 0); });
      return [d.name, `${att ? Math.round(made / att * 100) : 0}% · streak ${streak}`];
    }
    const high = Math.max(0, ...rs.filter(r => r.kind === 'break').map(r => r.v || 0));
    return [d.name, `High ${high}`];
  }).filter(Boolean);
}

function drillCard(pid, game) {
  const items = drillSummaryFor(pid, game);
  if (!items.length) return '';
  return `<div class="scard scard--wide"><h4 class="dist-h">Drill bests</h4><div class="srows">${rowsHtml(items)}</div></div>`;
}

/* ---------- boot ---------- */

window.addEventListener('DOMContentLoaded', () => App.init());
