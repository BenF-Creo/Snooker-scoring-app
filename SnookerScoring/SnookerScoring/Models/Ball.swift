import SwiftUI

/// A snooker ball. The raw value is the ball's point value, which is also used
/// to order the colours during the final sequence (yellow → black).
enum Ball: Int, CaseIterable, Identifiable {
    case red = 1
    case yellow = 2
    case green = 3
    case brown = 4
    case blue = 5
    case pink = 6
    case black = 7

    var id: Int { rawValue }

    /// Point value awarded for potting this ball.
    var value: Int { rawValue }

    var isColour: Bool { self != .red }

    var name: String {
        switch self {
        case .red: return "Red"
        case .yellow: return "Yellow"
        case .green: return "Green"
        case .brown: return "Brown"
        case .blue: return "Blue"
        case .pink: return "Pink"
        case .black: return "Black"
        }
    }

    /// On-table display colour.
    var colour: Color {
        switch self {
        case .red: return Color(red: 0.82, green: 0.10, blue: 0.10)
        case .yellow: return Color(red: 0.98, green: 0.80, blue: 0.10)
        case .green: return Color(red: 0.10, green: 0.55, blue: 0.25)
        case .brown: return Color(red: 0.50, green: 0.30, blue: 0.12)
        case .blue: return Color(red: 0.12, green: 0.35, blue: 0.85)
        case .pink: return Color(red: 0.95, green: 0.45, blue: 0.62)
        case .black: return Color(red: 0.10, green: 0.10, blue: 0.12)
        }
    }

    /// Text colour that reads well on top of `colour`.
    var foreground: Color {
        switch self {
        case .yellow, .pink: return .black
        default: return .white
        }
    }

    /// The six colours, in the order they must be potted once the reds are gone.
    static let coloursInOrder: [Ball] = [.yellow, .green, .brown, .blue, .pink, .black]
}
