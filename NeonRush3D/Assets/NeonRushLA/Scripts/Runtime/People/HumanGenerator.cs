using System.Collections.Generic;
using NeonRushLA.Geometry;
using UnityEngine;

namespace NeonRushLA.People
{
    /// <summary>Generated humanoid: per-material meshes with a bone index per vertex (rigid skinning).</summary>
    public sealed class HumanModel
    {
        public readonly Dictionary<string, MeshData> Parts = new Dictionary<string, MeshData>();
        public readonly Dictionary<string, List<int>> Bones = new Dictionary<string, List<int>>();
    }

    /// <summary>
    /// Simplified but naturally proportioned person (≈1.76 m, 7.5 heads): lofted torso, tapered
    /// limbs, head, hair, hands, shoes; 12-bone skeleton for walk/run/idle and ragdoll.
    /// </summary>
    public static class HumanGenerator
    {
        public const string Skin = "Skin";
        public const string Hair = "Hair";
        public const string Shirt = "Shirt";
        public const string Pants = "Pants";
        public const string Shoes = "Shoes";
        public static readonly string[] Slots = { Skin, Hair, Shirt, Pants, Shoes };

        public enum Bone
        {
            Hips, Spine, Chest, Head, UpperArmL, ForeArmL, UpperArmR, ForeArmR, ThighL, ShinL, ThighR, ShinR
        }

        public static readonly int[] Parent = { -1, 0, 1, 2, 2, 4, 2, 6, 0, 8, 0, 10 };

        public static readonly Vector3[] BindPosition =
        {
            new Vector3(0f, 0.98f, 0f),     // Hips
            new Vector3(0f, 1.18f, 0f),     // Spine
            new Vector3(0f, 1.36f, 0f),     // Chest
            new Vector3(0f, 1.56f, 0f),     // Head (neck base)
            new Vector3(-0.19f, 1.45f, 0f), // UpperArmL (shoulder)
            new Vector3(-0.215f, 1.17f, 0f),// ForeArmL (elbow)
            new Vector3(0.19f, 1.45f, 0f),
            new Vector3(0.215f, 1.17f, 0f),
            new Vector3(-0.095f, 0.94f, 0f),// ThighL (hip joint)
            new Vector3(-0.1f, 0.52f, 0.01f),// ShinL (knee)
            new Vector3(0.095f, 0.94f, 0f),
            new Vector3(0.1f, 0.52f, 0.01f),
        };

