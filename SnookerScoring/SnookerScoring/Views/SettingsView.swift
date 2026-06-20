import SwiftUI

/// Match setup: player names, match length, and reset.
struct SettingsView: View {
    @EnvironmentObject var match: MatchViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var showResetConfirm = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Players") {
                    TextField("Player 1", text: $match.settings.playerNames[0])
                        .textInputAutocapitalization(.words)
                    TextField("Player 2", text: $match.settings.playerNames[1])
                        .textInputAutocapitalization(.words)
                }

                Section("Match length") {
                    Picker("Best of", selection: $match.settings.bestOf) {
                        ForEach(MatchSettings.bestOfOptions, id: \.self) { n in
                            Text("Best of \(n)").tag(n)
                        }
                    }
                    Text("First to \(match.settings.framesToWin) frame\(match.settings.framesToWin == 1 ? "" : "s") wins the match.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section {
                    Button(role: .destructive) {
                        showResetConfirm = true
                    } label: {
                        Label("Start New Match", systemImage: "arrow.counterclockwise")
                    }
                } footer: {
                    Text("Resets both players' frames and scores to zero.")
                }
            }
            .navigationTitle("Match Setup")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .confirmationDialog(
                "Start a new match? Current scores will be lost.",
                isPresented: $showResetConfirm,
                titleVisibility: .visible
            ) {
                Button("Start New Match", role: .destructive) {
                    match.newMatch()
                    dismiss()
                }
                Button("Cancel", role: .cancel) {}
            }
        }
    }
}
