using System.IO;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEditor.Callbacks;
using UnityEngine;

namespace NeonRush.EditorTools
{
    /// <summary>
    /// Final Info.plist adjustments for the exported Xcode project. Plain-text editing keeps
    /// this independent of whether the iOS module's Xcode API is compiled in.
    /// • CADisableMinimumFrameDurationOnPhone = YES → unlocks 120 Hz on ProMotion iPhones.
    /// • ITSAppUsesNonExemptEncryption = NO → no encryption export questions (no networking).
    /// • UIRequiresPersistentWiFi = NO → fully offline.
    /// No entitlements or extra permissions are added.
    /// </summary>
    public static class NeonRushIOSPostProcess
    {
        [PostProcessBuild(100)]
        public static void OnPostProcessBuild(BuildTarget target, string path)
        {
            if (target != BuildTarget.iOS) return;

            string plistPath = Path.Combine(path, "Info.plist");
            if (!File.Exists(plistPath))
            {
                Debug.LogWarning("[NeonRush] Info.plist not found at " + plistPath);
                return;
            }

            string plist = File.ReadAllText(plistPath);
            plist = SetBool(plist, "CADisableMinimumFrameDurationOnPhone", true);
            plist = SetBool(plist, "ITSAppUsesNonExemptEncryption", false);
            plist = SetBool(plist, "UIRequiresPersistentWiFi", false);
            File.WriteAllText(plistPath, plist);
            Debug.Log("[NeonRush] Info.plist patched (ProMotion 120 Hz unlock, offline, no encryption).");
        }

        public static string SetBool(string plist, string key, bool value)
        {
            string val = value ? "<true/>" : "<false/>";
            var existing = new Regex("<key>" + Regex.Escape(key) + "</key>\\s*<(true|false)\\s*/>");
            if (existing.IsMatch(plist))
            {
                return existing.Replace(plist, "<key>" + key + "</key>\n\t" + val, 1);
            }

            int end = plist.LastIndexOf("</dict>", System.StringComparison.Ordinal);
            if (end < 0) return plist;
            return plist.Insert(end, "\t<key>" + key + "</key>\n\t" + val + "\n");
        }
    }
}
