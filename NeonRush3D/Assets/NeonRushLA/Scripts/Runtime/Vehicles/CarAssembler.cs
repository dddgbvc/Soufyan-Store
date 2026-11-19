using System.Collections.Generic;
using NeonRushLA.Geometry;
using UnityEngine;
using UnityEngine.Rendering;

namespace NeonRushLA.Vehicles
{
    /// <summary>
    /// Turns a generated <see cref="CarModel"/> into Unity objects: the drivable player car
    /// (Rigidbody + 4 WheelColliders + controller/damage/audio) or a lightweight traffic car.
    /// Used by the Editor to author prefabs; every created mesh is returned so it can be saved.
    /// </summary>
    public static class CarAssembler
    {
        public sealed class Result
        {
            public GameObject Root;
            public readonly List<Mesh> Meshes = new List<Mesh>();
            public readonly List<Object> Extra = new List<Object>(); // physic materials etc. (saved as assets by the editor)
        }

        private static readonly string[] SlotOrder = CarGenerator.AllMaterials;

        public static Result BuildPlayer(CarSpec spec, MaterialLibrary lib)
        {
            var res = new Result();
            CarModel hi = CarGenerator.Build(spec, 1f);
            CarModel lo = CarGenerator.Build(spec, 0.4f);

            var root = new GameObject(spec.Name.Replace(" ", ""));
            root.layer = LALayers.Vehicle;
            res.Root = root;

            // Body LOD0 / LOD1
            var lodRoot = new GameObject("Model").transform;
            lodRoot.SetParent(root.transform, false);
            Renderer body0 = BodyRenderer("Body_LOD0", lodRoot, hi.Body, lib, true, LALayers.Vehicle, res, out List<string> slots);
            Renderer body1 = BodyRenderer("Body_LOD1", lodRoot, lo.Body, lib, false, LALayers.Vehicle, res, out _);
            var lod = root.AddComponent<LODGroup>();
            lod.SetLODs(new[] { new LOD(0.18f, new[] { body0 }), new LOD(0.01f, new[] { body1 }) });
            lod.RecalculateBounds();

            // Physics body
            var rb = root.AddComponent<Rigidbody>();
            rb.mass = 1750f;
            rb.drag = 0.015f;
            rb.angularDrag = 0.35f;
            rb.interpolation = RigidbodyInterpolation.Interpolate;
            rb.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;

            var pm = new PhysicMaterial("CarBody") { dynamicFriction = 0.3f, staticFriction = 0.35f, bounciness = 0.05f, frictionCombine = PhysicMaterialCombine.Minimum };
            res.Extra.Add(pm);
            float len = spec.Length;
            var main = root.AddComponent<BoxCollider>();
            main.center = new Vector3(0f, (spec.Sill + spec.Belt) * 0.5f + 0.02f, (spec.FrontZ + spec.RearZ) * 0.5f);
            main.size = new Vector3(spec.HalfWidth * 2f - 0.02f, spec.Belt - spec.Sill - 0.04f, len - 0.04f);
            main.sharedMaterial = pm;
            var cabin = root.AddComponent<BoxCollider>();
            cabin.center = new Vector3(0f, (spec.Belt + spec.Roof) * 0.5f, (spec.RoofFront + spec.RoofRear) * 0.5f - 0.05f);
            cabin.size = new Vector3(spec.HalfWidth * 2f * 0.78f, spec.Roof - spec.Belt, (spec.WindshieldBase - spec.RearWindowBase) * 0.75f);
            cabin.sharedMaterial = pm;

            // Wheels
            var wcs = new WheelCollider[4];
            var visuals = new Transform[4];
            var calipers = new Transform[4];
            string[] names = { "FL", "FR", "RL", "RR" };
            Mesh wheelL = MeshUtil.ToMesh(hi.WheelLeft, "Wheel_L", out List<string> wSlots, SlotOrder);
            Mesh wheelR = MeshUtil.ToMesh(hi.WheelRight, "Wheel_R", out _, SlotOrder);
            Mesh calL = MeshUtil.ToMesh(hi.CaliperLeft, "Caliper_L", out List<string> cSlots, SlotOrder);
            Mesh calR = MeshUtil.ToMesh(hi.CaliperRight, "Caliper_R", out _, SlotOrder);
            res.Meshes.Add(wheelL);
            res.Meshes.Add(wheelR);
            res.Meshes.Add(calL);
            res.Meshes.Add(calR);
            const float suspension = 0.17f;
            for (int i = 0; i < 4; i++)
            {
                Vector3 c = spec.WheelCenter(i);
                bool left = i % 2 == 0;
                var wcGo = new GameObject("WC_" + names[i]);
                wcGo.layer = LALayers.Vehicle;
                wcGo.transform.SetParent(root.transform, false);
                wcGo.transform.localPosition = c + Vector3.up * (suspension * 0.45f);
                WheelCollider wc = wcGo.AddComponent<WheelCollider>();
                ConfigureWheel(wc, spec.WheelRadius, suspension, i < 2);
                wcs[i] = wc;

                visuals[i] = MeshChild("Wheel_" + names[i], root.transform, left ? wheelL : wheelR, MeshUtil.Materials(lib, wSlots), c, true);
                calipers[i] = MeshChild("Caliper_" + names[i], root.transform, left ? calL : calR, MeshUtil.Materials(lib, cSlots), c, false);
            }

            var vc = root.AddComponent<VehicleController>();
            vc.SetWheels(wcs[0], wcs[1], wcs[2], wcs[3], visuals[0], visuals[1], visuals[2], visuals[3]);
            vc.SetCalipers(calipers);

            var dmg = root.AddComponent<VehicleDamage>();
            var bodyMr = (MeshRenderer)body0;
            dmg.Configure(body0.GetComponent<MeshFilter>(), bodyMr, slots.IndexOf(CarGenerator.Headlight), slots.IndexOf(CarGenerator.Taillight),
                slots.IndexOf(CarGenerator.Paint), lib.Get("LightBroken"), spec.FrontZ - 0.45f, spec.RearZ + 0.45f);

            var input = root.AddComponent<VehicleInput>();
            input.Configure(vc);

            var audioGo = new GameObject("Audio");
            audioGo.transform.SetParent(root.transform, false);
            var engine = audioGo.AddComponent<AudioSource>();
            var screech = audioGo.AddComponent<AudioSource>();
            var hits = audioGo.AddComponent<AudioSource>();
            var va = root.AddComponent<VehicleAudio>();
            va.Configure(vc, dmg, engine, screech, hits);
            return res;
        }

