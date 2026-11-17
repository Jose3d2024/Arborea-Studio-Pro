using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;

namespace ArboreaStudioPro
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();

            string exeDir = AppDomain.CurrentDomain.BaseDirectory;
            string appRoot = ResolveAppRoot(exeDir);

            if (appRoot == null)
            {
                MessageBox.Show(
                    "No se encontraron 'dist-server\\server.cjs' ni 'dist\\index.html'.\n\nEjecuta 'npm run build:exe' en la carpeta del proyecto para regenerar la compilación.",
                    "Arborea Studio Pro",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                return;
            }

            string nodeExe = FindNodeExecutable();
            if (nodeExe == null)
            {
                MessageBox.Show(
                    "No se encontró Node.js en este equipo.\n\nInstala Node.js (https://nodejs.org) para ejecutar Arborea Studio Pro.",
                    "Arborea Studio Pro",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                return;
            }

            int port = FindAvailablePort(3000);
            string serverScript = Path.Combine(appRoot, "dist-server", "server.cjs");

            ProcessStartInfo nodePsi = new ProcessStartInfo();
            nodePsi.FileName = nodeExe;
            nodePsi.Arguments = "\"" + serverScript + "\"";
            nodePsi.WorkingDirectory = appRoot;
            nodePsi.UseShellExecute = false;
            nodePsi.CreateNoWindow = true;
            nodePsi.RedirectStandardOutput = false;
            nodePsi.RedirectStandardError = false;
            nodePsi.EnvironmentVariables["NODE_ENV"] = "production";
            nodePsi.EnvironmentVariables["PORT"] = port.ToString();

            Process nodeProc = null;
            try
            {
                nodeProc = Process.Start(nodePsi);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Error al iniciar el servidor interno de Arborea Studio Pro:\n" + ex.Message,
                    "Arborea Studio Pro",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                return;
            }

            string baseUrl = "http://127.0.0.1:" + port.ToString();
            bool ready = WaitForServer(baseUrl + "/api/health", nodeProc, 15000);
            if (!ready)
            {
                KillProcessSafely(nodeProc);
                MessageBox.Show(
                    "El servidor de Arborea Studio Pro no respondió a tiempo en " + baseUrl + ".",
                    "Arborea Studio Pro",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                return;
            }

            string appBrowser = FindChromiumAppBrowser();
            if (appBrowser != null)
            {
                string profileDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "ArboreaStudioPro",
                    "WebAppProfile"
                );
                Directory.CreateDirectory(profileDir);

                ProcessStartInfo browserPsi = new ProcessStartInfo();
                browserPsi.FileName = appBrowser;
                browserPsi.Arguments = "--app=\"" + baseUrl + "\" --user-data-dir=\"" + profileDir + "\" --no-first-run --no-default-browser-check --window-size=1440,900";
                browserPsi.UseShellExecute = false;

                try
                {
                    Process browserProc = Process.Start(browserPsi);
                    if (browserProc != null)
                    {
                        browserProc.WaitForExit();
                    }
                }
                catch
                {
                    OpenFallbackBrowser(baseUrl, nodeProc);
                    return;
                }
                finally
                {
                    KillProcessSafely(nodeProc);
                }
            }
            else
            {
                OpenFallbackBrowser(baseUrl, nodeProc);
            }
        }

        static string ResolveAppRoot(string exeDir)
        {
            string[] candidates = new string[]
            {
                exeDir,
                Path.GetFullPath(Path.Combine(exeDir, "..")),
                Directory.GetCurrentDirectory()
            };

            for (int i = 0; i < candidates.Length; i++)
            {
                string dir = candidates[i];
                if (File.Exists(Path.Combine(dir, "dist-server", "server.cjs")) &&
                    File.Exists(Path.Combine(dir, "dist", "index.html")))
                {
                    return dir;
                }
            }
            return null;
        }

        static string FindNodeExecutable()
        {
            string[] knownPaths = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "nodejs", "node.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "nodejs", "node.exe")
            };

            for (int i = 0; i < knownPaths.Length; i++)
            {
                if (File.Exists(knownPaths[i]))
                {
                    return knownPaths[i];
                }
            }

            string pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
            string[] dirs = pathEnv.Split(';');
            for (int i = 0; i < dirs.Length; i++)
            {
                string d = dirs[i].Trim();
                if (d.Length == 0) continue;
                string candidate = Path.Combine(d, "node.exe");
                if (File.Exists(candidate))
                {
                    return candidate;
                }
            }
            return null;
        }

        static string FindChromiumAppBrowser()
        {
            string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            string localApp = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

            string[] candidates = new string[]
            {
                Path.Combine(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(pf, "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(pf86, "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(localApp, "Google", "Chrome", "Application", "chrome.exe")
            };

            for (int i = 0; i < candidates.Length; i++)
            {
                if (File.Exists(candidates[i]))
                {
                    return candidates[i];
                }
            }
            return null;
        }

        static int FindAvailablePort(int preferred)
        {
            if (IsPortFree(preferred)) return preferred;

            TcpListener listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            int freePort = ((IPEndPoint)listener.LocalEndpoint).Port;
            listener.Stop();
            return freePort;
        }

        static bool IsPortFree(int port)
        {
            TcpListener listener = null;
            try
            {
                listener = new TcpListener(IPAddress.Loopback, port);
                listener.Start();
                return true;
            }
            catch
            {
                return false;
            }
            finally
            {
                if (listener != null)
                {
                    try { listener.Stop(); } catch { }
                }
            }
        }

        static bool WaitForServer(string healthUrl, Process nodeProc, int timeoutMs)
        {
            int elapsed = 0;
            while (elapsed < timeoutMs)
            {
                if (nodeProc == null || nodeProc.HasExited) return false;
                try
                {
                    HttpWebRequest req = (HttpWebRequest)WebRequest.Create(healthUrl);
                    req.Timeout = 1000;
                    req.Method = "GET";
                    using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                    {
                        if (resp.StatusCode == HttpStatusCode.OK) return true;
                    }
                }
                catch
                {
                    // server still starting up
                }
                Thread.Sleep(200);
                elapsed += 200;
            }
            return false;
        }

        static void OpenFallbackBrowser(string baseUrl, Process nodeProc)
        {
            try
            {
                Process.Start(new ProcessStartInfo(baseUrl) { UseShellExecute = true });
                MessageBox.Show(
                    "Arborea Studio Pro se ha abierto en tu navegador predeterminado (" + baseUrl + ").\n\nPulsa Aceptar aquí cuando termines para cerrar el servidor.",
                    "Arborea Studio Pro — Servidor Activo",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
            }
            finally
            {
                KillProcessSafely(nodeProc);
            }
        }

        static void KillProcessSafely(Process proc)
        {
            if (proc == null) return;
            try
            {
                if (!proc.HasExited)
                {
                    proc.Kill();
                }
            }
            catch
            {
                // ignore
            }
        }
    }
}
