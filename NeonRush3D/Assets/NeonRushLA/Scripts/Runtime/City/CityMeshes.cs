using System.Collections.Generic;
using NeonRushLA.Geometry;
using UnityEngine;

namespace NeonRushLA.City
{
    /// <summary>Procedural city furniture: buildings, palms, trees, lamps, signals, signs. Pure managed code.</summary>
    public static class CityMeshes
    {
        // Material slots
        public const string Asphalt = "Asphalt";
        public const string LineWhite = "LineWhite";
        public const string LineYellow = "LineYellow";
        public const string Sidewalk = "Sidewalk";
        public const string Curb = "Curb";
        public const string Grass = "Grass";
        public const string Plaza = "Plaza";
        public const string FacadeGlass = "FacadeGlass";
        public const string FacadeOffice = "FacadeOffice";
        public const string FacadeStucco = "FacadeStucco";
        public const string FacadeBrick = "FacadeBrick";
        public const string Roof = "Roof";
        public const string Storefront = "Storefront";
        public const string Awning = "Awning";
        public const string NeonSign = "NeonSign";
        public const string PalmTrunk = "PalmTrunk";
        public const string PalmLeaf = "PalmLeaf";
        public const string PalmSkirt = "PalmSkirt";
        public const string Bark = "Bark";
        public const string Leaf = "Leaf";
        public const string Metal = "Metal";
        public const string LampHead = "LampHead";
        public const string SignalHousing = "SignalHousing";
        public const string SignGreen = "SignGreen";
        public const string SignWhite = "SignWhite";
        public const string Concrete = "Concrete";

        public static readonly string[] AllSlots =
        {
            Asphalt, LineWhite, LineYellow, Sidewalk, Curb, Grass, Plaza, FacadeGlass, FacadeOffice, FacadeStucco, FacadeBrick, Roof,
            Storefront, Awning, NeonSign, PalmTrunk, PalmLeaf, PalmSkirt, Bark, Leaf, Metal, LampHead, SignalHousing, SignGreen, SignWhite, Concrete
        };

        // ------------------------------------------------------------------ buildings

        /// <summary>
        /// Box with facade UVs in world metres (u along the wall / tileW, v = height / tileH),
        /// so floors line up across buildings. Roof goes to its own slot.
        /// </summary>
        public static void FacadeBox(PartSet set, string facade, Vector3 min, Vector3 max, float tileW, float tileH, bool roof = true)
        {
            MeshData m = set[facade];
            Vector3 a = min, b = max;
            var corners = new[]
            {
                new Vector3(a.x, 0, a.z), new Vector3(b.x, 0, a.z), new Vector3(b.x, 0, b.z), new Vector3(a.x, 0, b.z)
            };
            Vector3[] outward = { Vector3.back, Vector3.right, Vector3.forward, Vector3.left };
            float u0 = 0f;
            for (int i = 0; i < 4; i++)
            {
                Vector3 p0 = corners[i], p1 = corners[(i + 1) % 4];
                float w = (p1 - p0).magnitude;
                Vector3 n = outward[i];
                int i0 = m.AddVertex(new Vector3(p0.x, a.y, p0.z), n, new Vector2(u0 / tileW, a.y / tileH));
                int i1 = m.AddVertex(new Vector3(p1.x, a.y, p1.z), n, new Vector2((u0 + w) / tileW, a.y / tileH));
                int i2 = m.AddVertex(new Vector3(p1.x, b.y, p1.z), n, new Vector2((u0 + w) / tileW, b.y / tileH));
                int i3 = m.AddVertex(new Vector3(p0.x, b.y, p0.z), n, new Vector2(u0 / tileW, b.y / tileH));
                m.AddQuadFacing(i0, i1, i2, i3, n);
                u0 += w;
            }

            if (roof)
            {
                set[Roof].AddFlatQuad(new Vector3(a.x, b.y, a.z), new Vector3(a.x, b.y, b.z), new Vector3(b.x, b.y, b.z), new Vector3(b.x, b.y, a.z), Vector3.up, 0.25f);
            }
        }

