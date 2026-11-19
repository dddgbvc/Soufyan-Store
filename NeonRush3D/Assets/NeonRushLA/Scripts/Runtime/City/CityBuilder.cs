using System.Collections.Generic;
using NeonRushLA.Geometry;
using UnityEngine;
using UnityEngine.Rendering;

namespace NeonRushLA.City
{
    /// <summary>
    /// Builds the city at load time from the deterministic layout: per-chunk combined meshes
    /// (Base / Detail LOD0 / Far LOD1), static colliders, signal heads and the minimap texture.
    /// Generating at runtime keeps the build small; it takes well under a second on device.
    /// </summary>
    public sealed class CityBuilder : MonoBehaviour
    {
        [SerializeField] private MaterialLibrary library;
        [SerializeField] private int seed = 2077;

        public CityLayout Layout { get; private set; }
        public CityData Data { get; private set; }
        public ChunkStreamer Streamer { get; private set; }
        public Texture2D Minimap { get; private set; }
        public float BuildMilliseconds { get; private set; }
        public int ChunkCount { get; private set; }
        public int ColliderCount { get; private set; }

        private readonly List<Mesh> _meshes = new List<Mesh>();

        public void Configure(MaterialLibrary lib)
        {
            library = lib;
        }

        public void Build()
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();
            Layout = new CityLayout(seed);
            Data = CityGenerator.Generate(Layout);

            var chunksRoot = new GameObject("Chunks").transform;
            chunksRoot.SetParent(transform, false);
            Streamer = gameObject.AddComponent<ChunkStreamer>();
            foreach (CityChunkData c in Data.Chunks)
            {
                var root = new GameObject("Chunk_" + c.Index).transform;
                root.SetParent(chunksRoot, false);
                GameObject baseGo = Part(root, "Base", c.Base, true, LALayers.Ground);
                GameObject detail = Part(root, "Detail", c.Detail, true, LALayers.Environment);
                GameObject far = Part(root, "Far", c.Far, false, LALayers.Environment);
                Streamer.Add(new Vector3(c.Bounds.center.x, 0f, c.Bounds.center.y), baseGo, detail, far);
                ChunkCount++;
            }

            GameObject freeway = Part(transform, "Freeway", Data.Freeway, true, LALayers.Ground);
            freeway.isStatic = true;

            BuildColliders();
            BuildSignals(chunksRoot);
            Minimap = DrawMinimap(512);
            sw.Stop();
            BuildMilliseconds = (float)sw.Elapsed.TotalMilliseconds;
        }

        private GameObject Part(Transform parent, string name, PartSet set, bool shadows, int layer)
        {
            var go = new GameObject(name);
            go.layer = layer;
            go.transform.SetParent(parent, false);
            if (set.TotalTriangles == 0) return go;
            Mesh mesh = MeshUtil.ToMesh(set, name, out List<string> slots, CityMeshes.AllSlots);
            mesh.UploadMeshData(true); // free the CPU copy: city meshes never change
            _meshes.Add(mesh);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterials = MeshUtil.Materials(library, slots);
            mr.shadowCastingMode = shadows ? ShadowCastingMode.On : ShadowCastingMode.Off;
            mr.receiveShadows = true;
            mr.lightProbeUsage = LightProbeUsage.Off;
            mr.reflectionProbeUsage = ReflectionProbeUsage.BlendProbes;
            mr.motionVectorGenerationMode = MotionVectorGenerationMode.ForceNoMotion;
            return go;
        }

        private void BuildColliders()
        {
            var root = new GameObject("Colliders").transform;
            root.SetParent(transform, false);
            // Ground plane under everything.
            var ground = new GameObject("Ground");
            ground.layer = LALayers.Ground;
            ground.transform.SetParent(root, false);
            var gb = ground.AddComponent<BoxCollider>();
            gb.center = new Vector3(0f, -0.5f, 0f);
            gb.size = new Vector3(1200f, 1f, 1200f);

            // Group colliders by chunk-ish cells so the hierarchy stays light.
            foreach (ColliderData c in Data.Colliders)
            {
                var go = new GameObject("C");
                go.layer = c.Layer;
                go.transform.SetParent(root, false);
                go.transform.SetPositionAndRotation(c.Center, Quaternion.Euler(c.Euler));
                var bc = go.AddComponent<BoxCollider>();
                bc.size = c.Size;
                go.isStatic = true;
                ColliderCount++;
            }
        }

        private void BuildSignals(Transform chunksRoot)
        {
            var lights = gameObject.GetComponent<TrafficLightSystem>();
            if (lights == null) lights = gameObject.AddComponent<TrafficLightSystem>();
            lights.Init(Layout, library);
            // One shared lens mesh per facing direction (4 meshes total).
            var lensMeshes = new Dictionary<Vector3, Mesh>();
            foreach (SignalHeadData s in Data.Signals)
            {
                Vector3 key = new Vector3(Mathf.Round(s.Facing.x), 0f, Mathf.Round(s.Facing.z));
                if (!lensMeshes.TryGetValue(key, out Mesh mesh))
                {
                    var ps = new PartSet();
                    CityMeshes.SignalLenses(ps, Vector3.zero, key, "R", "Y", "G");
                    mesh = MeshUtil.ToMesh(ps, "SignalLens", out _, new[] { "R", "Y", "G" });
                    lensMeshes.Add(key, mesh);
                    _meshes.Add(mesh);
                }

                Transform parent = chunksRoot.GetChild(s.Chunk).Find("Detail");
                var go = new GameObject("Signal");
                go.transform.SetParent(parent, false);
                go.transform.position = s.Position;
                go.AddComponent<MeshFilter>().sharedMesh = mesh;
                var mr = go.AddComponent<MeshRenderer>();
                mr.shadowCastingMode = ShadowCastingMode.Off;
                mr.lightProbeUsage = LightProbeUsage.Off;
                Material off = library.Get("SignalOff");
                mr.sharedMaterials = new[] { off, off, off };
                lights.Register(s.Intersection, s.AlongZ, mr);
            }
        }

