using UnityEngine;

namespace NeonRush
{
    /// <summary>
    /// Single entry point. Configures the runtime (frame pacing, touch, physics, screen) and
    /// initialises every system in dependency order. Also fails loudly if a reference is missing.
    /// </summary>
    [DefaultExecutionOrder(-1000)]
    public sealed class GameBootstrap : MonoBehaviour
    {
        [SerializeField] private GameManager game;
        [SerializeField] private ScoreManager score;
        [SerializeField] private SettingsManager settings;
        [SerializeField] private PerformanceManager performance;
        [SerializeField] private AudioManager audioManager;
        [SerializeField] private UIManager ui;
        [SerializeField] private ObjectPoolManager pools;

        public static LocalSaveManager Save { get; private set; }

        /// <summary>Tests can redirect persistence to isolated keys before the scene loads.</summary>
        public static string SaveKeyPrefixOverride;

        public bool IsReady { get; private set; }

        private void Awake()
        {
            if (!Validate())
            {
                enabled = false;
                return;
            }

            ConfigureRuntime();

            Save = new LocalSaveManager(string.IsNullOrEmpty(SaveKeyPrefixOverride) ? LocalSaveManager.DefaultPrefix : SaveKeyPrefixOverride);

            performance.Init();
            audioManager.Init();
            settings.Init(Save);
            score.Init(Save);
            game.Initialize();
            ui.Init();
            IsReady = true;
        }

        private static void ConfigureRuntime()
        {
            QualitySettings.vSyncCount = 0;
            Input.multiTouchEnabled = true;
            Screen.sleepTimeout = SleepTimeout.NeverSleep;

            Screen.autorotateToPortrait = false;
            Screen.autorotateToPortraitUpsideDown = false;
            Screen.autorotateToLandscapeLeft = true;
            Screen.autorotateToLandscapeRight = true;
            Screen.orientation = ScreenOrientation.AutoRotation;

            // No rigidbodies in the game: collision uses explicit overlap queries, so the
            // physics step itself is not needed every FixedUpdate.
            Physics.simulationMode = SimulationMode.Script;
            Physics.autoSyncTransforms = false;
        }

        private bool Validate()
        {
            bool ok = true;
            ok &= Check(game, nameof(game));
            ok &= Check(score, nameof(score));
            ok &= Check(settings, nameof(settings));
            ok &= Check(performance, nameof(performance));
            ok &= Check(audioManager, nameof(audioManager));
            ok &= Check(ui, nameof(ui));
            ok &= Check(pools, nameof(pools));
            return ok;
        }

        private bool Check(Object o, string fieldName)
        {
            if (o != null) return true;
            Debug.LogError("[NeonRush] GameBootstrap is missing a reference: " + fieldName, this);
            return false;
        }
    }
}
