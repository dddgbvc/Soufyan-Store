using System;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace NeonRush
{
    /// <summary>
    /// Frame pacing + adaptive quality.
    /// • Target FPS = the display's real refresh rate (120 on ProMotion, 60 otherwise), capped
    ///   by Low Power Mode / critical thermal state. vSyncCount = 0 so targetFrameRate rules.
    /// • Measures real FPS, average and worst frame time (unscaled) every 0.5 s.
    /// • Dynamic resolution: lowers URP render scale when frames run long, restores it when
    ///   stable. Thermal state (iOS) lowers scale further and drops bloom before the OS throttles.
    /// </summary>
    public sealed class PerformanceManager : MonoBehaviour
    {
        [SerializeField] private UniversalRenderPipelineAsset pipelineAsset;
        [SerializeField] private Camera mainCamera;
        [SerializeField] private GameManager game;
        [SerializeField] private bool dynamicResolution = true;
        [SerializeField] private float minDynamicScale = 0.7f;
        [SerializeField] private float sampleWindow = 0.5f;
        [SerializeField] private float policyInterval = 2f;

        private UniversalAdditionalCameraData _cameraData;
        private float _tierScale = 1f;
        private bool _tierPost = true;
        private float _dynScale = 1f;
        private float _originalRenderScale = -1f;

        private int _frames;
        private float _accum;
        private float _worst;
        private float _policyTimer;
        private float _cooldown;
        private float _stableTime;
        private bool _initialized;
        private bool _swappedPipeline;
        private RenderPipelineAsset _previousPipeline;

        public event Action StatsUpdated;

        public float Fps { get; private set; }
        public float AvgFrameMs { get; private set; }
        public float WorstFrameMs { get; private set; }
        public int TargetFps { get; private set; }
        public float DisplayHz { get; private set; }
        public int ThermalState { get; private set; }
        public bool LowPowerMode { get; private set; }
        public float DynamicScale => _dynScale;
        public float AppliedRenderScale { get; private set; } = 1f;
        public bool PostProcessingActive { get; private set; }

        public void Init()
        {
            if (_initialized) return;
            _initialized = true;

            QualitySettings.vSyncCount = 0;
            if (pipelineAsset != null)
            {
                _originalRenderScale = pipelineAsset.renderScale;
                // The project also hosts the LA scene with its own pipeline asset: make sure this
                // scene renders with (and tunes) its own asset.
                if (GraphicsSettings.currentRenderPipeline != pipelineAsset)
                {
                    _previousPipeline = QualitySettings.renderPipeline;
                    QualitySettings.renderPipeline = pipelineAsset;
                    _swappedPipeline = true;
                }
            }

            if (mainCamera != null)
            {
                _cameraData = mainCamera.GetUniversalAdditionalCameraData();
            }

            EvaluatePolicy(true);
        }

        public void SetTierGraphics(float renderScale, bool postProcessing)
        {
            _tierScale = Mathf.Clamp(renderScale, 0.5f, 1f);
            _tierPost = postProcessing;
            _dynScale = 1f;
            ApplyGraphics();
        }

        public static float ReadDisplayHz()
        {
            int nativeMax = DeviceThermal.MaxFramesPerSecond;
            if (nativeMax > 0)
            {
                return nativeMax;
            }

            double hz = Screen.currentResolution.refreshRateRatio.value;
            return hz > 1.0 ? (float)hz : 60f;
        }

        private void EvaluatePolicy(bool force)
        {
            DisplayHz = ReadDisplayHz();
            ThermalState = DeviceThermal.ThermalState;
            LowPowerMode = DeviceThermal.LowPowerMode;

            int target = FrameRatePolicy.ComputeTarget(DisplayHz, LowPowerMode, ThermalState);
            if (force || target != TargetFps)
            {
                TargetFps = target;
                Application.targetFrameRate = target;
            }

            ApplyGraphics();
        }

        private void ApplyGraphics()
        {
            float scale = Mathf.Clamp(_tierScale * _dynScale * FrameRatePolicy.ThermalScale(ThermalState), 0.5f, 1f);
            AppliedRenderScale = scale;
            if (pipelineAsset != null && Mathf.Abs(pipelineAsset.renderScale - scale) > 0.001f)
            {
                pipelineAsset.renderScale = scale;
            }

            bool post = _tierPost && FrameRatePolicy.AllowPostProcessing(ThermalState);
            PostProcessingActive = post;
            if (_cameraData != null && _cameraData.renderPostProcessing != post)
            {
                _cameraData.renderPostProcessing = post;
            }
        }

        private void Update()
        {
            if (!_initialized) return;

            float udt = Time.unscaledDeltaTime;
            _frames++;
            _accum += udt;
            if (udt > _worst) _worst = udt;

            _policyTimer += udt;
            if (_policyTimer >= policyInterval)
            {
                _policyTimer = 0f;
                EvaluatePolicy(false);
            }

            if (_accum < sampleWindow) return;

            Fps = _frames / _accum;
            AvgFrameMs = _accum * 1000f / _frames;
            WorstFrameMs = _worst * 1000f;
            UpdateDynamicResolution(_accum);
            _frames = 0;
            _accum = 0f;
            _worst = 0f;
            StatsUpdated?.Invoke();
        }

        private void UpdateDynamicResolution(float window)
        {
            if (!dynamicResolution || game == null || game.State != GameState.Playing)
            {
                _stableTime = 0f;
                return;
            }

            float targetMs = FrameRatePolicy.TargetFrameMs(TargetFps);
            _cooldown -= window;

            if (AvgFrameMs > targetMs * 1.25f)
            {
                _stableTime = 0f;
                if (_cooldown <= 0f && _dynScale > minDynamicScale)
                {
                    _dynScale = Mathf.Max(minDynamicScale, _dynScale - 0.1f);
                    _cooldown = 3f;
                    ApplyGraphics();
                }
            }
            else if (AvgFrameMs < targetMs * 1.08f)
            {
                _stableTime += window;
                if (_stableTime >= 10f && _dynScale < 1f && _cooldown <= 0f)
                {
                    _dynScale = Mathf.Min(1f, _dynScale + 0.05f);
                    _stableTime = 0f;
                    _cooldown = 3f;
                    ApplyGraphics();
                }
            }
        }

        private void OnDestroy()
        {
            if (_swappedPipeline) QualitySettings.renderPipeline = _previousPipeline;
#if UNITY_EDITOR
            if (pipelineAsset != null && _originalRenderScale > 0f)
            {
                pipelineAsset.renderScale = _originalRenderScale;
            }
#endif
        }
    }
}
