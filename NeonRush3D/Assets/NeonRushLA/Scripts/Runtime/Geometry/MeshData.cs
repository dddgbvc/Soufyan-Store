using System;
using System.Collections.Generic;
using UnityEngine;

namespace NeonRushLA.Geometry
{
    /// <summary>
    /// Engine-independent mesh buffer (pure managed code: no Unity native calls), so the same
    /// procedural models can be generated in the Editor, at runtime, or in offline tools.
    /// Winding follows Unity: the front face of triangle (a,b,c) faces Cross(b-a, c-a).
    /// </summary>
    public sealed class MeshData
    {
        public readonly List<Vector3> Vertices = new List<Vector3>();
        public readonly List<Vector3> Normals = new List<Vector3>();
        public readonly List<Vector2> UVs = new List<Vector2>();
        public readonly List<int> Triangles = new List<int>();

        public int VertexCount => Vertices.Count;
        public int TriangleCount => Triangles.Count / 3;

        public int AddVertex(Vector3 p, Vector3 n, Vector2 uv)
        {
            Vertices.Add(p);
            Normals.Add(n);
            UVs.Add(uv);
            return Vertices.Count - 1;
        }

        public void AddTriangle(int a, int b, int c)
        {
            Triangles.Add(a);
            Triangles.Add(b);
            Triangles.Add(c);
        }

        /// <summary>Adds a triangle whose front face points along <paramref name="outward"/>.</summary>
        public void AddTriangleFacing(int a, int b, int c, Vector3 outward)
        {
            Vector3 n = Vector3.Cross(Vertices[b] - Vertices[a], Vertices[c] - Vertices[a]);
            if (Vector3.Dot(n, outward) < 0f)
            {
                AddTriangle(a, c, b);
            }
            else
            {
                AddTriangle(a, b, c);
            }
        }

        /// <summary>Quad a-b-c-d (in order around the edge), front face along <paramref name="outward"/>.</summary>
        public void AddQuadFacing(int a, int b, int c, int d, Vector3 outward)
        {
            AddTriangleFacing(a, b, c, outward);
            AddTriangleFacing(a, c, d, outward);
        }

        /// <summary>Adds a flat-shaded quad with its own vertices.</summary>
        public void AddFlatQuad(Vector3 a, Vector3 b, Vector3 c, Vector3 d, Vector3 outward, float uvScale = 1f)
        {
            Vector3 n = Vector3.Cross(b - a, c - a);
            if (n.sqrMagnitude < 1e-12f) n = outward;
            n = n.normalized;
            if (Vector3.Dot(n, outward) < 0f) n = -n;
            Vector3 u = (b - a);
            float lu = u.magnitude;
            float lv = (d - a).magnitude;
            int i0 = AddVertex(a, n, Vector2.zero);
            int i1 = AddVertex(b, n, new Vector2(lu * uvScale, 0f));
            int i2 = AddVertex(c, n, new Vector2(lu * uvScale, lv * uvScale));
            int i3 = AddVertex(d, n, new Vector2(0f, lv * uvScale));
            AddQuadFacing(i0, i1, i2, i3, n);
        }

        public void Append(MeshData other)
        {
            Append(other, Xform.Identity);
        }

        public void Append(MeshData other, Xform x)
        {
            int offset = Vertices.Count;
            bool flip = x.Determinant < 0f;
            for (int i = 0; i < other.Vertices.Count; i++)
            {
                Vertices.Add(x.Point(other.Vertices[i]));
                Normals.Add(x.Normal(other.Normals[i]));
                UVs.Add(other.UVs[i]);
            }

            for (int i = 0; i < other.Triangles.Count; i += 3)
            {
                int a = other.Triangles[i] + offset;
                int b = other.Triangles[i + 1] + offset;
                int c = other.Triangles[i + 2] + offset;
                if (flip)
                {
                    AddTriangle(a, c, b);
                }
                else
                {
                    AddTriangle(a, b, c);
                }
            }
        }

