using System;
using System.Collections.Generic;
using UnityEngine;

namespace NeonRushLA.Geometry
{
    /// <summary>Procedural primitives used by the car, city, vegetation and people generators.</summary>
    public static class Shapes
    {
        // ------------------------------------------------------------------ boxes

        /// <summary>Axis-aligned box, flat shaded (24 vertices).</summary>
        public static void Box(MeshData m, Vector3 center, Vector3 size, float uvScale = 1f)
        {
            Vector3 h = size * 0.5f;
            Vector3 c = center;
            Vector3 p000 = c + new Vector3(-h.x, -h.y, -h.z), p100 = c + new Vector3(h.x, -h.y, -h.z);
            Vector3 p010 = c + new Vector3(-h.x, h.y, -h.z), p110 = c + new Vector3(h.x, h.y, -h.z);
            Vector3 p001 = c + new Vector3(-h.x, -h.y, h.z), p101 = c + new Vector3(h.x, -h.y, h.z);
            Vector3 p011 = c + new Vector3(-h.x, h.y, h.z), p111 = c + new Vector3(h.x, h.y, h.z);
            m.AddFlatQuad(p001, p101, p111, p011, Vector3.forward, uvScale);
            m.AddFlatQuad(p100, p000, p010, p110, Vector3.back, uvScale);
            m.AddFlatQuad(p101, p100, p110, p111, Vector3.right, uvScale);
            m.AddFlatQuad(p000, p001, p011, p010, Vector3.left, uvScale);
            m.AddFlatQuad(p010, p011, p111, p110, Vector3.up, uvScale);
            m.AddFlatQuad(p000, p100, p101, p001, Vector3.down, uvScale);
        }

        /// <summary>Box with the given transform applied (rotated boxes, mirrored parts...).</summary>
        public static void Box(MeshData m, Xform x, Vector3 size, float uvScale = 1f)
        {
            var tmp = new MeshData();
            Box(tmp, Vector3.zero, size, uvScale);
            m.Append(tmp, x);
        }

        /// <summary>
        /// Rounded box: a superellipse-section prism along Z with rounded ends. Smooth shaded.
        /// </summary>
        public static void RoundedBox(MeshData m, Vector3 center, Vector3 size, float radius, int cornerSegments = 3)
        {
            Vector3 h = size * 0.5f;
            radius = Mathf.Min(radius, Mathf.Min(h.x, Mathf.Min(h.y, h.z)) * 0.99f);
            // Sphere-swept box: sample a sphere and push vertices out to the box corners.
            int seg = Mathf.Max(1, cornerSegments) * 2 + 2;
            var tmp = new MeshData();
            Sphere(tmp, Vector3.zero, 1f, seg * 2, seg);
            Vector3 inner = new Vector3(h.x - radius, h.y - radius, h.z - radius);
            for (int i = 0; i < tmp.Vertices.Count; i++)
            {
                Vector3 n = tmp.Vertices[i];
                Vector3 core = new Vector3(Mathf.Sign(n.x) * inner.x, Mathf.Sign(n.y) * inner.y, Mathf.Sign(n.z) * inner.z);
                tmp.Vertices[i] = center + core + n * radius;
            }

            tmp.RecalculateNormals();
            m.Append(tmp);
        }

        // ------------------------------------------------------------------ sphere

        public static void Sphere(MeshData m, Vector3 center, float radius, int lonSegments = 16, int latSegments = 10)
        {
            Ellipsoid(m, center, new Vector3(radius, radius, radius), lonSegments, latSegments);
        }

