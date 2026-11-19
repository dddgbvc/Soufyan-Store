using System.Collections.Generic;
using NeonRushLA.City;
using UnityEngine;

namespace NeonRushLA.People
{
    /// <summary>
    /// Pedestrian AI for a pooled crowd near the player: walks the sidewalk graph, waits for the
    /// walk phase at crosswalks, runs away from a car that is coming at them, and hands over to
    /// the ragdoll when hit. One Update drives everyone (no per-pedestrian Update calls).
    /// </summary>
    public sealed class PedestrianManager : MonoBehaviour
    {
        [SerializeField] private Pedestrian prefab;
        [SerializeField] private int maxPeople = 24;
        [SerializeField] private float spawnMin = 25f;
        [SerializeField] private float spawnMax = 110f;
        [SerializeField] private float despawn = 140f;
        [SerializeField] private Material[] skins = new Material[0];
        [SerializeField] private Material[] hairs = new Material[0];
        [SerializeField] private Material[] shirts = new Material[0];
        [SerializeField] private Material[] pants = new Material[0];
        [SerializeField] private Material[] shoes = new Material[0];

        private sealed class Agent
        {
            public Pedestrian Ped;
            public int From, To;
            public bool Crossing;
            public int CrossIntersection;
            public bool CrossAlongZ;
            public bool Waiting;
            public float Speed;
            public float BaseSpeed;
            public float FleeTimer;
            public Vector3 FleeDir;
            public Vector3 Pos;
        }

        private readonly List<Agent> _active = new List<Agent>(40);
        private readonly List<Pedestrian> _pool = new List<Pedestrian>(40);
        private CityLayout _layout;
        private Transform _player;
        private Rigidbody _playerBody;
        private float _spawnTimer;

        public int ActiveCount => _active.Count;
        public int RagdollCount { get; private set; }
        public int HitCount { get; private set; }
        public int MaxPeople
        {
            get => maxPeople;
            set => maxPeople = Mathf.Clamp(value, 0, 40);
        }

        public void Configure(Pedestrian pedPrefab, Material[] skin, Material[] hair, Material[] shirt, Material[] pant, Material[] shoe)
        {
            prefab = pedPrefab;
            skins = skin;
            hairs = hair;
            shirts = shirt;
            pants = pant;
            shoes = shoe;
        }

        public void Init(CityLayout layout, Transform player)
        {
            _layout = layout;
            _player = player;
            _playerBody = player != null ? player.GetComponent<Rigidbody>() : null;
            for (int i = 0; i < 40 && prefab != null; i++)
            {
                Pedestrian p = Instantiate(prefab, transform);
                p.gameObject.SetActive(false);
                p.HitByVehicle += OnHit;
                _pool.Add(p);
            }

            for (int i = 0; i < maxPeople; i++) TrySpawn(true);
        }

        private void OnHit(Pedestrian p, Vector3 v)
        {
            HitCount++;
        }

        private void Update()
        {
            if (_layout == null || _player == null) return;
            float dt = Time.deltaTime;
            Vector3 pp = _player.position;
            Vector3 pv = _playerBody != null ? _playerBody.velocity : Vector3.zero;
            TrafficLightSystem lights = TrafficLightSystem.Instance;
            int ragdolls = 0;

            for (int i = _active.Count - 1; i >= 0; i--)
            {
                Agent a = _active[i];
                Pedestrian ped = a.Ped;
                float dist = (a.Pos - pp).magnitude;
                if (ped.IsRagdoll)
                {
                    ragdolls++;
                    if (Time.time - ped.RagdollTime > 7f && (ped.Hips.position - pp).magnitude > 15f || Time.time - ped.RagdollTime > 20f)
                    {
                        Recycle(i);
                    }

                    continue;
                }

                if (dist > despawn)
                {
                    Recycle(i);
                    continue;
                }

                Step(a, dt, pp, pv, lights);
                // Animate near the camera every frame, further away at a reduced rate.
                if (dist < 60f || (Time.frameCount + i) % 3 == 0) ped.Animate(a.Speed, dist < 60f ? dt : dt * 3f);
            }

            RagdollCount = ragdolls;
            _spawnTimer -= dt;
            if (_spawnTimer <= 0f)
            {
                _spawnTimer = 0.4f;
                if (_active.Count < maxPeople) TrySpawn(false);
            }
        }

