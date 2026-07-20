using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;

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
        private const string VersionFileName  = "version.txt";

        // GitHub repo for auto-updates
        private const string RepoOwner = "Jeardey";
        private const string RepoName  = "discord-fake-game-launcher";

        // Built-in version (fallback if version.txt not present)
        // Set this to your current release tag (without leading "v")
        private const string CurrentVersion = "0.1.0";

        private static readonly HttpClient Http = CreateHttpClient();

        static void Main(string[] args)
        {
            string exePath     = GetCurrentExePath();
            string baseDir     = AppContext.BaseDirectory;
            string exeFileName = Path.GetFileName(exePath);

            PrintHeader(baseDir);

            // Deprecation notice + forward to Electron GUI (if present)
            // If we successfully launch the GUI, this process exits.
            if (TryLaunchElectronGuiAndExit(baseDir))
                return;

            // 1) Auto-update launcher if needed (this may exit and restart)
            TryCheckForLauncherUpdate(baseDir, exeFileName);

            // 2) Sync gamelist.json with Discord API every launch
            SyncGameListWithDiscord(baseDir);

            // 3) Run the normal launcher flow
            RunAsLauncher(baseDir);
        }

        private static bool TryLaunchElectronGuiAndExit(string baseDir)
        {
            try
            {
                string? electronExe = FindElectronGuiExe(baseDir);
                if (string.IsNullOrWhiteSpace(electronExe) || !File.Exists(electronExe))
                {
                    Console.WriteLine("⚠ This terminal launcher is deprecated.");
                    Console.WriteLine("   The new Electron GUI was not found next to this executable, so the terminal version will continue.\n");
                    return false;
                }

                Console.WriteLine("⚠ This terminal launcher is deprecated.");
                Console.WriteLine("   Launching the new Electron GUI...");
                Console.WriteLine("   Press Enter to launch now, or wait 5 seconds.\n");

                // Wait up to 5 seconds, or until Enter is pressed
                var deadline = DateTime.UtcNow.AddSeconds(5);
                while (DateTime.UtcNow < deadline)
                {
                    if (Console.KeyAvailable)
                    {
                        var key = Console.ReadKey(intercept: true);
                        if (key.Key == ConsoleKey.Enter)
                            break;
                    }

                    Thread.Sleep(50);
                }

                Process.Start(new ProcessStartInfo(electronExe)
                {
                    UseShellExecute = true,
                    WorkingDirectory = Path.GetDirectoryName(electronExe) ?? baseDir
                });

                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"⚠ Could not launch the Electron GUI: {ex.Message}");
                Console.WriteLine("Continuing with the terminal version.\n");
                return false;
            }
        }

        private static string? FindElectronGuiExe(string baseDir)
        {
            // Common layouts:
            // - Same folder as this exe (release packaging)
            // - electron/dist/*.exe (repo / CI artifacts)

            var candidates = new List<string>();

            // 1) Same folder
            try
            {
                candidates.AddRange(Directory.GetFiles(baseDir, "*.exe", SearchOption.TopDirectoryOnly));
            }
            catch
            {
                // ignore
            }

            // 2) electron/dist next to baseDir
            try
            {
                string repoLikeDist = Path.GetFullPath(Path.Combine(baseDir, "..", "..", "electron", "dist"));
                if (Directory.Exists(repoLikeDist))
                    candidates.AddRange(Directory.GetFiles(repoLikeDist, "*.exe", SearchOption.TopDirectoryOnly));
            }
            catch
            {
                // ignore
            }

            // 3) electron/dist under baseDir
            try
            {
                string localDist = Path.Combine(baseDir, "electron", "dist");
                if (Directory.Exists(localDist))
                    candidates.AddRange(Directory.GetFiles(localDist, "*.exe", SearchOption.TopDirectoryOnly));
            }
            catch
            {
                // ignore
            }

            // Filter out obvious non-GUI executables
            var filtered = candidates
                .Where(p => !string.IsNullOrWhiteSpace(p))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Where(p =>
                {
                    string name = Path.GetFileName(p);
                    if (string.IsNullOrWhiteSpace(name)) return false;
                    if (name.Equals("DummyGame.exe", StringComparison.OrdinalIgnoreCase)) return false;
                    if (name.Equals("Launcher.exe", StringComparison.OrdinalIgnoreCase)) return false;
                    return true;
                })
                .ToList();

            // Prefer names that look like the Electron build product
            var preferred = filtered
                .OrderByDescending(p =>
                {
                    string n = Path.GetFileName(p);
                    int score = 0;
                    if (n.Contains("Discord", StringComparison.OrdinalIgnoreCase)) score += 3;
                    if (n.Contains("Fake", StringComparison.OrdinalIgnoreCase)) score += 2;
                    if (n.Contains("Launcher", StringComparison.OrdinalIgnoreCase)) score += 2;
                    if (n.Contains("Game", StringComparison.OrdinalIgnoreCase)) score += 1;
                    // De-prioritize self
                    if (n.Equals("Launcher.exe", StringComparison.OrdinalIgnoreCase)) score -= 10;
                    return score;
                })
                .FirstOrDefault();

            return preferred;
        }

        private static HttpClient CreateHttpClient()
        {
            var client = new HttpClient();
            client.DefaultRequestHeaders.UserAgent.ParseAdd("DiscordFakeGameLauncher/1.0");
            client.DefaultRequestHeaders.Accept.ParseAdd("application/json");
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

                string versionFilePath = Path.Combine(baseDir, VersionFileName);

                // Local version: prefer version.txt, fall back to the compiled constant
                string localVersion = CurrentVersion;
                if (File.Exists(versionFilePath))
                {
                    try
                    {
                        string txt = File.ReadAllText(versionFilePath).Trim();
                        if (!string.IsNullOrWhiteSpace(txt))
                            localVersion = txt;
                    }
                    catch
                    {
                        // ignore, we'll just use CurrentVersion
                    }
                }

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

                if (string.Equals(latestVersion, localVersion, StringComparison.OrdinalIgnoreCase))
                {
                    Console.WriteLine($"You are on the latest version ({localVersion}).\n");
                    return;
                }

                Console.WriteLine($"New version available: {localVersion} → {latestVersion}");
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

                string updateRoot = Path.Combine(baseDir, "_update");
                string updateZip  = Path.Combine(updateRoot, "update.zip");
                string extractDir = Path.Combine(updateRoot, "new");

                if (Directory.Exists(updateRoot))
                    Directory.Delete(updateRoot, recursive: true);
                Directory.CreateDirectory(updateRoot);

                // Download zip
                byte[] data = Http.GetByteArrayAsync(asset.BrowserDownloadUrl)
                                  .GetAwaiter().GetResult();
                File.WriteAllBytes(updateZip, data);

                // Extract zip
                ZipFile.ExtractToDirectory(updateZip, extractDir);

                // IMPORTANT: find the folder that actually contains the new launcher exe
                string? extractedExePath = null;
                try
                {
                    extractedExePath = Directory
                        .GetFiles(extractDir, exeFileName, SearchOption.AllDirectories)
                        .FirstOrDefault();
                }
                catch
                {
                    // ignore, fallback below
                }

                string copySourceRoot;
                if (!string.IsNullOrEmpty(extractedExePath))
                {
                    copySourceRoot = Path.GetDirectoryName(extractedExePath) ?? extractDir;
                }
                else
                {
                    // Fallback: maybe files are directly under extractDir
                    copySourceRoot = extractDir;
                }

                string batchPath = Path.Combine(updateRoot, "run_update.bat");

                // Write version.txt only AFTER copy, inside the update script
                string batchContent =
$@"@echo off
setlocal
echo Updating Discord Fake Game Launcher...
timeout /t 1 /nobreak >nul
xcopy /E /Y ""{copySourceRoot}\*"" ""{baseDir}"" >nul
echo {latestVersion} > ""{versionFilePath}""
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
        // gamelist.json – always synced with Discord API
        // ───────────────────────────────────────────────────────────
        private static void SyncGameListWithDiscord(string baseDir)
        {
            string path = Path.Combine(baseDir, GameListFileName);

            try
            {
                Console.WriteLine("Syncing gamelist.json with Discord API...");

                const string url = "https://discord.com/api/applications/detectable";
                string remoteJson = Http.GetStringAsync(url).GetAwaiter().GetResult();

                // Normalize by trimming – Discord will return identical JSON for unchanged data
                string remoteTrimmed = remoteJson.Trim();
                string? localTrimmed = null;

                if (File.Exists(path))
                {
                    try
                    {
                        localTrimmed = File.ReadAllText(path).Trim();
                    }
                    catch
                    {
                        localTrimmed = null;
                    }
                }

                if (localTrimmed == null || !string.Equals(localTrimmed, remoteTrimmed, StringComparison.Ordinal))
                {
                    // Optional backup
                    if (localTrimmed != null)
                    {
                        try
                        {
                            File.Copy(path, path + ".bak", overwrite: true);
                        }
                        catch
                        {
                            // ignore backup errors
                        }
                    }

                    File.WriteAllText(path, remoteJson);
                    Console.WriteLine("✅ gamelist.json updated from Discord API.\n");
                }
                else
                {
                    Console.WriteLine("gamelist.json is already up-to-date with Discord API.\n");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"⚠ Could not sync gamelist.json with Discord API: {ex.Message}");

                if (!File.Exists(path))
                {
                    Console.WriteLine("❌ No local gamelist.json available; cannot continue.");
                    PauseBeforeExit();
                    Environment.Exit(1);
                }
                else
                {
                    Console.WriteLine("Using existing local gamelist.json.\n");
                }
            }
        }

        private static List<DetectableApp> LoadDetectableApps(string baseDir)
        {
            string gameListPath = Path.Combine(baseDir, GameListFileName);

            string json = File.ReadAllText(gameListPath);
            var apps = JsonSerializer.Deserialize<List<DetectableApp>>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            }) ?? new List<DetectableApp>();

            return apps;
        }

        // ───────────────────────────────────────────────────────────
        // Launcher logic
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
                apps = LoadDetectableApps(baseDir);
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

            Console.WriteLine($"Loaded {windowsApps.Count} detectable Windows apps from gamelist.json.\n");

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
        private static void PrintHeader(string baseDir)
        {
            Console.Title = "Discord Fake Game Launcher";

            string versionFilePath = Path.Combine(baseDir, VersionFileName);
            string shownVersion = CurrentVersion;

            if (File.Exists(versionFilePath))
            {
                try
                {
                    string txt = File.ReadAllText(versionFilePath).Trim();
                    if (!string.IsNullOrWhiteSpace(txt))
                        shownVersion = txt;
                }
                catch
                {
                    // ignore, use CurrentVersion
                }
            }

            Console.WriteLine("============================================");
            Console.WriteLine("     Discord Fake Game Launcher");
            Console.WriteLine("============================================");
            Console.WriteLine($"Current version (local): {shownVersion}");
            Console.WriteLine("Auto-updates from GitHub releases & syncs gamelist.json with Discord API.");
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