        public static void Ellipsoid(MeshData m, Vector3 center, Vector3 radii, int lonSegments = 16, int latSegments = 10)
        {
            int start = m.VertexCount;
            for (int la = 0; la <= latSegments; la++)
            {
                float v = (float)la / latSegments;
                float phi = Mathf.PI * v;
                float y = Mathf.Cos(phi);
                float r = Mathf.Sin(phi);
                for (int lo = 0; lo <= lonSegments; lo++)
                {
                    float u = (float)lo / lonSegments;
                    float th = 2f * Mathf.PI * u;
                    var dir = new Vector3(r * Mathf.Cos(th), y, r * Mathf.Sin(th));
                    Vector3 p = center + new Vector3(dir.x * radii.x, dir.y * radii.y, dir.z * radii.z);
                    Vector3 n = new Vector3(dir.x / Mathf.Max(1e-4f, radii.x), dir.y / Mathf.Max(1e-4f, radii.y), dir.z / Mathf.Max(1e-4f, radii.z)).normalized;
                    m.AddVertex(p, n, new Vector2(u, 1f - v));
                }
            }

            int row = lonSegments + 1;
            for (int la = 0; la < latSegments; la++)
            {
                for (int lo = 0; lo < lonSegments; lo++)
                {
                    int a = start + la * row + lo;
                    int b = a + 1;
                    int c = a + row + 1;
                    int d = a + row;
                    Vector3 outward = m.Vertices[a] + m.Vertices[c] - 2f * center;
                    if (la != 0) m.AddTriangleFacing(a, b, c, outward);
                    if (la != latSegments - 1) m.AddTriangleFacing(a, c, d, outward);
                }
            }
        }

        /// <summary>Low-poly icosphere-like blob (faceted) for foliage. Noise displaces vertices.</summary>
        public static void Blob(MeshData m, Vector3 center, Vector3 radii, System.Random rng, float noise = 0.15f, int lon = 8, int lat = 6)
        {
            var tmp = new MeshData();
            Ellipsoid(tmp, Vector3.zero, Vector3.one, lon, lat);
            // Weld seam/pole duplicates so noise keeps the surface closed.
            var key = new Dictionary<long, float>();
            for (int i = 0; i < tmp.Vertices.Count; i++)
            {
                Vector3 v = tmp.Vertices[i];
                long k = ((long)Mathf.RoundToInt(v.x * 1000f) * 73856093L) ^ ((long)Mathf.RoundToInt(v.y * 1000f) * 19349663L) ^ ((long)Mathf.RoundToInt(v.z * 1000f) * 83492791L);
                if (!key.TryGetValue(k, out float s))
                {
                    s = 1f + ((float)rng.NextDouble() * 2f - 1f) * noise;
                    key.Add(k, s);
                }

                tmp.Vertices[i] = new Vector3(v.x * radii.x * s, v.y * radii.y * s, v.z * radii.z * s) + center;
            }

            tmp.RecalculateNormals();
            m.Append(tmp);
        }

        // ------------------------------------------------------------------ lathe / cylinders

        /// <summary>
        /// Surface of revolution around the local Y axis. Profile points are (radius, y).
        /// <paramref name="outwardSign"/> +1 = normals away from the axis.
        /// </summary>
        public static void Lathe(MeshData m, IList<Vector2> profile, int segments, float outwardSign = 1f, bool smooth = true, float arcStart = 0f, float arcEnd = 360f)
        {
            int start = m.VertexCount;
            int n = profile.Count;
            bool full = Mathf.Abs(arcEnd - arcStart - 360f) < 0.01f;
            for (int s = 0; s <= segments; s++)
            {
                float a = Mathf.Lerp(arcStart, arcEnd, (float)s / segments) * Mathf.Deg2Rad;
                float ca = Mathf.Cos(a), sa = Mathf.Sin(a);
                for (int i = 0; i < n; i++)
                {
                    Vector2 pr = profile[i];
                    var p = new Vector3(pr.x * ca, pr.y, pr.x * sa);
                    // Profile tangent → normal in the (r, y) plane.
                    Vector2 t = (i < n - 1 ? profile[i + 1] : profile[i]) - (i > 0 ? profile[i - 1] : profile[i]);
                    var n2 = new Vector2(t.y, -t.x);
                    if (n2.sqrMagnitude < 1e-12f) n2 = new Vector2(1, 0);
                    n2.Normalize();
                    n2 *= outwardSign;
                    var nn = new Vector3(n2.x * ca, n2.y, n2.x * sa);
                    m.AddVertex(p, nn, new Vector2((float)s / segments, (float)i / (n - 1)));
                }
            }

            for (int s = 0; s < segments; s++)
            {
                for (int i = 0; i < n - 1; i++)
                {
                    int a = start + s * n + i;
                    int b = a + n;
                    int c = b + 1;
                    int d = a + 1;
                    Vector3 mid = (m.Vertices[a] + m.Vertices[c]) * 0.5f;
                    Vector3 outward = (m.Normals[a] + m.Normals[c]);
                    if (outward.sqrMagnitude < 1e-10f) outward = new Vector3(mid.x, 0, mid.z) * outwardSign;
                    m.AddQuadFacing(a, b, c, d, outward);
                }
            }

            if (!smooth)
            {
                // nothing: lathe normals are analytic.
            }

            _ = full;
        }

