using NUnit.Framework;
using UnityEngine;

namespace NeonRush.Tests
{
    public class FrameRatePolicyTests
    {
        [TestCase(120f, 120)]
        [TestCase(60f, 60)]
        [TestCase(59.94f, 60)]
        [TestCase(90f, 90)]
        [TestCase(144f, 120)]
        [TestCase(240f, 120)]
        [TestCase(0f, 60)]
        [TestCase(-1f, 60)]
        [TestCase(24f, 30)]
        public void TargetMatchesDisplayAndNeverExceedsIt(float hz, int expected)
        {
            int target = FrameRatePolicy.ComputeTarget(hz, false, 0);
            Assert.AreEqual(expected, target);
            if (hz >= FrameRatePolicy.MinTarget)
            {
                Assert.LessOrEqual(target, Mathf.RoundToInt(hz), "target must not exceed the display refresh rate");
            }
        }

        [Test]
        public void LowPowerModeCapsAt60()
        {
            Assert.AreEqual(60, FrameRatePolicy.ComputeTarget(120f, true, 0));
            Assert.AreEqual(60, FrameRatePolicy.ComputeTarget(60f, true, 0));
        }

        [Test]
        public void ThermalStatesDegradeGracefully()
        {
            Assert.AreEqual(120, FrameRatePolicy.ComputeTarget(120f, false, 1));
            Assert.AreEqual(120, FrameRatePolicy.ComputeTarget(120f, false, 2));
            Assert.AreEqual(60, FrameRatePolicy.ComputeTarget(120f, false, 3));

            Assert.AreEqual(1f, FrameRatePolicy.ThermalScale(0));
            Assert.AreEqual(1f, FrameRatePolicy.ThermalScale(1));
            Assert.Less(FrameRatePolicy.ThermalScale(2), 1f);
            Assert.Less(FrameRatePolicy.ThermalScale(3), FrameRatePolicy.ThermalScale(2));

            Assert.IsTrue(FrameRatePolicy.AllowPostProcessing(1));
            Assert.IsFalse(FrameRatePolicy.AllowPostProcessing(2));
        }

        [Test]
        public void FrameBudget()
        {
            Assert.AreEqual(1000f / 120f, FrameRatePolicy.TargetFrameMs(120), 0.001f);
            Assert.AreEqual(1000f / 60f, FrameRatePolicy.TargetFrameMs(60), 0.001f);
        }
    }

    public class ScoreAndSaveTests
    {
        private const string Prefix = "neonrush.edittest.";
        private LocalSaveManager _save;
        private GameObject _go;

        [SetUp]
        public void SetUp()
        {
            _save = new LocalSaveManager(Prefix);
            _save.DeleteAll();
            _go = new GameObject("ScoreTest");
        }

        [TearDown]
        public void TearDown()
        {
            _save.DeleteAll();
            Object.DestroyImmediate(_go);
        }

        [Test]
        public void MultiplierStepsEvery500MetresAndCaps()
        {
            Assert.AreEqual(1f, ScoreManager.MultiplierForDistance(0f));
            Assert.AreEqual(1f, ScoreManager.MultiplierForDistance(499f));
            Assert.AreEqual(1.25f, ScoreManager.MultiplierForDistance(500f));
            Assert.AreEqual(1.5f, ScoreManager.MultiplierForDistance(1000f));
            Assert.AreEqual(ScoreManager.MaxMultiplier, ScoreManager.MultiplierForDistance(1_000_000f));
        }

        [Test]
        public void ScoreAccumulatesWithDistance()
        {
            var score = _go.AddComponent<ScoreManager>();
            score.Init(_save);
            score.ResetRun();
            for (int i = 0; i < 100; i++) score.Tick(1f);
            Assert.AreEqual(100f, score.Distance, 0.001f);
            Assert.AreEqual(100, score.ScoreInt);
            score.Tick(0f);
            score.Tick(-5f);
            Assert.AreEqual(100f, score.Distance, 0.001f, "non-positive distance is ignored");
        }

