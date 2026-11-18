using System;
using UnityEngine;
using UnityEngine.EventSystems;

namespace NeonRush
{
    /// <summary>
    /// Drives the car: forward motion (fed by GameManager), lane switching, tilt, wheel spin,
    /// crash shake, and keyboard / touch / mouse input. The root never rotates; only the
    /// visual child tilts, so the hitbox stays axis-aligned and stable.
    /// </summary>
    public sealed class PlayerController : MonoBehaviour
    {
        public const int LaneCount = 3;

        [Header("Rig")]
        [SerializeField] private Transform visual;
        [SerializeField] private Transform[] wheels = new Transform[0];

        [Header("Lanes")]
        [SerializeField] private float laneWidth = 2.6f;
        [Tooltip("Higher = snappier lane change. Framerate independent.")]
        [SerializeField] private float laneSharpness = 18f;

        [Header("Feel")]
        [SerializeField] private float maxRoll = 9f;
        [SerializeField] private float maxYaw = 7f;
        [SerializeField] private float tiltSharpness = 14f;
        [SerializeField] private float wheelRadius = 0.36f;
        [SerializeField] private float crashShakeDuration = 0.45f;
        [SerializeField] private float crashShakeAmplitude = 0.12f;

        [Header("Hitbox (local to root)")]
        [SerializeField] private Vector3 hitboxCenter = new Vector3(0f, 0.55f, 0f);
        [SerializeField] private Vector3 hitboxHalfExtents = new Vector3(0.78f, 0.5f, 1.6f);

        [Header("Touch")]
        [Tooltip("Swipe distance in millimetres (converted with Screen.dpi).")]
        [SerializeField] private float swipeMillimetres = 4f;
        [SerializeField] private bool tapToSteer = true;
        [SerializeField] private float maxTapSeconds = 0.25f;

        private int _lane = 1;
        private float _x;
        private float _roll;
        private float _yaw;
        private float _wheelAngle;
        private float _shakeTime;
        private Vector3 _visualBaseLocalPos;
        private Quaternion _visualBaseLocalRot;

        // Touch tracking (no allocations).
        private int _touchId = -1;
        private Vector2 _touchStart;
        private float _touchStartTime;
        private bool _touchConsumed;
        private bool _touchOverUi;
        private bool _mouseTracking;

        public event Action<int> LaneChanged;

        public int Lane => _lane;
        public float LaneWidth => laneWidth;
        public Vector3 HitboxCenter => hitboxCenter;
        public Vector3 HitboxHalfExtents => hitboxHalfExtents;
        public Vector3 Position => transform.position;
        public bool IsCrashing => _shakeTime > 0f;

        public static float LaneToX(int lane, float width)
        {
            return (lane - (LaneCount - 1) * 0.5f) * width;
        }

        public float LaneX(int lane)
        {
            return LaneToX(lane, laneWidth);
        }

        private void Awake()
        {
            if (visual != null)
            {
                _visualBaseLocalPos = visual.localPosition;
                _visualBaseLocalRot = visual.localRotation;
            }
        }

        public void ResetPlayer()
        {
            _lane = 1;
            _x = LaneX(_lane);
            _roll = 0f;
            _yaw = 0f;
            _shakeTime = 0f;
            _touchId = -1;
            _mouseTracking = false;
            transform.position = new Vector3(_x, 0f, 0f);
            if (visual != null)
            {
                visual.localPosition = _visualBaseLocalPos;
                visual.localRotation = _visualBaseLocalRot;
            }
        }

        /// <summary>Moves one lane left (-1) or right (+1). Returns true if the lane changed.</summary>
        public bool RequestLane(int direction)
        {
            int next = Mathf.Clamp(_lane + (direction < 0 ? -1 : 1), 0, LaneCount - 1);
            if (next == _lane)
            {
                return false;
            }

            _lane = next;
            LaneChanged?.Invoke(_lane);
            return true;
        }

        public void SetLaneImmediate(int lane)
        {
            _lane = Mathf.Clamp(lane, 0, LaneCount - 1);
            _x = LaneX(_lane);
            Vector3 p = transform.position;
            transform.position = new Vector3(_x, p.y, p.z);
        }

        /// <summary>Advances the car. Called once per frame by GameManager.</summary>
        public void Tick(float dt, float forwardSpeed)
        {
            if (dt <= 0f)
            {
                return;
            }

            float targetX = LaneX(_lane);
            float prevX = _x;
            _x = Mathf.Lerp(_x, targetX, 1f - Mathf.Exp(-laneSharpness * dt));
            if (Mathf.Abs(_x - targetX) < 0.0005f)
            {
                _x = targetX;
            }

            Vector3 p = transform.position;
            transform.position = new Vector3(_x, p.y, p.z + forwardSpeed * dt);

            // Tilt proportional to lateral velocity.
            float lateralVelocity = (_x - prevX) / dt;
            float norm = Mathf.Clamp(lateralVelocity / (laneWidth * laneSharpness * 0.5f), -1f, 1f);
            float k = 1f - Mathf.Exp(-tiltSharpness * dt);
            _roll = Mathf.Lerp(_roll, -norm * maxRoll, k);
            _yaw = Mathf.Lerp(_yaw, norm * maxYaw, k);

            _wheelAngle += forwardSpeed / Mathf.Max(0.05f, wheelRadius) * Mathf.Rad2Deg * dt;
            _wheelAngle %= 360f;

            UpdateVisual(dt);
        }

