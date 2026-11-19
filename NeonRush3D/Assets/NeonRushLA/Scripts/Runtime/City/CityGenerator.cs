using System.Collections.Generic;
using NeonRushLA.Geometry;
using UnityEngine;

namespace NeonRushLA.City
{
    public struct ColliderData
    {
        public Vector3 Center;
        public Vector3 Size;
        public Vector3 Euler;
        public int Layer;
    }

    public struct SignalHeadData
    {
        public int Intersection;
        public bool AlongZ;
        public Vector3 Position;
        public Vector3 Facing;
        public int Chunk;
    }

    /// <summary>A parked car slot (driveways, parking lots); facing = yaw in degrees.</summary>
    public struct ParkedCarData
    {
        public Vector3 Position;
        public float Yaw;
    }

    public sealed class CityChunkData
    {
        public int Index;
        public Rect Bounds;
        public readonly PartSet Base = new PartSet();   // roads, sidewalks, ground (always on while in range)
        public readonly PartSet Detail = new PartSet(); // full buildings, vegetation, furniture, markings
        public readonly PartSet Far = new PartSet();    // simplified buildings & vegetation
    }

    public sealed class CityData
    {
        public CityLayout Layout;
        public readonly List<CityChunkData> Chunks = new List<CityChunkData>();
        public readonly List<ColliderData> Colliders = new List<ColliderData>();
        public readonly List<SignalHeadData> Signals = new List<SignalHeadData>();
        public readonly PartSet Freeway = new PartSet();
        public readonly List<Vector3> ParkingSpots = new List<Vector3>();
        public readonly List<ParkedCarData> Parked = new List<ParkedCarData>();
        public int BuildingCount, PalmCount, TreeCount, LampCount;
    }

    /// <summary>Generates all city geometry + collider/signal descriptors from a <see cref="CityLayout"/>.</summary>
    public static class CityGenerator
    {
        public const int ChunksPerSide = 6;
        public const float ChunkSize = 130f;
        private const float MarkY = 0.012f;

        public static int ChunkIndexAt(float x, float z)
        {
            int cx = Mathf.Clamp(Mathf.FloorToInt((x + 390f) / ChunkSize), 0, ChunksPerSide - 1);
            int cz = Mathf.Clamp(Mathf.FloorToInt((z + 390f) / ChunkSize), 0, ChunksPerSide - 1);
            return cx * ChunksPerSide + cz;
        }

        public static CityData Generate(CityLayout layout)
        {
            var data = new CityData { Layout = layout };
            for (int cx = 0; cx < ChunksPerSide; cx++)
            {
                for (int cz = 0; cz < ChunksPerSide; cz++)
                {
                    data.Chunks.Add(new CityChunkData
                    {
                        Index = data.Chunks.Count,
                        Bounds = new Rect(-390f + cx * ChunkSize, -390f + cz * ChunkSize, ChunkSize, ChunkSize),
                    });
                }
            }

            var rng = new System.Random(layout.Seed);
            BuildRoads(data);
            foreach (CityLayout.Block b in layout.Blocks) BuildBlock(data, b, rng);
            BuildSignals(data);
            BuildFreeway(data);
            BuildEdges(data);
            return data;
        }

        private static CityChunkData ChunkAt(CityData d, float x, float z) => d.Chunks[ChunkIndexAt(x, z)];

        // ------------------------------------------------------------------ roads

