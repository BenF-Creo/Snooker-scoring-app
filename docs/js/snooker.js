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

const BREAK_MILESTONES = [10, 20, 30, 50, 70, 90, 100, 120, 147];

function ballByValue(v) { return SNOOKER_BALLS.find(b => b.value === v); }

class SnookerGame {
  constructor(bestOf, reds, handicaps) {
    this.bestOf = bestOf || 5;
    this.reds = (reds === 10) ? 10 : 15;   // standard 15, or the shorter 10-red game
    this.handicaps = (handicaps && handicaps.length === 2) ? handicaps.slice() : [0, 0];
    this.framesWon = [0, 0];
    this.frameNumber = 1;
    this.startingPlayer = 0;          // last player to break off (not pre-selected)
    this.breaks = [];                 // completed visits this match
    this.frameLog = [];               // completed frames this match
    this.undoStack = [];
    this.resetFrame();
  }

  get framesToWin() { return Math.floor(this.bestOf / 2) + 1; }
  get casual() { return this.bestOf === 1; }   // single frame = casual, not a match

  get matchWinner() {
    if (this.framesWon[0] >= this.framesToWin) return 0;
    if (this.framesWon[1] >= this.framesToWin) return 1;
    return null;
  }

  resetFrame() {
    this.frame = {
      scores: [this.handicaps[0] || 0, this.handicaps[1] || 0],   // start on handicap
      redsRemaining: this.reds,
      phase: { type: 'red' },          // 'red' | 'colour' | 'sequence'(value) | 'respot'
      currentPlayer: null,             // chosen at break-off; null = not started
      currentBreak: 0,
      highBreaks: [0, 0],
      breaker: null,
      scored: false,
      visits: 0,
      freeBall: false,
      startTime: null,                 // set when the break-off player is chosen
      endTime: null,
      pots: [0, 0],
      misses: [0, 0],
      safeties: [0, 0],
      fouls: [0, 0],
      isOver: false,
      winner: null,
    };
  }

  // The frame hasn't started until a break-off player is chosen.
  get started() { return this.frame.currentPlayer !== null; }

  // Still at the opening break-off (nothing scored yet) — breaker can be re-picked.
  get frameFresh() {
    const f = this.frame;
    return !f.isOver && f.visits === 0 && f.currentBreak === 0;
  }

  // Choose who breaks off; starts the frame timer. Re-pickable until play begins.
  setBreaker(seat) {
    if (!this.frameFresh) return;
    seat = seat ? 1 : 0;
    this.startingPlayer = seat;
    this.frame.breaker = seat;
    this.frame.currentPlayer = seat;
    if (this.frame.startTime === null) this.frame.startTime = Date.now();
  }

  toggleFreeBall() {
    const f = this.frame;
    if (f.isOver || f.currentPlayer === null || f.phase.type === 'respot') return;
    f.freeBall = !f.freeBall;
  }

  // --- queries ---

  legalKeys() {
    const f = this.frame;
    if (f.isOver || f.currentPlayer === null) return [];
    if (f.freeBall) return ['red', 'yellow', 'green', 'brown', 'blue', 'pink', 'black'];
    if (f.phase.type === 'red') return ['red'];
    if (f.phase.type === 'colour') return ['yellow', 'green', 'brown', 'blue', 'pink', 'black'];
    if (f.phase.type === 'sequence') { const b = ballByValue(f.phase.value); return b ? [b.key] : []; }
    if (f.phase.type === 'respot') return ['black'];
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
    if (f.freeBall) return 'Free ball — pot any';
    if (f.phase.type === 'respot') return 'Re-spotted black — pot to win';
    if (f.phase.type === 'red') return 'Pot a red';
    if (f.phase.type === 'colour') return 'Pot any colour';
    const b = ballByValue(f.phase.value);
    return 'Pot ' + (b ? b.name.toLowerCase() : '');
  }

  // --- actions ---