        private Texture2D DrawMinimap(int size)
        {
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false) { name = "Minimap", wrapMode = TextureWrapMode.Clamp };
            var px = new Color32[size * size];
            var bg = new Color32(22, 24, 32, 230);
            for (int i = 0; i < px.Length; i++) px[i] = bg;
            float scale = size / (CityLayout.HalfSize * 2f);
            foreach (CityLayout.Block b in Layout.Blocks)
            {
                Color32 col = b.Kind == BlockKind.Downtown ? new Color32(70, 78, 104, 255)
                    : b.Kind == BlockKind.Residential ? new Color32(52, 82, 58, 255)
                    : b.Kind == BlockKind.Parking ? new Color32(90, 90, 96, 255)
                    : b.Kind == BlockKind.FreewayPark ? new Color32(48, 96, 54, 255) : new Color32(84, 74, 70, 255);
                FillRect(px, size, b.Footprint, scale, col);
            }

            var road = new Color32(150, 150, 160, 255);
            for (int i = 0; i < CityLayout.Lines.Length; i++)
            {
                float l = CityLayout.Lines[i], hw = CityLayout.RoadHalfWidth(i);
                FillRect(px, size, Rect.MinMaxRect(l - hw, -CityLayout.HalfSize, l + hw, CityLayout.HalfSize), scale, road);
                FillRect(px, size, Rect.MinMaxRect(-CityLayout.HalfSize, l - hw, CityLayout.HalfSize, l + hw), scale, road);
            }

            FillRect(px, size, Rect.MinMaxRect(-CityLayout.FreewayRampEnd, CityLayout.FreewayZ - CityLayout.FreewayHalfWidth, CityLayout.FreewayRampEnd, CityLayout.FreewayZ + CityLayout.FreewayHalfWidth), scale, new Color32(232, 150, 60, 255));
            tex.SetPixels32(px);
            tex.Apply(false, true);
            return tex;
        }

        private static void FillRect(Color32[] px, int size, Rect r, float scale, Color32 c)
        {
            int x0 = Mathf.Clamp(Mathf.FloorToInt((r.xMin + CityLayout.HalfSize) * scale), 0, size - 1);
            int x1 = Mathf.Clamp(Mathf.CeilToInt((r.xMax + CityLayout.HalfSize) * scale), 0, size - 1);
            int y0 = Mathf.Clamp(Mathf.FloorToInt((r.yMin + CityLayout.HalfSize) * scale), 0, size - 1);
            int y1 = Mathf.Clamp(Mathf.CeilToInt((r.yMax + CityLayout.HalfSize) * scale), 0, size - 1);
            for (int y = y0; y <= y1; y++)
            {
                for (int x = x0; x <= x1; x++) px[y * size + x] = c;
            }
        }

        private void OnDestroy()
        {
            foreach (Mesh m in _meshes)
            {
                if (m != null) Destroy(m);
            }

            if (Minimap != null) Destroy(Minimap);
        }
    }

    /// <summary>Distance-based chunk LOD/culling (city is generated at runtime, so no baked occlusion).</summary>
    public sealed class ChunkStreamer : MonoBehaviour
    {
        private sealed class Chunk
        {
            public Vector3 Center;
            public GameObject Base, Detail, Far;
            public int State = -1;
        }

        private readonly List<Chunk> _chunks = new List<Chunk>();
        private Transform _viewer;
        private float _timer;

        public float DetailDistance { get; set; } = 190f;
        public float FarDistance { get; set; } = 520f;
        public int DetailVisible { get; private set; }

        public void Add(Vector3 center, GameObject b, GameObject d, GameObject f)
        {
            _chunks.Add(new Chunk { Center = center, Base = b, Detail = d, Far = f });
        }

        public void SetViewer(Transform viewer)
        {
            _viewer = viewer;
            _timer = 0f;
            Refresh();
        }

        private void Update()
        {
            _timer -= Time.unscaledDeltaTime;
            if (_timer > 0f) return;
            _timer = 0.25f;
            Refresh();
        }

        public void Refresh()
        {
            if (_viewer == null) return;
            Vector3 v = _viewer.position;
            int detail = 0;
            for (int i = 0; i < _chunks.Count; i++)
            {
                Chunk c = _chunks[i];
                Vector3 d = c.Center - v;
                d.y = 0f;
                // Distance to the chunk square (130 m) rather than its centre.
                float dist = Mathf.Max(0f, Mathf.Max(Mathf.Abs(d.x), Mathf.Abs(d.z)) - 65f);
                int state = dist < DetailDistance ? 0 : dist < FarDistance ? 1 : 2;
                if (state == 0) detail++;
                if (state == c.State) continue;
                c.State = state;
                c.Base.SetActive(state < 2);
                c.Detail.SetActive(state == 0);
                c.Far.SetActive(state == 1);
            }

            DetailVisible = detail;
        }
    }
}
