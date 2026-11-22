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
                // Discord ignores windows that look "not real" (1x1 px, off-screen, fully transparent),
                // so the hidden mode is a normal-sized window on the primary screen that the user
                // cannot see or touch: almost fully transparent, click-through, never activated,
                // not in the taskbar / Alt+Tab, and pushed behind every other window.
                var area = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1280, 720);
                int width = Math.Min(960, Math.Max(320, area.Width));
                int height = Math.Min(540, Math.Max(200, area.Height));

                form = new GhostForm
                {
                    Text = displayName,
                    FormBorderStyle = FormBorderStyle.None,
                    ShowInTaskbar = false,
                    StartPosition = FormStartPosition.Manual,
                    Location = new Point(area.Left + (area.Width - width) / 2, area.Top + (area.Height - height) / 2),
                    Size = new Size(width, height),
                    Opacity = 0.01
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

    internal sealed class GhostForm : Form
    {
        private const int WS_EX_TRANSPARENT = 0x00000020;
        private const int WS_EX_TOOLWINDOW = 0x00000080;
        private const int WS_EX_NOACTIVATE = 0x08000000;
        private const uint SWP_NOSIZE = 0x0001;
        private const uint SWP_NOMOVE = 0x0002;
        private const uint SWP_NOACTIVATE = 0x0010;
        private static readonly IntPtr HWND_BOTTOM = new IntPtr(1);

        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint uFlags);

        protected override bool ShowWithoutActivation => true;

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                cp.ExStyle |= WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE;
                return cp;
            }
        }

        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            SetWindowPos(Handle, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        }
    }
}
