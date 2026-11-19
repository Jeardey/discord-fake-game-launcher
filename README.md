
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

- Search Discord's full detectable-games list and add games to your library.
- **Add popular games pack** (in the *Add Game* window): adds well-known titles, but only the ones Discord's list
  recognizes with an explicit executable name. Games that are not found are skipped, nothing is duplicated.
- **Random Mode** (sidebar button): choose how many minutes each game should run. When the time is up the current
  fake game is stopped, the launcher waits a few seconds so Discord notices it ended, and a different random game
  is started. Games are picked from *My library* or the *Entire Discord database*, and only games Discord
  recognizes (explicit `.exe` in its list, no "new detection" fallbacks, no launcher-only entries) are used.
  Games started this way from the database are cleaned up from disk when they stop.
  Random Mode stops when you stop it or close the app.


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
