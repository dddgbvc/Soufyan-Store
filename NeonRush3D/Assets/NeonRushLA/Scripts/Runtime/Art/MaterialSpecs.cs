using System.Collections.Generic;
using NeonRushLA.City;
using UnityEngine;

namespace NeonRushLA.Art
{
    /// <summary>Description of one material slot (URP Lit). Shared by the Editor builder and the offline previewer.</summary>
    public sealed class MatSpec
    {
        public string Key;
        public Color Color = Color.white;
        public float Metallic;
        public float Smoothness = 0.3f;
        public string Texture;          // TexSet name: albedo (+ _N normal, _M mask, _E emission when generated)
        public float NormalScale = 1f;
        public Color Emission = Color.black; // multiplied with the _E map when present
        public bool DoubleSided;
        public float Alpha = 1f;        // < 1 → transparent (glass)

        public MatSpec(string key) { Key = key; }
    }

    public static class MaterialSpecs
    {
        private static MatSpec M(string key, Color c, float metallic, float smooth, string tex = null, float normal = 1f)
        {
            return new MatSpec(key) { Color = c, Metallic = metallic, Smoothness = smooth, Texture = tex, NormalScale = normal };
        }

        public static List<MatSpec> City()
        {
            var l = new List<MatSpec>
            {
                M(CityMeshes.Asphalt, Color.white, 0f, 1f, "Asphalt", 0.8f),
                M(CityMeshes.Gutter, new Color(1.12f, 1.1f, 1.06f), 0f, 1f, "Concrete", 0.6f),
                M(CityMeshes.LineWhite, new Color(0.86f, 0.86f, 0.84f), 0f, 0.35f),
                M(CityMeshes.LineYellow, new Color(0.92f, 0.7f, 0.12f), 0f, 0.35f),
                M(CityMeshes.Sidewalk, Color.white, 0f, 1f, "Sidewalk", 0.8f),
                M(CityMeshes.Curb, new Color(1.05f, 1.04f, 1.0f), 0f, 1f, "Concrete", 0.6f),
                M(CityMeshes.Concrete, Color.white, 0f, 1f, "Concrete", 0.6f),
                M(CityMeshes.Grass, Color.white, 0f, 1f, "Grass", 0.6f),
                M(CityMeshes.Plaza, Color.white, 0f, 1f, "Plaza", 0.8f),
                M(CityMeshes.FacadeGlass, Color.white, 1f, 1f, "FacadeGlass", 0.6f),
                M(CityMeshes.FacadeOffice, Color.white, 1f, 1f, "FacadeOffice", 0.9f),
                M(CityMeshes.FacadeBrick, Color.white, 1f, 1f, "FacadeBrick", 1f),
                M(CityMeshes.Roof, Color.white, 0f, 1f, "RoofFlat", 0.6f),
                M(CityMeshes.RoofTile, Color.white, 0f, 1f, "RoofTile", 1.2f),
                M(CityMeshes.ShopSign, Color.white, 0f, 1f, "ShopSigns", 0.5f),
                M(CityMeshes.NeonSign, new Color(1f, 0.25f, 0.75f), 0f, 0.5f),
                M(CityMeshes.PalmTrunk, new Color(0.95f, 0.92f, 0.88f), 0f, 1f, "PalmBark", 1f),
                M(CityMeshes.PalmLeaf, new Color(0.27f, 0.38f, 0.16f), 0f, 0.3f),
                M(CityMeshes.PalmSkirt, new Color(0.36f, 0.28f, 0.19f), 0f, 0.05f),
                M(CityMeshes.Bark, new Color(0.3f, 0.23f, 0.16f), 0f, 0.1f),
                M(CityMeshes.Leaf, new Color(0.16f, 0.33f, 0.12f), 0f, 0.2f),
                M(CityMeshes.Metal, new Color(0.46f, 0.47f, 0.48f), 0.75f, 0.45f),
                M(CityMeshes.DarkMetal, new Color(0.08f, 0.08f, 0.085f), 0.2f, 0.22f),
                M(CityMeshes.Wood, new Color(0.33f, 0.25f, 0.18f), 0f, 0.08f),
                M(CityMeshes.Wire, new Color(0.02f, 0.02f, 0.02f), 0f, 0.3f),
                M(CityMeshes.Hydrant, new Color(0.85f, 0.66f, 0.1f), 0f, 0.45f),
                M(CityMeshes.Door, new Color(0.32f, 0.19f, 0.11f), 0f, 0.4f),
                M(CityMeshes.GarageDoor, new Color(0.86f, 0.85f, 0.82f), 0f, 0.35f),
                M(CityMeshes.Trim, new Color(0.84f, 0.82f, 0.77f), 0f, 0.2f),
                M(CityMeshes.LampHead, new Color(1f, 0.95f, 0.85f), 0f, 0.7f),
                M(CityMeshes.SignalHousing, new Color(0.1f, 0.1f, 0.07f), 0f, 0.35f),
                M(CityMeshes.SignGreen, new Color(0.04f, 0.36f, 0.16f), 0f, 0.5f),
                M(CityMeshes.SignWhite, new Color(0.9f, 0.9f, 0.88f), 0f, 0.4f),
            };
            l.Find(s => s.Key == CityMeshes.PalmLeaf).DoubleSided = true;
            l.Find(s => s.Key == CityMeshes.PalmSkirt).DoubleSided = true;
            for (int i = 0; i < CityMeshes.StuccoVariants; i++) l.Add(M(CityMeshes.Stucco(i), Color.white, 1f, 1f, "FacadeStucco" + i, 1f));
            Color[] awnings = { new Color(0.55f, 0.08f, 0.08f), new Color(0.08f, 0.25f, 0.15f), new Color(0.1f, 0.15f, 0.35f), new Color(0.15f, 0.15f, 0.16f) };
            for (int i = 0; i < CityMeshes.AwningVariants; i++)
            {
                var a = M(CityMeshes.AwningSlot(i), awnings[i], 0f, 0.15f);
                a.DoubleSided = true;
                l.Add(a);
            }

            for (int i = 0; i < CityMeshes.StorefrontVariants; i++)
            {
                var sf = M(CityMeshes.StorefrontSlot(i), Color.white, 1f, 1f, "Storefront" + i, 0.7f);
                sf.Emission = new Color(0.3f, 0.26f, 0.2f);
                l.Add(sf);
            }

            return l;
        }
    }
}
