using UnityEngine;
using UnityEngine.UI;

namespace NeonRush
{
    /// <summary>
    /// All screens: Main menu, HUD, Pause, Game Over, Settings, and the FPS overlay.
    /// Screens fade/scale with unscaled time (works while paused). HUD text is refreshed at
    /// 10 Hz and only when a value changes, to keep GC pressure near zero.
    /// </summary>
    public sealed class UIManager : MonoBehaviour
    {
        [Header("Systems")]
        [SerializeField] private GameManager game;
        [SerializeField] private SettingsManager settings;
        [SerializeField] private PerformanceManager performance;
        [SerializeField] private AudioManager audioManager;

        [Header("Screens")]
        [SerializeField] private CanvasGroup menuPanel;
        [SerializeField] private CanvasGroup hudPanel;
        [SerializeField] private CanvasGroup pausePanel;
        [SerializeField] private CanvasGroup gameOverPanel;
        [SerializeField] private CanvasGroup settingsPanel;
        [SerializeField] private GameObject fpsRoot;

        [Header("Menu")]
        [SerializeField] private Text titleText;
        [SerializeField] private Text menuBestText;
        [SerializeField] private Button playButton;
        [SerializeField] private Button menuSettingsButton;

        [Header("HUD")]
        [SerializeField] private Text scoreText;
        [SerializeField] private Text distanceText;
        [SerializeField] private Text speedText;
        [SerializeField] private Text multiplierText;
        [SerializeField] private Button pauseButton;

        [Header("FPS")]
        [SerializeField] private Text fpsText;
        [SerializeField] private Text frameTimeText;

        [Header("Pause")]
        [SerializeField] private Button resumeButton;
        [SerializeField] private Button pauseRestartButton;
        [SerializeField] private Button pauseSettingsButton;
        [SerializeField] private Button pauseMenuButton;

        [Header("Game Over")]
        [SerializeField] private Text finalScoreText;
        [SerializeField] private Text finalDistanceText;
        [SerializeField] private Text finalBestText;
        [SerializeField] private GameObject newBestBadge;
        [SerializeField] private Button restartButton;
        [SerializeField] private Button gameOverMenuButton;

        [Header("Settings")]
        [SerializeField] private Button qualityLowButton;
        [SerializeField] private Button qualityMediumButton;
        [SerializeField] private Button qualityHighButton;
        [SerializeField] private Slider musicSlider;
        [SerializeField] private Slider sfxSlider;
        [SerializeField] private Toggle fpsToggle;
        [SerializeField] private Text settingsInfoText;
        [SerializeField] private Button settingsBackButton;

        [Header("Style")]
        [SerializeField] private Color accentA = new Color(0.10f, 0.95f, 1f, 1f);
        [SerializeField] private Color accentB = new Color(0.85f, 0.25f, 1f, 1f);
        [SerializeField] private Color selectedColor = new Color(0.10f, 0.95f, 1f, 0.95f);
        [SerializeField] private Color unselectedColor = new Color(0.12f, 0.10f, 0.22f, 0.9f);
        [SerializeField] private float fadeSpeed = 7f;

        private CanvasGroup[] _panels;
        private float[] _targets;
        private bool _settingsOpen;
        private bool _initialized;
        private float _hudTimer;
        private int _lastScore = -1;
        private int _lastDistance = -1;
        private int _lastSpeed = -1;
        private float _lastMultiplier = -1f;
        private bool _suppressCallbacks;

        public bool SettingsOpen => _settingsOpen;

        public void Init()
        {
            if (_initialized) return;
            _initialized = true;

            _panels = new[] { menuPanel, hudPanel, pausePanel, gameOverPanel, settingsPanel };
            _targets = new float[_panels.Length];
            for (int i = 0; i < _panels.Length; i++)
            {
                _panels[i].alpha = 0f;
                _panels[i].interactable = false;
                _panels[i].blocksRaycasts = false;
                _panels[i].gameObject.SetActive(true);
            }

            playButton.onClick.AddListener(OnPlay);
            menuSettingsButton.onClick.AddListener(OpenSettings);
            pauseButton.onClick.AddListener(OnPause);
            resumeButton.onClick.AddListener(OnResume);
            pauseRestartButton.onClick.AddListener(OnRestart);
            pauseSettingsButton.onClick.AddListener(OpenSettings);
            pauseMenuButton.onClick.AddListener(OnMenu);
            restartButton.onClick.AddListener(OnRestart);
            gameOverMenuButton.onClick.AddListener(OnMenu);
            settingsBackButton.onClick.AddListener(CloseSettings);
            qualityLowButton.onClick.AddListener(OnQualityLow);
            qualityMediumButton.onClick.AddListener(OnQualityMedium);
            qualityHighButton.onClick.AddListener(OnQualityHigh);
            musicSlider.onValueChanged.AddListener(OnMusicChanged);
            sfxSlider.onValueChanged.AddListener(OnSfxChanged);
            fpsToggle.onValueChanged.AddListener(OnFpsToggled);

            game.StateChanged += OnStateChanged;
            settings.Changed += SyncSettingsWidgets;
            performance.StatsUpdated += OnStatsUpdated;

            SyncSettingsWidgets();
            OnStateChanged(game.State);
            SnapPanels();
        }

