import Foundation
import SwiftUI

/// Drives a whole match: the live frame, the rule engine that mutates it, the
/// undo history, and the running frame tally.
final class MatchViewModel: ObservableObject {
    @Published var settings = MatchSettings()
    @Published private(set) var frame: FrameState
    @Published private(set) var framesWon = [0, 0]
    @Published private(set) var frameNumber = 1
    @Published private(set) var startingPlayer = 0

    /// Snapshot stored before each scoring action so `undo()` is a simple pop.
    /// Captures the frame tally as well, because the frame-winning pot also
    /// increments `framesWon` and undo must reverse both.
    private struct Snapshot {
        let frame: FrameState
        let framesWon: [Int]
    }

    private var undoStack: [Snapshot] = []

    init() {
        self.frame = FrameState(startingPlayer: 0)
    }

    // MARK: - Derived state

    var canUndo: Bool { !undoStack.isEmpty }

    var matchWinner: Int? {
        if framesWon[0] >= settings.framesToWin { return 0 }
        if framesWon[1] >= settings.framesToWin { return 1 }
        return nil
    }

    var isMatchOver: Bool { matchWinner != nil }

    func name(_ player: Int) -> String {
        let trimmed = settings.playerNames[player].trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty ? "Player \(player + 1)" : trimmed
    }

    // MARK: - Scoring actions

    /// Pot a ball that is legal for the player currently at the table.
    func pot(_ ball: Ball) {
        guard !frame.isOver, frame.isLegal(ball) else { return }
        pushUndo()

        let player = frame.currentPlayer
        frame.scores[player] += ball.value
        frame.currentBreak += ball.value
        frame.highBreaks[player] = max(frame.highBreaks[player], frame.currentBreak)

        switch frame.phase {
        case .redRequired:
            frame.redsRemaining -= 1
            frame.phase = .colourRequired
        case .colourRequired:
            frame.phase = frame.redsRemaining > 0
                ? .redRequired
                : .coloursInOrder(Ball.yellow.value)
        case .coloursInOrder(let value):
            if value >= Ball.black.value {
                finishFrame(winner: frame.leader ?? frame.currentPlayer)
            } else {
                frame.phase = .coloursInOrder(value + 1)
            }
        }
    }

    /// End the current visit with no pot (a missed pot or a safety shot).
    func endTurn() {
        guard !frame.isOver else { return }
        pushUndo()
        switchPlayer()
    }

    /// Award a foul against the player at the table. `points` is the penalty
    /// given to the opponent (minimum 4 in snooker).
    func foul(points: Int) {
        guard !frame.isOver else { return }
        pushUndo()
        let opponent = 1 - frame.currentPlayer
        frame.scores[opponent] += max(4, points)
        switchPlayer()
    }

    /// The player at the table concedes the frame to the opponent.
    func concedeFrame() {
        guard !frame.isOver else { return }
        pushUndo()
        finishFrame(winner: 1 - frame.currentPlayer)
    }

    func undo() {
        guard let previous = undoStack.popLast() else { return }
        frame = previous.frame
        framesWon = previous.framesWon
    }

    // MARK: - Frame / match lifecycle

    /// Deal a fresh frame after the current one has been won.
    func advanceToNextFrame() {
        guard frame.isOver, !isMatchOver else { return }
        frameNumber += 1
        startingPlayer = 1 - startingPlayer
        frame = FrameState(startingPlayer: startingPlayer)
        undoStack.removeAll()
    }

    /// Discard the current frame's progress and re-rack it (no effect on the
    /// frame tally).
    func restartFrame() {
        frame = FrameState(startingPlayer: startingPlayer)
        undoStack.removeAll()
    }

    /// Reset everything back to the start of a brand-new match.
    func newMatch() {
        framesWon = [0, 0]
        frameNumber = 1
        startingPlayer = 0
        frame = FrameState(startingPlayer: 0)
        undoStack.removeAll()
    }

    // MARK: - Helpers

    private func switchPlayer() {
        frame.currentBreak = 0
        frame.currentPlayer = 1 - frame.currentPlayer
        // Once the break ends, a half-completed red→colour reverts: the incoming
        // player must start again on a red while any reds remain.
        if case .colourRequired = frame.phase, frame.redsRemaining > 0 {
            frame.phase = .redRequired
        }
    }

    /// Mark the frame as won and bank the frame straight away, so match-over is
    /// known immediately (the overlay can show the trophy without an extra tap).
    private func finishFrame(winner: Int) {
        frame.winner = winner
        frame.isOver = true
        framesWon[winner] += 1
    }

    private func pushUndo() {
        undoStack.append(Snapshot(frame: frame, framesWon: framesWon))
        // Keep the history bounded; a frame never needs hundreds of steps.
        if undoStack.count > 200 { undoStack.removeFirst() }
    }
}
