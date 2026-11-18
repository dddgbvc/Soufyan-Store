using UnityEngine;

namespace NeonRush
{
    /// <summary>
    /// Endless road made of a fixed ring of pooled segments. The rear segment is moved to the
    /// front when the car passes it: zero Instantiate/Destroy while driving.
    /// </summary>
    public sealed class RoadGenerator : MonoBehaviour
    {
        [SerializeField] private RoadSegment segmentPrefab;
        [SerializeField] private ObjectPoolManager pools;
        [SerializeField] private PlayerController player;
        [SerializeField] private int segmentCount = 14;
        [SerializeField] private int segmentsBehind = 2;

        private RoadSegment[] _ring;
        private int _head;
        private float _rearZ;
        private float _length = 20f;
        private int _recycled;

        public bool IsInitialized => _ring != null;
        public int SegmentCount => segmentCount;
        public float FrontZ => _rearZ + segmentCount * _length;
        public float RearZ => _rearZ;
        public int RecycledCount => _recycled;

        public void Init()
        {
            if (_ring != null)
            {
                return;
            }

            _length = segmentPrefab.Length;
            ComponentPool<RoadSegment> pool = pools.GetPool(segmentPrefab, segmentCount);
            _ring = new RoadSegment[segmentCount];
            for (int i = 0; i < segmentCount; i++)
            {
                _ring[i] = pool.Get(Vector3.zero, Quaternion.identity);
            }

            ResetRoad(0f);
        }

        public void ResetRoad(float playerZ)
        {
            _rearZ = Mathf.Floor(playerZ / _length) * _length - segmentsBehind * _length;
            _head = 0;
            for (int i = 0; i < _ring.Length; i++)
            {
                _ring[i].transform.position = new Vector3(0f, 0f, _rearZ + i * _length);
                _ring[i].Randomize();
            }
        }

        public void Tick()
        {
            float playerZ = player.Position.z;
            // Recycle every segment that is fully behind the allowed trailing distance.
            while (playerZ - (_rearZ + _length) > segmentsBehind * _length)
            {
                RoadSegment seg = _ring[_head];
                seg.transform.position = new Vector3(0f, 0f, _rearZ + segmentCount * _length);
                seg.Randomize();
                _rearZ += _length;
                _head = (_head + 1) % segmentCount;
                _recycled++;
            }
        }

        public void ShiftWorld(float dz)
        {
            _rearZ += dz;
            for (int i = 0; i < _ring.Length; i++)
            {
                Vector3 p = _ring[i].transform.position;
                _ring[i].transform.position = new Vector3(p.x, p.y, p.z + dz);
            }
        }
    }
}
