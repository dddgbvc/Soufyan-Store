using System.Collections.Generic;
using UnityEngine;

namespace NeonRush
{
    /// <summary>
    /// Allocation-free (after prewarm) pool of prefab instances. Instances are deactivated
    /// instead of destroyed, so a run never calls Instantiate/Destroy once the pool is warm.
    /// </summary>
    public sealed class ComponentPool<T> where T : Component
    {
        private readonly T _prefab;
        private readonly Transform _parent;
        private readonly Stack<T> _free;
        private readonly List<T> _all;

        public ComponentPool(T prefab, Transform parent, int prewarm)
        {
            _prefab = prefab;
            _parent = parent;
            _free = new Stack<T>(Mathf.Max(4, prewarm));
            _all = new List<T>(Mathf.Max(4, prewarm));
            for (int i = 0; i < prewarm; i++)
            {
                _free.Push(CreateInstance());
            }
        }

        /// <summary>Total instances ever created by this pool.</summary>
        public int CreatedCount => _all.Count;

        /// <summary>Instances currently waiting in the pool.</summary>
        public int FreeCount => _free.Count;

        /// <summary>Instances currently handed out.</summary>
        public int ActiveCount => _all.Count - _free.Count;

        public T Get(Vector3 position, Quaternion rotation)
        {
            T item = _free.Count > 0 ? _free.Pop() : CreateInstance();
            item.transform.SetPositionAndRotation(position, rotation);
            item.gameObject.SetActive(true);
            return item;
        }

        /// <summary>Returns an instance. Releasing an inactive instance is ignored (double-release safe).</summary>
        public bool Release(T item)
        {
            if (item == null || !item.gameObject.activeSelf)
            {
                return false;
            }

            item.gameObject.SetActive(false);
            _free.Push(item);
            return true;
        }

        /// <summary>Destroys every instance. Only used on teardown, never during gameplay.</summary>
        public void DestroyAll()
        {
            for (int i = 0; i < _all.Count; i++)
            {
                if (_all[i] != null)
                {
                    if (Application.isPlaying)
                    {
                        Object.Destroy(_all[i].gameObject);
                    }
                    else
                    {
                        Object.DestroyImmediate(_all[i].gameObject);
                    }
                }
            }

            _all.Clear();
            _free.Clear();
        }

        private T CreateInstance()
        {
            T item = Object.Instantiate(_prefab, _parent);
            item.gameObject.SetActive(false);
            _all.Add(item);
            return item;
        }
    }
}