  pot(key) {
    const f = this.frame;
    if (f.isOver || f.currentPlayer === null || !this.legalKeys().includes(key)) return;
    if (f.freeBall) { this._potFreeBall(key); return; }
    this._pushUndo();

    const ball = SNOOKER_BALLS.find(b => b.key === key);
    const p = f.currentPlayer;
    f.pots[p] += 1;
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
        // Black potted. If the scores are level it goes to a re-spotted black.
        if (f.scores[0] === f.scores[1]) f.phase = { type: 'respot' };
        else this._finishFrame(this.leader());
      } else {
        f.phase = { type: 'sequence', value: f.phase.value + 1 };
      }
    } else if (f.phase.type === 'respot') {
      // Potting the re-spotted black wins the frame.
      this._finishFrame(p);
    }
  }

  // Free ball: the potted ball scores as the ball "on" (a red = 1, a colour = its
  // value); the nominated ball is re-spotted so the red count doesn't change.
  _potFreeBall(key) {
    const f = this.frame;
    this._pushUndo();
    const p = f.currentPlayer;
    f.freeBall = false;
    f.pots[p] += 1;
    f.scored = true;
    let val = 0;
    if (f.phase.type === 'red') {
      val = 1;
      f.phase = { type: 'colour' };
    } else if (f.phase.type === 'colour') {
      const ball = SNOOKER_BALLS.find(b => b.key === key);
      val = ball ? ball.value : 2;
      f.phase = f.redsRemaining > 0 ? { type: 'red' } : { type: 'sequence', value: 2 };
    } else if (f.phase.type === 'sequence') {
      val = f.phase.value;   // scores the colour on; that colour is still on
    }
    f.scores[p] += val;
    f.currentBreak += val;
    f.highBreaks[p] = Math.max(f.highBreaks[p], f.currentBreak);
  }

  // A played safety (no pot) — ends the visit.
  safety() { this._endVisit('safety'); }

  // A missed pot — ends the visit.
  miss() { this._endVisit('miss'); }

  foul(points) {
    const f = this.frame;
    if (f.isOver || f.currentPlayer === null) return;
    this._pushUndo();
    f.fouls[f.currentPlayer] += 1;
    f.scored = true;                 // a foul puts points on the board: opening phase ends
    f.freeBall = false;
    f.scores[1 - f.currentPlayer] += Math.max(4, points);
    // A foul on the re-spotted black loses the frame.
    if (f.phase.type === 'respot') { this._finishFrame(1 - f.currentPlayer); return; }
    this._recordVisit('foul');
    this._switchPlayer();
  }

  // Concede the frame: `loser` is the seat giving it up.
  concede(loser) {
    const f = this.frame;
    if (f.isOver) return;
    if (loser !== 0 && loser !== 1) loser = f.currentPlayer === 0 ? 0 : 1;
    this._pushUndo();
    if (f.currentPlayer === null) f.currentPlayer = loser;   // allow conceding before break-off
    this._finishFrame(1 - loser);
  }

  advanceFrame() {
    if (!this.frame.isOver || this.matchWinner !== null) return;
    this.frameNumber += 1;
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
    this.frameLog = o.frameLog || [];
    return true;
  }

  // --- internals ---

  _endVisit(reason) {
    const f = this.frame;
    if (f.isOver || f.currentPlayer === null) return;
    this._pushUndo();
    if (reason === 'miss') f.misses[f.currentPlayer] += 1;
    else if (reason === 'safety') f.safeties[f.currentPlayer] += 1;
    this._recordVisit(reason);
    this._switchPlayer();
  }

  _switchPlayer() {
    const f = this.frame;
    f.currentBreak = 0;
    f.currentPlayer = 1 - f.currentPlayer;
    // A half-finished red→colour reverts on a change of turn: the incoming
    // player starts on a red while reds remain, or on the colours in order
    // (yellow) once the last red has gone.
    if (f.phase.type === 'colour') {
      f.phase = f.redsRemaining > 0 ? { type: 'red' } : { type: 'sequence', value: 2 };
    }
  }

  _finishFrame(winner) {
    const f = this.frame;
    this._recordVisit('frame');       // the player at the table ends their final visit
    f.winner = winner;
    f.isOver = true;
    f.endTime = Date.now();
    this.framesWon[winner] += 1;
    this.frameLog.push({
      frame: this.frameNumber,
      winner: winner,
      scores: [f.scores[0], f.scores[1]],
      durationMs: f.startTime ? (f.endTime - f.startTime) : 0,
      breaker: f.breaker,
      pots: [f.pots[0], f.pots[1]],
      misses: [f.misses[0], f.misses[1]],
      safeties: [f.safeties[0], f.safeties[1]],
      fouls: [f.fouls[0], f.fouls[1]],
    });
  }

  _recordVisit(reason) {
    const f = this.frame;
    // "Opening" = a safety/break-off visit before the first point of the frame.
    const opening = !f.scored && f.currentBreak === 0;
    this.breaks.push({
      player: f.currentPlayer,
      value: f.currentBreak,
      scored: f.currentBreak > 0,
      frame: this.frameNumber,
      opening: opening,
      breakOff: f.visits === 0,
      end: reason || 'miss',
      t: Date.now(),
    });
    f.visits += 1;
    if (f.currentBreak > 0) f.scored = true;
  }

  _pushUndo() {
    this.undoStack.push(JSON.stringify({
      frame: this.frame, framesWon: this.framesWon, breaks: this.breaks, frameLog: this.frameLog,
    }));
    if (this.undoStack.length > 300) this.undoStack.shift();
  }
}