        [Test]
        public void HighScoreIsPersistedOnlyWhenBeaten()
        {
            var score = _go.AddComponent<ScoreManager>();
            score.Init(_save);
            score.ResetRun();
            score.Tick(250f);
            Assert.IsTrue(score.CommitRun());
            Assert.AreEqual(250, _save.LoadHighScore());

            score.ResetRun();
            score.Tick(100f);
            Assert.IsFalse(score.CommitRun());
            Assert.AreEqual(250, _save.LoadHighScore());

            var fresh = new GameObject("Fresh").AddComponent<ScoreManager>();
            fresh.Init(new LocalSaveManager(Prefix));
            Assert.AreEqual(250, fresh.HighScore, "high score reloads from local storage");
            Object.DestroyImmediate(fresh.gameObject);
        }

        [Test]
        public void SettingsRoundTripAndClamp()
        {
            _save.SaveSettings(QualityTier.Low, 0.25f, 0.75f, false);
            _save.LoadSettings(out QualityTier q, out float m, out float s, out bool fps, QualityTier.High);
            Assert.AreEqual(QualityTier.Low, q);
            Assert.AreEqual(0.25f, m, 0.0001f);
            Assert.AreEqual(0.75f, s, 0.0001f);
            Assert.IsFalse(fps);
            Assert.IsTrue(_save.HasSettings);

            PlayerPrefs.SetInt(Prefix + "quality", 99);
            PlayerPrefs.SetFloat(Prefix + "music", 7f);
            _save.LoadSettings(out q, out m, out s, out fps, QualityTier.Medium);
            Assert.AreEqual(QualityTier.High, q, "out-of-range quality is clamped");
            Assert.AreEqual(1f, m, 0.0001f, "volume is clamped to 0..1");
        }

        [Test]
        public void DefaultsWhenNothingSaved()
        {
            Assert.IsFalse(_save.HasSettings);
            Assert.AreEqual(0, _save.LoadHighScore());
            _save.LoadSettings(out QualityTier q, out float m, out float s, out bool fps, QualityTier.Medium);
            Assert.AreEqual(QualityTier.Medium, q);
            Assert.IsTrue(fps);
        }
    }

    public class PoolTests
    {
        private GameObject _prefabGo;
        private Transform _parent;

        [SetUp]
        public void SetUp()
        {
            _prefabGo = GameObject.CreatePrimitive(PrimitiveType.Cube);
            _prefabGo.name = "PoolPrefab";
            _parent = new GameObject("PoolParent").transform;
        }

        [TearDown]
        public void TearDown()
        {
            Object.DestroyImmediate(_prefabGo);
            Object.DestroyImmediate(_parent.gameObject);
        }

        [Test]
        public void PrewarmCreatesInactiveInstances()
        {
            var pool = new ComponentPool<Transform>(_prefabGo.transform, _parent, 5);
            Assert.AreEqual(5, pool.CreatedCount);
            Assert.AreEqual(5, pool.FreeCount);
            Assert.AreEqual(0, pool.ActiveCount);
            Assert.AreEqual(5, _parent.childCount);
            foreach (Transform c in _parent) Assert.IsFalse(c.gameObject.activeSelf);
        }

        [Test]
        public void ReleasedInstancesAreReusedWithoutInstantiating()
        {
            var pool = new ComponentPool<Transform>(_prefabGo.transform, _parent, 2);
            for (int cycle = 0; cycle < 50; cycle++)
            {
                Transform a = pool.Get(new Vector3(cycle, 0, 0), Quaternion.identity);
                Transform b = pool.Get(Vector3.zero, Quaternion.identity);
                Assert.IsTrue(a.gameObject.activeSelf);
                Assert.AreEqual(cycle, a.position.x, 0.0001f);
                pool.Release(a);
                pool.Release(b);
            }

            Assert.AreEqual(2, pool.CreatedCount, "no extra instances after warm-up");
        }

        [Test]
        public void GrowsOnDemandAndIgnoresDoubleRelease()
        {
            var pool = new ComponentPool<Transform>(_prefabGo.transform, _parent, 1);
            Transform a = pool.Get(Vector3.zero, Quaternion.identity);
            Transform b = pool.Get(Vector3.zero, Quaternion.identity);
            Assert.AreEqual(2, pool.CreatedCount);
            Assert.IsTrue(pool.Release(a));
            Assert.IsFalse(pool.Release(a), "second release is ignored");
            Assert.AreEqual(1, pool.FreeCount);
            pool.Release(b);
            Assert.AreEqual(2, pool.FreeCount);
        }
    }