        public static void Tower(PartSet set, Rect r, float height, System.Random rng, float ground)
        {
            string facade = rng.NextDouble() < 0.55 ? FacadeGlass : FacadeOffice;
            float tileW = 12f, tileH = 14f;
            // Podium + shaft + crown setbacks
            float podium = Mathf.Min(10.5f, height * 0.2f);
            FacadeBox(set, Storefront, new Vector3(r.xMin, ground, r.yMin), new Vector3(r.xMax, ground + 4.2f, r.yMax), 6f, 4.2f, false);
            FacadeBox(set, facade, new Vector3(r.xMin, ground + 4.2f, r.yMin), new Vector3(r.xMax, ground + podium, r.yMax), tileW, tileH);
            float inset = Mathf.Min(r.width, r.height) * 0.08f;
            var shaft = Rect.MinMaxRect(r.xMin + inset, r.yMin + inset, r.xMax - inset, r.yMax - inset);
            float top = ground + height * (rng.NextDouble() < 0.5 ? 0.82f : 1f);
            FacadeBox(set, facade, new Vector3(shaft.xMin, ground + podium, shaft.yMin), new Vector3(shaft.xMax, top, shaft.yMax), tileW, tileH);
            if (top < ground + height - 1f)
            {
                float in2 = Mathf.Min(shaft.width, shaft.height) * 0.15f;
                FacadeBox(set, facade, new Vector3(shaft.xMin + in2, top, shaft.yMin + in2), new Vector3(shaft.xMax - in2, ground + height, shaft.yMax - in2), tileW, tileH);
            }

            // Roof equipment + antenna
            Vector2 c = shaft.center;
            Shapes.Box(set[Concrete], new Vector3(c.x - 3f, ground + height + 1.2f, c.y), new Vector3(6f, 2.4f, 5f));
            Shapes.Box(set[Metal], new Vector3(c.x + 4f, ground + height + 0.8f, c.y + 2f), new Vector3(3f, 1.6f, 3f));
            if (height > 90f)
            {
                Shapes.CylinderBetween(set[Metal], new Vector3(c.x, ground + height, c.y), new Vector3(c.x, ground + height + 18f, c.y), 0.35f, 6, true);
                Shapes.Sphere(set[LampHead], new Vector3(c.x, ground + height + 18.4f, c.y), 0.6f, 8, 5);
            }
        }

        public static void Commercial(PartSet set, Rect r, int floors, System.Random rng, float ground, Vector3 street)
        {
            string facade = rng.NextDouble() < 0.5 ? FacadeBrick : FacadeStucco;
            float h = 4.4f + (floors - 1) * 3.4f;
            FacadeBox(set, Storefront, new Vector3(r.xMin, ground, r.yMin), new Vector3(r.xMax, ground + 4.4f, r.yMax), 6f, 4.4f, floors == 1);
            if (floors > 1) FacadeBox(set, facade, new Vector3(r.xMin, ground + 4.4f, r.yMin), new Vector3(r.xMax, ground + h, r.yMax), 9f, 10.2f);
            // Parapet
            Shapes.Box(set[Concrete], new Vector3(r.center.x, ground + h + 0.5f, r.yMin + 0.15f), new Vector3(r.width, 1f, 0.3f));
            Shapes.Box(set[Concrete], new Vector3(r.center.x, ground + h + 0.5f, r.yMax - 0.15f), new Vector3(r.width, 1f, 0.3f));
            Shapes.Box(set[Concrete], new Vector3(r.xMin + 0.15f, ground + h + 0.5f, r.center.y), new Vector3(0.3f, 1f, r.height));
            Shapes.Box(set[Concrete], new Vector3(r.xMax - 0.15f, ground + h + 0.5f, r.center.y), new Vector3(0.3f, 1f, r.height));

            // Awning + neon sign on the street face
            Vector3 n = street.normalized;
            Vector3 along = new Vector3(n.z, 0, -n.x);
            Vector3 faceCenter = new Vector3(r.center.x + n.x * r.width * 0.5f, ground, r.center.y + n.z * r.height * 0.5f);
            float faceLen = Mathf.Abs(n.x) > 0.5f ? r.height : r.width;
            var awn = faceCenter + n * 1.0f + Vector3.up * 3.6f;
            var size = new Vector3(Mathf.Abs(along.x) * faceLen * 0.8f + Mathf.Abs(n.x) * 2f, 0.25f, Mathf.Abs(along.z) * faceLen * 0.8f + Mathf.Abs(n.z) * 2f);
            Shapes.Box(set[Awning], awn, size);
            var sign = faceCenter + n * 0.2f + Vector3.up * (floors > 1 ? 5.2f : 5.0f);
            var signSize = new Vector3(Mathf.Abs(along.x) * faceLen * 0.45f + Mathf.Abs(n.x) * 0.3f, 1.0f, Mathf.Abs(along.z) * faceLen * 0.45f + Mathf.Abs(n.z) * 0.3f);
            Shapes.Box(set[NeonSign], sign, signSize);
        }