        private static void BuildRoads(CityData d)
        {
            float[] L = CityLayout.Lines;
            float ext = CityLayout.HalfSize;
            // East–west roads: full strips (split per chunk column), y = 0.
            for (int iz = 0; iz < L.Length; iz++)
            {
                float hw = CityLayout.RoadHalfWidth(iz);
                for (int c = 0; c < ChunksPerSide; c++)
                {
                    float x0 = c == 0 ? -ext : -390f + c * ChunkSize;
                    float x1 = c == ChunksPerSide - 1 ? ext : -390f + (c + 1) * ChunkSize;
                    CityChunkData ch = ChunkAt(d, (x0 + x1) * 0.5f, L[iz]);
                    ch.Base[CityMeshes.Asphalt].AddFlatQuad(new Vector3(x0, 0, L[iz] - hw), new Vector3(x0, 0, L[iz] + hw), new Vector3(x1, 0, L[iz] + hw), new Vector3(x1, 0, L[iz] - hw), Vector3.up, 1f / 6f);
                }
            }

            // North–south roads: segments between the crossing E–W roads.
            for (int ix = 0; ix < L.Length; ix++)
            {
                float hw = CityLayout.RoadHalfWidth(ix);
                for (int iz = -1; iz < L.Length; iz++)
                {
                    float z0 = iz < 0 ? -ext : L[iz] + CityLayout.RoadHalfWidth(iz);
                    float z1 = iz == L.Length - 1 ? ext : L[iz + 1] - CityLayout.RoadHalfWidth(iz + 1);
                    if (z1 <= z0) continue;
                    CityChunkData ch = ChunkAt(d, L[ix], (z0 + z1) * 0.5f);
                    ch.Base[CityMeshes.Asphalt].AddFlatQuad(new Vector3(L[ix] - hw, 0, z0), new Vector3(L[ix] - hw, 0, z1), new Vector3(L[ix] + hw, 0, z1), new Vector3(L[ix] + hw, 0, z0), Vector3.up, 1f / 6f);
                    MarkRoad(d, new Vector3(L[ix], 0, z0), new Vector3(L[ix], 0, z1), ix);
                }
            }

            for (int iz = 0; iz < L.Length; iz++)
            {
                for (int ix = -1; ix < L.Length; ix++)
                {
                    float x0 = ix < 0 ? -ext : L[ix] + CityLayout.RoadHalfWidth(ix);
                    float x1 = ix == L.Length - 1 ? ext : L[ix + 1] - CityLayout.RoadHalfWidth(ix + 1);
                    if (x1 <= x0) continue;
                    MarkRoad(d, new Vector3(x0, 0, L[iz]), new Vector3(x1, 0, L[iz]), iz);
                }
            }

            // Crosswalks and stop lines at every intersection approach.
            foreach (CityLayout.Intersection inter in d.Layout.Intersections)
            {
                for (int dir = 0; dir < 4; dir++)
                {
                    Vector3 axis = dir == 0 ? Vector3.forward : dir == 1 ? Vector3.back : dir == 2 ? Vector3.right : Vector3.left;
                    bool alongZ = dir < 2;
                    int roadLine = alongZ ? inter.Ix : inter.Iz;
                    int crossLine = alongZ ? inter.Iz : inter.Ix;
                    float roadHw = CityLayout.RoadHalfWidth(roadLine);
                    float crossHw = CityLayout.RoadHalfWidth(crossLine);
                    Vector3 c = inter.Position + axis * (crossHw + 1.8f);
                    if (Mathf.Abs(c.x) > 398f || Mathf.Abs(c.z) > 398f) continue;
                    CityChunkData ch = ChunkAt(d, c.x, c.z);
                    Vector3 across = new Vector3(axis.z, 0, -axis.x);
                    // Zebra stripes
                    for (float o = -roadHw + 0.6f; o < roadHw - 0.3f; o += 1.1f)
                    {
                        Vector3 p = c + across * o;
                        StripeQuad(ch.Detail[CityMeshes.LineWhite], p, axis, 3.0f, 0.5f);
                    }

                    // Stop line across the incoming half (traffic arriving against axis drives on the left of across)
                    Vector3 stop = inter.Position + axis * (crossHw + 3.6f);
                    int lanes = CityLayout.LanesPerDirection(roadLine);
                    float median = CityLayout.MedianHalf(roadLine);
                    for (int k = 0; k < lanes; k++)
                    {
                        Vector3 ap = inter.Position + axis * (crossHw + 9.5f) - across * (median + (k + 0.5f) * CityLayout.LaneWidth);
                        if (Mathf.Abs(ap.x) < 398f && Mathf.Abs(ap.z) < 398f) CityMeshes.LaneArrow(ChunkAt(d, ap.x, ap.z).Detail, ap, -axis);
                    }

                    for (float o = 0.3f; o < roadHw - 0.2f; o += 0.5f)
                    {
                        Vector3 p = stop + across * -o;
                        StripeQuad(ch.Detail[CityMeshes.LineWhite], p, across, 0.5f, 0.45f);
                    }
                }
            }
        }

        /// <summary>Lane markings for a road piece from a to b (straight, along X or Z).</summary>
        private static void MarkRoad(CityData d, Vector3 a, Vector3 b, int line)
        {
            Vector3 dir = (b - a).normalized;
            float len = (b - a).magnitude;
            Vector3 side = new Vector3(dir.z, 0, -dir.x);
            int lanes = CityLayout.LanesPerDirection(line);
            float median = CityLayout.MedianHalf(line);
            float hw = CityLayout.RoadHalfWidth(line);
            // Trim markings near the intersections (crosswalk zone).
            float trim = 6.5f;
            if (len < trim * 2f + 2f) return;
            Vector3 a2 = a + dir * trim, b2 = b - dir * trim;
            float l2 = len - trim * 2f;
            int pieces = Mathf.Max(1, Mathf.CeilToInt(l2 / 40f));
            for (int pi = 0; pi < pieces; pi++)
            {
                Vector3 s = a2 + dir * (l2 * pi / pieces);
                Vector3 e = a2 + dir * (l2 * (pi + 1) / pieces);
                Vector3 mid = (s + e) * 0.5f;
                CityChunkData ch = ChunkAt(d, mid.x, mid.z);
                float segLen = (e - s).magnitude;
                if (segLen > 16f)
                {
                    float off = median + CityLayout.LaneWidth * (pi % 2 == 0 ? 0.5f : 1.5f);
                    CityMeshes.Manhole(ch.Detail, mid + dir * 4f + side * (pi % 2 == 0 ? off : -off));
                }

                // Double yellow centre line
                StripeQuad(ch.Detail[CityMeshes.LineYellow], mid + side * (median * 0.5f + 0.06f), dir, segLen, 0.12f);
                StripeQuad(ch.Detail[CityMeshes.LineYellow], mid - side * (median * 0.5f + 0.06f), dir, segLen, 0.12f);
                // Edge lines
                StripeQuad(ch.Detail[CityMeshes.LineWhite], mid + side * (hw - 0.35f), dir, segLen, 0.14f);
                StripeQuad(ch.Detail[CityMeshes.LineWhite], mid - side * (hw - 0.35f), dir, segLen, 0.14f);
                // Lane dashes (3 m dash, 6 m gap)
                for (int k = 1; k < lanes; k++)
                {
                    float off = median + k * CityLayout.LaneWidth;
                    for (float t = 1.5f; t < segLen - 1.5f; t += 9f)
                    {
                        Vector3 p = s + dir * (t + 1.5f);
                        StripeQuad(ch.Detail[CityMeshes.LineWhite], p + side * off, dir, 3f, 0.13f);
                        StripeQuad(ch.Detail[CityMeshes.LineWhite], p - side * off, dir, 3f, 0.13f);
                    }
                }
            }
        }

        private static void StripeQuad(MeshData m, Vector3 center, Vector3 along, float length, float width)
        {
            along = along.normalized;
            Vector3 side = new Vector3(along.z, 0, -along.x) * (width * 0.5f);
            Vector3 f = along * (length * 0.5f);
            Vector3 c = center + Vector3.up * MarkY;
            m.AddFlatQuad(c - f - side, c - f + side, c + f + side, c + f - side, Vector3.up, 0.5f);
        }

