using System.Collections.Generic;
using UnityEngine;

namespace NeonRushLA.City
{
    /// <summary>
    /// Drives every signal head from one clock. Heads are single renderers with three lens
    /// sub-meshes (R, Y, G); materials only change when a state changes (no per-frame work).
    /// Traffic and pedestrians query the same state so lights, cars and people agree.
    /// </summary>
    public sealed class TrafficLightSystem : MonoBehaviour
    {
        public static TrafficLightSystem Instance { get; private set; }

        private sealed class Head
        {
            public int Intersection;
            public bool AlongZ;
            public Renderer Renderer;
            public int State = -1;
        }

        private readonly List<Head> _heads = new List<Head>();
        private CityLayout _layout;
        private Material[][] _states; // [state] → materials (R, Y, G)
        private float _timer;

        public float Clock => Time.time;
        public int HeadCount => _heads.Count;

        private void Awake()
        {
            Instance = this;
        }

        private void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }

        public void Init(CityLayout layout, MaterialLibrary lib)
        {
            _layout = layout;
            Material off = lib.Get("SignalOff");
            _states = new[]
            {
                new[] { off, off, lib.Get("SignalGreen") },
                new[] { off, lib.Get("SignalYellow"), off },
                new[] { lib.Get("SignalRed"), off, off },
            };
        }

        public void Register(int intersection, bool alongZ, Renderer lens)
        {
            _heads.Add(new Head { Intersection = intersection, AlongZ = alongZ, Renderer = lens });
        }

        /// <summary>0 green, 1 yellow, 2 red.</summary>
        public int State(int intersection, bool alongZ)
        {
            return _layout == null ? 0 : _layout.SignalState(intersection, alongZ, Clock);
        }

        /// <summary>Pedestrians may cross a road when its traffic has a red light.</summary>
        public bool PedestrianMayCross(int intersection, bool crossesAlongZRoad)
        {
            return State(intersection, crossesAlongZRoad) == 2;
        }

        private void Update()
        {
            if (_layout == null) return;
            _timer -= Time.deltaTime;
            if (_timer > 0f) return;
            _timer = 0.2f;
            for (int i = 0; i < _heads.Count; i++)
            {
                Head h = _heads[i];
                int s = State(h.Intersection, h.AlongZ);
                if (s == h.State || h.Renderer == null) continue;
                h.State = s;
                if (h.Renderer.isVisible || h.State < 0) h.Renderer.sharedMaterials = _states[s];
                else h.Renderer.sharedMaterials = _states[s];
            }
        }
    }
}
