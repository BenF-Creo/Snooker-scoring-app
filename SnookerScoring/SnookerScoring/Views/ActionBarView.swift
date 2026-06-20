import SwiftUI

/// The non-potting actions: end of turn, foul, undo.
struct ActionBarView: View {
    @EnvironmentObject var match: MatchViewModel
    @Binding var showingFoul: Bool

    var body: some View {
        HStack(spacing: 10) {
            actionButton(
                title: "End Turn",
                systemImage: "arrow.left.arrow.right",
                tint: .blue
            ) {
                match.endTurn()
            }
            .disabled(match.frame.isOver)

            actionButton(
                title: "Foul",
                systemImage: "exclamationmark.triangle.fill",
                tint: .orange
            ) {
                showingFoul = true
            }
            .disabled(match.frame.isOver)

            actionButton(
                title: "Undo",
                systemImage: "arrow.uturn.backward",
                tint: .gray
            ) {
                match.undo()
            }
            .disabled(!match.canUndo)
        }
    }

    private func actionButton(
        title: String,
        systemImage: String,
        tint: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: systemImage)
                    .font(.title3)
                Text(title)
                    .font(.caption.weight(.semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(tint.opacity(0.22))
            )
            .foregroundStyle(tint)
        }
        .buttonStyle(.plain)
    }
}
