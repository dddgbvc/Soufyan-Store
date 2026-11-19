using System;
using UnityEngine;

namespace NeonRushLA.Vehicles
{
    /// <summary>
    /// Impact handling: measures each hit from the physics impulse, throws sparks, plays the
    /// crash sound, shakes the camera, dents the body mesh around the contact point, dulls the
    /// paint as damage builds up, and breaks head/tail lights on heavy front/rear hits.
    /// </summary>
    public sealed class VehicleDamage : MonoBehaviour
    {
        [SerializeField] private MeshFilter bodyMesh;
        [SerializeField] private MeshRenderer bodyRenderer;
        [SerializeField] private int headlightSlot = -1;
        [SerializeField] private int taillightSlot = -1;
        [SerializeField] private int paintSlot = -1;
        [SerializeField] private Material brokenLight;
        [SerializeField] private float minImpactSpeed = 2.5f;
        [SerializeField] private float maxDent = 0.11f;
        [SerializeField] private float frontZ = 2.2f;
        [SerializeField] private float rearZ = -2.2f;

        private Rigidbody _rb;
        private Vector3[] _original;
        private Vector3[] _current;
        private Mesh _mesh;
        private Material _paintInstance;
        private float _paintSmoothness;
        private bool _headBroken, _tailBroken;
        private Material[] _factoryMaterials;

        public float Damage { get; private set; }               // 0..100
        public int Impacts { get; private set; }
        public float LastImpactSpeed { get; private set; }
        public bool HeadlightsBroken => _headBroken;
        public bool TaillightsBroken => _tailBroken;

        /// <summary>(impact speed m/s, world contact point)</summary>
        public event Action<float, Vector3> Impact;

        public void Configure(MeshFilter body, MeshRenderer renderer, int head, int tail, int paint, Material broken, float front, float rear)
        {
            bodyMesh = body;
            bodyRenderer = renderer;
            headlightSlot = head;
            taillightSlot = tail;
            paintSlot = paint;
            brokenLight = broken;
            frontZ = front;
            rearZ = rear;
        }

        private void Awake()
        {
            _rb = GetComponent<Rigidbody>();
        }

        private void EnsureMeshCopy()
        {
            if (_mesh != null || bodyMesh == null) return;
            _mesh = bodyMesh.mesh; // instance copy, only this car is dented
            _mesh.MarkDynamic();
            _original = _mesh.vertices;
            _current = (Vector3[])_original.Clone();
        }

        private void OnCollisionEnter(Collision c)
        {
            float mass = _rb != null ? _rb.mass : 1500f;
            float dv = c.impulse.magnitude / Mathf.Max(1f, mass);
            if (dv < minImpactSpeed) return;
            ContactPoint cp = c.GetContact(0);
            ApplyImpact(cp.point, cp.normal, dv);
        }

        /// <summary>Applies an impact (also called by tests).</summary>
        public void ApplyImpact(Vector3 worldPoint, Vector3 worldNormal, float impactSpeed)
        {
            Impacts++;
            LastImpactSpeed = impactSpeed;
            Damage = Mathf.Min(100f, Damage + impactSpeed * 1.6f);

            if (FxPool.Instance != null) FxPool.Instance.Sparks(worldPoint, worldNormal, Mathf.Clamp(Mathf.RoundToInt(impactSpeed * 6f), 6, 90));
            Dent(worldPoint, worldNormal, impactSpeed);

            Vector3 local = transform.InverseTransformPoint(worldPoint);
            if (impactSpeed > 8f && local.z > frontZ && !_headBroken)
            {
                _headBroken = true;
                SwapSlot(headlightSlot);
            }

            if (impactSpeed > 8f && local.z < rearZ && !_tailBroken)
            {
                _tailBroken = true;
                SwapSlot(taillightSlot);
            }

            DullPaint();
            Impact?.Invoke(impactSpeed, worldPoint);
        }

