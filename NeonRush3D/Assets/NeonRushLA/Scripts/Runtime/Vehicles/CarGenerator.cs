using System.Collections.Generic;
using NeonRushLA.Geometry;
using UnityEngine;

namespace NeonRushLA.Vehicles
{
    /// <summary>Result of <see cref="CarGenerator.Build"/>: body + wheel parts, all in car space.</summary>
    public sealed class CarModel
    {
        public CarSpec Spec;
        public PartSet Body;
        public PartSet WheelRight;   // spinning part, centred on the hub, axle along X, face +X
        public PartSet WheelLeft;
        public PartSet CaliperRight; // non-spinning
        public PartSet CaliperLeft;
    }

    /// <summary>
    /// Procedural car modeller. The body is lofted from cross-sections sampled along the car
    /// (plan-view taper, tumblehome, shoulder, crowned hood/roof), with wheel arches cut into the
    /// side panels, a separate greenhouse (glass + painted roof rails and pillars), seams,
    /// handles, mirrors, lamps, grille, bumpers, exhausts, plates and fully modelled wheels.
    /// Pure managed code: runs in the Editor, at runtime and in offline preview tools.
    /// </summary>
    public static class CarGenerator
    {
        public const string Paint = "Paint";
        public const string Glass = "Glass";
        public const string Chrome = "Chrome";
        public const string Black = "Black";
        public const string Seam = "Seam";
        public const string Tire = "Tire";
        public const string Rim = "Rim";
        public const string Disc = "Disc";
        public const string Caliper = "Caliper";
        public const string Headlight = "Headlight";
        public const string Taillight = "Taillight";
        public const string Plate = "Plate";
        public const string Sign = "Sign";
        public const string Interior = "Interior";
        public const string Seat = "Seat";
        public const string Amber = "Amber";
        public const string RimSilver = "RimSilver";

        public static readonly string[] AllMaterials =
        {
            Paint, Glass, Chrome, Black, Seam, Tire, Rim, RimSilver, Disc, Caliper, Headlight, Taillight, Amber, Plate, Sign, Interior, Seat
        };

        public static CarModel Build(CarSpec s, float detail = 1f)
        {
            var g = new Builder(s, Mathf.Clamp(detail, 0.35f, 1f));
            return g.Run();
        }

        private sealed class Builder
        {
            private readonly CarSpec _s;
            private readonly float _detail;
            private readonly Curve1D _deck;
            private readonly PartSet _body = new PartSet();

            public Builder(CarSpec s, float detail)
            {
                _s = s;
                _detail = detail;
                _deck = BuildDeckCurve(s);
            }

            // ------------------------------------------------------------------ profile functions

            private static Curve1D BuildDeckCurve(CarSpec s)
            {
                var k = new List<Vector2>();
                float zR = s.RearZ, zF = s.FrontZ;
                if (s.PickupBed)
                {
                    k.Add(new Vector2(zR, s.TailTop));
                    k.Add(new Vector2(zR + 0.06f, s.Belt));
                    k.Add(new Vector2(s.WindshieldBase, s.Belt - 0.01f));
                }
                else
                {
                    k.Add(new Vector2(zR, s.TailTop));
                    k.Add(new Vector2(zR + 0.07f, Mathf.Lerp(s.TailTop, s.Belt + s.Ducktail, 0.75f)));
                    k.Add(new Vector2(zR + 0.20f, s.Belt + s.Ducktail));
                    if (zR + 0.45f < s.RearWindowBase - 0.05f)
                    {
                        k.Add(new Vector2(zR + 0.45f, s.Belt + s.Ducktail * 0.4f));
                    }

                    k.Add(new Vector2(s.RearWindowBase, s.Belt));
                    k.Add(new Vector2(s.WindshieldBase, s.Belt - 0.01f));
                }

                float hoodMid = Mathf.Lerp(s.WindshieldBase, zF, 0.55f);
                k.Add(new Vector2(hoodMid, Mathf.Lerp(s.Belt - 0.01f, s.NoseTop, 0.42f)));
                k.Add(new Vector2(zF - 0.12f, s.NoseTop + 0.035f));
                k.Add(new Vector2(zF, s.NoseTop));
                return new Curve1D(k.ToArray());
            }

            private float Deck(float z) => _deck.Evaluate(z);

            private float HalfW(float z)
            {
                float w = _s.HalfWidth;
                float zF = _s.FrontZ, zR = _s.RearZ;
                if (z > zF - 0.45f)
                {
                    float t = (z - (zF - 0.45f)) / 0.45f;
                    w *= 1f - 0.085f * t * t;
                }

                if (z < zR + 0.38f)
                {
                    float t = ((zR + 0.38f) - z) / 0.38f;
                    w *= 1f - 0.06f * t * t;
                }

                // Muscle-car hips over the rear wheels, lighter flare at the front.
                w += 0.022f * Mathf.Exp(-Sq(z - _s.RearAxleZ) / 0.30f);
                w += 0.010f * Mathf.Exp(-Sq(z - _s.FrontAxleZ) / 0.25f);
                return w;
            }

            private float Bottom(float z)
            {
                float b = _s.Sill;
                if (z > _s.FrontZ - 0.3f) b -= 0.02f * (z - (_s.FrontZ - 0.3f)) / 0.3f;
                if (z < _s.RearZ + 0.3f) b += 0.03f * ((_s.RearZ + 0.3f) - z) / 0.3f;
                return b;
            }

            private float ArchY(float z)
            {
                float best = -10f;
                float ra = _s.ArchRadius;
                foreach (float az in new[] { _s.FrontAxleZ, _s.RearAxleZ })
                {
                    float dz = z - az;
                    if (Mathf.Abs(dz) < ra)
                    {
                        best = Mathf.Max(best, _s.WheelRadius + Mathf.Sqrt(ra * ra - dz * dz));
                    }
                }

                return best;
            }

            private float HoodWeight(float z)
            {
                float a = SmoothStep(_s.WindshieldBase + 0.05f, _s.WindshieldBase + 0.35f, z);
                float b = 1f - SmoothStep(_s.FrontZ - 0.45f, _s.FrontZ - 0.15f, z);
                return a * b;
            }

            private float TopY(float x, float z)
            {
                float w = HalfW(z);
                float d = Deck(z);
                float crown = 0.022f * (1f - Sq(Mathf.Clamp(x / (w * 0.9f), -1f, 1f)));
                float bulge = _s.HoodBulge * HoodWeight(z) * Mathf.Exp(-Sq(x / 0.34f));
                return d + crown + bulge;
            }

            // Side shape (bottom tuck → flank), as fraction of the flank height → fraction of half width.
            // Dense at the bottom so the tuck-under is round, not a crease.
            private static readonly float[] SideT = { 0f, 0.04f, 0.11f, 0.20f, 0.32f, 0.46f, 0.60f, 0.74f, 0.87f, 1f };
            private static readonly float[] SideF = { 0.915f, 0.950f, 0.975f, 0.991f, 0.999f, 1.0f, 1.0f, 0.998f, 0.994f, 0.99f };
            private const int ShoulderSamples = 7; // circular shoulder arc (flank → top), excl. its start
            private const int TopSamples = 7;      // crown samples from the arc end to the centre line

