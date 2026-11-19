using System.IO;
using UnityEditor;
using UnityEngine;

namespace NeonRushLA.EditorTools
{
    /// <summary>
    /// Procedural textures saved as PNG assets (so the iOS importer compresses them to ASTC):
    /// building facades (+ lit-window emission maps), storefronts, asphalt, sidewalk, grass,
    /// plaza stone and licence plates (bitmap font).
    /// </summary>
    public static class LATextureFactory
    {
        public const string Folder = "Assets/NeonRushLA/Textures";

        public static Texture2D Save(string name, int w, int h, Color32[] px, bool srgb = true, int maxSize = 1024, bool repeat = true)
        {
            var tex = new Texture2D(w, h, TextureFormat.RGBA32, false);
            tex.SetPixels32(px);
            tex.Apply();
            string path = Folder + "/" + name + ".png";
            File.WriteAllBytes(Path.Combine(Path.GetDirectoryName(Application.dataPath), path), tex.EncodeToPNG());
            Object.DestroyImmediate(tex);
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceUpdate);
            var imp = (TextureImporter)AssetImporter.GetAtPath(path);
            imp.sRGBTexture = srgb;
            imp.mipmapEnabled = true;
            imp.wrapMode = repeat ? TextureWrapMode.Repeat : TextureWrapMode.Clamp;
            imp.anisoLevel = 4;
            imp.maxTextureSize = maxSize;
            imp.textureCompression = TextureImporterCompression.Compressed;
            imp.SaveAndReimport();
            return AssetDatabase.LoadAssetAtPath<Texture2D>(path);
        }

        private static Color32 C(float r, float g, float b) => new Color32((byte)(Mathf.Clamp01(r) * 255), (byte)(Mathf.Clamp01(g) * 255), (byte)(Mathf.Clamp01(b) * 255), 255);

        private static float Hash(int x, int y, int seed)
        {
            unchecked
            {
                int h = x * 374761393 + y * 668265263 + seed * 982451653;
                h = (h ^ (h >> 13)) * 1274126177;
                return ((h ^ (h >> 16)) & 0xFFFF) / 65535f;
            }
        }

        private static float Noise(int x, int y, int seed, int scale)
        {
            float fx = (float)x / scale, fy = (float)y / scale;
            int ix = Mathf.FloorToInt(fx), iy = Mathf.FloorToInt(fy);
            float tx = fx - ix, ty = fy - iy;
            tx = tx * tx * (3 - 2 * tx);
            ty = ty * ty * (3 - 2 * ty);
            float a = Hash(ix, iy, seed), b = Hash(ix + 1, iy, seed), c = Hash(ix, iy + 1, seed), d = Hash(ix + 1, iy + 1, seed);
            return Mathf.Lerp(Mathf.Lerp(a, b, tx), Mathf.Lerp(c, d, tx), ty);
        }

        /// <summary>
        /// Facade tile: bays × floors windows. Returns albedo and an emission map (lit windows).
        /// style: 0 glass curtain wall, 1 office concrete, 2 stucco, 3 brick, 4 storefront.
        /// </summary>
        public static void Facade(string name, int style, int bays, int floors, out Texture2D albedo, out Texture2D emission)
        {
            const int S = 512;
            var a = new Color32[S * S];
            var e = new Color32[S * S];
            int bw = S / bays, fh = S / floors;
            for (int y = 0; y < S; y++)
            {
                for (int x = 0; x < S; x++)
                {
                    int bx = x / bw, fy = y / fh;
                    float lx = (x % bw) / (float)bw, ly = (y % fh) / (float)fh;
                    float n = Noise(x, y, style * 7 + 1, 24) * 0.08f + Hash(x, y, style) * 0.04f;
                    float lit = Hash(bx, fy, style * 31 + 5);
                    Color wall, glass = new Color(0.08f, 0.11f, 0.15f);
                    bool window;
                    switch (style)
                    {
                        case 0: // curtain wall: mostly glass, thin mullions + spandrels
                            wall = new Color(0.55f, 0.58f, 0.62f);
                            window = lx > 0.03f && lx < 0.97f && ly > 0.16f && ly < 0.97f;
                            glass = new Color(0.16f + 0.08f * Hash(bx, fy, 9), 0.24f + 0.08f * Hash(bx, fy, 9), 0.32f + 0.1f * Hash(bx, fy, 9));
                            if (!window && ly <= 0.16f) wall = new Color(0.2f, 0.23f, 0.27f);
                            break;
                        case 1:
                            wall = new Color(0.66f, 0.64f, 0.6f);
                            window = lx > 0.14f && lx < 0.86f && ly > 0.25f && ly < 0.82f;
                            break;
                        case 2:
                            wall = new Color(0.88f, 0.8f, 0.66f);
                            window = lx > 0.25f && lx < 0.75f && ly > 0.3f && ly < 0.78f;
                            if (!window && (lx > 0.22f && lx < 0.78f && ly > 0.27f && ly < 0.81f)) wall = new Color(0.97f, 0.96f, 0.93f); // frame
                            break;
                        case 3:
                        {
                            // Brick courses
                            int row = y / 8;
                            int off = (row % 2) * 8;
                            bool mortar = y % 8 == 0 || (x + off) % 16 == 0;
                            wall = mortar ? new Color(0.62f, 0.6f, 0.56f) : new Color(0.55f + 0.08f * Hash((x + off) / 16, row, 3), 0.27f, 0.21f);
                            window = lx > 0.2f && lx < 0.8f && ly > 0.28f && ly < 0.8f;
                            break;
                        }

                        default: // storefront: large glass with a dark sign band at the top
                            wall = ly > 0.82f ? new Color(0.12f, 0.12f, 0.14f) : new Color(0.25f, 0.25f, 0.27f);
                            window = lx > 0.05f && lx < 0.95f && ly > 0.05f && ly < 0.8f;
                            glass = new Color(0.1f, 0.14f, 0.18f);
                            lit = 0.2f;
                            break;
                    }

                    Color col = window ? glass + new Color(n, n, n) * 0.5f + new Color(0.06f, 0.07f, 0.08f) * (1f - ly) : wall + new Color(n, n, n) - new Color(0.05f, 0.05f, 0.05f);
                    a[y * S + x] = C(col.r, col.g, col.b);
                    bool on = window && lit < (style == 4 ? 0.75f : 0.38f);
                    float glow = on ? 0.6f + 0.4f * Hash(bx, fy, 77) : 0f;
                    e[y * S + x] = on ? C(glow, glow * 0.82f, glow * 0.55f) : C(0, 0, 0);
                }
            }

            albedo = Save(name, S, S, a);
            emission = Save(name + "_Emission", S, S, e);
        }

