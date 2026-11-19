using System.Collections;
using NeonRushLA.CameraRig;
using NeonRushLA.Gameplay;
using NeonRushLA.People;
using NeonRushLA.Traffic;
using NeonRushLA.Vehicles;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace NeonRushLA.Tests
{
    public sealed class EnsureLABuilt : IPrebuildSetup
    {
        public void Setup()
        {
#if UNITY_EDITOR
            System.Type t = System.Type.GetType("NeonRushLA.EditorTools.NeonRushLABuilder, NeonRushLA.Editor");
            t?.GetMethod("EnsureBuilt")?.Invoke(null, null);
#endif
        }
    }

    /// <summary>Real Unity physics / AI tests on the generated Los Angeles scene.</summary>
    [PrebuildSetup(typeof(EnsureLABuilt))]
    public class LAPlayModeTests
    {
        private LABootstrap _boot;
        private VehicleController _car;
        private VehicleInput _input;
        private float _deadline;

        /// <summary>Real-time guard so a stalled clock (timeScale 0, slow CI frames) can never hang the run.</summary>
        private bool Alive => Time.realtimeSinceStartup < _deadline;

        [UnitySetUp]
        public IEnumerator Load()
        {
            Debug.Log("[NeonRushLA] >> " + TestContext.CurrentContext.Test.Name + " (realtime " + Time.realtimeSinceStartup.ToString("0") + " s)");
            LASave.DeleteAll();
            yield return SceneManager.LoadSceneAsync("NeonRushLA", LoadSceneMode.Single);
            yield return null;
            _boot = LABootstrap.Instance;
            Assert.IsNotNull(_boot, "LABootstrap");
            _car = _boot.Player;
            _input = _car.GetComponent<VehicleInput>();
            _deadline = Time.realtimeSinceStartup + 150f;
        }

        [UnityTearDown]
        public IEnumerator Cleanup()
        {
            Debug.Log("[NeonRushLA] << " + TestContext.CurrentContext.Test.Name + " " + TestContext.CurrentContext.Result.Outcome + " (realtime " + Time.realtimeSinceStartup.ToString("0") + " s)");
            Time.timeScale = 1f;
            LASave.DeleteAll();
            yield return null;
        }

        private void QuietWorld()
        {
            _boot.Traffic.MaxCars = 0;
            _boot.Traffic.Clear();
            _boot.Pedestrians.MaxPeople = 0;
        }

        /// <summary>Eastbound on the 6-lane boulevard z = -130 (right-hand traffic).</summary>
        private void PlaceOnBoulevard(float x = -330f)
        {
            _car.ResetTo(new Vector3(x, 0.6f, -134f), Quaternion.Euler(0f, 90f, 0f));
        }

        private void Drive(float throttle, float brake, float steer, bool hand)
        {
            _input.Override = true;
            _input.OverrideThrottle = throttle;
            _input.OverrideBrake = brake;
            _input.OverrideSteer = steer;
            _input.OverrideHandbrake = hand;
        }

        private IEnumerator Seconds(float s)
        {
            float end = Time.time + s;
            while ((Time.time < end) && Alive) yield return new WaitForFixedUpdate();
        }

        [UnityTest, Timeout(180000)]
        public IEnumerator CityTrafficAndPeopleBootCleanly()
        {
            Assert.IsTrue(_boot.IsReady);
            Assert.AreEqual(36, _boot.City.ChunkCount);
            Assert.Greater(_boot.City.ColliderCount, 1000);
            Assert.Greater(_boot.City.Data.BuildingCount, 150);
            Assert.Greater(_boot.City.Data.PalmCount, 200);
            Assert.Greater(_boot.City.Data.Signals.Count, 100);
            Assert.Less(_boot.City.BuildMilliseconds, 15000f);
            yield return Seconds(3f);
            Assert.Greater(_boot.Traffic.ActiveCount, 3, "traffic spawned");
            Assert.Greater(_boot.Pedestrians.ActiveCount, 3, "pedestrians spawned");
            Debug.Log("[NeonRushLA] Boot: city " + _boot.City.BuildMilliseconds.ToString("0") + " ms, traffic " + _boot.Traffic.ActiveCount + ", people " + _boot.Pedestrians.ActiveCount);
            LogAssert.NoUnexpectedReceived();
        }

        [UnityTest, Timeout(180000)]
        public IEnumerator CarRestsOnItsWheelsAndAcceleratesThroughGears()
        {
            QuietWorld();
            PlaceOnBoulevard();
            Drive(0f, 0f, 0f, false);
            yield return Seconds(1.5f);
            Assert.IsTrue(_car.IsGrounded, "wheels on the ground");
            Assert.Greater(Vector3.Dot(_car.transform.up, Vector3.up), 0.97f, "sits level");
            Assert.That(_car.transform.position.y, Is.InRange(-0.2f, 0.4f), "suspension settles on the road");

            Drive(1f, 0f, 0f, false);
            float t0 = Time.time;
            float t100 = -1f;
            while ((Time.time - t0 < 9f) && Alive)
            {
                if (t100 < 0f && _car.SpeedKmh >= 100f) t100 = Time.time - t0;
                yield return new WaitForFixedUpdate();
            }

            Debug.Log("[NeonRushLA] 0-100 km/h: " + (t100 > 0 ? t100.ToString("0.0") + " s" : "not reached") + ", 9 s speed " + _car.SpeedKmh.ToString("0") + " km/h, gear " + _car.GearLabel + ", rpm " + _car.Rpm.ToString("0"));
            Assert.Greater(_car.SpeedKmh, 110f, "accelerates hard");
            Assert.GreaterOrEqual(_car.Gear, 3, "automatic upshifts");
            Assert.Greater(Vector3.Dot(_car.transform.up, Vector3.up), 0.9f, "stays upright");
        }

        [UnityTest, Timeout(180000)]
        public IEnumerator BrakesStopTheCar()
        {
            QuietWorld();
            PlaceOnBoulevard();
            Drive(1f, 0f, 0f, false);
            float t0 = Time.time;
            while ((_car.SpeedKmh < 90f && Time.time - t0 < 10f) && Alive) yield return new WaitForFixedUpdate();
            Vector3 start = _car.transform.position;
            float v0 = _car.SpeedKmh;
            Drive(0f, 1f, 0f, false);
            float tb = Time.time;
            while ((_car.SpeedKmh > 1f && Time.time - tb < 6f) && Alive) yield return new WaitForFixedUpdate();
            float dist = (_car.transform.position - start).magnitude;
            Debug.Log("[NeonRushLA] Braking " + v0.ToString("0") + "→0 km/h in " + dist.ToString("0.0") + " m, " + (Time.time - tb).ToString("0.00") + " s");
            Assert.Less(_car.SpeedKmh, 2f);
            Assert.Less(dist, 70f);
        }

        [UnityTest, Timeout(180000)]
        public IEnumerator SteeringTurnsTheCar()
        {
            QuietWorld();
            PlaceOnBoulevard();
            Drive(0.6f, 0f, 0f, false);
            float t0 = Time.time;
            while ((_car.SpeedKmh < 40f && Time.time - t0 < 6f) && Alive) yield return new WaitForFixedUpdate();
            float yaw0 = _car.transform.eulerAngles.y;
            Drive(0.3f, 0f, 1f, false);
            yield return Seconds(2f);
            float dYaw = Mathf.DeltaAngle(yaw0, _car.transform.eulerAngles.y);
            Debug.Log("[NeonRushLA] 2 s full right lock at ~40 km/h → yaw change " + dYaw.ToString("0") + "°");
            Assert.Greater(dYaw, 30f, "turns right");
            Assert.Greater(Vector3.Dot(_car.transform.up, Vector3.up), 0.85f, "no rollover");
        }

        [UnityTest, Timeout(180000)]
        public IEnumerator HandbrakeTurnBreaksTheRearLoose()
        {
            QuietWorld();
            PlaceOnBoulevard(-360f);
            Drive(1f, 0f, 0f, false);
            float t0 = Time.time;
            while ((_car.SpeedKmh < 75f && Time.time - t0 < 8f) && Alive) yield return new WaitForFixedUpdate();
            Drive(0.4f, 0f, 1f, true);
            float maxSlip = 0f;
            float te = Time.time;
            while ((Time.time - te < 1.6f) && Alive)
            {
                maxSlip = Mathf.Max(maxSlip, _car.SlipAngle);
                yield return new WaitForFixedUpdate();
            }

            Debug.Log("[NeonRushLA] Handbrake drift: max slip angle " + maxSlip.ToString("0") + "°");
            Assert.Greater(maxSlip, 12f, "oversteer / drift");
        }

        [UnityTest, Timeout(180000)]
        public IEnumerator FlippedCarRecoversOnItsOwn()
        {
            QuietWorld();
            _car.ResetTo(new Vector3(-300f, 1.5f, -134f), Quaternion.Euler(0f, 90f, 178f));
            Drive(0f, 0f, 0f, false);
            yield return Seconds(5f);
            Assert.Greater(Vector3.Dot(_car.transform.up, Vector3.up), 0.9f, "auto reset after being upside down");
        }

        [UnityTest, Timeout(180000)]
        public IEnumerator WallImpactDamagesAndStopsTheCar()
        {
            QuietWorld();
            PlaceOnBoulevard(-360f);
            var wall = new GameObject("TestWall") { layer = LALayers.Environment };
            wall.transform.position = new Vector3(-300f, 2f, -134f);
            wall.AddComponent<BoxCollider>().size = new Vector3(1f, 4f, 24f);
            var damage = _car.GetComponent<VehicleDamage>();
            Drive(1f, 0f, 0f, false);
            float t0 = Time.time;
            float peak = 0f;
            while ((Time.time - t0 < 6f && damage.Impacts == 0) && Alive)
            {
                peak = Mathf.Max(peak, _car.SpeedKmh);
                yield return new WaitForFixedUpdate();
            }

            yield return Seconds(0.5f);
            Debug.Log("[NeonRushLA] Wall hit at " + peak.ToString("0") + " km/h → impact " + damage.LastImpactSpeed.ToString("0.0") + " m/s, damage " + damage.Damage.ToString("0") + "%, speed after " + _car.SpeedKmh.ToString("0") + " km/h");
            Assert.Greater(damage.Impacts, 0, "impact registered");
            Assert.Greater(damage.Damage, 0f);
            Assert.Less(_car.transform.position.x, -300.4f, "no tunnelling through the wall");
            Assert.Less(_car.SpeedKmh, peak * 0.6f, "loses speed on impact");
            Object.Destroy(wall);
        }

        [UnityTest, Timeout(180000)]
        public IEnumerator TrafficDrivesAndStopsAtRedLights()
        {
            _boot.Pedestrians.MaxPeople = 0;
            float t0 = Time.time;
            bool sawWaiting = false;
            float maxSpeed = 0f;
            while ((Time.time - t0 < 25f && !(sawWaiting && maxSpeed > 6f)) && Alive)
            {
                foreach (TrafficCar c in _boot.Traffic.Active)
                {
                    if (c.WaitingAtLight && c.Speed < 0.5f) sawWaiting = true;
                    maxSpeed = Mathf.Max(maxSpeed, c.Speed);
                }

                yield return new WaitForFixedUpdate();
            }

            Debug.Log("[NeonRushLA] Traffic: " + _boot.Traffic.ActiveCount + " cars, max speed " + (maxSpeed * 3.6f).ToString("0") + " km/h, stopped at red: " + sawWaiting);
            Assert.Greater(maxSpeed, 6f, "traffic moves");
            Assert.IsTrue(sawWaiting, "traffic stops at red lights");
        }

        [UnityTest, Timeout(180000)]
        public IEnumerator HittingAPedestrianTriggersRagdoll()
        {
            QuietWorld();
            PlaceOnBoulevard(-360f);
            Pedestrian ped = _boot.Pedestrians.SpawnAt(new Vector3(-320f, 0f, -134f));
            Assert.IsNotNull(ped);
            ped.transform.position = new Vector3(-320f, 0f, -134f);
            Drive(1f, 0f, 0f, false);
            float t0 = Time.time;
            while ((!ped.IsRagdoll && Time.time - t0 < 6f) && Alive) yield return new WaitForFixedUpdate();
            Assert.IsTrue(ped.IsRagdoll, "ragdoll on impact");
            yield return Seconds(0.5f);
            Assert.Greater(ped.Hips.GetComponent<Rigidbody>().velocity.magnitude + (ped.Hips.position - new Vector3(-320f, 1f, -134f)).magnitude, 0.5f, "body is thrown physically");
        }

        [UnityTest, Timeout(180000)]
        public IEnumerator CameraModesQualityAndNight()
        {
            VehicleCamera cam = _boot.CameraRig;
            for (int i = 0; i < 3; i++)
            {
                cam.Cycle();
                yield return null;
                yield return null;
            }

            Assert.AreEqual(CameraMode.Chase, cam.Mode);
            _boot.Quality.SetMode(LAQualityMode.Performance);
            yield return null;
            Assert.LessOrEqual(_boot.Quality.RenderScale, 0.76f);
            Assert.AreEqual(10, _boot.Traffic.MaxCars);
            _boot.Quality.SetMode(LAQualityMode.Quality);
            yield return null;
            Assert.AreEqual(22, _boot.Traffic.MaxCars);
            _boot.Quality.SetNight(true);
            yield return null;
            Assert.IsTrue(_boot.Quality.Night);
            _boot.Quality.SetNight(false);
            Assert.AreEqual(Application.targetFrameRate, _boot.Quality.TargetFps);
        }

        [UnityTest, Timeout(180000)]
        public IEnumerator ChallengesStartAndTrackProgress()
        {
            QuietWorld();
            _boot.Game.StartMode(GameMode.Drift);
            Assert.IsTrue(_boot.Game.Running);
            Assert.AreEqual(60f, _boot.Game.Timer, 0.01f);
            yield return Seconds(0.5f);
            Assert.Less(_boot.Game.Timer, 60f);
            _boot.Game.StartMode(GameMode.TimeTrial);
            Assert.AreEqual(6, _boot.Game.CheckpointCount);
            _boot.Game.StartMode(GameMode.HighwaySprint);
            Assert.AreEqual(3, _boot.Game.CheckpointCount);
            _boot.Game.StartMode(GameMode.FreeRoam);
            Assert.IsFalse(_boot.Game.Running);
        }

        [UnityTest, Timeout(180000)]
        public IEnumerator FreeRoamPerformanceSample()
        {
            Drive(0.7f, 0f, 0f, false);
            yield return Seconds(6f);
            Debug.Log("[NeonRushLA] Perf sample (CI, no GPU): " + _boot.Quality.Fps.ToString("0") + " FPS, avg " + _boot.Quality.AvgMs.ToString("0.0") + " ms, target " +
                      _boot.Quality.TargetFps + ", traffic " + _boot.Traffic.ActiveCount + ", people " + _boot.Pedestrians.ActiveCount + ", detail chunks " + _boot.City.Streamer.DetailVisible);
            Assert.Greater(_boot.Quality.Fps, 0f);
        }
    }
}
