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
            // "--hidden" (passed by the Electron launcher) keeps the process alive without showing
            // the window. Without it everything behaves exactly as before.
            bool hidden = false;
            string? displayNameArg = null;

            foreach (var arg in args)
            {
                if (string.Equals(arg, "--hidden", StringComparison.OrdinalIgnoreCase))
                {
                    hidden = true;
                }
                else if (displayNameArg == null && !string.IsNullOrWhiteSpace(arg))
                {
                    displayNameArg = arg;
                }
            }

            string displayName = displayNameArg ?? "Game";

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            Form form;

            if (hidden)
            {
                // Still a real top-level window as far as Windows is concerned (so the process
                // behaves like a normal app), but invisible to the user: 1x1 px, fully
                // transparent, off-screen and not listed in the taskbar.
                form = new Form
                {
                    Text = displayName,
                    FormBorderStyle = FormBorderStyle.None,
                    ShowInTaskbar = false,
                    StartPosition = FormStartPosition.Manual,
                    Location = new Point(-32000, -32000),
                    Size = new Size(1, 1),
                    Opacity = 0
                };
            }
            else
            {
                form = new Form
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
            }

            Application.Run(form);
        }
    }
}
