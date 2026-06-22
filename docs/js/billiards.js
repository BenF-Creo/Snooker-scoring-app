/* English Billiards rule engine — plain data + methods, no DOM. */

/* Each stroke's `scene` describes how to draw it: a row of balls by role
   ('cue' = striker's ball, 'opp' = opponent's ball, 'red'), with an optional
   badge — 'pot' (P, the object ball is pocketed) or 'inoff' (arrow, the cue
   ball is pocketed). `object: 'opp'` means the named ball is the opponent's,
   so the label reflects its actual colour (white or yellow). */
const BILLIARDS_STROKES = [
  // Single-score strokes
  { key: 'cannon',     group: 'base', base: 'Cannon',  value: 2, sub: 'hit both balls',
    scene: [{ role: 'cue' }, { role: 'red' }, { role: 'opp' }] },
  { key: 'potRed',     group: 'base', base: 'Pot Red', value: 3, sub: 'winning hazard',
    scene: [{ role: 'cue' }, { role: 'red', badge: 'pot' }] },
  { key: 'inOffRed',   group: 'base', base: 'In-off Red', value: 3, sub: 'losing hazard',
    scene: [{ role: 'red' }, { role: 'cue', badge: 'inoff' }] },
  { key: 'potWhite',   group: 'base', base: 'Pot', value: 2, sub: "opponent's ball", object: 'opp',
    scene: [{ role: 'cue' }, { role: 'opp', badge: 'pot' }] },
  { key: 'inOffWhite', group: 'base', base: 'In-off', value: 2, sub: "off opponent's ball", object: 'opp',
    scene: [{ role: 'opp' }, { role: 'cue', badge: 'inoff' }] },

  // Combination strokes — several scores made in a single stroke
  { key: 'five',           group: 'combo', base: 'Five', value: 5, sub: 'cannon + in-off red',
    scene: [{ role: 'opp' }, { role: 'red' }, { role: 'cue', badge: 'inoff' }] },
  { key: 'cannonPotRed',   group: 'combo', base: 'Cannon + pot red', value: 5, sub: '2 + 3',
    scene: [{ role: 'cue' }, { role: 'opp' }, { role: 'red', badge: 'pot' }] },
  { key: 'cannonPotOpp',   group: 'combo', base: 'Cannon + pot', value: 4, sub: '2 + 2', object: 'opp',
    scene: [{ role: 'cue' }, { role: 'red' }, { role: 'opp', badge: 'pot' }] },
  { key: 'cannonInOffOpp', group: 'combo', base: 'Cannon + in-off', value: 4, sub: '2 + 2', object: 'opp',
    scene: [{ role: 'red' }, { role: 'opp' }, { role: 'cue', badge: 'inoff' }] },
];

class BilliardsGame {
  constructor(target) {
    // target is a number, or null for "no limit".
    this.target = (target === null || target === undefined) ? 100 : target;
    this.scores = [0, 0];
    this.currentPlayer = null;   // chosen at break-off; null = not started
    this.currentBreak = 0;
    this.highBreaks = [0, 0];
    this.isOver = false;
    this.winner = null;
    this.breaker = null;
    this.scored = false;
    this.visits = 0;
    this.startTime = null;
    this.endTime = null;
    this.cues = ['white', 'yellow'];   // cue ball colour per seat (mutually exclusive)
    this.breaks = [];   // completed visits this game: {player, value, scored, opening, breakOff, t}
    this.undoStack = [];
  }

  get started() { return this.currentPlayer !== null; }

  // Assign a cue ball to a seat; the other seat automatically gets the other.
  // Only allowed before the game has started — once set, it stands for the
  // whole game and can only change in a fresh game.
  setCue(seat, color) {
    if (!this.frameFresh) return;
    seat = seat ? 1 : 0;
    const c = (color === 'yellow') ? 'yellow' : 'white';
    this.cues[seat] = c;
    this.cues[1 - seat] = (c === 'white') ? 'yellow' : 'white';
  }

  swapCues() {
    if (!this.frameFresh) return;
    this.cues = [this.cues[1], this.cues[0]];
  }

  get frameFresh() {
    return !this.isOver && this.visits === 0 && this.currentBreak === 0 &&
      this.scores[0] === 0 && this.scores[1] === 0;
  }

  setBreaker(seat) {
    if (!this.frameFresh) return;
    seat = seat ? 1 : 0;
    this.currentPlayer = seat;
    this.breaker = seat;
    if (this.startTime === null) this.startTime = Date.now();
  }

  pointsToGo(player) {
    if (!this.target) return null;
    return Math.max(0, this.target - this.scores[player]);
  }

  score(key) {
    if (this.isOver || this.currentPlayer === null) return;
    const stroke = BILLIARDS_STROKES.find(s => s.key === key);
    if (!stroke) return;
    this._pushUndo();
    const p = this.currentPlayer;
    this.scores[p] += stroke.value;
    this.currentBreak += stroke.value;
    this.highBreaks[p] = Math.max(this.highBreaks[p], this.currentBreak);
    if (this.target && this.scores[p] >= this.target) {
      this._recordVisit();
      this.isOver = true;
      this.endTime = Date.now();
      this.winner = p;
    }
  }

  endTurn() {
    if (this.isOver || this.currentPlayer === null) return;
    this._pushUndo();
    this._recordVisit();
    this.currentBreak = 0;
    this.currentPlayer = 1 - this.currentPlayer;
  }

  // A foul always gives 2 points to the opponent and passes the turn.
  foul() {
    if (this.isOver || this.currentPlayer === null) return;
    this._pushUndo();
    this.scored = true;
    this._recordVisit();
    const opp = 1 - this.currentPlayer;
    this.scores[opp] += 2;
    this.currentBreak = 0;
    this.currentPlayer = opp;
    if (this.target && this.scores[opp] >= this.target) {
      this.isOver = true;
      this.endTime = Date.now();
      this.winner = opp;
    }
  }

  finishGame() {
    if (this.isOver || this.currentPlayer === null) return;
    this._pushUndo();
    this._recordVisit();
    this.isOver = true;
    this.endTime = Date.now();
    this.winner = this.scores[0] === this.scores[1]
      ? null
      : (this.scores[0] > this.scores[1] ? 0 : 1);
  }

  undo() {
    const snap = this.undoStack.pop();
    if (!snap) return false;
    Object.assign(this, JSON.parse(snap));
    return true;
  }

  _recordVisit() {
    const opening = !this.scored && this.currentBreak === 0;
    this.breaks.push({
      player: this.currentPlayer,
      value: this.currentBreak,
      scored: this.currentBreak > 0,
      frame: null,
      opening: opening,
      breakOff: this.visits === 0,
      t: Date.now(),
    });
    this.visits += 1;
    if (this.currentBreak > 0) this.scored = true;
  }

  _pushUndo() {
    this.undoStack.push(JSON.stringify({
      scores: this.scores.slice(),
      currentPlayer: this.currentPlayer,
      currentBreak: this.currentBreak,
      highBreaks: this.highBreaks.slice(),
      isOver: this.isOver,
      winner: this.winner,
      breaker: this.breaker,
      scored: this.scored,
      visits: this.visits,
      breaks: this.breaks.slice(),
    }));
    if (this.undoStack.length > 500) this.undoStack.shift();
  }
}
