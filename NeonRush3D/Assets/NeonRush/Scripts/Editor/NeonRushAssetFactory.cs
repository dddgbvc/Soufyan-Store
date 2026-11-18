using System.Collections.Generic;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace NeonRush.EditorTools
{
    /// <summary>
    /// Creates (or updates in place) NEON RUSH materials and combined meshes. Only touches
    /// files inside Assets/NeonRush.
    /// </summary>
    public static class NeonRushAssetFactory
    {
        public const string MaterialFolder = NeonRushProjectSetup.Root + "/Materials";
        public const string MeshFolder = NeonRushProjectSetup.Root + "/Meshes";

        public sealed class Palette
        {
            public Material Road, Sidewalk, Building, LaneDash, NeonCyan, NeonPurple, NeonPink;
            public Material CarBody, CarGlass, Tire, Headlight, Taillight, Underglow;
            public Material ObstacleBody, ObstacleStripe, Skyline, SpeedLine;
        }

        private const string LitShader = "Universal Render Pipeline/Simple Lit";
        private const string UnlitShader = "Universal Render Pipeline/Unlit";
        private const string ParticleShader = "Universal Render Pipeline/Particles/Unlit";

        public static Palette CreatePalette()
        {
            var p = new Palette
            {
                Road = Lit("M_Road", new Color(0.022f, 0.022f, 0.04f), 0.82f, new Color(0.3f, 0.3f, 0.42f)),
                Sidewalk = Lit("M_Sidewalk", new Color(0.05f, 0.045f, 0.085f), 0.35f, new Color(0.1f, 0.1f, 0.15f)),
                Building = Lit("M_Building", new Color(0.035f, 0.035f, 0.065f), 0.55f, new Color(0.2f, 0.2f, 0.3f)),
                LaneDash = Unlit("M_LaneDash", new Color(0.55f, 1.3f, 1.6f)),
                NeonCyan = Unlit("M_NeonCyan", new Color(0.12f, 2.6f, 3.2f)),
                NeonPurple = Unlit("M_NeonPurple", new Color(2.0f, 0.3f, 3.2f)),
                NeonPink = Unlit("M_NeonPink", new Color(3.2f, 0.25f, 1.3f)),
                CarBody = Lit("M_CarBody", new Color(0.04f, 0.05f, 0.11f), 0.92f, new Color(0.65f, 0.65f, 0.85f)),
                CarGlass = Lit("M_CarGlass", new Color(0.015f, 0.04f, 0.09f), 0.97f, new Color(1f, 1f, 1f)),
                Tire = Lit("M_Tire", new Color(0.018f, 0.018f, 0.022f), 0.2f, new Color(0.05f, 0.05f, 0.05f)),
                Headlight = Unlit("M_Headlight", new Color(4f, 4.2f, 4.6f)),
                Taillight = Unlit("M_Taillight", new Color(4f, 0.18f, 0.35f)),
                Underglow = Unlit("M_Underglow", new Color(1.1f, 0.15f, 2.1f)),
                ObstacleBody = Lit("M_ObstacleBody", new Color(0.09f, 0.025f, 0.11f), 0.6f, new Color(0.4f, 0.3f, 0.5f)),
                ObstacleStripe = Unlit("M_ObstacleStripe", new Color(3.6f, 0.35f, 0.6f)),
                Skyline = Unlit("M_Skyline", new Color(0.03f, 0.018f, 0.07f)),
                SpeedLine = Additive("M_SpeedLine", new Color(0.55f, 1.4f, 1.9f, 0.55f)),
            };
            AssetDatabase.SaveAssets();
            return p;
        }

        private static Material LoadOrCreate(string name, string shaderName, string fallback)
        {
            string path = MaterialFolder + "/" + name + ".mat";
            Shader shader = Shader.Find(shaderName);
            if (shader == null)
            {
                Debug.LogWarning("[NeonRush] Shader '" + shaderName + "' not found (is URP installed?). Using '" + fallback + "'.");
                shader = Shader.Find(fallback);
            }

            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (mat == null)
            {
                mat = new Material(shader) { name = name };
                AssetDatabase.CreateAsset(mat, path);
            }
            else if (mat.shader != shader)
            {
                mat.shader = shader;
            }

            mat.enableInstancing = true;
            return mat;
        }

        private static Material Lit(string name, Color baseColor, float smoothness, Color spec)
        {
            Material m = LoadOrCreate(name, LitShader, "Standard");
            SetColor(m, "_BaseColor", baseColor);
            SetColor(m, "_Color", baseColor);
            SetColor(m, "_SpecColor", spec);
            if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", smoothness);
            if (m.HasProperty("_Glossiness")) m.SetFloat("_Glossiness", smoothness);
            m.EnableKeyword("_SPECULAR_COLOR");
            if (m.HasProperty("_SpecularHighlights")) m.SetFloat("_SpecularHighlights", 1f);
            EditorUtility.SetDirty(m);
            return m;
        }

        private static Material Unlit(string name, Color hdrColor)
        {
            Material m = LoadOrCreate(name, UnlitShader, "Unlit/Color");
            SetColor(m, "_BaseColor", hdrColor);
            SetColor(m, "_Color", hdrColor);
            EditorUtility.SetDirty(m);
            return m;
        }

        private static Material Additive(string name, Color color)
        {
            Material m = LoadOrCreate(name, ParticleShader, "Legacy Shaders/Particles/Additive");
            SetColor(m, "_BaseColor", color);
            SetColor(m, "_TintColor", color);
            if (m.HasProperty("_Surface")) m.SetFloat("_Surface", 1f);   // Transparent
            if (m.HasProperty("_Blend")) m.SetFloat("_Blend", 2f);       // Additive
            if (m.HasProperty("_SrcBlend")) m.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
            if (m.HasProperty("_DstBlend")) m.SetFloat("_DstBlend", (float)BlendMode.One);
            if (m.HasProperty("_ZWrite")) m.SetFloat("_ZWrite", 0f);
            m.SetOverrideTag("RenderType", "Transparent");
            m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            m.renderQueue = (int)RenderQueue.Transparent;
            EditorUtility.SetDirty(m);
            return m;
        }

        private static void SetColor(Material m, string prop, Color c)
        {
            if (m.HasProperty(prop)) m.SetColor(prop, c);
        }

        // ------------------------------------------------------------------ primitives

        private static readonly Dictionary<PrimitiveType, Mesh> PrimitiveMeshes = new Dictionary<PrimitiveType, Mesh>();

        public static Mesh PrimitiveMesh(PrimitiveType type)
        {
            if (PrimitiveMeshes.TryGetValue(type, out Mesh mesh) && mesh != null)
            {
                return mesh;
            }

            GameObject tmp = GameObject.CreatePrimitive(type);
            mesh = tmp.GetComponent<MeshFilter>().sharedMesh;
            Object.DestroyImmediate(tmp);
            PrimitiveMeshes[type] = mesh;
            return mesh;
        }

        /// <summary>Creates a primitive child without a collider.</summary>
        public static GameObject Part(string name, Transform parent, PrimitiveType type, Vector3 localPos, Vector3 localScale, Material mat, Vector3 euler = default)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.transform.localEulerAngles = euler;
            go.transform.localScale = localScale;
            go.AddComponent<MeshFilter>().sharedMesh = PrimitiveMesh(type);
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = mat;
            ConfigureRenderer(mr);
            return go;
        }

        public static void ConfigureRenderer(MeshRenderer mr)
        {
            mr.shadowCastingMode = ShadowCastingMode.Off;
            mr.receiveShadows = false;
            mr.lightProbeUsage = LightProbeUsage.Off;
            mr.reflectionProbeUsage = ReflectionProbeUsage.Off;
            mr.motionVectorGenerationMode = MotionVectorGenerationMode.ForceNoMotion;
            mr.allowOcclusionWhenDynamic = false;
        }

        /// <summary>
        /// Merges every MeshFilter under <paramref name="root"/> (except those under
        /// <paramref name="keep"/>) into one mesh per material, saved as an asset. Reduces a
        /// dozen draw calls to one per material.
        /// </summary>
        public static void CombineByMaterial(Transform root, string assetPrefix, ICollection<Transform> keep = null)
        {
            var groups = new Dictionary<Material, List<CombineInstance>>();
            var toDelete = new List<GameObject>();
            Matrix4x4 toRoot = root.worldToLocalMatrix;

            foreach (MeshFilter mf in root.GetComponentsInChildren<MeshFilter>(true))
            {
                if (mf.transform == root || IsUnderAny(mf.transform, keep))
                {
                    continue;
                }

                var mr = mf.GetComponent<MeshRenderer>();
                if (mr == null || mf.sharedMesh == null)
                {
                    continue;
                }

                if (!groups.TryGetValue(mr.sharedMaterial, out List<CombineInstance> list))
                {
                    list = new List<CombineInstance>();
                    groups.Add(mr.sharedMaterial, list);
                }

                list.Add(new CombineInstance { mesh = mf.sharedMesh, transform = toRoot * mf.transform.localToWorldMatrix });
                toDelete.Add(mf.gameObject);
            }

            foreach (KeyValuePair<Material, List<CombineInstance>> g in groups)
            {
                string meshName = assetPrefix + "_" + g.Key.name;
                var mesh = new Mesh { name = meshName };
                mesh.CombineMeshes(g.Value.ToArray(), true, true);
                mesh.RecalculateBounds();
                mesh.UploadMeshData(false);
                mesh = SaveMesh(mesh, MeshFolder + "/" + meshName + ".asset");

                var child = new GameObject("Mesh_" + g.Key.name);
                child.transform.SetParent(root, false);
                child.AddComponent<MeshFilter>().sharedMesh = mesh;
                var mr = child.AddComponent<MeshRenderer>();
                mr.sharedMaterial = g.Key;
                ConfigureRenderer(mr);
            }

            // Remove leaf parts that were merged, then any now-empty containers.
            foreach (GameObject go in toDelete)
            {
                Object.DestroyImmediate(go);
            }
        }

        private static bool IsUnderAny(Transform t, ICollection<Transform> roots)
        {
            if (roots == null) return false;
            for (Transform c = t; c != null; c = c.parent)
            {
                if (roots.Contains(c)) return true;
            }

            return false;
        }

        private static Mesh SaveMesh(Mesh mesh, string path)
        {
            var existing = AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if (existing != null)
            {
                EditorUtility.CopySerialized(mesh, existing);
                Object.DestroyImmediate(mesh);
                EditorUtility.SetDirty(existing);
                return existing;
            }

            AssetDatabase.CreateAsset(mesh, path);
            return mesh;
        }
    }
}
