using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Windows.Forms;

internal static class Program
{
    private static readonly object LogLock = new object();
    private static string logFile;

    private static void Log(string message)
    {
        try
        {
            lock (LogLock)
            {
                File.AppendAllText(logFile, "[" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff") + "] " + message + Environment.NewLine);
            }
        }
        catch
        {
        }
    }

    [STAThread]
    private static void Main(string[] args)
    {
        string baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
        string runtime = Path.Combine(baseDir, "OrbitRuntime.exe");
        string logDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Orbit IDE");
        Directory.CreateDirectory(logDir);
        logFile = Path.Combine(logDir, "launcher.log");
        try
        {
            FileInfo info = new FileInfo(logFile);
            if (info.Exists && info.Length > 2 * 1024 * 1024)
            {
                File.Copy(logFile, logFile + ".old", true);
                File.Delete(logFile);
            }
        }
        catch
        {
        }

        Log("launcher start; base=" + baseDir);
        if (!File.Exists(runtime))
        {
            Log("runtime missing: " + runtime);
            MessageBox.Show("鎵句笉鍒?OrbitRuntime.exe銆俓n璇风‘璁ゆ暣涓▼搴忔枃浠跺す瀹屾暣瑙ｅ帇鍚庡啀杩愯銆?, "Orbit IDE 鍚姩澶辫触", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        Process process = null;
        try
        {
            ProcessStartInfo startInfo = new ProcessStartInfo(runtime, "--enable-logging");
            startInfo.WorkingDirectory = baseDir;
            startInfo.UseShellExecute = false;
            startInfo.CreateNoWindow = true;
            startInfo.RedirectStandardOutput = true;
            startInfo.RedirectStandardError = true;
            startInfo.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");

            process = new Process();
            process.StartInfo = startInfo;
            process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e)
            {
                if (e.Data != null) Log("[stdout] " + e.Data);
            };
            process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e)
            {
                if (e.Data != null) Log("[stderr] " + e.Data);
            };
            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            Log("runtime started; pid=" + process.Id);

            DateTime started = DateTime.Now;
            while (!process.HasExited)
            {
                Thread.Sleep(600);
            }
            int exitCode = process.ExitCode;
            Log("runtime exited; code=" + exitCode + "; uptime_ms=" + (int)(DateTime.Now - started).TotalMilliseconds);
            if (exitCode != 0 && (DateTime.Now - started).TotalSeconds < 15)
            {
                MessageBox.Show(
                    "Orbit IDE 杩愯鏃跺惎鍔ㄥけ璐ワ紙閫€鍑虹爜 " + exitCode + "锛夈€俓n\n璇婃柇鏃ュ織锛歕n" + logFile,
                    "Orbit IDE 鍚姩澶辫触",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }
        catch (Exception ex)
        {
            Log("launcher exception: " + ex);
            MessageBox.Show(
                "鏃犳硶鍚姩 Orbit IDE 杩愯鏃躲€俓n\n" + ex.Message + "\n\n璇婃柇鏃ュ織锛歕n" + logFile,
                "Orbit IDE 鍚姩澶辫触",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
        }
        finally
        {
            if (process != null)
            {
                try { process.Dispose(); } catch { }
            }
        }
    }
}