        // ------------------------------------------------------------------ blocks

        private static void BuildBlock(CityData d, CityLayout.Block b, System.Random rng)
        {
            Rect fp = b.Footprint;
            Rect lot = b.Lot;
            CityChunkData ch = ChunkAt(d, fp.center.x, fp.center.y);
            float top = CityLayout.CurbHeight;

            // Raised block: sidewalk ring + lot surface, curb faces.
            string lotMat = b.Kind == BlockKind.Downtown ? CityMeshes.Plaza : b.Kind == BlockKind.Parking ? CityMeshes.Asphalt
                : b.Kind == BlockKind.Commercial ? CityMeshes.Plaza : CityMeshes.Grass;
            AddRaised(ch.Base, ch.Detail, fp, lot, top, lotMat);
            d.Colliders.Add(new ColliderData { Center = new Vector3(fp.center.x, top * 0.5f, fp.center.y), Size = new Vector3(fp.width, top, fp.height), Layer = LALayers.Ground });

            StreetFurniture(d, b, rng);

            switch (b.Kind)
            {
                case BlockKind.Downtown:
                    Downtown(d, ch, lot, rng, top);
                    break;
                case BlockKind.Commercial:
                    CommercialBlock(d, ch, lot, rng, top);
                    break;
                case BlockKind.Residential:
                    Residential(d, ch, lot, rng, top);
                    break;
                case BlockKind.Parking:
                    ParkingLot(d, ch, lot, rng, top);
                    break;
                case BlockKind.FreewayPark:
                    Park(d, ch, lot, rng, top);
                    break;
            }
        }

        public const float CornerRadius = 3f;

        /// <summary>
        /// Raised block: sidewalk ring with rounded street corners, curb faces, a concrete gutter pan on
        /// the road along the curb, storm-drain inlets and the lot surface. Paving uses world-space UVs
        /// so slab joints continue across pieces.
        /// </summary>
        private static void AddRaised(PartSet set, PartSet detail, Rect fp, Rect lot, float h, string lotMat)
        {
            MeshData sw = set[CityMeshes.Sidewalk];
            MeshData curb = set[CityMeshes.Curb];
            MeshData gutter = set[CityMeshes.Gutter];
            MeshData asphalt = set[CityMeshes.Asphalt];
            const float t = 0.25f, gw = 0.45f, gy = 0.004f;
            float R = CornerRadius;
            CityMeshes.GroundRect(sw, lot.xMin, fp.yMin, lot.xMax, lot.yMin, h, t);
            CityMeshes.GroundRect(sw, lot.xMin, lot.yMax, lot.xMax, fp.yMax, h, t);
            CityMeshes.GroundRect(sw, fp.xMin, lot.yMin, lot.xMin, lot.yMax, h, t);
            CityMeshes.GroundRect(sw, lot.xMax, lot.yMin, fp.xMax, lot.yMax, h, t);
            CityMeshes.GroundRect(set[lotMat], lot.xMin, lot.yMin, lot.xMax, lot.yMax, h + 0.005f, lotMat == CityMeshes.Asphalt ? 1f / 6f : t);

            // Straight curb faces + gutters + storm drains
            var edges = new[]
            {
                (new Vector3(fp.xMin + R, 0, fp.yMin), new Vector3(fp.xMax - R, 0, fp.yMin), Vector3.back),
                (new Vector3(fp.xMax, 0, fp.yMin + R), new Vector3(fp.xMax, 0, fp.yMax - R), Vector3.right),
                (new Vector3(fp.xMax - R, 0, fp.yMax), new Vector3(fp.xMin + R, 0, fp.yMax), Vector3.forward),
                (new Vector3(fp.xMin, 0, fp.yMax - R), new Vector3(fp.xMin, 0, fp.yMin + R), Vector3.left),
            };
            foreach (var (a, b, n) in edges)
            {
                curb.AddFlatQuad(a, b, b + Vector3.up * h, a + Vector3.up * h, n, 0.25f);
                Vector3 o = n * gw;
                CityMeshes.QuadUV(gutter, a + o + Vector3.up * gy, b + o + Vector3.up * gy, b + Vector3.up * gy, a + Vector3.up * gy, Vector3.up,
                    new Vector2(a.x + o.x, a.z + o.z) * t, new Vector2(b.x + o.x, b.z + o.z) * t, new Vector2(b.x, b.z) * t, new Vector2(a.x, a.z) * t);
                Vector3 dir = (b - a).normalized;
                float yaw = Mathf.Atan2(n.x, n.z) * Mathf.Rad2Deg;
                foreach (Vector3 inlet in new[] { a + dir * 2.5f, b - dir * 2.5f })
                {
                    Shapes.Box(detail[CityMeshes.DarkMetal], Xform.Translate(inlet + n * 0.005f + Vector3.up * 0.07f) * Xform.RotateY(yaw), new Vector3(1.1f, 0.08f, 0.02f), 1f);
                    Shapes.Box(detail[CityMeshes.DarkMetal], Xform.Translate(inlet + n * 0.25f + Vector3.up * gy * 2f) * Xform.RotateY(yaw), new Vector3(0.9f, 0.01f, 0.4f), 1f);
                }
            }

            // Rounded corners: sidewalk fan, curb arc, gutter arc, asphalt fill outside the arc.
            var corners = new[] { (-1, -1), (1, -1), (1, 1), (-1, 1) };
            const int seg = 8;
            foreach (var (sx, sz) in corners)
            {
                var fc = new Vector3(sx < 0 ? fp.xMin : fp.xMax, 0, sz < 0 ? fp.yMin : fp.yMax);
                var lc = new Vector3(sx < 0 ? lot.xMin : lot.xMax, 0, sz < 0 ? lot.yMin : lot.yMax);
                var ac = fc - new Vector3(sx * R, 0, sz * R);
                float a0 = Mathf.Atan2(0f, sx), a1 = Mathf.Atan2(sz, 0f);
                if (a1 - a0 > Mathf.PI) a1 -= 2f * Mathf.PI;
                if (a0 - a1 > Mathf.PI) a1 += 2f * Mathf.PI;
                var arc = new List<Vector3>();
                for (int i = 0; i <= seg; i++)
                {
                    float ang = Mathf.Lerp(a0, a1, (float)i / seg);
                    arc.Add(ac + new Vector3(Mathf.Cos(ang), 0, Mathf.Sin(ang)) * R);
                }

                var rim = new List<Vector3> { new Vector3(fc.x, h, lc.z) };
                foreach (Vector3 p in arc) rim.Add(p + Vector3.up * h);
                rim.Add(new Vector3(lc.x, h, fc.z));
                CityMeshes.GroundFan(sw, new Vector3(lc.x, h, lc.z), rim, t);
                CityMeshes.GroundFan(asphalt, fc, arc, 1f / 6f);
                for (int i = 0; i < seg; i++)
                {
                    Vector3 p = arc[i], q = arc[i + 1];
                    Vector3 n = ((p + q) * 0.5f - ac).normalized;
                    curb.AddFlatQuad(p, q, q + Vector3.up * h, p + Vector3.up * h, n, 0.25f);
                    Vector3 po = ac + (p - ac).normalized * (R + gw), qo = ac + (q - ac).normalized * (R + gw);
                    CityMeshes.QuadUV(gutter, p + Vector3.up * gy, q + Vector3.up * gy, qo + Vector3.up * gy, po + Vector3.up * gy, Vector3.up,
                        new Vector2(p.x, p.z) * t, new Vector2(q.x, q.z) * t, new Vector2(qo.x, qo.z) * t, new Vector2(po.x, po.z) * t);
                }
            }
        }