        public static void ConfigureWheel(WheelCollider wc, float radius, float suspension, bool frontAxle)
        {
            wc.mass = 22f;
            wc.radius = radius;
            wc.wheelDampingRate = 0.4f;
            wc.suspensionDistance = suspension;
            wc.forceAppPointDistance = 0.12f;
            wc.suspensionSpring = new JointSpring { spring = frontAxle ? 62000f : 56000f, damper = frontAxle ? 5200f : 4800f, targetPosition = 0.45f };
            wc.forwardFriction = new WheelFrictionCurve
            {
                extremumSlip = 0.38f, extremumValue = 1.0f, asymptoteSlip = 0.85f, asymptoteValue = 0.72f, stiffness = 1.65f
            };
            wc.sidewaysFriction = new WheelFrictionCurve
            {
                extremumSlip = 0.24f, extremumValue = 1.0f, asymptoteSlip = 0.55f, asymptoteValue = 0.78f, stiffness = frontAxle ? 1.85f : 1.75f
            };
        }

        private static Renderer BodyRenderer(string name, Transform parent, PartSet set, MaterialLibrary lib, bool shadows, int layer, Result res, out List<string> slots)
        {
            var go = new GameObject(name);
            go.layer = layer;
            go.transform.SetParent(parent, false);
            Mesh mesh = MeshUtil.ToMesh(set, name, out slots, SlotOrder);
            res.Meshes.Add(mesh);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterials = MeshUtil.Materials(lib, slots);
            mr.shadowCastingMode = shadows ? ShadowCastingMode.On : ShadowCastingMode.Off;
            mr.lightProbeUsage = LightProbeUsage.Off;
            return mr;
        }

