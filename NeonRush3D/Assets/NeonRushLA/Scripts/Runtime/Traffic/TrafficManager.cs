using System.Collections.Generic;
using NeonRushLA.City;
using UnityEngine;

namespace NeonRushLA.Traffic
{
    /// <summary>
    /// Pooled traffic around the player: spawns cars on lanes 60–220 m away, recycles cars that
    /// fall out of range or were wrecked, runs car-following per lane, and switches distant cars
    /// to cheap kinematic movement.
    /// </summary>
    public sealed class TrafficManager : MonoBehaviour
    {
        [SerializeField] private TrafficCar[] prefabs = new TrafficCar[0];
        [SerializeField] private int maxCars = 16;
        [SerializeField] private float spawnMin = 60f;
        [SerializeField] private float spawnMax = 220f;
        [SerializeField] private float despawn = 260f;
        [SerializeField] private float farDistance = 150f;
        // Real-world colour mix (white, black, greys and silver dominate on US roads).
        [SerializeField] private Color[] paintVariety =
        {
            new Color(0.86f, 0.86f, 0.85f), new Color(0.92f, 0.91f, 0.88f), new Color(0.02f, 0.02f, 0.022f), new Color(0.03f, 0.03f, 0.035f),
            new Color(0.55f, 0.56f, 0.58f), new Color(0.6f, 0.61f, 0.62f), new Color(0.24f, 0.25f, 0.26f), new Color(0.1f, 0.1f, 0.11f),
            new Color(0.04f, 0.08f, 0.2f), new Color(0.45f, 0.03f, 0.03f), new Color(0.55f, 0.5f, 0.4f), new Color(0.05f, 0.12f, 0.08f),
        };

        private readonly List<TrafficCar> _active = new List<TrafficCar>(32);
        private readonly List<TrafficCar> _pool = new List<TrafficCar>(32);
        private List<TrafficCar>[] _perLane;
        private CityLayout _layout;
        private Transform _player;
        private Rigidbody _playerBody;
        private float _spawnTimer;
        private MaterialPropertyBlock _mpb;

        public int ActiveCount => _active.Count;
        public IReadOnlyList<TrafficCar> Active => _active;
        public int MaxCars
        {
            get => maxCars;
            set => maxCars = Mathf.Clamp(value, 0, 40);
        }

        public void Configure(TrafficCar[] carPrefabs)
        {
            prefabs = carPrefabs;
        }

        public void Init(CityLayout layout, Transform player)
        {
            _layout = layout;
            _player = player;
            _playerBody = player != null ? player.GetComponent<Rigidbody>() : null;
            _perLane = new List<TrafficCar>[layout.Lanes.Count];
            for (int i = 0; i < _perLane.Length; i++) _perLane[i] = new List<TrafficCar>(4);
            _mpb = new MaterialPropertyBlock();
            // Prewarm the pool so no Instantiate happens during play.
            for (int i = 0; i < 40 && prefabs.Length > 0; i++)
            {
                TrafficCar car = Instantiate(prefabs[i % prefabs.Length], transform);
                car.gameObject.SetActive(false);
                _pool.Add(car);
            }

            for (int i = 0; i < maxCars; i++) TrySpawn(true);
        }

        private void FixedUpdate()
        {
            if (_layout == null || _player == null) return;
            float dt = Time.fixedDeltaTime;
            Vector3 pp = _player.position;

            for (int i = 0; i < _perLane.Length; i++) _perLane[i].Clear();
            for (int i = 0; i < _active.Count; i++)
            {
                TrafficCar c = _active[i];
                if (!c.Knocked && c.Lane >= 0) _perLane[c.Lane].Add(c);
            }

            TrafficLightSystem lights = TrafficLightSystem.Instance;
            for (int i = _active.Count - 1; i >= 0; i--)
            {
                TrafficCar c = _active[i];
                float dist = (c.transform.position - pp).magnitude;
                bool wrecked = c.Knocked && c.KnockedFor > 8f && dist > 40f;
                if (dist > despawn || wrecked || c.AtDeadEnd || c.transform.position.y < -20f)
                {
                    Recycle(i);
                    continue;
                }

                c.SetFar(dist > farDistance);
                c.Drive(dt, GapAhead(c, pp), lights);
            }

            _spawnTimer -= dt;
            if (_spawnTimer <= 0f)
            {
                _spawnTimer = 0.35f;
                if (_active.Count < maxCars) TrySpawn(false);
            }
        }