        private static void Quad(MeshData m, float x0, float z0, float x1, float z1, float y)
        {
            m.AddFlatQuad(new Vector3(x0, y, z0), new Vector3(x0, y, z1), new Vector3(x1, y, z1), new Vector3(x1, y, z0), Vector3.up, 0.25f);
        }

        private static void AddBuildingCollider(CityData d, Rect r, float ground, float height)
        {
            d.Colliders.Add(new ColliderData
            {
                Center = new Vector3(r.center.x, ground + height * 0.5f, r.center.y), Size = new Vector3(r.width, height, r.height), Layer = LALayers.Environment
            });
            d.BuildingCount++;
        }

        private static void Downtown(CityData d, CityChunkData ch, Rect lot, System.Random rng, float g)
        {
            float gap = 8f;
            float w = (lot.width - gap) * 0.5f, h = (lot.height - gap) * 0.5f;
            float distCenter = lot.center.magnitude;
            for (int i = 0; i < 2; i++)
            {
                for (int j = 0; j < 2; j++)
                {
                    if (rng.NextDouble() < 0.18) continue; // plaza instead
                    var r = new Rect(lot.xMin + i * (w + gap), lot.yMin + j * (h + gap), w, h);
                    float shrink = (float)rng.NextDouble() * 6f;
                    r = Rect.MinMaxRect(r.xMin + shrink, r.yMin + shrink, r.xMax - shrink, r.yMax - shrink);
                    float height = Mathf.Lerp(150f, 55f, Mathf.Clamp01(distCenter / 230f)) * (0.7f + 0.5f * (float)rng.NextDouble());
                    CityMeshes.Tower(ch.Detail, r, height, rng, g);
                    CityMeshes.FacadeBox(ch.Far, CityMeshes.FacadeGlass, new Vector3(r.xMin, g, r.yMin), new Vector3(r.xMax, g + height, r.yMax), 12f, 14f);
                    AddBuildingCollider(d, r, g, height);
                }
            }

            // Plaza palms between towers
            for (int k = 0; k < 6; k++)
            {
                var p = new Vector3(lot.center.x + ((float)rng.NextDouble() - 0.5f) * gap, g, lot.center.y + ((float)rng.NextDouble() - 0.5f) * lot.height * 0.8f);
                AddPalm(d, ch, p, rng, false);
            }
        }

        private static void CommercialBlock(CityData d, CityChunkData ch, Rect lot, System.Random rng, float g)
        {
            float depth = 20f;
            // South & north rows face E–W streets, west & east rows face N–S streets.
            Row(d, ch, rng, g, new Rect(lot.xMin, lot.yMin, lot.width, depth), true, Vector3.back);
            Row(d, ch, rng, g, new Rect(lot.xMin, lot.yMax - depth, lot.width, depth), true, Vector3.forward);
            Row(d, ch, rng, g, new Rect(lot.xMin, lot.yMin + depth + 2f, depth, lot.height - 2f * depth - 4f), false, Vector3.left);
            Row(d, ch, rng, g, new Rect(lot.xMax - depth, lot.yMin + depth + 2f, depth, lot.height - 2f * depth - 4f), false, Vector3.right);
            // Interior parking
            var inner = Rect.MinMaxRect(lot.xMin + depth + 4f, lot.yMin + depth + 4f, lot.xMax - depth - 4f, lot.yMax - depth - 4f);
            if (inner.width > 10f && inner.height > 10f)
            {
                CityMeshes.GroundRect(ch.Base[CityMeshes.Asphalt], inner.xMin, inner.yMin, inner.xMax, inner.yMax, g + 0.01f, 1f / 6f);
                ParkingLines(ch.Detail, inner, g + 0.02f, d.Parked, rng, 0.3f);
            }
        }

