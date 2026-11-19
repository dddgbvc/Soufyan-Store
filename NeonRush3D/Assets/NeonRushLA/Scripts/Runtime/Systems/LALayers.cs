using UnityEngine;

namespace NeonRushLA
{
    /// <summary>Physics layers (names are written to the TagManager by the editor builder).</summary>
    public static class LALayers
    {
        public const int Vehicle = 8;
        public const int Traffic = 9;
        public const int Pedestrian = 10;
        public const int Ragdoll = 11;
        public const int Environment = 12;
        public const int Ground = 13;
        public const int Trigger = 14;

        public static readonly string[] Names =
        {
            "Vehicle", "Traffic", "Pedestrian", "Ragdoll", "Environment", "Ground", "LATrigger"
        };

        public static int Mask(params int[] layers)
        {
            int m = 0;
            for (int i = 0; i < layers.Length; i++) m |= 1 << layers[i];
            return m;
        }

        /// <summary>Collision matrix: pedestrians are triggers that only care about vehicles; ragdolls ignore triggers.</summary>
        public static void ConfigureCollisionMatrix()
        {
            for (int i = 0; i < 32; i++)
            {
                Physics.IgnoreLayerCollision(Pedestrian, i, true);
                Physics.IgnoreLayerCollision(Trigger, i, true);
            }

            Physics.IgnoreLayerCollision(Pedestrian, Vehicle, false);
            Physics.IgnoreLayerCollision(Pedestrian, Traffic, false);
            Physics.IgnoreLayerCollision(Trigger, Vehicle, false);
            Physics.IgnoreLayerCollision(Ragdoll, Ragdoll, true);
            Physics.IgnoreLayerCollision(Ragdoll, Vehicle, false);
            Physics.IgnoreLayerCollision(Ragdoll, Ground, false);
            Physics.IgnoreLayerCollision(Ragdoll, Environment, false);
        }
    }
}
