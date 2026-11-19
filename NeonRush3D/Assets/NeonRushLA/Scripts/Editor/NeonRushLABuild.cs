using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace NeonRushLA.EditorTools
{
    /// <summary>iOS build for NEON RUSH LA v2.0.0 (LA scene first, classic scene included).</summary>
    public static class NeonRushLABuild
    {
        public const string DefaultPath = "Builds/iOS/XcodeLA";

        [MenuItem("NeonRush/LA/Export iOS Xcode Project (v2.0.0)", priority = 120)]
        public static void BuildFromMenu()
        {
            BuildReport r = Build(DefaultPath);
            EditorUtility.DisplayDialog("NEON RUSH LA", r != null && r.summary.result == BuildResult.Succeeded ? "Xcode project: " + Path.GetFullPath(DefaultPath) : "Build failed — see Console.", "OK");
        }

        /// <summary>Unity -batchmode -buildTarget iOS -executeMethod NeonRushLA.EditorTools.NeonRushLABuild.BuildIOSCommandLine [-customBuildPath p]</summary>
        public static void BuildIOSCommandLine()
        {
            string path = Arg("-customBuildPath") ?? DefaultPath;
            BuildReport r = null;
            try
            {
                r = Build(path);
            }
            catch (Exception e)
            {
                Debug.LogException(e);
            }

            EditorApplication.Exit(r != null && r.summary.result == BuildResult.Succeeded ? 0 : 1);
        }

        public static BuildReport Build(string path)
        {
            if (!BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.iOS, BuildTarget.iOS))
            {
                Debug.LogError("[NeonRushLA] iOS Build Support is not installed.");
                return null;
            }

            NeonRushLABuilder.BuildAll();
            if (EditorUserBuildSettings.activeBuildTarget != BuildTarget.iOS)
            {
                EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.iOS, BuildTarget.iOS);
            }

            Directory.CreateDirectory(path);
            var options = new BuildPlayerOptions
            {
                scenes = new[] { NeonRushLABuilder.ScenePath, NeonRush.EditorTools.NeonRushSceneBuilder.ScenePath },
                locationPathName = path,
                target = BuildTarget.iOS,
                targetGroup = BuildTargetGroup.iOS,
                options = BuildOptions.None,
            };
            BuildReport report = BuildPipeline.BuildPlayer(options);
            Debug.Log("[NeonRushLA] iOS build " + report.summary.result + " | v" + PlayerSettings.bundleVersion + " (" + PlayerSettings.iOS.buildNumber + ") | errors " +
                      report.summary.totalErrors + " | size " + (report.summary.totalSize / (1024 * 1024)) + " MB | " + report.summary.outputPath);
            return report;
        }

        private static string Arg(string name)
        {
            string[] a = Environment.GetCommandLineArgs();
            for (int i = 0; i < a.Length - 1; i++)
            {
                if (a[i] == name) return a[i + 1];
            }

            return null;
        }
    }
}
