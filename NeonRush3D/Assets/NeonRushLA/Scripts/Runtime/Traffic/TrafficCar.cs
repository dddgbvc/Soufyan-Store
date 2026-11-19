using NeonRushLA.City;
using NeonRushLA.Vehicles;
using UnityEngine;

namespace NeonRushLA.Traffic
{
    /// <summary>
    /// AI car following the lane graph: cruise speed per driver, keeps distance to the car in
    /// front, stops for red/yellow lights, goes straight or turns right at intersections.
    /// It is a dynamic Rigidbody steered by velocity, so collisions push it physically; after a
    /// real hit it stops driving and becomes a free physics object until recycled.
    /// </summary>
    [RequireComponent(typeof(Rigidbody))]
    public sealed class TrafficCar : MonoBehaviour
    {
        [SerializeField] private Transform[] wheels = new Transform[0];
        [SerializeField] private float wheelRadius = 0.33f;
        [SerializeField] private float length = 4.8f;
        [SerializeField] private CarKind kind;

        private Rigidbody _rb;
        private CityLayout _layout;
        private int _lane = -1;
        private int _nextLane = -1;
        private float _s;
        private bool _inTurn;
        private Vector3 _t0, _t1, _t2;
        private float _turnLength;
        private float _speed;
        private float _cruise;
        private float _wheelAngle;
        private float _knockedTime;

        public bool Knocked { get; private set; }
        public int Lane => _inTurn ? _nextLane : _lane;
        public float S => _inTurn ? -_turnLength + _s : _s;
        public float Speed => _speed;
        public float Length => length;
        public CarKind Kind => kind;
        public float KnockedFor => Knocked ? Time.time - _knockedTime : 0f;
        public bool WaitingAtLight { get; private set; }

        public void Configure(Transform[] w, float radius, float len, CarKind k)
        {
            wheels = w;
            wheelRadius = radius;
            length = len;
            kind = k;
        }

        private void Awake()
        {
            _rb = GetComponent<Rigidbody>();
        }

        public void Place(CityLayout layout, int laneId, float s, float cruise)
        {
            _layout = layout;
            _lane = laneId;
            _s = s;
            _inTurn = false;
            _nextLane = -1;
            _cruise = cruise;
            _speed = cruise * 0.6f;
            Knocked = false;
            _rb.isKinematic = false;
            _rb.drag = 0f;
            _rb.angularDrag = 0.05f;
            _rb.constraints = RigidbodyConstraints.FreezeRotationX | RigidbodyConstraints.FreezeRotationZ;
            CityLayout.LaneEdge e = layout.Lanes[laneId];
            Vector3 p = e.Start + e.Direction * s;
            Quaternion r = Quaternion.LookRotation(e.Direction);
            _rb.position = p;
            _rb.rotation = r;
            transform.SetPositionAndRotation(p, r);
            _rb.velocity = e.Direction * _speed;
            _rb.angularVelocity = Vector3.zero;
            ChooseNext();
        }

        private void ChooseNext()
        {
            CityLayout.LaneEdge e = _layout.Lanes[_lane];
            CityLayout.Intersection inter = _layout.Intersections[e.To];
            // Candidates: straight (same direction) or right turn; never left / U-turn.
            int straight = -1, right = -1;
            Vector3 rightDir = new Vector3(e.Direction.z, 0f, -e.Direction.x);
            foreach (int id in inter.Outgoing)
            {
                CityLayout.LaneEdge o = _layout.Lanes[id];
                float d = Vector3.Dot(o.Direction, e.Direction);
                if (d > 0.9f && o.LaneIndex == Mathf.Min(e.LaneIndex, o.LanesInDirection - 1)) straight = id;
                if (Vector3.Dot(o.Direction, rightDir) > 0.9f && o.LaneIndex == o.LanesInDirection - 1) right = id;
            }

            bool canTurnRight = right >= 0 && e.LaneIndex == e.LanesInDirection - 1;
            if (straight >= 0 && (!canTurnRight || Random.value < 0.7f)) _nextLane = straight;
            else if (canTurnRight) _nextLane = right;
            else _nextLane = straight; // may be -1 at the city edge → despawn
        }

