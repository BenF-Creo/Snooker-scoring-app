import Foundation

/// What the player at the table is allowed to pot next.
enum Phase: Equatable {
    /// Reds are on the table and a red must be potted.
    case redRequired
    /// A red has just been potted; any colour may be potted (and is respotted).
    case colourRequired
    /// All reds are gone; the colours must be cleared in order. The associated
    /// value is the point value of the colour that must be potted next (2...7).
    case coloursInOrder(Int)
}

/// The complete, value-type state of a single frame. Copied onto an undo stack
/// before every scoring action so that `undo()` is a simple pop.
struct FrameState: Equatable {
    var scores: [Int] = [0, 0]
    var redsRemaining: Int = 15
    var phase: Phase = .redRequired
    var currentPlayer: Int = 0
    var currentBreak: Int = 0
    var highBreaks: [Int] = [0, 0]
    var isOver: Bool = false
    /// Set when the frame is decided (cleared table or a concession).
    var winner: Int? = nil

    init(startingPlayer: Int = 0) {
        self.currentPlayer = startingPlayer
    }

    /// The balls that may legally be potted right now.
    var legalBalls: [Ball] {
        guard !isOver else { return [] }
        switch phase {
        case .redRequired:
            return [.red]
        case .colourRequired:
            return Ball.coloursInOrder
        case .coloursInOrder(let value):
            return Ball.allCases.filter { $0.value == value }
        }
    }

    func isLegal(_ ball: Ball) -> Bool { legalBalls.contains(ball) }

    /// Approximate points still available on the table — useful for showing
    /// whether the trailing player can still win.
    var pointsRemaining: Int {
        switch phase {
        case .coloursInOrder(let value):
            return (value...7).reduce(0, +)
        case .colourRequired:
            // A colour is owed now, plus a colour for each remaining red, plus
            // the final clearance of all six colours.
            return 7 + redsRemaining * 8 + 27
        case .redRequired:
            return redsRemaining * 8 + 27
        }
    }

    var leader: Int? {
        if scores[0] == scores[1] { return nil }
        return scores[0] > scores[1] ? 0 : 1
    }

    var lead: Int { abs(scores[0] - scores[1]) }
}
