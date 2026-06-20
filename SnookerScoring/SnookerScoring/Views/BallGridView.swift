import SwiftUI

/// The row of pottable balls. Illegal balls are dimmed and disabled so the
/// player is guided through the legal sequence.
struct BallGridView: View {
    @EnvironmentObject var match: MatchViewModel

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 10), count: 4)

    var body: some View {
        LazyVGrid(columns: columns, spacing: 10) {
            ForEach(Ball.allCases) { ball in
                ballButton(ball)
            }
        }
    }

    private func ballButton(_ ball: Ball) -> some View {
        let legal = match.frame.isLegal(ball)
        let reds = ball == .red ? match.frame.redsRemaining : nil

        return Button {
            match.pot(ball)
        } label: {
            ZStack(alignment: .topTrailing) {
                Circle()
                    .fill(ball.colour)
                    .overlay(Circle().strokeBorder(.white.opacity(0.25), lineWidth: 1))
                    .overlay(
                        Text("\(ball.value)")
                            .font(.title2.weight(.bold))
                            .foregroundStyle(ball.foreground)
                    )
                    .frame(height: 64)

                if let reds, legal {
                    Text("×\(reds)")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.white)
                        .padding(4)
                        .background(Circle().fill(.black.opacity(0.6)))
                        .offset(x: 4, y: -4)
                }
            }
            .frame(maxWidth: .infinity)
            .opacity(legal ? 1 : 0.25)
            .scaleEffect(legal ? 1 : 0.92)
        }
        .buttonStyle(.plain)
        .disabled(!legal)
        .animation(.easeInOut(duration: 0.15), value: legal)
        .accessibilityLabel("\(ball.name), \(ball.value) points")
        .accessibilityHint(legal ? "Pot this ball" : "Not legal right now")
    }
}
