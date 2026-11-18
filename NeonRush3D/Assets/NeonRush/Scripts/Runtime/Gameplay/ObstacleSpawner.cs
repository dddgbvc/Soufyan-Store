using System.Collections.Generic;
using UnityEngine;

namespace NeonRush
{
    /// <summary>
    /// Spawns rows of pooled obstacles ahead of the car. Every row leaves at least one lane
    /// open, and that lane is always reachable from the previous row's open lane.
    /// </summary>
    public sealed class ObstacleSpawner : MonoBehaviour
    {
        [SerializeField] private Obstacle[] prefabs = new Obstacle[0];
        [SerializeField] private ObjectPoolManager pools;
        [SerializeField] private PlayerController player;
        [SerializeField] private int prewarmPerType = 12;
        [SerializeField] private float firstRowDistance = 70f;
        [SerializeField] private float spawnAhead = 150f;
        [SerializeField] private float despawnBehind = 12f;
        [SerializeField] private float maxGap = 34f;
        [SerializeField] private float minGap = 18f;
        [SerializeField] private float gapJitter = 2.5f;
        [SerializeField, Range(0f, 1f)] private float doubleBlockChanceStart = 0.2f;
        [SerializeField, Range(0f, 1f)] private float doubleBlockChanceEnd = 0.65f;

        private ComponentPool<Obstacle>[] _pools;
        private readonly List<Obstacle> _active = new List<Obstacle>(96);
        private float _nextRowZ;
        private int _prevFreeLane = 1;
        private float _difficulty;
        private int _rowsSpawned;

        public IReadOnlyList<Obstacle> Active => _active;
        public int RowsSpawned => _rowsSpawned;
        public float NextRowZ => _nextRowZ;
        public bool IsInitialized => _pools != null;

        public void Init()
        {
            if (_pools != null)
            {
                return;
            }

            _pools = new ComponentPool<Obstacle>[prefabs.Length];
            for (int i = 0; i < prefabs.Length; i++)
            {
                _pools[i] = pools.GetPool(prefabs[i], prewarmPerType);
            }
        }

        public void ResetSpawner(float playerZ)
        {
            Clear();
            _nextRowZ = playerZ + firstRowDistance;
            _prevFreeLane = 1;
            _difficulty = 0f;
            _rowsSpawned = 0;
        }

        public void SetDifficulty(float difficulty01)
        {
            _difficulty = Mathf.Clamp01(difficulty01);
        }

        public void Tick(float playerZ, bool spawning)
        {
            float limit = playerZ - despawnBehind;
            for (int i = _active.Count - 1; i >= 0; i--)
            {
                Obstacle o = _active[i];
                if (o.transform.position.z < limit)
                {
                    ReleaseAt(i);
                }
            }

            if (!spawning || prefabs.Length == 0)
            {
                return;
            }

            float horizon = playerZ + spawnAhead;
            while (_nextRowZ < horizon)
            {
                SpawnRow(_nextRowZ);
                float gap = Mathf.Lerp(maxGap, minGap, _difficulty) + Random.Range(-gapJitter, gapJitter);
                _nextRowZ += Mathf.Max(minGap * 0.85f, gap);
            }
        }

        private void SpawnRow(float z)
        {
            int freeLane = Mathf.Clamp(_prevFreeLane + Random.Range(-1, 2), 0, PlayerController.LaneCount - 1);
            float doubleChance = Mathf.Lerp(doubleBlockChanceStart, doubleBlockChanceEnd, _difficulty);
            bool blockTwo = Random.value < doubleChance;

            int pick = Random.Range(0, 2); // which of the two other lanes gets blocked when only one is
            int otherIndex = 0;
            for (int lane = 0; lane < PlayerController.LaneCount; lane++)
            {
                if (lane == freeLane)
                {
                    continue;
                }

                if (blockTwo || otherIndex == pick)
                {
                    SpawnAt(lane, z + Random.Range(0f, 1.5f));
                }

                otherIndex++;
            }

            _prevFreeLane = freeLane;
            _rowsSpawned++;
        }

        /// <summary>Spawns a single obstacle (also used by tests).</summary>
        public Obstacle SpawnAt(int lane, float z, int type = -1)
        {
            if (type < 0 || type >= _pools.Length)
            {
                type = Random.Range(0, _pools.Length);
            }

            float x = PlayerController.LaneToX(lane, player.LaneWidth);
            Obstacle o = _pools[type].Get(new Vector3(x, 0f, z), Quaternion.identity);
            o.Lane = lane;
            o.PoolIndex = type;
            _active.Add(o);
            return o;
        }

        public void Clear()
        {
            for (int i = _active.Count - 1; i >= 0; i--)
            {
                ReleaseAt(i);
            }
        }

        public void ShiftWorld(float dz)
        {
            _nextRowZ += dz;
            for (int i = 0; i < _active.Count; i++)
            {
                Transform t = _active[i].transform;
                Vector3 p = t.position;
                t.position = new Vector3(p.x, p.y, p.z + dz);
            }
        }

        private void ReleaseAt(int index)
        {
            Obstacle o = _active[index];
            int last = _active.Count - 1;
            _active[index] = _active[last];
            _active.RemoveAt(last);
            if (o != null)
            {
                _pools[o.PoolIndex].Release(o);
            }
        }
    }
}
