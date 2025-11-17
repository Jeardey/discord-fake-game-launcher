using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace DiscordFakeGameLauncher
{
    internal class DetectableApp
    {
        [JsonPropertyName("id")]
        public string? Id { get; set; }

        [JsonPropertyName("name")]
        public string? Name { get; set; }

        [JsonPropertyName("executables")]
        public List<AppExecutable>? Executables { get; set; }
    }

    internal class AppExecutable
    {
        [JsonPropertyName("name")]
        public string? Name { get; set; }

        [JsonPropertyName("os")]
        public string? Os { get; set; }

        [JsonPropertyName("is_launcher")]
        public bool IsLauncher { get; set; }
    }

    internal static class Program
    {
        private const string GameListFileName = "gamelist.json";

        static void Main(string[] args)
        {
            string exePath = GetCurrentExePath();

            if (IsRunningAsFakeGame(exePath))
            {
                RunAsFakeGame(exePath, args);
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
        /// Just checks if the path contains "\games\".
        /// </summary>
        private static bool IsRunningAsFakeGame(string exePath)
        {
            string marker = Path.DirectorySeparatorChar + "games" + Path.DirectorySeparatorChar;
            return exePath.IndexOf(marker, StringComparison.OrdinalIgnoreCase) >= 0;
        }

        // ───────────────────────────────────────────────────────────
        // Fake game mode
        // ───────────────────────────────────────────────────────────
        private static void RunAsFakeGame(string exePath, string[] args)
        {
            string gameExeName = Path.GetFileName(exePath);
            string gameName = Path.GetFileNameWithoutExtension(exePath);

            // If launcher passed a friendly name, use that for the window title
            string displayName = args.Length > 0 && !string.IsNullOrWhiteSpace(args[0])
                ? args[0]
                : gameName;

            Console.Title = displayName;

            Console.WriteLine($"Game: {displayName}");
            Console.WriteLine($"Process image name: {gameExeName}");
            Console.WriteLine();
            Console.WriteLine("Leave this window open for as long as you want Discord to think the game is running.");
            Console.WriteLine("Press Enter to exit this fake game...");

            Console.ReadLine();
        }

        // ───────────────────────────────────────────────────────────
        // Launcher mode
        // ───────────────────────────────────────────────────────────
        private static void RunAsLauncher(string launcherExePath)
        {
            PrintHeader();

            string baseDir = AppContext.BaseDirectory;
            string gameListPath = Path.Combine(baseDir, GameListFileName);

            if (!File.Exists(gameListPath))
            {
                Console.WriteLine($"❌ Could not find \"{GameListFileName}\" in:");
                Console.WriteLine($"   {baseDir}");
                Console.WriteLine();
                Console.WriteLine("You need to download Discord's detectable games list:");
                Console.WriteLine("  1. Open this URL in your browser while logged into Discord:");
                Console.WriteLine("     https://discord.com/api/applications/detectable");
                Console.WriteLine("  2. Save the page as \"gamelist.json\" in the same folder as this EXE.");
                PauseBeforeExit();
                return;
            }

            List<DetectableApp> apps;
            try
            {
                string json = File.ReadAllText(gameListPath);
                apps = JsonSerializer.Deserialize<List<DetectableApp>>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                }) ?? new List<DetectableApp>();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ Failed to read/parse {GameListFileName}: {ex.Message}");
                PauseBeforeExit();
                return;
            }

            var windowsApps = apps
                .Where(a => !string.IsNullOrWhiteSpace(a.Name)
                            && a.Executables != null
                            && a.Executables.Any(e =>
                                   !string.IsNullOrWhiteSpace(e.Name) &&
                                   string.Equals(e.Os, "win32", StringComparison.OrdinalIgnoreCase)))
                .OrderBy(a => a.Name)
                .ToList();

            if (windowsApps.Count == 0)
            {
                Console.WriteLine("❌ No Windows-detectable apps found in gamelist.json.");
                PauseBeforeExit();
                return;
            }

            Console.WriteLine($"Loaded {windowsApps.Count} detectable Windows apps from {GameListFileName}.\n");

            Console.Write("Search by name (empty = list all): ");
            string? search = Console.ReadLine();
            search ??= string.Empty;

            var filtered = FilterByName(windowsApps, search);

            if (filtered.Count == 0)
            {
                Console.WriteLine("No apps matched that search.");
                PauseBeforeExit();
                return;
            }

            Console.WriteLine();
            PrintAppList(filtered);

            int index = PromptForIndex(filtered.Count);
            if (index < 0)
            {
                PauseBeforeExit();
                return;
            }

            var selectedApp = filtered[index];
            var selectedExe = PickBestExecutable(selectedApp);

            if (selectedExe == null || string.IsNullOrWhiteSpace(selectedExe.Name))
            {
                Console.WriteLine("❌ Selected app has no usable Windows executable entry.");
                PauseBeforeExit();
                return;
            }

            Console.WriteLine();
            Console.WriteLine($"Selected: {selectedApp.Name}");
            Console.WriteLine($"Executable entry: {selectedExe.Name}");

            // Build folder structure:
            // games/<app-id>/<relative-path-from-executable-name>
            string gamesRoot = Path.Combine(baseDir, "games");
            string appId = string.IsNullOrWhiteSpace(selectedApp.Id)
                ? SanitizeFolderName(selectedApp.Name ?? "UnknownApp")
                : selectedApp.Id;

            // exec name is like "apex/r5apex.exe" or "win64/cs2.exe"
            string exeRelPath = selectedExe.Name.Replace('/', Path.DirectorySeparatorChar)
                                               .Replace('\\', Path.DirectorySeparatorChar);

            string exeFolderPart = Path.GetDirectoryName(exeRelPath) ?? string.Empty;
            string exeFileName = Path.GetFileName(exeRelPath);

            string gameFolder = Path.Combine(gamesRoot, appId, exeFolderPart);
            Directory.CreateDirectory(gameFolder);

            string dummyExePath = Path.Combine(gameFolder, exeFileName);

            if (!File.Exists(dummyExePath))
            {
                Console.WriteLine("Creating dummy exe and support files...");

                try
                {
                    // 1) Copy the launcher EXE itself, renamed as the target exe (cs2.exe, etc.)
                    File.Copy(launcherExePath, dummyExePath, overwrite: false);

                    // 2) Copy the main DLL and runtime files into the same folder as the dummy exe
                    string sourceDir = Path.GetDirectoryName(launcherExePath)
                                       ?? AppContext.BaseDirectory;
                    string baseName = Path.GetFileNameWithoutExtension(launcherExePath)
                                      ?? "DiscordFakeGameLauncher";

                    foreach (var file in Directory.GetFiles(sourceDir, baseName + ".*"))
                    {
                        string fileName = Path.GetFileName(file);

                        // We already placed the renamed exe; skip copying original exe again
                        if (fileName.Equals(Path.GetFileName(launcherExePath),
                                            StringComparison.OrdinalIgnoreCase))
                            continue;

                        string destPath = Path.Combine(gameFolder, fileName);

                        if (!File.Exists(destPath))
                        {
                            File.Copy(file, destPath);
                        }
                    }
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
                    WorkingDirectory = gameFolder
                };

                // Pass the friendly game name as an argument so the fake exe can show it
                string displayName = selectedApp.Name ?? exeFileName;
                psi.ArgumentList.Add(displayName);

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
            Console.WriteLine("Uses Discord's detectable apps list (gamelist.json)");
            Console.WriteLine("to create dummy executables in ./games/ that");
            Console.WriteLine("Discord will detect as verified games (if supported).");
            Console.WriteLine();
        }

        private static void PauseBeforeExit()
        {
            Console.WriteLine();
            Console.Write("Press Enter to exit...");
            Console.ReadLine();
        }

        private static List<DetectableApp> FilterByName(List<DetectableApp> apps, string search)
        {
            if (string.IsNullOrWhiteSpace(search))
                return apps.ToList();

            return apps
                .Where(a => (a.Name ?? string.Empty)
                    .IndexOf(search, StringComparison.OrdinalIgnoreCase) >= 0)
                .ToList();
        }

        private static void PrintAppList(List<DetectableApp> apps)
        {
            Console.WriteLine("Apps:");
            for (int i = 0; i < apps.Count; i++)
            {
                string name = apps[i].Name ?? "(unnamed)";
                string id = apps[i].Id ?? "?";
                Console.WriteLine($"[{i}] {name} (id: {id})");
            }
        }

        private static int PromptForIndex(int max)
        {
            Console.WriteLine();
            Console.Write("Enter index to launch (or press Enter to cancel): ");
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

        private static AppExecutable? PickBestExecutable(DetectableApp app)
        {
            var exes = app.Executables ?? new List<AppExecutable>();

            // Prefer non-launcher win32, then any win32
            var best = exes.FirstOrDefault(e =>
                           string.Equals(e.Os, "win32", StringComparison.OrdinalIgnoreCase)
                           && !e.IsLauncher)
                       ?? exes.FirstOrDefault(e =>
                           string.Equals(e.Os, "win32", StringComparison.OrdinalIgnoreCase));

            return best;
        }

        private static string SanitizeFolderName(string name)
        {
            foreach (char c in Path.GetInvalidFileNameChars())
            {
                name = name.Replace(c, '_');
            }
            return name;
        }
    }
}