        private void Dent(Vector3 worldPoint, Vector3 worldNormal, float impactSpeed)
        {
            EnsureMeshCopy();
            if (_mesh == null) return;
            Transform t = bodyMesh.transform;
            Vector3 p = t.InverseTransformPoint(worldPoint);
            // Contact normal points away from the other body → into our car.
            Vector3 push = t.InverseTransformDirection(worldNormal).normalized;
            float radius = Mathf.Clamp(0.35f + impactSpeed * 0.03f, 0.35f, 0.9f);
            float depth = Mathf.Min(maxDent, impactSpeed * 0.006f);
            float r2 = radius * radius;
            bool changed = false;
            for (int i = 0; i < _current.Length; i++)
            {
                float d2 = (_current[i] - p).sqrMagnitude;
                if (d2 > r2) continue;
                float fall = 1f - d2 / r2;
                Vector3 moved = _current[i] + push * (depth * fall * fall);
                // Never deform further than maxDent from the factory shape.
                Vector3 delta = moved - _original[i];
                if (delta.sqrMagnitude > maxDent * maxDent) moved = _original[i] + delta.normalized * maxDent;
                _current[i] = moved;
                changed = true;
            }

            if (!changed) return;
            _mesh.vertices = _current;
            _mesh.RecalculateNormals();
            _mesh.RecalculateBounds();
        }

        private void RememberFactoryMaterials()
        {
            if (_factoryMaterials == null && bodyRenderer != null) _factoryMaterials = bodyRenderer.sharedMaterials;
        }

        private void SwapSlot(int slot)
        {
            if (bodyRenderer == null || brokenLight == null || slot < 0) return;
            RememberFactoryMaterials();
            Material[] mats = bodyRenderer.sharedMaterials;
            if (slot >= mats.Length) return;
            mats[slot] = brokenLight;
            bodyRenderer.sharedMaterials = mats;
        }

        private void DullPaint()
        {
            if (bodyRenderer == null || paintSlot < 0) return;
            if (_paintInstance == null)
            {
                RememberFactoryMaterials();
                Material[] mats = bodyRenderer.sharedMaterials;
                if (paintSlot >= mats.Length) return;
                _paintInstance = new Material(mats[paintSlot]) { name = mats[paintSlot].name + " (damaged)" };
                _paintSmoothness = _paintInstance.HasProperty("_Smoothness") ? _paintInstance.GetFloat("_Smoothness") : 0.85f;
                mats[paintSlot] = _paintInstance;
                bodyRenderer.sharedMaterials = mats;
            }

            if (_paintInstance.HasProperty("_Smoothness"))
            {
                _paintInstance.SetFloat("_Smoothness", Mathf.Lerp(_paintSmoothness, 0.35f, Damage / 100f));
            }
        }

        public void SetPaintColor(Color c)
        {
            if (bodyRenderer == null || paintSlot < 0) return;
            DullPaint();
            if (_paintInstance != null) _paintInstance.SetColor("_BaseColor", c);
        }

        /// <summary>Restores the factory body (used when the player resets the car in the garage).</summary>
        public void Repair()
        {
            if (_mesh != null && _original != null)
            {
                _current = (Vector3[])_original.Clone();
                _mesh.vertices = _current;
                _mesh.RecalculateNormals();
                _mesh.RecalculateBounds();
            }

            Damage = 0f;
            _headBroken = false;
            _tailBroken = false;
            if (bodyRenderer != null && _factoryMaterials != null)
            {
                Material[] mats = (Material[])_factoryMaterials.Clone();
                if (_paintInstance != null && paintSlot >= 0 && paintSlot < mats.Length)
                {
                    _paintInstance.SetFloat("_Smoothness", _paintSmoothness);
                    mats[paintSlot] = _paintInstance;
                }

                bodyRenderer.sharedMaterials = mats;
            }
        }

        private void OnDestroy()
        {
            if (_paintInstance != null) Destroy(_paintInstance);
            if (_mesh != null) Destroy(_mesh);
        }
    }
}