            // Radius of the rounded nose / tail edges (fillet between the flanks/deck and the end panels).
            private float EndRadius => Mathf.Clamp(_s.Length * 0.026f, 0.08f, 0.13f);

            /// <summary>How far the surface is pulled in near the nose and tail (quarter-circle fillet).</summary>
            private float EndInset(float z)
            {
                float r = EndRadius;
                float u = 0f;
                if (z > _s.FrontZ - r) u = (z - (_s.FrontZ - r)) / r;
                else if (z < _s.RearZ + r) u = ((_s.RearZ + r) - z) / r;
                u = Mathf.Clamp01(u);
                return r * (1f - Mathf.Sqrt(Mathf.Max(0f, 1f - u * u)));
            }

            private static float SideFraction(float t)
            {
                if (t <= SideT[0]) return SideF[0];
                for (int i = 0; i < SideT.Length - 1; i++)
                {
                    if (t <= SideT[i + 1]) return Mathf.Lerp(SideF[i], SideF[i + 1], (t - SideT[i]) / (SideT[i + 1] - SideT[i]));
                }

                return SideF[SideF.Length - 1];
            }

            /// <summary>
            /// Outward hint for orienting body faces: away from the car's core, but towards the wheel
            /// inside an arch cut-out, so the cut edges face the tyre (no back faces seen in the well).
            /// </summary>
            private Vector3 BodyOutward(Vector3 p)
            {
                var o = new Vector3(p.x, p.y - 0.55f * _s.Belt, p.z * 0.15f);
                foreach (float az in new[] { _s.FrontAxleZ, _s.RearAxleZ })
                {
                    float dy = p.y - _s.WheelRadius, dz = p.z - az;
                    float dist = Mathf.Sqrt(dy * dy + dz * dz);
                    if (dist < _s.ArchRadius + 0.015f && p.y < Deck(p.z) - 0.05f)
                    {
                        o = new Vector3(p.x, -dy * 3f, -dz * 3f);
                    }
                }

                return o;
            }

            private float ShoulderRadius(float b, float d) => Mathf.Clamp((d - b) * 0.30f, 0.05f, 0.19f);

            /// <summary>Body cross-section ring: left bottom → over the top → right bottom. No hard creases.</summary>
            private Vector3[] Section(float z)
            {
                float inset = EndInset(z);
                float w = HalfW(z) - inset;
                float b = Bottom(z) + inset * 0.55f;
                float arch = ArchY(z);
                float rs = ShoulderRadius(b, Deck(z) - inset);
                float edgeX = w * SideF[SideF.Length - 1];
                // Shoulder arc centre; its top meets the crown at the same height and with a flat tangent.
                float cx = -(edgeX - rs);
                float topAtArc = TopY(cx, z) - inset;
                float cy = topAtArc - rs;

                // Over a wheel arch the flank starts at the arch edge: points below it collapse onto
                // the flank there (no horizontal ledge inside the wheel well).
                float archT = arch > b ? Mathf.Clamp01((arch - b) / Mathf.Max(1e-4f, cy - b)) : 0f;
                float archF = SideFraction(archT);
                var left = new List<Vector3>();
                for (int i = 0; i < SideT.Length; i++)
                {
                    float t = Mathf.Max(SideT[i], archT);
                    float y = Mathf.Min(b + (cy - b) * t, cy);
                    float f = SideT[i] < archT ? archF : SideF[i];
                    left.Add(new Vector3(-w * f, y, z));
                }

                for (int k = 1; k <= ShoulderSamples; k++)
                {
                    float a = Mathf.PI - 0.5f * Mathf.PI * k / ShoulderSamples; // 180° → 90°
                    left.Add(new Vector3(cx + Mathf.Cos(a) * rs, cy + Mathf.Sin(a) * rs, z));
                }

                for (int k = TopSamples - 1; k >= 1; k--)
                {
                    float x = cx * k / TopSamples;
                    left.Add(new Vector3(x, TopY(x, z) - inset, z));
                }

                var ring = new List<Vector3>(left);
                ring.Add(new Vector3(0f, TopY(0f, z) - inset, z));
                for (int i = left.Count - 1; i >= 0; i--)
                {
                    Vector3 p = left[i];
                    ring.Add(new Vector3(-p.x, p.y, p.z));
                }

                return ring.ToArray();
            }

            /// <summary>Height of the body's upper surface (shoulder arc + crown) at lateral position x.</summary>
            private float BodyTopY(float x, float z)
            {
                Vector3[] ring = Section(z);
                float ax = -Mathf.Abs(x);
                int start = SideCount - 1;
                int centre = HalfCount;
                if (ax <= ring[start].x) return ring[start].y;
                for (int i = start; i < centre; i++)
                {
                    Vector3 a = ring[i], b = ring[i + 1];
                    if (ax >= a.x && ax <= b.x && b.x - a.x > 1e-6f)
                    {
                        return Mathf.Lerp(a.y, b.y, (ax - a.x) / (b.x - a.x));
                    }
                }

                return ring[centre].y;
            }

            private int SideCount => SideT.Length;                                   // flank points per half
            private int ShoulderTopIndex => SideT.Length + ShoulderSamples - 1;       // last arc point (top of shoulder)
            private int HalfCount => SideT.Length + ShoulderSamples + (TopSamples - 1); // points per half (excl. centre)

            /// <summary>Point on the left body side at height y (x negative), lifted slightly outward.</summary>
            private Vector3 SidePoint(float z, float y, float lift = 0.002f)
            {
                Vector3[] ring = Section(z);
                for (int i = 0; i < ShoulderTopIndex; i++)
                {
                    Vector3 a = ring[i], b = ring[i + 1];
                    if (y >= a.y - 1e-4f && y <= b.y + 1e-4f && b.y - a.y > 1e-5f)
                    {
                        float t = (y - a.y) / (b.y - a.y);
                        float x = Mathf.Lerp(a.x, b.x, t);
                        return new Vector3(x - lift, y, z);
                    }
                }

                return new Vector3(-HalfW(z) - lift, y, z);
            }

