# 🎱 Cue Sports Scorer

Two ways to keep score for snooker (and now **English Billiards**):

1. **📱 Mobile web app** (`docs/`) — works in any phone browser, no install or
   Mac needed. This is the easiest one to actually use. See
   [Web app](#-web-app-snooker--english-billiards) below.
2. **Native iOS app** (`SnookerScoring/`) — a SwiftUI Xcode project for snooker.
   See [iOS app](#-ios-app-snooker) below.

---

## 📱 Web app (Snooker & English Billiards)

A mobile-first web app in `docs/`. No build step — it's plain HTML, CSS and
JavaScript, and can be added to your phone's home screen to run full-screen and
offline like a real app.

### Features

- **Two games:** Snooker (full rules, breaks, frames & matches) and English
  Billiards (cannons, pots, in-offs, play to a target score).
- **Rules section** for each game, written in plain English.
- **Player profiles** — create and save named players, pick who's playing each
  game, and stats are tracked to that profile (renaming keeps their history).
- **Break-building statistics** (all-time, per profile): highest break,
  20+/50+/century counts, average break, points per visit, consistency
  (% of visits that scored), a break-size distribution, and a break-by-break
  log — for both games.
- **Leaderboard** ranking every player by highest break, centuries, average,
  breaks made or consistency, for either game.
- The live scoreboard shows each player's **match-high break**.
- **In-progress games are auto-saved**, so a refresh won't lose your score.
- **Installable / offline** via a web app manifest and service worker.

### Try it on your phone (free hosting via GitHub Pages)

1. In GitHub: **Settings → Pages**.
2. Under *Build and deployment*, set **Source = Deploy from a branch**, pick this
   branch, set the folder to **`/docs`**, and **Save**.
3. After a minute GitHub gives you a URL like
   `https://<user>.github.io/<repo>/`. Open it on your phone.
4. To install: in Safari tap **Share → Add to Home Screen** (or Chrome's
   **⋮ → Add to Home screen**).

To run it locally on a computer, serve the folder (a service worker needs
`http`, not `file://`):

```bash
cd docs && python3 -m http.server 8000   # then open http://localhost:8000
```

### Web app layout

```
docs/
├─ index.html                 # All screens (home, games, rules, settings)
├─ styles.css                 # Mobile-first dark "baize" theme
├─ manifest.webmanifest       # PWA install metadata
├─ sw.js                      # Offline cache (service worker)
├─ icons/icon.svg             # App icon
└─ js/
   ├─ snooker.js              # Snooker rule engine (DOM-free)
   ├─ billiards.js            # English Billiards rule engine (DOM-free)
   └─ app.js                  # Navigation, settings, persistence, rendering
```

---

## 📲 iOS app (Snooker)

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
