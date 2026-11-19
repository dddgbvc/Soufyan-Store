using System;
using System.Collections.Generic;
using UnityEngine;

namespace NeonRushLA.Art
{
    /// <summary>Pixels of one generated texture (row 0 = bottom, Unity convention).</summary>
    public sealed class TexData
    {
        public string Name;
        public int W, H;
        public Color32[] Px;
        public bool Linear;   // masks / normal maps: not sRGB
        public bool IsNormal; // import as a normal map
        public bool Clamp;
        public int MaxSize = 1024;
    }

    /// <summary>Albedo + tangent-space normal + metallic/smoothness mask (+ optional emission).</summary>
    public sealed class TexSet
    {
        public TexData Albedo, Normal, Mask, Emission;

        public IEnumerable<TexData> All()
        {
            if (Albedo != null) yield return Albedo;
            if (Normal != null) yield return Normal;
            if (Mask != null) yield return Mask;
            if (Emission != null) yield return Emission;
        }
    }

    /// <summary>
    /// Procedural, tileable, photo-style surface textures for the Los Angeles city: asphalt, concrete,
    /// building facades (stucco, brick, precast office, glass curtain wall, storefronts), clay roof
    /// tiles, grass, palm bark and shop signs. Each surface also gets a normal map (relief from a
    /// height field) and a metallic/smoothness mask so glass reflects the sky while walls stay matte.
    /// Pure managed code (no engine calls) so it can be previewed outside Unity.
    /// </summary>
    public static class TextureSynth
    {
        // ------------------------------------------------------------------ noise

        public static float Hash(int x, int y, int seed)
        {
            unchecked
            {
                uint h = (uint)(x * 374761393 + y * 668265263 + seed * 982451653);
                h = (h ^ (h >> 13)) * 1274126177u;
                h ^= h >> 16;
                return (h & 0xFFFFFF) / 16777215f;
            }
        }

        private static int Wrap(int v, int p) => ((v % p) + p) % p;

        /// <summary>Tileable value noise: x,y in cells, repeats every <paramref name="period"/> cells.</summary>
        public static float VNoise(float x, float y, int period, int seed)
        {
            int ix = (int)Math.Floor(x), iy = (int)Math.Floor(y);
            float tx = x - ix, ty = y - iy;
            tx = tx * tx * (3f - 2f * tx);
            ty = ty * ty * (3f - 2f * ty);
            int x0 = Wrap(ix, period), x1 = Wrap(ix + 1, period), y0 = Wrap(iy, period), y1 = Wrap(iy + 1, period);
            float a = Hash(x0, y0, seed), b = Hash(x1, y0, seed), c = Hash(x0, y1, seed), d = Hash(x1, y1, seed);
            return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
        }

        /// <summary>Tileable value noise with separate periods per axis (stretched patterns).</summary>
        public static float VNoiseXY(float x, float y, int periodX, int periodY, int seed)
        {
            int ix = (int)Math.Floor(x), iy = (int)Math.Floor(y);
            float tx = x - ix, ty = y - iy;
            tx = tx * tx * (3f - 2f * tx);
            ty = ty * ty * (3f - 2f * ty);
            int x0 = Wrap(ix, periodX), x1 = Wrap(ix + 1, periodX), y0 = Wrap(iy, periodY), y1 = Wrap(iy + 1, periodY);
            float a = Hash(x0, y0, seed), b = Hash(x1, y0, seed), c = Hash(x0, y1, seed), d = Hash(x1, y1, seed);
            return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
        }

        /// <summary>Tileable fBm over the unit square (u,v in [0,1)), 0..1.</summary>
        public static float Fbm(float u, float v, int cells, int octaves, int seed)
        {
            float sum = 0f, amp = 0.5f, norm = 0f;
            for (int o = 0; o < octaves; o++)
            {
                sum += amp * VNoise(u * cells, v * cells, cells, seed + o * 131);
                norm += amp;
                amp *= 0.5f;
                cells *= 2;
            }

            return sum / norm;
        }

        private static float Clamp01(float v) => v < 0f ? 0f : v > 1f ? 1f : v;
        private static float Smooth(float a, float b, float x) { float t = Clamp01((x - a) / (b - a)); return t * t * (3f - 2f * t); }
        private static Color Mul(Color c, float k) => new Color(c.r * k, c.g * k, c.b * k, 1f);
        private static Color Lerp(Color a, Color b, float t) => new Color(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t, 1f);
        private static Color32 C32(Color c) => new Color32((byte)(Clamp01(c.r) * 255f + 0.5f), (byte)(Clamp01(c.g) * 255f + 0.5f), (byte)(Clamp01(c.b) * 255f + 0.5f), 255);

        // ------------------------------------------------------------------ canvas

        /// <summary>Working buffers: colour, height (relief), metallic, smoothness, emission.</summary>
        private sealed class Canvas
        {
            public readonly int W, H;
            public readonly Color[] Col;
            public readonly float[] Hgt, Met, Smo;
            public Color[] Emi;

            public Canvas(int w, int h, bool emission = false)
            {
                W = w;
                H = h;
                Col = new Color[w * h];
                Hgt = new float[w * h];
                Met = new float[w * h];
                Smo = new float[w * h];
                if (emission) Emi = new Color[w * h];
            }

            public void Set(int x, int y, Color c, float height, float metallic, float smooth)
            {
                int i = y * W + x;
                Col[i] = c;
                Hgt[i] = height;
                Met[i] = metallic;
                Smo[i] = smooth;
            }