        /// <summary>Closed cylinder along Y, centered at origin.</summary>
        public static void Cylinder(MeshData m, float radius, float height, int segments, bool caps = true)
        {
            float h = height * 0.5f;
            Lathe(m, new[] { new Vector2(radius, -h), new Vector2(radius, h) }, segments);
            if (caps)
            {
                Disc(m, new Vector3(0, h, 0), radius, segments, Vector3.up);
                Disc(m, new Vector3(0, -h, 0), radius, segments, Vector3.down);
            }
        }

        /// <summary>Flat disc in the plane perpendicular to Y.</summary>
        public static void Disc(MeshData m, Vector3 center, float radius, int segments, Vector3 normal)
        {
            int c = m.AddVertex(center, normal, new Vector2(0.5f, 0.5f));
            int first = m.VertexCount;
            for (int s = 0; s <= segments; s++)
            {
                float a = 2f * Mathf.PI * s / segments;
                var p = center + new Vector3(Mathf.Cos(a) * radius, 0, Mathf.Sin(a) * radius);
                m.AddVertex(p, normal, new Vector2(0.5f + 0.5f * Mathf.Cos(a), 0.5f + 0.5f * Mathf.Sin(a)));
            }

            for (int s = 0; s < segments; s++)
            {
                m.AddTriangleFacing(c, first + s, first + s + 1, normal);
            }
        }

        /// <summary>Cylinder between two points (poles, pipes, exhaust tips...).</summary>
        public static void CylinderBetween(MeshData m, Vector3 a, Vector3 b, float radius, int segments, bool caps = true)
        {
            var tmp = new MeshData();
            float len = (b - a).magnitude;
            Cylinder(tmp, radius, len, segments, caps);
            m.Append(tmp, AlignY(a, b));
        }

        /// <summary>Transform mapping local +Y (length 1 unit = 1 m) onto segment a→b, centered.</summary>
        public static Xform AlignY(Vector3 a, Vector3 b)
        {
            Vector3 y = (b - a).normalized;
            Vector3 helper = Mathf.Abs(y.y) < 0.95f ? Vector3.up : Vector3.forward;
            Vector3 x = Vector3.Cross(helper, y).normalized;
            Vector3 z = Vector3.Cross(x, y).normalized;
            // Columns = x, y, z.
            return new Xform
            {
                R0 = new Vector3(x.x, y.x, z.x),
                R1 = new Vector3(x.y, y.y, z.y),
                R2 = new Vector3(x.z, y.z, z.z),
                T = (a + b) * 0.5f,
            };
        }

        // ------------------------------------------------------------------ lofts, tubes, ribbons

