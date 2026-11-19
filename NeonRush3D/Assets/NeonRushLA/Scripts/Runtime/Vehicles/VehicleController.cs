using System;
using UnityEngine;

namespace NeonRushLA.Vehicles
{
    /// <summary>
    /// Arcade-realistic RWD car on WheelColliders. Everything moves through the physics engine:
    /// engine torque curve vs RPM → 6-speed automatic → rear wheels; brakes with front bias and
    /// simplified ABS; traction control; handbrake that unloads rear grip for drifts;
    /// speed-sensitive steering; anti-roll bars; downforce; low centre of mass; flip recovery.
    /// Weight transfer and body roll come from the suspension itself.
    /// </summary>
    [RequireComponent(typeof(Rigidbody))]
    public sealed class VehicleController : MonoBehaviour
    {
        [Serializable]
        public sealed class Axle
        {
            public WheelCollider left;
            public WheelCollider right;
            public Transform leftVisual;
            public Transform rightVisual;
            public bool steer;
            public bool drive;
            public float antiRoll = 12000f;
        }

        [Header("Wheels")]
        [SerializeField] private Axle front = new Axle { steer = true, antiRoll = 15000f };
        [SerializeField] private Axle rear = new Axle { drive = true, antiRoll = 9000f };

        [Tooltip("Brake calipers follow the wheel position and steering but do not spin. Order FL, FR, RL, RR.")]
        [SerializeField] private Transform[] calipers = new Transform[0];

        [Header("Engine")]
        [SerializeField] private float maxTorque = 650f;
        [SerializeField] private float idleRpm = 900f;
        [SerializeField] private float redlineRpm = 6600f;
        [SerializeField] private float upshiftRpm = 6200f;
        [SerializeField] private float downshiftRpm = 2600f;
        [SerializeField] private float[] gearRatios = { 3.0f, 2.05f, 1.48f, 1.13f, 0.90f, 0.73f };
        [SerializeField] private float reverseRatio = 3.2f;
        [SerializeField] private float finalDrive = 3.45f;
        [SerializeField] private float drivetrainEfficiency = 0.85f;
        [SerializeField] private float shiftTime = 0.22f;

        [Header("Brakes")]
        [SerializeField] private float brakeTorque = 3800f;
        [SerializeField, Range(0f, 1f)] private float frontBrakeBias = 0.64f;
        [SerializeField] private float handbrakeTorque = 5000f;
        [SerializeField] private bool abs = true;
        [SerializeField] private bool tractionControl = true;

        [Header("Handling")]
        [SerializeField] private float maxSteerLowSpeed = 35f;
        [SerializeField] private float maxSteerHighSpeed = 8f;
        [SerializeField] private float steerSpeedRef = 45f;
        [SerializeField] private float steerRate = 3.2f;
        [SerializeField] private Vector3 centerOfMass = new Vector3(0f, 0.42f, 0.06f);
        [SerializeField] private float downforce = 2.6f;
        [SerializeField] private float handbrakeRearGrip = 0.62f;

        private Rigidbody _rb;
        private float _throttle, _brake, _steerInput, _steer;
        private bool _handbrake;
        private int _gear = 1;          // -1 reverse, 0 neutral, 1..n
        private float _rpm;
        private float _shiftTimer;
        private float _tcsFactor = 1f;
        private float _rearGrip = 1f;
        private float _absPhase;
        private float _flipTimer;
        private float _baseRearSideStiffness;
        private float _baseFrontSideStiffness;
        private bool _initialized;

        public event Action<int> GearChanged;
        public event Action Reset;

        public Rigidbody Body => _rb;
        public float SpeedMs => _rb != null ? _rb.velocity.magnitude : 0f;
        public float SpeedKmh => SpeedMs * 3.6f;
        public float ForwardSpeed => _rb != null ? Vector3.Dot(_rb.velocity, transform.forward) : 0f;
        public float Rpm => _rpm;
        public float Rpm01 => Mathf.InverseLerp(0f, redlineRpm, _rpm);
        public int Gear => _gear;
        public string GearLabel => _gear < 0 ? "R" : _gear == 0 ? "N" : _gear.ToString();
        public float Throttle => _throttle;
        public float SteerAngle => _steer;
        public bool Handbrake => _handbrake;
        public bool InputEnabled { get; set; } = true;

