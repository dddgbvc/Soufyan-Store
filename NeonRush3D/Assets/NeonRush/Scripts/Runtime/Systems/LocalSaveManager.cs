using UnityEngine;

namespace NeonRush
{
    /// <summary>
    /// Local, offline persistence (PlayerPrefs = NSUserDefaults on iOS). No network, no accounts.
    /// Writes are flushed explicitly at safe points (game over, settings change, app pause),
    /// never every frame.
    /// </summary>
    public sealed class LocalSaveManager
    {
        public const string DefaultPrefix = "neonrush.";

        private readonly string _kHighScore;
        private readonly string _kQuality;
        private readonly string _kMusic;
        private readonly string _kSfx;
        private readonly string _kShowFps;
        private readonly string _kHasSettings;

        public LocalSaveManager(string prefix = DefaultPrefix)
        {
            Prefix = prefix;
            _kHighScore = prefix + "highscore";
            _kQuality = prefix + "quality";
            _kMusic = prefix + "music";
            _kSfx = prefix + "sfx";
            _kShowFps = prefix + "showfps";
            _kHasSettings = prefix + "hassettings";
        }

        public string Prefix { get; }

        public int LoadHighScore()
        {
            return Mathf.Max(0, PlayerPrefs.GetInt(_kHighScore, 0));
        }

        public void SaveHighScore(int value)
        {
            PlayerPrefs.SetInt(_kHighScore, Mathf.Max(0, value));
        }

        public bool HasSettings => PlayerPrefs.GetInt(_kHasSettings, 0) == 1;

        public void LoadSettings(out QualityTier quality, out float music, out float sfx, out bool showFps, QualityTier defaultQuality)
        {
            int q = PlayerPrefs.GetInt(_kQuality, (int)defaultQuality);
            quality = (QualityTier)Mathf.Clamp(q, (int)QualityTier.Low, (int)QualityTier.High);
            music = Mathf.Clamp01(PlayerPrefs.GetFloat(_kMusic, 0.6f));
            sfx = Mathf.Clamp01(PlayerPrefs.GetFloat(_kSfx, 0.8f));
            showFps = PlayerPrefs.GetInt(_kShowFps, 1) == 1;
        }

        public void SaveSettings(QualityTier quality, float music, float sfx, bool showFps)
        {
            PlayerPrefs.SetInt(_kQuality, (int)quality);
            PlayerPrefs.SetFloat(_kMusic, Mathf.Clamp01(music));
            PlayerPrefs.SetFloat(_kSfx, Mathf.Clamp01(sfx));
            PlayerPrefs.SetInt(_kShowFps, showFps ? 1 : 0);
            PlayerPrefs.SetInt(_kHasSettings, 1);
        }

        public void Flush()
        {
            PlayerPrefs.Save();
        }

        /// <summary>Removes every key written by this instance (used by tests).</summary>
        public void DeleteAll()
        {
            PlayerPrefs.DeleteKey(_kHighScore);
            PlayerPrefs.DeleteKey(_kQuality);
            PlayerPrefs.DeleteKey(_kMusic);
            PlayerPrefs.DeleteKey(_kSfx);
            PlayerPrefs.DeleteKey(_kShowFps);
            PlayerPrefs.DeleteKey(_kHasSettings);
        }
    }
}
