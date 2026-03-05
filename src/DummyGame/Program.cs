using System;
using System.Diagnostics;
using System.Threading;

#if WINDOWS
using System.Drawing;
using System.Windows.Forms;
#endif

namespace DummyGame
{
    internal static class Program
    {
        private static volatile bool _running = true;

        static void Main(string[] args)
        {
            string displayName = args.Length > 0 && !string.IsNullOrWhiteSpace(args[0])
                ? args[0]
                : "Game";

            string executableName = args.Length > 1 && !string.IsNullOrWhiteSpace(args[1])
                ? args[1]
                : "Game";

            AppDomain.CurrentDomain.ProcessExit += (_, __) => _running = false;
            Console.CancelKeyPress += (_, e) =>
            {
                _running = false;
                e.Cancel = true;
            };

#if WINDOWS
            RunWindowsUi(displayName);
#else
            RunLinux(displayName, executableName);
#endif
        }

#if WINDOWS
        [STAThread]
        private static void RunWindowsUi(string displayName)
        {

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            var form = new Form
            {
                Text = displayName,                    
                Width = 480,
                Height = 200,
                StartPosition = FormStartPosition.CenterScreen
            };

            var label = new Label
            {
                Text = $"{displayName} (fake process for Discord)",
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleCenter,
                Font = new Font(SystemFonts.DefaultFont.FontFamily, 11f, FontStyle.Regular)
            };

            form.Controls.Add(label);

            Application.Run(form);
        }
#else
        private static void RunLinux(string displayName, string executableName)
        {
            Process? uiProc = TryStartLinuxUi(displayName, executableName);

            while (_running)
            {
                Thread.Sleep(1000);
            }

            try
            {
                if (uiProc != null && !uiProc.HasExited)
                {
                    uiProc.Kill(true);
                }
            }
            catch
            {
                // ignore
            }
        }

        private static Process? TryStartLinuxUi(string displayName, string executableName)
        {
            string title = $"{displayName} ({executableName})";
            string text = title;

            try
            {
                var zenity = Process.Start(new ProcessStartInfo
                {
                    FileName = "zenity",
                    Arguments = $"--info --title=\"{EscapeQuotes(title)}\" --text=\"{EscapeQuotes(text)}\" --no-wrap",
                    UseShellExecute = false,
                    CreateNoWindow = true
                });

                if (zenity != null) return zenity;
            }
            catch
            {
                // ignore and fallback
            }

            try
            {
                var xmessage = Process.Start(new ProcessStartInfo
                {
                    FileName = "xmessage",
                    Arguments = $"-center \"{EscapeQuotes(text)}\"",
                    UseShellExecute = false,
                    CreateNoWindow = true
                });

                if (xmessage != null) return xmessage;
            }
            catch
            {
                // ignore
            }

            return null;
        }

        private static string EscapeQuotes(string input)
        {
            return (input ?? string.Empty).Replace("\"", "\\\"");
        }
#endif
    }
}