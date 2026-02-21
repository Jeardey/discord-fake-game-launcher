
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

## Build

You need the .NET SDK (8.0+ recommended).

```bash
dotnet build ./src/DiscordFakeGameLauncher/DiscordFakeGameLauncher.csproj -c Release
```

### Building the Electron UI

```bash
cd electron
npm install
npm run dist
```

The installer will be created in `electron/dist/`.