        /// <summary>Angle between velocity and heading (deg). Drift when large at speed.</summary>
        public float SlipAngle
        {
            get
            {
                Vector3 v = _rb.velocity;
                v.y = 0f;
                if (v.sqrMagnitude < 4f) return 0f;
                Vector3 f = transform.forward;
                f.y = 0f;
                return Vector3.Angle(f, v);
            }
        }

        /// <summary>Highest rear-wheel combined slip (0..~2) for tyre audio / smoke.</summary>
        public float RearSlip { get; private set; }
        public bool IsGrounded { get; private set; }

        public void SetWheels(WheelCollider fl, WheelCollider fr, WheelCollider rl, WheelCollider rr, Transform vfl, Transform vfr, Transform vrl, Transform vrr)
        {
            front.left = fl; front.right = fr; front.leftVisual = vfl; front.rightVisual = vfr;
            rear.left = rl; rear.right = rr; rear.leftVisual = vrl; rear.rightVisual = vrr;
        }

        private void Awake()
        {
            Init();
        }

        public void Init()
        {
            if (_initialized) return;
            _initialized = true;
            _rb = GetComponent<Rigidbody>();
            _rb.centerOfMass = centerOfMass;
            _rb.interpolation = RigidbodyInterpolation.Interpolate;
            _rb.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
            _rb.maxAngularVelocity = 8f;
            foreach (WheelCollider wc in Wheels())
            {
                if (wc != null) wc.ConfigureVehicleSubsteps(5f, 12, 15);
            }

            if (rear.left != null) _baseRearSideStiffness = rear.left.sidewaysFriction.stiffness;
            if (front.left != null) _baseFrontSideStiffness = front.left.sidewaysFriction.stiffness;
            _rpm = idleRpm;
        }

        private WheelCollider[] _wheelCache;

        private WheelCollider[] Wheels()
        {
            if (_wheelCache == null || _wheelCache.Length != 4 || _wheelCache[0] == null)
            {
                _wheelCache = new[] { front.left, front.right, rear.left, rear.right };
            }

            return _wheelCache;
        }

        public void SetInput(float throttle, float brake, float steer, bool handbrake)
        {
            if (!InputEnabled)
            {
                throttle = 0f;
                brake = 1f;
                steer = 0f;
                handbrake = false;
            }

            _throttle = Mathf.Clamp01(throttle);
            _brake = Mathf.Clamp01(brake);
            _steerInput = Mathf.Clamp(steer, -1f, 1f);
            _handbrake = handbrake;
        }