        private static void Row(CityData d, CityChunkData ch, System.Random rng, float g, Rect row, bool alongX, Vector3 street)
        {
            float pos = alongX ? row.xMin : row.yMin;
            float end = alongX ? row.xMax : row.yMax;
            while (pos < end - 8f)
            {
                float w = Mathf.Min(end - pos, 14f + (float)rng.NextDouble() * 14f);
                Rect r = alongX ? new Rect(pos, row.yMin, w - 1f, row.height) : new Rect(row.xMin, pos, row.width, w - 1f);
                int floors = 1 + rng.Next(0, 4);
                CityMeshes.Commercial(ch.Detail, r, floors, rng, g, street);
                float h = 4.4f + (floors - 1) * 3.4f;
                CityMeshes.FacadeBox(ch.Far, floors > 1 ? CityMeshes.FacadeBrick : CityMeshes.StorefrontSlot(0), new Vector3(r.xMin, g, r.yMin), new Vector3(r.xMax, g + h, r.yMax), 9f, 10.2f);
                AddBuildingCollider(d, r, g, h + 1f);
                pos += w + (rng.NextDouble() < 0.2 ? 6f : 0f);
            }
        }

        private static void Residential(CityData d, CityChunkData ch, Rect lot, System.Random rng, float g)
        {
            float setback = 7f, house = 15f;
            foreach (var side in new[] { 0, 1, 2, 3 })
            {
                bool alongX = side < 2;
                float len = alongX ? lot.width : lot.height;
                int count = Mathf.FloorToInt((len - 30f) / 24f);
                for (int i = 0; i < count; i++)
                {
                    float t = 15f + i * 24f + 12f;
                    Vector2 c;
                    Vector3 street;
                    switch (side)
                    {
                        case 0: c = new Vector2(lot.xMin + t, lot.yMin + setback + house * 0.5f); street = Vector3.back; break;
                        case 1: c = new Vector2(lot.xMin + t, lot.yMax - setback - house * 0.5f); street = Vector3.forward; break;
                        case 2: c = new Vector2(lot.xMin + setback + house * 0.5f, lot.yMin + t); street = Vector3.left; break;
                        default: c = new Vector2(lot.xMax - setback - house * 0.5f, lot.yMin + t); street = Vector3.right; break;
                    }

                    float hw = 7f + (float)rng.NextDouble() * 3f, hd = 6f + (float)rng.NextDouble() * 2f;
                    var r = alongX ? new Rect(c.x - hw, c.y - hd, hw * 2f, hd * 2f) : new Rect(c.x - hd, c.y - hw, hd * 2f, hw * 2f);
                    int floors = rng.NextDouble() < 0.35 ? 2 : 1;
                    float frontYard = setback + house * 0.5f - hd;
                    int hs = rng.Next();
                    CityMeshes.House(ch.Detail, r, floors, new System.Random(hs), g, street, frontYard, false, d.Parked);
                    CityMeshes.House(ch.Far, r, floors, new System.Random(hs), g, street, frontYard, true);
                    AddBuildingCollider(d, r, g, floors * 3.2f + 0.6f);
                    // Front-yard palm or tree
                    var yard = new Vector3(c.x, g, c.y) + street * (setback * 0.5f + house * 0.5f);
                    if (rng.NextDouble() < 0.6) AddPalm(d, ch, yard + new Vector3((float)rng.NextDouble() * 4f - 2f, 0, (float)rng.NextDouble() * 4f - 2f), rng, rng.NextDouble() < 0.25);
                    else AddTree(d, ch, yard, rng);
                    if (rng.NextDouble() < 0.7) CityMeshes.Shrub(ch.Detail, yard + new Vector3(2.5f, 0, 2.5f), 0.9f, rng);
                }
            }

            // Backyard trees
            for (int k = 0; k < 5; k++)
            {
                var p = new Vector3(lot.center.x + ((float)rng.NextDouble() - 0.5f) * lot.width * 0.4f, g, lot.center.y + ((float)rng.NextDouble() - 0.5f) * lot.height * 0.4f);
                AddTree(d, ch, p, rng);
            }
        }

        private static void ParkingLot(CityData d, CityChunkData ch, Rect lot, System.Random rng, float g)
        {
            ParkingLines(ch.Detail, Rect.MinMaxRect(lot.xMin + 6f, lot.yMin + 6f, lot.xMax - 6f, lot.yMax - 6f), g + 0.02f, d.Parked, rng, 0.22f);
            for (float x = lot.xMin + 15f; x < lot.xMax - 10f; x += 30f)
            {
                for (float z = lot.yMin + 18f; z < lot.yMax - 10f; z += 36f)
                {
                    CityMeshes.StreetLamp(ch.Detail, new Vector3(x, g, z), Vector3.right);
                    AddPole(d, new Vector3(x, g, z));
                    d.LampCount++;
                }
            }

            // Spots used for parked props/spawn
            for (float z = lot.yMin + 12f; z < lot.yMax - 12f; z += 6f) d.ParkingSpots.Add(new Vector3(lot.xMin + 14f, g, z));
            // Planters with palms on the edges
            for (float x = lot.xMin + 8f; x < lot.xMax - 4f; x += 24f)
            {
                AddPalm(d, ch, new Vector3(x, g, lot.yMin + 2f), rng, false);
                AddPalm(d, ch, new Vector3(x, g, lot.yMax - 2f), rng, false);
            }
        }