        private void OnDestroy()
        {
            if (game != null) game.StateChanged -= OnStateChanged;
            if (settings != null) settings.Changed -= SyncSettingsWidgets;
            if (performance != null) performance.StatsUpdated -= OnStatsUpdated;
        }

        // ------------------------------------------------------------------ button handlers

        private void Click()
        {
            if (audioManager != null) audioManager.PlayClick();
        }

        public void OnPlay() { Click(); game.StartRun(); }
        public void OnPause() { Click(); game.Pause(); }
        public void OnResume() { Click(); game.Resume(); }
        public void OnRestart() { Click(); _settingsOpen = false; game.Restart(); }
        public void OnMenu() { Click(); _settingsOpen = false; game.ReturnToMenu(); }

        public void OpenSettings()
        {
            Click();
            _settingsOpen = true;
            SyncSettingsWidgets();
            RefreshTargets();
        }

        public void CloseSettings()
        {
            Click();
            _settingsOpen = false;
            settings.Commit();
            RefreshTargets();
        }

        private void OnQualityLow() { Click(); settings.SetQuality(QualityTier.Low); }
        private void OnQualityMedium() { Click(); settings.SetQuality(QualityTier.Medium); }
        private void OnQualityHigh() { Click(); settings.SetQuality(QualityTier.High); }

        private void OnMusicChanged(float v) { if (!_suppressCallbacks) settings.SetMusicVolume(v); }
        private void OnSfxChanged(float v) { if (!_suppressCallbacks) settings.SetSfxVolume(v); }
        private void OnFpsToggled(bool v) { if (!_suppressCallbacks) { Click(); settings.SetShowFps(v); } }

        // ------------------------------------------------------------------ state

        private void OnStateChanged(GameState state)
        {
            if (state == GameState.GameOver)
            {
                ScoreManager s = game.Score;
                finalScoreText.text = s.ScoreInt.ToString();
                finalDistanceText.text = s.DistanceInt.ToString() + " M";
                finalBestText.text = "BEST  " + s.HighScore.ToString();
                newBestBadge.SetActive(s.NewHighScore);
            }

            if (state == GameState.Menu)
            {
                menuBestText.text = "BEST  " + game.Score.HighScore.ToString();
            }

            if (state == GameState.Playing)
            {
                _lastScore = _lastDistance = _lastSpeed = -1;
                _lastMultiplier = -1f;
                UpdateHud();
            }

            RefreshTargets();
        }

        private void RefreshTargets()
        {
            GameState s = game.State;
            _targets[0] = s == GameState.Menu && !_settingsOpen ? 1f : 0f;
            _targets[1] = (s == GameState.Playing || s == GameState.Paused) ? 1f : 0f;
            _targets[2] = s == GameState.Paused && !_settingsOpen ? 1f : 0f;
            _targets[3] = s == GameState.GameOver && !_settingsOpen ? 1f : 0f;
            _targets[4] = _settingsOpen ? 1f : 0f;

            for (int i = 0; i < _panels.Length; i++)
            {
                bool on = _targets[i] > 0.5f;
                _panels[i].blocksRaycasts = on;
                _panels[i].interactable = on;
            }

            // HUD stays visible behind the pause menu but must not take input there.
            if (s == GameState.Paused)
            {
                hudPanel.interactable = false;
                hudPanel.blocksRaycasts = false;
            }
        }

        private void SnapPanels()
        {
            for (int i = 0; i < _panels.Length; i++)
            {
                _panels[i].alpha = _targets[i];
                _panels[i].transform.localScale = Vector3.one;
            }
        }

