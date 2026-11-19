using UnityEngine;

namespace NeonRushLA.Vehicles
{
    public enum CarKind
    {
        VortexGT = 0,
        Sedan = 1,
        SUV = 2,
        Pickup = 3,
        Taxi = 4,
        Sports = 5
    }

    /// <summary>
    /// Dimensions and styling of a procedurally generated car (metres; origin on the ground,
    /// midway between the axles; +Z forward, +X right).
    /// </summary>
    public sealed class CarSpec
    {
        public CarKind Kind;
        public string Name;

        // Package
        public float WheelBase = 3.05f;
        public float FrontOverhang = 0.98f;
        public float RearOverhang = 1.02f;
        public float HalfWidth = 0.96f;
        public float Track = 1.62f;
        public float WheelRadius = 0.36f;
        public float RimRadius = 0.254f;
        public float TireWidth = 0.255f;
        public float ArchRadius = 0.43f;

        // Side profile heights
        public float Sill = 0.27f;
        public float Belt = 0.99f;
        public float NoseTop = 0.74f;
        public float TailTop = 0.86f;
        public float Roof = 1.45f;
        public float HoodBulge = 0.035f;
        public float Ducktail = 0.025f;

        // Greenhouse stations (z)
        public float WindshieldBase = 0.55f;
        public float RoofFront = -0.05f;
        public float RoofRear = -0.92f;
        public float RearWindowBase = -1.42f;
        public float BPillar = -0.30f;
        public float CPillarStart = -0.98f;
        public float GreenhouseBaseInset = 0.92f;
        public float GreenhouseTopInset = 0.73f;

        // Style
        public bool RacetrackTaillight = true;
        public bool FullWidthDrl = true;
        public bool HoodVents = true;
        public bool DualExhaust = true;
        public bool RearWing;
        public bool PickupBed;
        public float PickupCabRear = -0.75f;
        public bool TaxiSign;
        public Color PaintColor = new Color(0.02f, 0.02f, 0.025f);
        public string Plate = "NEON 2.0";

        public float FrontAxleZ => WheelBase * 0.5f;
        public float RearAxleZ => -WheelBase * 0.5f;
        public float FrontZ => FrontAxleZ + FrontOverhang;
        public float RearZ => RearAxleZ - RearOverhang;
        public float Length => FrontZ - RearZ;

        public Vector3 WheelCenter(int index)
        {
            // 0 FL, 1 FR, 2 RL, 3 RR
            float x = (index % 2 == 0 ? -1f : 1f) * Track * 0.5f;
            float z = index < 2 ? FrontAxleZ : RearAxleZ;
            return new Vector3(x, WheelRadius, z);
        }

