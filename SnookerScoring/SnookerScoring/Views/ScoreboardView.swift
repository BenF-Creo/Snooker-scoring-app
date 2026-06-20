import SwiftUI

/// The two side-by-side player panels showing score, frames and the active break.
struct ScoreboardView: View {
    @EnvironmentObject var match: MatchViewModel

    var body: some View {
        HStack(spacing: 12) {
            playerPanel(0)
            playerPanel(1)
        }
    }

    private func playerPanel(_ player: Int) -> some View {
        let isActive = !match.frame.isOver && match.frame.currentPlayer == player
        let isLeading = match.frame.leader == player && match.frame.lead > 0

        return VStack(spacing: 6) {
            HStack(spacing: 6) {
                if isActive {
                    Circle()
                        .fill(Color.green)
                        .frame(width: 9, height: 9)
                }
                Text(match.name(player))
                    .font(.headline)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }

            Text("\(match.frame.scores[player])")
                .font(.system(size: 64, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(isLeading ? Color.green : Color.primary)
                .contentTransition(.numericText())

            HStack(spacing: 14) {
                Label("\(match.framesWon[player])", systemImage: "trophy.fill")
                Label("\(match.frame.highBreaks[player])", systemImage: "flame.fill")
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            if isActive && match.frame.currentBreak > 0 {
                Text("Break \(match.frame.currentBreak)")
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(Color.green.opacity(0.25)))
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(.secondarySystemBackground))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .strokeBorder(isActive ? Color.green : Color.clear, lineWidth: 2)
        )
        .animation(.easeInOut(duration: 0.2), value: isActive)
    }
}
