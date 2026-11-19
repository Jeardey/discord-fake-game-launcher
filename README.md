
# Discord Fake Game Launcher

This tool creates small dummy executable files that mimic real game processes
that Discord looks for when detecting **verified / registered games**.
Can be used for completing Discord Quests without installing the game.

> [!IMPORTANT]  
> This tool is intended for educational purposes and personal use. Please respect Discord's terms of service, partners, game publishers and advertisers rights when using this application.
> Discord is a registered trademark of Discord Inc. It is referenced on this open-source project for descriptive and definition purposes only and does not imply any affiliation, sponsorship, or endorsement by Discord Inc in any way.



## How it works

- Reads Discord's registered games from the gamelist.json
- Scans file for `.exe` names.
- Lets you search and pick one.
- Creates a dummy exe in:

  `%APPDATA%/discord-fake-game-launcher-ui/games/dummygame/<GameID>/<GameName>.exe`

- Launches that dummy exe.  
  Discord detects it as if the real game is running.

The same executable acts as:

- **Launcher** when run from the shortcut or from root folder.
- **Fake game** when run from a subfolder inside `games/`.

## Features (Electron UI)

- Search Discord's full list of detectable games and add them to your library.
- Launch several fake games at the same time, favorite them, and create desktop shortcuts.
- **Add popular games pack**: one click adds well-known titles (see below).
- **Random Mode**: automatically rotates through random games every X minutes (see below).
- The game list is refreshed from Discord's public API every time the app starts. If Discord cannot be
  reached, the app keeps using the last saved list.

## Random Mode

Random Mode keeps one fake game running at a time and swaps it for a different random one on a timer.

### How to use

1. Click **Random Mode** in the left sidebar.
2. Set **Switch game every (minutes)** (from 1 to 1440).
3. Choose **Pick games from**:
   - **My library**: only games you already added to your library.
   - **Entire Discord database**: any game Discord recognizes (thousands of games).
4. Check the **Pool** line: it shows how many games can be picked. It must be at least 1.
5. Click **Start random mode**. A game starts right away.
6. Click **Stop random mode** (or close the app) to end it. The current fake game is closed too.

The sidebar button shows **Random Mode · ON** while it is running, and the window shows the game that is
playing now, a countdown to the next switch and how many switches happened.

### What happens on every switch

1. The current fake game is stopped.
2. The launcher waits about 5 seconds, so Discord notices the game ended.
3. A different random game is started. The last games played are avoided so you do not get the same one
   again and again.

### Which games can be picked

Only games that Discord **recognizes by their executable name** are used. These are never picked:

- games Discord lists without an executable ("new detection" games, the app shows a warning for them),
- entries that only have a launcher executable (Entire Discord database mode),
- entries with invalid Windows file names.

If a game fails to start, the launcher silently tries another one. Games picked from the Discord database
that are not in your library are deleted from disk when they stop, so the `games` folder does not fill up.

### Good to know

- If you close a fake game window by hand, Random Mode picks a new game at the next switch time.
- Games you started manually are never touched or picked by Random Mode while they are running.
- If a Discord Quest needs a long, continuous time in **one specific game**, rotating games will not help
  with it. Use a normal **Launch** for that game, or set a long interval.
- Your minutes and pool choice are remembered the next time you open the window.

## Add popular games pack

In the **Add Game** window, click **Add popular games pack**. The launcher compares a built-in list of
about 120 popular titles (including Grand Theft Auto IV) with Discord's list and adds the ones Discord
recognizes with an executable name. At the time of writing about 95 of them match. Games that are
already in your library are skipped, and the log tells you how many were added.

## Build

You need the .NET SDK (8.0+ recommended) and Node.js (for the Electron UI).

### Building the Core

```bash
dotnet build ./src/Launcher/Launcher.csproj -c Release
dotnet build ./src/DummyGame/DummyGame.csproj -c Release
```

### Building the Electron UI

1. **Publish the DummyGame template** to the Electron resources folder:
   ```bash
   dotnet publish ./src/DummyGame/DummyGame.csproj -c Release -o ./electron/build-resources/dummygame
   ```

2. **Build the Electron UI**:
   ```bash
   cd electron
   npm install
   npm run dist
   ```

The installer will be created in `electron/dist/`.

## Releasing a new version

1. On GitHub open **Actions** > **Release (Electron Installer)** > **Run workflow**.
2. Type the new version (`X.Y.Z`, e.g. `0.2.0`) and run it.

The workflow builds the installer, creates the `release_X.Y.Z` tag and GitHub Release, and uploads
`Setup.exe` + `latest.yml` (used by the in-app auto-update). Each run needs a version that does not
exist yet; if a build fails the empty release and tag are removed so you can run the same version again.
Pushing a tag named `release_X.Y.Z` also works.

