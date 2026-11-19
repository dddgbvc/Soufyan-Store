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
        public const string Gutter = "Gutter";
        public const string Grass = "Grass";
        public const string Plaza = "Plaza";
        public const string FacadeGlass = "FacadeGlass";
        public const string FacadeOffice = "FacadeOffice";
        public const string FacadeStucco = "FacadeStucco"; // + variant index 0..StuccoVariants-1
        public const string FacadeBrick = "FacadeBrick";
        public const string Roof = "Roof";
        public const string RoofTile = "RoofTile";
        public const string Storefront = "Storefront"; // + variant index 0..StorefrontVariants-1
        public const string Awning = "Awning"; // + variant index 0..AwningVariants-1
        public const string ShopSign = "ShopSign";
        public const string NeonSign = "NeonSign";
        public const string PalmTrunk = "PalmTrunk";
        public const string PalmLeaf = "PalmLeaf";
        public const string PalmSkirt = "PalmSkirt";
        public const string Bark = "Bark";
        public const string Leaf = "Leaf";
        public const string Metal = "Metal";
        public const string DarkMetal = "DarkMetal";
        public const string Wood = "Wood";
        public const string Wire = "Wire";
        public const string Hydrant = "Hydrant";
        public const string Door = "Door";
        public const string GarageDoor = "GarageDoor";
        public const string Trim = "Trim";
        public const string LampHead = "LampHead";
        public const string SignalHousing = "SignalHousing";
        public const string SignGreen = "SignGreen";
        public const string SignWhite = "SignWhite";
        public const string Concrete = "Concrete";

        public const int StuccoVariants = 6;
        public const int AwningVariants = 4;
        public const int ShopSignRows = 8;
        public const int StorefrontVariants = 3;
        public static string StorefrontSlot(int i) => Storefront + i;

        public static string Stucco(int i) => FacadeStucco + i;
        public static string AwningSlot(int i) => Awning + i;

        public static readonly string[] AllSlots = BuildSlots();

        private static string[] BuildSlots()
        {
            var l = new List<string>
            {
                Asphalt, Gutter, LineWhite, LineYellow, Sidewalk, Curb, Grass, Plaza, FacadeGlass, FacadeOffice, FacadeBrick, Roof, RoofTile,
                ShopSign, NeonSign, PalmTrunk, PalmLeaf, PalmSkirt, Bark, Leaf, Metal, DarkMetal, Wood, Wire, Hydrant, Door,
                GarageDoor, Trim, LampHead, SignalHousing, SignGreen, SignWhite, Concrete
            };
            for (int i = 0; i < StuccoVariants; i++) l.Add(Stucco(i));
            for (int i = 0; i < AwningVariants; i++) l.Add(AwningSlot(i));
            for (int i = 0; i < StorefrontVariants; i++) l.Add(StorefrontSlot(i));
            return l.ToArray();
        }

        // ------------------------------------------------------------------ helpers

        /// <summary>Quad with explicit UVs (a→b→c→d counter-clockwise seen from <paramref name="n"/>).</summary>
        public static void QuadUV(MeshData m, Vector3 a, Vector3 b, Vector3 c, Vector3 d, Vector3 n, Vector2 ua, Vector2 ub, Vector2 uc, Vector2 ud)
        {
            int i0 = m.AddVertex(a, n, ua), i1 = m.AddVertex(b, n, ub), i2 = m.AddVertex(c, n, uc), i3 = m.AddVertex(d, n, ud);
            m.AddQuadFacing(i0, i1, i2, i3, n);
        }

        /// <summary>Horizontal polygon fan with world-space UVs (continuous paving joints across pieces).</summary>
        public static void GroundFan(MeshData m, Vector3 centre, IList<Vector3> rim, float uvScale)
        {
            int c = m.AddVertex(centre, Vector3.up, new Vector2(centre.x * uvScale, centre.z * uvScale));
            int first = m.VertexCount;
            foreach (Vector3 p in rim) m.AddVertex(p, Vector3.up, new Vector2(p.x * uvScale, p.z * uvScale));
            for (int i = 0; i < rim.Count - 1; i++) m.AddTriangleFacing(c, first + i, first + i + 1, Vector3.up);
        }

        /// <summary>Horizontal rectangle with world-space UVs.</summary>
        public static void GroundRect(MeshData m, float x0, float z0, float x1, float z1, float y, float uvScale)
        {
            if (x1 - x0 < 1e-3f || z1 - z0 < 1e-3f) return;
            QuadUV(m, new Vector3(x0, y, z0), new Vector3(x0, y, z1), new Vector3(x1, y, z1), new Vector3(x1, y, z0), Vector3.up,
                new Vector2(x0, z0) * uvScale, new Vector2(x0, z1) * uvScale, new Vector2(x1, z1) * uvScale, new Vector2(x1, z0) * uvScale);
        }

        private static float R01(System.Random rng) => (float)rng.NextDouble();

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
                GroundRect(set[Roof], a.x, a.z, b.x, b.z, b.y, 0.25f);
            }
        }

        /// <summary>Parapet wall with a projecting coping around a flat roof.</summary>
        public static void Parapet(PartSet set, Rect r, float roofY, float height = 0.9f, float thick = 0.3f)
        {
            MeshData c = set[Concrete];
            float y = roofY + height * 0.5f;
            Shapes.Box(c, new Vector3(r.center.x, y, r.yMin + thick * 0.5f), new Vector3(r.width, height, thick), 0.25f);
            Shapes.Box(c, new Vector3(r.center.x, y, r.yMax - thick * 0.5f), new Vector3(r.width, height, thick), 0.25f);
            Shapes.Box(c, new Vector3(r.xMin + thick * 0.5f, y, r.center.y), new Vector3(thick, height, r.height - 2f * thick), 0.25f);
            Shapes.Box(c, new Vector3(r.xMax - thick * 0.5f, y, r.center.y), new Vector3(thick, height, r.height - 2f * thick), 0.25f);
            // Coping (slightly wider cap)
            float cy = roofY + height + 0.05f;
            MeshData t = set[Trim];
            Shapes.Box(t, new Vector3(r.center.x, cy, r.yMin + thick * 0.5f), new Vector3(r.width + 0.1f, 0.1f, thick + 0.1f), 0.25f);
            Shapes.Box(t, new Vector3(r.center.x, cy, r.yMax - thick * 0.5f), new Vector3(r.width + 0.1f, 0.1f, thick + 0.1f), 0.25f);
            Shapes.Box(t, new Vector3(r.xMin + thick * 0.5f, cy, r.center.y), new Vector3(thick + 0.1f, 0.1f, r.height - 2f * thick), 0.25f);
            Shapes.Box(t, new Vector3(r.xMax - thick * 0.5f, cy, r.center.y), new Vector3(thick + 0.1f, 0.1f, r.height - 2f * thick), 0.25f);
        }

        /// <summary>Projecting horizontal band (cornice / floor ledge) all round a footprint.</summary>
        public static void Ledge(PartSet set, string slot, Rect r, float y, float height, float projection)
        {
            Shapes.Box(set[slot], new Vector3(r.center.x, y, r.center.y), new Vector3(r.width + projection * 2f, height, r.height + projection * 2f), 0.25f);
        }

        /// <summary>Rooftop HVAC unit: casing, top fan grille and a duct.</summary>
        public static void RoofUnit(PartSet set, Vector3 basePos, float yaw, System.Random rng)
        {
            float w = 1.1f + R01(rng) * 0.8f, d = 1.4f + R01(rng) * 1.2f, h = 0.9f + R01(rng) * 0.5f;
            Xform x = Xform.Translate(basePos + Vector3.up * (h * 0.5f)) * Xform.RotateY(yaw);
            Shapes.Box(set[Metal], x, new Vector3(w, h, d), 0.5f);
            var fan = new MeshData();
            Shapes.Disc(fan, new Vector3(0f, h * 0.5f + 0.01f, d * 0.2f), Mathf.Min(w, d) * 0.32f, 14, Vector3.up);
            set[DarkMetal].Append(fan, Xform.Translate(basePos + Vector3.up * (h * 0.5f)) * Xform.RotateY(yaw));
            Shapes.Box(set[Metal], Xform.Translate(basePos + Vector3.up * 0.25f) * Xform.RotateY(yaw) * Xform.Translate(new Vector3(0f, 0f, -d * 0.5f - 0.6f)), new Vector3(0.45f, 0.45f, 1.2f), 0.5f);
        }

        public static void Tower(PartSet set, Rect r, float height, System.Random rng, float ground)
        {
            string facade = rng.NextDouble() < 0.55 ? FacadeGlass : FacadeOffice;
            float tileW = 12f, tileH = 14f;
            // Podium + shaft + crown setbacks
            float podium = Mathf.Min(10.5f, height * 0.2f);
            FacadeBox(set, StorefrontSlot(rng.Next(StorefrontVariants)), new Vector3(r.xMin, ground, r.yMin), new Vector3(r.xMax, ground + 4.4f, r.yMax), 6f, 4.4f, false);
            FacadeBox(set, facade, new Vector3(r.xMin, ground + 4.4f, r.yMin), new Vector3(r.xMax, ground + podium, r.yMax), tileW, tileH);
            Ledge(set, Trim, r, ground + 4.45f, 0.35f, 0.25f); // band over the shopfronts
            float inset = Mathf.Min(r.width, r.height) * 0.08f;
            var shaft = Rect.MinMaxRect(r.xMin + inset, r.yMin + inset, r.xMax - inset, r.yMax - inset);
            Parapet(set, r, ground + podium, 1.0f, 0.35f);
            float top = ground + height * (rng.NextDouble() < 0.5 ? 0.82f : 1f);
            FacadeBox(set, facade, new Vector3(shaft.xMin, ground + podium, shaft.yMin), new Vector3(shaft.xMax, top, shaft.yMax), tileW, tileH);
            Rect roofRect = shaft;
            if (top < ground + height - 1f)
            {
                float in2 = Mathf.Min(shaft.width, shaft.height) * 0.15f;
                Ledge(set, Trim, shaft, top + 0.15f, 0.3f, 0.2f);
                roofRect = Rect.MinMaxRect(shaft.xMin + in2, shaft.yMin + in2, shaft.xMax - in2, shaft.yMax - in2);
                FacadeBox(set, facade, new Vector3(roofRect.xMin, top, roofRect.yMin), new Vector3(roofRect.xMax, ground + height, roofRect.yMax), tileW, tileH);
            }

            Parapet(set, roofRect, ground + height, 1.4f, 0.4f);

            // Entrance canopy on a random side
            int side = rng.Next(4);
            Vector3 n = side == 0 ? Vector3.back : side == 1 ? Vector3.forward : side == 2 ? Vector3.left : Vector3.right;
            Vector3 face = new Vector3(r.center.x + n.x * r.width * 0.5f, ground + 4.0f, r.center.y + n.z * r.height * 0.5f) + n * 1.4f;
            Vector3 cs = new Vector3(Mathf.Abs(n.z) * 9f + Mathf.Abs(n.x) * 2.8f, 0.3f, Mathf.Abs(n.x) * 9f + Mathf.Abs(n.z) * 2.8f);
            Shapes.Box(set[Metal], face, cs, 0.5f);

            // Mechanical penthouse, cooling towers, antenna
            Vector2 c = roofRect.center;
            float ry = ground + height;
            FacadeBox(set, Concrete, new Vector3(c.x - 4f, ry, c.y - 3f), new Vector3(c.x + 2f, ry + 4f, c.y + 3f), 4f, 4f);
            RoofUnit(set, new Vector3(c.x + 4.5f, ry, c.y + 2f), 0f, rng);
            RoofUnit(set, new Vector3(c.x + 4.5f, ry, c.y - 2.5f), 0f, rng);
            Shapes.CylinderBetween(set[Metal], new Vector3(c.x - 1f, ry + 4f, c.y + 4.5f), new Vector3(c.x - 1f, ry + 6.2f, c.y + 4.5f), 1.3f, 14, true);
            if (height > 90f)
            {
                Shapes.CylinderBetween(set[Metal], new Vector3(c.x, ry + 4f, c.y), new Vector3(c.x, ry + 20f, c.y), 0.3f, 6, true);
                Shapes.Sphere(set[LampHead], new Vector3(c.x, ry + 20.4f, c.y), 0.5f, 8, 5);
            }
        }

        /// <summary>Street-facing frame for a face of footprint r: centre at ground level, outward normal, along axis, face length.</summary>
        private static void Face(Rect r, Vector3 street, float ground, out Vector3 centre, out Vector3 n, out Vector3 along, out float len)
        {
            n = street.normalized;
            along = new Vector3(n.z, 0, -n.x);
            centre = new Vector3(r.center.x + n.x * r.width * 0.5f, ground, r.center.y + n.z * r.height * 0.5f);
            len = Mathf.Abs(n.x) > 0.5f ? r.height : r.width;
        }

        public static void Commercial(PartSet set, Rect r, int floors, System.Random rng, float ground, Vector3 street)
        {
            string facade = rng.NextDouble() < 0.5 ? FacadeBrick : Stucco(rng.Next(StuccoVariants));
            float h = 4.4f + (floors - 1) * 3.4f;
            FacadeBox(set, StorefrontSlot(rng.Next(StorefrontVariants)), new Vector3(r.xMin, ground, r.yMin), new Vector3(r.xMax, ground + 4.4f, r.yMax), 6f, 4.4f, floors == 1);
            if (floors > 1)
            {
                bool brick = facade == FacadeBrick;
                FacadeBox(set, facade, new Vector3(r.xMin, ground + 4.4f, r.yMin), new Vector3(r.xMax, ground + h, r.yMax), brick ? 9f : 7f, brick ? 10.2f : 6.4f);
            }

            // Belt over the shopfronts, cornice at the roof, parapet with coping.
            Ledge(set, Trim, r, ground + 4.45f, 0.3f, 0.12f);
            Ledge(set, Trim, r, ground + h - 0.2f, 0.4f, 0.28f);
            Parapet(set, r, ground + h, 0.8f, 0.3f);

            Face(r, street, ground, out Vector3 fc, out Vector3 n, out Vector3 along, out float faceLen);

            // Fabric awning: sloped canopy + valance, double-sided.
            float aw = faceLen * (0.6f + 0.3f * R01(rng));
            var awn = new MeshData();
            Vector3 wallTop = fc + n * 0.02f + Vector3.up * 3.75f;
            Vector3 outer = fc + n * 1.35f + Vector3.up * 3.15f;
            Vector3 hs = along * (aw * 0.5f);
            awn.AddFlatQuad(wallTop - hs, wallTop + hs, outer + hs, outer - hs, Vector3.up + n, 1f);
            awn.AddFlatQuad(outer - hs, outer + hs, outer + hs + Vector3.down * 0.28f, outer - hs + Vector3.down * 0.28f, n, 1f);
            awn.AddFlatQuad(wallTop - hs, outer - hs, outer - hs + Vector3.down * 0.28f, wallTop - hs + Vector3.down * 0.1f, -along, 1f);
            awn.AddFlatQuad(wallTop + hs, outer + hs, outer + hs + Vector3.down * 0.28f, wallTop + hs + Vector3.down * 0.1f, along, 1f);
            awn.MakeDoubleSided();
            set[AwningSlot(rng.Next(AwningVariants))].Append(awn);

            // Painted sign board on the fascia band (texture atlas row = business).
            int row = rng.Next(ShopSignRows);
            float sw = Mathf.Min(faceLen * 0.55f, 7.5f), sh = Mathf.Min(0.85f, sw * 0.22f);
            Vector3 sc = fc + n * 0.09f + Vector3.up * 4.0f;
            Vector3 sa = along * (sw * 0.5f), su = Vector3.up * (sh * 0.5f);
            float v0 = (float)row / ShopSignRows, v1 = (row + 1f) / ShopSignRows;
            QuadUV(set[ShopSign], sc + sa - su, sc - sa - su, sc - sa + su, sc + sa + su, n, new Vector2(0, v0), new Vector2(1, v0), new Vector2(1, v1), new Vector2(0, v1)); // u runs left→right as seen from the street
            Shapes.Box(set[DarkMetal], Xform.Translate(sc - n * 0.04f) * Xform.RotateY(Mathf.Atan2(n.x, n.z) * Mathf.Rad2Deg), new Vector3(sw + 0.1f, sh + 0.1f, 0.06f), 1f);

            // Rooftop units
            int units = 1 + rng.Next(3);
            for (int i = 0; i < units; i++)
            {
                var p = new Vector3(Mathf.Lerp(r.xMin + 2.5f, r.xMax - 2.5f, R01(rng)), ground + h, Mathf.Lerp(r.yMin + 2.5f, r.yMax - 2.5f, R01(rng)));
                RoofUnit(set, p, rng.Next(2) * 90f, rng);
            }
        }

        /// <summary>Hip roof over rectangle r: eave height y, overhang o, rise per metre pitch. Clay tile UVs (2 m tiles).</summary>
        public static void HipRoof(PartSet set, Rect r, float y, float overhang, float pitch, string slot)
        {
            float x0 = r.xMin - overhang, x1 = r.xMax + overhang, z0 = r.yMin - overhang, z1 = r.yMax + overhang;
            bool alongX = (x1 - x0) >= (z1 - z0);
            float half = (alongX ? (z1 - z0) : (x1 - x0)) * 0.5f;
            float rise = half * pitch;
            float cx = (x0 + x1) * 0.5f, cz = (z0 + z1) * 0.5f;
            Vector3 ra, rb; // ridge ends
            if (alongX)
            {
                ra = new Vector3(x0 + half, y + rise, cz);
                rb = new Vector3(x1 - half, y + rise, cz);
            }
            else
            {
                ra = new Vector3(cx, y + rise, z0 + half);
                rb = new Vector3(cx, y + rise, z1 - half);
            }

            var c00 = new Vector3(x0, y, z0);
            var c10 = new Vector3(x1, y, z0);
            var c11 = new Vector3(x1, y, z1);
            var c01 = new Vector3(x0, y, z1);
            MeshData m = set[slot];
            float slope = Mathf.Sqrt(half * half + rise * rise);
            const float t = 0.5f; // 2 m texture tile
            if (alongX)
            {
                RoofFace(m, c00, c10, rb, ra, slope, t); // south (−z)
                RoofFace(m, c11, c01, ra, rb, slope, t); // north
                RoofTri(m, c01, c00, ra, slope, t);       // west
                RoofTri(m, c10, c11, rb, slope, t);       // east
            }
            else
            {
                RoofFace(m, c01, c00, ra, rb, slope, t); // west
                RoofFace(m, c10, c11, rb, ra, slope, t); // east
                RoofTri(m, c00, c10, ra, slope, t);       // south
                RoofTri(m, c11, c01, rb, slope, t);       // north
            }

            // Soffit (underside of the overhang) + fascia
            MeshData s = set[Trim];
            s.AddFlatQuad(c00, c10, c11, c01, Vector3.down, 0.5f);
            float fh = 0.18f;
            s.AddFlatQuad(c00 + Vector3.down * fh, c10 + Vector3.down * fh, c10, c00, Vector3.back, 1f);
            s.AddFlatQuad(c11 + Vector3.down * fh, c01 + Vector3.down * fh, c01, c11, Vector3.forward, 1f);
            s.AddFlatQuad(c01 + Vector3.down * fh, c00 + Vector3.down * fh, c00, c01, Vector3.left, 1f);
            s.AddFlatQuad(c10 + Vector3.down * fh, c11 + Vector3.down * fh, c11, c10, Vector3.right, 1f);
        }

        /// <summary>Trapezoid roof plane: eave a→b, ridge c→d (c above b). UV: u along the eave, v up the slope.</summary>
        private static void RoofFace(MeshData m, Vector3 a, Vector3 b, Vector3 c, Vector3 d, float slope, float t)
        {
            Vector3 along = (b - a).normalized;
            Vector3 n = Vector3.Cross(b - a, d - a).normalized;
            if (n.y < 0f) n = -n;
            float ua = 0f, ub = (b - a).magnitude, uc = Vector3.Dot(c - a, along), ud = Vector3.Dot(d - a, along);
            QuadUV(m, a, b, c, d, n, new Vector2(ua * t, 0f), new Vector2(ub * t, 0f), new Vector2(uc * t, slope * t), new Vector2(ud * t, slope * t));
        }

        private static void RoofTri(MeshData m, Vector3 a, Vector3 b, Vector3 apex, float slope, float t)
        {
            Vector3 along = (b - a).normalized;
            Vector3 n = Vector3.Cross(b - a, apex - a).normalized;
            if (n.y < 0f) n = -n;
            int i0 = m.AddVertex(a, n, Vector2.zero);
            int i1 = m.AddVertex(b, n, new Vector2((b - a).magnitude * t, 0f));
            int i2 = m.AddVertex(apex, n, new Vector2(Vector3.Dot(apex - a, along) * t, slope * t));
            m.AddTriangleFacing(i0, i1, i2, n);
        }

        /// <summary>
        /// LA single-family house: stucco walls (one of six colours), clay-tile hip roof or flat
        /// mid-century roof, front door with porch, garage door + driveway and a path to the sidewalk.
        /// </summary>
        public static void House(PartSet set, Rect r, int floors, System.Random rng, float ground, Vector3 street, float frontYard, bool far = false, List<ParkedCarData> parked = null)
        {
            float h = floors * 3.2f + 0.4f;
            string wall = Stucco(rng.Next(StuccoVariants));
            bool tile = rng.NextDouble() < 0.68;
            FacadeBox(set, wall, new Vector3(r.xMin, ground, r.yMin), new Vector3(r.xMax, ground + h, r.yMax), 7f, 6.4f, !tile && far);
            if (tile)
            {
                HipRoof(set, r, ground + h, far ? 0.4f : 0.6f, 0.42f, RoofTile);
            }
            else if (!far)
            {
                // Flat roof with a thin overhanging slab (mid-century modern)
                Shapes.Box(set[Roof], new Vector3(r.center.x, ground + h + 0.12f, r.center.y), new Vector3(r.width + 1.4f, 0.24f, r.height + 1.4f), 0.25f);
                Shapes.Box(set[Trim], new Vector3(r.center.x, ground + h + 0.12f, r.center.y), new Vector3(r.width + 1.42f, 0.2f, r.height + 1.42f), 0.25f);
            }

            if (far) return;

            Face(r, street, ground, out Vector3 fc, out Vector3 n, out Vector3 along, out float faceLen);
            bool garage = rng.NextDouble() < 0.65;
            float doorOff = garage ? -faceLen * 0.22f : 0f;
            // Front door with frame + small porch slab and path to the sidewalk
            Vector3 door = fc + along * doorOff + n * 0.03f + Vector3.up * 1.08f;
            float yaw = Mathf.Atan2(n.x, n.z) * Mathf.Rad2Deg;
            Shapes.Box(set[Trim], Xform.Translate(door - n * 0.015f) * Xform.RotateY(yaw), new Vector3(1.25f, 2.3f, 0.05f), 1f);
            Shapes.Box(set[Door], Xform.Translate(door) * Xform.RotateY(yaw), new Vector3(1.0f, 2.12f, 0.06f), 1f);
            Shapes.Box(set[Concrete], Xform.Translate(fc + along * doorOff + n * 0.9f + Vector3.up * 0.06f) * Xform.RotateY(yaw), new Vector3(2.4f, 0.12f, 1.8f), 0.25f);
            Vector3 pathStart = fc + along * doorOff + n * 1.8f;
            Vector3 pathEnd = fc + along * doorOff + n * frontYard;
            Strip(set[Concrete], pathStart + Vector3.up * 0.015f, pathEnd + Vector3.up * 0.015f, 1.2f);

            if (garage)
            {
                float gx = faceLen * 0.22f;
                Vector3 g = fc + along * gx + n * 0.03f + Vector3.up * 1.12f;
                float gw = Mathf.Min(2.8f, faceLen * 0.38f);
                Shapes.Box(set[GarageDoor], Xform.Translate(g) * Xform.RotateY(yaw), new Vector3(gw, 2.2f, 0.06f), 1f);
                for (int k = 1; k < 4; k++)
                {
                    Shapes.Box(set[Trim], Xform.Translate(g + Vector3.up * (-1.1f + k * 0.55f) + n * 0.035f) * Xform.RotateY(yaw), new Vector3(gw - 0.04f, 0.025f, 0.01f), 1f);
                }
                Strip(set[Concrete], fc + along * gx + n * 0.05f + Vector3.up * 0.02f, fc + along * gx + n * frontYard + Vector3.up * 0.02f, 3.0f);
                if (parked != null && frontYard > 6f && rng.NextDouble() < 0.55)
                {
                    // Car on the driveway, nose towards the garage.
                    parked.Add(new ParkedCarData { Position = fc + along * gx + n * 3.4f + Vector3.up * 0.02f, Yaw = Mathf.Atan2(-n.x, -n.z) * Mathf.Rad2Deg });
                }
            }
        }

        /// <summary>Flat horizontal strip (paths, driveways) from a to b, width w, world-space UVs.</summary>
        public static void Strip(MeshData m, Vector3 a, Vector3 b, float w)
        {
            Vector3 d = (b - a);
            d.y = 0f;
            if (d.sqrMagnitude < 1e-4f) return;
            Vector3 s = new Vector3(d.z, 0f, -d.x).normalized * (w * 0.5f);
            const float t = 0.25f;
            Vector3 p0 = a - s, p1 = a + s, p2 = b + s, p3 = b - s;
            QuadUV(m, p0, p1, p2, p3, Vector3.up, new Vector2(p0.x, p0.z) * t, new Vector2(p1.x, p1.z) * t, new Vector2(p2.x, p2.z) * t, new Vector2(p3.x, p3.z) * t);
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
                Shapes.Lathe(skirt, new[] { new Vector2(r1 + 0.02f, -1.6f), new Vector2(r1 + 0.32f, -1.1f), new Vector2(r1 + 0.5f, -0.45f), new Vector2(r1 + 0.42f, 0.05f), new Vector2(0.15f, 0.3f) }, 11);
                set[PalmSkirt].Append(skirt, Xform.Translate(top));
            }

            int fronds = canary ? 24 : 22;
            if (detail <= 0.6f) fronds = canary ? 10 : 9;
            float len = canary ? 4.8f : 3.5f;
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

        /// <summary>Broadleaf street/yard tree: forked trunk and a clustered canopy of many lumpy leaf masses.</summary>
        public static void Tree(PartSet set, Vector3 basePos, float height, System.Random rng, float detail = 1f)
        {
            float lean = (float)rng.NextDouble() * 0.6f;
            float la = (float)rng.NextDouble() * Mathf.PI * 2f;
            Vector3 fork = basePos + new Vector3(Mathf.Cos(la) * lean * 0.4f, height * 0.42f, Mathf.Sin(la) * lean * 0.4f);
            Shapes.Tube(set[Bark], new[] { basePos, basePos + Vector3.up * height * 0.2f, fork }, new[] { 0.26f, 0.21f, 0.17f }, detail > 0.6f ? 7 : 5, false);
            int limbs = detail > 0.6f ? 3 : 0;
            for (int i = 0; i < limbs; i++)
            {
                float a = la + i * 2.1f + (float)rng.NextDouble() * 0.6f;
                Vector3 end = fork + new Vector3(Mathf.Cos(a) * height * 0.18f, height * 0.22f, Mathf.Sin(a) * height * 0.18f);
                Shapes.Tube(set[Bark], new[] { fork, end }, new[] { 0.12f, 0.06f }, 5, true);
            }

            Vector3 crown = fork + Vector3.up * height * 0.28f;
            float cr = height * 0.34f;
            int blobs = detail > 0.6f ? 11 : 3;
            for (int i = 0; i < blobs; i++)
            {
                // Points spread over an oblate crown, larger masses near the middle.
                float u = (float)rng.NextDouble() * Mathf.PI * 2f;
                float v = Mathf.Acos(1f - 2f * (float)rng.NextDouble() * 0.85f);
                float rr = i == 0 ? 0f : cr * (0.45f + 0.35f * (float)rng.NextDouble());
                var c = crown + new Vector3(Mathf.Sin(v) * Mathf.Cos(u) * rr, Mathf.Cos(v) * rr * 0.6f, Mathf.Sin(v) * Mathf.Sin(u) * rr);
                float sz = cr * (i == 0 ? 0.75f : 0.42f + 0.18f * (float)rng.NextDouble());
                Shapes.Blob(set[Leaf], c, new Vector3(sz, sz * 0.78f, sz), rng, 0.32f, detail > 0.6f ? 12 : 7, detail > 0.6f ? 8 : 5);
            }
        }

        public static void Shrub(PartSet set, Vector3 pos, float size, System.Random rng)
        {
            Shapes.Blob(set[Leaf], pos + Vector3.up * size * 0.45f, new Vector3(size, size * 0.6f, size), rng, 0.2f, 7, 5);
        }

        // ------------------------------------------------------------------ street furniture

        /// <summary>Los Angeles "cobra head" street light: tapered pole, curved mast arm, flat luminaire.</summary>
        public static void StreetLamp(PartSet set, Vector3 basePos, Vector3 towardsRoad)
        {
            Vector3 d = towardsRoad.normalized;
            float h = 8.2f;
            Shapes.CylinderBetween(set[Concrete], basePos, basePos + Vector3.up * 0.5f, 0.24f, 8, true); // footing
            Shapes.Tube(set[Metal], new[] { basePos, basePos + Vector3.up * h }, new[] { 0.13f, 0.085f }, 8, true);
            var arm = new List<Vector3>();
            var ar = new List<float>();
            Vector3 p0 = basePos + Vector3.up * (h - 0.6f), p1 = basePos + Vector3.up * (h + 0.3f) + d * 0.3f, p2 = basePos + Vector3.up * (h + 0.45f) + d * 1.4f, p3 = basePos + Vector3.up * (h + 0.35f) + d * 2.6f;
            for (int i = 0; i <= 8; i++)
            {
                float t = i / 8f, u = 1f - t;
                arm.Add(u * u * u * p0 + 3f * u * u * t * p1 + 3f * u * t * t * p2 + t * t * t * p3);
                ar.Add(Mathf.Lerp(0.065f, 0.045f, t));
            }

            Shapes.Tube(set[Metal], arm, ar, 6, true);
            float yaw = Mathf.Atan2(d.x, d.z) * Mathf.Rad2Deg;
            Vector3 head = p3 + d * 0.35f;
            var hm = new MeshData();
            Shapes.Ellipsoid(hm, Vector3.zero, new Vector3(0.24f, 0.11f, 0.45f), 10, 6);
            set[Metal].Append(hm, Xform.Translate(head) * Xform.RotateY(yaw));
            var lens = new MeshData();
            Shapes.Ellipsoid(lens, Vector3.zero, new Vector3(0.19f, 0.04f, 0.34f), 10, 4);
            set[LampHead].Append(lens, Xform.Translate(head + Vector3.down * 0.07f) * Xform.RotateY(yaw));
        }

        /// <summary>Wooden utility pole with a crossarm and insulators. Returns the three wire attachment points.</summary>
        public static Vector3[] PowerPole(PartSet set, Vector3 basePos, Vector3 wireDir, System.Random rng)
        {
            float h = 10.5f + R01(rng) * 1.2f;
            Shapes.Tube(set[Wood], new[] { basePos, basePos + Vector3.up * h }, new[] { 0.17f, 0.12f }, 7, true);
            Vector3 across = new Vector3(wireDir.z, 0f, -wireDir.x).normalized;
            Vector3 armC = basePos + Vector3.up * (h - 0.6f);
            float yaw = Mathf.Atan2(across.x, across.z) * Mathf.Rad2Deg;
            Shapes.Box(set[Wood], Xform.Translate(armC) * Xform.RotateY(yaw), new Vector3(0.11f, 0.11f, 2.4f), 1f);
            var pts = new Vector3[3];
            float[] offs = { -1.05f, 0.35f, 1.05f };
            for (int i = 0; i < 3; i++)
            {
                Vector3 p = armC + across * offs[i] + Vector3.up * 0.06f;
                Shapes.CylinderBetween(set[Trim], p, p + Vector3.up * 0.16f, 0.045f, 6, true);
                pts[i] = p + Vector3.up * 0.16f;
            }

            if (rng.NextDouble() < 0.3)
            {
                // Pole-mounted transformer can
                Vector3 tc = basePos + Vector3.up * (h - 2.2f) - across * 0.42f;
                Shapes.CylinderBetween(set[Metal], tc + Vector3.down * 0.5f, tc + Vector3.up * 0.5f, 0.3f, 10, true);
            }

            // Lower communications cable bracket
            Shapes.CylinderBetween(set[DarkMetal], basePos + Vector3.up * 6.8f, basePos + Vector3.up * 6.8f + across * 0.3f, 0.03f, 4, true);
            return pts;
        }

        /// <summary>Sagging overhead wire between two points (parabolic catenary approximation).</summary>
        public static void WireSpan(PartSet set, Vector3 a, Vector3 b, float sag, float radius = 0.014f)
        {
            var path = new List<Vector3>();
            var rad = new List<float>();
            const int n = 8;
            for (int i = 0; i <= n; i++)
            {
                float t = (float)i / n;
                path.Add(Vector3.Lerp(a, b, t) + Vector3.down * (4f * sag * t * (1f - t)));
                rad.Add(radius);
            }

            Shapes.Tube(set[Wire], path, rad, 3, false);
        }

        /// <summary>Fire hydrant (LA "wet barrel" style).</summary>
        public static void FireHydrant(PartSet set, Vector3 p)
        {
            MeshData m = set[Hydrant];
            Shapes.CylinderBetween(m, p, p + Vector3.up * 0.08f, 0.15f, 10, true);
            Shapes.CylinderBetween(m, p + Vector3.up * 0.08f, p + Vector3.up * 0.62f, 0.11f, 10, true);
            Shapes.Ellipsoid(m, p + Vector3.up * 0.64f, new Vector3(0.12f, 0.1f, 0.12f), 10, 5);
            Shapes.CylinderBetween(m, p + new Vector3(-0.2f, 0.42f, 0f), p + new Vector3(0.2f, 0.42f, 0f), 0.045f, 8, true);
            Shapes.CylinderBetween(m, p + new Vector3(0f, 0.42f, 0f), p + new Vector3(0f, 0.42f, 0.2f), 0.06f, 8, true);
        }

        public static void TrashCan(PartSet set, Vector3 p)
        {
            Shapes.CylinderBetween(set[DarkMetal], p, p + Vector3.up * 0.95f, 0.3f, 12, false);
            Shapes.Ellipsoid(set[DarkMetal], p + Vector3.up * 0.95f, new Vector3(0.31f, 0.1f, 0.31f), 12, 4);
        }

        /// <summary>Bus bench: metal frame, wooden slats and a back panel.</summary>
        public static void Bench(PartSet set, Vector3 p, Vector3 facing)
        {
            Vector3 f = facing.normalized;
            float yaw = Mathf.Atan2(f.x, f.z) * Mathf.Rad2Deg;
            Xform x = Xform.Translate(p) * Xform.RotateY(yaw);
            var m = new PartSet();
            Shapes.Box(m[Wood], Xform.Translate(new Vector3(0f, 0.45f, 0f)), new Vector3(1.9f, 0.06f, 0.45f), 1f);
            Shapes.Box(m[SignWhite], Xform.Translate(new Vector3(0f, 0.85f, -0.22f)), new Vector3(1.9f, 0.6f, 0.05f), 1f);
            foreach (float sx in new[] { -0.85f, 0.85f })
            {
                Shapes.Box(m[DarkMetal], Xform.Translate(new Vector3(sx, 0.22f, 0f)), new Vector3(0.05f, 0.44f, 0.4f), 1f);
                Shapes.Box(m[DarkMetal], Xform.Translate(new Vector3(sx, 0.68f, -0.22f)), new Vector3(0.05f, 1.2f, 0.06f), 1f);
            }

            foreach (KeyValuePair<string, MeshData> kv in m.Parts) set[kv.Key].Append(kv.Value, x);
        }

        public static void ParkingMeter(PartSet set, Vector3 p)
        {
            Shapes.CylinderBetween(set[DarkMetal], p, p + Vector3.up * 1.1f, 0.035f, 6, false);
            Shapes.RoundedBox(set[Metal], p + Vector3.up * 1.28f, new Vector3(0.2f, 0.36f, 0.16f), 0.05f, 2);
        }

        public static void Manhole(PartSet set, Vector3 p)
        {
            Shapes.Disc(set[DarkMetal], p + Vector3.up * 0.008f, 0.38f, 16, Vector3.up);
        }

        /// <summary>Painted straight-ahead arrow on the road surface, pointing along <paramref name="dir"/>.</summary>
        public static void LaneArrow(PartSet set, Vector3 p, Vector3 dir)
        {
            MeshData m = set[LineWhite];
            Vector3 d = dir.normalized, s = new Vector3(d.z, 0f, -d.x);
            Vector3 y = Vector3.up * 0.013f;
            Vector3 tail = p - d * 2.4f + y, neck = p + d * 0.6f + y, tip = p + d * 2.0f + y;
            float sw = 0.09f;
            m.AddFlatQuad(tail - s * sw, tail + s * sw, neck + s * sw, neck - s * sw, Vector3.up, 0.5f);
            int a = m.AddVertex(neck - s * 0.42f, Vector3.up, Vector2.zero), b = m.AddVertex(neck + s * 0.42f, Vector3.up, Vector2.right), c = m.AddVertex(tip, Vector3.up, Vector2.up);
            m.AddTriangleFacing(a, b, c, Vector3.up);
        }

        /// <summary>Signal mast: pole at the corner with an arm reaching over the approaching lanes.</summary>
        public static void SignalMast(PartSet set, Vector3 basePos, Vector3 armDir, float armLength, out Vector3 headPos)
        {
            Vector3 top = basePos + Vector3.up * 6.2f;
            Shapes.CylinderBetween(set[Concrete], basePos, basePos + Vector3.up * 0.45f, 0.32f, 10, true);
            Shapes.Tube(set[Metal], new[] { basePos, top + Vector3.up * 0.4f }, new[] { 0.19f, 0.14f }, 10, true);
            Vector3 end = top + armDir.normalized * armLength;
            Shapes.Tube(set[Metal], new[] { top, end }, new[] { 0.11f, 0.07f }, 8, true);
            headPos = end - armDir.normalized * 0.8f + Vector3.down * 0.6f;
            // Street name blade
            Vector3 side = new Vector3(armDir.z, 0, -armDir.x).normalized;
            Shapes.Box(set[SignGreen], basePos + Vector3.up * 3.4f + side * 0.6f, new Vector3(Mathf.Abs(side.x) * 1.4f + 0.04f, 0.32f, Mathf.Abs(side.z) * 1.4f + 0.04f));
            // Pedestrian push-button box
            Shapes.Box(set[SignalHousing], basePos + Vector3.up * 1.1f - side * 0.2f, new Vector3(0.12f, 0.18f, 0.12f));
        }

        public static void SignalBox(PartSet set, Vector3 center, Vector3 facing)
        {
            Vector3 n = facing.normalized;
            float yaw = Mathf.Atan2(n.x, n.z) * Mathf.Rad2Deg;
            Xform x = Xform.Translate(center) * Xform.RotateY(yaw);
            var m = new PartSet();
            Shapes.RoundedBox(m[SignalHousing], Vector3.zero, new Vector3(0.36f, 1.12f, 0.3f), 0.04f, 2);
            Shapes.Box(m[SignalHousing], Xform.Translate(new Vector3(0f, 0f, -0.17f)), new Vector3(0.62f, 1.4f, 0.03f), 1f); // backplate
            for (int i = 0; i < 3; i++)
            {
                // Visors over each lens
                var visor = new MeshData();
                Shapes.Lathe(visor, new[] { new Vector2(0.15f, 0f), new Vector2(0.15f, 0.2f) }, 10, 1f, true, -190f, 10f); // hood over the top
                visor.MakeDoubleSided();
                m[SignalHousing].Append(visor, Xform.Translate(new Vector3(0f, 0.36f - i * 0.36f, 0.15f)) * Xform.RotateX(90f));
            }

            foreach (KeyValuePair<string, MeshData> kv in m.Parts) set[kv.Key].Append(kv.Value, x);
        }

        /// <summary>Lens geometry for one signal head: three discs (R, Y, G slots) facing <paramref name="facing"/>.</summary>
        public static void SignalLenses(PartSet set, Vector3 center, Vector3 facing, string red, string yellow, string green)
        {
            Vector3 n = facing.normalized;
            Vector3 front = center + n * 0.16f;
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
