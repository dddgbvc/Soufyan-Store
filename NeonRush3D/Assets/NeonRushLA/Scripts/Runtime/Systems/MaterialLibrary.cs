using System;
using System.Collections.Generic;
using UnityEngine;

namespace NeonRushLA
{
    /// <summary>
    /// All LA materials as project assets (so their shaders are included in the iOS build and
    /// their textures are compressed by the importer). Looked up by slot name at runtime.
    /// </summary>
    [CreateAssetMenu(menuName = "NeonRush LA/Material Library")]
    public sealed class MaterialLibrary : ScriptableObject
    {
        [Serializable]
        public struct Entry
        {
            public string key;
            public Material material;
        }

        [SerializeField] private List<Entry> entries = new List<Entry>();

        private Dictionary<string, Material> _map;

        public IReadOnlyList<Entry> Entries => entries;

        public void SetEntries(List<Entry> list)
        {
            entries = list;
            _map = null;
        }

        public Material Get(string key)
        {
            if (_map == null)
            {
                _map = new Dictionary<string, Material>(entries.Count);
                for (int i = 0; i < entries.Count; i++)
                {
                    if (!string.IsNullOrEmpty(entries[i].key) && entries[i].material != null)
                    {
                        _map[entries[i].key] = entries[i].material;
                    }
                }
            }

            if (_map.TryGetValue(key, out Material m)) return m;
            return _map.TryGetValue("Black", out Material fallback) ? fallback : null;
        }

        public bool Has(string key)
        {
            if (_map == null) Get("Black");
            return _map.ContainsKey(key);
        }
    }
}