        private static Transform MeshChild(string name, Transform parent, Mesh mesh, Material[] mats, Vector3 localPos, bool shadows)
        {
            var go = new GameObject(name);
            go.layer = parent.gameObject.layer;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterials = mats;
            mr.shadowCastingMode = shadows ? ShadowCastingMode.On : ShadowCastingMode.Off;
            mr.lightProbeUsage = LightProbeUsage.Off;
            return go.transform;
        }

        // ------------------------------------------------------------------ traffic

        public static Result BuildTraffic(CarSpec spec, MaterialLibrary lib, Material paint)
        {
            var res = new Result();
            CarModel m0 = CarGenerator.Build(spec, 0.55f);
            CarModel m1 = CarGenerator.Build(spec, 0.35f);
            var root = new GameObject(spec.Name);
            root.layer = LALayers.Traffic;
            res.Root = root;

            Renderer r0 = BodyRenderer("Body_LOD0", root.transform, m0.Body, lib, true, LALayers.Traffic, res, out List<string> slots);
            Renderer r1 = BodyRenderer("Body_LOD1", root.transform, m1.Body, lib, false, LALayers.Traffic, res, out List<string> slots1);
            ReplacePaint(r0, slots, paint);
            ReplacePaint(r1, slots1, paint);

            Mesh wl = MeshUtil.ToMesh(m1.WheelLeft, spec.Name + "_WheelL", out List<string> ws, SlotOrder);
            Mesh wr = MeshUtil.ToMesh(m1.WheelRight, spec.Name + "_WheelR", out _, SlotOrder);
            res.Meshes.Add(wl);
            res.Meshes.Add(wr);
            var wheels = new Transform[4];
            var wheelRenderers = new List<Renderer>();
            for (int i = 0; i < 4; i++)
            {
                wheels[i] = MeshChild("Wheel" + i, root.transform, i % 2 == 0 ? wl : wr, MeshUtil.Materials(lib, ws), spec.WheelCenter(i), false);
                wheelRenderers.Add(wheels[i].GetComponent<Renderer>());
            }

            var lods = new List<Renderer> { r0 };
            lods.AddRange(wheelRenderers);
            var lod = root.AddComponent<LODGroup>();
            lod.SetLODs(new[] { new LOD(0.12f, lods.ToArray()), new LOD(0.008f, new[] { r1 }) });
            lod.RecalculateBounds();

            var rb = root.AddComponent<Rigidbody>();
            rb.mass = spec.Kind == CarKind.Pickup || spec.Kind == CarKind.SUV ? 2100f : 1450f;
            rb.interpolation = RigidbodyInterpolation.Interpolate;
            rb.collisionDetectionMode = CollisionDetectionMode.Discrete;
            rb.centerOfMass = new Vector3(0f, 0.45f, 0f);
            var box = root.AddComponent<BoxCollider>();
            box.center = new Vector3(0f, (spec.Sill + spec.Roof) * 0.5f + 0.03f, (spec.FrontZ + spec.RearZ) * 0.5f);
            box.size = new Vector3(spec.HalfWidth * 2f, spec.Roof - spec.Sill - 0.05f, spec.Length);
            var tpm = new PhysicMaterial("TrafficBody") { dynamicFriction = 0f, staticFriction = 0f, frictionCombine = PhysicMaterialCombine.Minimum, bounciness = 0.05f };
            res.Extra.Add(tpm);
            box.sharedMaterial = tpm;

            var tc = root.AddComponent<Traffic.TrafficCar>();
            tc.Configure(wheels, spec.WheelRadius, spec.Length, spec.Kind);
            return res;
        }

        private static void ReplacePaint(Renderer r, List<string> slots, Material paint)
        {
            int i = slots.IndexOf(CarGenerator.Paint);
            if (i < 0 || paint == null) return;
            Material[] mats = r.sharedMaterials;
            mats[i] = paint;
            r.sharedMaterials = mats;
        }
    }
}
