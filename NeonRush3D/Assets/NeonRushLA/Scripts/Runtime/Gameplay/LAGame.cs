using System;
using NeonRushLA.City;
using NeonRushLA.Geometry;
using NeonRushLA.Vehicles;
using UnityEngine;

namespace NeonRushLA.Gameplay
{
    public enum GameMode
    {
        FreeRoam,
        Drift,
        TimeTrial,
        HighwaySprint
    }

    /// <summary>
    /// Free roam plus three challenges: Drift (60 s score attack), Time Trial (checkpoint loop
    /// through downtown) and Highway Sprint (west ramp → elevated freeway → east ramp).
    /// </summary>
    public sealed class LAGame : MonoBehaviour
    {
        [SerializeField] private VehicleController player;
        [SerializeField] private MaterialLibrary library;

        private CityLayout _layout;
        private Transform _gate;
        private Vector3[] _route;
        private int _checkpoint;
        private float _timer;
        private float _comboTime;
        private float _lastOdoSave;

        public GameMode Mode { get; private set; } = GameMode.FreeRoam;
        public bool Running { get; private set; }
        public float Timer => _timer;
        public float DriftScore { get; private set; }
        public float DriftMultiplier { get; private set; } = 1f;
        public bool Drifting { get; private set; }
        public int Checkpoint => _checkpoint;
        public int CheckpointCount => _route != null ? _route.Length : 0;
        public string LastResult { get; private set; } = "";
        public float Distance { get; private set; }

        public event Action<string> Message;

        public void Init(VehicleController v, CityLayout layout, MaterialLibrary lib)
        {
            player = v;
            _layout = layout;
            library = lib;
            _gate = BuildGate().transform;
            _gate.gameObject.SetActive(false);
        }

        private GameObject BuildGate()
        {
            var set = new PartSet();
            Shapes.CylinderBetween(set["Checkpoint"], new Vector3(-7f, 0f, 0f), new Vector3(-7f, 7f, 0f), 0.45f, 10, true);
            Shapes.CylinderBetween(set["Checkpoint"], new Vector3(7f, 0f, 0f), new Vector3(7f, 7f, 0f), 0.45f, 10, true);
            Shapes.Box(set["Checkpoint"], new Vector3(0f, 7f, 0f), new Vector3(14.9f, 0.5f, 0.5f));
            GameObject go = MeshUtil.CreateRenderer("CheckpointGate", transform, set, library, false, 0, out _, out _);
            return go;
        }

        public void StartMode(GameMode mode)
        {
            Mode = mode;
            Running = mode != GameMode.FreeRoam;
            _timer = 0f;
            DriftScore = 0f;
            DriftMultiplier = 1f;
            _checkpoint = 0;
            _gate.gameObject.SetActive(false);
            switch (mode)
            {
                case GameMode.FreeRoam:
                {
                    Vector3 spawn = _layout.PlayerSpawn(out Quaternion rot);
                    player.ResetTo(spawn, rot);
                    Message?.Invoke("FREE ROAM — LOS ANGELES");
                    break;
                }

                case GameMode.Drift:
                    _timer = 60f;
                    Message?.Invoke("DRIFT CHALLENGE — 60s. Hold HANDBRAKE into the corners!");
                    break;
                case GameMode.TimeTrial:
                    _route = _layout.TimeTrialRoute();
                    player.ResetTo(_route[_route.Length - 1] + new Vector3(0f, 0.6f, 0f) + Vector3.left * 30f, Quaternion.Euler(0f, 90f, 0f));
                    ShowGate();
                    Message?.Invoke("TIME TRIAL — reach the gates in order");
                    break;
                case GameMode.HighwaySprint:
                {
                    var start = new Vector3(-CityLayout.Lines[CityLayout.Lines.Length - 1] + 1.7f, 0.6f, CityLayout.FreewayZ - 40f);
                    player.ResetTo(start, Quaternion.Euler(0f, 0f, 0f));
                    _route = new[]
                    {
                        new Vector3(-CityLayout.FreewayRampEnd + 2f, 0f, CityLayout.FreewayZ - 4f),
                        new Vector3(0f, CityLayout.FreewayHeight, CityLayout.FreewayZ - 6f),
                        new Vector3(CityLayout.FreewayRampEnd - 2f, 0f, CityLayout.FreewayZ - 4f),
                    };
                    ShowGate();
                    Message?.Invoke("HIGHWAY SPRINT — up the west ramp, across the freeway, down the east ramp");
                    break;
                }
            }
        }