        /// <summary>Stall lines (5 m deep, 2.8 m wide); a fraction of the stalls gets a parked car.</summary>
        private static void ParkingLines(PartSet set, Rect area, float y, List<ParkedCarData> parked, System.Random rng, float occupancy)
        {
            MeshData m = set[CityMeshes.LineWhite];
            for (float z = area.yMin; z <= area.yMax; z += 2.8f)
            {
                for (float x = area.xMin; x < area.xMax - 5f; x += 18f)
                {
                    m.AddFlatQuad(new Vector3(x, y, z - 0.06f), new Vector3(x, y, z + 0.06f), new Vector3(x + 5f, y, z + 0.06f), new Vector3(x + 5f, y, z - 0.06f), Vector3.up, 0.5f);
                    if (z + 2.8f <= area.yMax && rng.NextDouble() < occupancy)
                    {
                        bool noseIn = rng.NextDouble() < 0.5;
                        parked.Add(new ParkedCarData { Position = new Vector3(x + 2.6f, y, z + 1.4f), Yaw = noseIn ? 90f : -90f });
                    }
                }
            }
        }

        private static void Park(CityData d, CityChunkData ch, Rect lot, System.Random rng, float g)
        {
            // Keep the band under the freeway clear apart from pillars.
            for (int k = 0; k < 26; k++)
            {
                var p = new Vector3(lot.xMin + (float)rng.NextDouble() * lot.width, g, lot.yMin + (float)rng.NextDouble() * lot.height);
                if (Mathf.Abs(p.z - CityLayout.FreewayZ) < CityLayout.FreewayHalfWidth + 4f) continue;
                if (rng.NextDouble() < 0.5) AddPalm(d, ch, p, rng, rng.NextDouble() < 0.3);
                else AddTree(d, ch, p, rng);
            }

            for (int k = 0; k < 18; k++)
            {
                var p = new Vector3(lot.xMin + (float)rng.NextDouble() * lot.width, g, lot.yMin + (float)rng.NextDouble() * lot.height);
                if (Mathf.Abs(p.z - CityLayout.FreewayZ) < CityLayout.FreewayHalfWidth + 2f) continue;
                CityMeshes.Shrub(ch.Detail, p, 1.0f + (float)rng.NextDouble(), rng);
            }
        }

        private static void StreetFurniture(CityData d, CityLayout.Block b, System.Random rng)
        {
            Rect fp = b.Footprint;
            float edge = 1.0f; // from the curb
            float g = CityLayout.CurbHeight;
            float inset = CornerRadius + 2f;
            var sides = new[]
            {
                (new Vector3(fp.xMin + inset, g, fp.yMin + edge), new Vector3(fp.xMax - inset, g, fp.yMin + edge), Vector3.back),
                (new Vector3(fp.xMin + inset, g, fp.yMax - edge), new Vector3(fp.xMax - inset, g, fp.yMax - edge), Vector3.forward),
                (new Vector3(fp.xMin + edge, g, fp.yMin + inset), new Vector3(fp.xMin + edge, g, fp.yMax - inset), Vector3.left),
                (new Vector3(fp.xMax - edge, g, fp.yMin + inset), new Vector3(fp.xMax - edge, g, fp.yMax - inset), Vector3.right),
            };
            bool shops = b.Kind == BlockKind.Commercial || b.Kind == BlockKind.Downtown;
            foreach (var (a, e, road) in sides)
            {
                float len = (e - a).magnitude;
                Vector3 dir = (e - a).normalized;
                int i = 0;
                for (float t = 0f; t <= len; t += 22f, i++)
                {
                    Vector3 p = a + dir * t;
                    CityChunkData ch = ChunkAt(d, p.x, p.z);
                    if (i % 2 == 0)
                    {
                        CityMeshes.StreetLamp(ch.Detail, p, road);
                        AddPole(d, p);
                        d.LampCount++;
                    }
                    else if (b.Kind != BlockKind.Downtown || rng.NextDouble() < 0.5)
                    {
                        AddPalm(d, ch, p, rng, false);
                    }
                }

                // Fire hydrant near the curb, a few metres past a lamp/palm slot
                {
                    float t = 22f * Mathf.Floor(len * 0.4f / 22f) + 6f;
                    Vector3 p = a + dir * t + road * 0.4f;
                    CityMeshes.FireHydrant(ChunkAt(d, p.x, p.z).Detail, p);
                    d.Colliders.Add(new ColliderData { Center = p + Vector3.up * 0.35f, Size = new Vector3(0.35f, 0.7f, 0.35f), Layer = LALayers.Environment });
                }

                if (shops)
                {
                    // Trash cans at both ends, a bus bench mid-block, parking meters along the curb
                    foreach (float t in new[] { 2.5f, len - 2.5f })
                    {
                        Vector3 p = a + dir * t - road * 0.3f;
                        CityMeshes.TrashCan(ChunkAt(d, p.x, p.z).Detail, p);
                        d.Colliders.Add(new ColliderData { Center = p + Vector3.up * 0.5f, Size = new Vector3(0.6f, 1f, 0.6f), Layer = LALayers.Environment });
                    }

                    {
                        Vector3 p = a + dir * 33f - road * 1.0f;
                        CityMeshes.Bench(ChunkAt(d, p.x, p.z).Detail, p, road);
                    }

                    if (b.Kind == BlockKind.Commercial)
                    {
                        for (float t = 5f; t < len - 3f; t += 7f)
                        {
                            float m = t % 22f;
                            if (m < 2.5f || m > 19.5f || Mathf.Abs(t - 33f) < 2f) continue;
                            Vector3 p = a + dir * t + road * 0.45f;
                            CityMeshes.ParkingMeter(ChunkAt(d, p.x, p.z).Detail, p);
                        }
                    }
                }
                else if (b.Kind == BlockKind.Residential)
                {
                    // Wooden utility poles with sagging lines (very LA)
                    Vector3[] prev = null;
                    for (float t = 11f; t <= len; t += 44f)
                    {
                        Vector3 p = a + dir * t + road * 0.55f;
                        CityChunkData ch = ChunkAt(d, p.x, p.z);
                        Vector3[] pts = CityMeshes.PowerPole(ch.Detail, p, dir, rng);
                        AddPole(d, p);
                        if (prev != null)
                        {
                            for (int k = 0; k < 3; k++) CityMeshes.WireSpan(ch.Detail, prev[k], pts[k], 0.55f);
                            CityMeshes.WireSpan(ch.Detail, prev[0] + Vector3.down * 3.6f, pts[0] + Vector3.down * 3.6f, 0.4f, 0.022f); // phone/cable line
                        }

                        prev = pts;
                    }
                }
            }
        }

