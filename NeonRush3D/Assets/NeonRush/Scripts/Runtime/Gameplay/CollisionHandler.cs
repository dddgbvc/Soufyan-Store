using UnityEngine;

namespace NeonRush
{
    /// <summary>
    /// Physics-based crash detection using a swept OverlapBox (non-allocating). The box is
    /// stretched back over the distance travelled this frame, so nothing is skipped at high
    /// speed / low framerate. No rigidbodies, so physics simulation itself can stay off.
    /// </summary>
    public sealed class CollisionHandler : MonoBehaviour
    {
        [SerializeField] private PlayerController player;
        [SerializeField] private LayerMask obstacleMask = ~0;

        private readonly Collider[] _hits = new Collider[16];
        private float _lastZ;

        public void ResetTracking()
        {
            _lastZ = player.Position.z;
        }

        public void ShiftWorld(float dz)
        {
            _lastZ += dz;
        }

        public Obstacle Check()
        {
            Physics.SyncTransforms();

            Vector3 p = player.Position;
            float travelled = Mathf.Max(0f, p.z - _lastZ);
            _lastZ = p.z;

            Vector3 half = player.HitboxHalfExtents;
            half.z += travelled * 0.5f;
            Vector3 center = p + player.HitboxCenter;
            center.z -= travelled * 0.5f;

            int count = Physics.OverlapBoxNonAlloc(center, half, _hits, Quaternion.identity, obstacleMask, QueryTriggerInteraction.Collide);
            for (int i = 0; i < count; i++)
            {
                Collider c = _hits[i];
                _hits[i] = null;
                if (c != null && c.TryGetComponent(out Obstacle obstacle) && obstacle.isActiveAndEnabled)
                {
                    for (int j = i + 1; j < count; j++)
                    {
                        _hits[j] = null;
                    }

                    return obstacle;
                }
            }

            return null;
        }
    }
}