        /// <summary>
        /// Lofts a sequence of rings (same point count) into a smooth surface. Optional
        /// per-quad material selection lets one loft feed several material slots.
        /// <paramref name="closedRings"/> connects the last ring point to the first.
        /// </summary>
        public static void Loft(PartSet set, List<Vector3[]> rings, bool closedRings, Func<int, int, string> materialForQuad,
            Func<Vector3, Vector3> outwardAt, float uScale = 1f, float vScale = 1f)
        {
            int nr = rings.Count;
            int np = rings[0].Length;
            int segs = closedRings ? np : np - 1;

            // Analytic-ish smooth normals from the grid.
            var normals = new Vector3[nr, np];
            for (int r = 0; r < nr; r++)
            {
                for (int i = 0; i < np; i++)
                {
                    Vector3 along = rings[Mathf.Min(r + 1, nr - 1)][i] - rings[Mathf.Max(r - 1, 0)][i];
                    int ip = closedRings ? (i + 1) % np : Mathf.Min(i + 1, np - 1);
                    int im = closedRings ? (i - 1 + np) % np : Mathf.Max(i - 1, 0);
                    Vector3 around = rings[r][ip] - rings[r][im];
                    Vector3 n = Vector3.Cross(along, around);
                    if (n.sqrMagnitude < 1e-14f) n = outwardAt(rings[r][i]);
                    n.Normalize();
                    if (Vector3.Dot(n, outwardAt(rings[r][i])) < 0f) n = -n;
                    normals[r, i] = n;
                }
            }

            // Arc-length UVs.
            var vAcc = new float[nr];
            for (int r = 1; r < nr; r++) vAcc[r] = vAcc[r - 1] + (rings[r][np / 2] - rings[r - 1][np / 2]).magnitude;

            var cache = new Dictionary<string, Dictionary<int, int>>();
            for (int r = 0; r < nr - 1; r++)
            {
                for (int s = 0; s < segs; s++)
                {
                    string mat = materialForQuad(r, s);
                    if (mat == null) continue;
                    MeshData m = set[mat];
                    if (!cache.TryGetValue(mat, out Dictionary<int, int> map))
                    {
                        map = new Dictionary<int, int>();
                        cache.Add(mat, map);
                    }

                    int s1 = (s + 1) % np;
                    int a = Get(m, map, rings, normals, vAcc, r, s, uScale, vScale);
                    int b = Get(m, map, rings, normals, vAcc, r + 1, s, uScale, vScale);
                    int c = Get(m, map, rings, normals, vAcc, r + 1, s1, uScale, vScale);
                    int d = Get(m, map, rings, normals, vAcc, r, s1, uScale, vScale);
                    Vector3 outward = normals[r, s] + normals[r + 1, s1];
                    m.AddQuadFacing(a, b, c, d, outward);
                }
            }
        }

        private static int Get(MeshData m, Dictionary<int, int> map, List<Vector3[]> rings, Vector3[,] normals, float[] vAcc, int r, int i, float uScale, float vScale)
        {
            int key = r * 100000 + i;
            if (map.TryGetValue(key, out int idx)) return idx;
            float u = 0f;
            for (int k = 1; k <= i; k++) u += (rings[r][k] - rings[r][k - 1]).magnitude;
            idx = m.AddVertex(rings[r][i], normals[r, i], new Vector2(u * uScale, vAcc[r] * vScale));
            map.Add(key, idx);
            return idx;
        }

        /// <summary>Fan-triangulated cap over a (roughly convex) ring.</summary>
        public static void Cap(MeshData m, Vector3[] ring, Vector3 normal, int from = 0, int to = -1)
        {
            if (to < 0) to = ring.Length - 1;
            Vector3 c = Vector3.zero;
            int count = to - from + 1;
            for (int i = from; i <= to; i++) c += ring[i];
            c /= count;
            int ci = m.AddVertex(c, normal, new Vector2(0.5f, 0.5f));
            int first = m.VertexCount;
            for (int i = from; i <= to; i++) m.AddVertex(ring[i], normal, new Vector2(ring[i].x, ring[i].y));
            for (int i = 0; i < count - 1; i++) m.AddTriangleFacing(ci, first + i, first + i + 1, normal);
            m.AddTriangleFacing(ci, first + count - 1, first, normal);
        }

