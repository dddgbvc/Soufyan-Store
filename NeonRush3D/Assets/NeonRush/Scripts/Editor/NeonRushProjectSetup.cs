using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace NeonRush.EditorTools
{
    /// <summary>
    /// Non-destructive project configuration: URP pipeline asset, colour space, and the iOS
    /// player settings requested for NEON RUSH. Re-running it is safe (idempotent).
    /// </summary>
    public static class NeonRushProjectSetup
    {
        public const string Root = "Assets/NeonRush";
        public const string SettingsFolder = Root + "/Settings";
        public const string PipelinePath = SettingsFolder + "/NeonRush_URP.asset";
        public const string RendererPath = SettingsFolder + "/NeonRush_URP_Renderer.asset";

        public const string BundleId = "com.sufyan.neonrush";
        public const string ProductName = "Neon Rush";
        public const string CompanyName = "Sufyan";
        public const string Version = "1.0.0";
        public const string BuildNumber = "1";
        public const string MinIOSVersion = "13.0";

        [MenuItem("NeonRush/1. Configure Project (URP + iOS)", priority = 1)]
        public static void ConfigureFromMenu()
        {
            Configure();
            EditorUtility.DisplayDialog("NEON RUSH", "Project configured:\n• URP pipeline asset\n• iOS player settings (IL2CPP, ARM64, Metal, ProMotion)\n\nSee Console for details.", "OK");
        }

        public static UniversalRenderPipelineAsset Configure()
        {
            EnsureFolders();
            UniversalRenderPipelineAsset urp = EnsurePipeline();
            ConfigurePlayerSettings();
            AssetDatabase.SaveAssets();
            Debug.Log("[NeonRush] Project configured. URP asset: " + AssetDatabase.GetAssetPath(urp));
            return urp;
        }

        public static void EnsureFolders()
        {
            string[] folders = { "Settings", "Materials", "Meshes", "Prefabs", "Scenes", "Audio" };
            if (!AssetDatabase.IsValidFolder(Root))
            {
                AssetDatabase.CreateFolder("Assets", "NeonRush");
            }

            foreach (string f in folders)
            {
                if (!AssetDatabase.IsValidFolder(Root + "/" + f))
                {
                    AssetDatabase.CreateFolder(Root, f);
                }
            }
        }

        // ------------------------------------------------------------------ URP

        /// <summary>
        /// Uses the project's active URP asset if there is one (never replaced); otherwise
        /// creates a dedicated one and makes it the default pipeline.
        /// </summary>
        public static UniversalRenderPipelineAsset EnsurePipeline()
        {
            var active = GraphicsSettings.defaultRenderPipeline as UniversalRenderPipelineAsset;
            var ours = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(PipelinePath);

            if (active != null && active != ours)
            {
                Debug.Log("[NeonRush] Project already uses URP asset '" + active.name + "'. Keeping it.");
                return active;
            }

            if (ours == null)
            {
                var rendererData = ScriptableObject.CreateInstance<UniversalRendererData>();
                AssetDatabase.CreateAsset(rendererData, RendererPath);
                rendererData.postProcessData = AssetDatabase.LoadAssetAtPath<PostProcessData>(
                    "Packages/com.unity.render-pipelines.universal/Runtime/Data/PostProcessData.asset");
                ResourceReloader.ReloadAllNullIn(rendererData, UniversalRenderPipelineAsset.packagePath);
                EditorUtility.SetDirty(rendererData);

                ours = UniversalRenderPipelineAsset.Create(rendererData);
                AssetDatabase.CreateAsset(ours, PipelinePath);
            }

            // Mobile-first pipeline: HDR for bloom, MSAA (cheap on Apple tile GPUs), no shadows
            // (the neon look is emissive), no depth/opaque copies, SRP Batcher on.
            ours.supportsHDR = true;
            ours.msaaSampleCount = 4;
            ours.renderScale = 1f;
            ours.shadowDistance = 0f;
            ours.supportsCameraDepthTexture = false;
            ours.supportsCameraOpaqueTexture = false;
            ours.useSRPBatcher = true;

            var so = new SerializedObject(ours);
            SetBool(so, "m_MainLightShadowsSupported", false);
            SetBool(so, "m_AdditionalLightShadowsSupported", false);
            SetBool(so, "m_SoftShadowsSupported", false);
            SetBool(so, "m_SupportsTerrainHoles", false);
            SetBool(so, "m_UseFastSRGBLinearConversion", true);
            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(ours);

            if (GraphicsSettings.defaultRenderPipeline == null)
            {
                GraphicsSettings.defaultRenderPipeline = ours;
            }

            // Quality levels without an override fall back to the default pipeline. Levels that
            // explicitly point at a non-URP pipeline would break the game, so only those change.
            int current = QualitySettings.GetQualityLevel();
            for (int i = 0; i < QualitySettings.names.Length; i++)
            {
                QualitySettings.SetQualityLevel(i, false);
                RenderPipelineAsset rp = QualitySettings.renderPipeline;
                if (rp != null && !(rp is UniversalRenderPipelineAsset))
                {
                    QualitySettings.renderPipeline = ours;
                }

                QualitySettings.vSyncCount = 0;
            }

            QualitySettings.SetQualityLevel(current, false);
            return GraphicsSettings.defaultRenderPipeline as UniversalRenderPipelineAsset ?? ours;
        }

        private static void SetBool(SerializedObject so, string name, bool value)
        {
            SerializedProperty p = so.FindProperty(name);
            if (p != null)
            {
                p.boolValue = value;
            }
        }

        // ------------------------------------------------------------------ Player settings

        public static void ConfigurePlayerSettings()
        {
            PlayerSettings.productName = ProductName;
            PlayerSettings.companyName = CompanyName;
            PlayerSettings.bundleVersion = Version;
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.gcIncremental = true;
            PlayerSettings.stripEngineCode = true;
            PlayerSettings.statusBarHidden = true;
            PlayerSettings.accelerometerFrequency = 0; // not used: saves battery
            PlayerSettings.runInBackground = false;

            // Orientation: landscape only.
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.AutoRotation;
            PlayerSettings.allowedAutorotateToLandscapeLeft = true;
            PlayerSettings.allowedAutorotateToLandscapeRight = true;
            PlayerSettings.allowedAutorotateToPortrait = false;
            PlayerSettings.allowedAutorotateToPortraitUpsideDown = false;
            PlayerSettings.useAnimatedAutorotation = true;

            // iOS
            NamedBuildTarget ios = NamedBuildTarget.iOS;
            PlayerSettings.SetApplicationIdentifier(ios, BundleId);
            PlayerSettings.SetScriptingBackend(ios, ScriptingImplementation.IL2CPP);
            PlayerSettings.SetArchitecture(ios, 1); // 1 = ARM64
            PlayerSettings.SetIl2CppCompilerConfiguration(ios, Il2CppCompilerConfiguration.Release);
            PlayerSettings.SetManagedStrippingLevel(ios, ManagedStrippingLevel.Low);
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.iOS, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.iOS, new[] { GraphicsDeviceType.Metal });

            PlayerSettings.iOS.buildNumber = BuildNumber;
            PlayerSettings.iOS.targetOSVersionString = MinIOSVersion;
            PlayerSettings.iOS.sdkVersion = iOSSdkVersion.DeviceSDK;
            PlayerSettings.iOS.targetDevice = iOSTargetDevice.iPhoneAndiPad;
            PlayerSettings.iOS.requiresFullScreen = true;
            PlayerSettings.iOS.requiresPersistentWiFi = false;   // offline game
            PlayerSettings.iOS.hideHomeButton = false;
            PlayerSettings.iOS.deferSystemGesturesMode = UnityEngine.iOS.SystemGestureDeferMode.All; // swipes near edges reach the game first
            PlayerSettings.iOS.appleEnableAutomaticSigning = false;   // signing is handled by BuildTools/make_ipa.sh
            PlayerSettings.insecureHttpOption = InsecureHttpOption.NotAllowed;

            SetProMotion(true);
            Debug.Log("[NeonRush] iOS settings: " + BundleId + " v" + Version + " (" + BuildNumber + "), IL2CPP, ARM64, Metal, iOS " + MinIOSVersion + "+, landscape, ProMotion on.");
        }

        /// <summary>
        /// "Enable ProMotion Support" (Player Settings › iOS › Other). It has no public C# API in
        /// 2022.3, so the serialized ProjectSettings field is set directly.
        /// </summary>
        public static bool SetProMotion(bool enabled)
        {
            Object[] assets = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset");
            if (assets == null || assets.Length == 0)
            {
                Debug.LogWarning("[NeonRush] Could not open ProjectSettings.asset to enable ProMotion.");
                return false;
            }

            var so = new SerializedObject(assets[0]);
            SerializedProperty p = so.FindProperty("appleEnableProMotion");
            if (p == null)
            {
                Debug.LogWarning("[NeonRush] 'appleEnableProMotion' not found in this Unity version. Info.plist post-process still adds CADisableMinimumFrameDurationOnPhone.");
                return false;
            }

            p.boolValue = enabled;
            so.ApplyModifiedPropertiesWithoutUndo();
            return true;
        }

        public static bool IsProMotionEnabled()
        {
            Object[] assets = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset");
            if (assets == null || assets.Length == 0) return false;
            SerializedProperty p = new SerializedObject(assets[0]).FindProperty("appleEnableProMotion");
            return p != null && p.boolValue;
        }

        public static string ProjectRoot => Path.GetDirectoryName(Application.dataPath);
    }
}
