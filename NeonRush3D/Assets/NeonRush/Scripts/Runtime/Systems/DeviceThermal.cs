#if UNITY_IOS && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif

namespace NeonRush
{
    /// <summary>
    /// Bridge to iOS NSProcessInfo / UIScreen (Plugins/iOS/NeonRushDevice.mm).
    /// Other platforms report nominal values.
    /// </summary>
    public static class DeviceThermal
    {
#if UNITY_IOS && !UNITY_EDITOR
        [DllImport("__Internal")] private static extern int NR_GetThermalState();
        [DllImport("__Internal")] private static extern int NR_IsLowPowerMode();
        [DllImport("__Internal")] private static extern int NR_GetMaxFramesPerSecond();

        public static int ThermalState => NR_GetThermalState();
        public static bool LowPowerMode => NR_IsLowPowerMode() != 0;
        public static int MaxFramesPerSecond => NR_GetMaxFramesPerSecond();
#else
        /// <summary>Overridable in the Editor/tests to simulate a hot device.</summary>
        public static int SimulatedThermalState;
        public static bool SimulatedLowPowerMode;

        public static int ThermalState => SimulatedThermalState;
        public static bool LowPowerMode => SimulatedLowPowerMode;
        public static int MaxFramesPerSecond => 0;
#endif

        public static string ThermalName(int state)
        {
            switch (state)
            {
                case 1: return "FAIR";
                case 2: return "SERIOUS";
                case 3: return "CRITICAL";
                default: return "NOMINAL";
            }
        }
    }
}