            public TexSet ToSet(string name, float normalStrength, int maxSize = 1024)
            {
                var s = new TexSet
                {
                    Albedo = new TexData { Name = name, W = W, H = H, Px = new Color32[W * H], MaxSize = maxSize },
                    Normal = new TexData { Name = name + "_N", W = W, H = H, Px = NormalFromHeight(Hgt, W, H, normalStrength), Linear = true, IsNormal = true, MaxSize = maxSize },
                    Mask = new TexData { Name = name + "_M", W = W, H = H, Px = new Color32[W * H], Linear = true, MaxSize = maxSize },
                };
                for (int i = 0; i < Col.Length; i++)
                {
                    s.Albedo.Px[i] = C32(Col[i]);
                    byte m = (byte)(Clamp01(Met[i]) * 255f), sm = (byte)(Clamp01(Smo[i]) * 255f);
                    s.Mask.Px[i] = new Color32(m, m, m, sm); // URP Lit: metallic in R, smoothness in A
                }

                if (Emi != null)
                {
                    s.Emission = new TexData { Name = name + "_E", W = W, H = H, Px = new Color32[W * H], MaxSize = maxSize / 2 };
                    for (int i = 0; i < Emi.Length; i++) s.Emission.Px[i] = C32(Emi[i]);
                }

                return s;
            }
        }

        /// <summary>Tangent-space normal map (OpenGL / Unity convention, +Y = up the texture) from a tileable height field.</summary>
        public static Color32[] NormalFromHeight(float[] h, int w, int hh, float strength)
        {
            var px = new Color32[w * hh];
            for (int y = 0; y < hh; y++)
            {
                int yu = (y + 1) % hh, yd = (y - 1 + hh) % hh;
                for (int x = 0; x < w; x++)
                {
                    int xr = (x + 1) % w, xl = (x - 1 + w) % w;
                    float dx = (h[y * w + xr] - h[y * w + xl]) * strength;
                    float dy = (h[yu * w + x] - h[yd * w + x]) * strength;
                    float nx = -dx, ny = -dy, nz = 1f;
                    float inv = 1f / (float)Math.Sqrt(nx * nx + ny * ny + nz * nz);
                    px[y * w + x] = new Color32((byte)((nx * inv * 0.5f + 0.5f) * 255f), (byte)((ny * inv * 0.5f + 0.5f) * 255f), (byte)((nz * inv * 0.5f + 0.5f) * 255f), 255);
                }
            }

            return px;
        }

        // ------------------------------------------------------------------ ground surfaces

        /// <summary>Asphalt, one tile = 6 m: aggregate, binder, wear, hairline cracks and a repair patch.</summary>
        public static TexSet Asphalt(int S = 1024)
        {
            var c = new Canvas(S, S);
            // Crack field: thin dark lines along noise ridges.
            for (int y = 0; y < S; y++)
            {
                float v = (float)y / S;
                for (int x = 0; x < S; x++)
                {
                    float u = (float)x / S;
                    float macro = Fbm(u, v, 3, 3, 11);
                    float mid = Fbm(u, v, 24, 3, 12);
                    float grain = Hash(x, y, 13);
                    float stone = Hash(x / 2, y / 2, 14);
                    float tone = 0.215f + 0.06f * (macro - 0.5f) + 0.035f * (mid - 0.5f) + 0.045f * (grain - 0.5f);
                    float h = 0.35f * grain + 0.25f * mid;
                    if (stone > 0.93f)
                    {
                        float k = (stone - 0.93f) / 0.07f;
                        tone += 0.10f * k;
                        h += 0.5f * k;
                    }
                    else if (stone < 0.05f)
                    {
                        tone -= 0.035f;
                        h -= 0.3f;
                    }

                    // Hairline cracks
                    float r = Math.Abs(Fbm(u, v, 5, 4, 15) - 0.5f);
                    float crackMask = Smooth(0.55f, 0.75f, Fbm(u, v, 2, 2, 16));
                    if (r < 0.004f * crackMask && crackMask > 0.05f)
                    {
                        tone *= 0.7f;
                        h -= 1.0f;
                    }

                    // Glossy black crack-sealant "tar snakes" (very common on LA streets)
                    float tar = Math.Abs(Fbm(u, v, 3, 3, 18) - 0.5f);
                    bool sealant = tar < 0.0045f && Fbm(u, v, 2, 2, 19) > 0.5f;
                    if (sealant)
                    {
                        tone = 0.06f;
                        h += 0.6f;
                    }

                    // Oil / tyre grime (subtle, low frequency)
                    float oil = Smooth(0.62f, 0.8f, Fbm(u, v, 4, 3, 17));
                    tone *= 1f - 0.18f * oil;
                    var col = new Color(tone, tone * 0.995f, tone * 1.02f);
                    c.Set(x, y, col, h, 0f, sealant ? 0.55f : 0.16f + 0.18f * oil);
                }
            }

            return c.ToSet("Asphalt", 2.2f);
        }

        /// <summary>Concrete sidewalk, one tile = 4 m: 3×3 broom-finished slabs, tooled joints, stains.</summary>
        public static TexSet Sidewalk(int S = 1024)
        {
            var c = new Canvas(S, S);
            int slab = S / 3;
            for (int y = 0; y < S; y++)
            {
                float v = (float)y / S;
                for (int x = 0; x < S; x++)
                {
                    float u = (float)x / S;
                    int sx = x / slab, sy = y / slab;
                    int lx = x % slab, ly = y % slab;
                    float slabTone = (Hash(sx, sy, 21) - 0.5f) * 0.06f;
                    float broom = VNoiseXY(x * 0.5f, y * 32f / S, S / 2, 32, 22) * 0.5f + Hash(x, y, 23) * 0.5f;
                    float stain = Smooth(0.58f, 0.85f, Fbm(u, v, 3, 4, 24));
                    float tone = 0.68f + slabTone + 0.035f * (broom - 0.5f) - 0.12f * stain;
                    float h = 0.25f * broom;
                    int edge = Math.Min(Math.Min(lx, slab - 1 - lx), Math.Min(ly, slab - 1 - ly));
                    if (edge < 3)
                    {
                        tone -= 0.18f * (1f - edge / 3f);
                        h -= 1.5f * (1f - edge / 3f);
                    }
                    else if (edge < 9)
                    {
                        h += 0.15f; // trowelled border
                        tone += 0.02f;
                    }

                    // Gum spots / speckles
                    if (Hash(x / 3, y / 3, 25) > 0.9985f) tone -= 0.25f;
                    var col = new Color(tone, tone * 0.985f, tone * 0.955f);
                    c.Set(x, y, col, h, 0f, 0.12f + 0.08f * stain);
                }
            }

            return c.ToSet("Sidewalk", 2.0f);
        }

