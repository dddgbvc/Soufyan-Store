using UnityEngine;

namespace NeonRush
{
    /// <summary>
    /// Pure frame-rate decisions, kept separate from MonoBehaviours so they are unit-testable.
    /// The target never exceeds what the display can actually show.
    /// </summary>
    public static class FrameRatePolicy
    {
        public const int MinTarget = 30;
        public const int MaxTarget = 120;

        /// <param name="displayHz">Refresh rate reported by the display (0 or less = unknown).</param>
        /// <param name="lowPowerMode">iOS Low Power Mode caps the display at 60 Hz.</param>
        /// <param name="thermalState">0 nominal, 1 fair, 2 serious, 3 critical (NSProcessInfoThermalState).</param>
        public static int ComputeTarget(float displayHz, bool lowPowerMode, int thermalState)
        {
            int hz = displayHz > 1f ? Mathf.RoundToInt(displayHz) : 60;
            int target = Mathf.Clamp(hz, MinTarget, MaxTarget);

            if (lowPowerMode)
            {
                target = Mathf.Min(target, 60);
            }

            if (thermalState >= 3)
            {
                target = Mathf.Min(target, 60);
            }

            return target;
        }

        /// <summary>Resolution multiplier applied on top of the quality tier to shed GPU heat.</summary>
        public static float ThermalScale(int thermalState)
        {
            switch (thermalState)
            {
                case 2: return 0.85f;
                case 3: return 0.7f;
                default: return 1f;
            }
        }

        /// <summary>Post-processing (bloom) is dropped first when the device runs hot.</summary>
        public static bool AllowPostProcessing(int thermalState)
        {
            return thermalState < 2;
        }

        public static float TargetFrameMs(int targetFps)
        {
            return 1000f / Mathf.Max(1, targetFps);
        }
    }
}
