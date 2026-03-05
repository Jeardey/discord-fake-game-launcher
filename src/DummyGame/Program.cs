using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

#if WINDOWS
using System.Drawing;
using System.Windows.Forms;
#else
using System.Text;
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
        TrySetLinuxProcessName(executableName);
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

        private static void TrySetLinuxProcessName(string executableName)
        {
            try
            {
                string baseName = Path.GetFileNameWithoutExtension(executableName);
                if (string.IsNullOrWhiteSpace(baseName))
                    baseName = "DummyGame";

                if (baseName.Length > 15)
                    baseName = baseName.Substring(0, 15);

                byte[] bytes = new byte[16];
                int written = Encoding.UTF8.GetBytes(baseName, 0, baseName.Length, bytes, 0);
                if (written >= bytes.Length)
                    written = bytes.Length - 1;
                bytes[written] = 0;

                PrctlSetName(bytes);
            }
            catch
            {
                // ignore
            }
        }

        [DllImport("libc", EntryPoint = "prctl", SetLastError = true)]
        private static extern int Prctl(int option, IntPtr arg2, IntPtr arg3, IntPtr arg4, IntPtr arg5);

        private static void PrctlSetName(byte[] zeroTerminatedUtf8Name)
        {
            const int PR_SET_NAME = 15;
            IntPtr native = IntPtr.Zero;
            try
            {
                native = Marshal.AllocHGlobal(16);
                Marshal.Copy(zeroTerminatedUtf8Name, 0, native, 16);
                _ = Prctl(PR_SET_NAME, native, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero);
            }
            finally
            {
                if (native != IntPtr.Zero)
                    Marshal.FreeHGlobal(native);
            }
        }

        private static string EscapeQuotes(string input)
        {
            return (input ?? string.Empty).Replace("\"", "\\\"");
        }
#endif
    }
}