const fs = require('fs');
const path = require('path');
const os = require('os');

const DISCORD_DETECTABLE_URL = 'https://discord.com/api/applications/detectable';

async function main() {
  // Optional first argument: output file (CI uses it to bundle a fresh seed list in the installer).
  const outPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, '..', 'gamelist.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const res = await fetch(DISCORD_DETECTABLE_URL, {
    headers: {
      'User-Agent': 'DiscordFakeGameLauncherUI/0.1.0',
      'Accept': 'application/json'
    }
  });

  if (!res.ok) {
    throw new Error(`Discord API error: ${res.status} ${res.statusText}`);
  }

  const text = (await res.text()).trim();
  fs.writeFileSync(outPath, text + os.EOL, 'utf8');
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