        /// <summary>Appends a back-facing copy of every triangle (two-sided surfaces: liners, tubes).</summary>
        public void MakeDoubleSided()
        {
            int vCount = Vertices.Count;
            int tCount = Triangles.Count;
            for (int i = 0; i < vCount; i++)
            {
                Vertices.Add(Vertices[i]);
                Normals.Add(-Normals[i]);
                UVs.Add(UVs[i]);
            }

            for (int i = 0; i < tCount; i += 3)
            {
                Triangles.Add(Triangles[i] + vCount);
                Triangles.Add(Triangles[i + 2] + vCount);
                Triangles.Add(Triangles[i + 1] + vCount);
            }
        }

        public MeshData Transformed(Xform x)
        {
            var m = new MeshData();
            m.Append(this, x);
            return m;
        }

        /// <summary>Smooth vertex normals from faces (area weighted). Shared vertices only.</summary>
        public void RecalculateNormals()
        {
            var acc = new Vector3[Vertices.Count];
            for (int i = 0; i < Triangles.Count; i += 3)
            {
                int a = Triangles[i], b = Triangles[i + 1], c = Triangles[i + 2];
                Vector3 n = Vector3.Cross(Vertices[b] - Vertices[a], Vertices[c] - Vertices[a]);
                acc[a] += n;
                acc[b] += n;
                acc[c] += n;
            }

            for (int i = 0; i < acc.Length; i++)
            {
                Normals[i] = acc[i].sqrMagnitude > 1e-20f ? acc[i].normalized : Vector3.up;
            }
        }

        public void Bounds(out Vector3 min, out Vector3 max)
        {
            min = new Vector3(float.MaxValue, float.MaxValue, float.MaxValue);
            max = -min;
            for (int i = 0; i < Vertices.Count; i++)
            {
                min = Vector3.Min(min, Vertices[i]);
                max = Vector3.Max(max, Vertices[i]);
            }
        }
    }

    /// <summary>Affine transform (rotation/scale rows + translation) with no native dependencies.</summary>
    public struct Xform
    {
        public Vector3 R0, R1, R2, T;

        public static readonly Xform Identity = new Xform
        {
            R0 = new Vector3(1, 0, 0), R1 = new Vector3(0, 1, 0), R2 = new Vector3(0, 0, 1), T = Vector3.zero
        };

        public Vector3 Point(Vector3 p)
        {
            return new Vector3(Vector3.Dot(R0, p) + T.x, Vector3.Dot(R1, p) + T.y, Vector3.Dot(R2, p) + T.z);
        }

        public Vector3 Dir(Vector3 v)
        {
            return new Vector3(Vector3.Dot(R0, v), Vector3.Dot(R1, v), Vector3.Dot(R2, v));
        }

        /// <summary>Normal transform (inverse transpose, valid for rotation + axis scale).</summary>
        public Vector3 Normal(Vector3 n)
        {
            // Columns of the 3x3 matrix.
            var c0 = new Vector3(R0.x, R1.x, R2.x);
            var c1 = new Vector3(R0.y, R1.y, R2.y);
            var c2 = new Vector3(R0.z, R1.z, R2.z);
            // Cofactor matrix rows = inverse transpose * det.
            Vector3 k0 = Vector3.Cross(c1, c2);
            Vector3 k1 = Vector3.Cross(c2, c0);
            Vector3 k2 = Vector3.Cross(c0, c1);
            Vector3 r = k0 * n.x + k1 * n.y + k2 * n.z;
            if (Determinant < 0f) r = -r;
            return r.sqrMagnitude > 1e-20f ? r.normalized : n;
        }

        public float Determinant => Vector3.Dot(R0, Vector3.Cross(R1, R2));

        public static Xform Translate(Vector3 t)
        {
            Xform x = Identity;
            x.T = t;
            return x;
        }

        public static Xform Scale(Vector3 s)
        {
            return new Xform { R0 = new Vector3(s.x, 0, 0), R1 = new Vector3(0, s.y, 0), R2 = new Vector3(0, 0, s.z), T = Vector3.zero };
        }