        private float GapAhead(TrafficCar c, Vector3 playerPos)
        {
            float best = 999f;
            if (c.Lane >= 0)
            {
                List<TrafficCar> lane = _perLane[c.Lane];
                for (int k = 0; k < lane.Count; k++)
                {
                    TrafficCar o = lane[k];
                    if (o == c) continue;
                    float ds = o.S - c.S;
                    if (ds > 0f) best = Mathf.Min(best, ds - (o.Length + c.Length) * 0.5f);
                }
            }

            // The player's car counts as an obstacle in front.
            Vector3 rel = playerPos - c.transform.position;
            float ahead = Vector3.Dot(rel, c.transform.forward);
            if (ahead > 0f && ahead < 30f)
            {
                float lateral = Mathf.Abs(Vector3.Dot(rel, c.transform.right));
                if (lateral < 2.4f) best = Mathf.Min(best, ahead - c.Length * 0.5f - 2.6f);
            }

            return best;
        }

        private void TrySpawn(bool initial)
        {
            if (_pool.Count == 0 || _layout.Lanes.Count == 0) return;
            Vector3 pp = _player.position;
            for (int attempt = 0; attempt < 12; attempt++)
            {
                int laneId = Random.Range(0, _layout.Lanes.Count);
                CityLayout.LaneEdge e = _layout.Lanes[laneId];
                float s = Random.Range(4f, Mathf.Max(5f, e.Length - 12f));
                Vector3 p = e.Start + e.Direction * s;
                float d = (p - pp).magnitude;
                if (d < (initial ? 25f : spawnMin) || d > spawnMax) continue;
                if (!LaneFree(laneId, s)) continue;
                TrafficCar car = TakeFromPool();
                car.gameObject.SetActive(true);
                float cruise = e.SpeedLimit * Random.Range(0.75f, 1.08f);
                car.Place(_layout, laneId, s, cruise);
                Repaint(car);
                _active.Add(car);
                return;
            }
        }

        private bool LaneFree(int laneId, float s)
        {
            for (int i = 0; i < _active.Count; i++)
            {
                if (_active[i].Lane == laneId && Mathf.Abs(_active[i].S - s) < 14f) return false;
            }

            return true;
        }

        private TrafficCar TakeFromPool()
        {
            int i = Random.Range(0, _pool.Count);
            TrafficCar car = _pool[i];
            _pool[i] = _pool[_pool.Count - 1];
            _pool.RemoveAt(_pool.Count - 1);
            return car;
        }

        private void Repaint(TrafficCar car)
        {
            if (car.Kind == Vehicles.CarKind.Taxi) return;
            Color c = paintVariety[Random.Range(0, paintVariety.Length)];
            _mpb.SetColor("_BaseColor", c);
            foreach (Renderer r in car.GetComponentsInChildren<Renderer>())
            {
                if (r.name.StartsWith("Body")) r.SetPropertyBlock(_mpb, 0);
            }
        }

        /// <summary>
        /// Static parked cars (driveways, parking lots): normal physics bodies left asleep, AI off, random
        /// real-world colours. They sit on the ground until something hits them.
        /// </summary>
        public int SpawnParked(IList<City.ParkedCarData> spots, int max = 140)
        {
            if (prefabs.Length == 0 || spots == null) return 0;
            var root = new GameObject("Parked").transform;
            root.SetParent(transform, false);
            if (_mpb == null) _mpb = new MaterialPropertyBlock();
            var rng = new System.Random(4242);
            int step = Mathf.Max(1, Mathf.CeilToInt(spots.Count / (float)max));
            int n = 0;
            for (int i = 0; i < spots.Count; i += step)
            {
                TrafficCar prefab = prefabs[rng.Next(prefabs.Length)];
                if (prefab.Kind == Vehicles.CarKind.Taxi) prefab = prefabs[0];
                TrafficCar car = Instantiate(prefab, spots[i].Position + Vector3.up * 0.05f, Quaternion.Euler(0f, spots[i].Yaw, 0f), root);
                car.name = "Parked_" + n;
                car.enabled = false;
                var rb = car.GetComponent<Rigidbody>();
                if (rb != null) rb.Sleep();
                Repaint(car, paintVariety[rng.Next(paintVariety.Length)]);
                n++;
            }

            return n;
        }

        private void Repaint(TrafficCar car, Color c)
        {
            _mpb.SetColor("_BaseColor", c);
            foreach (Renderer r in car.GetComponentsInChildren<Renderer>())
            {
                if (r.name.StartsWith("Body")) r.SetPropertyBlock(_mpb, 0);
            }
        }

        private void Recycle(int index)
        {
            TrafficCar car = _active[index];
            _active[index] = _active[_active.Count - 1];
            _active.RemoveAt(_active.Count - 1);
            car.gameObject.SetActive(false);
            _pool.Add(car);
        }

        public void Clear()
        {
            for (int i = _active.Count - 1; i >= 0; i--) Recycle(i);
        }
    }
}
