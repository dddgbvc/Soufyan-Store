using UnityEngine;

namespace NeonRushLA.Vehicles
{
    /// <summary>On-screen control state written by the touch buttons (multi-touch safe).</summary>
    public static class TouchControls
    {
        public static bool Gas, Brake, Left, Right, Handbrake;

        public static void Clear()
        {
            Gas = Brake = Left = Right = Handbrake = false;
        }
    }

    /// <summary>Feeds keyboard (desktop testing) + touch buttons (iPhone) into the vehicle.</summary>
    public sealed class VehicleInput : MonoBehaviour
    {
        [SerializeField] private VehicleController vehicle;
        [SerializeField] private float steerAttack = 6f;
        [SerializeField] private float steerRelease = 8f;

        private float _steer;

        /// <summary>Test / AI override. When set, keyboard and touch are ignored.</summary>
        public bool Override { get; set; }
        public float OverrideThrottle { get; set; }
        public float OverrideBrake { get; set; }
        public float OverrideSteer { get; set; }
        public bool OverrideHandbrake { get; set; }

        public void Configure(VehicleController v)
        {
            vehicle = v;
        }

        private void Update()
        {
            if (vehicle == null) return;
            if (Override)
            {
                vehicle.SetInput(OverrideThrottle, OverrideBrake, OverrideSteer, OverrideHandbrake);
                return;
            }

            bool gas = TouchControls.Gas || Input.GetKey(KeyCode.W) || Input.GetKey(KeyCode.UpArrow);
            bool brake = TouchControls.Brake || Input.GetKey(KeyCode.S) || Input.GetKey(KeyCode.DownArrow);
            bool left = TouchControls.Left || Input.GetKey(KeyCode.A) || Input.GetKey(KeyCode.LeftArrow);
            bool right = TouchControls.Right || Input.GetKey(KeyCode.D) || Input.GetKey(KeyCode.RightArrow);
            bool hand = TouchControls.Handbrake || Input.GetKey(KeyCode.Space);

            float target = (right ? 1f : 0f) - (left ? 1f : 0f);
            float rate = Mathf.Abs(target) > Mathf.Abs(_steer) ? steerAttack : steerRelease;
            _steer = Mathf.MoveTowards(_steer, target, rate * Time.deltaTime);
            vehicle.SetInput(gas ? 1f : 0f, brake ? 1f : 0f, _steer, hand);
        }
    }
}