        /// <summary>Tube along a polyline with per-point radius (trunks, pillars, cables).</summary>
        public static void Tube(MeshData m, IList<Vector3> path, IList<float> radii, int segments, bool capEnd = true, bool capStart = false)
        {
            int n = path.Count;
            var rings = new List<Vector3[]>();
            Vector3 prevSide = Vector3.zero;
            for (int i = 0; i < n; i++)
            {
                Vector3 t = (path[Mathf.Min(i + 1, n - 1)] - path[Mathf.Max(i - 1, 0)]).normalized;
                Vector3 side = i == 0
                    ? Vector3.Cross(Mathf.Abs(t.y) < 0.95f ? Vector3.up : Vector3.forward, t).normalized
                    : Vector3.Cross(t, Vector3.Cross(prevSide, t)).normalized; // parallel transport
                if (side.sqrMagnitude < 1e-8f) side = Vector3.right;
                prevSide = side;
                Vector3 up = Vector3.Cross(t, side).normalized;
                var ring = new Vector3[segments];
                for (int s = 0; s < segments; s++)
                {
                    float a = 2f * Mathf.PI * s / segments;
                    ring[s] = path[i] + (side * Mathf.Cos(a) + up * Mathf.Sin(a)) * radii[i];
                }

                rings.Add(ring);
            }

            var set = new PartSet();
            Loft(set, rings, true, (r, s) => "x", p => OutwardFromPath(p, path));
            m.Append(set["x"]);
            if (capEnd)
            {
                Vector3 tEnd = (path[n - 1] - path[n - 2]).normalized;
                Cap(m, rings[n - 1], tEnd);
            }

            if (capStart)
            {
                Vector3 tStart = (path[0] - path[1]).normalized;
                Cap(m, rings[0], tStart);
            }
        }

        private static Vector3 OutwardFromPath(Vector3 p, IList<Vector3> path)
        {
            // Nearest path point gives the outward direction.
            float best = float.MaxValue;
            Vector3 bestQ = path[0];
            for (int i = 0; i < path.Count - 1; i++)
            {
                Vector3 a = path[i], b = path[i + 1];
                Vector3 ab = b - a;
                float t = Mathf.Clamp01(Vector3.Dot(p - a, ab) / Mathf.Max(1e-8f, ab.sqrMagnitude));
                Vector3 q = a + ab * t;
                float d = (p - q).sqrMagnitude;
                if (d < best)
                {
                    best = d;
                    bestQ = q;
                }
            }

            return p - bestQ;
        }

        /// <summary>Double-sided ribbon along a path (palm fronds, flags, lines). width per point, sideways = sideDir.</summary>
        public static void Ribbon(MeshData m, IList<Vector3> path, IList<float> widths, IList<Vector3> sideDirs, Vector3 upHint, bool doubleSided = true)
        {
            int n = path.Count;
            int start = m.VertexCount;
            for (int i = 0; i < n; i++)
            {
                Vector3 side = sideDirs[i].normalized * (widths[i] * 0.5f);
                Vector3 t = (path[Mathf.Min(i + 1, n - 1)] - path[Mathf.Max(i - 1, 0)]).normalized;
                Vector3 nrm = Vector3.Cross(t, sideDirs[i]).normalized;
                if (Vector3.Dot(nrm, upHint) < 0f) nrm = -nrm;
                float v = (float)i / (n - 1);
                m.AddVertex(path[i] - side, nrm, new Vector2(0f, v));
                m.AddVertex(path[i] + side, nrm, new Vector2(1f, v));
            }

            for (int i = 0; i < n - 1; i++)
            {
                int a = start + i * 2, b = a + 1, c = a + 3, d = a + 2;
                Vector3 nrm = m.Normals[a];
                m.AddQuadFacing(a, b, c, d, nrm);
            }

            if (doubleSided)
            {
                int back = m.VertexCount;
                for (int i = 0; i < n * 2; i++)
                {
                    m.AddVertex(m.Vertices[start + i], -m.Normals[start + i], m.UVs[start + i]);
                }

                for (int i = 0; i < n - 1; i++)
                {
                    int a = back + i * 2, b = a + 1, c = a + 3, d = a + 2;
                    m.AddQuadFacing(a, b, c, d, m.Normals[a]);
                }
            }
        }

