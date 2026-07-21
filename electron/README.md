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

## Build an installer (Setup.exe)

```powershell
npm run dist
```

This produces an NSIS installer in `electron/dist/` that installs to Program Files and creates shortcuts.

## Optional: portable build

```powershell
npm run dist:portable
```

## Linux (early support)

```bash
npm install
npm run build:dummy:linux
npm run dev
```

Build an AppImage:

```bash
npm run build:dummy:linux
npm run dist:linux
```

Notes for Linux:
- Discord's Linux detection only checks for a running process with the right
  name, so the "fake game" process is headless (no window).
- "Create shortcut" writes a `.desktop` file to the Desktop instead of a
  `.lnk` file.
- The dummy binary is looked up as `DummyGame` (no extension). Set
  `DUMMYGAME_EXE` to override the path if it can't be found automatically.

Notes (all platforms):
- The UI stores your installed games in Electron userData as `myGames.json`.
- It stores Discord's detectable app list in userData as `gamelist.json`.
- Fake executables are created under userData `games/` (so the app can run without admin rights).

If the dummy binary cannot be found, set `DUMMYGAME_EXE` to the built binary path.