        /// <summary>One AI step (called from TrafficManager.FixedUpdate).</summary>
        public void Drive(float dt, float gapAhead, TrafficLightSystem lights)
        {
            if (Knocked || _layout == null) return;
            CityLayout.LaneEdge e = _layout.Lanes[_lane];
            float target = _cruise;
            WaitingAtLight = false;

            if (!_inTurn)
            {
                float toEnd = e.Length - _s;
                if (_nextLane < 0)
                {
                    target = Mathf.Min(target, Mathf.Sqrt(Mathf.Max(0f, 2f * 5f * (toEnd - 2f))));
                }
                else if (lights != null)
                {
                    int state = lights.State(e.To, e.AlongZ);
                    bool mustStop = state == 2 || (state == 1 && toEnd > _speed * 1.2f);
                    if (mustStop && toEnd > -0.5f)
                    {
                        float stopSpeed = Mathf.Sqrt(Mathf.Max(0f, 2f * 5.5f * (toEnd - 0.5f)));
                        target = Mathf.Min(target, stopSpeed);
                        WaitingAtLight = toEnd < 12f;
                    }
                }
            }

            // Keep distance to the car (or player) ahead.
            float follow = Mathf.Max(0f, (gapAhead - 4f) * 0.9f);
            target = Mathf.Min(target, follow);

            float accel = target > _speed ? 2.6f : 7f;
            _speed = Mathf.MoveTowards(_speed, target, accel * dt);
            _s += _speed * dt;

            Vector3 pos, tangent;
            if (!_inTurn)
            {
                if (_s >= e.Length && _nextLane >= 0)
                {
                    BeginTurn(e);
                }
            }

            if (_inTurn)
            {
                float t = Mathf.Clamp01(_s / Mathf.Max(0.1f, _turnLength));
                pos = Bezier(t);
                tangent = BezierTangent(t);
                if (t >= 1f)
                {
                    _lane = _nextLane;
                    _s = 0f;
                    _inTurn = false;
                    ChooseNext();
                    e = _layout.Lanes[_lane];
                    pos = e.Start;
                    tangent = e.Direction;
                }
            }
            else
            {
                _s = Mathf.Min(_s, e.Length + (_nextLane < 0 ? 0f : 0.1f));
                pos = e.Start + e.Direction * _s;
                tangent = e.Direction;
            }

            if (_rb.isKinematic)
            {
                _rb.MovePosition(pos);
                if (tangent.sqrMagnitude > 1e-4f) _rb.MoveRotation(Quaternion.LookRotation(tangent));
            }
            else
            {
                Vector3 v = (pos - _rb.position) / dt;
                v.y = Mathf.Min(_rb.velocity.y, 0f) - _rb.position.y * 2f;
                _rb.velocity = Vector3.ClampMagnitude(v, 40f);
                if (tangent.sqrMagnitude > 1e-4f)
                {
                    _rb.MoveRotation(Quaternion.Slerp(_rb.rotation, Quaternion.LookRotation(tangent), 1f - Mathf.Exp(-12f * dt)));
                }
            }

            SpinWheels(dt);
        }

        private void BeginTurn(CityLayout.LaneEdge e)
        {
            CityLayout.LaneEdge n = _layout.Lanes[_nextLane];
            _t0 = e.End;
            _t2 = n.Start;
            // Control point: where the two lane lines meet (turns) or the midpoint (straight).
            Vector3 d0 = e.Direction, d1 = n.Direction;
            float cross = d0.x * d1.z - d0.z * d1.x;
            if (Mathf.Abs(cross) > 0.1f)
            {
                Vector3 w = _t2 - _t0;
                float t = (w.x * d1.z - w.z * d1.x) / cross;
                _t1 = _t0 + d0 * t;
            }
            else
            {
                _t1 = (_t0 + _t2) * 0.5f;
            }

            _turnLength = 0f;
            Vector3 prev = _t0;
            for (int i = 1; i <= 8; i++)
            {
                Vector3 p = Bezier(i / 8f);
                _turnLength += (p - prev).magnitude;
                prev = p;
            }

            _s -= e.Length;
            _inTurn = true;
        }

        private Vector3 Bezier(float t)
        {
            float u = 1f - t;
            return u * u * _t0 + 2f * u * t * _t1 + t * t * _t2;
        }

        private Vector3 BezierTangent(float t)
        {
            return 2f * (1f - t) * (_t1 - _t0) + 2f * t * (_t2 - _t1);
        }

        private void SpinWheels(float dt)
        {
            _wheelAngle = (_wheelAngle + _speed / Mathf.Max(0.1f, wheelRadius) * Mathf.Rad2Deg * dt) % 360f;
            Quaternion q = Quaternion.Euler(_wheelAngle, 0f, 0f);
            for (int i = 0; i < wheels.Length; i++)
            {
                if (wheels[i] != null) wheels[i].localRotation = q;
            }
        }

        public bool AtDeadEnd => !_inTurn && _nextLane < 0 && _layout != null && _s >= _layout.Lanes[_lane].Length - 3f && _speed < 0.5f;

        /// <summary>Cheap mode far from the player: kinematic, no physics contacts.</summary>
        public void SetFar(bool far)
        {
            if (Knocked) return;
            if (_rb.isKinematic == far) return;
            _rb.isKinematic = far;
            if (!far) _rb.velocity = transform.forward * _speed;
        }

        private void OnCollisionEnter(Collision c)
        {
            if (Knocked) return;
            bool hitByCar = c.collider.attachedRigidbody != null && c.relativeVelocity.magnitude > 3f;
            if (!hitByCar) return;
            Knocked = true;
            _knockedTime = Time.time;
            _rb.constraints = RigidbodyConstraints.None;
            _rb.drag = 0.6f;
            _rb.angularDrag = 1.5f;
            if (FxPool.Instance != null) FxPool.Instance.Sparks(c.GetContact(0).point, c.GetContact(0).normal, 20);
        }
    }
}
