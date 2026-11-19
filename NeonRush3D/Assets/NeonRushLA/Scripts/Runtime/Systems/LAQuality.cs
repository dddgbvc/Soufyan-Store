using NeonRush;
using NeonRushLA.City;
using NeonRushLA.People;
using NeonRushLA.Traffic;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace NeonRushLA
{
    public enum LAQualityMode
    {
        Performance = 0,
        Balanced = 1,
        Quality = 2
    }

    /// <summary>
    /// Frame pacing and the three quality modes. Target FPS = display refresh (120 on ProMotion),
    /// capped by Low Power Mode / critical thermal state. Each mode sets render scale, MSAA,
    /// shadows, post FX, view distance, LOD bias and crowd/traffic density. Dynamic resolution
    /// and thermal back-off run on top. Also day/night lighting.
    /// </summary>
    public sealed class LAQuality : MonoBehaviour
    {
        [SerializeField] private UniversalRenderPipelineAsset pipeline;
        [SerializeField] private Camera cam;
        [SerializeField] private Light sun;
        [SerializeField] private Volume postFx;
        [SerializeField] private Material skybox;
        [SerializeField] private MaterialLibrary library;

        private ChunkStreamer _streamer;
        private TrafficManager _traffic;
        private PedestrianManager _peds;
        private UniversalAdditionalCameraData _camData;
        private LAQualityMode _mode = LAQualityMode.Balanced;
        private float _baseScale = 0.85f;
        private float _dyn = 1f;
        private float _accum;
        private int _frames;
        private float _worst;
        private float _policyTimer;
        private float _cooldown;
        private float _stable;
        private float _origScale = -1f, _origShadow = -1f;
        private int _origMsaa = -1;
        private bool _night;

        public float Fps { get; private set; }
        public float AvgMs { get; private set; }
        public float WorstMs { get; private set; }
        public int TargetFps { get; private set; }
        public float DisplayHz { get; private set; }
        public int Thermal { get; private set; }
        public float RenderScale { get; private set; } = 1f;
        public LAQualityMode Mode => _mode;
        public bool Night => _night;
        public event System.Action StatsUpdated;

        public void Configure(UniversalRenderPipelineAsset asset, Camera c, Light light, Volume volume, Material sky, MaterialLibrary lib)
        {
            pipeline = asset;
            cam = c;
            sun = light;
            postFx = volume;
            skybox = sky;
            library = lib;
        }

        public void Init(ChunkStreamer streamer, TrafficManager traffic, PedestrianManager peds)
        {
            _streamer = streamer;
            _traffic = traffic;
            _peds = peds;
            QualitySettings.vSyncCount = 0;
            if (pipeline != null)
            {
                _origScale = pipeline.renderScale;
                _origMsaa = pipeline.msaaSampleCount;
                _origShadow = pipeline.shadowDistance;
            }

            if (cam != null) _camData = cam.GetUniversalAdditionalCameraData();
            EvaluateFrameRate();
        }

        public static LAQualityMode DefaultForDevice()
        {
            int mem = SystemInfo.systemMemorySize;
            if (mem >= 5500) return LAQualityMode.Quality;
            if (mem >= 3500) return LAQualityMode.Balanced;
            return LAQualityMode.Performance;
        }

        public void SetMode(LAQualityMode m)
        {
            _mode = m;
            _dyn = 1f;
            switch (m)
            {
                case LAQualityMode.Performance:
                    Apply(0.75f, 2, 0f, false, 300f, 0.6f, 12, 10, 150f, 380f);
                    break;
                case LAQualityMode.Balanced:
                    Apply(0.85f, 2, 45f, true, 420f, 1.0f, 22, 16, 190f, 480f);
                    break;
                default:
                    Apply(1.0f, 4, 75f, true, 520f, 1.6f, 30, 22, 230f, 600f);
                    break;
            }
        }

        private void Apply(float scale, int msaa, float shadowDist, bool post, float far, float lodBias, int peds, int cars, float detailDist, float farDist)
        {
            _baseScale = scale;
            if (pipeline != null)
            {
                pipeline.msaaSampleCount = msaa;
                pipeline.shadowDistance = Mathf.Max(0.01f, shadowDist);
            }

            if (sun != null) sun.shadows = shadowDist > 0f ? LightShadows.Soft : LightShadows.None;
            if (_camData != null) _camData.renderPostProcessing = post;
            if (cam != null) cam.farClipPlane = far;
            RenderSettings.fogEndDistance = far * 0.92f;
            RenderSettings.fogStartDistance = far * 0.35f;
            QualitySettings.lodBias = lodBias;
            if (_peds != null) _peds.MaxPeople = peds;
            if (_traffic != null) _traffic.MaxCars = cars;
            if (_streamer != null)
            {
                _streamer.DetailDistance = detailDist;
                _streamer.FarDistance = farDist;
                _streamer.Refresh();
            }

            ApplyScale();
        }

        private void ApplyScale()
        {
            RenderScale = Mathf.Clamp(_baseScale * _dyn * FrameRatePolicy.ThermalScale(Thermal), 0.5f, 1f);
            if (pipeline != null && Mathf.Abs(pipeline.renderScale - RenderScale) > 0.001f) pipeline.renderScale = RenderScale;
        }

        public void SetNight(bool night)
        {
            _night = night;
            if (sun != null)
            {
                sun.intensity = night ? 0.12f : 1.25f;
                sun.color = night ? new Color(0.55f, 0.62f, 0.9f) : new Color(1f, 0.72f, 0.48f);
            }

            if (skybox != null && skybox.HasProperty("_Exposure")) skybox.SetFloat("_Exposure", night ? 0.18f : 1.25f);
            RenderSettings.ambientSkyColor = night ? new Color(0.05f, 0.06f, 0.12f) : new Color(0.55f, 0.48f, 0.55f);
            RenderSettings.ambientEquatorColor = night ? new Color(0.06f, 0.05f, 0.08f) : new Color(0.62f, 0.45f, 0.36f);
            RenderSettings.ambientGroundColor = night ? new Color(0.02f, 0.02f, 0.03f) : new Color(0.2f, 0.17f, 0.15f);
            RenderSettings.fogColor = night ? new Color(0.03f, 0.035f, 0.07f) : new Color(0.78f, 0.55f, 0.45f);
            if (cam != null) cam.backgroundColor = RenderSettings.fogColor;
            SetEmission("LampHead", night ? 6f : 0.2f, new Color(1f, 0.82f, 0.55f));
            SetEmission("FacadeGlass", night ? 1.4f : 0f, new Color(1f, 0.85f, 0.6f));
            SetEmission("FacadeOffice", night ? 1.2f : 0f, new Color(1f, 0.85f, 0.6f));
            SetEmission("FacadeStucco", night ? 0.9f : 0f, new Color(1f, 0.8f, 0.55f));
            SetEmission("FacadeBrick", night ? 0.9f : 0f, new Color(1f, 0.8f, 0.55f));
            SetEmission("NeonSign", night ? 4f : 1.2f, new Color(1f, 0.25f, 0.8f));
        }

        private void SetEmission(string key, float intensity, Color color)
        {
            if (library == null || !library.Has(key)) return;
            Material m = library.Get(key);
            m.EnableKeyword("_EMISSION");
            m.SetColor("_EmissionColor", color * intensity);
        }

        private void EvaluateFrameRate()
        {
            DisplayHz = PerformanceManager.ReadDisplayHz();
            Thermal = DeviceThermal.ThermalState;
            int t = FrameRatePolicy.ComputeTarget(DisplayHz, DeviceThermal.LowPowerMode, Thermal);
            if (t != TargetFps)
            {
                TargetFps = t;
                Application.targetFrameRate = t;
            }

            if (_camData != null && _mode != LAQualityMode.Performance) _camData.renderPostProcessing = FrameRatePolicy.AllowPostProcessing(Thermal);
            ApplyScale();
        }

        private void Update()
        {
            float udt = Time.unscaledDeltaTime;
            _frames++;
            _accum += udt;
            _worst = Mathf.Max(_worst, udt);
            _policyTimer += udt;
            if (_policyTimer > 2f)
            {
                _policyTimer = 0f;
                EvaluateFrameRate();
            }

            if (_accum < 0.5f) return;
            Fps = _frames / _accum;
            AvgMs = _accum * 1000f / _frames;
            WorstMs = _worst * 1000f;
            float budget = FrameRatePolicy.TargetFrameMs(TargetFps);
            _cooldown -= _accum;
            if (AvgMs > budget * 1.25f && _cooldown <= 0f && _dyn > 0.7f)
            {
                _dyn = Mathf.Max(0.7f, _dyn - 0.1f);
                _cooldown = 3f;
                _stable = 0f;
                ApplyScale();
            }
            else if (AvgMs < budget * 1.08f)
            {
                _stable += _accum;
                if (_stable > 10f && _dyn < 1f && _cooldown <= 0f)
                {
                    _dyn = Mathf.Min(1f, _dyn + 0.05f);
                    _stable = 0f;
                    _cooldown = 3f;
                    ApplyScale();
                }
            }

            _frames = 0;
            _accum = 0f;
            _worst = 0f;
            StatsUpdated?.Invoke();
        }

        private void OnDestroy()
        {
#if UNITY_EDITOR
            if (pipeline != null && _origScale > 0f)
            {
                pipeline.renderScale = _origScale;
                pipeline.msaaSampleCount = _origMsaa;
                pipeline.shadowDistance = _origShadow;
            }

            SetNight(false);
#endif
        }
    }
}
