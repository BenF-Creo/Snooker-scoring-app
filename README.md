# 🎱 Snooker Scoring

A native iOS app for keeping score during a game of snooker, built with SwiftUI.
It enforces the real rules of snooker so you can just tap the ball that was
potted and let the app handle the sequencing, breaks, fouls and frame totals.

## Features

- **Full rule engine** — guides play through the legal sequence: a red, then a
  colour, repeating until the reds are gone, then the colours in order
  (yellow → green → brown → blue → pink → black). Illegal balls are dimmed and
  cannot be tapped.
- **Live break tracking** — the current break and each player's highest break of
  the frame are shown as you score.
- **Fouls** — award a 4–7 point penalty to the opponent with a single tap.
- **Frames & matches** — play best-of 1 up to best-of 35; the app tracks frames
  won, alternates the break each frame, and declares the match winner.
- **Undo** — step back through every action, including a frame-winning pot.
- **Points remaining** — see how many points are still on the table.
- **Concede / restart frame** from the toolbar menu.
- Player names and match length are configurable.

## Requirements

- Xcode 16 or later
- iOS 17.0+ (iPhone and iPad)

## Getting started

```bash
open SnookerScoring/SnookerScoring.xcodeproj
```

Then pick an iPhone simulator (or your device) and press **Run** (⌘R).

## Project layout

```
SnookerScoring/
├─ SnookerScoring.xcodeproj          # Xcode project
└─ SnookerScoring/
   ├─ SnookerScoringApp.swift        # App entry point
   ├─ Models/
   │  ├─ Ball.swift                  # Ball values, names, colours
   │  ├─ FrameState.swift            # Frame state + legal-ball logic
   │  └─ MatchSettings.swift         # Player names, match length
   ├─ ViewModels/
   │  └─ MatchViewModel.swift        # Rule engine, scoring, undo, match flow
   ├─ Views/
   │  ├─ ContentView.swift           # Main screen + frame/match-over overlay
   │  ├─ ScoreboardView.swift        # Two player score panels
   │  ├─ BallGridView.swift          # Tappable balls
   │  ├─ ActionBarView.swift         # End turn / foul / undo
   │  ├─ FoulSheet.swift             # Foul penalty picker
   │  └─ SettingsView.swift          # Match setup
   └─ Assets.xcassets                # App icon & accent colour
```

## How scoring works

The `MatchViewModel` holds a value-type `FrameState` and mutates it through a
small set of actions (`pot`, `endTurn`, `foul`, `concedeFrame`). Before every
action it pushes a snapshot onto an undo stack, so undo is just a pop. A
`Phase` enum (`redRequired`, `colourRequired`, `coloursInOrder`) tracks what may
be potted next and drives which ball buttons are enabled.

### Simplifications

To keep the interface tap-friendly, a few less-common situations are handled
manually rather than automatically: free balls and the re-spotted black (on a
tied frame) are not modelled, and a foul does not attempt to remove a wrongly
potted ball from the table — use **Undo** if you need to correct the table
state. These cover edge cases that rarely come up in a casual game.