            private List<float> Stations(float z0, float z1, float baseStep)
            {
                float r = EndRadius;
                int endSteps = Mathf.Max(5, Mathf.RoundToInt(8 * _detail));
                var list = new List<float>();
                // Tail fillet: stations spaced evenly in angle so the rounded edge stays smooth.
                for (int k = endSteps; k >= 1; k--)
                {
                    float a = 0.5f * Mathf.PI * k / endSteps;
                    list.Add(z0 + r - r * Mathf.Sin(a));
                }

                float step = baseStep / _detail;
                float z = z0 + r;
                list.Add(z);
                float zEnd = z1 - r;
                while (z < zEnd - 1e-4f)
                {
                    // Dense sampling through the wheel arches for a round cut-out.
                    bool nearArch = Mathf.Abs(z - _s.FrontAxleZ) < _s.ArchRadius + 0.05f || Mathf.Abs(z - _s.RearAxleZ) < _s.ArchRadius + 0.05f;
                    bool nearEnd = z < _s.RearZ + 0.45f || z > _s.FrontZ - 0.45f;
                    float st = nearArch ? step * 0.35f : nearEnd ? step * 0.5f : step;
                    z = Mathf.Min(zEnd, z + st);
                    list.Add(z);
                }

                // Nose fillet.
                for (int k = 1; k <= endSteps; k++)
                {
                    float a = 0.5f * Mathf.PI * k / endSteps;
                    list.Add(zEnd + r * Mathf.Sin(a));
                }

                return list;
            }

            /// <summary>Flat end-panel extents left after the fillet (where lamps, grille and plates sit).</summary>
            private void EndFace(float zEnd, out float bottom, out float top, out float halfW)
            {
                float r = EndRadius;
                bottom = Bottom(zEnd) + r * 0.55f;
                top = Deck(zEnd) - r;
                halfW = HalfW(zEnd) - r;
            }

            // ------------------------------------------------------------------ build

            public CarModel Run()
            {
                BuildBody();
                BuildGreenhouse();
                BuildArchLiners();
                BuildSeamsHandlesMirrors();
                BuildFront();
                BuildRear();
                BuildExtras();
                if (_detail >= 0.5f) BuildInterior(); // far LODs keep the tinted glass only
                BuildMarkersAndWipers();

                var model = new CarModel { Spec = _s, Body = _body };
                BuildWheel(out PartSet wheel, out PartSet caliper);
                Xform toAxleX = Xform.RotateZ(-90f);
                model.WheelRight = new PartSet();
                model.WheelRight.Append(wheel, toAxleX);
                model.CaliperRight = new PartSet();
                model.CaliperRight.Append(caliper, toAxleX);
                model.WheelLeft = new PartSet();
                model.WheelLeft.Append(wheel, Xform.MirrorX * toAxleX);
                model.CaliperLeft = new PartSet();
                model.CaliperLeft.Append(caliper, Xform.MirrorX * toAxleX);
                return model;
            }

            private void BuildBody()
            {
                List<float> zs = Stations(_s.RearZ, _s.FrontZ, 0.12f);
                var rings = new List<Vector3[]>(zs.Count);
                foreach (float z in zs) rings.Add(Section(z));
                int topStart = ShoulderTopIndex;
                int segCount = rings[0].Length - 1;

                Shapes.Loft(_body, rings, false, (r, seg) =>
                {
                    // Lower rocker strip (rounded tuck-under) in black plastic.
                    if (seg <= 1 || seg >= segCount - 2) return Black;
                    if (_s.PickupBed)
                    {
                        float z = zs[r];
                        bool topSeg = seg >= topStart && seg < segCount - topStart;
                        if (topSeg && z < _s.PickupCabRear && z > _s.RearZ + 0.05f) return null; // open bed
                    }

                    return Paint;
                }, BodyOutward);

                // Nose and tail panels.
                Shapes.Cap(_body[Paint], rings[rings.Count - 1], Vector3.forward);
                Shapes.Cap(_body[Paint], rings[0], Vector3.back);

                // Underbody tray.
                float w = _s.HalfWidth - 0.06f;
                Shapes.Box(_body[Black], new Vector3(0f, _s.Sill + 0.01f, (_s.FrontZ + _s.RearZ) * 0.5f),
                    new Vector3(w * 2f, 0.012f, _s.Length - 0.12f));

                if (_s.PickupBed) BuildBed();
            }

            private void BuildBed()
            {
                float zBack = _s.RearZ + 0.06f;
                float zFront = _s.PickupCabRear - 0.02f;
                // Bed walls meet the inner edge of the rounded shoulder (no open edge to look under).
                float w = Mathf.Abs(Section((zBack + zFront) * 0.5f)[ShoulderTopIndex].x) - 0.005f;
                float floor = _s.Belt - 0.48f;
                float len = zFront - zBack;
                float cz = (zBack + zFront) * 0.5f;
                Shapes.Box(_body[Black], new Vector3(0f, floor, cz), new Vector3(w * 2f, 0.02f, len));
                Shapes.Box(_body[Black], new Vector3(-w, (floor + _s.Belt) * 0.5f, cz), new Vector3(0.02f, _s.Belt - floor, len));
                Shapes.Box(_body[Black], new Vector3(w, (floor + _s.Belt) * 0.5f, cz), new Vector3(0.02f, _s.Belt - floor, len));
                Shapes.Box(_body[Black], new Vector3(0f, (floor + _s.Belt) * 0.5f, zFront), new Vector3(w * 2f, _s.Belt - floor, 0.02f));
                // Tailgate with rounded edges.
                Shapes.RoundedBox(_body[Paint], new Vector3(0f, (floor + _s.Belt) * 0.5f, zBack), new Vector3(w * 2f + 0.06f, _s.Belt - floor, 0.05f), 0.024f, 3);
                // Bed rail caps (rounded tubes)
                for (int side = -1; side <= 1; side += 2)
                {
                    float x = side * (w + 0.01f);
                    var rail = new List<Vector3> { new Vector3(x, _s.Belt + 0.012f, zBack + 0.03f), new Vector3(x, _s.Belt + 0.012f, zFront) };
                    Shapes.Tube(_body[Black], rail, new List<float> { 0.028f, 0.028f }, 10, true, true);
                }
            }

            // ------------------------------------------------------------------ greenhouse

            private float GreenhouseE(float z)
            {
                if (z >= _s.RoofFront)
                {
                    float t = Mathf.Clamp01((_s.WindshieldBase - z) / Mathf.Max(0.01f, _s.WindshieldBase - _s.RoofFront));
                    return 1f - Mathf.Pow(1f - t, 1.6f);
                }

                if (z <= _s.RoofRear)
                {
                    float t = Mathf.Clamp01((z - _s.RearWindowBase) / Mathf.Max(0.01f, _s.RoofRear - _s.RearWindowBase));
                    return 1f - Mathf.Pow(1f - t, 1.8f);
                }

                return 1f;
            }