        private void Update()
        {
            if (!_initialized) return;

            float udt = Time.unscaledDeltaTime;
            for (int i = 0; i < _panels.Length; i++)
            {
                CanvasGroup g = _panels[i];
                float a = Mathf.MoveTowards(g.alpha, _targets[i], udt * fadeSpeed);
                if (!Mathf.Approximately(a, g.alpha))
                {
                    g.alpha = a;
                    float scale = Mathf.Lerp(0.94f, 1f, a);
                    g.transform.localScale = new Vector3(scale, scale, 1f);
                }
            }

            if (titleText != null && _targets[0] > 0.5f)
            {
                float k = 0.5f + 0.5f * Mathf.Sin(Time.unscaledTime * 2.2f);
                titleText.color = Color.Lerp(accentA, accentB, k);
            }

            HandleKeys();

            if (game.State == GameState.Playing)
            {
                _hudTimer += udt;
                if (_hudTimer >= 0.1f)
                {
                    _hudTimer = 0f;
                    UpdateHud();
                }
            }
        }

        private void HandleKeys()
        {
            if (Input.GetKeyDown(KeyCode.Escape) || Input.GetKeyDown(KeyCode.P))
            {
                if (_settingsOpen) CloseSettings();
                else if (game.State == GameState.Playing) OnPause();
                else if (game.State == GameState.Paused) OnResume();
            }

            if (Input.GetKeyDown(KeyCode.Space) || Input.GetKeyDown(KeyCode.Return))
            {
                if (_settingsOpen) return;
                if (game.State == GameState.Menu) OnPlay();
                else if (game.State == GameState.GameOver) OnRestart();
            }
        }

        private void UpdateHud()
        {
            ScoreManager s = game.Score;
            int score = s.ScoreInt;
            if (score != _lastScore)
            {
                _lastScore = score;
                scoreText.text = NumberCache.Get(score);
            }

            int dist = s.DistanceInt;
            if (dist != _lastDistance)
            {
                _lastDistance = dist;
                distanceText.text = NumberCache.Get(dist);
            }

            int kmh = Mathf.RoundToInt(game.SpeedKmh);
            if (kmh != _lastSpeed)
            {
                _lastSpeed = kmh;
                speedText.text = NumberCache.Get(kmh);
            }

            if (!Mathf.Approximately(s.Multiplier, _lastMultiplier))
            {
                _lastMultiplier = s.Multiplier;
                multiplierText.text = "x" + s.Multiplier.ToString("0.00");
            }
        }

        private void OnStatsUpdated()
        {
            bool show = settings.ShowFps;
            if (fpsRoot.activeSelf != show) fpsRoot.SetActive(show);
            if (!show) return;

            int fps = Mathf.RoundToInt(performance.Fps);
            fpsText.text = NumberCache.Get(fps);
            float ratio = performance.Fps / Mathf.Max(1, performance.TargetFps);
            fpsText.color = ratio >= 0.95f ? new Color(0.3f, 1f, 0.6f) : ratio >= 0.75f ? new Color(1f, 0.85f, 0.2f) : new Color(1f, 0.3f, 0.35f);
            frameTimeText.text = performance.AvgFrameMs.ToString("0.0") + " ms  /  " + NumberCache.Get(performance.TargetFps) + " Hz";

            if (_settingsOpen)
            {
                UpdateSettingsInfo();
            }
        }

        private void SyncSettingsWidgets()
        {
            _suppressCallbacks = true;
            musicSlider.SetValueWithoutNotify(settings.MusicVolume);
            sfxSlider.SetValueWithoutNotify(settings.SfxVolume);
            fpsToggle.SetIsOnWithoutNotify(settings.ShowFps);
            _suppressCallbacks = false;

            Paint(qualityLowButton, settings.Quality == QualityTier.Low);
            Paint(qualityMediumButton, settings.Quality == QualityTier.Medium);
            Paint(qualityHighButton, settings.Quality == QualityTier.High);

            if (fpsRoot.activeSelf != settings.ShowFps) fpsRoot.SetActive(settings.ShowFps);
            UpdateSettingsInfo();
        }

        private void UpdateSettingsInfo()
        {
            if (settingsInfoText == null) return;
            settingsInfoText.text =
                "DISPLAY " + NumberCache.Get(Mathf.RoundToInt(performance.DisplayHz)) + " Hz   •   TARGET " +
                NumberCache.Get(performance.TargetFps) + " FPS   •   RENDER " +
                NumberCache.Get(Mathf.RoundToInt(performance.AppliedRenderScale * 100f)) + "%   •   THERMAL " +
                DeviceThermal.ThermalName(performance.ThermalState);
        }

        private void Paint(Button b, bool selected)
        {
            if (b == null || b.image == null) return;
            b.image.color = selected ? selectedColor : unselectedColor;
            Text label = b.GetComponentInChildren<Text>();
            if (label != null)
            {
                label.color = selected ? new Color(0.03f, 0.02f, 0.08f) : Color.white;
            }
        }
    }
}
