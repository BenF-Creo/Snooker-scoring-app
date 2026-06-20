import SwiftUI

@main
struct SnookerScoringApp: App {
    @StateObject private var match = MatchViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(match)
                .preferredColorScheme(.dark)
        }
    }
}