        public static void House(PartSet set, Rect r, int floors, System.Random rng, float ground)
        {
            float h = floors * 3.2f + 0.4f;
            FacadeBox(set, FacadeStucco, new Vector3(r.xMin, ground, r.yMin), new Vector3(r.xMax, ground + h, r.yMax), 7f, 6.4f);
            // Flat roof with overhang (mid-century LA)
            Shapes.Box(set[Roof], new Vector3(r.center.x, ground + h + 0.15f, r.center.y), new Vector3(r.width + 1.2f, 0.3f, r.height + 1.2f));
        }

        // ------------------------------------------------------------------ vegetation

        /// <summary>Washingtonia-style fan palm: tall thin trunk, drooping crown and a dead-frond skirt.</summary>
        public static void Palm(PartSet set, Vector3 basePos, float height, System.Random rng, bool canary = false, float detail = 1f)
        {
            int rings = detail > 0.6f ? 9 : 4;
            float lean = (float)(rng.NextDouble() * 2 - 1) * (canary ? 0.4f : 1.4f);
            float leanAng = (float)(rng.NextDouble() * Mathf.PI * 2);
            var path = new List<Vector3>();
            var radii = new List<float>();
            float r0 = canary ? 0.55f : 0.32f, r1 = canary ? 0.45f : 0.2f;
            for (int i = 0; i <= rings; i++)
            {
                float t = (float)i / rings;
                float off = lean * t * t;
                path.Add(basePos + new Vector3(Mathf.Cos(leanAng) * off, height * t, Mathf.Sin(leanAng) * off));
                radii.Add(Mathf.Lerp(r0, r1, t) * (i == 0 ? 1.25f : 1f));
            }

            Shapes.Tube(set[PalmTrunk], path, radii, detail > 0.6f ? 8 : 5, false);
            Vector3 top = path[path.Count - 1];

            if (!canary && detail > 0.6f)
            {
                // Skirt of dead fronds under the crown
                var skirt = new MeshData();
                Shapes.Lathe(skirt, new[] { new Vector2(r1 + 0.05f, -2.2f), new Vector2(r1 + 0.55f, -0.9f), new Vector2(r1 + 0.7f, -0.2f), new Vector2(0.2f, 0.25f) }, 9);
                set[PalmSkirt].Append(skirt, Xform.Translate(top));
            }

            int fronds = canary ? 22 : 14;
            if (detail <= 0.6f) fronds = canary ? 10 : 8;
            float len = canary ? 4.8f : 3.2f;
            for (int f = 0; f < fronds; f++)
            {
                float ang = (f + (float)rng.NextDouble() * 0.5f) / fronds * Mathf.PI * 2f;
                float rise = (float)(rng.NextDouble() * 0.6 - 0.1);
                var dir = new Vector3(Mathf.Cos(ang), 0f, Mathf.Sin(ang));
                var side = new Vector3(-dir.z, 0f, dir.x);
                int n = detail > 0.6f ? 10 : 5;
                var fp = new List<Vector3>();
                var fw = new List<float>();
                var fs = new List<Vector3>();
                float L = len * (0.85f + (float)rng.NextDouble() * 0.3f);
                for (int i = 0; i <= n; i++)
                {
                    float t = (float)i / n;
                    float y = (rise + 0.9f) * Mathf.Sin(t * Mathf.PI * 0.55f) - 1.9f * t * t;
                    fp.Add(top + dir * (L * t) + Vector3.up * y);
                    float w = Mathf.Sin(Mathf.Clamp01(t * 1.15f) * Mathf.PI) * (canary ? 0.75f : 0.95f) + 0.05f;
                    if (detail > 0.6f && i > 0 && i < n) w *= (i % 2 == 0) ? 1f : 0.62f; // serrated leaflets
                    fw.Add(w);
                    fs.Add((side + Vector3.up * 0.25f * (i % 2 == 0 ? 1f : -1f)).normalized);
                }

                Shapes.Ribbon(set[PalmLeaf], fp, fw, fs, Vector3.up, true);
            }
        }

        public static void Tree(PartSet set, Vector3 basePos, float height, System.Random rng, float detail = 1f)
        {
            Shapes.Tube(set[Bark], new[] { basePos, basePos + Vector3.up * height * 0.55f, basePos + new Vector3(0.3f, height * 0.75f, 0.1f) },
                new[] { 0.3f, 0.22f, 0.14f }, detail > 0.6f ? 7 : 5, true);
            int blobs = detail > 0.6f ? 4 : 2;
            for (int i = 0; i < blobs; i++)
            {
                float a = (float)rng.NextDouble() * Mathf.PI * 2;
                float d = i == 0 ? 0f : 1.4f;
                var c = basePos + new Vector3(Mathf.Cos(a) * d, height * (0.68f + 0.12f * (float)rng.NextDouble()), Mathf.Sin(a) * d);
                float s = height * (i == 0 ? 0.33f : 0.24f);
                Shapes.Blob(set[Leaf], c, new Vector3(s, s * 0.8f, s), rng, 0.18f, detail > 0.6f ? 9 : 6, detail > 0.6f ? 6 : 4);
            }
        }

