import SwiftUI

/// Lets the user pick the penalty for a foul (4–7 points to the opponent).
struct FoulSheet: View {
    @EnvironmentObject var match: MatchViewModel
    @Environment(\.dismiss) private var dismiss

    private let penalties = [4, 5, 6, 7]

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Text("Award penalty points to \(match.name(1 - match.frame.currentPlayer)).")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)

                HStack(spacing: 12) {
                    ForEach(penalties, id: \.self) { points in
                        Button {
                            match.foul(points: points)
                            dismiss()
                        } label: {
                            VStack(spacing: 4) {
                                Text("\(points)")
                                    .font(.system(size: 34, weight: .bold, design: .rounded))
                                Text("pts")
                                    .font(.caption)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 22)
                            .background(
                                RoundedRectangle(cornerRadius: 16)
                                    .fill(Color.orange.opacity(0.22))
                            )
                            .foregroundStyle(.orange)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal)

                Text("A foul is worth at least 4 points, or the value of the ball involved if higher.")
                    .font(.footnote)
                    .foregroundStyle(.tertiary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)

                Spacer()
            }
            .padding(.top, 24)
            .navigationTitle("Foul")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium])
    }
}
