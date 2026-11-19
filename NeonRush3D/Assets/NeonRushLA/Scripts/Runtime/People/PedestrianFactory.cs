using System.Collections.Generic;
using NeonRushLA.Geometry;
using UnityEngine;

namespace NeonRushLA.People
{
    /// <summary>Builds the pedestrian prefab: skinned mesh + bone rig + dormant ragdoll + hit trigger.</summary>
    public static class PedestrianFactory
    {
        public static GameObject Build(MaterialLibrary lib, out Mesh mesh)
        {
            HumanModel model = HumanGenerator.Build();
            var root = new GameObject("Pedestrian");
            root.layer = LALayers.Pedestrian;

            // Bones (identity rotations; positions relative to parent).
            var bones = new Transform[HumanGenerator.BindPosition.Length];
            for (int i = 0; i < bones.Length; i++)
            {
                var b = new GameObject(((HumanGenerator.Bone)i).ToString()).transform;
                int p = HumanGenerator.Parent[i];
                b.SetParent(p < 0 ? root.transform : bones[p], false);
                Vector3 parentPos = p < 0 ? Vector3.zero : HumanGenerator.BindPosition[p];
                b.localPosition = HumanGenerator.BindPosition[i] - parentPos;
                b.gameObject.layer = LALayers.Ragdoll;
                bones[i] = b;
            }

            // Skinned mesh (rigid weights).
            var verts = new List<Vector3>();
            var normals = new List<Vector3>();
            var uvs = new List<Vector2>();
            var weights = new List<BoneWeight>();
            var subs = new List<int[]>();
            var mats = new List<Material>();
            foreach (string slot in HumanGenerator.Slots)
            {
                if (!model.Parts.TryGetValue(slot, out MeshData md)) continue;
                int offset = verts.Count;
                verts.AddRange(md.Vertices);
                normals.AddRange(md.Normals);
                uvs.AddRange(md.UVs);
                List<int> bi = model.Bones[slot];
                for (int i = 0; i < md.VertexCount; i++) weights.Add(new BoneWeight { boneIndex0 = bi[i], weight0 = 1f });
                var tris = new int[md.Triangles.Count];
                for (int i = 0; i < tris.Length; i++) tris[i] = md.Triangles[i] + offset;
                subs.Add(tris);
                mats.Add(lib.Get(slot + "0"));
            }

            mesh = new Mesh { name = "Pedestrian" };
            mesh.SetVertices(verts);
            mesh.SetNormals(normals);
            mesh.SetUVs(0, uvs);
            mesh.subMeshCount = subs.Count;
            for (int i = 0; i < subs.Count; i++) mesh.SetTriangles(subs[i], i);
            mesh.boneWeights = weights.ToArray();
            var bind = new Matrix4x4[bones.Length];
            for (int i = 0; i < bones.Length; i++) bind[i] = bones[i].worldToLocalMatrix * root.transform.localToWorldMatrix;
            mesh.bindposes = bind;
            mesh.RecalculateBounds();

            var smrGo = new GameObject("Body");
            smrGo.layer = LALayers.Pedestrian;
            smrGo.transform.SetParent(root.transform, false);
            var smr = smrGo.AddComponent<SkinnedMeshRenderer>();
            smr.sharedMesh = mesh;
            smr.bones = bones;
            smr.rootBone = bones[0];
            smr.sharedMaterials = mats.ToArray();
            smr.quality = SkinQuality.Bone1;
            smr.localBounds = new Bounds(new Vector3(0f, 0f, 0f), new Vector3(1.2f, 2.2f, 1.2f));
            smr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;

            // Ragdoll: body per major bone, joints to the parent body.
            var bodies = new List<Rigidbody>();
            var cols = new List<Collider>();
            var map = new Dictionary<int, Rigidbody>();
            int[] ragBones = { 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 };
            float[] masses = { 12f, 14f, 5f, 2.5f, 1.8f, 2.5f, 1.8f, 8f, 4f, 8f, 4f };
            for (int k = 0; k < ragBones.Length; k++)
            {
                int i = ragBones[k];
                Transform b = bones[i];
                var rb = b.gameObject.AddComponent<Rigidbody>();
                rb.mass = masses[k];
                rb.isKinematic = true;
                rb.interpolation = RigidbodyInterpolation.Interpolate;
                Collider col = AddLimbCollider(b, i);
                col.enabled = false;
                bodies.Add(rb);
                cols.Add(col);
                map[i] = rb;
                if (i != 0)
                {
                    int parentBody = i == 2 ? 0 : HumanGenerator.Parent[i] == 1 ? 0 : HumanGenerator.Parent[i];
                    if (!map.TryGetValue(parentBody, out Rigidbody parentRb)) parentRb = map[0];
                    var j = b.gameObject.AddComponent<CharacterJoint>();
                    j.connectedBody = parentRb;
                    j.enableProjection = true;
                    j.lowTwistLimit = new SoftJointLimit { limit = -35f };
                    j.highTwistLimit = new SoftJointLimit { limit = 35f };
                    j.swing1Limit = new SoftJointLimit { limit = i == 9 || i == 11 || i == 5 || i == 7 ? 80f : 45f };
                    j.swing2Limit = new SoftJointLimit { limit = 30f };
                }
            }

            // Hit trigger on the root (kinematic body so trigger events are reliable).
            var rootRb = root.AddComponent<Rigidbody>();
            rootRb.isKinematic = true;
            var trigger = root.AddComponent<CapsuleCollider>();
            trigger.isTrigger = true;
            trigger.center = new Vector3(0f, 0.9f, 0f);
            trigger.height = 1.8f;
            trigger.radius = 0.32f;

            var ped = root.AddComponent<Pedestrian>();
            ped.Configure(bones, bodies.ToArray(), cols.ToArray(), smr, trigger);
            return root;
        }

        private static Collider AddLimbCollider(Transform b, int bone)
        {
            switch ((HumanGenerator.Bone)bone)
            {
                case HumanGenerator.Bone.Head:
                {
                    var s = b.gameObject.AddComponent<SphereCollider>();
                    s.center = new Vector3(0f, 0.11f, 0.01f);
                    s.radius = 0.11f;
                    return s;
                }
                case HumanGenerator.Bone.Hips:
                case HumanGenerator.Bone.Chest:
                {
                    var bc = b.gameObject.AddComponent<BoxCollider>();
                    bc.center = bone == 0 ? new Vector3(0f, 0.04f, 0f) : new Vector3(0f, 0.04f, 0f);
                    bc.size = bone == 0 ? new Vector3(0.32f, 0.22f, 0.2f) : new Vector3(0.36f, 0.3f, 0.22f);
                    return bc;
                }
                default:
                {
                    var c = b.gameObject.AddComponent<CapsuleCollider>();
                    bool arm = bone >= 4 && bone <= 7;
                    float len = arm ? 0.28f : 0.43f;
                    c.direction = 1;
                    c.center = new Vector3(0f, -len * 0.5f, 0f);
                    c.height = len;
                    c.radius = arm ? 0.045f : 0.07f;
                    return c;
                }
            }
        }
    }
}
