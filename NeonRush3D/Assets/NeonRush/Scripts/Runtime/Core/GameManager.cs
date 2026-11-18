using System;
using UnityEngine;

namespace NeonRush
{
    /// <summary>
    /// Owns the game loop and state machine. Every gameplay system is ticked from here in a
    /// fixed order (input → move → spawn → road → collision → score), which keeps behaviour
    /// deterministic and avoids dozens of separate Update() calls.
    /// </summary>
    [DefaultExecutionOrder(-100)]
    public sealed class GameManager : MonoBehaviour
    {
        [Header("Systems")]
        [SerializeField] private PlayerController player;
        [SerializeField] private CameraController cameraController;
        [SerializeField] private RoadGenerator road;
        [SerializeField] private ObstacleSpawner spawner;
        [SerializeField] private CollisionHandler collisionHandler;
        [SerializeField] private ScoreManager score;
        [SerializeField] private AudioManager audioManager;

        [Header("Speed (m/s)")]
        [SerializeField] private float startSpeed = 20f;
        [SerializeField] private float maxSpeed = 60f;
        [Tooltip("Acceleration at the start of a run; it tapers off towards max speed.")]
        [SerializeField] private float acceleration = 0.7f;
        [SerializeField] private float menuSpeed = 9f;

        [Header("World")]
        [Tooltip("The world is re-centred every N metres to keep float precision perfect.")]
        [SerializeField] private float originShiftDistance = 1000f;

        private bool _initialized;

        public event Action<GameState> StateChanged;
        public event Action<Obstacle> Crashed;

        public GameState State { get; private set; } = GameState.Boot;
        public float Speed { get; private set; }
        public float RunTime { get; private set; }
        public int OriginShifts { get; private set; }
        public float StartSpeed => startSpeed;
        public float MaxSpeed => maxSpeed;
        public float Speed01 => Mathf.InverseLerp(0f, maxSpeed, Speed);
        public float Difficulty01 => Mathf.InverseLerp(startSpeed, maxSpeed, Speed);
        public float SpeedKmh => Speed * 3.6f;

        public PlayerController Player => player;
        public ObstacleSpawner Spawner => spawner;
        public ScoreManager Score => score;
        public RoadGenerator Road => road;

        public void Initialize()
        {
            if (_initialized)
            {
                return;
            }

            _initialized = true;
            road.Init();
            spawner.Init();
            player.LaneChanged += OnLaneChanged;
            ResetWorld();
            Speed = menuSpeed;
            SetState(GameState.Menu);
        }

        private void OnDestroy()
        {
            if (player != null)
            {
                player.LaneChanged -= OnLaneChanged;
            }

            Time.timeScale = 1f;
        }

        private void Update()
        {
            if (!_initialized)
            {
                return;
            }

            float dt = Time.deltaTime;
            switch (State)
            {
                case GameState.Menu:
                    // Attract mode: the car cruises down an empty road behind the menu.
                    Speed = Mathf.MoveTowards(Speed, menuSpeed, 30f * dt);
                    player.Tick(dt, Speed);
                    spawner.Tick(player.Position.z, false);
                    road.Tick();
                    break;

                case GameState.Playing:
                    TickPlaying(dt);
                    break;

                case GameState.GameOver:
                    player.TickVisualOnly(dt);
                    break;
            }

            if (player.Position.z > originShiftDistance)
            {
                ShiftOrigin(-originShiftDistance);
            }

            cameraController.SetSpeed01(Speed01);
            if (audioManager != null)
            {
                audioManager.SetEngine(Speed01, State == GameState.Playing || State == GameState.Menu);
            }
        }

        private void TickPlaying(float dt)
        {
            player.ReadInput();
            RunTime += dt;

            float taper = 1f - 0.65f * Difficulty01;
            Speed = Mathf.Min(maxSpeed, Speed + acceleration * taper * dt);

            float dz = Speed * dt;
            player.Tick(dt, Speed);
            score.Tick(dz);

            spawner.SetDifficulty(Difficulty01);
            spawner.Tick(player.Position.z, true);
            road.Tick();

            Obstacle hit = collisionHandler.Check();
            if (hit != null)
            {
                Crash(hit);
            }
        }

        private void ShiftOrigin(float dz)
        {
            player.ShiftWorld(dz);
            road.ShiftWorld(dz);
            spawner.ShiftWorld(dz);
            collisionHandler.ShiftWorld(dz);
            // The camera derives its Z from the car every LateUpdate, so it follows the shift
            // in the same frame without any snap.
            OriginShifts++;
        }

        // ------------------------------------------------------------------ flow

        public void StartRun()
        {
            Time.timeScale = 1f;
            ResetWorld();
            Speed = startSpeed;
            SetState(GameState.Playing);
        }

        public void Restart()
        {
            StartRun();
        }

        public void Pause()
        {
            if (State != GameState.Playing)
            {
                return;
            }

            Time.timeScale = 0f;
            SetState(GameState.Paused);
        }

        public void Resume()
        {
            if (State != GameState.Paused)
            {
                return;
            }

            Time.timeScale = 1f;
            SetState(GameState.Playing);
        }

        public void TogglePause()
        {
            if (State == GameState.Playing)
            {
                Pause();
            }
            else if (State == GameState.Paused)
            {
                Resume();
            }
        }

        public void ReturnToMenu()
        {
            Time.timeScale = 1f;
            ResetWorld();
            Speed = menuSpeed;
            SetState(GameState.Menu);
        }

        private void Crash(Obstacle obstacle)
        {
            Speed = 0f;
            player.PlayCrash();
            cameraController.Shake(1f);
            if (audioManager != null)
            {
                audioManager.PlayCrash();
            }

            score.CommitRun();
            SetState(GameState.GameOver);
            Crashed?.Invoke(obstacle);
        }

        private void ResetWorld()
        {
            spawner.Clear();
            player.ResetPlayer();
            road.ResetRoad(player.Position.z);
            spawner.ResetSpawner(player.Position.z);
            collisionHandler.ResetTracking();
            score.ResetRun();
            RunTime = 0f;
            cameraController.Snap();
        }

        private void SetState(GameState next)
        {
            if (State == next)
            {
                return;
            }

            State = next;
            if (audioManager != null)
            {
                audioManager.SetPaused(next == GameState.Paused);
            }

            StateChanged?.Invoke(next);
        }

        private void OnLaneChanged(int lane)
        {
            if (State == GameState.Playing && audioManager != null)
            {
                audioManager.PlayWhoosh();
            }
        }

        private void OnApplicationPause(bool paused)
        {
            if (paused)
            {
                if (State == GameState.Playing)
                {
                    Pause();
                }

                PlayerPrefs.Save();
            }
        }

        private void OnApplicationQuit()
        {
            PlayerPrefs.Save();
        }
    }
}