        public static CarSpec Create(CarKind kind)
        {
            switch (kind)
            {
                case CarKind.Sedan:
                    return new CarSpec
                    {
                        Kind = kind, Name = "Sedan", WheelBase = 2.82f, FrontOverhang = 0.95f, RearOverhang = 1.05f, HalfWidth = 0.91f, Track = 1.56f,
                        WheelRadius = 0.33f, RimRadius = 0.22f, TireWidth = 0.225f, ArchRadius = 0.40f, Sill = 0.28f, Belt = 0.95f, NoseTop = 0.76f,
                        TailTop = 0.86f, Roof = 1.46f, HoodBulge = 0.0f, Ducktail = 0.012f, WindshieldBase = 0.62f, RoofFront = 0.02f, RoofRear = -0.78f,
                        RearWindowBase = -1.30f, BPillar = -0.22f, CPillarStart = -0.86f, RacetrackTaillight = false, FullWidthDrl = false, HoodVents = false,
                        DualExhaust = false, PaintColor = new Color(0.55f, 0.57f, 0.6f), Plate = "7LAX 214",
                    };
                case CarKind.SUV:
                    return new CarSpec
                    {
                        Kind = kind, Name = "SUV", WheelBase = 2.95f, FrontOverhang = 0.92f, RearOverhang = 0.98f, HalfWidth = 0.98f, Track = 1.68f,
                        WheelRadius = 0.39f, RimRadius = 0.24f, TireWidth = 0.255f, ArchRadius = 0.46f, Sill = 0.42f, Belt = 1.14f, NoseTop = 0.98f,
                        TailTop = 1.08f, Roof = 1.82f, HoodBulge = 0.02f, Ducktail = 0f, WindshieldBase = 0.70f, RoofFront = 0.08f, RoofRear = -1.78f,
                        RearWindowBase = -2.20f, BPillar = -0.25f, CPillarStart = -1.30f, GreenhouseBaseInset = 0.94f, GreenhouseTopInset = 0.84f,
                        RacetrackTaillight = false, FullWidthDrl = false, HoodVents = false, DualExhaust = false,
                        PaintColor = new Color(0.08f, 0.18f, 0.32f), Plate = "8SUV 553",
                    };
                case CarKind.Pickup:
                    return new CarSpec
                    {
                        Kind = kind, Name = "Pickup", WheelBase = 3.55f, FrontOverhang = 0.98f, RearOverhang = 1.20f, HalfWidth = 1.0f, Track = 1.72f,
                        WheelRadius = 0.40f, RimRadius = 0.25f, TireWidth = 0.27f, ArchRadius = 0.48f, Sill = 0.48f, Belt = 1.22f, NoseTop = 1.10f,
                        TailTop = 1.20f, Roof = 1.90f, HoodBulge = 0.03f, Ducktail = 0f, WindshieldBase = 0.98f, RoofFront = 0.42f, RoofRear = -0.55f,
                        RearWindowBase = -0.68f, BPillar = -0.05f, CPillarStart = -0.62f, GreenhouseBaseInset = 0.93f, GreenhouseTopInset = 0.85f,
                        RacetrackTaillight = false, FullWidthDrl = false, HoodVents = false, DualExhaust = false, PickupBed = true, PickupCabRear = -0.78f,
                        PaintColor = new Color(0.55f, 0.08f, 0.06f), Plate = "4TRK 778",
                    };
                case CarKind.Taxi:
                {
                    CarSpec s = Create(CarKind.Sedan);
                    s.Kind = kind;
                    s.Name = "Taxi";
                    s.TaxiSign = true;
                    s.PaintColor = new Color(0.95f, 0.68f, 0.05f);
                    s.Plate = "TAXI 901";
                    return s;
                }
                case CarKind.Sports:
                    return new CarSpec
                    {
                        Kind = kind, Name = "Sports", WheelBase = 2.62f, FrontOverhang = 1.02f, RearOverhang = 0.88f, HalfWidth = 0.97f, Track = 1.64f,
                        WheelRadius = 0.345f, RimRadius = 0.25f, TireWidth = 0.28f, ArchRadius = 0.41f, Sill = 0.22f, Belt = 0.86f, NoseTop = 0.58f,
                        TailTop = 0.86f, Roof = 1.22f, HoodBulge = 0.02f, Ducktail = 0.03f, WindshieldBase = 0.60f, RoofFront = -0.12f, RoofRear = -0.62f,
                        RearWindowBase = -1.45f, BPillar = -0.35f, CPillarStart = -0.70f, GreenhouseBaseInset = 0.88f, GreenhouseTopInset = 0.66f,
                        RacetrackTaillight = true, FullWidthDrl = true, HoodVents = true, DualExhaust = true, RearWing = true,
                        PaintColor = new Color(0.85f, 0.25f, 0.02f), Plate = "FAST 007",
                    };
                default:
                    // VORTEX GT: long flat hood, blunt face, raked windscreen, semi-fastback roof, 21" wheels.
                    return new CarSpec
                    {
                        Kind = CarKind.VortexGT, Name = "VORTEX GT", WheelBase = 3.05f, FrontOverhang = 0.98f, RearOverhang = 1.0f, HalfWidth = 0.965f,
                        Track = 1.64f, WheelRadius = 0.37f, RimRadius = 0.272f, TireWidth = 0.265f, ArchRadius = 0.44f, Sill = 0.25f, Belt = 0.97f,
                        NoseTop = 0.80f, TailTop = 0.88f, Roof = 1.41f, HoodBulge = 0.03f, Ducktail = 0.03f, WindshieldBase = 0.66f, RoofFront = -0.16f,
                        RoofRear = -0.74f, RearWindowBase = -1.64f, BPillar = -0.36f, CPillarStart = -1.02f, GreenhouseBaseInset = 0.92f,
                        GreenhouseTopInset = 0.70f,
                    };
            }
        }
    }
}