            private Vector3[] GreenhouseSection(float z)
            {
                float e = GreenhouseE(z);
                float h = _s.Belt + (_s.Roof - _s.Belt) * e;
                float wb = HalfW(z) * _s.GreenhouseBaseInset;
                float wt = Mathf.Lerp(wb, HalfW(z) * _s.GreenhouseTopInset, e);
                // The glass starts on the body surface itself (which curves over the shoulder), so no gap.
                float baseY = Mathf.Min(_s.Belt, BodyTopY(-wb, z)) - 0.006f;
                // Window flank, then a quadratic-Bezier roof corner (no crease between glass and roof).
                float rc = 0.075f * e;
                var s0 = new Vector2(-wt, h - rc);
                var c0 = new Vector2(-wt - 0.006f * e, h + 0.006f * e);
                var e0 = new Vector2(-wt + rc * 1.3f, h + 0.012f * e);
                var left = new List<Vector3>
                {
                    new Vector3(-wb, baseY, z),
                    new Vector3(-Mathf.Lerp(wb, wt, 0.5f) - 0.01f * e, baseY + (h - rc - baseY) * 0.55f, z),
                    new Vector3(s0.x, s0.y, z),
                };
                for (int k = 1; k <= GhCornerSamples; k++)
                {
                    float t = (float)k / GhCornerSamples;
                    Vector2 p = (1 - t) * (1 - t) * s0 + 2 * t * (1 - t) * c0 + t * t * e0;
                    left.Add(new Vector3(p.x, p.y, z));
                }

                left.Add(new Vector3(-wt * 0.40f, h + 0.017f * e, z));
                var ring = new List<Vector3>(left);
                ring.Add(new Vector3(0f, h + 0.020f * e, z));
                for (int i = left.Count - 1; i >= 0; i--) ring.Add(new Vector3(-left[i].x, left[i].y, z));
                return ring.ToArray();
            }

            private const int GhCornerSamples = 5;
            private const int GhCornerStart = 2; // index of the first corner point (top of the side window)

            /// <summary>0 = side window, 1 = roof corner, 2 = roof top, for a greenhouse ring segment.</summary>
            private static int GreenhouseSegKind(int seg, int segs)
            {
                int li = seg < segs / 2 ? seg : segs - 1 - seg;
                if (li < GhCornerStart) return 0;
                if (li < GhCornerStart + GhCornerSamples) return 1;
                return 2;
            }

            private void BuildGreenhouse()
            {
                List<float> zs = new List<float>();
                int n = Mathf.Max(12, Mathf.RoundToInt(30 * _detail));
                for (int i = 0; i <= n; i++) zs.Add(Mathf.Lerp(_s.RearWindowBase, _s.WindshieldBase, (float)i / n));
                // Make sure pillar/roof boundaries land on stations.
                foreach (float extra in new[] { _s.RoofFront, _s.RoofRear, _s.CPillarStart, _s.BPillar - 0.045f, _s.BPillar + 0.045f })
                {
                    if (extra > _s.RearWindowBase && extra < _s.WindshieldBase) zs.Add(extra);
                }

                zs.Sort();
                var rings = new List<Vector3[]>();
                foreach (float z in zs) rings.Add(GreenhouseSection(z));
                int segs = rings[0].Length - 1;

                Shapes.Loft(_body, rings, false, (r, seg) =>
                {
                    float zMid = (zs[r] + zs[r + 1]) * 0.5f;
                    int kind = GreenhouseSegKind(seg, segs);
                    bool side = kind == 0;
                    bool rail = kind == 1;
                    bool top = kind == 2;
                    bool roofZone = zMid < _s.RoofFront - 0.03f && zMid > _s.RoofRear + 0.03f;
                    if (top && roofZone) return Paint;
                    if (rail && roofZone) return Paint;
                    if ((side || rail) && zMid < _s.CPillarStart) return Paint;
                    if (side && Mathf.Abs(zMid - _s.BPillar) < 0.045f) return Black;
                    return Glass;
                }, p => new Vector3(p.x, p.y - (_s.Belt - 0.2f), 0f));

                // Close the thin slivers where the glass meets the body at both ends.
                Shapes.Cap(_body[Black], rings[rings.Count - 1], Vector3.forward);
                Shapes.Cap(_body[Black], rings[0], Vector3.back);

                // A-pillars, drip rails and belt chrome.
                for (int side = -1; side <= 1; side += 2)
                {
                    var aPath = new List<Vector3>();
                    var aR = new List<float>();
                    for (int i = 0; i <= 8; i++)
                    {
                        float z = Mathf.Lerp(_s.WindshieldBase, _s.RoofFront, i / 8f);
                        Vector3 p = GreenhouseSection(z)[GhCornerStart + 1];
                        aPath.Add(new Vector3(p.x * -side * -1f, p.y + 0.004f, z));
                        aR.Add(0.026f);
                    }

                    for (int i = 0; i < aPath.Count; i++) aPath[i] = new Vector3(side * Mathf.Abs(aPath[i].x), aPath[i].y, aPath[i].z);
                    Shapes.Tube(_body[Paint], aPath, aR, 8, true, true);

                    var belt = new List<Vector3>();
                    var beltR = new List<float>();
                    for (int i = 0; i <= 10; i++)
                    {
                        float z = Mathf.Lerp(_s.CPillarStart, _s.WindshieldBase - 0.04f, i / 10f);
                        float x = HalfW(z) * _s.GreenhouseBaseInset + 0.004f;
                        belt.Add(new Vector3(side * x, Mathf.Min(_s.Belt, BodyTopY(-x, z)) + 0.004f, z));
                        beltR.Add(0.007f);
                    }

                    Shapes.Tube(_body[Chrome], belt, beltR, 6);
                }
            }

            // ------------------------------------------------------------------ wheel arches

            private void BuildArchLiners()
            {
                float ra = _s.ArchRadius - 0.006f;
                foreach (float az in new[] { _s.FrontAxleZ, _s.RearAxleZ })
                {
                    for (int side = -1; side <= 1; side += 2)
                    {
                        var tmp = new MeshData();
                        float depth = 0.34f;
                        Shapes.Lathe(tmp, new[] { new Vector2(ra, -depth * 0.5f), new Vector2(ra, depth * 0.5f) }, Mathf.RoundToInt(18 * _detail) + 6, -1f, true, -100f, 100f);
                        float xc = side * (HalfW(az) - depth * 0.5f);
                        Xform x = Xform.Translate(new Vector3(xc, _s.WheelRadius, az)) * Xform.RotateZ(90f);
                        // Inner end wall closes the wheel well (no see-through above the tyre).
                        var wall = new MeshData();
                        int c0 = wall.AddVertex(Vector3.zero, Vector3.up, Vector2.zero);
                        int segN = 14;
                        for (int i = 0; i <= segN; i++)
                        {
                            float a = Mathf.Lerp(-100f, 100f, (float)i / segN) * Mathf.Deg2Rad;
                            wall.AddVertex(new Vector3(Mathf.Cos(a) * ra, 0f, Mathf.Sin(a) * ra), Vector3.up, Vector2.zero);
                        }

                        for (int i = 0; i < segN; i++) wall.AddTriangleFacing(c0, c0 + 1 + i, c0 + 2 + i, Vector3.up);
                        var wallX = Xform.Translate(new Vector3(0f, side * depth * 0.5f, 0f)); // inner end (towards the car centre)
                        tmp.Append(wall, wallX);
                        tmp.MakeDoubleSided();
                        _body[Black].Append(tmp, x);

                        // Thin painted lip following the arch edge.
                        var path = new List<Vector3>();
                        var rad = new List<float>();
                        for (int i = 0; i <= 14; i++)
                        {
                            float a = Mathf.Lerp(-80f, 80f, i / 14f) * Mathf.Deg2Rad;
                            float z = az + Mathf.Sin(a) * (_s.ArchRadius + 0.004f);
                            float y = _s.WheelRadius + Mathf.Cos(a) * (_s.ArchRadius + 0.004f);
                            Vector3 sp = SidePoint(z, Mathf.Min(y, Deck(z) - 0.05f), 0.006f);
                            path.Add(new Vector3(side * Mathf.Abs(sp.x), y, z));
                            rad.Add(0.016f);
                        }

                        var lipMesh = new MeshData();
                        Shapes.Tube(lipMesh, path, rad, 6, false);
                        lipMesh.MakeDoubleSided();
                        _body[Black].Append(lipMesh);
                    }
                }
            }

