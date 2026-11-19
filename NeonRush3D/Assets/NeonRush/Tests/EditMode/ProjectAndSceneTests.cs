using System.Collections.Generic;
using System.Linq;
using NeonRush.EditorTools;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.Build;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace NeonRush.Tests
{
    /// <summary>Verifies generated content and iOS settings inside a real Unity Editor.</summary>
    public class ProjectAndSceneTests
    {
        [OneTimeSetUp]
        public void EnsureGenerated()
        {
            NeonRushProjectSetup.Configure();
            NeonRushSceneBuilder.EnsureBuilt();
        }

        [Test]
        public void UrpIsTheActivePipeline()
        {
            Assert.IsInstanceOf<UniversalRenderPipelineAsset>(GraphicsSettings.defaultRenderPipeline);
        }

        [Test]
        public void SceneIsInBuildSettings()
        {
            EditorBuildSettingsScene[] scenes = EditorBuildSettings.scenes;
            Assert.IsNotEmpty(scenes);
            Assert.IsTrue(System.Array.Exists(scenes, s => s.path == NeonRushSceneBuilder.ScenePath && s.enabled), "classic scene included");
        }

        [Test]
        public void SceneHasNoMissingReferences()
        {
            List<string> issues = NeonRushValidator.ValidateGameScene();
            Assert.IsEmpty(issues, string.Join("\n", issues));
        }

        [Test]
        public void SceneContainsAllSystems()
        {
            NeonRushValidator.ValidateGameScene();
            Assert.IsNotNull(Object.FindObjectOfType<GameBootstrap>());
            Assert.IsNotNull(Object.FindObjectOfType<GameManager>());
            Assert.IsNotNull(Object.FindObjectOfType<PlayerController>());
            Assert.IsNotNull(Object.FindObjectOfType<CameraController>());
            Assert.IsNotNull(Object.FindObjectOfType<RoadGenerator>());
            Assert.IsNotNull(Object.FindObjectOfType<ObstacleSpawner>());
            Assert.IsNotNull(Object.FindObjectOfType<CollisionHandler>());
            Assert.IsNotNull(Object.FindObjectOfType<ScoreManager>());
            Assert.IsNotNull(Object.FindObjectOfType<UIManager>());
            Assert.IsNotNull(Object.FindObjectOfType<SettingsManager>());
            Assert.IsNotNull(Object.FindObjectOfType<PerformanceManager>());
            Assert.IsNotNull(Object.FindObjectOfType<AudioManager>());
            Assert.IsNotNull(Object.FindObjectOfType<ObjectPoolManager>());
            Assert.IsNotNull(Object.FindObjectOfType<UnityEngine.EventSystems.EventSystem>());
        }

        [Test]
        public void MaterialsUseUrpShadersWithInstancing()
        {
            string[] guids = AssetDatabase.FindAssets("t:Material", new[] { NeonRushProjectSetup.Root + "/Materials" });
            Assert.GreaterOrEqual(guids.Length, 15);
            foreach (string g in guids)
            {
                var m = AssetDatabase.LoadAssetAtPath<Material>(AssetDatabase.GUIDToAssetPath(g));
                StringAssert.StartsWith("Universal Render Pipeline/", m.shader.name, m.name);
                Assert.IsTrue(m.enableInstancing, m.name + " instancing");
            }
        }

        [Test]
        public void IosPlayerSettings()
        {
            NamedBuildTarget ios = NamedBuildTarget.iOS;
            Assert.AreEqual("com.sufyan.neonrush", PlayerSettings.GetApplicationIdentifier(ios));
            Assert.AreEqual("Neon Rush", PlayerSettings.productName);
            // 1.0.0 (classic only) or 2.0.0 once the Los Angeles update is built.
            CollectionAssert.Contains(new[] { "1.0.0", "2.0.0" }, PlayerSettings.bundleVersion);
            CollectionAssert.Contains(new[] { "1", "2" }, PlayerSettings.iOS.buildNumber);
            Assert.AreEqual(ScriptingImplementation.IL2CPP, PlayerSettings.GetScriptingBackend(ios));
            Assert.AreEqual(1, PlayerSettings.GetArchitecture(ios), "ARM64");
            Assert.IsFalse(PlayerSettings.GetUseDefaultGraphicsAPIs(BuildTarget.iOS));
            CollectionAssert.AreEqual(new[] { GraphicsDeviceType.Metal }, PlayerSettings.GetGraphicsAPIs(BuildTarget.iOS));
            Assert.IsTrue(PlayerSettings.allowedAutorotateToLandscapeLeft);
            Assert.IsTrue(PlayerSettings.allowedAutorotateToLandscapeRight);
            Assert.IsFalse(PlayerSettings.allowedAutorotateToPortrait);
            Assert.IsFalse(PlayerSettings.allowedAutorotateToPortraitUpsideDown);
            Assert.IsFalse(PlayerSettings.iOS.requiresPersistentWiFi);
            Assert.IsTrue(NeonRushProjectSetup.IsProMotionEnabled(), "Enable ProMotion Support");
        }

        [Test]
        public void InfoPlistPatchIsIdempotent()
        {
            const string plist = "<?xml version=\"1.0\"?>\n<plist version=\"1.0\">\n<dict>\n\t<key>CFBundleName</key>\n\t<string>x</string>\n</dict>\n</plist>\n";
            string once = NeonRushIOSPostProcess.SetBool(plist, "CADisableMinimumFrameDurationOnPhone", true);
            string twice = NeonRushIOSPostProcess.SetBool(once, "CADisableMinimumFrameDurationOnPhone", true);
            Assert.AreEqual(once, twice);
            StringAssert.Contains("<key>CADisableMinimumFrameDurationOnPhone</key>\n\t<true/>", once);
            string flipped = NeonRushIOSPostProcess.SetBool(once, "CADisableMinimumFrameDurationOnPhone", false);
            Assert.AreEqual(1, flipped.Split(new[] { "CADisableMinimumFrameDurationOnPhone" }, System.StringSplitOptions.None).Length - 1);
            StringAssert.Contains("<false/>", flipped);
        }

        [Test]
        public void PrefabsAreLightweight()
        {
            var seg = AssetDatabase.LoadAssetAtPath<GameObject>(NeonRushProjectSetup.Root + "/Prefabs/RoadSegment.prefab");
            Assert.IsNotNull(seg);
            int renderers = seg.GetComponentsInChildren<MeshRenderer>(true).Length;
            Assert.LessOrEqual(renderers, 16, "road segment renderers (combined by material)");
            Assert.IsEmpty(seg.GetComponentsInChildren<Collider>(true), "road needs no colliders");

            foreach (string name in new[] { "Obstacle_Barrier", "Obstacle_Block", "Obstacle_Gate" })
            {
                var o = AssetDatabase.LoadAssetAtPath<GameObject>(NeonRushProjectSetup.Root + "/Prefabs/" + name + ".prefab");
                Assert.IsNotNull(o, name);
                Assert.IsNotNull(o.GetComponent<Obstacle>(), name);
                Collider[] cols = o.GetComponentsInChildren<Collider>(true);
                Assert.AreEqual(1, cols.Length, name + " has exactly one collider");
                Assert.IsTrue(cols[0].isTrigger, name);
                Assert.LessOrEqual(o.GetComponentsInChildren<MeshRenderer>(true).Length, 4, name);
            }

            var car = AssetDatabase.LoadAssetAtPath<GameObject>(NeonRushProjectSetup.Root + "/Prefabs/PlayerCar.prefab");
            Assert.IsNotNull(car);
            Assert.IsEmpty(car.GetComponentsInChildren<Collider>(true), "car uses an overlap-box hitbox, no colliders");
            Assert.IsTrue(car.GetComponentsInChildren<MeshRenderer>(true).All(r => r.shadowCastingMode == ShadowCastingMode.Off));
        }
    }
}
