using System;
using UnityEngine;
using UnityEngine.Rendering.Universal;

namespace NeonRush
{
    /// <summary>
    /// Player-facing settings: quality tier (Low/Medium/High), music + SFX volume, FPS overlay.
    /// Persisted locally; applied immediately without reloading anything.
    /// </summary>
    public sealed class SettingsManager : MonoBehaviour
    {
        [SerializeField] private PerformanceManager performance;
        [SerializeField] private AudioManager audioManager;
        [SerializeField] private UniversalRenderPipelineAsset pipelineAsset;
        [SerializeField] private ParticleSystem speedLines;
        [Tooltip("Decorative objects only shown on High (e.g. far skyline layer).")]
        [SerializeField] private GameObject[] highOnlyObjects = new GameObject[0];

        // Per-tier parameters (index = QualityTier).
        private static readonly float[] TierRenderScale = { 0.7f, 0.85f, 1f };
        private static readonly int[] TierMsaa = { 1, 2, 4 };
        private static readonly bool[] TierPost = { false, true, true };
        private static readonly bool[] TierSpeedLines = { false, true, true };

        private LocalSaveManager _save;
        private bool _dirty;
        private int _originalMsaa = -1;

        public event Action Changed;

        public QualityTier Quality { get; private set; } = QualityTier.High;
        public float MusicVolume { get; private set; } = 0.6f;
        public float SfxVolume { get; private set; } = 0.8f;
        public bool ShowFps { get; private set; } = true;

        public static float RenderScaleFor(QualityTier tier) { return TierRenderScale[(int)tier]; }
        public static int MsaaFor(QualityTier tier) { return TierMsaa[(int)tier]; }
        public static bool PostFor(QualityTier tier) { return TierPost[(int)tier]; }

        public static QualityTier DefaultTierForDevice()
        {
            int mem = SystemInfo.systemMemorySize;
            if (mem >= 3500) return QualityTier.High;
            if (mem >= 2500) return QualityTier.Medium;
            return QualityTier.Low;
        }

        public void Init(LocalSaveManager save)
        {
            _save = save;
            if (pipelineAsset != null && _originalMsaa < 0)
            {
                _originalMsaa = pipelineAsset.msaaSampleCount;
            }

            save.LoadSettings(out QualityTier q, out float music, out float sfx, out bool showFps, DefaultTierForDevice());
            Quality = q;
            MusicVolume = music;
            SfxVolume = sfx;
            ShowFps = showFps;
            Apply();
        }

        public void SetQuality(QualityTier tier)
        {
            if (Quality == tier) return;
            Quality = tier;
            MarkDirtyAndApply();
        }

        public void SetMusicVolume(float value)
        {
            value = Mathf.Clamp01(value);
            if (Mathf.Approximately(MusicVolume, value)) return;
            MusicVolume = value;
            MarkDirtyAndApply();
        }

        public void SetSfxVolume(float value)
        {
            value = Mathf.Clamp01(value);
            if (Mathf.Approximately(SfxVolume, value)) return;
            SfxVolume = value;
            MarkDirtyAndApply();
        }

        public void SetShowFps(bool value)
        {
            if (ShowFps == value) return;
            ShowFps = value;
            MarkDirtyAndApply();
        }

        /// <summary>Writes settings to disk (called when the settings screen closes / app pauses).</summary>
        public void Commit()
        {
            if (!_dirty || _save == null) return;
            _save.SaveSettings(Quality, MusicVolume, SfxVolume, ShowFps);
            _save.Flush();
            _dirty = false;
        }

        private void MarkDirtyAndApply()
        {
            _dirty = true;
            if (_save != null)
            {
                _save.SaveSettings(Quality, MusicVolume, SfxVolume, ShowFps);
            }

            Apply();
        }

        private void Apply()
        {
            int t = (int)Quality;
            if (performance != null)
            {
                performance.SetTierGraphics(TierRenderScale[t], TierPost[t]);
            }

            if (pipelineAsset != null)
            {
                pipelineAsset.msaaSampleCount = TierMsaa[t];
            }

            if (speedLines != null)
            {
                ParticleSystem.EmissionModule emission = speedLines.emission;
                emission.enabled = TierSpeedLines[t];
                if (!TierSpeedLines[t])
                {
                    speedLines.Clear();
                }
            }

            for (int i = 0; i < highOnlyObjects.Length; i++)
            {
                if (highOnlyObjects[i] != null)
                {
                    highOnlyObjects[i].SetActive(Quality == QualityTier.High);
                }
            }

            if (audioManager != null)
            {
                audioManager.SetVolumes(MusicVolume, SfxVolume);
            }

            Changed?.Invoke();
        }

        private void OnApplicationPause(bool paused)
        {
            if (paused) Commit();
        }

        private void OnDestroy()
        {
            Commit();
#if UNITY_EDITOR
            // Runtime tweaks must not leak into the pipeline asset on disk.
            if (pipelineAsset != null && _originalMsaa > 0)
            {
                pipelineAsset.msaaSampleCount = _originalMsaa;
            }
#endif
        }
    }
}
