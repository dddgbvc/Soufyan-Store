using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace NeonRush.EditorTools
{
    /// <summary>
    /// iOS build entry points. Unity can only produce an Xcode project; the IPA is produced
    /// from it on macOS by BuildTools/make_ipa.sh (xcodebuild archive + export / unsigned package).
    /// </summary>
    public static class NeonRushBuild
    {
        public const string DefaultXcodePath = "Builds/iOS/Xcode";

        [MenuItem("NeonRush/4. Export iOS Xcode Project", priority = 20)]
        public static void BuildIOSFromMenu()
        {
            BuildReport report = BuildIOS(DefaultXcodePath);
            bool ok = report != null && report.summary.result == BuildResult.Succeeded;
            EditorUtility.DisplayDialog("NEON RUSH",
                ok ? "Xcode project exported to:\n" + Path.GetFullPath(DefaultXcodePath) + "\n\nOn a Mac run:\nBuildTools/make_ipa.sh"
                   : "iOS build failed. See Console.", "OK");
        }

        /// <summary>
        /// Batch mode / CI: Unity -batchmode -quit -projectPath NeonRush3D -buildTarget iOS
        ///   -executeMethod NeonRush.EditorTools.NeonRushBuild.BuildIOSCommandLine [-customBuildPath path]
        /// </summary>
        public static void BuildIOSCommandLine()
        {
            string path = ArgValue("-customBuildPath") ?? ArgValue("-buildPath") ?? DefaultXcodePath;
            BuildReport report = null;
            try
            {
                report = BuildIOS(path);
            }
            catch (Exception e)
            {
                Debug.LogException(e);
            }

            bool ok = report != null && report.summary.result == BuildResult.Succeeded;
            EditorApplication.Exit(ok ? 0 : 1);
        }

        /// <summary>
        /// Batch mode: configure the project and generate the scene, then exit with 0 when
        /// validation finds no missing references.
        ///   Unity -batchmode -quit -projectPath NeonRush3D -executeMethod NeonRush.EditorTools.NeonRushBuild.SetupCommandLine
        /// </summary>
        public static void SetupCommandLine()
        {
            int code = 1;
            try
            {
                NeonRushProjectSetup.Configure();
                code = NeonRushSceneBuilder.BuildAll().Count == 0 ? 0 : 2;
            }
            catch (Exception e)
            {
                Debug.LogException(e);
            }

            EditorApplication.Exit(code);
        }

        public static BuildReport BuildIOS(string outputPath)
        {
            if (!BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.iOS, BuildTarget.iOS))
            {
                Debug.LogError("[NeonRush] iOS Build Support is not installed for this Unity Editor. Add it in Unity Hub › Installs › Add modules › iOS Build Support.");
                return null;
            }

            NeonRushProjectSetup.Configure();
            NeonRushSceneBuilder.EnsureBuilt();

            if (EditorUserBuildSettings.activeBuildTarget != BuildTarget.iOS)
            {
                EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.iOS, BuildTarget.iOS);
            }

            Directory.CreateDirectory(outputPath);
            var options = new BuildPlayerOptions
            {
                scenes = new[] { NeonRushSceneBuilder.ScenePath },
                locationPathName = outputPath,
                target = BuildTarget.iOS,
                targetGroup = BuildTargetGroup.iOS,
                options = BuildOptions.None,
            };

            Debug.Log("[NeonRush] Building iOS Xcode project → " + Path.GetFullPath(outputPath));
            BuildReport report = BuildPipeline.BuildPlayer(options);
            BuildSummary s = report.summary;
            Debug.Log("[NeonRush] iOS build " + s.result + " | errors " + s.totalErrors + " | warnings " + s.totalWarnings +
                      " | " + s.totalTime.TotalSeconds.ToString("0") + " s | output " + s.outputPath);
            return report;
        }

        private static string ArgValue(string name)
        {
            string[] args = Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length - 1; i++)
            {
                if (string.Equals(args[i], name, StringComparison.OrdinalIgnoreCase))
                {
                    return args[i + 1];
                }
            }

            return null;
        }
    }
}