        public static HumanModel Build(float build = 1f)
        {
            var h = new HumanModel();
            // Torso: lofted elliptical sections, waist → chest → shoulders.
            var rings = new List<Vector3[]>();
            float[] ys = { 0.98f, 1.06f, 1.16f, 1.27f, 1.38f, 1.46f, 1.51f };
            float[] rx = { 0.165f, 0.155f, 0.15f, 0.165f, 0.185f, 0.19f, 0.12f };
            float[] rz = { 0.105f, 0.10f, 0.10f, 0.11f, 0.12f, 0.11f, 0.07f };
            for (int i = 0; i < ys.Length; i++)
            {
                var ring = new Vector3[14];
                for (int k = 0; k < 14; k++)
                {
                    float a = k / 14f * Mathf.PI * 2f;
                    ring[k] = new Vector3(Mathf.Cos(a) * rx[i] * build, ys[i], Mathf.Sin(a) * rz[i] * build);
                }

                rings.Add(ring);
            }

            var torso = new PartSet();
            Shapes.Loft(torso, rings, true, (r, s) => "x", p => new Vector3(p.x, 0f, p.z));
            Add(h, Shirt, torso["x"], v => v.y < 1.2f ? (int)Bone.Spine : (int)Bone.Chest);
            var top = new MeshData();
            Shapes.Cap(top, rings[rings.Count - 1], Vector3.up);
            Add(h, Shirt, top, v => (int)Bone.Chest);

            // Pelvis (pants) + belt line
            var pelvis = new MeshData();
            Shapes.Ellipsoid(pelvis, new Vector3(0f, 0.95f, 0f), new Vector3(0.17f * build, 0.11f, 0.11f * build), 12, 7);
            Add(h, Pants, pelvis, v => (int)Bone.Hips);

            // Neck + head + hair
            var neck = new MeshData();
            Shapes.CylinderBetween(neck, new Vector3(0, 1.49f, 0), new Vector3(0, 1.6f, 0.005f), 0.052f, 8, false);
            Add(h, Skin, neck, v => (int)Bone.Head);
            var head = new MeshData();
            Shapes.Ellipsoid(head, new Vector3(0f, 1.68f, 0.012f), new Vector3(0.082f, 0.108f, 0.098f), 12, 9);
            Add(h, Skin, head, v => (int)Bone.Head);
            var nose = new MeshData();
            Shapes.Ellipsoid(nose, new Vector3(0f, 1.665f, 0.105f), new Vector3(0.014f, 0.022f, 0.018f), 6, 4);
            Add(h, Skin, nose, v => (int)Bone.Head);
            var hair = new MeshData();
            Shapes.Ellipsoid(hair, new Vector3(0f, 1.725f, -0.004f), new Vector3(0.088f, 0.075f, 0.103f), 12, 6);
            Add(h, Hair, hair, v => (int)Bone.Head);

            // Arms
            for (int side = -1; side <= 1; side += 2)
            {
                int ua = side < 0 ? (int)Bone.UpperArmL : (int)Bone.UpperArmR;
                int fa = side < 0 ? (int)Bone.ForeArmL : (int)Bone.ForeArmR;
                var shoulder = new Vector3(side * 0.195f, 1.46f, 0f);
                var elbow = new Vector3(side * 0.215f, 1.17f, 0f);
                var wrist = new Vector3(side * 0.225f, 0.92f, 0.03f);
                var upper = new MeshData();
                Shapes.Tube(upper, new[] { shoulder + Vector3.up * 0.02f, elbow }, new[] { 0.052f, 0.042f }, 8, true, true);
                Add(h, Shirt, upper, v => ua);
                var fore = new MeshData();
                Shapes.Tube(fore, new[] { elbow, wrist }, new[] { 0.04f, 0.03f }, 8, true, true);
                Add(h, Skin, fore, v => fa);
                var hand = new MeshData();
                Shapes.Ellipsoid(hand, wrist + new Vector3(0f, -0.06f, 0.005f), new Vector3(0.028f, 0.07f, 0.045f), 8, 6);
                Add(h, Skin, hand, v => fa);
                var deltoid = new MeshData();
                Shapes.Ellipsoid(deltoid, shoulder + new Vector3(0f, -0.01f, 0f), new Vector3(0.06f, 0.06f, 0.06f), 8, 6);
                Add(h, Shirt, deltoid, v => ua);
            }

            // Legs
            for (int side = -1; side <= 1; side += 2)
            {
                int th = side < 0 ? (int)Bone.ThighL : (int)Bone.ThighR;
                int sh = side < 0 ? (int)Bone.ShinL : (int)Bone.ShinR;
                var hip = new Vector3(side * 0.095f, 0.97f, 0f);
                var knee = new Vector3(side * 0.1f, 0.52f, 0.01f);
                var ankle = new Vector3(side * 0.1f, 0.09f, 0f);
                var thigh = new MeshData();
                Shapes.Tube(thigh, new[] { hip, knee }, new[] { 0.078f, 0.056f }, 9, true, true);
                Add(h, Pants, thigh, v => th);
                var shin = new MeshData();
                Shapes.Tube(shin, new[] { knee, ankle }, new[] { 0.054f, 0.04f }, 9, true, true);
                Add(h, Pants, shin, v => sh);
                var foot = new MeshData();
                Shapes.RoundedBox(foot, new Vector3(side * 0.1f, 0.045f, 0.055f), new Vector3(0.095f, 0.08f, 0.25f), 0.03f, 2);
                Add(h, Shoes, foot, v => sh);
            }

            return h;
        }

        private static void Add(HumanModel h, string slot, MeshData m, System.Func<Vector3, int> bone)
        {
            if (!h.Parts.TryGetValue(slot, out MeshData target))
            {
                target = new MeshData();
                h.Parts.Add(slot, target);
                h.Bones.Add(slot, new List<int>());
            }

            target.Append(m);
            List<int> b = h.Bones[slot];
            for (int i = 0; i < m.VertexCount; i++) b.Add(bone(m.Vertices[i]));
        }
    }
}
