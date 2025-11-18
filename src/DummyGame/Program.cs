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
            string displayName = args.Length > 0 && !string.IsNullOrWhiteSpace(args[0])
                ? args[0]
                : "Game";

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
    }
}