            // ------------------------------------------------------------------ seams, handles, mirrors

            private void BuildSeamsHandlesMirrors()
            {
                bool fourDoors = _s.Kind != CarKind.Sports;
                float zA = Mathf.Min(_s.FrontAxleZ - _s.ArchRadius - 0.07f, _s.WindshieldBase + 0.45f);
                float zB = _s.BPillar;
                float zC = Mathf.Max(_s.RearAxleZ + _s.ArchRadius + 0.07f, _s.CPillarStart - 0.06f);
                if (_s.PickupBed) zC = Mathf.Max(zC, _s.PickupCabRear + 0.04f);
                if (!fourDoors) zC = _s.CPillarStart + 0.12f;
                float yBottom = _s.Sill + 0.085f;
                float yTop = _s.Belt - 0.012f;

                var seamZs = fourDoors ? new[] { zA, zB, zC } : new[] { zA, zC };
                for (int side = -1; side <= 1; side += 2)
                {
                    foreach (float z in seamZs)
                    {
                        var path = new List<Vector3>();
                        var widths = new List<float>();
                        var dirs = new List<Vector3>();
                        for (int i = 0; i <= 8; i++)
                        {
                            float y = Mathf.Lerp(yBottom, yTop, i / 8f);
                            Vector3 p = SidePoint(z, y);
                            path.Add(new Vector3(side * Mathf.Abs(p.x), y, z));
                            widths.Add(0.0055f);
                            dirs.Add(Vector3.forward);
                        }

                        Shapes.Ribbon(_body[Seam], path, widths, dirs, new Vector3(side, 0, 0), false);
                    }

                    var hPath = new List<Vector3>();
                    var hW = new List<float>();
                    var hD = new List<Vector3>();
                    for (int i = 0; i <= 16; i++)
                    {
                        float z = Mathf.Lerp(zC, zA, i / 16f);
                        Vector3 p = SidePoint(z, yBottom);
                        hPath.Add(new Vector3(side * Mathf.Abs(p.x), yBottom, z));
                        hW.Add(0.0055f);
                        hD.Add(Vector3.up);
                    }

                    Shapes.Ribbon(_body[Seam], hPath, hW, hD, new Vector3(side, 0, 0), false);

                    // Handles
                    float hy = _s.Belt - 0.13f;
                    var handleZs = fourDoors ? new[] { zA - 0.28f, zB - 0.24f } : new[] { zC + 0.25f };
                    foreach (float z in handleZs)
                    {
                        Vector3 p = SidePoint(z, hy, 0f);
                        Shapes.RoundedBox(_body[Chrome], new Vector3(side * (Mathf.Abs(p.x) + 0.008f), hy, z), new Vector3(0.026f, 0.032f, 0.17f), 0.012f, 2);
                    }

                    // Mirror
                    float mz = _s.WindshieldBase - 0.10f;
                    float baseX = HalfW(mz) * _s.GreenhouseBaseInset;
                    var housing = new Vector3(side * (baseX + 0.17f), _s.Belt + 0.075f, mz);
                    Shapes.Ellipsoid(_body[Paint], housing, new Vector3(0.065f, 0.058f, 0.10f), 12, 8);
                    Shapes.Ellipsoid(_body[Black], housing + new Vector3(0, 0, -0.03f), new Vector3(0.058f, 0.05f, 0.075f), 10, 6);
                    Shapes.CylinderBetween(_body[Black], new Vector3(side * (baseX + 0.01f), _s.Belt + 0.03f, mz + 0.02f), housing, 0.017f, 6);
                }
            }

            // ------------------------------------------------------------------ front / rear

            private void BuildFront()
            {
                float zF = _s.FrontZ;
                EndFace(zF, out float fb, out float ft, out float w);
                float H = ft - fb;
                MeshData black = _body[Black];

                // Grille opening + slats (all rounded rectangles)
                float gy0 = fb + 0.30f * H, gy1 = fb + 0.80f * H, gw = 0.60f * w;
                float gr = (gy1 - gy0) * 0.30f;
                Shapes.RoundedPlate(black, new Vector3(0, (gy0 + gy1) * 0.5f, zF + 0.004f), new Vector2(gw * 2f, gy1 - gy0), 0.012f, gr);
                MeshData slat = _s.Kind == CarKind.VortexGT || _s.Kind == CarKind.Sports ? _body[Seam] : _body[Chrome];
                for (int i = 1; i <= 4; i++)
                {
                    float y = Mathf.Lerp(gy0, gy1, i / 5f);
                    float inset = gr * (1f - Mathf.Sqrt(Mathf.Clamp01(1f - Sq(Mathf.Max(0f, Mathf.Abs(y - (gy0 + gy1) * 0.5f) - ((gy1 - gy0) * 0.5f - gr)) / gr))));
                    Shapes.RoundedPlate(slat, new Vector3(0, y, zF + 0.012f), new Vector2(gw * 2f - 0.05f - 2f * inset, 0.012f), 0.008f, 0.006f, 2);
                }

                if (_s.Kind != CarKind.VortexGT && _s.Kind != CarKind.Sports)
                {
                    // Chrome surround: a rounded frame (outer rounded plate behind the black opening).
                    Shapes.RoundedPlate(_body[Chrome], new Vector3(0, (gy0 + gy1) * 0.5f, zF + 0.001f), new Vector2(gw * 2f + 0.04f, gy1 - gy0 + 0.04f), 0.012f, gr + 0.02f);
                }

                // Headlights: dark rounded housing + rounded LED lenses
                float hy0 = fb + 0.68f * H, hy1 = fb + 0.90f * H;
                float hx0 = 0.60f * w, hx1 = 0.95f * w;
                float hh = hy1 - hy0;
                for (int side = -1; side <= 1; side += 2)
                {
                    float cx = side * (hx0 + hx1) * 0.5f;
                    Shapes.RoundedPlate(black, new Vector3(cx, (hy0 + hy1) * 0.5f, zF + 0.004f), new Vector2(hx1 - hx0 + 0.02f, hh + 0.02f), 0.012f, (hh + 0.02f) * 0.45f);
                    Shapes.RoundedPlate(_body[Headlight], new Vector3(cx, hy1 - hh * 0.3f, zF + 0.012f), new Vector2(hx1 - hx0 - 0.01f, hh * 0.36f), 0.008f, hh * 0.17f);
                    Shapes.RoundedPlate(_body[Headlight], new Vector3(cx + side * 0.03f, hy0 + hh * 0.28f, zF + 0.012f), new Vector2((hx1 - hx0) * 0.55f, hh * 0.22f), 0.008f, hh * 0.105f);
                }

                if (_s.FullWidthDrl)
                {
                    Shapes.RoundedPlate(_body[Headlight], new Vector3(0, ft - 0.03f, zF + 0.008f), new Vector2(hx1 * 2f, 0.014f), 0.01f, 0.0069f, 2);
                }

                // Lower intake, splitter, fog lamps
                float iy = fb + 0.13f * H, ih = 0.20f * H;
                Shapes.RoundedPlate(black, new Vector3(0, iy, zF + 0.004f), new Vector2(0.70f * w * 2f, ih), 0.012f, ih * 0.45f);
                Shapes.RoundedBox(black, new Vector3(0, Bottom(zF) + 0.03f, zF - 0.10f), new Vector3(w * 1.9f + 0.1f, 0.045f, 0.3f), 0.022f, 3);
                for (int side = -1; side <= 1; side += 2)
                {
                    Shapes.RoundedPlate(_body[Headlight], new Vector3(side * 0.82f * w, iy, zF + 0.012f), new Vector2(0.11f, 0.03f), 0.008f, 0.0149f, 3);
                }

                PlateQuad(new Vector3(0, iy, zF + 0.022f), true);
            }

