# Discord Fake Game Launcher

**🌐 Languages:** **English** · [Português (BR)](README.pt-BR.md) · [Español](README.es.md)

Creates small dummy executables that mimic real game processes, so Discord detects a **verified /
registered game** as running. It can be used to complete Discord Quests without installing the game.

The app itself is available in **Portuguese (Brazil), English and Spanish**. It picks your system language
the first time and you can change it any time with the language selector in the title bar.

> [!IMPORTANT]
> This tool is intended for educational purposes and personal use. Please respect Discord's terms of
> service, partners, game publishers and advertisers rights when using this application.
> Discord is a registered trademark of Discord Inc. It is referenced on this open-source project for
> descriptive and definition purposes only and does not imply any affiliation, sponsorship, or endorsement
> by Discord Inc in any way.

**Developer:** saralapia

## Contents

- [How it works](#how-it-works)
- [Features](#features)
- [Updates](#updates)
- [Random Mode](#random-mode)
- [Add popular games pack](#add-popular-games-pack)
- [Add ALL recognized games](#add-all-recognized-games)
- [Game icons](#game-icons)
- [Fake game window](#fake-game-window)
- [Build](#build)
- [Releasing a new version](#releasing-a-new-version)
- [Credits](#credits)

## How it works

1. The app reads Discord's list of detectable games (`gamelist.json`, refreshed from Discord's public API
   every time the app starts; if Discord cannot be reached the last saved list is used).
2. You search for a game and add it to your library.
3. When you click **Launch Game**, the app creates a dummy exe named like the real game in:

   `%APPDATA%/discord-fake-game-launcher-ui/games/<GameID>/<GameName>.exe`

4. Discord sees that process and shows you as playing the game.

The same dummy executable acts as the **launcher** when run from the shortcut or from the root folder, and
as the **fake game** when it runs from a subfolder inside `games/`.

## Features

- Search Discord's full list of detectable games and add them to your library.
- Launch several fake games at the same time, mark favorites and create desktop shortcuts.
- **Add ALL recognized games** with one click, or the **popular games pack**.
- **Random Mode**: rotates through random games every X minutes.
- Game **icons** from Discord, shown in the list, in the details header and in the Add Game window.
- Fake games run **without a visible window**.
- Modern dark interface in **pt-BR, en and es**.
- **Automatic update notice**: when you publish a new version, users are told and update with one click.

## Updates

The installed app looks for a new release on GitHub when it starts and again every 30 minutes while it is
open.

1. When a newer version exists, an **Update available** window opens with the release notes.
2. The user clicks **Update now**. The installer is downloaded (with a progress bar), the app closes and the
   new version is installed and started.
3. **Remind me later** closes the window; an **Update available: vX.Y.Z** button stays in the title bar and
   the window opens again the next time the app starts.
4. The **Check for updates** link at the bottom of the sidebar checks on demand.

Updates only work in the installed app (not when running from source with `npm run dev`).

## Random Mode

Random Mode keeps one fake game running at a time and swaps it for a different random one on a timer.

### How to use

1. Click **Random Mode** in the left sidebar.
2. Set **Switch game every (minutes)** (from 1 to 1440).
3. Choose **Pick games from**:
   - **My library**: only games you already added.
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
about 105 popular titles (including Grand Theft Auto IV) with Discord's list and adds the ones Discord
recognizes with an executable name. Games already in your library are skipped, and the log tells you how
many were added.

## Add ALL recognized games

In the **Add Game** window, click **Add ALL recognized games** to put every game Discord recognizes
(thousands, the same set Random Mode uses for "Entire Discord database") into your library. Games already
in your library are kept as they are (favorites included) and a backup is saved next to it as
`myGames.json.bak`. The sidebar draws the first 500 games that match; type in the **Filter library** box to
find any other one.

## Game icons

Games show their Discord icon in the sidebar, in the details header and in the Add Game window. Icons are
loaded from Discord's CDN only for the games that are on screen and are kept in memory only, nothing is
saved to disk. If a game has no icon (or you are offline) its first letter is shown instead.

## Fake game window

Fake games run **without a visible window** (the process is still running, so Discord detects it the same
way). Choosing a game only selects it; nothing opens. To stop a game use the **Stop** button or Random Mode.
Fake games created by an older version are updated the next time you launch them. If you want the small
"fake process" window back, set the environment variable `FAKEGAME_SHOW_WINDOW=1` before starting the app.
Desktop shortcuts keep opening the visible window.

The invisible window is a normal-sized, almost transparent, click-through window that stays behind everything
and is not in the taskbar, so Discord still sees a real game window. If Discord does not detect a game on your
PC, turn on **Show fake game window** at the bottom of the sidebar (it applies to the next game you start).

## Build

You need the .NET SDK (8.0+) and Node.js 20+ (for the Electron UI).

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
   npm test
   npm run dist
   ```

The installer will be created in `electron/dist/`.

The **.NET Build** workflow (`.github/workflows/dotnet.yml`) does all of this on every push and uploads the
installer as an artifact.

## Releasing a new version

1. On GitHub open **Actions** > **Release (Electron Installer)** > **Run workflow**.
2. Type the new version (`X.Y.Z`, e.g. `0.2.0`) and run it.

The workflow runs the tests, builds the installer, creates the `release_X.Y.Z` tag and GitHub Release, and
uploads `Setup.exe` + `latest.yml`. Installed apps find that release and offer the update (see
[Updates](#updates)). Each run needs a version that does not exist yet and is **higher** than the one users
have installed; if a build fails the empty release and tag are removed so you can run the same version
again. Pushing a tag named `release_X.Y.Z` also works.

## Credits

Developed by **saralapia**.
