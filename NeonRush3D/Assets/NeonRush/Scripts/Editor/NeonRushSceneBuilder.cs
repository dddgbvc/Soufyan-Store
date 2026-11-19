using System.Collections.Generic;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;
using UnityEngine.UI;

namespace NeonRush.EditorTools
{
    /// <summary>
    /// Generates the complete NEON RUSH scene: prefabs (road segment, car, obstacles),
    /// environment, camera + post FX, all systems and the full UI, with every Inspector
    /// reference wired. Run from the NeonRush menu or in batch mode.
    /// </summary>
    public static class NeonRushSceneBuilder
    {
        public const string ScenePath = NeonRushProjectSetup.Root + "/Scenes/NeonRush.unity";
        public const string SceneName = "NeonRush";
        private const string PrefabFolder = NeonRushProjectSetup.Root + "/Prefabs";
        private const string PostFxPath = NeonRushProjectSetup.SettingsFolder + "/NeonRush_PostFX.asset";
        private const string LightingPath = NeonRushProjectSetup.SettingsFolder + "/NeonRush_Lighting.lighting";

        public const float LaneWidth = 2.6f;
        public const float SegmentLength = 20f;

        private static readonly Color FogColor = new Color(0.035f, 0.016f, 0.085f);
        private static readonly Color Cyan = new Color(0.1f, 0.95f, 1f);
        private static readonly Color Purple = new Color(0.72f, 0.25f, 1f);
        private static readonly Color Pink = new Color(1f, 0.25f, 0.6f);

        [MenuItem("NeonRush/2. Build Game Scene", priority = 2)]
        public static void BuildFromMenu()
        {
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
            {
                return;
            }

            List<string> issues = BuildAll();
            EditorUtility.DisplayDialog("NEON RUSH",
                issues.Count == 0
                    ? "Scene built and validated: no missing references.\n\n" + ScenePath + "\n\nPress Play to test."
                    : "Scene built with " + issues.Count + " validation issue(s). See Console.", "OK");
        }

        [MenuItem("NeonRush/Build Everything (Configure + Scene)", priority = 0)]
        public static void BuildEverythingFromMenu()
        {
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
            {
                return;
            }

            NeonRushProjectSetup.Configure();
            BuildFromMenu();
        }

        /// <summary>Called by tests / CI if the scene asset is not there yet.</summary>
        public static void EnsureBuilt()
        {
            if (AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath) == null)
            {
                NeonRushProjectSetup.Configure();
                BuildAll();
            }
            else
            {
                AddSceneToBuildSettings();
            }
        }

        /// <summary>Builds everything; returns validation issues (empty = OK).</summary>
        public static List<string> BuildAll()
        {
            NeonRushProjectSetup.EnsureFolders();

            // Open the new scene FIRST: NewScene(Single) unloads unreferenced assets, which would
            // invalidate prefabs/materials created before it (MissingReferenceException in CI).
            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            ConfigureEnvironment();

            UniversalRenderPipelineAsset urp = NeonRushProjectSetup.EnsurePipeline();
            NeonRushAssetFactory.Palette pal = NeonRushAssetFactory.CreatePalette();

            RoadSegment segmentPrefab = BuildRoadSegmentPrefab(pal);
            Obstacle[] obstaclePrefabs =
            {
                BuildBarrierPrefab(pal),
                BuildBlockPrefab(pal),
                BuildGatePrefab(pal),
            };
            PlayerController carPrefab = BuildCarPrefab(pal);
            VolumeProfile postFx = BuildPostFxProfile();

            // ---------------------------------------------------------------- world
            var light = new GameObject("Directional Light").AddComponent<Light>();
            light.type = LightType.Directional;
            light.color = new Color(0.62f, 0.55f, 1f);
            light.intensity = 0.7f;
            light.shadows = LightShadows.None;
            light.transform.rotation = Quaternion.Euler(32f, -28f, 0f);

            var playerGo = (GameObject)PrefabUtility.InstantiatePrefab(carPrefab.gameObject);
            playerGo.name = "Player";
            var player = playerGo.GetComponent<PlayerController>();
            player.transform.position = Vector3.zero;

            var postFxGo = new GameObject("PostFX");
            var volume = postFxGo.AddComponent<Volume>();
            volume.isGlobal = true;
            volume.sharedProfile = postFx;

            GameObject skyline = BuildSkyline(pal);

            // ---------------------------------------------------------------- camera
            var camGo = new GameObject("Main Camera") { tag = "MainCamera" };
            var cam = camGo.AddComponent<Camera>();
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = FogColor;
            cam.nearClipPlane = 0.3f;
            cam.farClipPlane = 260f;
            cam.fieldOfView = 60f;
            cam.allowHDR = true;
            cam.allowMSAA = true;
            camGo.AddComponent<AudioListener>();
            UniversalAdditionalCameraData camData = cam.GetUniversalAdditionalCameraData();
            camData.renderPostProcessing = true;
            camData.antialiasing = AntialiasingMode.None;
            camData.renderShadows = false;
            camData.requiresDepthOption = CameraOverrideOption.Off;
            camData.requiresColorOption = CameraOverrideOption.Off;
            camGo.transform.position = new Vector3(0f, 3.3f, -7.4f);

            ParticleSystem speedLines = BuildSpeedLines(camGo.transform, pal.SpeedLine);
            var camController = camGo.AddComponent<CameraController>();
            Bind(camController, "target", player);
            Bind(camController, "cam", cam);
            Bind(camController, "speedLines", speedLines);
            Bind(camController, "skyline", skyline.transform);

            // ---------------------------------------------------------------- systems
            var systems = new GameObject("GameSystems");
            var bootstrap = systems.AddComponent<GameBootstrap>();
            var game = systems.AddComponent<GameManager>();
            var score = systems.AddComponent<ScoreManager>();
            var settings = systems.AddComponent<SettingsManager>();
            var perf = systems.AddComponent<PerformanceManager>();
            var collision = systems.AddComponent<CollisionHandler>();
            var road = systems.AddComponent<RoadGenerator>();
            var spawner = systems.AddComponent<ObstacleSpawner>();

            var poolsGo = new GameObject("Pools");
            poolsGo.transform.SetParent(systems.transform, false);
            var pools = poolsGo.AddComponent<ObjectPoolManager>();

            var audioGo = new GameObject("Audio");
            audioGo.transform.SetParent(systems.transform, false);
            var audioManager = audioGo.AddComponent<AudioManager>();
            AudioSource music = audioGo.AddComponent<AudioSource>();
            AudioSource engine = audioGo.AddComponent<AudioSource>();
            AudioSource sfx = audioGo.AddComponent<AudioSource>();
            foreach (AudioSource a in new[] { music, engine, sfx })
            {
                a.playOnAwake = false;
                a.spatialBlend = 0f;
            }

            Bind(audioManager, "musicSource", music);
            Bind(audioManager, "engineSource", engine);
            Bind(audioManager, "sfxSource", sfx);

            Bind(road, "segmentPrefab", segmentPrefab);
            Bind(road, "pools", pools);
            Bind(road, "player", player);

            BindArray(spawner, "prefabs", obstaclePrefabs);
            Bind(spawner, "pools", pools);
            Bind(spawner, "player", player);

            Bind(collision, "player", player);

            Bind(perf, "pipelineAsset", urp);
            Bind(perf, "mainCamera", cam);
            Bind(perf, "game", game);

            Bind(settings, "performance", perf);
            Bind(settings, "audioManager", audioManager);
            Bind(settings, "pipelineAsset", urp);
            Bind(settings, "speedLines", speedLines);
            BindArray(settings, "highOnlyObjects", new Object[] { skyline });

            Bind(game, "player", player);
            Bind(game, "cameraController", camController);
            Bind(game, "road", road);
            Bind(game, "spawner", spawner);
            Bind(game, "collisionHandler", collision);
            Bind(game, "score", score);
            Bind(game, "audioManager", audioManager);

            // ---------------------------------------------------------------- UI
            UIManager ui = BuildUI(game, settings, perf, audioManager);

            Bind(bootstrap, "game", game);
            Bind(bootstrap, "score", score);
            Bind(bootstrap, "settings", settings);
            Bind(bootstrap, "performance", perf);
            Bind(bootstrap, "audioManager", audioManager);
            Bind(bootstrap, "ui", ui);
            Bind(bootstrap, "pools", pools);

            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene, ScenePath);
            AddSceneToBuildSettings();
            AssetDatabase.SaveAssets();