        /// <summary>Generic cast concrete (curbs, gutters, freeway): fine aggregate, form-board marks, streaks.</summary>
        public static TexSet Concrete(int S = 512)
        {
            var c = new Canvas(S, S);
            for (int y = 0; y < S; y++)
            {
                float v = (float)y / S;
                for (int x = 0; x < S; x++)
                {
                    float u = (float)x / S;
                    float n = Fbm(u, v, 8, 4, 31);
                    float g = Hash(x, y, 32);
                    float streak = VNoiseXY(u * 3f, v * 1f, 3, 1, 33) * 0.5f + VNoiseXY(u * 24f, v * 2f, 24, 2, 34) * 0.5f;
                    float tone = 0.6f + 0.08f * (n - 0.5f) + 0.04f * (g - 0.5f) - 0.06f * Smooth(0.5f, 0.8f, streak);
                    bool board = y % (S / 4) < 2;
                    float h = 0.3f * n + 0.2f * g - (board ? 0.6f : 0f);
                    if (board) tone -= 0.05f;
                    c.Set(x, y, new Color(tone, tone * 0.99f, tone * 0.96f), h, 0f, 0.1f);
                }
            }

            return c.ToSet("Concrete", 1.6f, 512);
        }

        public static TexSet Grass(int S = 1024)
        {
            var c = new Canvas(S, S);
            for (int y = 0; y < S; y++)
            {
                float v = (float)y / S;
                for (int x = 0; x < S; x++)
                {
                    float u = (float)x / S;
                    float blade = VNoiseXY(x * 0.5f, y * 0.125f, S / 2, S / 8, 41) * 0.6f + Hash(x, y, 42) * 0.4f;
                    float patch = Fbm(u, v, 4, 4, 43);
                    float dry = Smooth(0.6f, 0.78f, Fbm(u, v, 3, 3, 44)); // LA lawns: sun-burnt patches
                    var green = new Color(0.17f + 0.08f * blade, 0.31f + 0.14f * blade + 0.05f * (patch - 0.5f), 0.10f + 0.05f * blade);
                    var straw = new Color(0.42f + 0.1f * blade, 0.38f + 0.08f * blade, 0.2f + 0.05f * blade);
                    Color col = Lerp(green, straw, dry * 0.75f);
                    if (blade < 0.25f) col = Mul(col, 0.7f);
                    c.Set(x, y, col, blade, 0f, 0.06f);
                }
            }

            return c.ToSet("Grass", 1.2f);
        }

        /// <summary>Stone pavers for plazas, one tile = 4 m.</summary>
        public static TexSet Plaza(int S = 1024)
        {
            var c = new Canvas(S, S);
            int ph = S / 8;
            for (int y = 0; y < S; y++)
            {
                float v = (float)y / S;
                int row = y / ph;
                int pw = S / 4;
                int off = (row % 2) * pw / 2;
                for (int x = 0; x < S; x++)
                {
                    float u = (float)x / S;
                    int xx = (x + off) % S;
                    int col = xx / pw;
                    int lx = xx % pw, ly = y % ph;
                    int edge = Math.Min(Math.Min(lx, pw - 1 - lx), Math.Min(ly, ph - 1 - ly));
                    float stoneTone = (Hash(col, row, 51) - 0.5f) * 0.1f;
                    float n = Fbm(u, v, 16, 3, 52);
                    float tone = 0.68f + stoneTone + 0.06f * (n - 0.5f);
                    float h = 0.3f * n;
                    if (edge < 3)
                    {
                        tone = 0.42f;
                        h = -1f;
                    }

                    var colr = new Color(tone, tone * 0.94f, tone * 0.86f);
                    c.Set(x, y, colr, h, 0f, edge < 3 ? 0.05f : 0.22f);
                }
            }

            return c.ToSet("Plaza", 1.8f);
        }

        /// <summary>Light grey roof membrane with seams and gravel (flat commercial roofs).</summary>
        public static TexSet RoofFlat(int S = 512)
        {
            var c = new Canvas(S, S);
            for (int y = 0; y < S; y++)
            {
                float v = (float)y / S;
                for (int x = 0; x < S; x++)
                {
                    float u = (float)x / S;
                    float g = Hash(x, y, 61);
                    float n = Fbm(u, v, 6, 4, 62);
                    bool seam = x % (S / 3) < 3;
                    float tone = 0.58f + 0.1f * (n - 0.5f) + 0.08f * (g - 0.5f) - (seam ? 0.06f : 0f) - 0.1f * Smooth(0.6f, 0.8f, Fbm(u, v, 3, 3, 63));
                    c.Set(x, y, new Color(tone, tone * 0.99f, tone * 0.97f), 0.5f * g + (seam ? 0.8f : 0f), 0f, 0.1f);
                }
            }

            return c.ToSet("RoofFlat", 1.6f, 512);
        }

