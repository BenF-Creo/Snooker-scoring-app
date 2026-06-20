import SwiftUI

struct ContentView: View {
    @EnvironmentObject var match: MatchViewModel
    @State private var showingFoul = false
    @State private var showingSettings = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color(.systemBackground).ignoresSafeArea()

                VStack(spacing: 16) {
                    headerBar

                    ScoreboardView()

                    statusStrip

                    Spacer(minLength: 4)

                    BallGridView()

                    ActionBarView(showingFoul: $showingFoul)
                }
                .padding(16)
                .disabled(match.frame.isOver)

                if match.frame.isOver {
                    frameOverOverlay
                        .transition(.opacity.combined(with: .scale))
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text(frameTitle)
                        .font(.headline)
                }
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Button(role: .destructive) {
                            match.concedeFrame()
                        } label: {
                            Label("Concede Frame", systemImage: "flag.fill")
                        }
                        .disabled(match.frame.isOver)

                        Button {
                            match.restartFrame()
                        } label: {
                            Label("Restart Frame", systemImage: "arrow.counterclockwise")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                    }
                }
            }
            .sheet(isPresented: $showingFoul) {
                FoulSheet()
            }
            .sheet(isPresented: $showingSettings) {
                SettingsView()
            }
            .animation(.spring(duration: 0.3), value: match.frame.isOver)
        }
    }

    // MARK: - Pieces

    private var frameTitle: String {
        "Frame \(match.frameNumber) · Best of \(match.settings.bestOf)"
    }

    private var headerBar: some View {
        HStack {
            Text("\(match.framesWon[0])")
                .fontWeight(.bold)
            Text("frames")
                .foregroundStyle(.secondary)
            Text("\(match.framesWon[1])")
                .fontWeight(.bold)
            Spacer()
            Text("First to \(match.settings.framesToWin)")
                .foregroundStyle(.secondary)
        }
        .font(.subheadline)
    }

    private var statusStrip: some View {
        HStack {
            Label(nextUpText, systemImage: "target")
            Spacer()
            Label("\(match.frame.pointsRemaining) left", systemImage: "circle.grid.3x3.fill")
        }
        .font(.subheadline.weight(.medium))
        .foregroundStyle(.secondary)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.secondarySystemBackground))
        )
    }

    private var nextUpText: String {
        switch match.frame.phase {
        case .redRequired:
            return "Pot a red"
        case .colourRequired:
            return "Pot any colour"
        case .coloursInOrder(let value):
            let name = Ball.allCases.first { $0.value == value }?.name ?? ""
            return "Pot \(name.lowercased())"
        }
    }

    private var frameOverOverlay: some View {
        let winner = match.frame.winner ?? match.frame.currentPlayer
        let matchOver = match.isMatchOver

        return ZStack {
            Color.black.opacity(0.55).ignoresSafeArea()

            VStack(spacing: 18) {
                Image(systemName: matchOver ? "trophy.fill" : "checkmark.seal.fill")
                    .font(.system(size: 52))
                    .foregroundStyle(.yellow)

                Text(matchOver ? "Match Won!" : "Frame Won")
                    .font(.title2.weight(.bold))

                Text(match.name(winner))
                    .font(.title3)

                Text("\(match.frame.scores[0]) – \(match.frame.scores[1])")
                    .font(.system(.title3, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)

                Text("Frames: \(match.framesWon[0]) – \(match.framesWon[1])")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                if matchOver {
                    Button {
                        match.newMatch()
                    } label: {
                        Label("New Match", systemImage: "arrow.counterclockwise")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                } else {
                    Button {
                        match.advanceToNextFrame()
                    } label: {
                        Label("Next Frame", systemImage: "arrow.right.circle.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            .padding(28)
            .frame(maxWidth: 320)
            .background(
                RoundedRectangle(cornerRadius: 24)
                    .fill(Color(.secondarySystemBackground))
            )
            .padding(40)
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(MatchViewModel())
}
