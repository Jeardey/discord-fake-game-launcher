using System;
#if DUMMYGAME_WINDOWS_GUI
using System.Drawing;
using System.Windows.Forms;
#else
using System.Threading;
#endif

namespace DummyGame
{
    internal static class Program
    {
#if DUMMYGAME_WINDOWS_GUI
        [STAThread]
#endif
        static void Main(string[] args)
        {
            string displayName = args.Length > 0 && !string.IsNullOrWhiteSpace(args[0])
                ? args[0]
                : "Game";

#if DUMMYGAME_WINDOWS_GUI
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
#else
            // Headless fallback (Linux/macOS): Discord's non-Windows detection
            // just checks for a running process with a matching name, so no
            // window is required here. Keep the process alive until it is
            // killed (SIGTERM/SIGINT) by the launcher.
            Console.WriteLine($"{displayName} (fake process for Discord)");

            using var exitSignal = new ManualResetEventSlim(false);
            AppDomain.CurrentDomain.ProcessExit += (_, _) => exitSignal.Set();
            Console.CancelKeyPress += (_, e) =>
            {
                e.Cancel = true;
                exitSignal.Set();
            };

            exitSignal.Wait();
#endif
        }
    }
}