        public static void Shrub(PartSet set, Vector3 pos, float size, System.Random rng)
        {
            Shapes.Blob(set[Leaf], pos + Vector3.up * size * 0.45f, new Vector3(size, size * 0.6f, size), rng, 0.2f, 7, 5);
        }

        // ------------------------------------------------------------------ street furniture

        public static void StreetLamp(PartSet set, Vector3 basePos, Vector3 towardsRoad)
        {
            Vector3 top = basePos + Vector3.up * 7.5f;
            Shapes.CylinderBetween(set[Metal], basePos, top, 0.11f, 7, true);
            Vector3 armEnd = top + towardsRoad.normalized * 2.2f;
            Shapes.CylinderBetween(set[Metal], top - Vector3.up * 0.1f, armEnd, 0.06f, 5, true);
            Shapes.Box(set[Metal], armEnd + Vector3.down * 0.1f, new Vector3(0.6f, 0.18f, 0.6f));
            Shapes.Box(set[LampHead], armEnd + Vector3.down * 0.22f, new Vector3(0.5f, 0.06f, 0.5f));
        }

        /// <summary>Signal mast: pole at the corner with an arm reaching over the approaching lanes.</summary>
        public static void SignalMast(PartSet set, Vector3 basePos, Vector3 armDir, float armLength, out Vector3 headPos)
        {
            Vector3 top = basePos + Vector3.up * 6.2f;
            Shapes.CylinderBetween(set[Metal], basePos, top + Vector3.up * 0.4f, 0.16f, 8, true);
            Vector3 end = top + armDir.normalized * armLength;
            Shapes.CylinderBetween(set[Metal], top, end, 0.09f, 6, true);
            headPos = end - armDir.normalized * 0.8f + Vector3.down * 0.6f;
            // Street name blade
            Vector3 side = new Vector3(armDir.z, 0, -armDir.x).normalized;
            Shapes.Box(set[SignGreen], basePos + Vector3.up * 3.4f + side * 0.6f, new Vector3(Mathf.Abs(side.x) * 1.4f + 0.04f, 0.32f, Mathf.Abs(side.z) * 1.4f + 0.04f));
        }

        public static void SignalBox(PartSet set, Vector3 center, Vector3 facing)
        {
            Vector3 n = facing.normalized;
            var size = new Vector3(Mathf.Abs(n.z) * 0.42f + Mathf.Abs(n.x) * 0.35f, 1.15f, Mathf.Abs(n.x) * 0.42f + Mathf.Abs(n.z) * 0.35f);
            Shapes.Box(set[SignalHousing], center, size);
        }

        /// <summary>Lens geometry for one signal head: three discs (R, Y, G slots) facing <paramref name="facing"/>.</summary>
        public static void SignalLenses(PartSet set, Vector3 center, Vector3 facing, string red, string yellow, string green)
        {
            Vector3 n = facing.normalized;
            Vector3 front = center + n * 0.19f;
            string[] slots = { red, yellow, green };
            for (int i = 0; i < 3; i++)
            {
                var disc = new MeshData();
                Shapes.Disc(disc, Vector3.zero, 0.13f, 12, Vector3.up);
                // Disc normal +Y → facing n.
                Xform x = Shapes.AlignY(Vector3.zero, n);
                x.T = front + Vector3.up * (0.36f - i * 0.36f);
                set[slots[i]].Append(disc, x);
            }
        }

        public static void SpeedSign(PartSet set, Vector3 basePos, Vector3 facing)
        {
            Shapes.CylinderBetween(set[Metal], basePos, basePos + Vector3.up * 2.6f, 0.05f, 5, true);
            Vector3 n = facing.normalized;
            var size = new Vector3(Mathf.Abs(n.z) * 0.6f + Mathf.Abs(n.x) * 0.05f, 0.75f, Mathf.Abs(n.x) * 0.6f + Mathf.Abs(n.z) * 0.05f);
            Shapes.Box(set[SignWhite], basePos + Vector3.up * 2.4f, size);
        }
    }
}
