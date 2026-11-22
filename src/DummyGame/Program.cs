using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace DummyGame
{
    internal static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            // Arguments (all optional, any order):
            //   <name>              window title / game name (first plain argument)
            //   --lang=pt-BR|en|es  language of the window
            //   --icon-url=<url>    game icon (Discord CDN), loaded in the background
            // Unknown "--flags" (for example the old "--hidden") are ignored.
            string? name = null;
            string lang = "en";
            string? iconUrl = null;

            foreach (var arg in args)
            {
                if (arg.StartsWith("--lang=", StringComparison.OrdinalIgnoreCase)) lang = arg.Substring(7);
                else if (arg.StartsWith("--icon-url=", StringComparison.OrdinalIgnoreCase)) iconUrl = arg.Substring(11);
                else if (arg.StartsWith("--")) continue;
                else if (name == null && !string.IsNullOrWhiteSpace(arg)) name = arg;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new GameWindow(name ?? "Game", lang, iconUrl));
        }
    }

    internal sealed class Texts
    {
        public string Running = "Running";
        public string ActiveTime = "Active time";
        public string KeepOpen = "Keep this window open. If it is closed, Discord stops recognizing the game.";
        public string ConfirmTitle = "Stop being recognized?";
        public string ConfirmBody = "If you close this window, \"{0}\" stops being recognized by Discord and shows as stopped in the app. Close it anyway?";
        public string Keep = "Keep open";
        public string CloseAnyway = "Close anyway";

        public static Texts For(string? lang)
        {
            string l = (lang ?? "en").ToLowerInvariant();
            if (l.StartsWith("pt"))
            {
                return new Texts
                {
                    Running = "Em execução",
                    ActiveTime = "Tempo ativo",
                    KeepOpen = "Mantenha esta janela aberta. Se ela for fechada, o Discord deixa de reconhecer o jogo.",
                    ConfirmTitle = "Parar o reconhecimento?",
                    ConfirmBody = "Se você fechar esta janela, \"{0}\" deixa de ser reconhecido no Discord e aparece como parado no app. Fechar mesmo assim?",
                    Keep = "Manter aberta",
                    CloseAnyway = "Fechar mesmo assim"
                };
            }
            if (l.StartsWith("es"))
            {
                return new Texts
                {
                    Running = "En ejecución",
                    ActiveTime = "Tiempo activo",
                    KeepOpen = "Mantén esta ventana abierta. Si se cierra, Discord deja de reconocer el juego.",
                    ConfirmTitle = "¿Dejar de ser reconocido?",
                    ConfirmBody = "Si cierras esta ventana, \"{0}\" deja de ser reconocido por Discord y aparece como detenido en la app. ¿Cerrar de todos modos?",
                    Keep = "Mantener abierta",
                    CloseAnyway = "Cerrar de todos modos"
                };
            }
            return new Texts();
        }
    }

    internal static class Theme
    {
        public static readonly Color Bg = Color.FromArgb(20, 21, 38);
        public static readonly Color Card = Color.FromArgb(27, 29, 51);
        public static readonly Color Text = Color.FromArgb(228, 230, 245);
        public static readonly Color Muted = Color.FromArgb(154, 157, 187);
        public static readonly Color Brand = Color.FromArgb(124, 108, 255);
        public static readonly Color Brand2 = Color.FromArgb(62, 166, 255);
        public static readonly Color Success = Color.FromArgb(52, 211, 153);
        public static readonly Color Danger = Color.FromArgb(255, 84, 112);

        [DllImport("dwmapi.dll")]
        private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

        // Dark title bar (Windows 10 1809+ / 11); silently ignored where unsupported.
        public static void DarkTitleBar(IntPtr handle)
        {
            try
            {
                int on = 1;
                DwmSetWindowAttribute(handle, 20, ref on, sizeof(int));
                int caption = (38 << 16) | (21 << 8) | 20; // COLORREF 0x00BBGGRR of Bg
                DwmSetWindowAttribute(handle, 35, ref caption, sizeof(int));
            }
            catch { /* cosmetic only */ }
        }

        public static GraphicsPath Rounded(Rectangle r, int radius)
        {
            int d = radius * 2;
            var p = new GraphicsPath();
            p.AddArc(r.X, r.Y, d, d, 180, 90);
            p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure();
            return p;
        }
    }

    // The window of the fake game: themed, localized, shows the game icon and how long it has been active.
    internal sealed class GameWindow : Form
    {
        private readonly string _name;
        private readonly Texts _t;
        private readonly string? _iconUrl;
        private Image? _iconImage;
        private readonly Stopwatch _clock = Stopwatch.StartNew();
        private readonly System.Windows.Forms.Timer _timer = new System.Windows.Forms.Timer { Interval = 1000 };

        public GameWindow(string name, string lang, string? iconUrl)
        {
            _name = name;
            _t = Texts.For(lang);
            _iconUrl = iconUrl;

            Text = name; // the window title is the game name (as before)
            AutoScaleMode = AutoScaleMode.None;
            ClientSize = new Size(460, 250);
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Theme.Bg;
            DoubleBuffered = true;
            ResizeRedraw = true;

            _timer.Tick += (s, e) => Invalidate();
            _timer.Start();
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            Theme.DarkTitleBar(Handle);
        }

        protected override async void OnShown(EventArgs e)
        {
            base.OnShown(e);
            await LoadIconAsync();
        }

        private async System.Threading.Tasks.Task LoadIconAsync()
        {
            try
            {
                if (string.IsNullOrWhiteSpace(_iconUrl)) return;
                if (!Uri.TryCreate(_iconUrl, UriKind.Absolute, out var uri)) return;
                if (uri.Scheme != Uri.UriSchemeHttps || !uri.Host.EndsWith("discordapp.com", StringComparison.OrdinalIgnoreCase)) return;

                using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(8) };
                byte[] bytes = await http.GetByteArrayAsync(uri);
                using var ms = new System.IO.MemoryStream(bytes);
                using var loaded = new Bitmap(ms);
                var image = new Bitmap(loaded);

                if (IsDisposed) { image.Dispose(); return; }
                _iconImage = image;

                // The taskbar / title bar also show the game icon.
                try
                {
                    using var small = new Bitmap(image, new Size(32, 32));
                    Icon = Icon.FromHandle(small.GetHicon());
                }
                catch { /* keep the default icon */ }

                Invalidate();
            }
            catch
            {
                // Offline or blocked: the first letter of the game is shown instead.
            }
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

            int w = ClientSize.Width;

            using (var bar = new LinearGradientBrush(new Rectangle(0, 0, w, 4), Theme.Brand, Theme.Brand2, 0f))
                g.FillRectangle(bar, 0, 0, w, 4);

            // Game icon tile
            var tile = new Rectangle(28, 36, 84, 84);
            using (var path = Theme.Rounded(tile, 20))
            {
                if (_iconImage != null)
                {
                    g.SetClip(path);
                    g.DrawImage(_iconImage, tile);
                    g.ResetClip();
                }
                else
                {
                    using (var fill = new LinearGradientBrush(tile, Color.FromArgb(37, 39, 74), Color.FromArgb(26, 28, 51), 45f))
                        g.FillPath(fill, path);

                    string letter = string.IsNullOrWhiteSpace(_name) ? "?" : _name.Trim().Substring(0, 1).ToUpperInvariant();
                    using (var f = new Font("Segoe UI", 30f, FontStyle.Bold, GraphicsUnit.Pixel))
                    using (var b = new SolidBrush(Color.FromArgb(201, 204, 240)))
                    using (var fmt = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
                        g.DrawString(letter, f, b, tile, fmt);
                }
                using (var pen = new Pen(Color.FromArgb(40, 255, 255, 255)))
                    g.DrawPath(pen, path);
            }

            // Game name
            using (var f = new Font("Segoe UI", 22f, FontStyle.Bold, GraphicsUnit.Pixel))
            using (var b = new SolidBrush(Color.White))
            using (var fmt = new StringFormat(StringFormatFlags.NoWrap) { Trimming = StringTrimming.EllipsisCharacter })
                g.DrawString(_name, f, b, new RectangleF(128, 38, w - 128 - 24, 32), fmt);

            // Status
            using (var dot = new SolidBrush(Theme.Success))
                g.FillEllipse(dot, 128, 82, 9, 9);
            using (var f = new Font("Segoe UI", 13f, FontStyle.Bold, GraphicsUnit.Pixel))
            using (var b = new SolidBrush(Theme.Success))
                g.DrawString(_t.Running, f, b, 143, 77);

            // Active time
            var ts = _clock.Elapsed;
            string elapsed = $"{(int)ts.TotalHours:00}:{ts.Minutes:00}:{ts.Seconds:00}";
            using (var f = new Font("Segoe UI", 13f, FontStyle.Regular, GraphicsUnit.Pixel))
            using (var muted = new SolidBrush(Theme.Muted))
            using (var text = new SolidBrush(Theme.Text))
            {
                g.DrawString(_t.ActiveTime, f, muted, 128, 100);
                var size = g.MeasureString(_t.ActiveTime, f);
                g.DrawString(elapsed, f, text, 128 + size.Width - 2, 100);
            }

            // Divider + message
            using (var pen = new Pen(Color.FromArgb(30, 255, 255, 255)))
                g.DrawLine(pen, 28, 142, w - 28, 142);

            using (var f = new Font("Segoe UI", 13f, FontStyle.Regular, GraphicsUnit.Pixel))
            using (var b = new SolidBrush(Theme.Muted))
                g.DrawString(_t.KeepOpen, f, b, new RectangleF(28, 156, w - 56, 48));

            using (var f = new Font("Segoe UI", 11f, FontStyle.Regular, GraphicsUnit.Pixel))
            using (var b = new SolidBrush(Color.FromArgb(110, 113, 145)))
                g.DrawString("Discord Fake Game Launcher", f, b, 28, ClientSize.Height - 28);
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            // Only a click on X / Alt+F4 asks. The launcher stopping the game, or Windows shutting down, does not.
            if (e.CloseReason == CloseReason.UserClosing)
            {
                using (var dialog = new ConfirmDialog(_t.ConfirmTitle, string.Format(_t.ConfirmBody, _name), _t.Keep, _t.CloseAnyway))
                {
                    if (dialog.ShowDialog(this) != DialogResult.OK)
                    {
                        e.Cancel = true;
                        return;
                    }
                }
            }
            base.OnFormClosing(e);
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _timer.Dispose();
                _iconImage?.Dispose();
            }
            base.Dispose(disposing);
        }
    }

    // Small themed confirmation window. OK = close anyway, Cancel = keep open (default).
    internal sealed class ConfirmDialog : Form
    {
        public ConfirmDialog(string title, string message, string keepText, string closeText)
        {
            Text = title;
            AutoScaleMode = AutoScaleMode.None;
            ClientSize = new Size(420, 190);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.CenterParent;
            BackColor = Theme.Bg;

            var heading = new Label
            {
                Text = title,
                ForeColor = Color.White,
                Font = new Font("Segoe UI", 15f, FontStyle.Bold, GraphicsUnit.Pixel),
                Location = new Point(24, 22),
                Size = new Size(372, 24),
                AutoEllipsis = true
            };

            var body = new Label
            {
                Text = message,
                ForeColor = Theme.Muted,
                Font = new Font("Segoe UI", 13f, FontStyle.Regular, GraphicsUnit.Pixel),
                Location = new Point(24, 54),
                Size = new Size(372, 70)
            };

            var keep = MakeButton(keepText, new Point(24, 138), 180, Theme.Brand, Color.White);
            keep.DialogResult = DialogResult.Cancel;

            var close = MakeButton(closeText, new Point(216, 138), 180, Theme.Card, Theme.Danger);
            close.DialogResult = DialogResult.OK;

            Controls.AddRange(new Control[] { heading, body, keep, close });
            AcceptButton = keep;
            CancelButton = keep;
        }

        private static Button MakeButton(string text, Point location, int width, Color back, Color fore)
        {
            var b = new Button
            {
                Text = text,
                Location = location,
                Size = new Size(width, 36),
                FlatStyle = FlatStyle.Flat,
                BackColor = back,
                ForeColor = fore,
                Font = new Font("Segoe UI", 13f, FontStyle.Bold, GraphicsUnit.Pixel),
                Cursor = Cursors.Hand,
                UseVisualStyleBackColor = false
            };
            b.FlatAppearance.BorderSize = 0;
            return b;
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            Theme.DarkTitleBar(Handle);
        }
    }
}
