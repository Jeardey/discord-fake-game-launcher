using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
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

    internal class GitHubAsset
    {
        [JsonPropertyName("name")]
        public string? Name { get; set; }

        [JsonPropertyName("browser_download_url")]
        public string? BrowserDownloadUrl { get; set; }
    }

    internal class GitHubRelease
    {
        [JsonPropertyName("tag_name")]
        public string? TagName { get; set; }

        [JsonPropertyName("draft")]
        public bool Draft { get; set; }

        [JsonPropertyName("prerelease")]
        public bool PreRelease { get; set; }

        [JsonPropertyName("assets")]
        public List<GitHubAsset>? Assets { get; set; }
    }

    internal static class Program
    {
        // ───────────────────────────────────────────────────────────
        // Config
        // ───────────────────────────────────────────────────────────
        private const string GameListFileName = "gamelist.json";
        private const string DummyGameExeName = "DummyGame.exe";   // template GUI exe

        // GitHub repo for auto-updates
        private const string RepoOwner = "Jeardey";
        private const string RepoName  = "discord-fake-game-launcher";

        // Current app version (match your release tag without leading 'v')
        private const string CurrentVersion = "0.1.0";

        // How old gamelist.json can be before we refresh it
        private const int GameListMaxAgeDays = 7;

        private static readonly HttpClient Http = CreateHttpClient();

        static void Main(string[] args)
        {
            string exePath = GetCurrentExePath();
            string baseDir = AppContext.BaseDirectory;
            string exeFileName = Path.GetFileName(exePath);

            PrintHeader();

            // 1) Auto-update launcher if needed (this may exit and restart)
            TryCheckForLauncherUpdate(baseDir, exeFileName);

            // 2) Make sure gamelist.json exists and is fresh enough
            EnsureFreshGameList(baseDir);

            // 3) Run the normal launcher flow
            RunAsLauncher(baseDir);
        }

        private static HttpClient CreateHttpClient()
        {
            var client = new HttpClient();
            client.DefaultRequestHeaders.UserAgent.ParseAdd("DiscordFakeGameLauncher/1.0");
            client.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
            client.DefaultRequestHeaders.Add("X-GitHub-Api-Version", "2022-11-28");
            return client;
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
        // Auto-update launcher from GitHub releases
        // ───────────────────────────────────────────────────────────
        private static void TryCheckForLauncherUpdate(string baseDir, string exeFileName)
        {
            try
            {
                Console.WriteLine("Checking for launcher updates...");

                string url = $"https://api.github.com/repos/{RepoOwner}/{RepoName}/releases/latest";
                string json = Http.GetStringAsync(url).GetAwaiter().GetResult();

                var release = JsonSerializer.Deserialize<GitHubRelease>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                if (release == null || string.IsNullOrWhiteSpace(release.TagName))
                {
                    Console.WriteLine("Could not read latest release info. Continuing with current version.\n");
                    return;
                }

                string latestVersion = release.TagName.Trim();
                if (latestVersion.StartsWith("v", StringComparison.OrdinalIgnoreCase))
                    latestVersion = latestVersion[1..];

                if (string.Equals(latestVersion, CurrentVersion, StringComparison.OrdinalIgnoreCase))
                {
                    Console.WriteLine($"You are on the latest version ({CurrentVersion}).\n");
                    return;
                }

                Console.WriteLine($"New version available: {CurrentVersion} → {latestVersion}");
                Console.WriteLine("Downloading and installing update...");

                if (release.Assets == null || release.Assets.Count == 0)
                {
                    Console.WriteLine("❌ No assets found on latest release. Cannot auto-update.");
                    Console.WriteLine();
                    return;
                }

                // Pick a .zip asset (adjust filter if you use a specific naming pattern)
                var asset = release.Assets
                    .FirstOrDefault(a => a.Name != null &&
                                         a.Name.EndsWith(".zip", StringComparison.OrdinalIgnoreCase));

                if (asset == null || string.IsNullOrWhiteSpace(asset.BrowserDownloadUrl))
                {
                    Console.WriteLine("❌ Could not find a .zip asset on the latest release.");
                    Console.WriteLine();
                    return;
                }

                string updateRoot   = Path.Combine(baseDir, "_update");
                string updateZip    = Path.Combine(updateRoot, "update.zip");
                string extractDir   = Path.Combine(updateRoot, "new");

                if (Directory.Exists(updateRoot))
                    Directory.Delete(updateRoot, recursive: true);
                Directory.CreateDirectory(updateRoot);

                // Download zip
                byte[] data = Http.GetByteArrayAsync(asset.BrowserDownloadUrl)
                                  .GetAwaiter().GetResult();
                File.WriteAllBytes(updateZip, data);

                // Extract zip
                ZipFile.ExtractToDirectory(updateZip, extractDir);

                // Create update script (batch)
                string batchPath = Path.Combine(updateRoot, "run_update.bat");

                // We copy everything from extractDir over baseDir, then restart launcher, then clean up
                string batchContent =
$@"@echo off
setlocal
echo Updating Discord Fake Game Launcher...
timeout /t 1 /nobreak >nul
xcopy /E /Y ""{extractDir}\*"" ""{baseDir}"" >nul
rd /s /q ""{updateRoot}""
start """" ""{Path.Combine(baseDir, exeFileName)}""
endlocal
del ""%~f0""
";

                File.WriteAllText(batchPath, batchContent);

                // Run the updater and exit current process
                Process.Start(new ProcessStartInfo(batchPath)
                {
                    UseShellExecute = true,
                    WorkingDirectory = updateRoot
                });

                Environment.Exit(0);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Update check failed: {ex.Message}");
                Console.WriteLine("Continuing with current version.\n");
            }
        }

        // ───────────────────────────────────────────────────────────
        // gamelist.json freshness
        // ───────────────────────────────────────────────────────────
        private static void EnsureFreshGameList(string baseDir)
        {
            string path = Path.Combine(baseDir, GameListFileName);

            bool needDownload = false;

            if (!File.Exists(path))
            {
                Console.WriteLine($"\"{GameListFileName}\" not found. Will download from Discord API.");
                needDownload = true;
            }
            else
            {
                try
                {
                    var age = DateTime.UtcNow - File.GetLastWriteTimeUtc(path);
                    if (age.TotalDays > GameListMaxAgeDays)
                    {
                        Console.WriteLine($"\"{GameListFileName}\" is older than {GameListMaxAgeDays} days. Refreshing...");
                        needDownload = true;
                    }
                }
                catch
                {
                    needDownload = true;
                }
            }

            if (needDownload)
            {
                if (TryDownloadGameList(path))
                    Console.WriteLine("✅ gamelist.json updated.\n");
                else
                    Console.WriteLine("❌ Failed to update gamelist.json. Using existing file if available.\n");
            }
            else
            {
                Console.WriteLine($"Using existing \"{GameListFileName}\" (fresh enough).\n");
            }
        }

        private static bool TryDownloadGameList(string destPath)
        {
            try
            {
                const string url = "https://discord.com/api/applications/detectable";
                string json = Http.GetStringAsync(url).GetAwaiter().GetResult();
                File.WriteAllText(destPath, json);
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error downloading gamelist: {ex.Message}");
                return false;
            }
        }

        // ───────────────────────────────────────────────────────────
        // Launcher logic (same as before, but uses fresh gamelist)
        // ───────────────────────────────────────────────────────────
        private static void RunAsLauncher(string baseDir)
        {
            string gameListPath = Path.Combine(baseDir, GameListFileName);

            // Ensure DummyGame template exists
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
                // exe name == real game exe (dummyExePath)
                // window title (from DummyGame) == selectedApp.Name (different from exe)
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
        private static void PrintHeader()
        {
            Console.Title = "Discord Fake Game Launcher";
            Console.WriteLine("============================================");
            Console.WriteLine("     Discord Fake Game Launcher");
            Console.WriteLine("============================================");
            Console.WriteLine($"Current version: {CurrentVersion}");
            Console.WriteLine("Auto-updates from GitHub releases & keeps gamelist.json fresh.");
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
