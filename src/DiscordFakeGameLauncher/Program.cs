using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;

namespace DiscordFakeGameLauncher
{
    internal static class Program
    {
        // Regex to find ".exe" names inside Discord's LevelDB/log files
        private static readonly Regex ExeRegex =
            new(@"[A-Za-z0-9_\-\.]+\.exe", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        static void Main(string[] args)
        {
            string exePath = GetCurrentExePath();

            if (IsRunningAsFakeGame(exePath))
            {
                RunAsFakeGame(exePath);
            }
            else
            {
                RunAsLauncher(exePath);
            }
        }

        private static string GetCurrentExePath()
        {
            try
            {
                return Process.GetCurrentProcess().MainModule?.FileName
                       ?? Path.GetFullPath(Environment.GetCommandLineArgs()[0]);
            }
            catch
            {
                return Path.GetFullPath(Environment.GetCommandLineArgs()[0]);
            }
        }

        /// <summary>
        /// Determines if this process is running as a dummy game exe.
        /// For that we simply check if the path contains "\games\" segment.
        /// </summary>
        private static bool IsRunningAsFakeGame(string exePath)
        {
            string marker = Path.DirectorySeparatorChar + "games" + Path.DirectorySeparatorChar;
            return exePath.IndexOf(marker, StringComparison.OrdinalIgnoreCase) >= 0;
        }

        /// <summary>
        /// Fake game mode: just sit here so Discord thinks the game is running.
        /// </summary>
        private static void RunAsFakeGame(string exePath)
        {
            string gameExeName = Path.GetFileName(exePath);
            string gameName = Path.GetFileNameWithoutExtension(exePath);

            Console.Title = $"Fake Game: {gameName}";
            Console.WriteLine($"Fake game process running as \"{gameExeName}\".");
            Console.WriteLine("Discord should detect this as a verified / registered game.");
            Console.WriteLine();
            Console.WriteLine("Press Enter to exit this fake game...");

            Console.ReadLine();
        }

        /// <summary>
        /// Launcher mode: read Discord registered games, let user select one,
        /// and then create & launch a dummy exe for that game.
        /// </summary>
        private static void RunAsLauncher(string launcherExePath)
        {
            PrintHeader();

            var knownGames = LoadDiscordGames();
            if (knownGames.Count == 0)
            {
                Console.WriteLine("❌ No .exe names found in Discord's registered games storage.");
                Console.WriteLine("Make sure Discord is installed, has registered games,");
                Console.WriteLine("and that you have launched some games via Discord.");
                PauseBeforeExit();
                return;
            }

            Console.WriteLine($"Found {knownGames.Count} .exe names from Discord data.\n");

            // Search/filter
            Console.Write("Enter search text (leave empty to list all): ");
            string? search = Console.ReadLine();
            search ??= string.Empty;

            var filtered = FilterGames(knownGames, search);

            if (filtered.Count == 0)
            {
                Console.WriteLine("No games matched that search.");
                PauseBeforeExit();
                return;
            }

            Console.WriteLine();
            PrintGameList(filtered);

            int index = PromptForIndex(filtered.Count);
            if (index < 0)
            {
                PauseBeforeExit();
                return;
            }

            string selectedExeName = filtered[index];

            Console.WriteLine();
            Console.WriteLine($"Selected: {selectedExeName}");

            string gamesRoot = Path.Combine(AppContext.BaseDirectory, "games");
            string selectedFolderName = Path.GetFileNameWithoutExtension(selectedExeName) ?? "UnknownGame";
            string gameFolder = Path.Combine(gamesRoot, selectedFolderName);
            Directory.CreateDirectory(gameFolder);

            string dummyExePath = Path.Combine(gameFolder, selectedExeName);

            if (!File.Exists(dummyExePath))
            {
                Console.WriteLine("Creating dummy exe...");
                try
                {
                    File.Copy(launcherExePath, dummyExePath, overwrite: false);
                }
                catch (IOException ioEx)
                {
                    Console.WriteLine($"Failed to create dummy exe: {ioEx.Message}");
                    PauseBeforeExit();
                    return;
                }
            }
            else
            {
                Console.WriteLine("Dummy exe already exists, reusing existing file.");
            }

            Console.WriteLine($"Dummy exe path: {dummyExePath}");
            Console.WriteLine("Launching fake game process...");

            try
            {
                var psi = new ProcessStartInfo(dummyExePath)
                {
                    UseShellExecute = false,
                    WorkingDirectory = Path.GetDirectoryName(dummyExePath) ?? AppContext.BaseDirectory
                };

                Process.Start(psi);
                Console.WriteLine("✅ Fake game launched. Check Discord's status / activity.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ Failed to launch fake game: {ex.Message}");
            }

            PauseBeforeExit();
        }

        private static void PrintHeader()
        {
            Console.Title = "Discord Fake Game Launcher";
            Console.WriteLine("============================================");
            Console.WriteLine("     Discord Fake Game Launcher");
            Console.WriteLine("============================================");
            Console.WriteLine("This app reads Discord's registered games,");
            Console.WriteLine("then creates tiny dummy executables in ./games/");
            Console.WriteLine("with the same .exe names so Discord detects them.");
            Console.WriteLine();
        }

        private static void PauseBeforeExit()
        {
            Console.WriteLine();
            Console.Write("Press Enter to exit...");
            Console.ReadLine();
        }

        /// <summary>
        /// Reads Discord's LevelDB/log files and extracts .exe names.
        /// </summary>
        private static List<string> LoadDiscordGames()
        {
            var result = new SortedSet<string>(StringComparer.OrdinalIgnoreCase);

            string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            string discordLevelDbPath = Path.Combine(appData, "discord", "Local Storage", "leveldb");

            if (!Directory.Exists(discordLevelDbPath))
            {
                Console.WriteLine($"Discord LevelDB folder not found at:");
                Console.WriteLine(discordLevelDbPath);
                return result.ToList();
            }

            IEnumerable<string> files;
            try
            {
                files = Directory.EnumerateFiles(discordLevelDbPath, "*.*", SearchOption.TopDirectoryOnly)
                                 .Where(f => f.EndsWith(".ldb", StringComparison.OrdinalIgnoreCase)
                                             || f.EndsWith(".log", StringComparison.OrdinalIgnoreCase));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error reading LevelDB folder: {ex.Message}");
                return result.ToList();
            }

            foreach (var file in files)
            {
                string content;
                try
                {
                    content = File.ReadAllText(file);
                }
                catch
                {
                    continue;
                }

                foreach (Match match in ExeRegex.Matches(content))
                {
                    string exeName = match.Value;

                    // Ignore Discord's own binaries
                    if (exeName.Equals("Discord.exe", StringComparison.OrdinalIgnoreCase) ||
                        exeName.StartsWith("discord", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    result.Add(exeName);
                }
            }

            return result.ToList();
        }

        private static List<string> FilterGames(List<string> games, string search)
        {
            if (string.IsNullOrWhiteSpace(search))
                return games.ToList();

            return games
                .Where(g => g.IndexOf(search, StringComparison.OrdinalIgnoreCase) >= 0)
                .ToList();
        }

        private static void PrintGameList(List<string> games)
        {
            Console.WriteLine("Games:");
            for (int i = 0; i < games.Count; i++)
            {
                Console.WriteLine($"[{i}] {games[i]}");
            }
        }

        private static int PromptForIndex(int max)
        {
            Console.WriteLine();
            Console.Write("Enter game index to launch (or just press Enter to cancel): ");
            string? input = Console.ReadLine();

            if (string.IsNullOrWhiteSpace(input))
                return -1;

            if (!int.TryParse(input, out int index))
            {
                Console.WriteLine("Invalid number.");
                return -1;
            }

            if (index < 0 || index >= max)
            {
                Console.WriteLine("Index out of range.");
                return -1;
            }

            return index;
        }
    }
}