        private void UpdateVisual(float dt)
        {
            if (visual == null)
            {
                return;
            }

            Vector3 shake = Vector3.zero;
            if (_shakeTime > 0f)
            {
                _shakeTime = Mathf.Max(0f, _shakeTime - dt);
                float a = crashShakeAmplitude * (_shakeTime / crashShakeDuration);
                float t = Time.time * 47f;
                shake = new Vector3(Mathf.PerlinNoise(t, 0.3f) - 0.5f, Mathf.PerlinNoise(0.7f, t) - 0.5f, 0f) * (2f * a);
            }

            visual.localPosition = _visualBaseLocalPos + shake;
            visual.localRotation = _visualBaseLocalRot * Quaternion.Euler(0f, _yaw, _roll);

            Quaternion spin = Quaternion.Euler(_wheelAngle, 0f, 0f);
            for (int i = 0; i < wheels.Length; i++)
            {
                if (wheels[i] != null)
                {
                    wheels[i].localRotation = spin;
                }
            }
        }

        /// <summary>Visual-only update while the car is stopped (game over shake).</summary>
        public void TickVisualOnly(float dt)
        {
            UpdateVisual(dt);
        }

        public void PlayCrash()
        {
            _shakeTime = crashShakeDuration;
            _touchId = -1;
            _mouseTracking = false;
        }

        public void ShiftWorld(float dz)
        {
            Vector3 p = transform.position;
            transform.position = new Vector3(p.x, p.y, p.z + dz);
        }

        // ------------------------------------------------------------------ input

        /// <summary>Polls keyboard, touch and mouse. Called by GameManager only while playing.</summary>
        public void ReadInput()
        {
            if (Input.GetKeyDown(KeyCode.LeftArrow) || Input.GetKeyDown(KeyCode.A))
            {
                RequestLane(-1);
            }

            if (Input.GetKeyDown(KeyCode.RightArrow) || Input.GetKeyDown(KeyCode.D))
            {
                RequestLane(1);
            }

            if (Input.touchCount > 0)
            {
                ReadTouches();
            }
            else if (!Input.touchSupported)
            {
                ReadMouse();
            }
        }

        private float SwipeThresholdPixels()
        {
            float dpi = Screen.dpi;
            if (dpi > 10f)
            {
                return swipeMillimetres / 25.4f * dpi;
            }

            return Mathf.Max(20f, Screen.width * 0.035f);
        }

        private void ReadTouches()
        {
            float threshold = SwipeThresholdPixels();
            int count = Input.touchCount;
            for (int i = 0; i < count; i++)
            {
                Touch t = Input.GetTouch(i);
                if (t.phase == TouchPhase.Began)
                {
                    if (_touchId == -1)
                    {
                        BeginGesture(t.fingerId, t.position, IsOverUi(t.fingerId));
                    }

                    continue;
                }

                if (t.fingerId != _touchId)
                {
                    continue;
                }

                bool ended = t.phase == TouchPhase.Ended || t.phase == TouchPhase.Canceled;
                UpdateGesture(t.position, threshold, ended && t.phase == TouchPhase.Ended);
                if (ended)
                {
                    _touchId = -1;
                }
            }
        }

        private void ReadMouse()
        {
            if (Input.GetMouseButtonDown(0))
            {
                _mouseTracking = true;
                BeginGesture(0, Input.mousePosition, IsOverUi(-1));
            }
            else if (_mouseTracking)
            {
                bool released = Input.GetMouseButtonUp(0);
                UpdateGesture(Input.mousePosition, SwipeThresholdPixels(), released);
                if (released)
                {
                    _mouseTracking = false;
                    _touchId = -1;
                }
            }
        }

        private void BeginGesture(int id, Vector2 position, bool overUi)
        {
            _touchId = id;
            _touchStart = position;
            _touchStartTime = Time.unscaledTime;
            _touchConsumed = false;
            _touchOverUi = overUi;
        }

        private void UpdateGesture(Vector2 position, float threshold, bool released)
        {
            if (_touchConsumed || _touchOverUi)
            {
                return;
            }

            Vector2 delta = position - _touchStart;
            // Swipes fire as soon as the threshold is crossed (no waiting for finger lift).
            if (Mathf.Abs(delta.x) >= threshold && Mathf.Abs(delta.x) > Mathf.Abs(delta.y))
            {
                RequestLane(delta.x > 0f ? 1 : -1);
                _touchConsumed = true;
                return;
            }

            if (released && tapToSteer && delta.sqrMagnitude < threshold * threshold &&
                Time.unscaledTime - _touchStartTime <= maxTapSeconds)
            {
                RequestLane(_touchStart.x >= Screen.width * 0.5f ? 1 : -1);
                _touchConsumed = true;
            }
        }

        private static bool IsOverUi(int pointerId)
        {
            EventSystem es = EventSystem.current;
            if (es == null)
            {
                return false;
            }

            return pointerId >= 0 ? es.IsPointerOverGameObject(pointerId) : es.IsPointerOverGameObject();
        }

#if UNITY_EDITOR
        private void OnDrawGizmosSelected()
        {
            Gizmos.color = Color.magenta;
            Gizmos.DrawWireCube(transform.position + hitboxCenter, hitboxHalfExtents * 2f);
        }
#endif
    }
}
