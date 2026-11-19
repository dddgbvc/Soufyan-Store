using System.Collections.Generic;
using NeonRushLA.Geometry;
using UnityEngine;
using UnityEngine.Rendering;

namespace NeonRushLA
{
    /// <summary>Converts engine-independent <see cref="PartSet"/> data into Unity meshes.</summary>
    public static class MeshUtil
    {
        /// <summary>One mesh with a sub-mesh per material slot (keys returned in order).</summary>
        public static Mesh ToMesh(PartSet set, string name, out List<string> slots, IList<string> order = null)
        {
            slots = new List<string>();
            if (order != null)
            {
                foreach (string k in order)
                {
                    if (set.Parts.TryGetValue(k, out MeshData md) && md.TriangleCount > 0) slots.Add(k);
                }
            }

            foreach (KeyValuePair<string, MeshData> kv in set.Parts)
            {
                if (kv.Value.TriangleCount > 0 && !slots.Contains(kv.Key)) slots.Add(kv.Key);
            }

            int total = 0;
            foreach (string k in slots) total += set.Parts[k].VertexCount;
            var verts = new List<Vector3>(total);
            var normals = new List<Vector3>(total);
            var uvs = new List<Vector2>(total);
            var subs = new List<int[]>();
            foreach (string k in slots)
            {
                MeshData md = set.Parts[k];
                int offset = verts.Count;
                verts.AddRange(md.Vertices);
                normals.AddRange(md.Normals);
                uvs.AddRange(md.UVs);
                var tris = new int[md.Triangles.Count];
                for (int i = 0; i < tris.Length; i++) tris[i] = md.Triangles[i] + offset;
                subs.Add(tris);
            }

            var mesh = new Mesh { name = name };
            if (total > 65000) mesh.indexFormat = IndexFormat.UInt32;
            mesh.SetVertices(verts);
            mesh.SetNormals(normals);
            mesh.SetUVs(0, uvs);
            mesh.subMeshCount = subs.Count;
            for (int i = 0; i < subs.Count; i++) mesh.SetTriangles(subs[i], i, false);
            mesh.RecalculateBounds();
            mesh.RecalculateTangents();
            return mesh;
        }

        public static Material[] Materials(MaterialLibrary lib, List<string> slots)
        {
            var mats = new Material[slots.Count];
            for (int i = 0; i < slots.Count; i++) mats[i] = lib.Get(slots[i]);
            return mats;
        }

        /// <summary>Creates a child renderer for a part set.</summary>
        public static GameObject CreateRenderer(string name, Transform parent, PartSet set, MaterialLibrary lib, bool castShadows, int layer, out Mesh mesh, out List<string> slots)
        {
            var go = new GameObject(name);
            go.layer = layer;
            go.transform.SetParent(parent, false);
            mesh = ToMesh(set, name, out slots);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterials = Materials(lib, slots);
            mr.shadowCastingMode = castShadows ? ShadowCastingMode.On : ShadowCastingMode.Off;
            mr.receiveShadows = true;
            mr.lightProbeUsage = LightProbeUsage.Off;
            mr.motionVectorGenerationMode = MotionVectorGenerationMode.ForceNoMotion;
            return go;
        }
    }
}
