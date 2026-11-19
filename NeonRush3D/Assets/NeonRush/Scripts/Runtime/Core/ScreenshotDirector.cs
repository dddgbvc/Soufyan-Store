using System;
using System.Collections;
using System.IO;
using UnityEngine;

namespace NeonRush
{
    /// <summary>
    /// Automated screenshot mode, enabled only with the command-line argument
    /// <c>-nrScreenshots &lt;directory&gt;</c>. It plays the real game (autopilot steering),
    /// captures menu / gameplay / pause / settings / game-over screens, then quits.
    /// Inert in normal play and on iOS.
    /// </summary>
    public sealed class ScreenshotDirector : MonoBehaviour
    {
        private GameManager _game;
        private UIManager _ui;
        private string _dir;

        public static string RequestedDirectory()
        {
            string[] args = Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length - 1; i++)
            {
                if (args[i] == "-nrScreenshots") return args[i + 1];
            }

            return null;
        }

        public void Begin(GameManager game, UIManager ui, string dir)
        {
            _game = game;
            _ui = ui;
            _dir = dir;
            Directory.CreateDirectory(_dir);
            Debug.Log("[NeonRush] Screenshot mode → " + _dir + " | " + Screen.width + "x" + Screen.height +
                      " | GPU: " + SystemInfo.graphicsDeviceName + " (" + SystemInfo.graphicsDeviceType + ")");
            StartCoroutine(Run());
        }

        private IEnumerator Run()
        {
            yield return new WaitForSecondsRealtime(3f);
            yield return Shot("1_menu.png");

            _game.StartRun();
            yield return Drive(4f);
            yield return Shot("2_gameplay.png");

            yield return Drive(8f);
            yield return Shot("3_gameplay_fast.png");

            _game.Pause();
            yield return new WaitForSecondsRealtime(0.8f);
            yield return Shot("4_pause.png");

            _ui.OpenSettings();
            yield return new WaitForSecondsRealtime(0.8f);
            yield return Shot("5_settings.png");
            _ui.CloseSettings();
            yield return new WaitForSecondsRealtime(0.4f);

            _game.Resume();
            yield return Drive(0.5f);
            PlayerController p = _game.Player;
            _game.Spawner.SpawnAt(p.Lane, p.Position.z + 14f, 1);
            float end = Time.realtimeSinceStartup + 4f;
            while (_game.State != GameState.GameOver && Time.realtimeSinceStartup < end) yield return null;
            yield return new WaitForSecondsRealtime(1.2f);
            yield return Shot("6_game_over.png");

            Debug.Log("[NeonRush] Screenshot mode finished: distance " + _game.Score.DistanceInt + " m, score " + _game.Score.ScoreInt);
            Application.Quit(0);
        }

        private IEnumerator Shot(string file)
        {
            string path = Path.Combine(_dir, file);
            ScreenCapture.CaptureScreenshot(path);
            float end = Time.realtimeSinceStartup + 3f;
            while (!File.Exists(path) && Time.realtimeSinceStartup < end) yield return null;
            yield return null;
            Debug.Log("[NeonRush] Captured " + path + (File.Exists(path) ? "" : " (MISSING)"));
        }

        private IEnumerator Drive(float seconds)
        {
            float end = Time.realtimeSinceStartup + seconds;
            while (Time.realtimeSinceStartup < end && _game.State == GameState.Playing)
            {
                Steer(Mathf.Max(26f, _game.Speed * 1.1f));
                yield return null;
            }
        }

        private void Steer(float ahead)
        {
            PlayerController p = _game.Player;
            int lane = p.Lane;
            if (!Blocked(lane, ahead)) return;
            if (lane == 1)
            {
                if (!Blocked(0, ahead)) p.RequestLane(-1);
                else if (!Blocked(2, ahead)) p.RequestLane(1);
            }
            else if (!Blocked(1, ahead))
            {
                p.RequestLane(lane == 0 ? 1 : -1);
            }
        }

        private bool Blocked(int lane, float ahead)
        {
            float z = _game.Player.Position.z;
            var active = _game.Spawner.Active;
            for (int i = 0; i < active.Count; i++)
            {
                Obstacle o = active[i];
                float dz = o.transform.position.z - z;
                if (o.Lane == lane && dz > -3.2f && dz < ahead) return true;
            }

            return false;
        }
    }
}