        /// <summary>Rotation about Y (degrees), Unity convention (positive = clockwise seen from above).</summary>
        public static Xform RotateY(float degrees)
        {
            float r = degrees * Mathf.Deg2Rad, c = Mathf.Cos(r), s = Mathf.Sin(r);
            return new Xform { R0 = new Vector3(c, 0, s), R1 = new Vector3(0, 1, 0), R2 = new Vector3(-s, 0, c), T = Vector3.zero };
        }

        public static Xform RotateX(float degrees)
        {
            float r = degrees * Mathf.Deg2Rad, c = Mathf.Cos(r), s = Mathf.Sin(r);
            return new Xform { R0 = new Vector3(1, 0, 0), R1 = new Vector3(0, c, -s), R2 = new Vector3(0, s, c), T = Vector3.zero };
        }

        public static Xform RotateZ(float degrees)
        {
            float r = degrees * Mathf.Deg2Rad, c = Mathf.Cos(r), s = Mathf.Sin(r);
            return new Xform { R0 = new Vector3(c, -s, 0), R1 = new Vector3(s, c, 0), R2 = new Vector3(0, 0, 1), T = Vector3.zero };
        }

        /// <summary>a then b (b ∘ a).</summary>
        public static Xform operator *(Xform b, Xform a)
        {
            var bc0 = new Vector3(b.R0.x, b.R1.x, b.R2.x);
            var bc1 = new Vector3(b.R0.y, b.R1.y, b.R2.y);
            var bc2 = new Vector3(b.R0.z, b.R1.z, b.R2.z);
            Xform r;
            r.R0 = new Vector3(Vector3.Dot(b.R0, new Vector3(a.R0.x, a.R1.x, a.R2.x)), Vector3.Dot(b.R0, new Vector3(a.R0.y, a.R1.y, a.R2.y)), Vector3.Dot(b.R0, new Vector3(a.R0.z, a.R1.z, a.R2.z)));
            r.R1 = new Vector3(Vector3.Dot(b.R1, new Vector3(a.R0.x, a.R1.x, a.R2.x)), Vector3.Dot(b.R1, new Vector3(a.R0.y, a.R1.y, a.R2.y)), Vector3.Dot(b.R1, new Vector3(a.R0.z, a.R1.z, a.R2.z)));
            r.R2 = new Vector3(Vector3.Dot(b.R2, new Vector3(a.R0.x, a.R1.x, a.R2.x)), Vector3.Dot(b.R2, new Vector3(a.R0.y, a.R1.y, a.R2.y)), Vector3.Dot(b.R2, new Vector3(a.R0.z, a.R1.z, a.R2.z)));
            r.T = b.Point(a.T);
            _ = bc0; _ = bc1; _ = bc2;
            return r;
        }

        public static Xform MirrorX => Scale(new Vector3(-1, 1, 1));
    }

    /// <summary>Named material slots → mesh buffers. A model is a PartSet.</summary>
    public sealed class PartSet
    {
        public readonly Dictionary<string, MeshData> Parts = new Dictionary<string, MeshData>();

        public MeshData this[string material]
        {
            get
            {
                if (!Parts.TryGetValue(material, out MeshData m))
                {
                    m = new MeshData();
                    Parts.Add(material, m);
                }

                return m;
            }
        }

        public void Append(PartSet other, Xform x)
        {
            foreach (KeyValuePair<string, MeshData> kv in other.Parts)
            {
                this[kv.Key].Append(kv.Value, x);
            }
        }

        public int TotalTriangles
        {
            get
            {
                int t = 0;
                foreach (MeshData m in Parts.Values) t += m.TriangleCount;
                return t;
            }
        }

        public int TotalVertices
        {
            get
            {
                int t = 0;
                foreach (MeshData m in Parts.Values) t += m.VertexCount;
                return t;
            }
        }
    }
}
