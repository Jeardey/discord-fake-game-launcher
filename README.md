
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

## Quest Completer

The app includes a **Quest Completer** feature that can automatically complete Discord quests without waiting for the required playtime or stream time.

### How to use Quest Completer

1. Open the **Discord Desktop App** (required for most quests)
2. Go to **Settings → Advanced → Developer Mode** and enable it
3. Accept the quest you want to complete in Discord's Quests tab
4. Open the **Fake Game Launcher** and click the **"Quest Completer"** button
5. Copy the script and paste it into Discord's DevTools console

### Enabling DevTools Console in Discord

Discord does not have the DevTools console enabled by default. You must manually enable it by editing the `settings.json` file:

**File location:**
- Windows: `%APPDATA%/discord/settings.json`
- macOS: `~/Library/Application Support/discord/settings.json`
- Linux: `~/.config/discord/settings.json`

**Steps:**
1. Close Discord completely (ensure it's not running in the system tray)
2. Open the `settings.json` file in a text editor
3. Add the following line inside the JSON object:

```json
"DANGEROUS_ENABLE_DEVTOOLS_ONLY_ENABLE_IF_YOU_KNOW_WHAT_YOURE_DOING": true
```

4. The file should look something like this:

```json
{
  "BACKGROUND_COLOR": "#202225",
  "IS_MAXIMIZED": false,
  "IS_MINIMIZED": false,
  "WINDOW_BOUNDS": {
    "x": 100,
    "y": 100,
    "width": 1280,
    "height": 720
  },
  "DANGEROUS_ENABLE_DEVTOOLS_ONLY_ENABLE_IF_YOU_KNOW_WHAT_YOURE_DOING": true
}
```

5. Save the file and restart Discord
6. Press `Ctrl + Shift + I` to open DevTools, then click the **Console** tab
7. Type `allow pasting` and press Enter (this is required for security)
8. Paste the script copied from the launcher and press Enter
9. Wait for **"Quest completed!"** message in the console

### What the Script Does

The Quest Completer script (`quest-script.js`) automatically:

- **Auto-detects** your active enrolled quests
- **Spoofs game processes** to mimic the target game running on your system
- **Simulates playtime** by sending heartbeat signals to Discord's servers
- **Fast-forwards video quests** by rapidly reporting video progress
- **Spoofs stream metadata** for stream quests (requires 1 other person in VC)

**Supported quest types:**
- ✅ `WATCH_VIDEO` - Video watching quests (works in browser too)
- ✅ `PLAY_ON_DESKTOP` - Gameplay quests (Discord Desktop App required)
- ✅ `STREAM_ON_DESKTOP` - Streaming quests (requires 1 viewer in VC)
- ✅ `PLAY_ACTIVITY` - Activity quests (voice channel games)
- ✅ `WATCH_VIDEO_ON_MOBILE` - Mobile video quests

**Important notes:**
- Video quests work in both browser and desktop app
- Play/stream quests **require** the Discord Desktop App
- Opera GX quests are also supported
- The script restores original Discord functions after quest completion

### The Script

Here is the complete Quest Completer script (`quest-script.js`) for reference:

```javascript
// Discord Quest Completer Script
// This script is meant to be pasted into Discord's DevTools console.
// It auto-detects your active quests and completes them.

delete window.$;
let wpRequire = webpackChunkdiscord_app.push([[Symbol()], {}, r => r]);
webpackChunkdiscord_app.pop();

let ApplicationStreamingStore = Object.values(wpRequire.c).find(x => x?.exports?.A?.__proto__?.getStreamerActiveStreamMetadata).exports.A;
let RunningGameStore = Object.values(wpRequire.c).find(x => x?.exports?.Ay?.getRunningGames).exports.Ay;
let QuestsStore = Object.values(wpRequire.c).find(x => x?.exports?.A?.__proto__?.getQuest).exports.A;
let ChannelStore = Object.values(wpRequire.c).find(x => x?.exports?.A?.__proto__?.getAllThreadsForParent).exports.A;
let GuildChannelStore = Object.values(wpRequire.c).find(x => x?.exports?.Ay?.getSFWDefaultChannel).exports.Ay;
let FluxDispatcher = Object.values(wpRequire.c).find(x => x?.exports?.h?.__proto__?.flushWaitQueue).exports.h;
let api = Object.values(wpRequire.c).find(x => x?.exports?.Bo?.get).exports.Bo;

const supportedTasks = ["WATCH_VIDEO", "PLAY_ON_DESKTOP", "STREAM_ON_DESKTOP", "PLAY_ACTIVITY", "WATCH_VIDEO_ON_MOBILE"]
let quests = [...QuestsStore.quests.values()].filter(x => x.userStatus?.enrolledAt && !x.userStatus?.completedAt && new Date(x.config.expiresAt).getTime() > Date.now() && supportedTasks.find(y => Object.keys((x.config.taskConfig ?? x.config.taskConfigV2).tasks).includes(y)))
let isApp = typeof DiscordNative !== "undefined"
if(quests.length === 0) {
	console.log("You don't have any uncompleted quests!")
} else {
	let doJob = function() {
		const quest = quests.pop()
		if(!quest) return

		const pid = Math.floor(Math.random() * 30000) + 1000
		
		const applicationId = quest.config.application.id
		const applicationName = quest.config.application.name
		const questName = quest.config.messages.questName
		const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2
		const taskName = supportedTasks.find(x => taskConfig.tasks[x] != null)
		const secondsNeeded = taskConfig.tasks[taskName].target
		let secondsDone = quest.userStatus?.progress?.[taskName]?.value ?? 0

		if(taskName === "WATCH_VIDEO" || taskName === "WATCH_VIDEO_ON_MOBILE") {
			const maxFuture = 10, speed = 7, interval = 1
			const enrolledAt = new Date(quest.userStatus.enrolledAt).getTime()
			let completed = false
			let fn = async () => {			
				while(true) {
					const maxAllowed = Math.floor((Date.now() - enrolledAt)/1000) + maxFuture
					const diff = maxAllowed - secondsDone
					const timestamp = secondsDone + speed
					if(diff >= speed) {
						const res = await api.post({url: `/quests/${quest.id}/video-progress`, body: {timestamp: Math.min(secondsNeeded, timestamp + Math.random())}})
						completed = res.body.completed_at != null
						secondsDone = Math.min(secondsNeeded, timestamp)
					}
					
					if(timestamp >= secondsNeeded) {
						break
					}
					await new Promise(resolve => setTimeout(resolve, interval * 1000))
				}
				if(!completed) {
					await api.post({url: `/quests/${quest.id}/video-progress`, body: {timestamp: secondsNeeded}})
				}
				console.log("Quest completed!")
				doJob()
			}
			fn()
			console.log(`Spoofing video for ${questName}.`)
		} else if(taskName === "PLAY_ON_DESKTOP") {
			if(!isApp) {
				console.log("This no longer works in browser for non-video quests. Use the discord desktop app to complete the", questName, "quest!")
			} else {
				api.get({url: `/applications/public?application_ids=${applicationId}`}).then(res => {
					const appData = res.body[0]
					const exeName = appData.executables?.find(x => x.os === "win32")?.name?.replace(">","") ?? appData.name.replace(/[\/\\:*?"<>|]/g, "")
					
					const fakeGame = {
						cmdLine: `C:\\Program Files\\${appData.name}\\${exeName}`,
						exeName,
						exePath: `c:/program files/${appData.name.toLowerCase()}/${exeName}`,
						hidden: false,
						isLauncher: false,
						id: applicationId,
						name: appData.name,
						pid: pid,
						pidPath: [pid],
						processName: appData.name,
						start: Date.now(),
					}
					const realGames = RunningGameStore.getRunningGames()
					const fakeGames = [fakeGame]
					const realGetRunningGames = RunningGameStore.getRunningGames
					const realGetGameForPID = RunningGameStore.getGameForPID
					RunningGameStore.getRunningGames = () => fakeGames
					RunningGameStore.getGameForPID = (pid) => fakeGames.find(x => x.pid === pid)
					FluxDispatcher.dispatch({type: "RUNNING_GAMES_CHANGE", removed: realGames, added: [fakeGame], games: fakeGames})
					
					let fn = data => {
						let progress = quest.config.configVersion === 1 ? data.userStatus.streamProgressSeconds : Math.floor(data.userStatus.progress.PLAY_ON_DESKTOP.value)
						console.log(`Quest progress: ${progress}/${secondsNeeded}`)
						
						if(progress >= secondsNeeded) {
							console.log("Quest completed!")
							
							RunningGameStore.getRunningGames = realGetRunningGames
							RunningGameStore.getGameForPID = realGetGameForPID
							FluxDispatcher.dispatch({type: "RUNNING_GAMES_CHANGE", removed: [fakeGame], added: [], games: []})
							FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", fn)
							
							doJob()
						}
					}
					FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", fn)
					
					console.log(`Spoofed your game to ${applicationName}. Wait for ${Math.ceil((secondsNeeded - secondsDone) / 60)} more minutes.`)
				})
			}
		} else if(taskName === "STREAM_ON_DESKTOP") {
			if(!isApp) {
				console.log("This no longer works in browser for non-video quests. Use the discord desktop app to complete the", questName, "quest!")
			} else {
				let realFunc = ApplicationStreamingStore.getStreamerActiveStreamMetadata
				ApplicationStreamingStore.getStreamerActiveStreamMetadata = () => ({
					id: applicationId,
					pid,
					sourceName: null
				})
				
				let fn = data => {
					let progress = quest.config.configVersion === 1 ? data.userStatus.streamProgressSeconds : Math.floor(data.userStatus.progress.STREAM_ON_DESKTOP.value)
					console.log(`Quest progress: ${progress}/${secondsNeeded}`)
					
					if(progress >= secondsNeeded) {
						console.log("Quest completed!")
						
						ApplicationStreamingStore.getStreamerActiveStreamMetadata = realFunc
						FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", fn)
						
						doJob()
					}
				}
				FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", fn)
				
				console.log(`Spoofed your stream to ${applicationName}. Stream any window in vc for ${Math.ceil((secondsNeeded - secondsDone) / 60)} more minutes.`)
				console.log("Remember that you need at least 1 other person to be in the vc!")
			}
		} else if(taskName === "PLAY_ACTIVITY") {
			const channelId = ChannelStore.getSortedPrivateChannels()[0]?.id ?? Object.values(GuildChannelStore.getAllGuilds()).find(x => x != null && x.VOCAL.length > 0).VOCAL[0].channel.id
			const streamKey = `call:${channelId}:1`
			
			let fn = async () => {
				console.log("Completing quest", questName, "-", quest.config.messages.questName)
				
				while(true) {
					const res = await api.post({url: `/quests/${quest.id}/heartbeat`, body: {stream_key: streamKey, terminal: false}})
					const progress = res.body.progress.PLAY_ACTIVITY.value
					console.log(`Quest progress: ${progress}/${secondsNeeded}`)
					
					await new Promise(resolve => setTimeout(resolve, 20 * 1000))
					
					if(progress >= secondsNeeded) {
						await api.post({url: `/quests/${quest.id}/heartbeat`, body: {stream_key: streamKey, terminal: true}})
						break
					}
				}
				
				console.log("Quest completed!")
				doJob()
			}
			fn()
		}
	}
	doJob()
}
```

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
