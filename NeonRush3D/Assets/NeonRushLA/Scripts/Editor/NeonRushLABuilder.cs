using System;
using System.Collections.Generic;
using NeonRush.EditorTools;
using NeonRushLA.CameraRig;
using NeonRushLA.City;
using NeonRushLA.Gameplay;
using NeonRushLA.People;
using NeonRushLA.Traffic;
using NeonRushLA.UI;
using NeonRushLA.Vehicles;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace NeonRushLA.EditorTools
{
    /// <summary>
    /// Builds NEON RUSH LA: physics layers, the LA URP asset (shadows on), procedural textures,
    /// every material, the VORTEX GT prefab, five traffic prefabs, the pedestrian prefab and the
    /// NeonRushLA scene; sets iOS 2.0.0. The classic NEON RUSH scene is kept as a separate scene.
    /// </summary>
    public static class NeonRushLABuilder
    {
        public const string Root = "Assets/NeonRushLA";
        public const string ScenePath = Root + "/Scenes/NeonRushLA.unity";
        public const string SceneName = "NeonRushLA";
        private const string Mat = Root + "/Materials";
        private const string Prefabs = Root + "/Prefabs";
        private const string Meshes = Root + "/Meshes";
        private const string Settings = Root + "/Settings";
        public const string Version = "2.0.0";
        public const string BuildNumber = "2";

        [MenuItem("NeonRush/LA/Build Los Angeles (everything)", priority = 100)]
        public static void BuildFromMenu()
        {
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            BuildAll();
            EditorUtility.DisplayDialog("NEON RUSH LA", "Built: VortexGT.prefab, traffic, pedestrians, materials and " + ScenePath + ".\nPress Play.", "OK");
        }

        public static void EnsureBuilt()
        {
            if (AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath) == null) BuildAll();
            else ApplySettings();
        }

        public static void BuildAll()
        {
            EnsureFolders();
            // Classic game first (its own scene + URP asset), then LA on top.
            NeonRushProjectSetup.Configure();
            NeonRushSceneBuilder.EnsureBuilt();
            SetupLayers();

            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            UniversalRenderPipelineAsset urp = EnsurePipeline();
            MaterialLibrary lib = BuildMaterials();
            GameObject vortex = BuildVortexPrefab(lib);
            TrafficCar[] traffic = BuildTrafficPrefabs(lib);
            Pedestrian ped = BuildPedestrianPrefab(lib);
            BuildScene(scene, urp, lib, vortex, traffic, ped);
            ApplySettings();
            AssetDatabase.SaveAssets();
            Debug.Log("[NeonRushLA] Built " + ScenePath);
        }

        public static void ApplySettings()
        {
            PlayerSettings.bundleVersion = Version;
            PlayerSettings.iOS.buildNumber = BuildNumber;
            PlayerSettings.SetApplicationIdentifier(UnityEditor.Build.NamedBuildTarget.iOS, NeonRushProjectSetup.BundleId);
            var scenes = new List<EditorBuildSettingsScene>
            {
                new EditorBuildSettingsScene(ScenePath, true),
                new EditorBuildSettingsScene(NeonRushSceneBuilder.ScenePath, true),
            };
            EditorBuildSettings.scenes = scenes.ToArray();
        }

        private static void EnsureFolders()
        {
            if (!AssetDatabase.IsValidFolder(Root)) AssetDatabase.CreateFolder("Assets", "NeonRushLA");
            foreach (string f in new[] { "Materials", "Prefabs", "Meshes", "Scenes", "Settings", "Textures" })
            {
                if (!AssetDatabase.IsValidFolder(Root + "/" + f)) AssetDatabase.CreateFolder(Root, f);
            }
        }

        private static void SetupLayers()
        {
            Object[] assets = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/TagManager.asset");
            if (assets == null || assets.Length == 0) return;
            var so = new SerializedObject(assets[0]);
            SerializedProperty layers = so.FindProperty("layers");
            for (int i = 0; i < LALayers.Names.Length; i++)
            {
                SerializedProperty p = layers.GetArrayElementAtIndex(LALayers.Vehicle + i);
                if (string.IsNullOrEmpty(p.stringValue) || p.stringValue == LALayers.Names[i]) p.stringValue = LALayers.Names[i];
            }

            so.ApplyModifiedPropertiesWithoutUndo();
        }

        // ------------------------------------------------------------------ URP

        private static UniversalRenderPipelineAsset EnsurePipeline()
        {
            string path = Settings + "/NeonRushLA_URP.asset";
            var asset = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(path);
            if (asset == null)
            {
                var data = ScriptableObject.CreateInstance<UniversalRendererData>();
                AssetDatabase.CreateAsset(data, Settings + "/NeonRushLA_Renderer.asset");
                data.postProcessData = AssetDatabase.LoadAssetAtPath<PostProcessData>("Packages/com.unity.render-pipelines.universal/Runtime/Data/PostProcessData.asset");
                ResourceReloader.ReloadAllNullIn(data, UniversalRenderPipelineAsset.packagePath);
                EditorUtility.SetDirty(data);
                asset = UniversalRenderPipelineAsset.Create(data);
                AssetDatabase.CreateAsset(asset, path);
            }

            asset.supportsHDR = true;
            asset.msaaSampleCount = 2;
            asset.renderScale = 1f;
            asset.shadowDistance = 60f;
            asset.supportsCameraDepthTexture = false;
            asset.supportsCameraOpaqueTexture = false;
            asset.useSRPBatcher = true;
            var so = new SerializedObject(asset);
            Set(so, "m_MainLightShadowsSupported", true);
            Set(so, "m_SoftShadowsSupported", true);
            Set(so, "m_AdditionalLightShadowsSupported", false);
            SetInt(so, "m_AdditionalLightsRenderingMode", 0); // disabled: one sun, emissive street lights
            SetInt(so, "m_MainLightShadowmapResolution", 2048);
            SetInt(so, "m_ShadowCascadeCount", 2);
            Set(so, "m_UseFastSRGBLinearConversion", true);
            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(asset);
            // LA is the main game now: its asset is the project default (so shadow variants are kept);
            // the classic scene switches to its own asset at runtime.
            GraphicsSettings.defaultRenderPipeline = asset;
            return asset;
        }

        private static void Set(SerializedObject so, string name, bool v)
        {
            SerializedProperty p = so.FindProperty(name);
            if (p != null) p.boolValue = v;
        }

        private static void SetInt(SerializedObject so, string name, int v)
        {
            SerializedProperty p = so.FindProperty(name);
            if (p != null) p.intValue = v;
        }

        // ------------------------------------------------------------------ materials

        private static Material MakeMat(string key, string shader, Color baseColor, float metallic, float smoothness, Texture2D tex = null, Texture2D emissionMap = null, Color? emission = null, bool doubleSided = false)
        {
            string path = Mat + "/LA_" + key + ".mat";
            Shader sh = Shader.Find(shader) ?? Shader.Find("Universal Render Pipeline/Lit");
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null)
            {
                m = new Material(sh) { name = "LA_" + key };
                AssetDatabase.CreateAsset(m, path);
            }

            m.shader = sh;
            m.enableInstancing = true;
            if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", baseColor);
            if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", metallic);
            if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", smoothness);
            if (tex != null && m.HasProperty("_BaseMap")) m.SetTexture("_BaseMap", tex);
            if (emissionMap != null || emission.HasValue)
            {
                m.EnableKeyword("_EMISSION");
                m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None;
                if (emissionMap != null) m.SetTexture("_EmissionMap", emissionMap);
                m.SetColor("_EmissionColor", emission ?? Color.black);
            }

            if (doubleSided && m.HasProperty("_Cull"))
            {
                m.SetFloat("_Cull", 0f);
                m.doubleSidedGI = true;
            }

            EditorUtility.SetDirty(m);
            return m;
        }

        private static Material Particle(string key, Color color, bool additive)
        {
            string path = Mat + "/LA_" + key + ".mat";
            Shader sh = Shader.Find("Universal Render Pipeline/Particles/Unlit");
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null)
            {
                m = new Material(sh) { name = "LA_" + key };
                AssetDatabase.CreateAsset(m, path);
            }

            m.SetColor("_BaseColor", color);
            m.SetFloat("_Surface", 1f);
            m.SetFloat("_Blend", additive ? 2f : 0f);
            m.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
            m.SetFloat("_DstBlend", additive ? (float)BlendMode.One : (float)BlendMode.OneMinusSrcAlpha);
            m.SetFloat("_ZWrite", 0f);
            m.SetOverrideTag("RenderType", "Transparent");
            m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            m.renderQueue = (int)RenderQueue.Transparent;
            EditorUtility.SetDirty(m);
            return m;
        }

        private static MaterialLibrary BuildMaterials()
        {
            const string Lit = "Universal Render Pipeline/Lit";
            const string Unlit = "Universal Render Pipeline/Unlit";
            var e = new List<MaterialLibrary.Entry>();
            void Add(string k, Material m) => e.Add(new MaterialLibrary.Entry { key = k, material = m });

            // Car
            Add(CarGenerator.Paint, MakeMat("Paint", Lit, new Color(0.02f, 0.02f, 0.025f), 0.85f, 0.88f));
            Add(CarGenerator.Glass, MakeMat("Glass", Lit, new Color(0.02f, 0.03f, 0.045f), 0.1f, 0.96f));
            Add(CarGenerator.Chrome, MakeMat("Chrome", Lit, new Color(0.92f, 0.92f, 0.94f), 1f, 0.94f));
            Add(CarGenerator.Black, MakeMat("Black", Lit, new Color(0.03f, 0.03f, 0.035f), 0f, 0.4f));
            Add(CarGenerator.Seam, MakeMat("Seam", Lit, new Color(0.004f, 0.004f, 0.004f), 0f, 0.1f));
            Add(CarGenerator.Tire, MakeMat("Tire", Lit, new Color(0.035f, 0.035f, 0.038f), 0f, 0.28f));
            Add(CarGenerator.Rim, MakeMat("Rim", Lit, new Color(0.11f, 0.11f, 0.12f), 0.9f, 0.72f));
            Add(CarGenerator.Disc, MakeMat("Disc", Lit, new Color(0.38f, 0.38f, 0.38f), 0.85f, 0.5f));
            Add(CarGenerator.Caliper, MakeMat("Caliper", Lit, new Color(0.75f, 0.06f, 0.04f), 0f, 0.65f));
            Add(CarGenerator.Headlight, MakeMat("Headlight", Lit, new Color(0.9f, 0.9f, 0.95f), 0f, 0.95f, null, null, new Color(4.5f, 4.6f, 5f)));
            Add(CarGenerator.Taillight, MakeMat("Taillight", Lit, new Color(0.5f, 0.02f, 0.03f), 0f, 0.9f, null, null, new Color(3.5f, 0.15f, 0.2f)));
            Add(CarGenerator.Plate, MakeMat("Plate", Lit, Color.white, 0f, 0.35f, LATextureFactory.Plate("Plate_NEON20", "NEON 2.0")));
            Add(CarGenerator.Sign, MakeMat("Sign", Lit, new Color(1f, 0.9f, 0.4f), 0f, 0.5f, LATextureFactory.Sign("TaxiSign", "TAXI", new Color32(255, 215, 60, 255), new Color32(20, 20, 20, 255)), null, new Color(0.8f, 0.7f, 0.3f)));
            Add("LightBroken", MakeMat("LightBroken", Lit, new Color(0.08f, 0.08f, 0.09f), 0.2f, 0.3f));

            // City
            Texture2D asphalt = LATextureFactory.Asphalt();
            Add(CityMeshes.Asphalt, MakeMat("Asphalt", Lit, Color.white, 0f, 0.22f, asphalt));
            Add(CityMeshes.LineWhite, MakeMat("LineWhite", Lit, new Color(0.9f, 0.9f, 0.88f), 0f, 0.3f));
            Add(CityMeshes.LineYellow, MakeMat("LineYellow", Lit, new Color(0.95f, 0.72f, 0.08f), 0f, 0.3f));
            Add(CityMeshes.Sidewalk, MakeMat("Sidewalk", Lit, Color.white, 0f, 0.15f, LATextureFactory.Sidewalk()));
            Add(CityMeshes.Curb, MakeMat("Curb", Lit, new Color(0.72f, 0.71f, 0.68f), 0f, 0.1f));
            Add(CityMeshes.Grass, MakeMat("Grass", Lit, Color.white, 0f, 0.05f, LATextureFactory.Grass()));
            Add(CityMeshes.Plaza, MakeMat("Plaza", Lit, Color.white, 0f, 0.2f, LATextureFactory.Plaza()));
            LATextureFactory.Facade("FacadeGlass", 0, 4, 4, out Texture2D fg, out Texture2D fge);
            LATextureFactory.Facade("FacadeOffice", 1, 4, 4, out Texture2D fo, out Texture2D foe);
            LATextureFactory.Facade("FacadeStucco", 2, 2, 2, out Texture2D fs, out Texture2D fse);
            LATextureFactory.Facade("FacadeBrick", 3, 3, 3, out Texture2D fb, out Texture2D fbe);
            LATextureFactory.Facade("Storefront", 4, 2, 1, out Texture2D sf, out Texture2D sfe);
            Add(CityMeshes.FacadeGlass, MakeMat("FacadeGlass", Lit, Color.white, 0.55f, 0.88f, fg, fge, Color.black));
            Add(CityMeshes.FacadeOffice, MakeMat("FacadeOffice", Lit, Color.white, 0.1f, 0.35f, fo, foe, Color.black));
            Add(CityMeshes.FacadeStucco, MakeMat("FacadeStucco", Lit, Color.white, 0f, 0.15f, fs, fse, Color.black));
            Add(CityMeshes.FacadeBrick, MakeMat("FacadeBrick", Lit, Color.white, 0f, 0.15f, fb, fbe, Color.black));
            Add(CityMeshes.Storefront, MakeMat("Storefront", Lit, Color.white, 0.3f, 0.85f, sf, sfe, new Color(0.4f, 0.33f, 0.22f)));
            Add(CityMeshes.Roof, MakeMat("Roof", Lit, new Color(0.3f, 0.3f, 0.32f), 0f, 0.1f));
            Add(CityMeshes.Awning, MakeMat("Awning", Lit, new Color(0.62f, 0.1f, 0.1f), 0f, 0.2f));
            Add(CityMeshes.NeonSign, MakeMat("NeonSign", Lit, new Color(1f, 0.25f, 0.75f), 0f, 0.5f, null, null, new Color(1.2f, 0.3f, 0.95f)));
            Add(CityMeshes.PalmTrunk, MakeMat("PalmTrunk", Lit, new Color(0.47f, 0.39f, 0.3f), 0f, 0.1f));
            Add(CityMeshes.PalmLeaf, MakeMat("PalmLeaf", Lit, new Color(0.24f, 0.44f, 0.14f), 0f, 0.25f, null, null, null, true));
            Add(CityMeshes.PalmSkirt, MakeMat("PalmSkirt", Lit, new Color(0.5f, 0.38f, 0.22f), 0f, 0.05f, null, null, null, true));
            Add(CityMeshes.Bark, MakeMat("Bark", Lit, new Color(0.33f, 0.24f, 0.16f), 0f, 0.1f));
            Add(CityMeshes.Leaf, MakeMat("Leaf", Lit, new Color(0.17f, 0.4f, 0.14f), 0f, 0.15f));
            Add(CityMeshes.Metal, MakeMat("Metal", Lit, new Color(0.38f, 0.39f, 0.41f), 0.7f, 0.5f));
            Add(CityMeshes.LampHead, MakeMat("LampHead", Lit, new Color(1f, 0.92f, 0.75f), 0f, 0.6f, null, null, new Color(0.2f, 0.17f, 0.12f)));
            Add(CityMeshes.SignalHousing, MakeMat("SignalHousing", Lit, new Color(0.12f, 0.12f, 0.08f), 0f, 0.3f));
            Add(CityMeshes.SignGreen, MakeMat("SignGreen", Lit, new Color(0.05f, 0.42f, 0.18f), 0f, 0.4f));
            Add(CityMeshes.SignWhite, MakeMat("SignWhite", Lit, new Color(0.92f, 0.92f, 0.92f), 0f, 0.3f));
            Add(CityMeshes.Concrete, MakeMat("Concrete", Lit, new Color(0.62f, 0.61f, 0.58f), 0f, 0.12f));
            Add("SignalRed", MakeMat("SignalRed", Unlit, new Color(4f, 0.15f, 0.1f), 0f, 0f));
            Add("SignalYellow", MakeMat("SignalYellow", Unlit, new Color(4f, 2.6f, 0.2f), 0f, 0f));
            Add("SignalGreen", MakeMat("SignalGreen", Unlit, new Color(0.2f, 3.5f, 1.4f), 0f, 0f));
            Add("SignalOff", MakeMat("SignalOff", Lit, new Color(0.06f, 0.06f, 0.06f), 0f, 0.6f));
            Add("Checkpoint", MakeMat("Checkpoint", Unlit, new Color(0.3f, 2.6f, 3.2f), 0f, 0f));

            // People: palettes
            Color[] skins = { new Color(0.86f, 0.67f, 0.54f), new Color(0.62f, 0.43f, 0.3f), new Color(0.36f, 0.24f, 0.17f) };
            Color[] hairs = { new Color(0.06f, 0.05f, 0.04f), new Color(0.32f, 0.2f, 0.1f), new Color(0.75f, 0.6f, 0.35f) };
            Color[] shirts = { new Color(0.85f, 0.85f, 0.85f), new Color(0.1f, 0.25f, 0.6f), new Color(0.7f, 0.12f, 0.12f), new Color(0.1f, 0.1f, 0.1f), new Color(0.95f, 0.65f, 0.2f), new Color(0.2f, 0.55f, 0.45f) };
            Color[] pants = { new Color(0.12f, 0.16f, 0.3f), new Color(0.08f, 0.08f, 0.09f), new Color(0.55f, 0.5f, 0.4f), new Color(0.3f, 0.3f, 0.32f) };
            Color[] shoes = { new Color(0.9f, 0.9f, 0.9f), new Color(0.07f, 0.07f, 0.07f) };
            void Palette(string slot, Color[] cols, float smooth)
            {
                for (int i = 0; i < cols.Length; i++) Add(slot + i, MakeMat(slot + i, Lit, cols[i], 0f, smooth));
            }

            Palette(HumanGenerator.Skin, skins, 0.35f);
            Palette(HumanGenerator.Hair, hairs, 0.3f);
            Palette(HumanGenerator.Shirt, shirts, 0.1f);
            Palette(HumanGenerator.Pants, pants, 0.1f);
            Palette(HumanGenerator.Shoes, shoes, 0.3f);

            // FX + sky
            Add("Spark", Particle("Spark", new Color(1f, 0.7f, 0.3f, 1f), true));
            Add("Smoke", Particle("Smoke", new Color(0.85f, 0.85f, 0.88f, 0.5f), false));
            var sky = AssetDatabase.LoadAssetAtPath<Material>(Mat + "/LA_Sky.mat");
            if (sky == null)
            {
                sky = new Material(Shader.Find("Skybox/Procedural")) { name = "LA_Sky" };
                AssetDatabase.CreateAsset(sky, Mat + "/LA_Sky.mat");
            }

            sky.SetFloat("_SunSize", 0.05f);
            sky.SetFloat("_SunSizeConvergence", 4f);
            sky.SetFloat("_AtmosphereThickness", 1.35f);
            sky.SetColor("_SkyTint", new Color(0.55f, 0.48f, 0.6f));
            sky.SetColor("_GroundColor", new Color(0.32f, 0.27f, 0.25f));
            sky.SetFloat("_Exposure", 1.25f);
            Add("Sky", sky);

            string libPath = Settings + "/LA_MaterialLibrary.asset";
            var lib = AssetDatabase.LoadAssetAtPath<MaterialLibrary>(libPath);
            if (lib == null)
            {
                lib = ScriptableObject.CreateInstance<MaterialLibrary>();
                AssetDatabase.CreateAsset(lib, libPath);
            }

            lib.SetEntries(e);
            EditorUtility.SetDirty(lib);
            AssetDatabase.SaveAssets();
            return lib;
        }

        // ------------------------------------------------------------------ prefabs

        private static void SaveMeshes(string name, CarAssembler.Result r)
        {
            string path = Meshes + "/" + name + "_Meshes.asset";
            AssetDatabase.DeleteAsset(path);
            Object first = null;
            foreach (Mesh m in r.Meshes)
            {
                if (first == null)
                {
                    AssetDatabase.CreateAsset(m, path);
                    first = m;
                }
                else
                {
                    AssetDatabase.AddObjectToAsset(m, first);
                }
            }

            foreach (Object o in r.Extra) AssetDatabase.AddObjectToAsset(o, first);
            AssetDatabase.SaveAssets();
        }

        private static GameObject BuildVortexPrefab(MaterialLibrary lib)
        {
            CarAssembler.Result r = CarAssembler.BuildPlayer(CarSpec.Create(CarKind.VortexGT), lib);
            SaveMeshes("VortexGT", r);
            GameObject prefab = PrefabUtility.SaveAsPrefabAsset(r.Root, Prefabs + "/VortexGT.prefab");
            Object.DestroyImmediate(r.Root);
            return prefab;
        }

        private static TrafficCar[] BuildTrafficPrefabs(MaterialLibrary lib)
        {
            var list = new List<TrafficCar>();
            foreach (CarKind k in new[] { CarKind.Sedan, CarKind.SUV, CarKind.Pickup, CarKind.Taxi, CarKind.Sports })
            {
                CarSpec spec = CarSpec.Create(k);
                Material paint = MakeMat("Paint_" + spec.Name, "Universal Render Pipeline/Lit", spec.PaintColor, 0.6f, 0.75f);
                CarAssembler.Result r = CarAssembler.BuildTraffic(spec, lib, paint);
                SaveMeshes("Traffic_" + spec.Name, r);
                GameObject prefab = PrefabUtility.SaveAsPrefabAsset(r.Root, Prefabs + "/Traffic_" + spec.Name + ".prefab");
                Object.DestroyImmediate(r.Root);
                list.Add(prefab.GetComponent<TrafficCar>());
            }

            return list.ToArray();
        }

        private static Pedestrian BuildPedestrianPrefab(MaterialLibrary lib)
        {
            GameObject go = PedestrianFactory.Build(lib, out Mesh mesh);
            string meshPath = Meshes + "/Pedestrian_Mesh.asset";
            AssetDatabase.DeleteAsset(meshPath);
            AssetDatabase.CreateAsset(mesh, meshPath);
            GameObject prefab = PrefabUtility.SaveAsPrefabAsset(go, Prefabs + "/Pedestrian.prefab");
            Object.DestroyImmediate(go);
            return prefab.GetComponent<Pedestrian>();
        }

        // ------------------------------------------------------------------ scene

        private static Material[] Palette(MaterialLibrary lib, string slot, int count)
        {
            var arr = new Material[count];
            for (int i = 0; i < count; i++) arr[i] = lib.Get(slot + i);
            return arr;
        }

        private static void BuildScene(Scene scene, UniversalRenderPipelineAsset urp, MaterialLibrary lib, GameObject vortexPrefab, TrafficCar[] traffic, Pedestrian ped)
        {
            // Lighting: low sunset sun, procedural sky, trilight ambient, warm haze.
            var sunGo = new GameObject("Sun");
            var sun = sunGo.AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.color = new Color(1f, 0.72f, 0.48f);
            sun.intensity = 1.25f;
            sun.shadows = LightShadows.Soft;
            sun.shadowStrength = 0.8f;
            sunGo.transform.rotation = Quaternion.Euler(13f, -38f, 0f);
            Material sky = lib.Get("Sky");
            RenderSettings.skybox = sky;
            RenderSettings.sun = sun;
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.55f, 0.48f, 0.55f);
            RenderSettings.ambientEquatorColor = new Color(0.62f, 0.45f, 0.36f);
            RenderSettings.ambientGroundColor = new Color(0.2f, 0.17f, 0.15f);
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = new Color(0.78f, 0.55f, 0.45f);
            RenderSettings.fogStartDistance = 150f;
            RenderSettings.fogEndDistance = 400f;
            RenderSettings.defaultReflectionMode = DefaultReflectionMode.Skybox;
            var lighting = new LightingSettings { name = "NeonRushLA_Lighting", bakedGI = false, realtimeGI = false, autoGenerate = false };
            string lightingPath = Settings + "/NeonRushLA_Lighting.lighting";
            AssetDatabase.DeleteAsset(lightingPath);
            AssetDatabase.CreateAsset(lighting, lightingPath);
            Lightmapping.lightingSettings = lighting;

            var probeGo = new GameObject("ReflectionProbe");
            probeGo.transform.position = new Vector3(0f, 25f, 0f);
            var probe = probeGo.AddComponent<ReflectionProbe>();
            probe.mode = ReflectionProbeMode.Realtime;
            probe.refreshMode = ReflectionProbeRefreshMode.ViaScripting;
            probe.timeSlicingMode = ReflectionProbeTimeSlicingMode.AllFacesAtOnce;
            probe.resolution = 128;
            probe.size = new Vector3(1200f, 400f, 1200f);
            probe.cullingMask = LALayers.Mask(LALayers.Ground, LALayers.Environment);
            probe.importance = 1;

            // Camera + post FX
            var camGo = new GameObject("Main Camera") { tag = "MainCamera" };
            var cam = camGo.AddComponent<Camera>();
            cam.nearClipPlane = 0.25f;
            cam.farClipPlane = 450f;
            cam.fieldOfView = 60f;
            cam.allowHDR = true;
            cam.allowMSAA = true;
            cam.clearFlags = CameraClearFlags.Skybox;
            camGo.AddComponent<AudioListener>();
            UniversalAdditionalCameraData cd = cam.GetUniversalAdditionalCameraData();
            cd.renderPostProcessing = true;
            cd.antialiasing = AntialiasingMode.None;
            cd.renderShadows = true;
            var vcam = camGo.AddComponent<VehicleCamera>();

            var volGo = new GameObject("PostFX");
            var vol = volGo.AddComponent<Volume>();
            vol.isGlobal = true;
            vol.sharedProfile = PostProfile();

            // World systems
            var cityGo = new GameObject("City");
            var city = cityGo.AddComponent<CityBuilder>();
            city.Configure(lib);
            cityGo.AddComponent<TrafficLightSystem>();

            var player = (GameObject)PrefabUtility.InstantiatePrefab(vortexPrefab);
            player.name = "VORTEX GT";
            var controller = player.GetComponent<VehicleController>();

            var trafficGo = new GameObject("Traffic");
            var tm = trafficGo.AddComponent<TrafficManager>();
            tm.Configure(traffic);

            var pedGo = new GameObject("Pedestrians");
            var pm = pedGo.AddComponent<PedestrianManager>();
            pm.Configure(ped, Palette(lib, HumanGenerator.Skin, 3), Palette(lib, HumanGenerator.Hair, 3), Palette(lib, HumanGenerator.Shirt, 6),
                Palette(lib, HumanGenerator.Pants, 4), Palette(lib, HumanGenerator.Shoes, 2));

            var systems = new GameObject("Systems");
            FxPool fx = FxPool.Create(systems.transform, lib);
            var game = systems.AddComponent<LAGame>();
            var quality = systems.AddComponent<LAQuality>();
            quality.Configure(urp, cam, sun, vol, sky, lib);
            var uiGo = new GameObject("UI");
            var ui = uiGo.AddComponent<LAUI>();

            var boot = new GameObject("Bootstrap").AddComponent<LABootstrap>();
            boot.Configure(lib, urp, city, controller, vcam, cam, tm, pm, game, quality, ui, fx, probe);

            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene, ScenePath);
        }

        private static VolumeProfile PostProfile()
        {
            string path = Settings + "/NeonRushLA_PostFX.asset";
            AssetDatabase.DeleteAsset(path);
            var profile = ScriptableObject.CreateInstance<VolumeProfile>();
            AssetDatabase.CreateAsset(profile, path);
            var bloom = profile.Add<Bloom>(true);
            bloom.threshold.Override(1.0f);
            bloom.intensity.Override(0.7f);
            bloom.scatter.Override(0.65f);
            bloom.highQualityFiltering.Override(false);
            var tone = profile.Add<Tonemapping>(true);
            tone.mode.Override(TonemappingMode.ACES);
            var color = profile.Add<ColorAdjustments>(true);
            color.postExposure.Override(0.25f);
            color.contrast.Override(10f);
            color.saturation.Override(12f);
            var vig = profile.Add<Vignette>(true);
            vig.intensity.Override(0.22f);
            foreach (VolumeComponent c in profile.components) AssetDatabase.AddObjectToAsset(c, profile);
            EditorUtility.SetDirty(profile);
            AssetDatabase.SaveAssets();
            return profile;
        }
    }
}
