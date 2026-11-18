using UnityEngine;

namespace NeonRush
{
    /// <summary>
    /// Third-person chase camera. Forward axis is locked to the car (no lag = no jitter at
    /// 120 Hz); lateral motion is smoothed. FOV widens with speed for a sense of velocity.
    /// </summary>
    [RequireComponent(typeof(Camera))]
    public sealed class CameraController : MonoBehaviour
    {
        [SerializeField] private PlayerController target;
        [SerializeField] private Camera cam;
        [SerializeField] private Vector3 offset = new Vector3(0f, 3.3f, -7.4f);
        [SerializeField] private float lookAhead = 12f;
        [SerializeField] private float lookHeight = 0.9f;
        [SerializeField, Range(0f, 1f)] private float lateralFollow = 0.8f;
        [SerializeField] private float lateralSharpness = 8f;
        [SerializeField] private float baseFov = 60f;
        [SerializeField] private float maxFov = 73f;
        [SerializeField] private float fovSharpness = 3f;
        [SerializeField] private float shakeDecay = 2.4f;
        [SerializeField] private float shakeStrength = 0.35f;

        [Header("Speed feel")]
        [SerializeField] private ParticleSystem speedLines;
        [SerializeField] private float maxSpeedLineRate = 90f;
        [Tooltip("Distant skyline that travels with the camera (parallax backdrop).")]
        [SerializeField] private Transform skyline;
        [SerializeField] private float skylineDistance = 175f;

        private float _x;
        private float _speed01;
        private float _shake;

        public Camera Camera => cam;

        public void SetSpeed01(float value)
        {
            _speed01 = Mathf.Clamp01(value);
            if (speedLines != null)
            {
                ParticleSystem.EmissionModule emission = speedLines.emission;
                emission.rateOverTimeMultiplier = maxSpeedLineRate * Mathf.Clamp01((_speed01 - 0.3f) / 0.7f);
            }
        }

        public void Shake(float amount)
        {
            _shake = Mathf.Max(_shake, amount);
        }

        public void Snap()
        {
            if (target == null)
            {
                return;
            }

            _x = target.Position.x * lateralFollow;
            _shake = 0f;
            Apply(0f);
            if (cam != null)
            {
                cam.fieldOfView = Mathf.Lerp(baseFov, maxFov, _speed01);
            }
        }

        private void LateUpdate()
        {
            if (target == null)
            {
                return;
            }

            float dt = Time.deltaTime;
            _x = Mathf.Lerp(_x, target.Position.x * lateralFollow, 1f - Mathf.Exp(-lateralSharpness * dt));
            Apply(dt);

            if (cam != null)
            {
                float fov = Mathf.Lerp(baseFov, maxFov, _speed01);
                cam.fieldOfView = Mathf.Lerp(cam.fieldOfView, fov, 1f - Mathf.Exp(-fovSharpness * dt));
            }
        }

        private void Apply(float dt)
        {
            float tz = target.Position.z;
            Vector3 pos = new Vector3(_x + offset.x, offset.y, tz + offset.z);

            if (_shake > 0f)
            {
                float t = Time.unscaledTime * 31f;
                float s = _shake * shakeStrength;
                pos.x += (Mathf.PerlinNoise(t, 0.1f) - 0.5f) * 2f * s;
                pos.y += (Mathf.PerlinNoise(0.4f, t) - 0.5f) * 2f * s;
                _shake = Mathf.Max(0f, _shake - shakeDecay * dt);
            }

            Vector3 look = new Vector3(_x * 0.6f, lookHeight, tz + lookAhead);
            transform.SetPositionAndRotation(pos, Quaternion.LookRotation(look - pos, Vector3.up));

            if (skyline != null)
            {
                skyline.position = new Vector3(0f, 0f, tz + skylineDistance);
            }
        }
    }
}