        private void FixedUpdate()
        {
            if (!_initialized || front.left == null) return;
            float dt = Time.fixedDeltaTime;
            float fwd = ForwardSpeed;
            float speed = SpeedMs;

            // --- Pedal logic: brake pedal reverses when (nearly) stopped, like most driving games.
            float throttle = _throttle, brake = _brake;
            if (_gear >= 0 && brake > 0.1f && throttle < 0.05f && fwd < 0.8f)
            {
                SetGear(-1);
            }
            else if (_gear < 0 && throttle > 0.1f && fwd > -0.8f)
            {
                SetGear(1);
            }

            if (_gear < 0)
            {
                // In reverse the "brake" pedal drives backwards and "throttle" brakes.
                float t = throttle;
                throttle = brake;
                brake = t;
            }

            // --- Steering: speed sensitive, rate limited.
            float maxSteer = Mathf.Lerp(maxSteerLowSpeed, maxSteerHighSpeed, Mathf.Clamp01(speed / steerSpeedRef));
            float target = _steerInput * maxSteer;
            _steer = Mathf.MoveTowards(_steer, target, maxSteerLowSpeed * steerRate * dt);
            front.left.steerAngle = _steer;
            front.right.steerAngle = _steer;

            // --- Engine RPM from driven wheels.
            float wheelRpm = (Mathf.Abs(rear.left.rpm) + Mathf.Abs(rear.right.rpm)) * 0.5f;
            float ratio = CurrentRatio();
            float engineFromWheels = wheelRpm * ratio * finalDrive;
            float launch = Mathf.Lerp(idleRpm, 3600f, throttle);
            _rpm = Mathf.Lerp(_rpm, Mathf.Clamp(Mathf.Max(engineFromWheels, speed < 3f ? launch : idleRpm), idleRpm, redlineRpm), 1f - Mathf.Exp(-12f * dt));

            // --- Automatic gearbox.
            _shiftTimer -= dt;
            if (_gear > 0 && _shiftTimer <= 0f)
            {
                if (_rpm > upshiftRpm && _gear < gearRatios.Length && throttle > 0.05f) SetGear(_gear + 1);
                else if (_rpm < (throttle > 0.7f ? downshiftRpm + 600f : downshiftRpm) && _gear > 1) SetGear(_gear - 1);
            }

            // --- Drive torque with traction control.
            float engineTorque = TorqueCurve(_rpm / redlineRpm) * maxTorque * throttle;
            if (_rpm >= redlineRpm - 50f) engineTorque *= 0.2f; // limiter
            if (_shiftTimer > 0f) engineTorque *= 0.15f;
            float wheelTorque = engineTorque * ratio * finalDrive * drivetrainEfficiency * (_gear < 0 ? -1f : 1f);

            float rearSlip = 0f;
            if (rear.left.GetGroundHit(out WheelHit hl)) rearSlip = Mathf.Max(rearSlip, Mathf.Abs(hl.forwardSlip) + Mathf.Abs(hl.sidewaysSlip) * 0.5f);
            if (rear.right.GetGroundHit(out WheelHit hr)) rearSlip = Mathf.Max(rearSlip, Mathf.Abs(hr.forwardSlip) + Mathf.Abs(hr.sidewaysSlip) * 0.5f);
            RearSlip = rearSlip;

            if (tractionControl && !_handbrake)
            {
                float fs = Mathf.Max(Mathf.Abs(hl.forwardSlip), Mathf.Abs(hr.forwardSlip));
                _tcsFactor = fs > 0.32f ? Mathf.Max(0.25f, _tcsFactor - 3f * dt) : Mathf.Min(1f, _tcsFactor + 1.5f * dt);
            }
            else
            {
                _tcsFactor = 1f;
            }

            rear.left.motorTorque = wheelTorque * 0.5f * _tcsFactor;
            rear.right.motorTorque = wheelTorque * 0.5f * _tcsFactor;
            front.left.motorTorque = 0f;
            front.right.motorTorque = 0f;

            // --- Brakes with ABS pulse.
            _absPhase += dt * 18f;
            float absMod = 1f;
            if (abs && brake > 0.1f && speed > 3f)
            {
                bool locking = WheelLocking(front.left) || WheelLocking(front.right) || WheelLocking(rear.left) || WheelLocking(rear.right);
                if (locking) absMod = Mathf.Repeat(_absPhase, 1f) < 0.5f ? 0.35f : 0.8f;
            }

            float bt = brake * brakeTorque * absMod;
            front.left.brakeTorque = bt * frontBrakeBias;
            front.right.brakeTorque = bt * frontBrakeBias;
            float rb = bt * (1f - frontBrakeBias);
            if (_handbrake) rb = Mathf.Max(rb, handbrakeTorque);
            // Gentle engine braking when coasting.
            if (throttle < 0.05f && brake < 0.05f && !_handbrake) rb = Mathf.Max(rb, 60f);
            rear.left.brakeTorque = rb;
            rear.right.brakeTorque = rb;

            // --- Handbrake unloads rear lateral grip (drift), restored smoothly.
            _rearGrip = Mathf.MoveTowards(_rearGrip, _handbrake ? handbrakeRearGrip : 1f, (_handbrake ? 4f : 1.2f) * dt);
            SetSideStiffness(rear.left, _baseRearSideStiffness * _rearGrip);
            SetSideStiffness(rear.right, _baseRearSideStiffness * _rearGrip);

            // --- Anti-roll bars.
            ApplyAntiRoll(front);
            ApplyAntiRoll(rear);

            // --- Downforce keeps it planted at speed.
            IsGrounded = front.left.isGrounded || front.right.isGrounded || rear.left.isGrounded || rear.right.isGrounded;
            if (IsGrounded) _rb.AddForce(-transform.up * downforce * speed * speed);

            // --- Flip recovery.
            if (Vector3.Dot(transform.up, Vector3.up) < 0.25f && speed < 3f)
            {
                _flipTimer += dt;
                if (_flipTimer > 2.5f) ResetVehicle();
            }
            else
            {
                _flipTimer = 0f;
            }
        }