            private void BuildRear()
            {
                float zR = _s.RearZ;
                EndFace(zR, out float rb, out float rt, out float w);
                float H = rt - rb;
                MeshData black = _body[Black];
                float z = zR - 0.006f;

                if (_s.RacetrackTaillight)
                {
                    // One continuous racetrack loop: a red rounded ring around a dark rounded centre.
                    float y1 = rt - 0.035f, y0 = rt - 0.135f;
                    float x = 0.95f * w;
                    float lh = y1 - y0;
                    Shapes.RoundedPlate(_body[Taillight], new Vector3(0, (y0 + y1) * 0.5f, z + 0.002f), new Vector2(x * 2f + 0.03f, lh + 0.03f), 0.01f, (lh + 0.03f) * 0.49f, 6);
                    Shapes.RoundedPlate(black, new Vector3(0, (y0 + y1) * 0.5f, z - 0.004f), new Vector2(x * 2f - 0.02f, lh - 0.02f), 0.008f, (lh - 0.02f) * 0.49f, 6);
                }
                else
                {
                    float y1 = rt - 0.035f, y0 = rt - 0.20f;
                    for (int side = -1; side <= 1; side += 2)
                    {
                        float x0 = 0.50f * w, x1 = 0.96f * w;
                        float cx = side * (x0 + x1) * 0.5f;
                        float lh = y1 - y0;
                        Shapes.RoundedPlate(black, new Vector3(cx, (y0 + y1) * 0.5f, z + 0.002f), new Vector2(x1 - x0 + 0.02f, lh + 0.02f), 0.01f, (lh + 0.02f) * 0.35f);
                        Shapes.RoundedPlate(_body[Taillight], new Vector3(cx, (y0 + y1) * 0.5f + 0.02f, z - 0.004f), new Vector2(x1 - x0, lh * 0.55f), 0.012f, lh * 0.25f);
                    }
                }

                PlateQuad(new Vector3(0, rb + 0.40f * H, z - 0.006f), false);

                // Diffuser / bumper (rounded)
                Shapes.RoundedBox(black, new Vector3(0, Bottom(zR) + 0.07f, zR + 0.07f), new Vector3(w * 1.9f, 0.14f, 0.16f), 0.05f, 3);

                // Exhaust tips
                int tips = _s.DualExhaust ? 2 : 1;
                for (int i = 0; i < tips; i++)
                {
                    float x = (tips == 1 ? -0.55f : (i == 0 ? -0.58f : 0.58f)) * w;
                    var a = new Vector3(x, rb + 0.05f, zR + 0.12f);
                    var b = new Vector3(x, rb + 0.05f, zR - 0.07f);
                    ExhaustTip(a, b);
                    if (_s.DualExhaust)
                    {
                        ExhaustTip(new Vector3(x + Mathf.Sign(x) * 0.115f, a.y, a.z), new Vector3(x + Mathf.Sign(x) * 0.115f, b.y, b.z));
                    }
                }
            }

            private void ExhaustTip(Vector3 a, Vector3 b)
            {
                var tip = new MeshData();
                Shapes.CylinderBetween(tip, a, b, 0.05f, 14, false);
                tip.MakeDoubleSided();
                _body[Chrome].Append(tip);
                // Dark inner pipe, recessed a few millimetres.
                Shapes.CylinderBetween(_body[Black], a, b + (a - b).normalized * 0.012f, 0.040f, 12, true);
            }

            private void PlateQuad(Vector3 center, bool front)
            {
                float hw = 0.26f, hh = 0.056f;
                MeshData m = _body[Plate];
                Vector3 n = front ? Vector3.forward : Vector3.back;
                // a = bottom-left as seen from outside.
                float sx = front ? 1f : -1f;
                var a = center + new Vector3(-hw * sx, -hh, 0);
                var b = center + new Vector3(hw * sx, -hh, 0);
                var c = center + new Vector3(hw * sx, hh, 0);
                var d = center + new Vector3(-hw * sx, hh, 0);
                int ia = m.AddVertex(a, n, new Vector2(0, 0));
                int ib = m.AddVertex(b, n, new Vector2(1, 0));
                int ic = m.AddVertex(c, n, new Vector2(1, 1));
                int id = m.AddVertex(d, n, new Vector2(0, 1));
                m.AddQuadFacing(ia, ib, ic, id, n);
                Shapes.RoundedPlate(_body[Black], center - n * 0.004f, new Vector2(hw * 2f + 0.03f, hh * 2f + 0.03f), 0.006f, 0.025f);
            }