        private static void AddPalm(CityData d, CityChunkData ch, Vector3 p, System.Random rng, bool canary)
        {
            float h = canary ? 6f + (float)rng.NextDouble() * 3f : 13f + (float)rng.NextDouble() * 9f;
            int seed = rng.Next();
            CityMeshes.Palm(ch.Detail, p, h, new System.Random(seed), canary, 1f);
            CityMeshes.Palm(ch.Far, p, h, new System.Random(seed), canary, 0.4f);
            d.Colliders.Add(new ColliderData { Center = p + Vector3.up * 1.5f, Size = new Vector3(0.6f, 3f, 0.6f), Layer = LALayers.Environment });
            d.PalmCount++;
        }

        private static void AddTree(CityData d, CityChunkData ch, Vector3 p, System.Random rng)
        {
            float h = 6f + (float)rng.NextDouble() * 4f;
            int seed = rng.Next();
            CityMeshes.Tree(ch.Detail, p, h, new System.Random(seed), 1f);
            CityMeshes.Tree(ch.Far, p, h, new System.Random(seed), 0.4f);
            d.Colliders.Add(new ColliderData { Center = p + Vector3.up * 1.5f, Size = new Vector3(0.6f, 3f, 0.6f), Layer = LALayers.Environment });
            d.TreeCount++;
        }

        private static void AddPole(CityData d, Vector3 p)
        {
            d.Colliders.Add(new ColliderData { Center = p + Vector3.up * 1.5f, Size = new Vector3(0.3f, 3f, 0.3f), Layer = LALayers.Environment });
        }

        // ------------------------------------------------------------------ signals

        private static void BuildSignals(CityData d)
        {
            foreach (CityLayout.Intersection inter in d.Layout.Intersections)
            {
                int idx = d.Layout.Intersections.IndexOf(inter);
                foreach (int laneId in inter.Incoming)
                {
                    CityLayout.LaneEdge e = d.Layout.Lanes[laneId];
                    if (e.LaneIndex != 0) continue; // one head per approach
                    Vector3 dir = e.Direction; // travel direction (towards the intersection)
                    Vector3 right = new Vector3(dir.z, 0, -dir.x);
                    int roadLine = e.AlongZ ? inter.Ix : inter.Iz;
                    int crossLine = e.AlongZ ? inter.Iz : inter.Ix;
                    float roadHw = CityLayout.RoadHalfWidth(roadLine);
                    float crossHw = CityLayout.RoadHalfWidth(crossLine);
                    // Far-right corner after the intersection (classic US span placement).
                    Vector3 basePos = inter.Position + dir * (crossHw + 1.6f) + right * (roadHw + 1.6f);
                    basePos.y = CityLayout.CurbHeight;
                    if (Mathf.Abs(basePos.x) > 399f || Mathf.Abs(basePos.z) > 399f) continue;
                    CityChunkData ch = ChunkAt(d, basePos.x, basePos.z);
                    CityMeshes.SignalMast(ch.Detail, basePos, -right, roadHw * 0.85f, out Vector3 head);
                    CityMeshes.SignalBox(ch.Detail, head, -dir);
                    AddPole(d, basePos);
                    d.Signals.Add(new SignalHeadData { Intersection = idx, AlongZ = e.AlongZ, Position = head, Facing = -dir, Chunk = ch.Index });
                }
            }
        }

        // ------------------------------------------------------------------ freeway

