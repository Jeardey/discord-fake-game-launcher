using System;
using System.Drawing;
using System.Windows.Forms;

namespace DummyGame
{
    internal static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            // "--hidden" (passed by the Electron launcher) starts the window MINIMIZED instead of
            // showing it. It is still a completely normal top-level window (caption, taskbar entry,
            // normal size once restored), which is what Discord needs to see to report the game as
            // "playing"; windows that look unusual (tool windows, 1x1, off-screen, transparent)
            // are not recognized. Without the flag everything behaves exactly as before.
            bool minimized = false;
            string? displayNameArg = null;

            foreach (var arg in args)
            {
                if (string.Equals(arg, "--hidden", StringComparison.OrdinalIgnoreCase))
                {
                    minimized = true;
                }
                else if (displayNameArg == null && !string.IsNullOrWhiteSpace(arg))
                {
                    displayNameArg = arg;
                }
            }

            string displayName = displayNameArg ?? "Game";

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            Form form = minimized ? new QuietForm() : new Form();
            form.Text = displayName;
            form.Width = 480;
            form.Height = 200;
            form.StartPosition = FormStartPosition.CenterScreen;

            var label = new Label
            {
                Text = $"{displayName} (fake process for Discord)",
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleCenter,
                Font = new Font(SystemFonts.DefaultFont.FontFamily, 11f, FontStyle.Regular)
            };
            form.Controls.Add(label);

            if (minimized)
            {
                form.WindowState = FormWindowState.Minimized;
            }

            Application.Run(form);
        }
    }

    // Shown without taking focus, so starting a fake game never interrupts what you are doing.
    internal sealed class QuietForm : Form
    {
        protected override bool ShowWithoutActivation => true;
    }
}