            private void BuildExtras()
            {
                // Hood vents (GT / sports)
                if (_s.HoodVents)
                {
                    float z = _s.FrontZ - 0.62f;
                    for (int side = -1; side <= 1; side += 2)
                    {
                        float x = side * 0.36f;
                        // Rounded slot lying on the hood (plate rotated to face up).
                        Shapes.RoundedPlate(_body[Seam], new Vector3(x, TopY(x, z) + 0.004f, z), new Vector2(0.07f, 0.32f), 0.012f, 0.034f, 4, Xform.RotateX(90f));
                    }
                }

                if (_s.RearWing)
                {
                    float z = _s.RearZ + 0.18f;
                    float y = Deck(z) + 0.17f;
                    // Airfoil-like wing: a flattened rounded box (fully rounded leading/trailing edges).
                    Shapes.RoundedBox(_body[Black], new Vector3(0, y, z), new Vector3(_s.HalfWidth * 1.75f, 0.04f, 0.28f), 0.0199f, 3);
                    for (int side = -1; side <= 1; side += 2)
                    {
                        Shapes.RoundedBox(_body[Black], new Vector3(side * 0.45f, (y + Deck(z)) * 0.5f, z + 0.02f), new Vector3(0.035f, y - Deck(z), 0.12f), 0.017f, 2);
                    }
                }

                if (_s.TaxiSign)
                {
                    float z = (_s.RoofFront + _s.RoofRear) * 0.5f;
                    Shapes.RoundedBox(_body[Black], new Vector3(0, _s.Roof + 0.035f, z), new Vector3(0.12f, 0.04f, 0.3f), 0.019f, 2);
                    Shapes.RoundedBox(_body[Sign], new Vector3(0, _s.Roof + 0.13f, z), new Vector3(0.62f, 0.16f, 0.22f), 0.03f, 2);
                }

                // Roof antenna (shark fin) for the GT
                if (_s.Kind == CarKind.VortexGT)
                {
                    float z = _s.RoofRear + 0.12f;
                    Shapes.Ellipsoid(_body[Paint], new Vector3(0, _s.Roof + 0.02f, z), new Vector3(0.03f, 0.045f, 0.09f), 8, 6);
                }
            }

            // ------------------------------------------------------------------ wheel

            /// <summary>Wheel in lathe space: axle along +Y (outer face +Y), centred on the hub.</summary>
            private void BuildWheel(out PartSet wheel, out PartSet caliper)
            {
                wheel = new PartSet();
                caliper = new PartSet();
                float R = _s.WheelRadius;
                float rr = _s.RimRadius;
                float hw = _s.TireWidth * 0.5f;
                int seg = Mathf.RoundToInt(30 * _detail);

                // Tire: rounded sidewalls + tread
                var tire = new List<Vector2>
                {
                    new Vector2(rr + 0.004f, -hw + 0.012f), new Vector2(rr + 0.02f, -hw), new Vector2(R - 0.04f, -hw - 0.004f),
                    new Vector2(R - 0.012f, -hw + 0.015f), new Vector2(R, -hw + 0.045f), new Vector2(R, hw - 0.045f),
                    new Vector2(R - 0.012f, hw - 0.015f), new Vector2(R - 0.04f, hw + 0.004f), new Vector2(rr + 0.02f, hw),
                    new Vector2(rr + 0.004f, hw - 0.012f),
                };
                Shapes.Lathe(wheel[Tire], tire, seg);

                // Rim lip + barrel
                var lip = new List<Vector2>
                {
                    new Vector2(rr + 0.008f, hw - 0.022f), new Vector2(rr + 0.008f, hw - 0.006f), new Vector2(rr - 0.004f, hw - 0.012f),
                    new Vector2(rr - 0.016f, hw - 0.045f),
                };
                Shapes.Lathe(wheel[_s.SilverRims ? RimSilver : Rim], lip, seg);
                Shapes.Lathe(wheel[Black], new[] { new Vector2(rr - 0.012f, -hw + 0.02f), new Vector2(rr - 0.012f, hw - 0.04f) }, seg, -1f);

                // Brake disc (spins) + caliper (fixed)
                float discR = rr * 0.78f;
                var discM = new MeshData();
                Shapes.Cylinder(discM, discR, 0.028f, seg);
                wheel[Disc].Append(discM, Xform.Translate(new Vector3(0, hw - 0.115f, 0)));
                Shapes.Cylinder(wheel[Black], discR * 0.42f, 0.032f, 12);
                float ca = 145f * Mathf.Deg2Rad;
                var cc = new Vector3(Mathf.Cos(ca) * discR * 0.82f, hw - 0.095f, Mathf.Sin(ca) * discR * 0.82f);
                var cal = new MeshData();
                Shapes.RoundedBox(cal, Vector3.zero, new Vector3(0.07f, 0.075f, 0.16f), 0.02f, 2);
                caliper[Caliper].Append(cal, Xform.Translate(cc) * Xform.RotateY(-55f));

                // Spokes: 5 split spokes, concave (outer ends sit further out than the hub).
                float faceY = hw - 0.055f;
                string rimSlot = _s.SilverRims ? RimSilver : Rim;
                float r0 = 0.065f, r1 = rr - 0.01f;
                float rc = (r0 + r1) * 0.5f;
                float len = r1 - r0;
                for (int i = 0; i < 5; i++)
                {
                    float baseAng = i * 72f;
                    for (int k = -1; k <= 1; k += 2)
                    {
                        float ang = baseAng + k * 7f;
                        var spoke = new MeshData();
                        Shapes.RoundedBox(spoke, Vector3.zero, new Vector3(len, 0.03f, 0.044f), 0.013f, 2);
                        Xform x = Xform.RotateY(-ang) * Xform.Translate(new Vector3(rc, faceY, 0)) * Xform.RotateZ(9f);
                        wheel[rimSlot].Append(spoke, x);
                    }
                }

                // Hub + centre cap
                var hub = new MeshData();
                Shapes.Cylinder(hub, r0 + 0.012f, 0.05f, 16);
                wheel[rimSlot].Append(hub, Xform.Translate(new Vector3(0, faceY - 0.015f, 0)));
                Shapes.Lathe(wheel[Chrome], new[] { new Vector2(0.045f, faceY + 0.01f), new Vector2(0.04f, faceY + 0.022f), new Vector2(0.0f, faceY + 0.028f) }, 16);
            }

            // ------------------------------------------------------------------ interior

