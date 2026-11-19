using System.Collections;
using System.Collections.Generic;
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

        private readonly List<float> _rowZ = new List<float>(16);

        /// <summary>True when an obstacle in the lane overlaps the car's z-range [from, to] (relative to the car).</summary>
        private bool Blocked(int lane, float from, float to)
        {
            float z = _player.Position.z;
            foreach (Obstacle o in _game.Spawner.Active)
            {
                float dz = o.transform.position.z - z;
                if (o.Lane == lane && dz > from && dz < to) return true;
            }

            return false;
        }

        /// <summary>Free lanes of the obstacle row starting at relative z (rows are clustered within 2 m).</summary>
        private bool LaneFreeInRow(int lane, float rowDz)
        {
            return !Blocked(lane, rowDz - 0.5f, rowDz + 2.5f);
        }

        /// <summary>
        /// Driver that plans like a player: as soon as a row is passed it looks at the next two rows and heads
        /// for the open lane of the next row that is closest to an open lane of the row after, one lane change
        /// at a time, never moving into a lane that is occupied right next to the car.
        /// </summary>
        private void Steer()
        {
            float z = _player.Position.z;
            _rowZ.Clear();
            foreach (Obstacle o in _game.Spawner.Active)
            {
                float dz = o.transform.position.z - z;
                if (dz > 2.0f) _rowZ.Add(dz);
            }

            if (_rowZ.Count == 0) return;
            _rowZ.Sort();
            float row0 = _rowZ[0];
            float row1 = -1f;
            foreach (float r in _rowZ)
            {
                if (r > row0 + 3f)
                {
                    row1 = r;
                    break;
                }
            }

            int lane = _player.Lane;
            int target = lane;
            float bestCost = float.MaxValue;
            for (int l = 0; l < PlayerController.LaneCount; l++)
            {
                if (!LaneFreeInRow(l, row0)) continue;
                float cost = Mathf.Abs(l - lane);
                if (row1 > 0f)
                {
                    int nearest = 99;
                    for (int m = 0; m < PlayerController.LaneCount; m++)
                        if (LaneFreeInRow(m, row1)) nearest = Mathf.Min(nearest, Mathf.Abs(m - l));
                    cost += 0.5f * nearest;
                }

                if (cost < bestCost)
                {
                    bestCost = cost;
                    target = l;
                }
            }

            if (target == lane) return;
            int step = target > lane ? 1 : -1;
            if (!Blocked(lane + step, -3.4f, 3.6f)) _player.RequestLane(step);
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
                Steer();
                lastRows = _game.Spawner.RowsSpawned;
                yield return null;
            }

            LogAssert.NoUnexpectedReceived();
            float seconds = Time.realtimeSinceStartup - start;
            Debug.Log("[NeonRush] Autopilot: state=" + _game.State + " time=" + seconds.ToString("0.0") + "s distance=" +
                      _game.Score.DistanceInt + "m score=" + _game.Score.ScoreInt + " speed=" + _game.SpeedKmh.ToString("0") +
                      "km/h rows=" + lastRows + " originShifts=" + _game.OriginShifts + " fps=" + _perf.Fps.ToString("0.0") +
                      " avgMs=" + _perf.AvgFrameMs.ToString("0.00"));

            Assert.AreEqual(GameState.Playing, _game.State, "autopilot survived 25 s of generated obstacles");
            Assert.Greater(lastRows, 10, "many obstacle rows were generated and passed");
            Assert.Greater(_game.Score.Distance, 400f);
            Assert.Greater(_game.Speed, _game.StartSpeed + 5f, "speed ramped up");
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
            if (SystemInfo.graphicsDeviceType == GraphicsDeviceType.Null || Application.isBatchMode)
            {
                Assert.Ignore("No presented frames in batch mode / -nographics: screenshots skipped.");
            }

            string dir = Path.GetFullPath(Path.Combine(Application.dataPath, "..", "Builds", "Screenshots"));
            Directory.CreateDirectory(dir);

            yield return new WaitForSecondsRealtime(0.6f);
            yield return Shot(dir, "1_menu.png");

            _game.StartRun();
            float t = Time.realtimeSinceStartup;
            while (Time.realtimeSinceStartup - t < 3f) { Steer(); yield return null; }
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
