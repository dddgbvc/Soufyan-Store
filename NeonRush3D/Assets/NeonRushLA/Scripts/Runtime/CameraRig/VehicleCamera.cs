using NeonRushLA.Vehicles;
using UnityEngine;

namespace NeonRushLA.CameraRig
{
    public enum CameraMode
    {
        Chase = 0,
        Hood = 1,
        Cinematic = 2
    }

    /// <summary>
    /// Three camera modes: third-person chase (lagging yaw, speed FOV, wall avoidance),
    /// hood camera, and an automatic cinematic director. Impact shake on top.
    /// </summary>
    public sealed class VehicleCamera : MonoBehaviour
    {
        [SerializeField] private VehicleController target;
        [SerializeField] private Camera cam;
        [SerializeField] private float distance = 6.4f;
        [SerializeField] private float height = 2.1f;
        [SerializeField] private float lookHeight = 1.1f;
        [SerializeField] private float yawSharpness = 4.5f;
        [SerializeField] private float posSharpness = 12f;

        private CameraMode _mode = CameraMode.Chase;
        private float _yaw;
        private Vector3 _pos;
        private float _shake;
        private float _cineTimer;
        private int _cineShot;
        private int _avoidMask;

        public CameraMode Mode => _mode;
        public Camera Camera => cam;

        public void Configure(VehicleController v, Camera c)
        {
            target = v;
            cam = c;
        }

        private void Awake()
        {
            _avoidMask = LALayers.Mask(LALayers.Environment, LALayers.Ground);
        }

        public void SetMode(CameraMode m)
        {
            _mode = m;
            _cineTimer = 0f;
            if (cam != null) cam.nearClipPlane = m == CameraMode.Hood ? 0.08f : 0.25f;
            Snap();
        }

        public void Cycle()
        {
            SetMode((CameraMode)(((int)_mode + 1) % 3));
        }

        public void Shake(float amount)
        {
            _shake = Mathf.Max(_shake, Mathf.Clamp01(amount));
        }

        public void Snap()
        {
            if (target == null) return;
            _yaw = target.transform.eulerAngles.y;
            _pos = DesiredChase(_yaw);
            LateUpdate();
        }

        private Vector3 DesiredChase(float yaw)
        {
            Quaternion q = Quaternion.Euler(0f, yaw, 0f);
            return target.transform.position + q * new Vector3(0f, height, -distance);
        }

        private void LateUpdate()
        {
            if (target == null || cam == null) return;
            float dt = Time.deltaTime;
            Transform t = target.transform;
            float speed = target.SpeedMs;

            switch (_mode)
            {
                case CameraMode.Hood:
                {
                    Vector3 p = t.TransformPoint(new Vector3(0f, 1.18f, 0.35f));
                    transform.SetPositionAndRotation(p, Quaternion.LookRotation(t.forward, t.up));
                    break;
                }

                case CameraMode.Cinematic:
                    Cinematic(dt, t);
                    break;

                default:
                {
                    // Follow the travel direction when moving forward (drift-friendly), else the nose.
                    Vector3 v = target.Body != null ? target.Body.velocity : Vector3.zero;
                    v.y = 0f;
                    float targetYaw = t.eulerAngles.y;
                    if (v.magnitude > 4f && Vector3.Dot(v, t.forward) > 0f)
                    {
                        float velYaw = Mathf.Atan2(v.x, v.z) * Mathf.Rad2Deg;
                        targetYaw = Mathf.LerpAngle(targetYaw, velYaw, 0.45f);
                    }

                    _yaw = Mathf.LerpAngle(_yaw, targetYaw, 1f - Mathf.Exp(-yawSharpness * dt));
                    Vector3 desired = DesiredChase(_yaw);
                    _pos = Vector3.Lerp(_pos, desired, 1f - Mathf.Exp(-posSharpness * dt));
                    Vector3 pivot = t.position + Vector3.up * lookHeight;
                    Vector3 dir = _pos - pivot;
                    float len = dir.magnitude;
                    Vector3 camPos = _pos;
                    if (len > 0.1f && Physics.SphereCast(pivot, 0.3f, dir / len, out RaycastHit hit, len, _avoidMask, QueryTriggerInteraction.Ignore))
                    {
                        camPos = pivot + dir / len * Mathf.Max(1.2f, hit.distance - 0.2f);
                    }

                    transform.SetPositionAndRotation(camPos, Quaternion.LookRotation(pivot + t.forward * 2f - camPos));
                    break;
                }
            }

            float fov = Mathf.Lerp(58f, 74f, Mathf.Clamp01(speed / 55f));
            if (_mode == CameraMode.Hood) fov += 6f;
            cam.fieldOfView = Mathf.Lerp(cam.fieldOfView, fov, 1f - Mathf.Exp(-3f * dt));

            if (_shake > 0f)
            {
                float s = _shake * 0.35f;
                float tt = Time.unscaledTime * 32f;
                transform.position += transform.right * ((Mathf.PerlinNoise(tt, 0.3f) - 0.5f) * 2f * s) + transform.up * ((Mathf.PerlinNoise(0.7f, tt) - 0.5f) * 2f * s);
                _shake = Mathf.Max(0f, _shake - dt * 2.2f);
            }
        }

        private void Cinematic(float dt, Transform t)
        {
            _cineTimer -= dt;
            if (_cineTimer <= 0f)
            {
                _cineTimer = 6f;
                _cineShot = (_cineShot + 1) % 4;
            }

            Vector3 local;
            switch (_cineShot)
            {
                case 0: local = new Vector3(3.2f, 0.7f, 5.5f); break;   // low front three-quarter
                case 1: local = new Vector3(-5.5f, 1.2f, 0.5f); break;  // side tracking
                case 2: local = new Vector3(0f, 6f, -10f); break;       // high chase
                default: local = new Vector3(1.6f, 0.35f, -2.2f); break; // rear wheel close-up
            }

            Vector3 desired = t.TransformPoint(local);
            transform.position = Vector3.Lerp(transform.position, desired, 1f - Mathf.Exp(-3f * dt));
            Vector3 look = t.position + Vector3.up * 0.8f + t.forward * (_cineShot == 0 ? 0.5f : 1.5f);
            transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(look - transform.position), 1f - Mathf.Exp(-6f * dt));
        }
    }
}