    public class LaneAndLayoutTests
    {
        [Test]
        public void LanesAreCentredAndSymmetric()
        {
            Assert.AreEqual(-2.6f, PlayerController.LaneToX(0, 2.6f), 0.0001f);
            Assert.AreEqual(0f, PlayerController.LaneToX(1, 2.6f), 0.0001f);
            Assert.AreEqual(2.6f, PlayerController.LaneToX(2, 2.6f), 0.0001f);
        }

        [Test]
        public void LaneRequestsClampToRoad()
        {
            var go = new GameObject("Car");
            var pc = go.AddComponent<PlayerController>();
            pc.ResetPlayer();
            Assert.AreEqual(1, pc.Lane);
            Assert.IsTrue(pc.RequestLane(-1));
            Assert.AreEqual(0, pc.Lane);
            Assert.IsFalse(pc.RequestLane(-1), "cannot leave the road on the left");
            Assert.IsTrue(pc.RequestLane(1));
            Assert.IsTrue(pc.RequestLane(1));
            Assert.IsFalse(pc.RequestLane(1), "cannot leave the road on the right");
            Assert.AreEqual(2, pc.Lane);
            Object.DestroyImmediate(go);
        }

        [Test]
        public void LaneChangeIsSmoothAndFramerateIndependent()
        {
            var go = new GameObject("Car");
            var pc = go.AddComponent<PlayerController>();
            pc.ResetPlayer();
            pc.RequestLane(1);

            // Same total time simulated at 30, 60 and 120 FPS must land in the same spot.
            float[] results = new float[3];
            int[] rates = { 30, 60, 120 };
            for (int r = 0; r < rates.Length; r++)
            {
                pc.ResetPlayer();
                pc.RequestLane(1);
                float dt = 1f / rates[r];
                int frames = Mathf.RoundToInt(0.1f * rates[r]);
                for (int i = 0; i < frames; i++) pc.Tick(dt, 20f);
                results[r] = pc.Position.x;
                Assert.Greater(results[r], 0.5f, "moving toward the lane");
                Assert.Less(results[r], 2.6f + 0.001f, "never overshoots");
            }

            Assert.AreEqual(results[0], results[2], 0.02f);
            Object.DestroyImmediate(go);
        }

        [Test]
        public void SafeAreaAnchors()
        {
            SafeAreaFitter.ComputeAnchors(new Rect(132, 63, 2532 - 264, 1170 - 63), 2532, 1170, out Vector2 min, out Vector2 max);
            Assert.AreEqual(132f / 2532f, min.x, 0.0001f);
            Assert.AreEqual(63f / 1170f, min.y, 0.0001f);
            Assert.AreEqual((2532f - 132f) / 2532f, max.x, 0.0001f);
            Assert.AreEqual(1f, max.y, 0.0001f);

            SafeAreaFitter.ComputeAnchors(new Rect(0, 0, 100, 100), 0, 0, out min, out max);
            Assert.AreEqual(Vector2.zero, min);
            Assert.AreEqual(Vector2.one, max);
        }

        [Test]
        public void NumberCacheReturnsSameInstance()
        {
            Assert.AreSame(NumberCache.Get(42), NumberCache.Get(42));
            Assert.AreEqual("999", NumberCache.Get(999));
            Assert.AreEqual("12345", NumberCache.Get(12345));
            Assert.AreEqual("-1", NumberCache.Get(-1));
        }

        [Test]
        public void QualityTiersScaleDown()
        {
            Assert.Greater(SettingsManager.RenderScaleFor(QualityTier.High), SettingsManager.RenderScaleFor(QualityTier.Medium));
            Assert.Greater(SettingsManager.RenderScaleFor(QualityTier.Medium), SettingsManager.RenderScaleFor(QualityTier.Low));
            Assert.AreEqual(1, SettingsManager.MsaaFor(QualityTier.Low));
            Assert.IsFalse(SettingsManager.PostFor(QualityTier.Low));
            Assert.IsTrue(SettingsManager.PostFor(QualityTier.High));
        }
    }
}
