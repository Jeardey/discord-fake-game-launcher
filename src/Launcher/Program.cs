using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Http;
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
        private const string DummyGameExeName = "DummyGame.exe";   // template GUI exe

        static void Main(string[] args)
        {
            string exePath = GetCurrentExePath();

            // Launcher never runs as dummy (we use a separate DummyGame exe),
            // so we always run as launcher here.
            RunAsLauncher(exePath);
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

        // ───────────────────────────────────────────────────────────
        // Launcher mode
        // ───────────────────────────────────────────────────────────
        private static void RunAsLauncher(string launcherExePath)
        {
            PrintHeader();

            string baseDir = AppContext.BaseDirectory;
            string gameListPath = Path.Combine(baseDir, GameListFileName);

            // Auto-download gamelist.json on first run
            if (!File.Exists(gameListPath))
            {
                Console.WriteLine($"\"{GameListFileName}\" not found. Downloading from Discord API...");
                if (!TryDownloadGameList(gameListPath))
                {
                    Console.WriteLine("❌ Auto-download failed.");
                    Console.WriteLine("You can manually download it from:");
                    Console.WriteLine("  https://discord.com/api/applications/detectable");
                    Console.WriteLine($"and save as \"{GameListFileName}\" next to this EXE.");
                    PauseBeforeExit();
                    return;
                }
                Console.WriteLine("✅ Downloaded gamelist.json.\n");
            }

            // Ensure dummy template exists
            string dummySourceExe = Path.Combine(baseDir, DummyGameExeName);
            if (!File.Exists(dummySourceExe))
            {
                Console.WriteLine($"❌ Could not find dummy template exe \"{DummyGameExeName}\" in:");
                Console.WriteLine($"   {baseDir}");
                Console.WriteLine("Make sure you copied DummyGame.exe next to the launcher.");
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
                Console.WriteLine("Creating dummy GUI exe and support files...");

                try
                {
                    // 1) Copy DummyGame.exe, but rename to the real game's exe name
                    File.Copy(dummySourceExe, dummyExePath, overwrite: false);

                    // 2) Copy DummyGame.* sidecar files (DLL, runtimeconfig, deps, etc.)
                    string sourceDir = Path.GetDirectoryName(dummySourceExe)
                                       ?? baseDir;
                    string dummyBaseName = Path.GetFileNameWithoutExtension(dummySourceExe) ?? "DummyGame";

                    foreach (var file in Directory.GetFiles(sourceDir, dummyBaseName + ".*"))
                    {
                        string fileName = Path.GetFileName(file);

                        // We already placed the renamed exe
                        if (fileName.Equals(Path.GetFileName(dummySourceExe),
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
                // IMPORTANT:
                // - exe name == real game exe (dummyExePath)
                // - window title (from DummyGame) == selectedApp.Name (different from exe)
                var psi = new ProcessStartInfo(dummyExePath)
                {
                    UseShellExecute = false,
                    WorkingDirectory = gameFolder
                };

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

        // ───────────────────────────────────────────────────────────
        // Helpers
        // ───────────────────────────────────────────────────────────

        private static bool TryDownloadGameList(string destPath)
        {
            try
            {
                using var client = new HttpClient();
                client.DefaultRequestHeaders.UserAgent.ParseAdd("DiscordFakeGameLauncher/1.0");

                // Discord detectable apps API
                const string url = "https://discord.com/api/applications/detectable";

                string json = client.GetStringAsync(url).GetAwaiter().GetResult();
                File.WriteAllText(destPath, json);
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error downloading gamelist: {ex.Message}");
                return false;
            }
        }

        private static void PrintHeader()
        {
            Console.Title = "Discord Fake Game Launcher";
            Console.WriteLine("============================================");
            Console.WriteLine("     Discord Fake Game Launcher");
            Console.WriteLine("============================================");
            Console.WriteLine("Console launcher that uses Discord's detectable apps list");
            Console.WriteLine("and spawns a GUI dummy process with:");
            Console.WriteLine("- exe name == real game exe");
            Console.WriteLine("- window title == game name (different from exe)");
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
