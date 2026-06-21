/* Practice drills for snooker and billiards — engine + configs, no DOM.
   Relies on SNOOKER_BALLS, ballByValue and BREAK_MILESTONES from snooker.js. */

const DRILLS = [
  // ---- Snooker ----
  {
    id: 'reds', game: 'snooker', mode: 'free', name: 'Reds Concentration',
    blurb: 'A line of reds. Pot one, re-spot it and pot the next to build a break — without hitting a cushion or cannoning another red. Pure concentration.',
    setup: { reds: { label: 'Reds in the line', options: [6, 7, 8, 9, 10, 11, 12], def: 8 } },
    buttons: [
      { key: 'red', label: 'Red', value: 1, tone: 'red' },
      { key: 'cannon', label: 'Cannon', kind: 'end', tone: 'cannon', sub: 'turn over' },
      { key: 'miss', label: 'Miss', kind: 'end', tone: 'miss', sub: 'turn over' },
    ],
  },
  {
    id: 'lineup', game: 'snooker', mode: 'lineup', name: 'The Line-up',
    blurb: 'Red, colour, red, colour… then clear the colours. Build the biggest break you can.',
    setup: {
      reds: { label: 'Reds', options: [10, 15], def: 15 },
      colours: { label: 'Colours in play', def: ['blue', 'pink', 'black'] },
    },
  },
  {
    id: 'toptable', game: 'snooker', mode: 'lineup', name: 'Top of the Table',
    blurb: 'Reds with the pink and black around the top spots — the classic break-building routine.',
    setup: { reds: { label: 'Reds', options: [10, 11, 12], def: 10 }, coloursFixed: ['pink', 'black'] },
  },
  {
    id: 'clearance', game: 'snooker', mode: 'clearance', name: 'Clearance',
    blurb: 'Clear the six colours in order: yellow, green, brown, blue, pink, black. A clean sweep is 27.',
  },
  {
    id: 'longpot', game: 'snooker', mode: 'attempts', name: 'Long Potting',
    blurb: 'Single reds, one at a time. Track your pot success rate and best streak.',
    buttons: [
      { key: 'pot', label: 'Potted', kind: 'made', tone: 'red' },
      { key: 'miss', label: 'Missed', kind: 'attempt', tone: 'miss' },
    ],
  },

  // ---- Billiards ----
  {
    id: 'cannons', game: 'billiards', mode: 'free', name: 'Cannon Repetition', consecutive: true,
    blurb: 'Make as many cannons in a row as you can.',
    buttons: [
      { key: 'cannon', label: 'Cannon', value: 2, tone: 'score' },
      { key: 'miss', label: 'Miss', kind: 'end', tone: 'miss' },
    ],
  },
  {
    id: 'inoff', game: 'billiards', mode: 'free', name: 'In-off the Red', consecutive: true,
    blurb: 'Repeated losing hazards in-off the red.',
    buttons: [
      { key: 'inoff', label: 'In-off red', value: 3, tone: 'score' },
      { key: 'miss', label: 'Miss', kind: 'end', tone: 'miss' },
    ],
  },
  {
    id: 'spot', game: 'billiards', mode: 'free', name: 'Spot-stroke', consecutive: true,
    blurb: 'Pot the red off its spot, over and over.',
    buttons: [
      { key: 'pot', label: 'Pot red', value: 3, tone: 'score' },
      { key: 'miss', label: 'Miss', kind: 'end', tone: 'miss' },
    ],
  },
  {
    id: 'toptable_bil', game: 'billiards', mode: 'free', name: 'Top of the Table',
    blurb: 'Pot-red and cannon sequence near the spots — build the biggest break.',
    buttons: [
      { key: 'potRed', label: 'Pot red', value: 3, tone: 'score' },
      { key: 'cannon', label: 'Cannon', value: 2, tone: 'score' },
      { key: 'miss', label: 'Miss', kind: 'end', tone: 'miss' },
    ],
  },
];

function drillById(id) { return DRILLS.find(d => d.id === id) || null; }

class DrillSession {
  constructor(drill, opts) {
    this.drill = drill;
    this.players = (opts.players && opts.players.length) ? opts.players.slice() : [null];
    this.reds = opts.reds || null;
    this.colours = (drill.setup && drill.setup.coloursFixed) ? drill.setup.coloursFixed.slice()
      : (opts.colours ? opts.colours.slice() : null);
    this.cp = 0;
    this.currentBreak = 0;
    this.highBreaks = this.players.map(() => 0);
    this.completed = [];                 // {player, value, clean?}
    this.consecutive = 0;
    this.bestConsecutive = this.players.map(() => 0);
    this.made = this.players.map(() => 0);
    this.attempts = this.players.map(() => 0);
    this.streak = 0;
    this.bestStreak = this.players.map(() => 0);
    this.redsLeft = this.reds || 0;
    this.phase = drill.mode === 'clearance' ? { type: 'seq', value: 2 }
      : drill.mode === 'lineup' ? { type: 'red' } : null;
    this.undoStack = [];
  }

  get solo() { return this.players.length === 1; }

  // Colour values enabled for the line-up, ascending.
  _enabledValues() {
    return (this.colours || []).map(k => SNOOKER_BALLS.find(b => b.key === k).value).sort((a, b) => a - b);
  }
  _firstSeq() { const v = this._enabledValues(); return v.length ? v[0] : 8; }
  _nextSeq(from) { const v = this._enabledValues().filter(x => x >= from); return v.length ? v[0] : null; }

