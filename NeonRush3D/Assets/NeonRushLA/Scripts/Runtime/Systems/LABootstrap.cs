using NeonRushLA.CameraRig;
using NeonRushLA.City;
using NeonRushLA.Gameplay;
using NeonRushLA.People;
using NeonRushLA.Traffic;
using NeonRushLA.UI;
using NeonRushLA.Vehicles;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace NeonRushLA
{
    /// <summary>
    /// Entry point of the Los Angeles free-roam scene: configures physics and rendering, builds
    /// the city, spawns the player car in the parking lot, starts traffic, pedestrians, camera,
    /// quality, game modes and UI, in that order.
    /// </summary>
    [DefaultExecutionOrder(-1000)]
    public sealed class LABootstrap : MonoBehaviour
    {
        [SerializeField] private MaterialLibrary library;
        [SerializeField] private UniversalRenderPipelineAsset pipeline;
        [SerializeField] private CityBuilder city;
        [SerializeField] private VehicleController player;
        [SerializeField] private VehicleCamera vehicleCamera;
        [SerializeField] private Camera mainCamera;
        [SerializeField] private TrafficManager traffic;
        [SerializeField] private PedestrianManager pedestrians;
        [SerializeField] private LAGame game;
        [SerializeField] private LAQuality quality;
        [SerializeField] private LAUI ui;
        [SerializeField] private FxPool fx;
        [SerializeField] private ReflectionProbe reflectionProbe;

        private RenderPipelineAsset _previousPipeline;
        private bool _swapped;

        public static LABootstrap Instance { get; private set; }
        public bool IsReady { get; private set; }
        public CityBuilder City => city;
        public VehicleController Player => player;
        public TrafficManager Traffic => traffic;
        public PedestrianManager Pedestrians => pedestrians;
        public LAGame Game => game;
        public LAQuality Quality => quality;
        public VehicleCamera CameraRig => vehicleCamera;
        public LAUI UI => ui;

        public void Configure(MaterialLibrary lib, UniversalRenderPipelineAsset asset, CityBuilder c, VehicleController p, VehicleCamera vc, Camera cam,
            TrafficManager t, PedestrianManager peds, LAGame g, LAQuality q, LAUI u, FxPool f, ReflectionProbe probe)
        {
            library = lib;
            pipeline = asset;
            city = c;
            player = p;
            vehicleCamera = vc;
            mainCamera = cam;
            traffic = t;
            pedestrians = peds;
            game = g;
            quality = q;
            ui = u;
            fx = f;
            reflectionProbe = probe;
        }

        private void Awake()
        {
            Instance = this;
            Time.timeScale = 1f;
            Time.fixedDeltaTime = 1f / 60f;
            Physics.simulationMode = SimulationMode.FixedUpdate;
            Physics.autoSyncTransforms = false;
            Physics.defaultSolverIterations = 8;
            LALayers.ConfigureCollisionMatrix();
            Screen.sleepTimeout = SleepTimeout.NeverSleep;
            Input.multiTouchEnabled = true;

            if (pipeline != null && GraphicsSettings.currentRenderPipeline != pipeline)
            {
                _previousPipeline = QualitySettings.renderPipeline;
                QualitySettings.renderPipeline = pipeline;
                _swapped = true;
            }

            city.Configure(library);
            city.Build();

            Vector3 spawn = city.Layout.PlayerSpawn(out Quaternion rot);
            player.Init();
            player.ResetTo(spawn, rot);

            traffic.Init(city.Layout, player.transform);
            pedestrians.Init(city.Layout, player.transform);

            vehicleCamera.Configure(player, mainCamera);
            vehicleCamera.SetMode((CameraMode)Mathf.Clamp(LASave.CameraMode, 0, 2));
            city.Streamer.SetViewer(mainCamera.transform);

            quality.Init(city.Streamer, traffic, pedestrians);
            int q = LASave.Quality;
            quality.SetMode(q < 0 ? LAQuality.DefaultForDevice() : (LAQualityMode)q);
            quality.SetNight(LASave.Night);

            game.Init(player, city.Layout, library);
            ui.Build(player, vehicleCamera, game, quality, city.Minimap);
            ui.SetPaint(LASave.PaintIndex);

            var damage = player.GetComponent<VehicleDamage>();
            if (damage != null) damage.Impact += (speed, point) => vehicleCamera.Shake(speed / 14f);

            if (reflectionProbe != null) reflectionProbe.RenderProbe();
            IsReady = true;
            Debug.Log("[NeonRushLA] City built in " + city.BuildMilliseconds.ToString("0") + " ms: " + city.ChunkCount + " chunks, " +
                      city.ColliderCount + " colliders, " + city.Data.BuildingCount + " buildings, " + city.Data.PalmCount + " palms, " +
                      city.Data.TreeCount + " trees, " + city.Data.LampCount + " lamps, " + city.Data.Signals.Count + " signal heads, " +
                      city.Layout.Lanes.Count + " lanes, " + city.Layout.WalkNodes.Count + " walk nodes.");
        }

        private void OnDestroy()
        {
            if (Instance == this) Instance = null;
            if (_swapped) QualitySettings.renderPipeline = _previousPipeline;
            Time.timeScale = 1f;
            AudioListener.pause = false;
        }
    }
}