        private void LateUpdate()
        {
            SyncVisual(front.left, front.leftVisual, 0, true);
            SyncVisual(front.right, front.rightVisual, 1, true);
            SyncVisual(rear.left, rear.leftVisual, 2, false);
            SyncVisual(rear.right, rear.rightVisual, 3, false);
        }

        public void SetCalipers(Transform[] c)
        {
            calipers = c;
        }

        private void SyncVisual(WheelCollider wc, Transform visual, int index, bool steered)
        {
            if (wc == null || visual == null) return;
            wc.GetWorldPose(out Vector3 pos, out Quaternion rot);
            visual.SetPositionAndRotation(pos, rot);
            if (calipers != null && index < calipers.Length && calipers[index] != null)
            {
                Quaternion r = transform.rotation * Quaternion.Euler(0f, steered ? _steer : 0f, 0f);
                calipers[index].SetPositionAndRotation(pos, r);
            }
        }

        private float CurrentRatio()
        {
            if (_gear < 0) return reverseRatio;
            if (_gear == 0) return 0f;
            return gearRatios[Mathf.Clamp(_gear - 1, 0, gearRatios.Length - 1)];
        }

        private void SetGear(int g)
        {
            if (g == _gear) return;
            _gear = g;
            _shiftTimer = shiftTime;
            GearChanged?.Invoke(g);
        }

        /// <summary>Normalised torque curve (rpm fraction → torque fraction): muscular mid-range.</summary>
        public static float TorqueCurve(float x)
        {
            x = Mathf.Clamp01(x);
            if (x < 0.15f) return Mathf.Lerp(0.45f, 0.62f, x / 0.15f);
            if (x < 0.35f) return Mathf.Lerp(0.62f, 0.88f, (x - 0.15f) / 0.2f);
            if (x < 0.62f) return Mathf.Lerp(0.88f, 1.0f, (x - 0.35f) / 0.27f);
            if (x < 0.86f) return Mathf.Lerp(1.0f, 0.93f, (x - 0.62f) / 0.24f);
            return Mathf.Lerp(0.93f, 0.76f, (x - 0.86f) / 0.14f);
        }

        private static bool WheelLocking(WheelCollider wc)
        {
            return wc.GetGroundHit(out WheelHit h) && h.forwardSlip < -0.3f;
        }

        private static void SetSideStiffness(WheelCollider wc, float stiffness)
        {
            WheelFrictionCurve f = wc.sidewaysFriction;
            if (Mathf.Abs(f.stiffness - stiffness) < 0.001f) return;
            f.stiffness = stiffness;
            wc.sidewaysFriction = f;
        }

        private void ApplyAntiRoll(Axle axle)
        {
            float travelL = 1f, travelR = 1f;
            bool gl = axle.left.GetGroundHit(out WheelHit hl);
            bool gr = axle.right.GetGroundHit(out WheelHit hr);
            if (gl) travelL = (-axle.left.transform.InverseTransformPoint(hl.point).y - axle.left.radius) / axle.left.suspensionDistance;
            if (gr) travelR = (-axle.right.transform.InverseTransformPoint(hr.point).y - axle.right.radius) / axle.right.suspensionDistance;
            float force = (travelL - travelR) * axle.antiRoll;
            if (gl) _rb.AddForceAtPosition(axle.left.transform.up * -force, axle.left.transform.position);
            if (gr) _rb.AddForceAtPosition(axle.right.transform.up * force, axle.right.transform.position);
        }

        /// <summary>Puts the car back on its wheels at the same spot (or a given pose).</summary>
        public void ResetVehicle()
        {
            Vector3 p = transform.position;
            float yaw = transform.eulerAngles.y;
            ResetTo(new Vector3(p.x, Mathf.Max(p.y, 0f) + 1.2f, p.z), Quaternion.Euler(0f, yaw, 0f));
        }

        public void ResetTo(Vector3 position, Quaternion rotation)
        {
            _rb.velocity = Vector3.zero;
            _rb.angularVelocity = Vector3.zero;
            _rb.position = position;
            _rb.rotation = rotation;
            transform.SetPositionAndRotation(position, rotation);
            _flipTimer = 0f;
            _steer = 0f;
            SetGear(1);
            foreach (WheelCollider wc in Wheels())
            {
                if (wc == null) continue;
                wc.motorTorque = 0f;
                wc.brakeTorque = 0f;
            }

            Reset?.Invoke();
        }
    }
}