        private void ShowGate()
        {
            if (_route == null || _checkpoint >= _route.Length)
            {
                _gate.gameObject.SetActive(false);
                return;
            }

            Vector3 p = _route[_checkpoint];
            Vector3 next = _checkpoint + 1 < _route.Length ? _route[_checkpoint + 1] : p + Vector3.forward;
            Vector3 dir = next - p;
            dir.y = 0f;
            _gate.gameObject.SetActive(true);
            _gate.SetPositionAndRotation(p, Quaternion.LookRotation(dir.sqrMagnitude > 0.01f ? dir : Vector3.forward));
        }

        private void Update()
        {
            if (player == null) return;
            float dt = Time.deltaTime;
            Distance += player.SpeedMs * dt;
            if (Time.time - _lastOdoSave > 30f)
            {
                _lastOdoSave = Time.time;
                LASave.Odometer += Distance;
                Distance = 0f;
            }

            UpdateDrift(dt);
            if (!Running) return;
            switch (Mode)
            {
                case GameMode.Drift:
                    _timer -= dt;
                    if (_timer <= 0f) Finish();
                    break;
                case GameMode.TimeTrial:
                case GameMode.HighwaySprint:
                    _timer += dt;
                    Vector3 cp = _route[_checkpoint];
                    Vector3 d = player.transform.position - cp;
                    if (new Vector2(d.x, d.z).magnitude < 9f && Mathf.Abs(d.y) < 4f)
                    {
                        _checkpoint++;
                        if (_checkpoint >= _route.Length) Finish();
                        else
                        {
                            ShowGate();
                            Message?.Invoke("CHECKPOINT " + _checkpoint + "/" + _route.Length + "  " + _timer.ToString("0.00") + "s");
                        }
                    }

                    break;
            }
        }

        private void UpdateDrift(float dt)
        {
            float angle = player.SlipAngle;
            float speed = player.SpeedMs;
            Drifting = speed > 9f && angle > 12f && angle < 100f && player.IsGrounded;
            if (Drifting)
            {
                _comboTime += dt;
                DriftMultiplier = 1f + Mathf.Floor(_comboTime / 2f) * 0.5f;
                if (Mode == GameMode.Drift && Running) DriftScore += speed * (angle / 30f) * 10f * DriftMultiplier * dt;
            }
            else
            {
                _comboTime = Mathf.Max(0f, _comboTime - dt * 2f);
                if (_comboTime <= 0f) DriftMultiplier = 1f;
            }
        }

        private void Finish()
        {
            Running = false;
            _gate.gameObject.SetActive(false);
            switch (Mode)
            {
                case GameMode.Drift:
                    bool best = DriftScore > LASave.BestDrift;
                    if (best) LASave.BestDrift = DriftScore;
                    LastResult = "DRIFT SCORE " + Mathf.RoundToInt(DriftScore) + (best ? "  NEW BEST!" : "  BEST " + Mathf.RoundToInt(LASave.BestDrift));
                    break;
                case GameMode.TimeTrial:
                {
                    bool b = LASave.BestTimeTrial <= 0f || _timer < LASave.BestTimeTrial;
                    if (b) LASave.BestTimeTrial = _timer;
                    LastResult = "TIME TRIAL " + _timer.ToString("0.00") + "s" + (b ? "  NEW BEST!" : "  BEST " + LASave.BestTimeTrial.ToString("0.00") + "s");
                    break;
                }

                case GameMode.HighwaySprint:
                {
                    bool b = LASave.BestSprint <= 0f || _timer < LASave.BestSprint;
                    if (b) LASave.BestSprint = _timer;
                    LastResult = "HIGHWAY SPRINT " + _timer.ToString("0.00") + "s" + (b ? "  NEW BEST!" : "  BEST " + LASave.BestSprint.ToString("0.00") + "s");
                    break;
                }
            }

            LASave.Flush();
            Message?.Invoke(LastResult);
            Mode = GameMode.FreeRoam;
        }

        private void OnApplicationPause(bool paused)
        {
            if (paused)
            {
                LASave.Odometer += Distance;
                Distance = 0f;
                LASave.Flush();
            }
        }
    }
}