        /// <summary>Spanish-style barrel clay tiles (terracotta), tile = 2 m × 2 m.</summary>
        public static TexSet RoofTile(int S = 1024)
        {
            var c = new Canvas(S, S);
            int cols = 10, rows = 6;
            int cw = S / cols, rh = S / rows;
            for (int y = 0; y < S; y++)
            {
                float v = (float)y / S;
                int row = y / rh;
                float ly = (y % rh) / (float)rh;
                for (int x = 0; x < S; x++)
                {
                    float u = (float)x / S;
                    int xo = (x + (row % 2) * cw / 2) % S;
                    int col = xo / cw;
                    float lx = (xo % cw) / (float)cw;
                    float barrel = (float)Math.Sin(lx * Math.PI); // convex cap
                    float lap = Smooth(0.0f, 0.18f, ly);           // overlap shadow at the lower edge
                    float tileTone = (Hash(col, row, 71) - 0.5f) * 0.18f;
                    float n = Fbm(u, v, 16, 3, 72);
                    var baseCol = new Color(0.66f + tileTone, 0.33f + tileTone * 0.6f, 0.21f + tileTone * 0.3f);
                    float shade = 0.55f + 0.45f * barrel * lap;
                    Color colr = Mul(baseCol, shade * (0.92f + 0.16f * n));
                    float dirt = Smooth(0.55f, 0.85f, Fbm(u, v, 3, 3, 73));
                    colr = Lerp(colr, new Color(0.3f, 0.25f, 0.22f), dirt * 0.35f);
                    c.Set(x, y, colr, barrel * 1.0f + lap * 0.6f, 0f, 0.28f);
                }
            }

            return c.ToSet("RoofTile", 3.5f);
        }

        /// <summary>Washingtonia palm trunk: grey-brown bark with horizontal leaf-scar rings.</summary>
        public static TexSet PalmBark(int W = 256, int H = 512)
        {
            var c = new Canvas(W, H);
            for (int y = 0; y < H; y++)
            {
                float v = (float)y / H;
                for (int x = 0; x < W; x++)
                {
                    float u = (float)x / W;
                    float ring = (float)Math.Abs(Math.Sin((v * 40f + 0.25f * Fbm(u, v, 4, 2, 81)) * Math.PI));
                    float n = Fbm(u, v, 8, 4, 82);
                    float tone = 0.4f + 0.12f * (n - 0.5f) - 0.12f * (1f - ring);
                    c.Set(x, y, new Color(tone * 1.05f, tone * 0.93f, tone * 0.8f), ring * 0.8f + n * 0.4f, 0f, 0.08f);
                }
            }

            return c.ToSet("PalmBark", 2.5f, 512);
        }

        // ------------------------------------------------------------------ facades

        public enum FacadeKind
        {
            Glass = 0,
            Office = 1,
            Stucco = 2,
            Brick = 3,
            Storefront = 4,
        }

        /// <summary>Per-window interior look: blinds, curtains, dark room, lit room.</summary>
        private static Color Interior(int wx, int wy, float lx, float ly, int seed, out float emit)
        {
            float r = Hash(wx, wy, seed);
            float lit = Hash(wx, wy, seed + 7);
            emit = lit < 0.4f ? 0.55f + 0.45f * Hash(wx, wy, seed + 9) : 0f;
            var dark = new Color(0.05f, 0.06f, 0.075f);
            // Faint sky gradient picked up by the glass even before reflections.
            Color glass = Lerp(new Color(0.12f, 0.15f, 0.19f), dark, ly);
            if (r < 0.35f)
            {
                // Venetian blinds lowered to a random height.
                float drop = 0.3f + 0.6f * Hash(wx, wy, seed + 3);
                if (ly > 1f - drop)
                {
                    bool slat = (int)(ly * 60f) % 2 == 0;
                    glass = slat ? new Color(0.62f, 0.6f, 0.55f) : new Color(0.45f, 0.43f, 0.4f);
                    emit *= 0.6f;
                }
            }
            else if (r < 0.6f)
            {
                // Curtains at the sides.
                float side = Math.Min(lx, 1f - lx);
                float w = 0.15f + 0.2f * Hash(wx, wy, seed + 4);
                if (side < w)
                {
                    float fold = 0.8f + 0.2f * (float)Math.Sin(lx * 90f);
                    float hue = Hash(wx, wy, seed + 5);
                    Color cur = hue < 0.33f ? new Color(0.75f, 0.7f, 0.6f) : hue < 0.66f ? new Color(0.55f, 0.25f, 0.2f) : new Color(0.3f, 0.36f, 0.45f);
                    glass = Mul(cur, fold * 0.8f);
                    emit *= 0.5f;
                }
            }
            else if (r < 0.75f)
            {
                // Room visible: ceiling light band + back wall.
                glass = ly > 0.82f ? new Color(0.35f, 0.33f, 0.3f) : new Color(0.16f, 0.15f, 0.14f);
            }

            return glass;
        }

        public static TexSet Facade(FacadeKind kind, Color wallTint, string name, int S = 1024)
        {
            switch (kind)
            {
                case FacadeKind.Glass: return GlassCurtain(name, S);
                case FacadeKind.Office: return OfficePrecast(name, S);
                case FacadeKind.Brick: return Brick(name, S);
                case FacadeKind.Storefront: return Storefront(name, S, (int)(wallTint.r * 10f + 0.5f));
                default: return Stucco(name, wallTint, S);
            }
        }

