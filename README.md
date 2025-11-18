
# Discord Fake Game Launcher

This tool creates small dummy executable files that mimic real game processes
that Discord looks for when detecting **verified / registered games**.
Can be used for completing Discord Quests without installing the game.

## How it works

- Reads Discord's registered games from the gamelist.json
- Scans file for `.exe` names.
- Lets you search and pick one.
- Creates a dummy exe in:

  `./games/<GameNameWithoutExt>/<GameName>.exe`

- Launches that dummy exe.  
  Discord detects it as if the real game is running.

The same executable acts as:

- **Launcher** when run from the root folder.
- **Fake game** when run from a subfolder inside `games/`.

## Build

You need the .NET SDK (8.0+ recommended).

```bash
dotnet build ./src/DiscordFakeGameLauncher/DiscordFakeGameLauncher.csproj -c Release
