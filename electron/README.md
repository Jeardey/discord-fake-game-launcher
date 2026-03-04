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
npm run prepare:dummy
npm run dev
```

## Build an installer (Setup.exe)

```powershell
npm run build:dummy:win
npm run prepare:dummy:win
npm run dist:win
```

This produces an NSIS installer in `electron/dist/` that installs to Program Files and creates shortcuts.

## Build Linux packages (.AppImage, .deb, .rpm)

```bash
npm run build:dummy:linux
npm run prepare:dummy:linux
npm run dist:linux
```

This produces Linux artifacts in `electron/dist/`.

## Optional: portable build

```powershell
npm run dist:portable
```

Notes:
- The UI stores your installed games in Electron userData as `myGames.json`.
- It stores Discord's detectable app list in userData as `gamelist.json`.
- Fake executables are created under userData `games/` (so the app can run without admin rights).

If DummyGame cannot be found, set `DUMMYGAME_BINARY` (or `DUMMYGAME_EXE` for backward compatibility) to the built binary path.