        /// <summary>Stucco house / low-rise wall, tile = 7 m × 6.4 m (2 bays × 2 floors).</summary>
        private static TexSet Stucco(string name, Color tint, int S)
        {
            var c = new Canvas(S, S, true);
            int bays = 2, floors = 2;
            int bw = S / bays, fh = S / floors;
            var frame = new Color(0.93f, 0.92f, 0.89f);
            for (int y = 0; y < S; y++)
            {
                float v = (float)y / S;
                int fy = y / fh;
                float ly = (y % fh) / (float)fh;
                for (int x = 0; x < S; x++)
                {
                    float u = (float)x / S;
                    int bx = x / bw;
                    float lx = (x % bw) / (float)bw;
                    float n1 = Fbm(u, v, 48, 3, 91), n2 = Hash(x, y, 92);
                    float tex = 0.6f * n1 + 0.4f * n2;
                    Color wall = Mul(tint, 0.9f + 0.14f * tex);
                    float h = tex * 0.8f;
                    float met = 0f, smo = 0.1f;
                    Color e = new Color(0, 0, 0);
                    // Window opening
                    float x0 = 0.28f, x1 = 0.72f, y0 = 0.30f, y1 = 0.80f;
                    float fr = 0.022f;
                    bool inFrame = lx > x0 - fr && lx < x1 + fr && ly > y0 - fr && ly < y1 + fr;
                    bool inGlass = lx > x0 && lx < x1 && ly > y0 && ly < y1;
                    // Rain streaks under the sill
                    if (lx > x0 && lx < x1 && ly < y0 - fr && ly > y0 - 0.25f)
                    {
                        float streak = VNoiseXY(u * 64f, v * 6f, 64, 6, 93);
                        wall = Mul(wall, 1f - 0.08f * Smooth(0.4f, 0.8f, streak) * (1f - (y0 - ly) / 0.25f));
                    }

                    if (inGlass)
                    {
                        float gx = (lx - x0) / (x1 - x0), gy = (ly - y0) / (y1 - y0);
                        bool muntin = Math.Abs(gx - 0.5f) < 0.012f || Math.Abs(gy - 0.5f) < 0.012f;
                        if (muntin)
                        {
                            wall = frame;
                            h = 0.2f;
                            smo = 0.35f;
                        }
                        else
                        {
                            wall = Interior(bx, fy, gx, gy, 94, out float em);
                            h = -2.5f;
                            met = 0.2f;
                            smo = 0.93f;
                            e = new Color(1f, 0.82f, 0.58f) * em;
                        }
                    }
                    else if (inFrame)
                    {
                        wall = frame;
                        h = 0.4f;
                        smo = 0.35f;
                    }
                    else if (ly > y0 - 0.06f && ly < y0 - fr && lx > x0 - 0.05f && lx < x1 + 0.05f)
                    {
                        // Sill
                        wall = Mul(tint, 1.08f);
                        h = 1.6f;
                    }

                    c.Set(x, y, wall, h, met, smo);
                    c.Emi[y * S + x] = e;
                }
            }

            return c.ToSet(name, 2.2f);
        }

        /// <summary>Old LA brick commercial block, tile = 9 m × 10.2 m (3 bays × 3 floors), steel windows, soldier-course lintels.</summary>
        private static TexSet Brick(string name, int S)
        {
            var c = new Canvas(S, S, true);
            int bays = 3, floors = 3;
            int bw = S / bays, fh = S / floors;
            float pxPerM = S / 9f;
            float course = 0.076f * pxPerM, brickLen = 0.225f * pxPerM;
            for (int y = 0; y < S; y++)
            {
                float v = (float)y / S;
                int fy = y / fh;
                float ly = (y % fh) / (float)fh;
                int row = (int)(y / course);
                float ry = y - row * course;
                for (int x = 0; x < S; x++)
                {
                    float u = (float)x / S;
                    int bx = x / bw;
                    float lx = (x % bw) / (float)bw;
                    float xo = x + (row % 2) * brickLen * 0.5f;
                    int bcol = (int)(xo / brickLen);
                    float rx = xo - bcol * brickLen;
                    bool mortar = ry < 1.3f || rx < 1.3f;
                    float bt = Hash(bcol, row, 101);
                    Color brick = Lerp(new Color(0.52f, 0.25f, 0.18f), new Color(0.62f, 0.34f, 0.24f), bt);
                    if (Hash(bcol, row, 102) > 0.9f) brick = Mul(brick, 0.75f);
                    float n = Hash(x, y, 103);
                    Color wall = mortar ? new Color(0.6f, 0.58f, 0.54f) : Mul(brick, 0.9f + 0.15f * n);
                    float h = mortar ? -0.8f : 0.3f * n;
                    float grime = Smooth(0.5f, 0.85f, Fbm(u, v, 3, 4, 104));
                    wall = Lerp(wall, new Color(0.22f, 0.2f, 0.19f), grime * 0.3f);
                    float met = 0f, smo = 0.08f;
                    Color e = new Color(0, 0, 0);
                    float x0 = 0.24f, x1 = 0.76f, y0 = 0.26f, y1 = 0.78f;
                    bool inGlass = lx > x0 && lx < x1 && ly > y0 && ly < y1;
                    if (inGlass)
                    {
                        float gx = (lx - x0) / (x1 - x0), gy = (ly - y0) / (y1 - y0);
                        bool bar = Math.Abs(gx - 0.5f) < 0.02f || Math.Abs(gy - 0.5f) < 0.015f || gx < 0.03f || gx > 0.97f || gy < 0.03f || gy > 0.97f;
                        if (bar)
                        {
                            wall = new Color(0.08f, 0.12f, 0.1f); // painted steel
                            h = -1.2f;
                            smo = 0.4f;
                        }
                        else
                        {
                            wall = Interior(bx, fy, gx, gy, 105, out float em);
                            h = -2.6f;
                            met = 0.2f;
                            smo = 0.9f;
                            e = new Color(1f, 0.8f, 0.55f) * em;
                        }
                    }
                    else if (ly >= y1 && ly < y1 + 0.07f && lx > x0 - 0.02f && lx < x1 + 0.02f)
                    {
                        // Soldier-course lintel: vertical bricks
                        float sx = (x % (int)(course * 1.0f + 1));
                        wall = sx < 1.3f ? new Color(0.6f, 0.58f, 0.54f) : Mul(new Color(0.5f, 0.24f, 0.17f), 0.95f + 0.1f * Hash(x / 8, fy, 106));
                        h = sx < 1.3f ? -0.6f : 0.6f;
                    }
                    else if (ly < y0 && ly > y0 - 0.045f && lx > x0 - 0.04f && lx < x1 + 0.04f)
                    {
                        wall = new Color(0.72f, 0.69f, 0.62f); // cast-stone sill
                        h = 1.5f;
                        smo = 0.15f;
                    }
                    else if (ly > 0.965f)
                    {
                        wall = new Color(0.7f, 0.67f, 0.6f); // belt course between floors
                        h = 1.2f;
                    }

                    c.Set(x, y, wall, h, met, smo);
                    c.Emi[y * S + x] = e;
                }
            }

            return c.ToSet(name, 2.0f);
        }

