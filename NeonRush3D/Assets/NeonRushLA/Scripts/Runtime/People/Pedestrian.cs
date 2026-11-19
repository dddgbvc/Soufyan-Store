using UnityEngine;

namespace NeonRushLA.People
{
    /// <summary>
    /// One pedestrian: procedural walk / run / idle animation on a 12-bone rig, and a physical
    /// ragdoll (Rigidbody + Collider + CharacterJoint per limb) that takes over on a hard hit.
    /// Ragdoll bodies stay kinematic with colliders off until needed. Non-violent: no gore.
    /// </summary>
    public sealed class Pedestrian : MonoBehaviour
    {
        [SerializeField] private Transform[] bones = new Transform[12];
        [SerializeField] private Rigidbody[] ragdollBodies = new Rigidbody[0];
        [SerializeField] private Collider[] ragdollColliders = new Collider[0];
        [SerializeField] private SkinnedMeshRenderer skin;
        [SerializeField] private Collider hitTrigger;

        private Vector3[] _bindPos;
        private Quaternion[] _bindRot;
        private float _phase;
        private float _idleSeed;

        public bool IsRagdoll { get; private set; }
        public float RagdollTime { get; private set; }
        public SkinnedMeshRenderer Skin => skin;
        public Transform Hips => bones[0];

        public void Configure(Transform[] rigBones, Rigidbody[] bodies, Collider[] colliders, SkinnedMeshRenderer smr, Collider trigger)
        {
            bones = rigBones;
            ragdollBodies = bodies;
            ragdollColliders = colliders;
            skin = smr;
            hitTrigger = trigger;
        }

        private void Awake()
        {
            CacheBind();
        }

        private void CacheBind()
        {
            if (_bindPos != null) return;
            _bindPos = new Vector3[bones.Length];
            _bindRot = new Quaternion[bones.Length];
            for (int i = 0; i < bones.Length; i++)
            {
                _bindPos[i] = bones[i].localPosition;
                _bindRot[i] = bones[i].localRotation;
            }

            _idleSeed = Random.value * 10f;
        }

        /// <summary>Procedural gait. speed in m/s (0 = idle, ~1.4 walk, ~3.5+ run).</summary>
        public void Animate(float speed, float dt)
        {
            if (IsRagdoll) return;
            CacheBind();
            bool running = speed > 2.5f;
            float stride = running ? 1.25f : 0.75f;            // metres per half cycle
            _phase += speed / Mathf.Max(0.1f, stride) * Mathf.PI * dt;
            float s = Mathf.Sin(_phase);
            float c = Mathf.Cos(_phase);
            float moving = Mathf.Clamp01(speed / 1.2f);
            float legA = (running ? 38f : 24f) * moving;
            float kneeA = (running ? 70f : 32f) * moving;
            float armA = (running ? 42f : 18f) * moving;

            Set(Bone.ThighL, Quaternion.Euler(-s * legA, 0f, 0f));
            Set(Bone.ThighR, Quaternion.Euler(s * legA, 0f, 0f));
            Set(Bone.ShinL, Quaternion.Euler(Mathf.Max(0f, c) * kneeA + 4f, 0f, 0f));
            Set(Bone.ShinR, Quaternion.Euler(Mathf.Max(0f, -c) * kneeA + 4f, 0f, 0f));
            Set(Bone.UpperArmL, Quaternion.Euler(s * armA, 0f, -6f));
            Set(Bone.UpperArmR, Quaternion.Euler(-s * armA, 0f, 6f));
            Set(Bone.ForeArmL, Quaternion.Euler(-(running ? 70f : 12f) - Mathf.Max(0f, s) * 10f, 0f, 0f));
            Set(Bone.ForeArmR, Quaternion.Euler(-(running ? 70f : 12f) - Mathf.Max(0f, -s) * 10f, 0f, 0f));

            float lean = running ? 14f : 3f * moving;
            float breathe = Mathf.Sin(Time.time * 1.6f + _idleSeed) * (1f - moving) * 1.5f;
            Set(Bone.Chest, Quaternion.Euler(lean + breathe, s * 6f * moving, 0f));
            Set(Bone.Spine, Quaternion.Euler(0f, -s * 4f * moving, 0f));
            Set(Bone.Head, Quaternion.Euler(-lean * 0.5f, Mathf.Sin(Time.time * 0.4f + _idleSeed) * 12f * (1f - moving), 0f));

            Transform hips = bones[(int)Bone.Hips];
            hips.localPosition = _bindPos[(int)Bone.Hips] + Vector3.up * (Mathf.Abs(c) * (running ? 0.05f : 0.025f) * moving - (running ? 0.04f : 0f));
            hips.localRotation = _bindRot[(int)Bone.Hips] * Quaternion.Euler(0f, s * 5f * moving, c * 2f * moving);
        }

        private enum Bone
        {
            Hips, Spine, Chest, Head, UpperArmL, ForeArmL, UpperArmR, ForeArmR, ThighL, ShinL, ThighR, ShinR
        }

        private void Set(Bone b, Quaternion q)
        {
            int i = (int)b;
            bones[i].localRotation = _bindRot[i] * q;
        }

        public void EnableRagdoll(Vector3 velocity, Vector3 hitPoint)
        {
            if (IsRagdoll) return;
            IsRagdoll = true;
            RagdollTime = Time.time;
            if (hitTrigger != null) hitTrigger.enabled = false;
            for (int i = 0; i < ragdollColliders.Length; i++) ragdollColliders[i].enabled = true;
            for (int i = 0; i < ragdollBodies.Length; i++)
            {
                Rigidbody rb = ragdollBodies[i];
                rb.isKinematic = false;
                rb.velocity = velocity * 0.85f + Vector3.up * 2.2f;
            }

            if (ragdollBodies.Length > 0)
            {
                ragdollBodies[0].AddForceAtPosition(velocity * 25f + Vector3.up * 150f, hitPoint, ForceMode.Impulse);
            }

            if (skin != null) skin.updateWhenOffscreen = true;
        }

        /// <summary>Back to animated mode in bind pose (pool reuse).</summary>
        public void ResetPose()
        {
            CacheBind();
            IsRagdoll = false;
            for (int i = 0; i < ragdollBodies.Length; i++)
            {
                Rigidbody rb = ragdollBodies[i];
                if (!rb.isKinematic)
                {
                    rb.velocity = Vector3.zero;
                    rb.angularVelocity = Vector3.zero;
                    rb.isKinematic = true;
                }
            }

            for (int i = 0; i < ragdollColliders.Length; i++) ragdollColliders[i].enabled = false;
            for (int i = 0; i < bones.Length; i++)
            {
                bones[i].localPosition = _bindPos[i];
                bones[i].localRotation = _bindRot[i];
            }

            if (hitTrigger != null) hitTrigger.enabled = true;
            if (skin != null) skin.updateWhenOffscreen = false;
        }

        public System.Action<Pedestrian, Vector3> HitByVehicle;

        private void OnTriggerEnter(Collider other)
        {
            if (IsRagdoll) return;
            Rigidbody rb = other.attachedRigidbody;
            if (rb == null || rb.isKinematic) return;
            if (rb.velocity.magnitude < 2.5f) return;
            Vector3 point = other.ClosestPoint(transform.position + Vector3.up);
            EnableRagdoll(rb.velocity, point);
            HitByVehicle?.Invoke(this, rb.velocity);
        }
    }
}
