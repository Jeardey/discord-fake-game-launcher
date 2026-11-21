# Electron UI (Fake Game Launcher)

This folder contains an Electron-based GUI for the existing .NET launcher logic.

## Dev prerequisites

- Node.js (LTS recommended)
- .NET SDK 8

## Run

From this folder:

```powershell
npm install
npm run build:dummy
npm run dev
```

## Tests

```powershell
npm test
```

Runs the unit tests for the pure logic (random mode, popular games matcher, library merge, game icons) and
checks that the pt-BR / en / es translations have the same keys and that every key used by the UI exists.


## Build an installer (Setup.exe)

```powershell
npm run dist
```

This produces an NSIS installer in `electron/dist/` that installs to Program Files and creates shortcuts.

## Optional: portable build

```powershell
npm run dist:portable
```

Notes:
- The UI stores your installed games in Electron userData as `myGames.json`.
- It stores Discord's detectable app list in userData as `gamelist.json`.
- Fake executables are created under userData `games/` (so the app can run without admin rights).

If `DummyGame.exe` cannot be found, set `DUMMYGAME_EXE` to the built exe path.


## Languages

UI texts live in `src/renderer/i18n.js` (pt-BR, en, es). To add or change a text, edit it in all three languages;
`npm test` fails if one language is missing a key. The full documentation is in the root `README.md`,
`README.pt-BR.md` and `README.es.md`.