        /// <summary>Precast-concrete office, tile = 12 m × 14 m (4 bays × 4 floors), ribbon windows.</summary>
        private static TexSet OfficePrecast(string name, int S)
        {
            var c = new Canvas(S, S, true);
            int bays = 4, floors = 4;
            int bw = S / bays, fh = S / floors;
            for (int y = 0; y < S; y++)
            {
                float v = (float)y / S;
                int fy = y / fh;
                float ly = (y % fh) / (float)fh;
                for (int x = 0; x < S; x++)
                {
                    float u = (float)x / S;
                    int bx = x / bw;
                    float lx = (x % bw) / (float)bw;
                    float n = Fbm(u, v, 32, 3, 111), g = Hash(x, y, 112);
                    float tone = 0.7f + 0.05f * (n - 0.5f) + 0.04f * (g - 0.5f);
                    Color wall = new Color(tone, tone * 0.97f, tone * 0.92f);
                    float h = 0.3f * g + 0.2f * n;
                    float met = 0f, smo = 0.12f;
                    Color e = new Color(0, 0, 0);
                    bool joint = lx < 0.006f || ly < 0.006f;
                    bool fin = lx < 0.05f || lx > 0.95f;
                    bool inGlass = ly > 0.32f && ly < 0.9f && !fin;
                    if (inGlass)
                    {
                        float gx = (lx - 0.05f) / 0.9f, gy = (ly - 0.32f) / 0.58f;
                        bool mullion = Math.Abs(gx - 0.5f) < 0.008f;
                        if (mullion)
                        {
                            wall = new Color(0.3f, 0.31f, 0.33f);
                            met = 0.8f;
                            smo = 0.6f;
                            h = -1f;
                        }
                        else
                        {
                            Color room = Interior(bx * 2 + (gx > 0.5f ? 1 : 0), fy, gx, gy, 113, out float em);
                            wall = Lerp(room, new Color(0.1f, 0.13f, 0.15f), 0.45f); // tinted low-e glass
                            met = 0.35f;
                            smo = 0.95f;
                            h = -2.2f;
                            e = new Color(0.95f, 0.92f, 0.82f) * em;
                        }
                    }
                    else if (fin)
                    {
                        h = 1.4f; // vertical precast fin
                        wall = Mul(wall, 1.04f);
                    }

                    if (joint)
                    {
                        wall = Mul(wall, 0.7f);
                        h = -1.5f;
                    }

                    c.Set(x, y, wall, h, met, smo);
                    c.Emi[y * S + x] = e;
                }
            }

            return c.ToSet(name, 2.0f);
        }

        /// <summary>Glass curtain wall, tile = 12 m × 14 m: 8 panes × 4 floors, aluminium mullions, spandrels.</summary>
        private static TexSet GlassCurtain(string name, int S)
        {
            var c = new Canvas(S, S, true);
            int bays = 8, floors = 4;
            int bw = S / bays, fh = S / floors;
            for (int y = 0; y < S; y++)
            {
                float v = (float)y / S;
                int fy = y / fh;
                float ly = (y % fh) / (float)fh;
                for (int x = 0; x < S; x++)
                {
                    float u = (float)x / S;
                    int bx = x / bw;
                    float lx = (x % bw) / (float)bw;
                    bool mullion = lx < 0.035f || lx > 0.965f;
                    bool transom = ly < 0.02f || ly > 0.98f;
                    bool spandrel = ly < 0.2f;
                    float paneVar = Hash(bx, fy, 121);
                    // Panes reflect the sky differently (slightly bowed glass): vary tint per pane.
                    var tint = Lerp(new Color(0.16f, 0.25f, 0.3f), new Color(0.24f, 0.33f, 0.38f), paneVar);
                    Color col;
                    float h, met, smo;
                    Color e = new Color(0, 0, 0);
                    if (mullion || transom)
                    {
                        col = new Color(0.55f, 0.57f, 0.6f);
                        h = 1.2f;
                        met = 0.9f;
                        smo = 0.55f;
                    }
                    else if (spandrel)
                    {
                        col = Mul(tint, 0.45f);
                        h = 0f;
                        met = 0.6f;
                        smo = 0.9f;
                    }
                    else
                    {
                        float gy = (ly - 0.2f) / 0.78f;
                        Color room = Interior(bx, fy, lx, gy, 122, out float em);
                        col = Lerp(tint, room, 0.25f);
                        // Ceiling light strips faintly visible
                        if (gy > 0.9f && (x / 6) % 3 == 0) col = Lerp(col, new Color(0.5f, 0.5f, 0.48f), 0.3f);
                        h = 0f;
                        met = 0.55f;
                        smo = 0.97f;
                        e = new Color(0.95f, 0.93f, 0.85f) * em * 0.8f;
                    }

                    c.Set(x, y, col, h, met, smo);
                    c.Emi[y * S + x] = e;
                }
            }

            return c.ToSet(name, 1.5f);
        }