        /// <summary>Extrudes a closed 2D outline (in XY) along Z from z0 to z1, with caps.</summary>
        /// <summary>Rounded-rectangle outline (counter-clockwise), corner radius clamped to the size.</summary>
        public static List<Vector2> RoundedRectOutline(Vector2 size, float radius, int cornerSegments = 4)
        {
            float hw = size.x * 0.5f, hh = size.y * 0.5f;
            radius = Mathf.Clamp(radius, 0f, Mathf.Min(hw, hh) * 0.999f);
            int cs = Mathf.Max(1, cornerSegments);
            var pts = new List<Vector2>();
            var centres = new[]
            {
                new Vector2(hw - radius, hh - radius), new Vector2(-hw + radius, hh - radius),
                new Vector2(-hw + radius, -hh + radius), new Vector2(hw - radius, -hh + radius),
            };
            for (int c = 0; c < 4; c++)
            {
                for (int i = 0; i <= cs; i++)
                {
                    float a = (c * 90f + 90f * i / cs) * Mathf.Deg2Rad;
                    pts.Add(centres[c] + new Vector2(Mathf.Cos(a), Mathf.Sin(a)) * radius);
                }
            }

            return pts;
        }

        /// <summary>
        /// Thin plate with rounded corners in its own plane (local XY, thickness along Z), placed at
        /// <paramref name="center"/> and rotated by <paramref name="orient"/>. Used for lamps, grilles, vents.
        /// </summary>
        public static void RoundedPlate(MeshData m, Vector3 center, Vector2 size, float thickness, float radius, int cornerSegments = 4, Xform? orient = null)
        {
            var tmp = new MeshData();
            Extrude(tmp, RoundedRectOutline(size, radius, cornerSegments), -thickness * 0.5f, thickness * 0.5f, true);
            m.Append(tmp, Xform.Translate(center) * (orient ?? Xform.Identity));
        }

        public static void Extrude(MeshData m, IList<Vector2> outline, float z0, float z1, bool caps = true)
        {
            int n = outline.Count;
            // Side walls, flat per edge.
            Vector2 centroid = Vector2.zero;
            for (int i = 0; i < n; i++) centroid += outline[i];
            centroid /= n;
            for (int i = 0; i < n; i++)
            {
                Vector2 a2 = outline[i], b2 = outline[(i + 1) % n];
                var a0 = new Vector3(a2.x, a2.y, z0);
                var b0 = new Vector3(b2.x, b2.y, z0);
                var b1 = new Vector3(b2.x, b2.y, z1);
                var a1 = new Vector3(a2.x, a2.y, z1);
                Vector2 mid = (a2 + b2) * 0.5f - centroid;
                var edge = b2 - a2;
                var out2 = new Vector2(edge.y, -edge.x);
                if (Vector2.Dot(out2, mid) < 0f) out2 = -out2;
                m.AddFlatQuad(a0, b0, b1, a1, new Vector3(out2.x, out2.y, 0f));
            }

            if (caps)
            {
                var r0 = new Vector3[n];
                var r1 = new Vector3[n];
                for (int i = 0; i < n; i++)
                {
                    r0[i] = new Vector3(outline[i].x, outline[i].y, z0);
                    r1[i] = new Vector3(outline[i].x, outline[i].y, z1);
                }

                float dir = Mathf.Sign(z1 - z0);
                Cap(m, r0, new Vector3(0, 0, -dir));
                Cap(m, r1, new Vector3(0, 0, dir));
            }
        }
    }
}
