const { isRecognizedDatabaseGame } = require('./random-mode');

// Titles are matched against Discord's own detectable-apps list by normalized name,
// so only games Discord actually recognizes (with an explicit executable) get added.
// Names that Discord does not list are simply skipped.
const POPULAR_GAME_NAMES = [
  // Shooters / battle royale
  'Fortnite', 'VALORANT', 'Apex Legends', 'Overwatch 2', 'Counter-Strike 2',
  'Counter-Strike: Global Offensive', "Tom Clancy's Rainbow Six Siege", 'Call of Duty: Warzone',
  'Call of Duty: Black Ops 6', 'PUBG: BATTLEGROUNDS', 'Escape from Tarkov', 'Marvel Rivals',
  'Delta Force', 'The Finals', 'Team Fortress 2', 'Left 4 Dead 2', 'Back 4 Blood',
  'Helldivers 2', 'Deep Rock Galactic', 'Destiny 2', 'Rogue Company', 'Paladins', 'SMITE',
  "Tom Clancy's The Division 2", 'PAYDAY 2', 'PAYDAY 3',

  // MOBA / competitive / sports
  'League of Legends', 'Dota 2', 'Rocket League', 'Brawlhalla', 'Fall Guys', 'osu!',
  'EA SPORTS FC 25', 'EA SPORTS FC 24', 'Forza Horizon 5',

  // Sandbox / survival / co-op
  'Minecraft', 'Roblox', 'Terraria', 'Stardew Valley', 'Rust', 'ARK: Survival Evolved',
  'Valheim', 'Palworld', 'Lethal Company', 'Phasmophobia', 'Sons Of The Forest', '7 Days to Die',
  'DayZ', 'Project Zomboid', "Don't Starve Together", 'Factorio', 'RimWorld', 'Satisfactory',
  'Sea of Thieves', "No Man's Sky", 'Dead by Daylight', "Garry's Mod", 'Among Us', 'VRChat',
  'Euro Truck Simulator 2', 'Cities: Skylines',

  // RPG / MMO / action
  'Grand Theft Auto V', 'Red Dead Redemption 2', 'Genshin Impact', 'Honkai: Star Rail',
  'Wuthering Waves', 'Zenless Zone Zero', 'World of Warcraft', 'Lost Ark', 'Path of Exile',
  'Diablo IV', 'Black Desert Online', 'FINAL FANTASY XIV', 'Guild Wars 2', 'New World',
  'Albion Online', 'Old School RuneScape', 'RuneScape', 'Warframe', 'Elden Ring',
  'Cyberpunk 2077', 'The Witcher 3: Wild Hunt', "Baldur's Gate 3", 'Hogwarts Legacy', 'Starfield',
  'Fallout 4', 'The Elder Scrolls V: Skyrim', 'Monster Hunter: World', 'Monster Hunter Wilds',

  // Strategy / indie
  'Hearthstone', 'Age of Empires II: Definitive Edition', "Sid Meier's Civilization VI",
  'Stellaris', 'Europa Universalis IV', 'Crusader Kings III', 'Hades', 'Hollow Knight',
  'Slay the Spire', 'Cuphead', 'Celeste', 'Undertale', 'Geometry Dash', 'Halo Infinite'
];

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Returns database games whose normalized name equals one of `names`.
 * Only games Discord recognizes with an explicit, usable executable are returned,
 * at most one entry per requested name, never a launcher-only entry.
 */
function matchPopularGames(databaseGames, names = POPULAR_GAME_NAMES) {
  const wanted = new Map(); // normalized name -> original name
  for (const n of names) {
    const key = normalizeName(n);
    if (key && !wanted.has(key)) wanted.set(key, n);
  }

  const found = new Map(); // normalized name -> game
  for (const g of Array.isArray(databaseGames) ? databaseGames : []) {
    if (!isRecognizedDatabaseGame(g) || g.isLauncher) continue;
    const key = normalizeName(g.name);
    if (!wanted.has(key) || found.has(key)) continue;
    found.set(key, g);
  }

  return [...found.values()];
}

module.exports = {
  POPULAR_GAME_NAMES,
  normalizeName,
  matchPopularGames
};
