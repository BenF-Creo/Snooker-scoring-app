/* Snooker rule engine — plain data + methods, no DOM. */

const SNOOKER_BALLS = [
  { key: 'red',    name: 'Red',    value: 1 },
  { key: 'yellow', name: 'Yellow', value: 2 },
  { key: 'green',  name: 'Green',  value: 3 },
  { key: 'brown',  name: 'Brown',  value: 4 },
  { key: 'blue',   name: 'Blue',   value: 5 },
  { key: 'pink',   name: 'Pink',   value: 6 },
  { key: 'black',  name: 'Black',  value: 7 },
];

function ballByValue(v) { return SNOOKER_BALLS.find(b => b.value === v); }

class SnookerGame {
  constructor(bestOf, reds) {
    this.bestOf = bestOf || 5;
    this.reds = (reds === 10) ? 10 : 15;   // standard 15, or the shorter 10-red game
    this.framesWon = [0, 0];
    this.frameNumber = 1;
    this.startingPlayer = 0;
    this.breaks = [];   // completed visits this match: {player, value, scored, frame, t}
    this.undoStack = [];
    this.resetFrame();
  }

  get framesToWin() { return Math.floor(this.bestOf / 2) + 1; }

  get matchWinner() {
    if (this.framesWon[0] >= this.framesToWin) return 0;
    if (this.framesWon[1] >= this.framesToWin) return 1;
    return null;
  }

  resetFrame() {
    this.frame = {
      scores: [0, 0],
      redsRemaining: this.reds,
      phase: { type: 'red' },          // 'red' | 'colour' | 'sequence'(value)
      currentPlayer: this.startingPlayer,
      currentBreak: 0,
      highBreaks: [0, 0],
      breaker: this.startingPlayer,    // who broke off this frame
      scored: false,                   // has a pot been made yet this frame
      visits: 0,                       // visits recorded this frame
      isOver: false,
      winner: null,
    };
  }

  // Whether the frame is still at the opening break-off (nothing has happened).
  get frameFresh() {
    const f = this.frame;
    return !f.isOver && f.visits === 0 && f.currentBreak === 0 &&
      f.scores[0] === 0 && f.scores[1] === 0;
  }

  // Set who breaks off — only allowed before the frame has started.
  setBreaker(seat) {
    if (!this.frameFresh) return;
    seat = seat ? 1 : 0;
    this.startingPlayer = seat;
    this.frame.currentPlayer = seat;
    this.frame.breaker = seat;
  }

  // --- queries ---

  legalKeys() {
    const f = this.frame;
    if (f.isOver) return [];
    if (f.phase.type === 'red') return ['red'];
    if (f.phase.type === 'colour') return ['yellow', 'green', 'brown', 'blue', 'pink', 'black'];
    if (f.phase.type === 'sequence') { const b = ballByValue(f.phase.value); return b ? [b.key] : []; }
    return [];
  }

  leader() {
    const s = this.frame.scores;
    if (s[0] === s[1]) return null;
    return s[0] > s[1] ? 0 : 1;
  }

  pointsRemaining() {
    const f = this.frame;
    if (f.phase.type === 'sequence') {
      let sum = 0;
      for (let v = f.phase.value; v <= 7; v++) sum += v;
      return sum;
    }
    if (f.phase.type === 'colour') return 7 + f.redsRemaining * 8 + 27;
    return f.redsRemaining * 8 + 27;
  }

  nextUp() {
    const f = this.frame;
    if (f.phase.type === 'red') return 'Pot a red';
    if (f.phase.type === 'colour') return 'Pot any colour';
    const b = ballByValue(f.phase.value);
    return 'Pot ' + (b ? b.name.toLowerCase() : '');
  }

  // --- actions ---

  pot(key) {
    const f = this.frame;
    if (f.isOver || !this.legalKeys().includes(key)) return;
    this._pushUndo();

    const ball = SNOOKER_BALLS.find(b => b.key === key);
    const p = f.currentPlayer;
    f.scores[p] += ball.value;
    f.currentBreak += ball.value;
    f.highBreaks[p] = Math.max(f.highBreaks[p], f.currentBreak);

    if (f.phase.type === 'red') {
      f.redsRemaining -= 1;
      f.phase = { type: 'colour' };
    } else if (f.phase.type === 'colour') {
      f.phase = f.redsRemaining > 0 ? { type: 'red' } : { type: 'sequence', value: 2 };
    } else if (f.phase.type === 'sequence') {
      if (f.phase.value >= 7) {
        const w = this.leader();
        this._finishFrame(w === null ? f.currentPlayer : w);
      } else {
        f.phase = { type: 'sequence', value: f.phase.value + 1 };
      }
    }
  }

  endTurn() {
    if (this.frame.isOver) return;
    this._pushUndo();
    this._recordVisit();
    this._switchPlayer();
  }

  foul(points) {
    const f = this.frame;
    if (f.isOver) return;
    this._pushUndo();
    f.scored = true;                 // a foul puts points on the board: opening phase ends
    this._recordVisit();             // the offender's visit ends here (counts as normal play)
    f.scores[1 - f.currentPlayer] += Math.max(4, points);
    this._switchPlayer();
  }

  concede() {
    const f = this.frame;
    if (f.isOver) return;
    this._pushUndo();
    this._finishFrame(1 - f.currentPlayer);
  }

  advanceFrame() {
    if (!this.frame.isOver || this.matchWinner !== null) return;
    this.frameNumber += 1;
    this.startingPlayer = 1 - this.startingPlayer;
    this.resetFrame();
    this.undoStack = [];
  }

  restartFrame() {
    this.breaks = this.breaks.filter(b => b.frame !== this.frameNumber);
    this.resetFrame();
    this.undoStack = [];
  }

  undo() {
    const snap = this.undoStack.pop();
    if (!snap) return false;
    const o = JSON.parse(snap);
    this.frame = o.frame;
    this.framesWon = o.framesWon;
    this.breaks = o.breaks || [];
    return true;
  }

  // --- internals ---

  _switchPlayer() {
    const f = this.frame;
    f.currentBreak = 0;
    f.currentPlayer = 1 - f.currentPlayer;
    // A half-finished red→colour reverts: the incoming player starts on a red.
    if (f.phase.type === 'colour' && f.redsRemaining > 0) f.phase = { type: 'red' };
  }

  _finishFrame(winner) {
    const f = this.frame;
    this._recordVisit();          // the player at the table ends their final visit
    f.winner = winner;
    f.isOver = true;
    this.framesWon[winner] += 1;
  }

  _recordVisit() {
    const f = this.frame;
    // "Opening" = a safety/break-off visit before the first pot of the frame.
    const opening = !f.scored && f.currentBreak === 0;
    this.breaks.push({
      player: f.currentPlayer,
      value: f.currentBreak,
      scored: f.currentBreak > 0,
      frame: this.frameNumber,
      opening: opening,
      breakOff: f.visits === 0,        // the frame's first visit is the break-off
      t: Date.now(),
    });
    f.visits += 1;
    if (f.currentBreak > 0) f.scored = true;
  }

  _pushUndo() {
    this.undoStack.push(JSON.stringify({ frame: this.frame, framesWon: this.framesWon, breaks: this.breaks }));
    if (this.undoStack.length > 300) this.undoStack.shift();
  }
}