            List<string> issues = NeonRushValidator.ValidateOpenScene();
            issues.AddRange(NeonRushValidator.ValidatePrefabs(PrefabFolder));
            if (issues.Count == 0)
            {
                Debug.Log("[NeonRush] Scene built and validated: " + ScenePath + " (0 missing references).");
            }
            else
            {
                foreach (string i in issues) Debug.LogError("[NeonRush] " + i);
            }

            return issues;
        }

        public static void AddSceneToBuildSettings()
        {
            var scenes = new List<EditorBuildSettingsScene>(EditorBuildSettings.scenes);
            scenes.RemoveAll(s => s.path == ScenePath);
            scenes.Insert(0, new EditorBuildSettingsScene(ScenePath, true));
            EditorBuildSettings.scenes = scenes.ToArray();
        }

        // ------------------------------------------------------------------ environment

        private static void ConfigureEnvironment()
        {
            RenderSettings.skybox = null;
            RenderSettings.ambientMode = AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.09f, 0.07f, 0.18f);
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = FogColor;
            RenderSettings.fogStartDistance = 55f;
            RenderSettings.fogEndDistance = 235f;
            RenderSettings.defaultReflectionMode = DefaultReflectionMode.Custom;
            RenderSettings.reflectionIntensity = 0.6f;

            var lighting = AssetDatabase.LoadAssetAtPath<LightingSettings>(LightingPath);
            if (lighting == null)
            {
                lighting = new LightingSettings { name = "NeonRush_Lighting" };
                AssetDatabase.CreateAsset(lighting, LightingPath);
            }

            lighting.bakedGI = false;
            lighting.realtimeGI = false;
            lighting.autoGenerate = false;
            Lightmapping.lightingSettings = lighting;
        }

        private static VolumeProfile BuildPostFxProfile()
        {
            var profile = AssetDatabase.LoadAssetAtPath<VolumeProfile>(PostFxPath);
            if (profile == null)
            {
                profile = ScriptableObject.CreateInstance<VolumeProfile>();
                AssetDatabase.CreateAsset(profile, PostFxPath);
            }

            if (!profile.TryGet(out Bloom bloom))
            {
                bloom = profile.Add<Bloom>(true);
                AssetDatabase.AddObjectToAsset(bloom, profile);
            }

            bloom.threshold.Override(0.95f);
            bloom.intensity.Override(1.35f);
            bloom.scatter.Override(0.68f);
            bloom.highQualityFiltering.Override(false);

            if (!profile.TryGet(out Vignette vignette))
            {
                vignette = profile.Add<Vignette>(true);
                AssetDatabase.AddObjectToAsset(vignette, profile);
            }

            vignette.intensity.Override(0.3f);
            vignette.smoothness.Override(0.45f);
            vignette.color.Override(new Color(0.05f, 0f, 0.12f));

            if (!profile.TryGet(out Tonemapping tonemapping))
            {
                tonemapping = profile.Add<Tonemapping>(true);
                AssetDatabase.AddObjectToAsset(tonemapping, profile);
            }

            tonemapping.mode.Override(TonemappingMode.Neutral);

            EditorUtility.SetDirty(profile);
            AssetDatabase.SaveAssets();
            return profile;
        }

        private static GameObject BuildSkyline(NeonRushAssetFactory.Palette pal)
        {
            var root = new GameObject("Skyline");
            var rng = new System.Random(42);
            for (float x = -170f; x <= 170f;)
            {
                float w = 10f + (float)rng.NextDouble() * 18f;
                float h = 25f + (float)rng.NextDouble() * 75f;
                float z = (float)rng.NextDouble() * 40f;
                if (Mathf.Abs(x) > 12f)
                {
                    NeonRushAssetFactory.Part("Tower", root.transform, PrimitiveType.Cube, new Vector3(x, h * 0.5f, z), new Vector3(w, h, 10f), pal.Skyline);
                    Material cap = rng.NextDouble() > 0.5 ? pal.NeonPurple : pal.NeonCyan;
                    NeonRushAssetFactory.Part("Cap", root.transform, PrimitiveType.Cube, new Vector3(x, h + 0.3f, z - 5.1f), new Vector3(w * 0.9f, 0.5f, 0.2f), cap);
                    if (rng.NextDouble() > 0.55)
                    {
                        NeonRushAssetFactory.Part("Stripe", root.transform, PrimitiveType.Cube, new Vector3(x, h * 0.5f, z - 5.1f), new Vector3(0.6f, h * 0.8f, 0.2f), pal.NeonPink);
                    }
                }

                x += w + 2f + (float)rng.NextDouble() * 6f;
            }

            NeonRushAssetFactory.CombineByMaterial(root.transform, "Skyline");
            root.transform.position = new Vector3(0f, 0f, 175f);
            return root;
        }

        private static ParticleSystem BuildSpeedLines(Transform cam, Material mat)
        {
            var go = new GameObject("SpeedLines");
            go.transform.SetParent(cam, false);
            go.transform.localPosition = new Vector3(0f, 0f, 38f);
            go.transform.localRotation = Quaternion.identity;

            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);

            ParticleSystem.MainModule main = ps.main;
            main.loop = true;
            main.playOnAwake = true;
            main.startLifetime = 0.45f;
            main.startSpeed = 0f;
            main.startSize = 0.07f;
            main.startColor = new Color(1f, 1f, 1f, 0.8f);
            main.maxParticles = 160;
            main.simulationSpace = ParticleSystemSimulationSpace.Local;
            main.scalingMode = ParticleSystemScalingMode.Local;

            ParticleSystem.EmissionModule emission = ps.emission;
            emission.rateOverTime = 0f;

            ParticleSystem.ShapeModule shape = ps.shape;
            shape.shapeType = ParticleSystemShapeType.Circle;
            shape.radius = 9f;
            shape.radiusThickness = 0f;
            shape.arc = 360f;

            ParticleSystem.VelocityOverLifetimeModule vel = ps.velocityOverLifetime;
            vel.enabled = true;
            vel.space = ParticleSystemSimulationSpace.Local;
            vel.x = new ParticleSystem.MinMaxCurve(0f);
            vel.y = new ParticleSystem.MinMaxCurve(0f);
            vel.z = new ParticleSystem.MinMaxCurve(-90f);

            var psr = go.GetComponent<ParticleSystemRenderer>();
            psr.renderMode = ParticleSystemRenderMode.Stretch;
            psr.velocityScale = 0.04f;
            psr.lengthScale = 2f;
            psr.sharedMaterial = mat;
            psr.shadowCastingMode = ShadowCastingMode.Off;
            psr.receiveShadows = false;
            return ps;
        }

        // ------------------------------------------------------------------ prefabs

        private static T SavePrefab<T>(GameObject go, string name) where T : Component
        {
            string path = PrefabFolder + "/" + name + ".prefab";
            GameObject prefab = PrefabUtility.SaveAsPrefabAsset(go, path);
            Object.DestroyImmediate(go);
            return prefab.GetComponent<T>();
        }

        private static RoadSegment BuildRoadSegmentPrefab(NeonRushAssetFactory.Palette pal)
        {
            var root = new GameObject("RoadSegment");
            Transform t = root.transform;
            float L = SegmentLength;
            float half = L * 0.5f;

            NeonRushAssetFactory.Part("Road", t, PrimitiveType.Cube, new Vector3(0f, -0.1f, half), new Vector3(8.6f, 0.2f, L), pal.Road);
            NeonRushAssetFactory.Part("SidewalkL", t, PrimitiveType.Cube, new Vector3(-5.65f, 0f, half), new Vector3(2.7f, 0.3f, L), pal.Sidewalk);
            NeonRushAssetFactory.Part("SidewalkR", t, PrimitiveType.Cube, new Vector3(5.65f, 0f, half), new Vector3(2.7f, 0.3f, L), pal.Sidewalk);

            foreach (float x in new[] { -LaneWidth * 0.5f, LaneWidth * 0.5f })
            {
                for (int k = 0; k < 4; k++)
                {
                    NeonRushAssetFactory.Part("Dash", t, PrimitiveType.Cube, new Vector3(x, 0.006f, 2.5f + k * 5f), new Vector3(0.1f, 0.02f, 2.6f), pal.LaneDash);
                }
            }

            NeonRushAssetFactory.Part("RailL", t, PrimitiveType.Cube, new Vector3(-4.35f, 0.2f, half), new Vector3(0.12f, 0.1f, L), pal.NeonCyan);
            NeonRushAssetFactory.Part("RailR", t, PrimitiveType.Cube, new Vector3(4.35f, 0.2f, half), new Vector3(0.12f, 0.1f, L), pal.NeonPurple);

            foreach (float side in new[] { -1f, 1f })
            {
                Material head = side < 0f ? pal.NeonCyan : pal.NeonPurple;
                NeonRushAssetFactory.Part("Pole", t, PrimitiveType.Cube, new Vector3(side * 5.0f, 3f, half), new Vector3(0.16f, 6f, 0.16f), pal.Building);
                NeonRushAssetFactory.Part("Arm", t, PrimitiveType.Cube, new Vector3(side * 4.45f, 6f, half), new Vector3(1.2f, 0.12f, 0.12f), pal.Building);
                NeonRushAssetFactory.Part("Lamp", t, PrimitiveType.Cube, new Vector3(side * 4.1f, 5.92f, half), new Vector3(0.9f, 0.06f, 0.3f), head);
            }

            NeonRushAssetFactory.CombineByMaterial(t, "RoadSegment");

            var buildings = new List<Transform>();
            var trims = new List<Transform>();
            int index = 0;
            foreach (float side in new[] { -1f, 1f })
            {
                foreach (float z in new[] { 5f, 15f })
                {
                    GameObject b = NeonRushAssetFactory.Part("Building_" + index, t, PrimitiveType.Cube, new Vector3(side * 10f, 10f, z), new Vector3(6f, 20f, 8f), pal.Building);
                    Material trimMat = (index % 2 == 0) ? pal.NeonPurple : pal.NeonCyan;
                    GameObject trim = NeonRushAssetFactory.Part("Trim_" + index, t, PrimitiveType.Cube, new Vector3(side * 6.98f, 12f, z), new Vector3(0.12f, 0.12f, 7.8f), trimMat);
                    buildings.Add(b.transform);
                    trims.Add(trim.transform);
                    index++;
                }
            }

            var seg = root.AddComponent<RoadSegment>();
            SetFloat(seg, "length", L);
            BindArray(seg, "buildings", buildings.ToArray());
            BindArray(seg, "buildingTrims", trims.ToArray());
            return SavePrefab<RoadSegment>(root, "RoadSegment");
        }

        private static GameObject ObstacleRoot(string name, string display, Vector3 center, Vector3 size)
        {
            var root = new GameObject(name);
            var box = root.AddComponent<BoxCollider>();
            box.isTrigger = true;
            box.center = center;
            box.size = size;
            var o = root.AddComponent<Obstacle>();
            SetString(o, "displayName", display);
            return root;
        }

        private static Obstacle BuildBarrierPrefab(NeonRushAssetFactory.Palette pal)
        {
            GameObject root = ObstacleRoot("Obstacle_Barrier", "Barrier", new Vector3(0f, 0.5f, 0f), new Vector3(2.2f, 1f, 0.7f));
            Transform t = root.transform;
            NeonRushAssetFactory.Part("Body", t, PrimitiveType.Cube, new Vector3(0f, 0.42f, 0f), new Vector3(2.2f, 0.84f, 0.6f), pal.ObstacleBody);
            NeonRushAssetFactory.Part("Stripe", t, PrimitiveType.Cube, new Vector3(0f, 0.55f, 0f), new Vector3(2.24f, 0.14f, 0.64f), pal.ObstacleStripe);
            NeonRushAssetFactory.Part("Top", t, PrimitiveType.Cube, new Vector3(0f, 0.87f, 0f), new Vector3(2.0f, 0.06f, 0.12f), pal.NeonPink);
            NeonRushAssetFactory.CombineByMaterial(t, "Barrier");
            return SavePrefab<Obstacle>(root, "Obstacle_Barrier");
        }

        private static Obstacle BuildBlockPrefab(NeonRushAssetFactory.Palette pal)
        {
            GameObject root = ObstacleRoot("Obstacle_Block", "Data Block", new Vector3(0f, 1.1f, 0f), new Vector3(2.0f, 2.2f, 2.0f));
            Transform t = root.transform;
            NeonRushAssetFactory.Part("Body", t, PrimitiveType.Cube, new Vector3(0f, 1.05f, 0f), new Vector3(1.9f, 2.1f, 1.9f), pal.ObstacleBody);
            NeonRushAssetFactory.Part("Band", t, PrimitiveType.Cube, new Vector3(0f, 1.5f, 0f), new Vector3(1.94f, 0.15f, 1.94f), pal.ObstacleStripe);
            foreach (float x in new[] { -0.95f, 0.95f })
            {
                foreach (float z in new[] { -0.95f, 0.95f })
                {
                    NeonRushAssetFactory.Part("Edge", t, PrimitiveType.Cube, new Vector3(x, 1.06f, z), new Vector3(0.08f, 2.12f, 0.08f), pal.NeonCyan);
                }
            }

            NeonRushAssetFactory.CombineByMaterial(t, "Block");
            return SavePrefab<Obstacle>(root, "Obstacle_Block");
        }

        private static Obstacle BuildGatePrefab(NeonRushAssetFactory.Palette pal)
        {
            GameObject root = ObstacleRoot("Obstacle_Gate", "Laser Gate", new Vector3(0f, 0.8f, 0f), new Vector3(2.2f, 1.6f, 0.5f));
            Transform t = root.transform;
            foreach (float x in new[] { -1f, 1f })
            {
                NeonRushAssetFactory.Part("Pylon", t, PrimitiveType.Cube, new Vector3(x, 0.8f, 0f), new Vector3(0.25f, 1.6f, 0.25f), pal.ObstacleBody);
            }

            foreach (float y in new[] { 0.4f, 0.8f, 1.2f })
            {
                NeonRushAssetFactory.Part("Beam", t, PrimitiveType.Cube, new Vector3(0f, y, 0f), new Vector3(2.0f, 0.08f, 0.08f), pal.NeonPurple);
            }

            NeonRushAssetFactory.Part("Cap", t, PrimitiveType.Cube, new Vector3(0f, 1.66f, 0f), new Vector3(2.3f, 0.12f, 0.3f), pal.ObstacleStripe);
            NeonRushAssetFactory.CombineByMaterial(t, "Gate");
            return SavePrefab<Obstacle>(root, "Obstacle_Gate");
        }

        private static PlayerController BuildCarPrefab(NeonRushAssetFactory.Palette pal)
        {
            var root = new GameObject("PlayerCar");
            var visual = new GameObject("Visual").transform;
            visual.SetParent(root.transform, false);

            // Body
            NeonRushAssetFactory.Part("Chassis", visual, PrimitiveType.Cube, new Vector3(0f, 0.5f, 0f), new Vector3(1.7f, 0.45f, 3.9f), pal.CarBody);
            NeonRushAssetFactory.Part("Hood", visual, PrimitiveType.Cube, new Vector3(0f, 0.76f, 1.15f), new Vector3(1.6f, 0.18f, 1.4f), pal.CarBody, new Vector3(-7f, 0f, 0f));
            NeonRushAssetFactory.Part("Rear", visual, PrimitiveType.Cube, new Vector3(0f, 0.78f, -1.35f), new Vector3(1.66f, 0.2f, 1.1f), pal.CarBody);
            NeonRushAssetFactory.Part("Cabin", visual, PrimitiveType.Cube, new Vector3(0f, 0.96f, -0.25f), new Vector3(1.36f, 0.42f, 1.65f), pal.CarGlass);
            NeonRushAssetFactory.Part("Roof", visual, PrimitiveType.Cube, new Vector3(0f, 1.19f, -0.35f), new Vector3(1.26f, 0.07f, 1.2f), pal.CarBody);
            NeonRushAssetFactory.Part("Spoiler", visual, PrimitiveType.Cube, new Vector3(0f, 1.08f, -1.82f), new Vector3(1.75f, 0.06f, 0.36f), pal.CarBody);
            foreach (float x in new[] { -0.6f, 0.6f })
            {
                NeonRushAssetFactory.Part("Strut", visual, PrimitiveType.Cube, new Vector3(x, 0.95f, -1.8f), new Vector3(0.06f, 0.22f, 0.1f), pal.CarBody);
                NeonRushAssetFactory.Part("Headlight", visual, PrimitiveType.Cube, new Vector3(x, 0.6f, 1.96f), new Vector3(0.42f, 0.1f, 0.05f), pal.Headlight);
            }

            NeonRushAssetFactory.Part("Taillight", visual, PrimitiveType.Cube, new Vector3(0f, 0.68f, -1.96f), new Vector3(1.5f, 0.08f, 0.05f), pal.Taillight);
            NeonRushAssetFactory.Part("SpoilerGlow", visual, PrimitiveType.Cube, new Vector3(0f, 1.115f, -1.99f), new Vector3(1.7f, 0.025f, 0.03f), pal.NeonCyan);
            foreach (float x in new[] { -0.86f, 0.86f })
            {
                NeonRushAssetFactory.Part("SideNeon", visual, PrimitiveType.Cube, new Vector3(x, 0.33f, 0f), new Vector3(0.04f, 0.05f, 3.4f), pal.NeonCyan);
            }

            NeonRushAssetFactory.Part("Underglow", visual, PrimitiveType.Quad, new Vector3(0f, 0.02f, 0f), new Vector3(2.1f, 4.4f, 1f), pal.Underglow, new Vector3(90f, 0f, 0f));

            // Wheels: pivot transforms (spun by PlayerController), kept separate from the combine.
            var wheels = new List<Transform>();
            foreach (float z in new[] { 1.25f, -1.25f })
            {
                foreach (float x in new[] { -0.86f, 0.86f })
                {
                    var pivot = new GameObject("Wheel").transform;
                    pivot.SetParent(visual, false);
                    pivot.localPosition = new Vector3(x, 0.36f, z);
                    NeonRushAssetFactory.Part("Tire", pivot, PrimitiveType.Cylinder, Vector3.zero, new Vector3(0.72f, 0.16f, 0.72f), pal.Tire, new Vector3(0f, 0f, 90f));
                    NeonRushAssetFactory.Part("Hub", pivot, PrimitiveType.Cylinder, Vector3.zero, new Vector3(0.4f, 0.17f, 0.4f), pal.NeonCyan, new Vector3(0f, 0f, 90f));
                    wheels.Add(pivot);
                }
            }

            NeonRushAssetFactory.CombineByMaterial(visual, "Car", new HashSet<Transform>(wheels));

            var pc = root.AddComponent<PlayerController>();
            Bind(pc, "visual", visual);
            BindArray(pc, "wheels", wheels.ToArray());
            SetFloat(pc, "laneWidth", LaneWidth);
            return SavePrefab<PlayerController>(root, "PlayerCar");
        }

        // ------------------------------------------------------------------ UI

        private static Font _font;
        private static Font UiFont => _font != null ? _font : (_font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"));

        private static UIManager BuildUI(GameManager game, SettingsManager settings, PerformanceManager perf, AudioManager audioManager)
        {
            var es = new GameObject("EventSystem");
            es.AddComponent<EventSystem>();
            es.AddComponent<StandaloneInputModule>();

            var canvasGo = new GameObject("UI", typeof(RectTransform));
            canvasGo.layer = 5;
            var canvas = canvasGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 10;
            canvas.pixelPerfect = false;
            var scaler = canvasGo.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920f, 1080f);
            scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
            scaler.matchWidthOrHeight = 1f;
            canvasGo.AddComponent<GraphicRaycaster>();

            RectTransform safe = Stretch("SafeArea", canvasGo.transform);
            safe.gameObject.AddComponent<SafeAreaFitter>();

            var ui = canvasGo.AddComponent<UIManager>();
            Bind(ui, "game", game);
            Bind(ui, "settings", settings);
            Bind(ui, "performance", perf);
            Bind(ui, "audioManager", audioManager);

            // ---------------- Menu
            CanvasGroup menu = Panel("MenuPanel", safe, new Color(0.02f, 0f, 0.06f, 0.35f));
            Text title = Label(menu.transform, "Title", "NEON RUSH", 170, Cyan, new Vector2(0f, 250f), new Vector2(1700f, 230f), FontStyle.Bold);
            Glow(title, Purple, 6f);
            Label(menu.transform, "Subtitle", "3D  •  ENDLESS NEON RUNNER", 40, new Color(0.75f, 0.8f, 1f), new Vector2(0f, 120f), new Vector2(1200f, 60f));
            Button play = MakeButton(menu.transform, "PlayButton", "PLAY", new Vector2(0f, -30f), new Vector2(540f, 140f), Cyan, 68, true);
            Button menuSettings = MakeButton(menu.transform, "SettingsButton", "SETTINGS", new Vector2(-285f, -195f), new Vector2(520f, 100f), new Color(0.2f, 0.1f, 0.38f, 0.95f), 42, false);
            Button losAngeles = MakeButton(menu.transform, "LosAngelesButton", "LOS ANGELES", new Vector2(285f, -195f), new Vector2(520f, 100f), new Color(0.85f, 0.35f, 0.1f, 0.95f), 42, false);
            Text menuBest = Label(menu.transform, "Best", "BEST  0", 44, Pink, new Vector2(0f, -310f), new Vector2(900f, 70f), FontStyle.Bold);
            Text hint = Label(menu.transform, "Hint", "SWIPE OR TAP LEFT / RIGHT     •     KEYBOARD  A / D  OR  ARROWS     •     ESC  PAUSE", 28, new Color(0.65f, 0.65f, 0.85f), Vector2.zero, new Vector2(1700f, 50f));
            Anchor(hint.rectTransform, new Vector2(0.5f, 0f), new Vector2(0f, 70f));

            Bind(ui, "menuPanel", menu);
            Bind(ui, "titleText", title);
            Bind(ui, "menuBestText", menuBest);
            Bind(ui, "playButton", play);
            Bind(ui, "menuSettingsButton", menuSettings);
            Bind(ui, "losAngelesButton", losAngeles);

            // ---------------- HUD
            CanvasGroup hud = Panel("HUDPanel", safe, new Color(0f, 0f, 0f, 0f));
            hud.GetComponent<Image>().raycastTarget = false;
            Text scoreLabel = Label(hud.transform, "ScoreLabel", "SCORE", 28, Cyan, Vector2.zero, new Vector2(400f, 40f), FontStyle.Bold);
            Anchor(scoreLabel.rectTransform, new Vector2(0.5f, 1f), new Vector2(0f, -40f));
            Text scoreValue = Label(hud.transform, "Score", "0", 96, Color.white, Vector2.zero, new Vector2(900f, 110f), FontStyle.Bold);
            Anchor(scoreValue.rectTransform, new Vector2(0.5f, 1f), new Vector2(0f, -110f));
            Glow(scoreValue, new Color(0.1f, 0.7f, 1f, 0.8f), 3f);
            Text multiplier = Label(hud.transform, "Multiplier", "x1.00", 36, Pink, Vector2.zero, new Vector2(300f, 50f), FontStyle.Bold);
            Anchor(multiplier.rectTransform, new Vector2(0.5f, 1f), new Vector2(0f, -185f));

            Button pause = MakeButton(hud.transform, "PauseButton", "II", Vector2.zero, new Vector2(110f, 110f), new Color(0.15f, 0.08f, 0.3f, 0.85f), 46, false);
            Anchor((RectTransform)pause.transform, new Vector2(0f, 1f), new Vector2(95f, -85f));

            Text distValue = Label(hud.transform, "Distance", "0", 70, Color.white, Vector2.zero, new Vector2(500f, 90f), FontStyle.Bold, TextAnchor.MiddleLeft);
            Anchor(distValue.rectTransform, new Vector2(0f, 0f), new Vector2(290f, 120f));
            Text distLabel = Label(hud.transform, "DistanceLabel", "DISTANCE  M", 28, Cyan, Vector2.zero, new Vector2(500f, 40f), FontStyle.Bold, TextAnchor.MiddleLeft);
            Anchor(distLabel.rectTransform, new Vector2(0f, 0f), new Vector2(290f, 60f));

            Text speedValue = Label(hud.transform, "Speed", "0", 80, Color.white, Vector2.zero, new Vector2(500f, 100f), FontStyle.Bold, TextAnchor.MiddleRight);
            Anchor(speedValue.rectTransform, new Vector2(1f, 0f), new Vector2(-290f, 125f));
            Glow(speedValue, new Color(0.8f, 0.2f, 1f, 0.8f), 3f);
            Text speedLabel = Label(hud.transform, "SpeedLabel", "KM/H", 30, Purple, Vector2.zero, new Vector2(500f, 40f), FontStyle.Bold, TextAnchor.MiddleRight);
            Anchor(speedLabel.rectTransform, new Vector2(1f, 0f), new Vector2(-290f, 60f));

            Bind(ui, "hudPanel", hud);
            Bind(ui, "scoreText", scoreValue);
            Bind(ui, "distanceText", distValue);
            Bind(ui, "speedText", speedValue);
            Bind(ui, "multiplierText", multiplier);
            Bind(ui, "pauseButton", pause);

            // ---------------- Pause
            CanvasGroup pausePanel = Panel("PausePanel", safe, new Color(0f, 0f, 0.03f, 0.7f));
            Text pauseTitle = Label(pausePanel.transform, "Title", "PAUSED", 110, Cyan, new Vector2(0f, 270f), new Vector2(1200f, 140f), FontStyle.Bold);
            Glow(pauseTitle, Purple, 4f);
            Button resume = MakeButton(pausePanel.transform, "ResumeButton", "RESUME", new Vector2(0f, 100f), new Vector2(540f, 110f), Cyan, 50, true);
            Button pauseRestart = MakeButton(pausePanel.transform, "RestartButton", "RESTART", new Vector2(0f, -30f), new Vector2(540f, 100f), new Color(0.2f, 0.1f, 0.38f, 0.95f), 42, false);
            Button pauseSettings = MakeButton(pausePanel.transform, "SettingsButton", "SETTINGS", new Vector2(0f, -150f), new Vector2(540f, 100f), new Color(0.2f, 0.1f, 0.38f, 0.95f), 42, false);
            Button pauseMenu = MakeButton(pausePanel.transform, "MenuButton", "MAIN MENU", new Vector2(0f, -270f), new Vector2(540f, 100f), new Color(0.2f, 0.1f, 0.38f, 0.95f), 42, false);
            Bind(ui, "pausePanel", pausePanel);
            Bind(ui, "resumeButton", resume);
            Bind(ui, "pauseRestartButton", pauseRestart);
            Bind(ui, "pauseSettingsButton", pauseSettings);
            Bind(ui, "pauseMenuButton", pauseMenu);

            // ---------------- Game over
            CanvasGroup over = Panel("GameOverPanel", safe, new Color(0.06f, 0f, 0.07f, 0.72f));
            Text overTitle = Label(over.transform, "Title", "GAME OVER", 120, Pink, new Vector2(0f, 320f), new Vector2(1400f, 150f), FontStyle.Bold);
            Glow(overTitle, Purple, 5f);
            Label(over.transform, "ScoreLabel", "SCORE", 30, Cyan, new Vector2(0f, 215f), new Vector2(400f, 40f), FontStyle.Bold);
            Text finalScore = Label(over.transform, "FinalScore", "0", 110, Color.white, new Vector2(0f, 145f), new Vector2(1000f, 130f), FontStyle.Bold);
            Glow(finalScore, new Color(0.1f, 0.7f, 1f, 0.8f), 3f);
            Text finalDistance = Label(over.transform, "FinalDistance", "0 M", 44, new Color(0.8f, 0.85f, 1f), new Vector2(0f, 55f), new Vector2(800f, 60f));
            Text finalBest = Label(over.transform, "Best", "BEST  0", 40, Purple, new Vector2(0f, -5f), new Vector2(800f, 60f), FontStyle.Bold);
            Text newBest = Label(over.transform, "NewBest", "NEW BEST!", 50, new Color(1f, 0.9f, 0.3f), new Vector2(0f, -75f), new Vector2(800f, 70f), FontStyle.Bold);
            Glow(newBest, Pink, 3f);
            Button restart = MakeButton(over.transform, "RestartButton", "RESTART", new Vector2(0f, -200f), new Vector2(540f, 125f), Cyan, 56, true);
            Button overMenu = MakeButton(over.transform, "MenuButton", "MAIN MENU", new Vector2(0f, -335f), new Vector2(540f, 100f), new Color(0.2f, 0.1f, 0.38f, 0.95f), 42, false);
            Bind(ui, "gameOverPanel", over);
            Bind(ui, "finalScoreText", finalScore);
            Bind(ui, "finalDistanceText", finalDistance);
            Bind(ui, "finalBestText", finalBest);
            Bind(ui, "newBestBadge", newBest.gameObject);
            Bind(ui, "restartButton", restart);
            Bind(ui, "gameOverMenuButton", overMenu);

            // ---------------- Settings
            CanvasGroup set = Panel("SettingsPanel", safe, new Color(0.01f, 0f, 0.04f, 0.88f));
            Text setTitle = Label(set.transform, "Title", "SETTINGS", 96, Cyan, new Vector2(0f, 380f), new Vector2(1200f, 120f), FontStyle.Bold);
            Glow(setTitle, Purple, 4f);

            RowLabel(set.transform, "GraphicsLabel", "GRAPHICS", 230f);
            Color off = new Color(0.12f, 0.1f, 0.22f, 0.9f);
            Button qLow = MakeButton(set.transform, "QualityLow", "LOW", new Vector2(-40f, 230f), new Vector2(240f, 90f), off, 38, false);
            Button qMed = MakeButton(set.transform, "QualityMedium", "MEDIUM", new Vector2(220f, 230f), new Vector2(240f, 90f), off, 38, false);
            Button qHigh = MakeButton(set.transform, "QualityHigh", "HIGH", new Vector2(480f, 230f), new Vector2(240f, 90f), off, 38, false);

            RowLabel(set.transform, "MusicLabel", "MUSIC", 100f);
            Slider musicSlider = MakeSlider(set.transform, "MusicSlider", new Vector2(220f, 100f));
            RowLabel(set.transform, "SfxLabel", "EFFECTS", -20f);
            Slider sfxSlider = MakeSlider(set.transform, "SfxSlider", new Vector2(220f, -20f));
            RowLabel(set.transform, "FpsLabel", "SHOW FPS", -140f);
            Toggle fpsToggle = MakeToggle(set.transform, "FpsToggle", new Vector2(-40f, -140f));

            Text info = Label(set.transform, "Info", "", 26, new Color(0.6f, 0.62f, 0.85f), new Vector2(0f, -250f), new Vector2(1600f, 50f));
            Button back = MakeButton(set.transform, "BackButton", "BACK", new Vector2(0f, -365f), new Vector2(440f, 100f), Cyan, 46, true);

            Bind(ui, "settingsPanel", set);
            Bind(ui, "qualityLowButton", qLow);
            Bind(ui, "qualityMediumButton", qMed);
            Bind(ui, "qualityHighButton", qHigh);
            Bind(ui, "musicSlider", musicSlider);
            Bind(ui, "sfxSlider", sfxSlider);
            Bind(ui, "fpsToggle", fpsToggle);
            Bind(ui, "settingsInfoText", info);
            Bind(ui, "settingsBackButton", back);

            // ---------------- FPS overlay (always on top, independent of screens)
            var fpsRoot = new GameObject("FPS", typeof(RectTransform), typeof(Image));
            fpsRoot.transform.SetParent(safe, false);
            var fpsRect = (RectTransform)fpsRoot.transform;
            fpsRect.anchorMin = fpsRect.anchorMax = new Vector2(1f, 1f);
            fpsRect.pivot = new Vector2(1f, 1f);
            fpsRect.anchoredPosition = new Vector2(-30f, -24f);
            fpsRect.sizeDelta = new Vector2(400f, 118f);
            var fpsBg = fpsRoot.GetComponent<Image>();
            fpsBg.color = new Color(0.03f, 0.01f, 0.08f, 0.55f);
            fpsBg.raycastTarget = false;
            fpsBg.sprite = AssetDatabase.GetBuiltinExtraResource<Sprite>("UI/Skin/UISprite.psd");
            fpsBg.type = Image.Type.Sliced;
            Text fpsValue = Label(fpsRoot.transform, "FpsValue", "0", 56, new Color(0.3f, 1f, 0.6f), new Vector2(-40f, 20f), new Vector2(300f, 70f), FontStyle.Bold, TextAnchor.MiddleRight);
            Label(fpsRoot.transform, "FpsLabel", "FPS", 26, Cyan, new Vector2(155f, 14f), new Vector2(80f, 40f), FontStyle.Bold, TextAnchor.MiddleLeft);
            Text frameTime = Label(fpsRoot.transform, "FrameTime", "0.0 ms", 26, new Color(0.75f, 0.75f, 0.95f), new Vector2(0f, -36f), new Vector2(380f, 36f), FontStyle.Normal, TextAnchor.MiddleCenter);
            Bind(ui, "fpsRoot", fpsRoot);
            Bind(ui, "fpsText", fpsValue);
            Bind(ui, "frameTimeText", frameTime);

            return ui;
        }

        private static RectTransform Stretch(string name, Transform parent)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.layer = 5;
            go.transform.SetParent(parent, false);
            var rt = (RectTransform)go.transform;
            rt.anchorMin = Vector2.zero;
            rt.anchorMax = Vector2.one;
            rt.offsetMin = Vector2.zero;
            rt.offsetMax = Vector2.zero;
            return rt;
        }

        private static CanvasGroup Panel(string name, Transform parent, Color bg)
        {
            RectTransform rt = Stretch(name, parent);
            var img = rt.gameObject.AddComponent<Image>();
            img.color = bg;
            img.raycastTarget = bg.a > 0.01f;
            return rt.gameObject.AddComponent<CanvasGroup>();
        }

        private static void Anchor(RectTransform rt, Vector2 anchor, Vector2 pos)
        {
            rt.anchorMin = rt.anchorMax = anchor;
            rt.anchoredPosition = pos;
        }

        private static Text Label(Transform parent, string name, string text, int size, Color color, Vector2 pos, Vector2 box,
            FontStyle style = FontStyle.Normal, TextAnchor align = TextAnchor.MiddleCenter)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.layer = 5;
            go.transform.SetParent(parent, false);
            var rt = (RectTransform)go.transform;
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f);
            rt.anchoredPosition = pos;
            rt.sizeDelta = box;
            var t = go.AddComponent<Text>();
            t.font = UiFont;
            t.text = text;
            t.fontSize = size;
            t.fontStyle = style;
            t.color = color;
            t.alignment = align;
            t.horizontalOverflow = HorizontalWrapMode.Overflow;
            t.verticalOverflow = VerticalWrapMode.Overflow;
            t.raycastTarget = false;
            return t;
        }

        private static void RowLabel(Transform parent, string name, string text, float y)
        {
            Label(parent, name, text, 40, new Color(0.85f, 0.85f, 1f), new Vector2(-560f, y), new Vector2(420f, 70f), FontStyle.Bold, TextAnchor.MiddleLeft);
        }

        private static void Glow(Graphic g, Color c, float distance)
        {
            var o = g.gameObject.AddComponent<Outline>();
            o.effectColor = c;
            o.effectDistance = new Vector2(distance, -distance);
            var s = g.gameObject.AddComponent<Shadow>();
            s.effectColor = new Color(c.r, c.g, c.b, c.a * 0.5f);
            s.effectDistance = new Vector2(-distance, distance);
        }

        private static Button MakeButton(Transform parent, string name, string label, Vector2 pos, Vector2 size, Color color, int fontSize, bool darkText)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.layer = 5;
            go.transform.SetParent(parent, false);
            var rt = (RectTransform)go.transform;
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f);
            rt.anchoredPosition = pos;
            rt.sizeDelta = size;

            var img = go.AddComponent<Image>();
            img.sprite = AssetDatabase.GetBuiltinExtraResource<Sprite>("UI/Skin/UISprite.psd");
            img.type = Image.Type.Sliced;
            img.color = color;
            var outline = go.AddComponent<Outline>();
            outline.effectColor = new Color(0.75f, 0.3f, 1f, 0.9f);
            outline.effectDistance = new Vector2(3f, -3f);

            var button = go.AddComponent<Button>();
            button.targetGraphic = img;
            ColorBlock cb = button.colors;
            cb.normalColor = Color.white;
            cb.highlightedColor = new Color(1f, 1f, 1f, 0.92f);
            cb.pressedColor = new Color(0.75f, 0.75f, 0.85f, 1f);
            cb.selectedColor = Color.white;
            cb.fadeDuration = 0.06f;
            button.colors = cb;
            Navigation nav = button.navigation;
            nav.mode = Navigation.Mode.None;
            button.navigation = nav;

            Text t = Label(go.transform, "Label", label, fontSize, darkText ? new Color(0.03f, 0.02f, 0.08f) : Color.white, Vector2.zero, size, FontStyle.Bold);
            var lrt = t.rectTransform;
            lrt.anchorMin = Vector2.zero;
            lrt.anchorMax = Vector2.one;
            lrt.offsetMin = lrt.offsetMax = Vector2.zero;
            return button;
        }

        private static DefaultControls.Resources UiResources()
        {
            return new DefaultControls.Resources
            {
                standard = AssetDatabase.GetBuiltinExtraResource<Sprite>("UI/Skin/UISprite.psd"),
                background = AssetDatabase.GetBuiltinExtraResource<Sprite>("UI/Skin/Background.psd"),
                knob = AssetDatabase.GetBuiltinExtraResource<Sprite>("UI/Skin/Knob.psd"),
                checkmark = AssetDatabase.GetBuiltinExtraResource<Sprite>("UI/Skin/Checkmark.psd"),
            };
        }

        private static Slider MakeSlider(Transform parent, string name, Vector2 pos)
        {
            GameObject go = DefaultControls.CreateSlider(UiResources());
            go.name = name;
            go.layer = 5;
            go.transform.SetParent(parent, false);
            var rt = (RectTransform)go.transform;
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f);
            rt.anchoredPosition = pos;
            rt.sizeDelta = new Vector2(760f, 44f);

            var slider = go.GetComponent<Slider>();
            slider.minValue = 0f;
            slider.maxValue = 1f;
            slider.value = 0.7f;
            Navigation nav = slider.navigation;
            nav.mode = Navigation.Mode.None;
            slider.navigation = nav;

            Tint(go.transform, "Background", new Color(0.12f, 0.1f, 0.25f, 1f));
            Tint(go.transform, "Fill Area/Fill", Cyan);
            Image handle = Tint(go.transform, "Handle Slide Area/Handle", Color.white);
            if (handle != null)
            {
                ((RectTransform)handle.transform).sizeDelta = new Vector2(44f, 0f);
            }

            return slider;
        }

        private static Toggle MakeToggle(Transform parent, string name, Vector2 pos)
        {
            GameObject go = DefaultControls.CreateToggle(UiResources());
            go.name = name;
            go.layer = 5;
            go.transform.SetParent(parent, false);
            var rt = (RectTransform)go.transform;
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f);
            rt.anchoredPosition = pos;
            rt.sizeDelta = new Vector2(80f, 80f);

            Transform bg = go.transform.Find("Background");
            if (bg != null)
            {
                var bgRt = (RectTransform)bg;
                bgRt.anchorMin = bgRt.anchorMax = new Vector2(0f, 0.5f);
                bgRt.pivot = new Vector2(0f, 0.5f);
                bgRt.anchoredPosition = Vector2.zero;
                bgRt.sizeDelta = new Vector2(70f, 70f);
                bg.GetComponent<Image>().color = new Color(0.12f, 0.1f, 0.25f, 1f);
                Transform check = bg.Find("Checkmark");
                if (check != null)
                {
                    var crt = (RectTransform)check;
                    crt.anchorMin = Vector2.zero;
                    crt.anchorMax = Vector2.one;
                    crt.offsetMin = new Vector2(8f, 8f);
                    crt.offsetMax = new Vector2(-8f, -8f);
                    check.GetComponent<Image>().color = Cyan;
                }
            }

            Transform label = go.transform.Find("Label");
            if (label != null)
            {
                Object.DestroyImmediate(label.gameObject);
            }

            var toggle = go.GetComponent<Toggle>();
            toggle.isOn = true;
            Navigation nav = toggle.navigation;
            nav.mode = Navigation.Mode.None;
            toggle.navigation = nav;
            return toggle;
        }

        private static Image Tint(Transform root, string path, Color c)
        {
            Transform t = root.Find(path);
            if (t == null) return null;
            var img = t.GetComponent<Image>();
            if (img != null) img.color = c;
            return img;
        }

        // ------------------------------------------------------------------ serialized wiring

        public static void Bind(Object target, string field, Object value)
        {
            var so = new SerializedObject(target);
            SerializedProperty p = so.FindProperty(field);
            if (p == null)
            {
                throw new System.InvalidOperationException("[NeonRush] Field '" + field + "' not found on " + target.GetType().Name);
            }

            p.objectReferenceValue = value;
            so.ApplyModifiedPropertiesWithoutUndo();
        }

        public static void BindArray(Object target, string field, Object[] values)
        {
            var so = new SerializedObject(target);
            SerializedProperty p = so.FindProperty(field);
            if (p == null || !p.isArray)
            {
                throw new System.InvalidOperationException("[NeonRush] Array field '" + field + "' not found on " + target.GetType().Name);
            }

            p.arraySize = values.Length;
            for (int i = 0; i < values.Length; i++)
            {
                p.GetArrayElementAtIndex(i).objectReferenceValue = values[i];
            }

            so.ApplyModifiedPropertiesWithoutUndo();
        }

        private static void SetFloat(Object target, string field, float value)
        {
            var so = new SerializedObject(target);
            SerializedProperty p = so.FindProperty(field);
            if (p == null) throw new System.InvalidOperationException("[NeonRush] Field '" + field + "' not found on " + target.GetType().Name);
            p.floatValue = value;
            so.ApplyModifiedPropertiesWithoutUndo();
        }

        private static void SetString(Object target, string field, string value)
        {
            var so = new SerializedObject(target);
            SerializedProperty p = so.FindProperty(field);
            if (p == null) throw new System.InvalidOperationException("[NeonRush] Field '" + field + "' not found on " + target.GetType().Name);
            p.stringValue = value;
            so.ApplyModifiedPropertiesWithoutUndo();
        }
    }
}