            /// <summary>Cabin seen through the glass: floor, door trims, headliner, dashboard, steering wheel, seats.</summary>
            private void BuildInterior()
            {
                MeshData trim = _body[Interior], seat = _body[Seat];
                float floor = _s.Sill + 0.13f;
                float zF = _s.WindshieldBase - 0.05f;
                float zR = _s.PickupBed ? _s.PickupCabRear + 0.04f : _s.RearWindowBase + 0.12f;
                if (zR >= zF - 0.5f) return;

                // Door trims (facing inwards) and the floor
                int n = 10;
                for (int side = -1; side <= 1; side += 2)
                {
                    for (int i = 0; i < n; i++)
                    {
                        float z0 = Mathf.Lerp(zR, zF, (float)i / n), z1 = Mathf.Lerp(zR, zF, (i + 1f) / n);
                        float x0 = side * (HalfW(z0) - 0.11f), x1 = side * (HalfW(z1) - 0.11f);
                        float top = _s.Belt - 0.01f;
                        trim.AddFlatQuad(new Vector3(x0, floor, z0), new Vector3(x1, floor, z1), new Vector3(x1, top, z1), new Vector3(x0, top, z0), new Vector3(-side, 0f, 0f), 1f);
                    }
                }

                float fw = HalfW((zF + zR) * 0.5f) - 0.11f;
                trim.AddFlatQuad(new Vector3(-fw, floor, zR), new Vector3(fw, floor, zR), new Vector3(fw, floor, zF), new Vector3(-fw, floor, zF), Vector3.up, 1f);
                // Rear bulkhead / parcel shelf and front firewall close the cabin box.
                trim.AddFlatQuad(new Vector3(-fw, floor, zR), new Vector3(fw, floor, zR), new Vector3(fw, _s.Belt, zR), new Vector3(-fw, _s.Belt, zR), Vector3.forward, 1f);
                trim.AddFlatQuad(new Vector3(-fw, floor, zF), new Vector3(fw, floor, zF), new Vector3(fw, _s.Belt, zF), new Vector3(-fw, _s.Belt, zF), Vector3.back, 1f);

                // Headliner under the roof
                float hy = _s.Roof - 0.07f;
                float hwz = HalfW((_s.RoofFront + _s.RoofRear) * 0.5f) * _s.GreenhouseTopInset * 0.95f;
                trim.AddFlatQuad(new Vector3(-hwz, hy, _s.RoofRear), new Vector3(hwz, hy, _s.RoofRear), new Vector3(hwz, hy, _s.RoofFront), new Vector3(-hwz, hy, _s.RoofFront), Vector3.down, 1f);

                // Dashboard with instrument binnacle (left-hand drive)
                float dz = zF - 0.28f;
                Shapes.RoundedBox(trim, new Vector3(0f, _s.Belt - 0.04f, dz), new Vector3(fw * 2f - 0.04f, 0.2f, 0.46f), 0.06f, 2);
                Shapes.RoundedBox(trim, new Vector3(-0.38f, _s.Belt + 0.07f, dz - 0.12f), new Vector3(0.42f, 0.1f, 0.2f), 0.04f, 2);
                Shapes.RoundedBox(trim, new Vector3(0f, floor + 0.2f, (zF + _s.BPillar) * 0.5f), new Vector3(0.22f, 0.3f, Mathf.Max(0.3f, zF - _s.BPillar - 0.2f)), 0.05f, 2); // console

                // Steering wheel: ring + column, tilted towards the driver
                var ring = new List<Vector3>();
                var rad = new List<float>();
                Vector3 wc = new Vector3(-0.38f, _s.Belt + 0.03f, dz - 0.36f);
                float tilt = 25f * Mathf.Deg2Rad;
                Vector3 up = new Vector3(0f, Mathf.Cos(tilt), Mathf.Sin(tilt));
                for (int i = 0; i <= 24; i++)
                {
                    float a = i / 24f * Mathf.PI * 2f;
                    ring.Add(wc + Vector3.right * (Mathf.Cos(a) * 0.185f) + up * (Mathf.Sin(a) * 0.185f));
                    rad.Add(0.017f);
                }

                Shapes.Tube(_body[Black], ring, rad, 6, false);
                Shapes.CylinderBetween(_body[Black], wc, wc + new Vector3(0f, -0.06f, 0.3f), 0.035f, 8, true);
                Shapes.CylinderBetween(_body[Black], wc + Vector3.left * 0.17f, wc + Vector3.right * 0.17f, 0.012f, 5, true);

                // Front bucket seats
                float zb = Mathf.Min(_s.BPillar + 0.1f, zF - 0.9f);
                for (int side = -1; side <= 1; side += 2)
                {
                    float x = side * 0.38f;
                    Shapes.RoundedBox(seat, new Vector3(x, floor + 0.22f, zb + 0.08f), new Vector3(0.5f, 0.14f, 0.5f), 0.06f, 2);
                    var back = new MeshData();
                    Shapes.RoundedBox(back, Vector3.zero, new Vector3(0.5f, 0.62f, 0.14f), 0.06f, 2);
                    seat.Append(back, Xform.Translate(new Vector3(x, floor + 0.6f, zb - 0.2f)) * Xform.RotateX(-14f));
                    float headY = Mathf.Min(floor + 1.0f, _s.Roof - 0.2f);
                    Shapes.RoundedBox(seat, new Vector3(x, headY, zb - 0.3f), new Vector3(0.26f, 0.18f, 0.1f), 0.045f, 2);
                }

                // Rear bench when there is room
                float zrb = zb - 0.85f;
                if (!_s.PickupBed && zrb - 0.45f > zR)
                {
                    float bw = HalfW(zrb) - 0.2f;
                    Shapes.RoundedBox(seat, new Vector3(0f, floor + 0.22f, zrb + 0.05f), new Vector3(bw * 2f, 0.14f, 0.48f), 0.06f, 2);
                    var back = new MeshData();
                    Shapes.RoundedBox(back, Vector3.zero, new Vector3(bw * 2f, 0.58f, 0.14f), 0.06f, 2);
                    seat.Append(back, Xform.Translate(new Vector3(0f, floor + 0.58f, zrb - 0.22f)) * Xform.RotateX(-16f));
                }

                // Interior mirror
                Shapes.RoundedBox(_body[Black], new Vector3(0f, _s.Roof - 0.16f, Mathf.Lerp(_s.RoofFront, zF, 0.35f)), new Vector3(0.24f, 0.06f, 0.03f), 0.012f, 2);
            }

            /// <summary>Amber/red side markers, third brake light and windscreen wipers.</summary>
            private void BuildMarkersAndWipers()
            {
                for (int side = -1; side <= 1; side += 2)
                {
                    foreach (var (z, slot) in new[] { (_s.FrontZ - 0.32f, Amber), (_s.RearZ + 0.3f, Taillight) })
                    {
                        float y = Mathf.Min(_s.Belt, Deck(z)) - 0.16f;
                        Vector3 p = SidePoint(z, y, 0.004f);
                        Shapes.RoundedPlate(_body[slot], new Vector3(side * Mathf.Abs(p.x), y, z), new Vector2(0.11f, 0.035f), 0.01f, 0.017f, 3, Xform.RotateY(90f));
                    }
                }

                if (!_s.PickupBed)
                {
                    Shapes.RoundedPlate(_body[Taillight], new Vector3(0f, _s.Roof - 0.025f, _s.RoofRear - 0.02f), new Vector2(0.42f, 0.03f), 0.015f, 0.0149f, 3, Xform.RotateX(-20f));
                }

                // Wipers parked at the base of the windscreen
                float wy = _s.Belt + 0.025f, wz = _s.WindshieldBase - 0.04f;
                foreach (float x in new[] { -0.32f, 0.22f })
                {
                    Shapes.Box(_body[Black], Xform.Translate(new Vector3(x, wy, wz)) * Xform.RotateY(4f) * Xform.RotateZ(3f), new Vector3(0.58f, 0.014f, 0.022f), 1f);
                }
            }

            private static float Sq(float v) => v * v;

            private static float SmoothStep(float a, float b, float x)
            {
                float t = Mathf.Clamp01((x - a) / Mathf.Max(1e-5f, b - a));
                return t * t * (3f - 2f * t);
            }
        }
    }
}