  legalKeys() {
    if (this.drill.mode === 'lineup') {
      if (this.phase.type === 'red') return ['red'];
      if (this.phase.type === 'colour') return this.colours.slice();
      if (this.phase.type === 'seq') { const b = ballByValue(this.phase.value); return b ? [b.key] : []; }
      return [];
    }
    if (this.drill.mode === 'clearance') { const b = ballByValue(this.phase.value); return b ? [b.key] : []; }
    return [];
  }

  // --- actions ---

  press(key) {
    const btn = (this.drill.buttons || []).find(b => b.key === key);
    if (this.drill.mode === 'free') {
      if (!btn) return;
      if (btn.kind === 'end') this._endFree();
      else this._scoreFree(btn.value || 0);
    } else if (this.drill.mode === 'attempts') {
      if (!btn) return;
      if (btn.kind === 'made') this._made();
      else this._attemptMiss();
    } else if (this.drill.mode === 'lineup') {
      this._potLineup(key);
    } else if (this.drill.mode === 'clearance') {
      if (key === 'miss') this._missClearance();
      else this._potClearance();
    }
  }

  miss() {
    if (this.drill.mode === 'free') this._endFree();
    else if (this.drill.mode === 'lineup') this._missLineup();
    else if (this.drill.mode === 'clearance') this._missClearance();
    else if (this.drill.mode === 'attempts') this._attemptMiss();
  }

  _scoreFree(value) {
    this._push();
    this.currentBreak += value;
    this._high();
    if (this.drill.consecutive) {
      this.consecutive += 1;
      this.bestConsecutive[this.cp] = Math.max(this.bestConsecutive[this.cp], this.consecutive);
    }
  }
  _endFree() {
    this._push();
    this._record(this.currentBreak);
    this.currentBreak = 0; this.consecutive = 0;
    this._switch();
  }

  _made() {
    this._push();
    this.made[this.cp] += 1; this.attempts[this.cp] += 1;
    this.streak += 1; this.bestStreak[this.cp] = Math.max(this.bestStreak[this.cp], this.streak);
  }
  _attemptMiss() {
    this._push();
    this.attempts[this.cp] += 1; this.streak = 0;
    this._switch();
  }

  _potLineup(key) {
    if (!this.legalKeys().includes(key)) return;
    this._push();
    this.currentBreak += SNOOKER_BALLS.find(b => b.key === key).value;
    this._high();
    if (this.phase.type === 'red') { this.redsLeft -= 1; this.phase = { type: 'colour' }; }
    else if (this.phase.type === 'colour') { this.phase = this.redsLeft > 0 ? { type: 'red' } : { type: 'seq', value: this._firstSeq() }; }
    else { // seq
      const nv = this._nextSeq(this.phase.value + 1);
      if (nv === null) { this._record(this.currentBreak); this.currentBreak = 0; this.redsLeft = this.reds; this.phase = { type: 'red' }; }
      else this.phase = { type: 'seq', value: nv };
    }
  }
  _missLineup() {
    this._push();
    this._record(this.currentBreak);
    this.currentBreak = 0; this.redsLeft = this.reds; this.phase = { type: 'red' };
    this._switch();
  }

  _potClearance() {
    this._push();
    const v = this.phase.value;
    this.currentBreak += v;
    this._high();
    if (v >= 7) { this._record(this.currentBreak, true); this.currentBreak = 0; this.phase = { type: 'seq', value: 2 }; }
    else this.phase = { type: 'seq', value: v + 1 };
  }
  _missClearance() {
    this._push();
    this._record(this.currentBreak, false);
    this.currentBreak = 0; this.phase = { type: 'seq', value: 2 };
    this._switch();
  }

  _record(value, clean) {
    const rec = { player: this.cp, value: value };
    if (clean !== undefined) rec.clean = clean;
    this.completed.push(rec);
  }
  _high() { this.highBreaks[this.cp] = Math.max(this.highBreaks[this.cp], this.currentBreak); }
  _switch() { if (!this.solo) this.cp = 1 - this.cp; }

  _push() {
    this.undoStack.push(JSON.stringify({
      cp: this.cp, currentBreak: this.currentBreak, highBreaks: this.highBreaks, completed: this.completed,
      consecutive: this.consecutive, bestConsecutive: this.bestConsecutive,
      made: this.made, attempts: this.attempts, streak: this.streak, bestStreak: this.bestStreak,
      redsLeft: this.redsLeft, phase: this.phase,
    }));
    if (this.undoStack.length > 400) this.undoStack.shift();
  }
  undo() {
    const s = this.undoStack.pop();
    if (!s) return false;
    Object.assign(this, JSON.parse(s));
    return true;
  }

  // Records to persist for stats, one per player seat. Includes the current
  // in-progress break (the player may finish on their best break).
  results() {
    const out = [];
    this.players.forEach((pid, seat) => {
      if (this.drill.mode === 'attempts') {
        if (this.attempts[seat] > 0) {
          out.push({ drill: this.drill.id, g: this.drill.game, pid, kind: 'attempts', made: this.made[seat], attempts: this.attempts[seat], bestStreak: this.bestStreak[seat], t: Date.now() });
        }
      } else {
        this.completed.filter(c => c.player === seat).forEach(c => {
          out.push({ drill: this.drill.id, g: this.drill.game, pid, kind: 'break', v: c.value, clean: c.clean, t: Date.now() });
        });
        if (seat === this.cp && this.currentBreak > 0) {
          out.push({ drill: this.drill.id, g: this.drill.game, pid, kind: 'break', v: this.currentBreak, t: Date.now() });
        }
      }
    });
    return out;
  }
}
