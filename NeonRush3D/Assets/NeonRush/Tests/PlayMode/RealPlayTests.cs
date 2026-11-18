using System.Collections;
using System.IO;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace NeonRush.Tests
{
    /// <summary>
    /// "Does it actually play?" tests: an autopilot drives real runs through spawned traffic,
    /// visibility of car / road / obstacles / UI is checked against the camera frustum, and
    /// screenshots are written to Builds/Screenshots when a GPU device is available.
    /// </summary>
    [PrebuildSetup(typeof(EnsureSceneBuilt))]
    public class RealPlayTests
    {
        private const string Prefix = "neonrush.realplay.";
        private GameManager _game;
        private PlayerController _player;
        private Camera _cam;
        private PerformanceManager _perf;

        [UnitySetUp]
        public IEnumerator Load()
        {
            new LocalSaveManager(Prefix).DeleteAll();
            GameBootstrap.SaveKeyPrefixOverride = Prefix;
            yield return SceneManager.LoadSceneAsync("NeonRush", LoadSceneMode.Single);
            yield return null;
            _game = Object.FindObjectOfType<GameManager>();
            _player = Object.FindObjectOfType<PlayerController>();
            _perf = Object.FindObjectOfType<PerformanceManager>();
            _cam = Camera.main;
            Assert.IsNotNull(_cam, "Main Camera");
        }

        [UnityTearDown]
        public IEnumerator Cleanup()
        {
            Time.timeScale = 1f;
            new LocalSaveManager(Prefix).DeleteAll();
            GameBootstrap.SaveKeyPrefixOverride = null;
            yield return null;
        }

        private bool LaneBlocked(int lane, float ahead)
        {
            float z = _player.Position.z;
            foreach (Obstacle o in _game.Spawner.Active)
            {
                float dz = o.transform.position.z - z;
                if (o.Lane == lane && dz > -3.2f && dz < ahead) return true;
            }

            return false;
        }

        /// <summary>Simple driver: if the current lane is blocked ahead, move to a free neighbour lane.</summary>
        private void Steer(float lookAhead)
        {
            int lane = _player.Lane;
            if (!LaneBlocked(lane, lookAhead)) return;
            int[] options = lane == 1 ? new[] { 0, 2 } : new[] { 1 };
            foreach (int target in options)
            {
                if (!LaneBlocked(target, lookAhead))
                {
                    _player.RequestLane(target > lane ? 1 : -1);
                    return;
                }
            }
        }

        [UnityTest]
        [Timeout(120000)]
        public IEnumerator AutopilotPlaysThroughTrafficWithCleanConsole()
        {
            _game.StartRun();
            float start = Time.realtimeSinceStartup;
            int lastRows = 0;
            while (_game.State == GameState.Playing && Time.realtimeSinceStartup - start < 25f)
            {
                Steer(Mathf.Max(24f, _game.Speed * 1.1f));
                lastRows = _game.Spawner.RowsSpawned;
                yield return null;
            }

            float seconds = Time.realtimeSinceStartup - start;
            Debug.Log("[NeonRush] Autopilot: state=" + _game.State + " time=" + seconds.ToString("0.0") + "s distance=" +
                      _game.Score.DistanceInt + "m score=" + _game.Score.ScoreInt + " speed=" + _game.SpeedKmh.ToString("0") +
                      "km/h rows=" + lastRows + " originShifts=" + _game.OriginShifts + " fps=" + _perf.Fps.ToString("0.0") +
                      " avgMs=" + _perf.AvgFrameMs.ToString("0.00"));

            Assert.AreEqual(GameState.Playing, _game.State, "autopilot survived 25 s of generated obstacles");
            Assert.Greater(lastRows, 10, "many obstacle rows were generated and passed");
            Assert.Greater(_game.Score.Distance, 400f);
            Assert.Greater(_game.Speed, _game.StartSpeed + 5f, "speed ramped up");
            LogAssert.NoUnexpectedReceived();
        }

        [UnityTest]
        public IEnumerator CarRoadObstaclesAndUiAreInView()
        {
            _game.StartRun();
            yield return null;
            yield return null;
            Plane[] planes = GeometryUtility.CalculateFrustumPlanes(_cam);

            int carVisible = 0;
            foreach (Renderer r in _player.GetComponentsInChildren<Renderer>())
                if (r.enabled && GeometryUtility.TestPlanesAABB(planes, r.bounds)) carVisible++;
            Assert.GreaterOrEqual(carVisible, 6, "car body + wheels inside the camera view");

            int roadVisible = 0;
            foreach (RoadSegment s in Object.FindObjectsOfType<RoadSegment>())
                foreach (Renderer r in s.GetComponentsInChildren<Renderer>())
                    if (GeometryUtility.TestPlanesAABB(planes, r.bounds)) roadVisible++;
            Assert.Greater(roadVisible, 20, "road segments and buildings inside the camera view");

            int obstaclesVisible = 0;
            foreach (Obstacle o in _game.Spawner.Active)
                foreach (Renderer r in o.GetComponentsInChildren<Renderer>())
                    if (GeometryUtility.TestPlanesAABB(planes, r.bounds)) { obstaclesVisible++; break; }
            Assert.Greater(obstaclesVisible, 0, "spawned obstacles inside the camera view");

            Vector3 vp = _cam.WorldToViewportPoint(_player.Position + Vector3.up * 0.6f);
            Assert.That(vp.x, Is.InRange(0.3f, 0.7f), "car horizontally centred");
            Assert.That(vp.y, Is.InRange(0.05f, 0.6f), "car in the lower part of the screen");
            Assert.Greater(vp.z, 0f);

            Assert.AreEqual(1, Object.FindObjectsOfType<UnityEngine.EventSystems.EventSystem>().Length);
            Canvas canvas = Object.FindObjectOfType<Canvas>();
            Assert.IsNotNull(canvas);
            Assert.AreEqual(RenderMode.ScreenSpaceOverlay, canvas.renderMode);
            yield return new WaitForSecondsRealtime(0.3f);
            Assert.Greater(GameObject.Find("HUDPanel").GetComponent<CanvasGroup>().alpha, 0.9f);
        }

        [UnityTest]
        [Timeout(60000)]
        public IEnumerator CaptureScreenshots()
        {
            if (SystemInfo.graphicsDeviceType == GraphicsDeviceType.Null)
            {
                Assert.Ignore("No graphics device (-nographics): screenshots skipped.");
            }

            string dir = Path.GetFullPath(Path.Combine(Application.dataPath, "..", "Builds", "Screenshots"));
            Directory.CreateDirectory(dir);

            yield return new WaitForSecondsRealtime(0.6f);
            yield return Shot(dir, "1_menu.png");

            _game.StartRun();
            float t = Time.realtimeSinceStartup;
            while (Time.realtimeSinceStartup - t < 3f) { Steer(26f); yield return null; }
            yield return Shot(dir, "2_gameplay.png");

            _game.Pause();
            yield return new WaitForSecondsRealtime(0.5f);
            yield return Shot(dir, "3_pause.png");
            _game.Resume();

            _game.Spawner.SpawnAt(_player.Lane, _player.Position.z + 8f, 1);
            float end = Time.realtimeSinceStartup + 3f;
            while (_game.State != GameState.GameOver && Time.realtimeSinceStartup < end) yield return null;
            yield return new WaitForSecondsRealtime(0.6f);
            yield return Shot(dir, "4_game_over.png");

            Assert.IsTrue(File.Exists(Path.Combine(dir, "2_gameplay.png")));
            Debug.Log("[NeonRush] Screenshots written to " + dir + " (graphics: " + SystemInfo.graphicsDeviceName + ")");
        }

        private static IEnumerator Shot(string dir, string file)
        {
            yield return new WaitForEndOfFrame();
            Texture2D tex = ScreenCapture.CaptureScreenshotAsTexture();
            File.WriteAllBytes(Path.Combine(dir, file), tex.EncodeToPNG());
            Object.Destroy(tex);
        }
    }
}
