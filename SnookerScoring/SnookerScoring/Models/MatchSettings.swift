import Foundation

/// Match-wide configuration the user can edit from the settings sheet.
struct MatchSettings: Equatable {
    var playerNames: [String] = ["Player 1", "Player 2"]

    /// Best-of frames. Always odd so the match cannot be drawn.
    var bestOf: Int = 5

    /// Number of frames a player must win to take the match.
    var framesToWin: Int { bestOf / 2 + 1 }

    static let bestOfOptions = [1, 3, 5, 7, 9, 11, 15, 19, 25, 35]
}