        private static void BuildFreeway(CityData d)
        {
            PartSet f = d.Freeway;
            float z = CityLayout.FreewayZ, hw = CityLayout.FreewayHalfWidth, y = CityLayout.FreewayHeight;
            float x0 = CityLayout.FreewayDeckStart, x1 = CityLayout.FreewayDeckEnd, xr = CityLayout.FreewayRampEnd;
            // Deck (road surface + concrete underside)
            CityMeshes.GroundRect(f[CityMeshes.Asphalt], x0, z - hw, x1, z + hw, y, 1f / 6f);
            Shapes.Box(f[CityMeshes.Concrete], new Vector3(0, y - 0.65f, z), new Vector3(x1 - x0, 1.3f, hw * 2f), 0.25f);
            d.Colliders.Add(new ColliderData { Center = new Vector3(0, y - 0.6f, z), Size = new Vector3(x1 - x0, 1.2f, hw * 2f), Layer = LALayers.Ground });

            // Ramps both ends
            foreach (int s in new[] { -1, 1 })
            {
                float xa = s * x1, xb = s * xr;
                float g = CityLayout.CurbHeight * 0f + 0.02f;
                var a0 = new Vector3(xa, y, z - hw);
                var a1 = new Vector3(xa, y, z + hw);
                var b1 = new Vector3(xb, g, z + hw);
                var b0 = new Vector3(xb, g, z - hw);
                f[CityMeshes.Asphalt].AddFlatQuad(a0, a1, b1, b0, Vector3.up, 1f / 6f);
                float run = Mathf.Abs(xb - xa);
                float pitch = Mathf.Atan2(y - g, run) * Mathf.Rad2Deg;
                var center = new Vector3((xa + xb) * 0.5f, (y + g) * 0.5f - 0.5f, z);
                float len = Mathf.Sqrt(run * run + (y - g) * (y - g));
                d.Colliders.Add(new ColliderData { Center = center, Size = new Vector3(len, 1f, hw * 2f), Euler = new Vector3(0, 0, s > 0 ? -pitch : pitch), Layer = LALayers.Ground });
                // Ramp side walls (visual)
                for (int side = -1; side <= 1; side += 2)
                {
                    var w0 = new Vector3(xa, y, z + side * hw);
                    var w1 = new Vector3(xb, g, z + side * hw);
                    f[CityMeshes.Concrete].AddFlatQuad(w0 + Vector3.down * 6f, w1 + Vector3.down * 0.1f, w1 + Vector3.up * 1f, w0 + Vector3.up * 1f, new Vector3(0, 0, side), 0.25f);
                    d.Colliders.Add(new ColliderData { Center = (w0 + w1) * 0.5f + Vector3.up * 0.5f, Size = new Vector3(len, 1.4f, 0.4f), Euler = new Vector3(0, 0, s > 0 ? -pitch : pitch), Layer = LALayers.Environment });
                }
            }

            // Barriers along the deck
            for (int side = -1; side <= 1; side += 2)
            {
                Shapes.Box(f[CityMeshes.Concrete], new Vector3(0, y + 0.5f, z + side * (hw - 0.2f)), new Vector3(x1 - x0, 1f, 0.4f), 0.25f);
                d.Colliders.Add(new ColliderData { Center = new Vector3(0, y + 0.6f, z + side * (hw - 0.2f)), Size = new Vector3(x1 - x0, 1.2f, 0.4f), Layer = LALayers.Environment });
            }

            Shapes.Box(f[CityMeshes.Concrete], new Vector3(0, y + 0.45f, z), new Vector3(x1 - x0, 0.9f, 0.6f), 0.25f); // centre divider
            d.Colliders.Add(new ColliderData { Center = new Vector3(0, y + 0.45f, z), Size = new Vector3(x1 - x0, 0.9f, 0.6f), Layer = LALayers.Environment });

            // Lane markings
            for (int side = -1; side <= 1; side += 2)
            {
                for (int k = 1; k < 3; k++)
                {
                    float off = 0.6f + k * 3.6f;
                    for (float x = x0 + 2f; x < x1 - 4f; x += 12f)
                    {
                        StripeQuad(f[CityMeshes.LineWhite], new Vector3(x + 2f, y, z + side * off), Vector3.right, 4f, 0.15f);
                    }
                }

                StripeQuad(f[CityMeshes.LineWhite], new Vector3(0, y, z + side * (hw - 1f)), Vector3.right, x1 - x0, 0.18f);
                StripeQuad(f[CityMeshes.LineYellow], new Vector3(0, y, z + side * 0.55f), Vector3.right, x1 - x0, 0.15f);
            }

            // Pillars, skipping the roads below (those spans are the bridges).
            for (float x = x0 + 10f; x < x1 - 5f; x += 30f)
            {
                bool overRoad = false;
                for (int i = 0; i < CityLayout.Lines.Length; i++)
                {
                    if (Mathf.Abs(x - CityLayout.Lines[i]) < CityLayout.RoadHalfWidth(i) + 3f) overRoad = true;
                }

                if (overRoad) continue;
                for (int side = -1; side <= 1; side += 2)
                {
                    var p = new Vector3(x, 0, z + side * (hw - 3f));
                    Shapes.CylinderBetween(f[CityMeshes.Concrete], p, p + Vector3.up * (y - 1.2f), 1.0f, 12, false);
                    d.Colliders.Add(new ColliderData { Center = p + Vector3.up * (y - 1.2f) * 0.5f, Size = new Vector3(2f, y - 1.2f, 2f), Layer = LALayers.Environment });
                }

                Shapes.Box(f[CityMeshes.Concrete], new Vector3(x, y - 1.6f, z), new Vector3(2.4f, 1.2f, hw * 2f - 2f), 0.25f);
            }

            // Overhead freeway sign
            Shapes.Box(f[CityMeshes.SignGreen], new Vector3(-200f, y + 6.5f, z - hw * 0.5f), new Vector3(0.3f, 2.4f, 9f));
            Shapes.Box(f[CityMeshes.Metal], new Vector3(-200f, y + 3.6f, z - hw + 0.4f), new Vector3(0.3f, 7.2f, 0.3f));
            Shapes.Box(f[CityMeshes.Metal], new Vector3(-200f, y + 7.8f, z - hw * 0.5f), new Vector3(0.25f, 0.25f, hw));
        }

        private static void BuildEdges(CityData d)
        {
            float e = CityLayout.HalfSize + 2f;
            for (int side = -1; side <= 1; side += 2)
            {
                d.Colliders.Add(new ColliderData { Center = new Vector3(side * e, 1.5f, 0), Size = new Vector3(1f, 3f, e * 2f), Layer = LALayers.Environment });
                d.Colliders.Add(new ColliderData { Center = new Vector3(0, 1.5f, side * e), Size = new Vector3(e * 2f, 3f, 1f), Layer = LALayers.Environment });
                Shapes.Box(d.Freeway[CityMeshes.Concrete], new Vector3(side * e, 0.6f, 0), new Vector3(0.8f, 1.2f, e * 2f), 0.25f);
                Shapes.Box(d.Freeway[CityMeshes.Concrete], new Vector3(0, 0.6f, side * e), new Vector3(e * 2f, 1.2f, 0.8f), 0.25f);
            }
        }
    }
}
