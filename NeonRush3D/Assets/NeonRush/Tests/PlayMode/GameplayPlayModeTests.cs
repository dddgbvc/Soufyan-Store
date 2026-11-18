using System.Collections;
using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace NeonRush.Tests
{
    /// <summary>Makes sure the generated scene exists before Play Mode starts (Editor only).</summary>
    public sealed class EnsureSceneBuilt : IPrebuildSetup
    {
        public void Setup()
        {
#if UNITY_EDITOR
            // The builder lives in the editor-only assembly; call it without a hard reference
            // so this test assembly can still be built for players.
            System.Type t = System.Type.GetType("NeonRush.EditorTools.NeonRushSceneBuilder, NeonRush.Editor");
            if (t == null)
            {
                Debug.LogError("[NeonRush] Scene builder not found.");
                return;
            }

            System.Type setup = System.Type.GetType("NeonRush.EditorTools.NeonRushProjectSetup, NeonRush.Editor");
            setup?.GetMethod("Configure")?.Invoke(null, null);
            t.GetMethod("EnsureBuilt")?.Invoke(null, null);
#endif
        }
    }

    /// <summary>
    /// End-to-end tests that load the real NeonRush scene and drive the real systems.
    /// </summary>
    [PrebuildSetup(typeof(EnsureSceneBuilt))]
    public class GameplayPlayModeTests
    {
        private const string Prefix = "neonrush.playtest.";
        private GameManager _game;
        private PlayerController _player;
        private PerformanceManager _perf;
        private SettingsManager _settings;
        private UIManager _ui;

        [UnitySetUp]
        public IEnumerator LoadScene()
        {
            new LocalSaveManager(Prefix).DeleteAll();
            GameBootstrap.SaveKeyPrefixOverride = Prefix;
            yield return SceneManager.LoadSceneAsync("NeonRush", LoadSceneMode.Single);
            yield return null;

            _game = Object.FindObjectOfType<GameManager>();
            _player = Object.FindObjectOfType<PlayerController>();
            _perf = Object.FindObjectOfType<PerformanceManager>();
            _settings = Object.FindObjectOfType<SettingsManager>();
            _ui = Object.FindObjectOfType<UIManager>();
            Assert.IsNotNull(_game, "GameManager in scene");
        }

        [UnityTearDown]
        public IEnumerator Cleanup()
        {
            Time.timeScale = 1f;
            new LocalSaveManager(Prefix).DeleteAll();
            GameBootstrap.SaveKeyPrefixOverride = null;
            yield return null;
        }

        private static IEnumerator WaitRealtime(float seconds)
        {
            float end = Time.realtimeSinceStartup + seconds;
            while (Time.realtimeSinceStartup < end) yield return null;
        }

        private IEnumerator WaitForState(GameState state, float timeout)
        {
            float end = Time.realtimeSinceStartup + timeout;
            while (_game.State != state && Time.realtimeSinceStartup < end) yield return null;
        }

        [UnityTest]
        public IEnumerator BootsIntoMenuWithNoErrors()
        {
            var bootstrap = Object.FindObjectOfType<GameBootstrap>();
            Assert.IsTrue(bootstrap.IsReady);
            Assert.AreEqual(GameState.Menu, _game.State);
            Assert.IsTrue(_game.Road.IsInitialized);
            Assert.IsTrue(_game.Spawner.IsInitialized);
            Assert.AreEqual(Application.targetFrameRate, _perf.TargetFps);
            Assert.AreEqual(0, QualitySettings.vSyncCount);
            yield return WaitRealtime(0.5f);
            Assert.Greater(_player.Position.z, 0f, "attract mode drives the car behind the menu");
            LogAssert.NoUnexpectedReceived();
        }

        [UnityTest]
        public IEnumerator RunMovesCarAccumulatesScoreAndAccelerates()
        {
            _game.StartRun();
            _game.Spawner.Clear();
            Assert.AreEqual(GameState.Playing, _game.State);
            float startSpeed = _game.Speed;
            float z0 = _player.Position.z;

            // Keep the lane clear of hazards so the run survives for the measurement.
            float end = Time.realtimeSinceStartup + 1.5f;
            while (Time.realtimeSinceStartup < end)
            {
                _game.Spawner.Clear();
                yield return null;
            }

            Assert.Greater(_player.Position.z, z0 + 10f);
            Assert.Greater(_game.Score.Distance, 10f);
            Assert.Greater(_game.Score.ScoreInt, 0);
            Assert.Greater(_game.Speed, startSpeed, "speed increases over time");
            Assert.LessOrEqual(_game.Speed, _game.MaxSpeed);
        }

        [UnityTest]
        public IEnumerator ObstaclesSpawnAndAlwaysLeaveAnOpenLane()
        {
            _game.StartRun();
            yield return null;
            yield return null;
            IReadOnlyList<Obstacle> active = _game.Spawner.Active;
            Assert.Greater(active.Count, 0, "obstacles are spawned ahead of the car");

            var rows = new Dictionary<int, HashSet<int>>();
            foreach (Obstacle o in active)
            {
                Assert.Greater(o.transform.position.z, _player.Position.z, "spawned ahead");
                int row = Mathf.FloorToInt(o.transform.position.z / 5f);
                if (!rows.TryGetValue(row, out HashSet<int> lanes)) rows[row] = lanes = new HashSet<int>();
                lanes.Add(o.Lane);
            }

            foreach (KeyValuePair<int, HashSet<int>> r in rows)
            {
                Assert.Less(r.Value.Count, PlayerController.LaneCount, "a row never blocks all three lanes");
            }
        }

        [UnityTest]
        public IEnumerator LaneChangeMovesCarSmoothly()
        {
            _game.StartRun();
            _game.Spawner.Clear();
            Assert.IsTrue(_player.RequestLane(1));
            yield return null;
            float mid = _player.Position.x;
            yield return WaitRealtime(0.5f);
            _game.Spawner.Clear();
            Assert.Greater(mid, -0.01f);
            Assert.AreEqual(2.6f, _player.Position.x, 0.05f, "car settles in the right lane");

            _player.RequestLane(-1);
            _player.RequestLane(-1);
            yield return WaitRealtime(0.5f);
            Assert.AreEqual(-2.6f, _player.Position.x, 0.05f, "car settles in the left lane");
        }

        [UnityTest]
        public IEnumerator CollisionEndsRunAndSavesHighScore()
        {
            _game.StartRun();
            _game.Spawner.Clear();
            yield return WaitRealtime(0.3f);
            _game.Spawner.Clear();

            Obstacle hazard = _game.Spawner.SpawnAt(_player.Lane, _player.Position.z + 12f, 0);
            Assert.IsNotNull(hazard);
            yield return WaitForState(GameState.GameOver, 3f);

            Assert.AreEqual(GameState.GameOver, _game.State, "hitting an obstacle ends the run");
            Assert.AreEqual(0f, _game.Speed);
            Assert.Greater(_game.Score.ScoreInt, 0);
            Assert.AreEqual(_game.Score.ScoreInt, _game.Score.HighScore);
            Assert.IsTrue(_game.Score.NewHighScore);
            Assert.AreEqual(_game.Score.HighScore, new LocalSaveManager(Prefix).LoadHighScore(), "high score written to local storage");
        }

        [UnityTest]
        public IEnumerator DodgingAvoidsCollision()
        {
            _game.StartRun();
            _game.Spawner.Clear();
            _game.Spawner.SpawnAt(1, _player.Position.z + 30f, 1);
            _player.RequestLane(-1);
            yield return WaitRealtime(1.5f);
            Assert.AreEqual(GameState.Playing, _game.State, "an obstacle in another lane does not hit the car");
        }

        [UnityTest]
        public IEnumerator PauseFreezesAndResumeContinues()
        {
            _game.StartRun();
            _game.Spawner.Clear();
            yield return WaitRealtime(0.2f);
            _game.Pause();
            Assert.AreEqual(GameState.Paused, _game.State);
            Assert.AreEqual(0f, Time.timeScale);
            float z = _player.Position.z;
            yield return WaitRealtime(0.4f);
            Assert.AreEqual(z, _player.Position.z, 0.0001f, "nothing moves while paused");

            _game.Resume();
            _game.Spawner.Clear();
            Assert.AreEqual(1f, Time.timeScale);
            yield return WaitRealtime(0.3f);
            Assert.Greater(_player.Position.z, z, "moves again after resume");
        }

        [UnityTest]
        public IEnumerator RestartIsInstantAndDoesNotLeak()
        {
            int baseline = -1;
            for (int run = 0; run < 6; run++)
            {
                _game.Restart();
                Assert.AreEqual(GameState.Playing, _game.State);
                Assert.AreEqual(0, _game.Score.ScoreInt, "score resets on restart");
                yield return WaitRealtime(0.25f);
                _game.Spawner.SpawnAt(_player.Lane, _player.Position.z + 6f, run % 3);
                yield return WaitForState(GameState.GameOver, 2f);
                Assert.AreEqual(GameState.GameOver, _game.State);

                int objects = Object.FindObjectsOfType<Transform>(true).Length;
                if (baseline < 0) baseline = objects;
                else Assert.LessOrEqual(objects, baseline + 6, "pooled objects are reused across restarts");
            }
        }

        [UnityTest]
        public IEnumerator FloatingOriginKeepsPrecision()
        {
            _game.StartRun();
            _game.Spawner.Clear();
            _player.ShiftWorld(990f);
            _game.Road.ResetRoad(_player.Position.z);
            _game.Spawner.ResetSpawner(_player.Position.z);
            int before = _game.OriginShifts;
            float end = Time.realtimeSinceStartup + 1.5f;
            while (_game.OriginShifts == before && Time.realtimeSinceStartup < end)
            {
                _game.Spawner.Clear();
                yield return null;
            }

            Assert.Greater(_game.OriginShifts, before, "world re-centred past the threshold");
            Assert.Less(_player.Position.z, 100f);
            Assert.Greater(_game.Road.FrontZ, _player.Position.z + 100f, "road still extends ahead after the shift");
        }

        [UnityTest]
        public IEnumerator QualityAndFpsSettingsApplyImmediately()
        {
            _settings.SetQuality(QualityTier.Low);
            yield return null;
            Assert.AreEqual(QualityTier.Low, _settings.Quality);
            Assert.LessOrEqual(_perf.AppliedRenderScale, SettingsManager.RenderScaleFor(QualityTier.Low) + 0.001f);
            Assert.IsFalse(_perf.PostProcessingActive);

            _settings.SetQuality(QualityTier.High);
            yield return null;
            Assert.IsTrue(_perf.PostProcessingActive);

            _settings.SetShowFps(false);
            _settings.Commit();
            var save = new LocalSaveManager(Prefix);
            save.LoadSettings(out QualityTier q, out _, out _, out bool showFps, QualityTier.Medium);
            Assert.AreEqual(QualityTier.High, q);
            Assert.IsFalse(showFps);
        }

        [UnityTest]
        public IEnumerator PerformanceManagerReportsRealFrameTimes()
        {
            _game.StartRun();
            float end = Time.realtimeSinceStartup + 2f;
            while (Time.realtimeSinceStartup < end)
            {
                _game.Spawner.Clear();
                yield return null;
            }

            Assert.Greater(_perf.Fps, 0f);
            Assert.Greater(_perf.AvgFrameMs, 0f);
            Assert.GreaterOrEqual(_perf.WorstFrameMs, _perf.AvgFrameMs - 0.01f);
            Assert.LessOrEqual(_perf.TargetFps, Mathf.Max(FrameRatePolicy.MinTarget, Mathf.RoundToInt(_perf.DisplayHz)));
            Debug.Log("[NeonRush] PlayMode perf sample: " + _perf.Fps.ToString("0.0") + " FPS, avg " + _perf.AvgFrameMs.ToString("0.00") +
                      " ms, worst " + _perf.WorstFrameMs.ToString("0.00") + " ms, target " + _perf.TargetFps + " (display " +
                      _perf.DisplayHz.ToString("0") + " Hz)");
        }

        [UnityTest]
        public IEnumerator UiFollowsGameState()
        {
            Assert.IsNotNull(_ui);
            _game.StartRun();
            _game.Spawner.Clear();
            yield return WaitRealtime(0.4f);
            CanvasGroup hud = GameObject.Find("HUDPanel").GetComponent<CanvasGroup>();
            CanvasGroup menu = GameObject.Find("MenuPanel").GetComponent<CanvasGroup>();
            Assert.Greater(hud.alpha, 0.9f, "HUD visible while playing");
            Assert.Less(menu.alpha, 0.1f, "menu hidden while playing");
            Assert.IsFalse(menu.blocksRaycasts);

            _game.Pause();
            yield return WaitRealtime(0.4f);
            CanvasGroup pause = GameObject.Find("PausePanel").GetComponent<CanvasGroup>();
            Assert.Greater(pause.alpha, 0.9f, "pause screen fades in with unscaled time");
            Assert.IsTrue(pause.interactable);

            _ui.OpenSettings();
            yield return WaitRealtime(0.4f);
            CanvasGroup settings = GameObject.Find("SettingsPanel").GetComponent<CanvasGroup>();
            Assert.Greater(settings.alpha, 0.9f);
            _ui.CloseSettings();
            _game.Resume();
        }
    }
}
