using UnityEngine;

namespace NeonRush
{
    /// <summary>Marker + pool bookkeeping for a hazard. Requires a (trigger) collider.</summary>
    [RequireComponent(typeof(Collider))]
    public sealed class Obstacle : MonoBehaviour
    {
        [SerializeField] private string displayName = "Barrier";

        public string DisplayName => displayName;
        public int Lane { get; set; }
        public int PoolIndex { get; set; }
    }
}