        /// <summary>Ground-floor shopfront, tile = 6 m × 4.4 m (2 bays): aluminium frames, glazed door, display interior, bulkhead.</summary>
        private static TexSet Storefront(string name, int S, int variant)
        {
            var c = new Canvas(S, S, true);
            int bays = 2;
            int bw = S / bays;
            for (int y = 0; y < S; y++)
            {
                float v = (float)y / S;
                for (int x = 0; x < S; x++)
                {
                    float u = (float)x / S;
                    int bx = x / bw;
                    float lx = (x % bw) / (float)bw;
                    Color col;
                    float h = 0f, met = 0f, smo = 0.2f;
                    Color e = new Color(0, 0, 0);
                    bool band = v > 0.8f;
                    bool bulk = v < 0.1f;
                    bool frame = lx < 0.025f || lx > 0.975f || (v > 0.1f && v < 0.115f) || (v > 0.785f && v < 0.8f) || (v > 0.66f && v < 0.672f);
                    bool door = bx == 0 && lx > 0.12f && lx < 0.46f && v < 0.66f;
                    if (band)
                    {
                        float n = Fbm(u, v, 24, 3, 131);
                        col = new Color(0.2f + 0.04f * n, 0.2f + 0.04f * n, 0.21f + 0.04f * n);
                        h = 0.4f * n;
                        smo = 0.25f;
                    }
                    else if (bulk && !door)
                    {
                        // Tiled bulkhead
                        bool joint = x % 32 < 2 || y % 32 < 2;
                        col = joint ? new Color(0.3f, 0.3f, 0.3f) : new Color(0.12f, 0.26f, 0.24f);
                        h = joint ? -0.8f : 0.2f;
                        smo = joint ? 0.1f : 0.7f;
                    }
                    else if (frame || (door && (lx < 0.135f || lx > 0.445f || v < 0.02f)))
                    {
                        col = new Color(0.62f, 0.63f, 0.65f);
                        met = 0.9f;
                        smo = 0.6f;
                        h = 1f;
                    }
                    else if (door && Math.Abs(v - 0.36f) < 0.012f && lx > 0.16f && lx < 0.42f)
                    {
                        col = new Color(0.75f, 0.75f, 0.78f); // push bar
                        met = 1f;
                        smo = 0.8f;
                        h = 1.5f;
                    }
                    else
                    {
                        Color back = StoreInterior(variant, x, y, bx, v, S);
                        // Dark, reflective plate glass: the interior only shows through dimly.
                        col = Lerp(back, new Color(0.035f, 0.045f, 0.055f), 0.62f);
                        met = 0.35f;
                        smo = 0.97f;
                        h = -1.5f;
                        e = Mul(back, 0.6f);
                    }

                    c.Set(x, y, col, h, met, smo);
                    c.Emi[y * S + x] = e;
                }
            }

            return c.ToSet(name, 1.6f);
        }

        /// <summary>What is seen through a shop window: 0 retail shelves, 1 restaurant, 2 office / bank lobby.</summary>
        private static Color StoreInterior(int variant, int x, int y, int bay, float v, int S)
        {
            var wall = new Color(0.5f, 0.48f, 0.44f);
            if (v > 0.7f) return (x / 24) % 5 == 0 ? new Color(0.95f, 0.94f, 0.88f) : new Color(0.32f, 0.31f, 0.3f); // ceiling + lights
            switch (variant)
            {
                case 1:
                {
                    // Restaurant: warm wall, table tops + chairs in the lower third, menu board.
                    wall = new Color(0.55f, 0.36f, 0.24f);
                    float tx = (x % 180) / 180f;
                    if (v < 0.3f && v > 0.22f && tx > 0.2f && tx < 0.65f) return new Color(0.75f, 0.72f, 0.66f); // table top
                    if (v < 0.22f && Math.Abs(tx - 0.42f) < 0.02f) return new Color(0.15f, 0.12f, 0.1f);      // table leg
                    if (v < 0.36f && v > 0.12f && (tx < 0.12f || tx > 0.75f) && tx > 0.04f && tx < 0.85f) return new Color(0.3f, 0.18f, 0.12f); // chairs
                    if (v > 0.45f && v < 0.62f && (x % 512) > 120 && (x % 512) < 360) return (y / 6) % 3 == 0 ? new Color(0.9f, 0.88f, 0.8f) : new Color(0.12f, 0.12f, 0.12f); // menu board
                    return wall;
                }

                case 2:
                {
                    // Office / bank: vertical blinds half-drawn, a plant.
                    float tx = (x % 512) / 512f;
                    bool blind = (x / 9) % 2 == 0;
                    if (v > 0.25f && tx > 0.3f) return blind ? new Color(0.78f, 0.77f, 0.73f) : new Color(0.62f, 0.61f, 0.58f);
                    if (tx < 0.18f && v < 0.45f) return v < 0.12f ? new Color(0.35f, 0.25f, 0.18f) : new Color(0.12f, 0.3f, 0.12f);
                    return new Color(0.42f, 0.4f, 0.37f);
                }

                default:
                {
                    // Retail: a couple of gondola shelves with muted product colours, mostly in the back.
                    float shelf = (v * 7f) % 1f;
                    int row = (int)(v * 7f);
                    if (v < 0.58f && shelf > 0.2f && shelf < 0.7f && Hash(x / 14, row, 132 + bay) > 0.45f)
                    {
                        float hue = Hash(x / 14, row, 133);
                        Color pc = hue < 0.33f ? new Color(0.55f, 0.25f, 0.2f) : hue < 0.66f ? new Color(0.3f, 0.38f, 0.5f) : new Color(0.6f, 0.55f, 0.35f);
                        return Lerp(pc, wall, 0.35f);
                    }

                    if (v < 0.58f && shelf < 0.08f) return new Color(0.3f, 0.3f, 0.3f);
                    return wall;
                }
            }
        }

        // ------------------------------------------------------------------ signs

        private const string Glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.- &'";