        private void Step(Agent a, float dt, Vector3 carPos, Vector3 carVel, TrafficLightSystem lights)
        {
            // Danger: a fast car heading at us.
            Vector3 toPed = a.Pos - carPos;
            toPed.y = 0f;
            float speed = carVel.magnitude;
            if (a.FleeTimer <= 0f && speed > 5f && toPed.magnitude < 16f)
            {
                Vector3 v = carVel / speed;
                float ahead = Vector3.Dot(toPed, v);
                float lateral = Vector3.Cross(v, toPed).y;
                if (ahead > 0f && Mathf.Abs(lateral) < 3.2f)
                {
                    a.FleeTimer = 1.4f;
                    a.FleeDir = new Vector3(v.z, 0f, -v.x) * (lateral >= 0f ? -1f : 1f);
                    if (a.FleeDir.sqrMagnitude < 0.01f) a.FleeDir = Vector3.right;
                }
            }

            Vector3 target = _layout.WalkNodes[a.To].Position;
            Vector3 move;
            if (a.FleeTimer > 0f)
            {
                a.FleeTimer -= dt;
                a.Speed = Mathf.MoveTowards(a.Speed, 4.6f, 14f * dt);
                move = a.FleeDir;
            }
            else
            {
                if (a.Waiting)
                {
                    bool go = lights == null || lights.PedestrianMayCross(a.CrossIntersection, a.CrossAlongZ);
                    if (go) a.Waiting = false;
                }

                a.Speed = Mathf.MoveTowards(a.Speed, a.Waiting ? 0f : a.BaseSpeed, 3f * dt);
                Vector3 d = target - a.Pos;
                d.y = 0f;
                if (d.magnitude < 0.4f)
                {
                    ArriveAt(a);
                    target = _layout.WalkNodes[a.To].Position;
                    d = target - a.Pos;
                    d.y = 0f;
                }

                move = d.sqrMagnitude > 1e-4f ? d.normalized : Vector3.zero;
            }

            a.Pos += move * (a.Speed * dt);
            a.Pos.y = _layout.IsOnRoad(a.Pos) ? 0f : CityLayout.CurbHeight;
            Transform t = a.Ped.transform;
            t.position = a.Pos;
            if (move.sqrMagnitude > 1e-4f && a.Speed > 0.1f)
            {
                t.rotation = Quaternion.Slerp(t.rotation, Quaternion.LookRotation(move), 1f - Mathf.Exp(-8f * dt));
            }
        }

        private void ArriveAt(Agent a)
        {
            CityLayout.WalkNode node = _layout.WalkNodes[a.To];
            int pick = -1;
            for (int attempt = 0; attempt < 4; attempt++)
            {
                int k = Random.Range(0, node.Links.Count);
                if (node.Links[k] == a.From && node.Links.Count > 1) continue;
                pick = k;
                break;
            }

            if (pick < 0) pick = 0;
            a.From = a.To;
            a.To = node.Links[pick];
            a.Crossing = node.IsCrossing[pick];
            a.CrossIntersection = node.CrossIntersection[pick];
            a.CrossAlongZ = node.CrossesAlongZRoad[pick];
            a.Waiting = a.Crossing;
        }

        private void TrySpawn(bool initial)
        {
            if (_pool.Count == 0 || _layout.WalkNodes.Count == 0) return;
            Vector3 pp = _player.position;
            for (int attempt = 0; attempt < 10; attempt++)
            {
                int n = Random.Range(0, _layout.WalkNodes.Count);
                CityLayout.WalkNode node = _layout.WalkNodes[n];
                int link = Random.Range(0, node.Links.Count);
                if (node.IsCrossing[link]) continue;
                Vector3 a = node.Position, b = _layout.WalkNodes[node.Links[link]].Position;
                Vector3 pos = Vector3.Lerp(a, b, Random.value);
                float d = (pos - pp).magnitude;
                if (d < (initial ? 12f : spawnMin) || d > spawnMax) continue;

                Pedestrian ped = _pool[_pool.Count - 1];
                _pool.RemoveAt(_pool.Count - 1);
                ped.gameObject.SetActive(true);
                ped.ResetPose();
                Dress(ped);
                var agent = new Agent
                {
                    Ped = ped, From = n, To = node.Links[link], BaseSpeed = Random.Range(1.1f, 1.6f), Pos = pos,
                };
                agent.Speed = agent.BaseSpeed;
                ped.transform.SetPositionAndRotation(pos, Quaternion.LookRotation((b - a).normalized));
                _active.Add(agent);
                return;
            }
        }

        private void Dress(Pedestrian ped)
        {
            if (ped.Skin == null) return;
            Material[] m = ped.Skin.sharedMaterials;
            if (m.Length < 5) return;
            m[0] = Pick(skins, m[0]);
            m[1] = Pick(hairs, m[1]);
            m[2] = Pick(shirts, m[2]);
            m[3] = Pick(pants, m[3]);
            m[4] = Pick(shoes, m[4]);
            ped.Skin.sharedMaterials = m;
        }

        private static Material Pick(Material[] list, Material fallback)
        {
            return list != null && list.Length > 0 ? list[Random.Range(0, list.Length)] : fallback;
        }

        private void Recycle(int index)
        {
            Agent a = _active[index];
            _active[index] = _active[_active.Count - 1];
            _active.RemoveAt(_active.Count - 1);
            a.Ped.ResetPose();
            a.Ped.gameObject.SetActive(false);
            _pool.Add(a.Ped);
        }

        /// <summary>Places one walker at a position (tests / scripted moments).</summary>
        public Pedestrian SpawnAt(Vector3 position)
        {
            if (_pool.Count == 0) return null;
            int nearest = 0;
            float best = float.MaxValue;
            for (int i = 0; i < _layout.WalkNodes.Count; i++)
            {
                float d = (_layout.WalkNodes[i].Position - position).sqrMagnitude;
                if (d < best)
                {
                    best = d;
                    nearest = i;
                }
            }

            Pedestrian ped = _pool[_pool.Count - 1];
            _pool.RemoveAt(_pool.Count - 1);
            ped.gameObject.SetActive(true);
            ped.ResetPose();
            Dress(ped);
            var node = _layout.WalkNodes[nearest];
            var agent = new Agent { Ped = ped, From = nearest, To = node.Links[0], BaseSpeed = 0f, Pos = position };
            ped.transform.position = position;
            _active.Add(agent);
            return ped;
        }
    }
}