        public static Texture2D Asphalt()
        {
            const int S = 256;
            var px = new Color32[S * S];
            for (int y = 0; y < S; y++)
            {
                for (int x = 0; x < S; x++)
                {
                    float n = Noise(x, y, 11, 16) * 0.06f + Noise(x, y, 12, 4) * 0.05f + Hash(x, y, 13) * 0.07f;
                    float v = 0.17f + n;
                    if (Hash(x, y, 14) > 0.985f) v += 0.12f; // stones
                    px[y * S + x] = C(v, v, v * 1.04f);
                }
            }

            return Save("Asphalt", S, S, px, true, 512);
        }

        public static Texture2D Sidewalk()
        {
            const int S = 256;
            var px = new Color32[S * S];
            for (int y = 0; y < S; y++)
            {
                for (int x = 0; x < S; x++)
                {
                    bool joint = x % 64 < 2 || y % 64 < 2;
                    float n = Noise(x, y, 21, 12) * 0.06f + Hash(x, y, 22) * 0.04f;
                    float v = joint ? 0.48f : 0.66f + n;
                    px[y * S + x] = C(v, v * 0.98f, v * 0.94f);
                }
            }

            return Save("Sidewalk", S, S, px, true, 512);
        }

        public static Texture2D Grass()
        {
            const int S = 256;
            var px = new Color32[S * S];
            for (int y = 0; y < S; y++)
            {
                for (int x = 0; x < S; x++)
                {
                    float n = Noise(x, y, 31, 20) * 0.25f + Hash(x, y, 32) * 0.15f;
                    px[y * S + x] = C(0.16f + n * 0.4f, 0.34f + n * 0.5f, 0.11f + n * 0.2f);
                }
            }

            return Save("Grass", S, S, px, true, 512);
        }

        public static Texture2D Plaza()
        {
            const int S = 256;
            var px = new Color32[S * S];
            for (int y = 0; y < S; y++)
            {
                for (int x = 0; x < S; x++)
                {
                    bool joint = x % 32 < 1 || y % 32 < 1;
                    float t = Hash(x / 32, y / 32, 41) * 0.08f;
                    float n = Hash(x, y, 42) * 0.03f;
                    float v = joint ? 0.5f : 0.7f + t + n;
                    px[y * S + x] = C(v, v * 0.93f, v * 0.84f);
                }
            }

            return Save("Plaza", S, S, px, true, 512);
        }

        // ------------------------------------------------------------------ plates (5×7 bitmap font)

        private static readonly string Glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.- ";
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
            "00000000000000000000000000000000000",
        };

        private static void DrawText(Color32[] px, int w, int h, string text, int x0, int y0, int scale, Color32 c)
        {
            int x = x0;
            foreach (char ch in text.ToUpperInvariant())
            {
                int gi = Glyphs.IndexOf(ch);
                if (gi < 0) gi = Glyphs.Length - 1;
                string g = Font[gi];
                for (int gy = 0; gy < 7; gy++)
                {
                    for (int gx = 0; gx < 5; gx++)
                    {
                        if (g[gy * 5 + gx] != '1') continue;
                        for (int sy = 0; sy < scale; sy++)
                        {
                            for (int sx = 0; sx < scale; sx++)
                            {
                                int px0 = x + gx * scale + sx;
                                int py0 = y0 + (6 - gy) * scale + sy;
                                if (px0 >= 0 && px0 < w && py0 >= 0 && py0 < h) px[py0 * w + px0] = c;
                            }
                        }
                    }
                }

                x += 6 * scale;
            }
        }

        public static Texture2D Plate(string name, string text)
        {
            const int W = 256, H = 128;
            var px = new Color32[W * H];
            var white = new Color32(242, 242, 245, 255);
            var blue = new Color32(20, 40, 120, 255);
            for (int i = 0; i < px.Length; i++) px[i] = white;
            for (int y = 0; y < H; y++)
            {
                for (int x = 0; x < W; x++)
                {
                    if (x < 4 || x >= W - 4 || y < 4 || y >= H - 4) px[y * W + x] = blue;
                }
            }

            DrawText(px, W, H, "CALIFORNIA", (W - 10 * 6 * 2) / 2, H - 30, 2, new Color32(200, 30, 40, 255));
            int scale = 5;
            DrawText(px, W, H, text, (W - text.Length * 6 * scale) / 2 + 2, 22, scale, blue);
            return Save(name, W, H, px, true, 256, false);
        }

        public static Texture2D Sign(string name, string text, Color32 bg, Color32 fg)
        {
            const int W = 256, H = 64;
            var px = new Color32[W * H];
            for (int i = 0; i < px.Length; i++) px[i] = bg;
            DrawText(px, W, H, text, (W - text.Length * 6 * 5) / 2, 14, 5, fg);
            return Save(name, W, H, px, true, 256, false);
        }
    }
}