        private static readonly string[] Font =
        {
            "01110100011000111111100011000110001", "11110100011000111110100011000111110", "01110100011000010000100001000101110",
            "11100100101000110001100011001011100", "11111100001000011110100001000011111", "11111100001000011110100001000010000",
            "01110100011000010111100011000101111", "10001100011000111111100011000110001", "01110001000010000100001000010001110",
            "00111000100001000010000101001001100", "10001100101010011000101001001010001", "10000100001000010000100001000011111",
            "10001110111010110101100011000110001", "10001110011010110011100011000110001", "01110100011000110001100011000101110",
            "11110100011000111110100001000010000", "01110100011000110001101011001001101", "11110100011000111110101001001010001",
            "01111100001000001110000010000111110", "11111001000010000100001000010000100", "10001100011000110001100011000101110",
            "10001100011000110001100010101000100", "10001100011000110101101011010101010", "10001100010101000100010101000110001",
            "10001100010101000100001000010000100", "11111000010001000100010001000011111",
            "01110100011001110101110011000101110", "00100011000010000100001000010001110", "01110100010000100010001000100011111",
            "11111000100010000010000011000101110", "00010001100101010010111110001000010", "11111100001111000001000011000101110",
            "00110010001000011110100011000101110", "11111000010001000100010000100001000", "01110100011000101110100011000101110",
            "01110100011000101111000010001001100", "00000000000000000000000000110001100", "00000000000000011111000000000000000",
            "00000000000000000000000000000000000", "01100100101010001000101011001001101", "00100001000100000000000000000000000",
        };

        /// <summary>Anti-aliased-ish text: each font cell drawn as a rounded dot so letters read as painted, not pixelated.</summary>
        private static void DrawText(Color[] px, int w, int h, string text, float x0, float y0, float cell, Color col, float[] mask = null)
        {
            float x = x0;
            foreach (char ch in text.ToUpperInvariant())
            {
                int gi = Glyphs.IndexOf(ch);
                if (gi < 0) gi = Glyphs.IndexOf(' ');
                string g = Font[gi];
                for (int gy = 0; gy < 7; gy++)
                {
                    for (int gx = 0; gx < 5; gx++)
                    {
                        if (g[gy * 5 + gx] != '1') continue;
                        float cx = x + (gx + 0.5f) * cell, cy = y0 + (6 - gy + 0.5f) * cell;
                        int r = (int)(cell * 0.75f) + 1;
                        for (int yy = (int)(cy - r); yy <= (int)(cy + r); yy++)
                        {
                            for (int xx = (int)(cx - r); xx <= (int)(cx + r); xx++)
                            {
                                if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
                                float dx = Math.Abs(xx + 0.5f - cx), dy = Math.Abs(yy + 0.5f - cy);
                                float d = Math.Max(dx, dy);
                                float a = Clamp01(cell * 0.62f - d + 0.5f);
                                if (a <= 0f) continue;
                                int i = yy * w + xx;
                                px[i] = Lerp(px[i], col, a);
                                if (mask != null) mask[i] = Math.Max(mask[i], a);
                            }
                        }
                    }
                }

                x += 6f * cell;
            }
        }

        /// <summary>Generic Los Angeles business names (no real brands).</summary>
        public static readonly string[] ShopNames = { "TACOS", "DONUTS", "LIQUOR", "PHARMACY", "LAUNDRY", "PIZZA", "COFFEE", "MOTEL" };

        /// <summary>Atlas of 8 shop signs (rows, bottom = index 0). Emission lights the letters at night.</summary>
        public static TexSet ShopSigns(int W = 512, int H = 1024)
        {
            int rows = ShopNames.Length;
            int rh = H / rows;
            var col = new Color[W * H];
            var glow = new float[W * H];
            var hgt = new float[W * H];
            Color[] bgs = { new Color(0.75f, 0.12f, 0.1f), new Color(0.95f, 0.85f, 0.75f), new Color(0.08f, 0.1f, 0.12f), new Color(0.92f, 0.93f, 0.95f),
                new Color(0.1f, 0.3f, 0.6f), new Color(0.12f, 0.35f, 0.18f), new Color(0.25f, 0.15f, 0.1f), new Color(0.9f, 0.82f, 0.4f) };
            Color[] fgs = { new Color(1f, 0.92f, 0.7f), new Color(0.85f, 0.25f, 0.45f), new Color(1f, 0.85f, 0.2f), new Color(0.1f, 0.45f, 0.25f),
                new Color(0.95f, 0.95f, 1f), new Color(1f, 0.95f, 0.85f), new Color(0.95f, 0.8f, 0.55f), new Color(0.75f, 0.1f, 0.15f) };
            for (int r = 0; r < rows; r++)
            {
                for (int y = r * rh; y < (r + 1) * rh; y++)
                {
                    float ly = (y - r * rh) / (float)rh;
                    for (int x = 0; x < W; x++)
                    {
                        float lx = (float)x / W;
                        bool border = lx < 0.02f || lx > 0.98f || ly < 0.06f || ly > 0.94f;
                        float n = Hash(x, y, 141) * 0.04f;
                        col[y * W + x] = border ? new Color(0.15f, 0.15f, 0.16f) : Mul(bgs[r], 0.97f + n);
                        hgt[y * W + x] = border ? 1f : 0f;
                    }
                }

                string t = ShopNames[r];
                float cell = Math.Min((W * 0.86f) / (t.Length * 6f), rh * 0.62f / 7f);
                float tw = t.Length * 6f * cell - cell;
                DrawText(col, W, H, t, (W - tw) * 0.5f, r * rh + (rh - 7f * cell) * 0.5f, cell, fgs[r], glow);
            }

            var set = new TexSet
            {
                Albedo = new TexData { Name = "ShopSigns", W = W, H = H, Px = new Color32[W * H], MaxSize = 1024, Clamp = true },
                Normal = new TexData { Name = "ShopSigns_N", W = W, H = H, Px = NormalFromHeight(hgt, W, H, 1.5f), Linear = true, IsNormal = true, Clamp = true },
                Mask = new TexData { Name = "ShopSigns_M", W = W, H = H, Px = new Color32[W * H], Linear = true, Clamp = true },
                Emission = new TexData { Name = "ShopSigns_E", W = W, H = H, Px = new Color32[W * H], Clamp = true },
            };
            for (int i = 0; i < col.Length; i++)
            {
                set.Albedo.Px[i] = C32(col[i]);
                set.Mask.Px[i] = new Color32(0, 0, 0, (byte)(0.45f * 255));
                set.Emission.Px[i] = C32(Mul(col[i], glow[i]));
            }

            return set;
        }
    }
}
