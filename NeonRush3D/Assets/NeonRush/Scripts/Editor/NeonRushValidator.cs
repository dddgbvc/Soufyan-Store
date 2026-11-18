using System.Collections.Generic;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace NeonRush.EditorTools
{
    /// <summary>
    /// Finds Missing References (broken links), unassigned NeonRush fields, and missing scripts
    /// in the open scene and in the NeonRush prefabs.
    /// </summary>
    public static class NeonRushValidator
    {
        [MenuItem("NeonRush/3. Validate Scene (Missing References)", priority = 3)]
        public static void ValidateFromMenu()
        {
            List<string> issues = ValidateOpenScene();
            issues.AddRange(ValidatePrefabs(NeonRushProjectSetup.Root + "/Prefabs"));
            if (issues.Count == 0)
            {
                Debug.Log("[NeonRush] Validation passed: no missing references, no missing scripts.");
            }
            else
            {
                foreach (string i in issues) Debug.LogError("[NeonRush] " + i);
            }

            EditorUtility.DisplayDialog("NEON RUSH", issues.Count == 0 ? "Validation passed." : issues.Count + " issue(s). See Console.", "OK");
        }

        public static List<string> ValidateOpenScene()
        {
            var issues = new List<string>();
            Scene scene = SceneManager.GetActiveScene();
            foreach (GameObject root in scene.GetRootGameObjects())
            {
                ValidateHierarchy(root, scene.name, issues);
            }

            return issues;
        }

        public static List<string> ValidatePrefabs(string folder)
        {
            var issues = new List<string>();
            if (!AssetDatabase.IsValidFolder(folder)) return issues;
            foreach (string guid in AssetDatabase.FindAssets("t:Prefab", new[] { folder }))
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                GameObject prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                if (prefab != null) ValidateHierarchy(prefab, path, issues);
            }

            return issues;
        }

        private static void ValidateHierarchy(GameObject root, string context, List<string> issues)
        {
            foreach (Transform t in root.GetComponentsInChildren<Transform>(true))
            {
                GameObject go = t.gameObject;
                int missingScripts = GameObjectUtility.GetMonoBehavioursWithMissingScriptCount(go);
                if (missingScripts > 0)
                {
                    issues.Add(context + ": '" + PathOf(t) + "' has " + missingScripts + " missing script(s)");
                }

                foreach (Component c in go.GetComponents<Component>())
                {
                    if (c == null) continue;
                    bool ours = c.GetType().Namespace == "NeonRush";
                    var so = new SerializedObject(c);
                    SerializedProperty p = so.GetIterator();
                    while (p.NextVisible(true))
                    {
                        if (p.propertyType != SerializedPropertyType.ObjectReference) continue;
                        if (p.objectReferenceValue != null) continue;

                        if (p.objectReferenceInstanceIDValue != 0)
                        {
                            issues.Add(context + ": MISSING reference " + c.GetType().Name + "." + p.propertyPath + " on '" + PathOf(t) + "'");
                        }
                        else if (ours)
                        {
                            issues.Add(context + ": UNASSIGNED " + c.GetType().Name + "." + p.propertyPath + " on '" + PathOf(t) + "'");
                        }
                    }
                }
            }
        }

        private static string PathOf(Transform t)
        {
            string path = t.name;
            for (Transform p = t.parent; p != null; p = p.parent) path = p.name + "/" + path;
            return path;
        }

        /// <summary>Opens the game scene (if needed) and validates it. Used by tests.</summary>
        public static List<string> ValidateGameScene()
        {
            Scene s = EditorSceneManager.OpenScene(NeonRushSceneBuilder.ScenePath, OpenSceneMode.Single);
            var issues = ValidateOpenScene();
            issues.AddRange(ValidatePrefabs(NeonRushProjectSetup.Root + "/Prefabs"));
            return issues;
        }
    }
}
