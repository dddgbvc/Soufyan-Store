using System;
using System.Collections.Generic;
using NeonRush.EditorTools;
using NeonRushLA.Art;
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
            foreach (string f in new[] { "Materials", "Prefabs", "Meshes", "Scenes", "Settings", "Textures", "ImportedCars" })
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
            asset.shadowDistance = 70f;
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
            _ssao = EnsureSsao(asset);
            // LA is the main game now: its asset is the project default (so shadow variants are kept);
            // the classic scene switches to its own asset at runtime.
            GraphicsSettings.defaultRenderPipeline = asset;
            return asset;
        }

        private static ScriptableRendererFeature _ssao;

        /// <summary>
        /// Adds URP's Screen Space Ambient Occlusion feature (internal type in URP 14, hence reflection):
        /// depth-only source, half resolution, low sample count. LAQuality enables it in Quality mode only.
        /// </summary>
        private static ScriptableRendererFeature EnsureSsao(UniversalRenderPipelineAsset asset)
        {
            try
            {
                var data = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(Settings + "/NeonRushLA_Renderer.asset");
                if (data == null) return null;
                foreach (ScriptableRendererFeature f in data.rendererFeatures)
                {
                    if (f != null && f.GetType().Name == "ScreenSpaceAmbientOcclusion") return f;
                }

                Type t = typeof(ScriptableRendererFeature).Assembly.GetType("UnityEngine.Rendering.Universal.ScreenSpaceAmbientOcclusion");
                if (t == null) return null;
                var feature = (ScriptableRendererFeature)ScriptableObject.CreateInstance(t);
                feature.name = "SSAO";
                AssetDatabase.AddObjectToAsset(feature, data);
                AssetDatabase.TryGetGUIDAndLocalFileIdentifier(feature, out _, out long localId);
                var so = new SerializedObject(data);
                SerializedProperty list = so.FindProperty("m_RendererFeatures");
                SerializedProperty map = so.FindProperty("m_RendererFeatureMap");
                list.arraySize++;
                list.GetArrayElementAtIndex(list.arraySize - 1).objectReferenceValue = feature;
                map.arraySize++;
                map.GetArrayElementAtIndex(map.arraySize - 1).longValue = localId;
                so.ApplyModifiedPropertiesWithoutUndo();
                var fs = new SerializedObject(feature);
                SetInt(fs, "m_Settings.Source", 0);       // Depth
                SetInt(fs, "m_Settings.NormalSamples", 0); // Low
                Set(fs, "m_Settings.Downsample", true);
                SetFloat(fs, "m_Settings.Intensity", 1.6f);
                SetFloat(fs, "m_Settings.DirectLightingStrength", 0.2f);
                SetFloat(fs, "m_Settings.Radius", 0.5f);
                SetInt(fs, "m_Settings.Samples", 2);       // Low
                fs.ApplyModifiedPropertiesWithoutUndo();
                feature.SetActive(false);
                EditorUtility.SetDirty(feature);
                EditorUtility.SetDirty(data);
                AssetDatabase.SaveAssets();
                return feature;
            }
            catch (Exception e)
            {
                Debug.LogWarning("[NeonRushLA] SSAO feature not added: " + e.Message);
                return null;
            }
        }

        private static void SetFloat(SerializedObject so, string name, float v)
        {
            SerializedProperty p = so.FindProperty(name);
            if (p != null) p.floatValue = v;
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

        /// <summary>URP Lit material from a <see cref="MatSpec"/>: normal map, metallic/smoothness mask (R/A), emission map.</summary>
        private static Material SpecMat(MatSpec spec, Texture2D albedo, Texture2D normal, Texture2D mask, Texture2D emission)
        {
            bool emissive = emission != null || spec.Emission.maxColorComponent > 0f;
            Material m = MakeMat(spec.Key, "Universal Render Pipeline/Lit", spec.Color, spec.Metallic, spec.Smoothness, albedo, emission,
                emissive ? spec.Emission : (Color?)null, spec.DoubleSided);
            if (normal != null)
            {
                m.SetTexture("_BumpMap", normal);
                m.SetFloat("_BumpScale", spec.NormalScale);
                m.EnableKeyword("_NORMALMAP");
            }

            if (mask != null)
            {
                // Metallic from R, smoothness from A (× _Smoothness): glass reflects, walls stay matte.
                m.SetTexture("_MetallicGlossMap", mask);
                m.SetFloat("_SmoothnessTextureChannel", 0f);
                m.EnableKeyword("_METALLICSPECGLOSSMAP");
            }

            if (emission != null && spec.Emission.maxColorComponent <= 0f)
            {
                // Emission map present but dark by day; LAQuality turns it up at night.
                m.EnableKeyword("_EMISSION");
                m.SetColor("_EmissionColor", Color.black);
            }

            EditorUtility.SetDirty(m);
            return m;
        }

        /// <summary>Alpha-blended surface (car glass) that keeps its specular reflections.</summary>
        private static Material Transparent(Material m)
        {
            m.SetFloat("_Surface", 1f);
            m.SetFloat("_Blend", 0f);
            m.SetFloat("_BlendModePreserveSpecular", 1f);
            m.SetFloat("_SrcBlend", (float)BlendMode.One);
            m.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
            m.SetFloat("_ZWrite", 0f);
            m.SetOverrideTag("RenderType", "Transparent");
            m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            m.EnableKeyword("_ALPHAPREMULTIPLY_ON");
            m.renderQueue = (int)RenderQueue.Transparent;
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
            Add(CarGenerator.Paint, MakeMat("Paint", Lit, new Color(0.02f, 0.02f, 0.025f), 0.6f, 0.88f));
            Add(CarGenerator.Glass, Transparent(MakeMat("Glass", Lit, new Color(0.015f, 0.02f, 0.025f, 0.6f), 0.1f, 0.96f)));
            Add(CarGenerator.Interior, MakeMat("Interior", Lit, new Color(0.06f, 0.055f, 0.05f), 0f, 0.25f));
            Add(CarGenerator.Seat, MakeMat("Seat", Lit, new Color(0.09f, 0.08f, 0.075f), 0f, 0.3f));
            Add(CarGenerator.Amber, MakeMat("Amber", Lit, new Color(0.9f, 0.45f, 0.05f), 0f, 0.9f, null, null, new Color(0.6f, 0.25f, 0.02f)));
            Add(CarGenerator.RimSilver, MakeMat("RimSilver", Lit, new Color(0.72f, 0.73f, 0.75f), 1f, 0.8f));
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

            // City: generated textures (albedo + normal + metallic/smoothness mask + emission) and the shared specs.
            var sets = new Dictionary<string, TexSet>();
            foreach (TexSet set in CityTextures.All()) sets[set.Albedo.Name] = set;
            var saved = new Dictionary<string, Texture2D>();
            Texture2D Tex(TexData d)
            {
                if (d == null) return null;
                if (!saved.TryGetValue(d.Name, out Texture2D t))
                {
                    t = LATextureFactory.Save(d);
                    saved[d.Name] = t;
                }

                return t;
            }

            foreach (MatSpec spec in MaterialSpecs.City())
            {
                sets.TryGetValue(spec.Texture ?? "", out TexSet ts);
                Add(spec.Key, SpecMat(spec, ts == null ? null : Tex(ts.Albedo), ts == null ? null : Tex(ts.Normal), ts == null ? null : Tex(ts.Mask), ts == null ? null : Tex(ts.Emission)));
            }

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

            // Hazy Southern California daylight sky.
            sky.SetFloat("_SunSize", 0.035f);
            sky.SetFloat("_SunSizeConvergence", 6f);
            sky.SetFloat("_AtmosphereThickness", 1.1f);
            sky.SetColor("_SkyTint", new Color(0.5f, 0.52f, 0.56f));
            sky.SetColor("_GroundColor", new Color(0.38f, 0.36f, 0.34f));
            sky.SetFloat("_Exposure", LAQuality.DaySkyExposure);
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
            CarSpec gt = CarSpec.Create(CarKind.VortexGT);
            CarAssembler.Result r = CarAssembler.BuildPlayer(gt, lib);
            SaveMeshes("VortexGT", r);
            ApplyImportedModel(r.Root, gt);
            GameObject prefab = PrefabUtility.SaveAsPrefabAsset(r.Root, Prefabs + "/VortexGT.prefab");
            Object.DestroyImmediate(r.Root);
            return prefab;
        }

        public const string ImportedCarsFolder = Root + "/ImportedCars";

        /// <summary>
        /// Optional: a licensed 3D model placed in Assets/NeonRushLA/ImportedCars named after the car
        /// (VortexGT, Sedan, SUV, Pickup, Taxi, Sports; .prefab, .fbx, .obj or .blend) replaces the procedural
        /// body. It is scaled to the car's length, sat on the ground and centred; physics, AI and wheel
        /// colliders stay the same. The procedural body is hidden (kept for damage bookkeeping).
        /// </summary>
        private static bool ApplyImportedModel(GameObject root, CarSpec spec)
        {
            string baseName = ImportedCarsFolder + "/" + spec.Name.Replace(" ", "");
            GameObject model = null;
            foreach (string ext in new[] { ".prefab", ".fbx", ".obj", ".blend" })
            {
                model = AssetDatabase.LoadAssetAtPath<GameObject>(baseName + ext);
                if (model != null) break;
            }

            if (model == null) return false;
            var inst = (GameObject)Object.Instantiate(model);
            inst.name = "ImportedModel";
            inst.transform.SetParent(root.transform, false);
            Renderer[] rs = inst.GetComponentsInChildren<Renderer>();
            if (rs.Length == 0)
            {
                Object.DestroyImmediate(inst);
                return false;
            }

            Bounds b = rs[0].bounds;
            foreach (Renderer rr in rs) b.Encapsulate(rr.bounds);
            // Long axis → Z
            if (b.size.x > b.size.z * 1.2f)
            {
                inst.transform.localRotation = Quaternion.Euler(0f, 90f, 0f) * inst.transform.localRotation;
                b = rs[0].bounds;
                foreach (Renderer rr in rs) b.Encapsulate(rr.bounds);
            }

            float scale = spec.Length / Mathf.Max(0.01f, b.size.z);
            inst.transform.localScale *= scale;
            b = rs[0].bounds;
            foreach (Renderer rr in rs) b.Encapsulate(rr.bounds);
            Vector3 local = root.transform.InverseTransformPoint(b.center);
            float bottom = root.transform.InverseTransformPoint(new Vector3(b.center.x, b.min.y, b.center.z)).y;
            inst.transform.localPosition += new Vector3(-local.x, -bottom, (spec.FrontZ + spec.RearZ) * 0.5f - local.z);
            foreach (Renderer rr in root.GetComponentsInChildren<Renderer>(true))
            {
                if (rr.transform.IsChildOf(inst.transform)) continue;
                if (rr.name.StartsWith("Body") || rr.name.StartsWith("Wheel") || rr.name.StartsWith("Caliper")) rr.enabled = false;
                rr.gameObject.layer = root.layer;
            }

            foreach (Transform t in inst.GetComponentsInChildren<Transform>(true)) t.gameObject.layer = root.layer;
            var lod = root.GetComponent<LODGroup>();
            if (lod != null) lod.SetLODs(new[] { new LOD(0.01f, rs) });
            Debug.Log("[NeonRushLA] Using imported model for " + spec.Name + ": " + AssetDatabase.GetAssetPath(model));
            return true;
        }

        private static TrafficCar[] BuildTrafficPrefabs(MaterialLibrary lib)
        {
            var list = new List<TrafficCar>();
            foreach (CarKind k in new[] { CarKind.Sedan, CarKind.SUV, CarKind.Pickup, CarKind.Taxi, CarKind.Sports })
            {
                CarSpec spec = CarSpec.Create(k);
                Material paint = MakeMat("Paint_" + spec.Name, "Universal Render Pipeline/Lit", spec.PaintColor, 0.55f, 0.84f);
                CarAssembler.Result r = CarAssembler.BuildTraffic(spec, lib, paint);
                SaveMeshes("Traffic_" + spec.Name, r);
                ApplyImportedModel(r.Root, spec);
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
            sun.color = LAQuality.DaySunColor;
            sun.intensity = LAQuality.DaySunIntensity;
            sun.shadows = LightShadows.Soft;
            sun.shadowStrength = 0.92f;
            sun.shadowNormalBias = 0.6f;
            sun.shadowBias = 0.04f;
            sunGo.transform.rotation = Quaternion.Euler(40f, -32f, 0f); // mid-afternoon, shadows across the grid
            Material sky = lib.Get("Sky");
            RenderSettings.skybox = sky;
            RenderSettings.sun = sun;
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = LAQuality.DayAmbientSky;
            RenderSettings.ambientEquatorColor = LAQuality.DayAmbientEquator;
            RenderSettings.ambientGroundColor = LAQuality.DayAmbientGround;
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = LAQuality.DayFog;
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
            quality.SetAmbientOcclusion(_ssao);
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
            bloom.threshold.Override(1.1f);
            bloom.intensity.Override(0.35f);
            bloom.scatter.Override(0.6f);
            bloom.highQualityFiltering.Override(false);
            var tone = profile.Add<Tonemapping>(true);
            tone.mode.Override(TonemappingMode.ACES);
            var color = profile.Add<ColorAdjustments>(true);
            color.postExposure.Override(0.15f);
            color.contrast.Override(8f);
            color.saturation.Override(4f);
            var wb = profile.Add<WhiteBalance>(true);
            wb.temperature.Override(6f); // slightly warm Southern California light
            var smh = profile.Add<ShadowsMidtonesHighlights>(true);
            smh.shadows.Override(new Vector4(0.97f, 0.99f, 1.04f, 0f)); // cool sky-lit shadows
            var vig = profile.Add<Vignette>(true);
            vig.intensity.Override(0.16f);
            foreach (VolumeComponent c in profile.components) AssetDatabase.AddObjectToAsset(c, profile);
            EditorUtility.SetDirty(profile);
            AssetDatabase.SaveAssets();
            return profile;
        }
    }
}
