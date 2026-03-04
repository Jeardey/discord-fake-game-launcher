using System;
using System.Threading;

#if WINDOWS
using System.Drawing;
using System.Windows.Forms;
#endif

namespace DummyGame
{
    internal static class Program
    {
        static void Main(string[] args)
        {
            string displayName = args.Length > 0 && !string.IsNullOrWhiteSpace(args[0])
                ? args[0]
                : "Game";

#if WINDOWS
            RunWindowsUi(displayName);
#else
            RunConsole(displayName);
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
        private static void RunConsole(string displayName)
        {
            Console.Title = displayName;
            Console.WriteLine($"{displayName} (fake process for Discord)");
            Console.WriteLine("Press Ctrl+C to exit.");

            while (true)
            {
                Thread.Sleep(1000);
            }
        }
#endif
    }
}