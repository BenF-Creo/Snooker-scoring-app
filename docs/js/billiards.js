/* English Billiards rule engine — plain data + methods, no DOM. */

const BILLIARDS_STROKES = [
  { key: 'cannon',     label: 'Cannon',      value: 2, sub: 'hit both balls',   balls: ['red', 'white'] },
  { key: 'potRed',     label: 'Pot Red',     value: 3, sub: 'winning hazard',   balls: ['red'] },
  { key: 'inOffRed',   label: 'In-off Red',  value: 3, sub: 'losing hazard',    balls: ['white', 'red'] },
  { key: 'potWhite',   label: 'Pot White',   value: 2, sub: "opponent's ball",  balls: ['white'] },
  { key: 'inOffWhite', label: 'In-off White', value: 2, sub: 'off the white',   balls: ['white', 'white'] },
];

class BilliardsGame {
  constructor(target) {
    // target is a number, or null for "no limit".
    this.target = (target === null || target === undefined) ? 100 : target;
    this.scores = [0, 0];
    this.currentPlayer = 0;
    this.currentBreak = 0;
    this.highBreaks = [0, 0];
    this.isOver = false;
    this.winner = null;
    this.undoStack = [];
  }

  pointsToGo(player) {
    if (!this.target) return null;
    return Math.max(0, this.target - this.scores[player]);
  }

  score(key) {
    if (this.isOver) return;
    const stroke = BILLIARDS_STROKES.find(s => s.key === key);
    if (!stroke) return;
    this._pushUndo();
    const p = this.currentPlayer;
    this.scores[p] += stroke.value;
    this.currentBreak += stroke.value;
    this.highBreaks[p] = Math.max(this.highBreaks[p], this.currentBreak);
    if (this.target && this.scores[p] >= this.target) {
      this.isOver = true;
      this.winner = p;
    }
  }

  endTurn() {
    if (this.isOver) return;
    this._pushUndo();
    this.currentBreak = 0;
    this.currentPlayer = 1 - this.currentPlayer;
  }

  finishGame() {
    if (this.isOver) return;
    this._pushUndo();
    this.isOver = true;
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

  _pushUndo() {
    this.undoStack.push(JSON.stringify({
      scores: this.scores.slice(),
      currentPlayer: this.currentPlayer,
      currentBreak: this.currentBreak,
      highBreaks: this.highBreaks.slice(),
      isOver: this.isOver,
      winner: this.winner,
    }));
    if (this.undoStack.length > 500) this.undoStack.shift();
  }
}
