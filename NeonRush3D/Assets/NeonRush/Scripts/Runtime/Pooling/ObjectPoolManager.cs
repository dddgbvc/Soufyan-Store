using System.Collections.Generic;
using UnityEngine;

namespace NeonRush
{
    /// <summary>
    /// Central owner of every pool in the scene. Pools are created once (prewarmed at boot)
    /// and parented under this object so the hierarchy stays tidy.
    /// </summary>
    public sealed class ObjectPoolManager : MonoBehaviour
    {
        private readonly Dictionary<int, object> _pools = new Dictionary<int, object>(16);

        public ComponentPool<T> GetPool<T>(T prefab, int prewarm) where T : Component
        {
            int key = prefab.GetInstanceID();
            if (_pools.TryGetValue(key, out object existing))
            {
                return (ComponentPool<T>)existing;
            }

            var container = new GameObject("Pool_" + prefab.name).transform;
            container.SetParent(transform, false);
            var pool = new ComponentPool<T>(prefab, container, prewarm);
            _pools.Add(key, pool);
            return pool;
        }

        public int PoolCount => _pools.Count;
    }
}
