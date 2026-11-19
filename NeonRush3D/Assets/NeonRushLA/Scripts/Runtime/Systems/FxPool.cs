using UnityEngine;

namespace NeonRushLA
{
    /// <summary>
    /// Shared, pre-built particle emitters (sparks, tyre smoke, debris dust). Emitting moves the
    /// emitter and calls Emit — no Instantiate during play.
    /// </summary>
    public sealed class FxPool : MonoBehaviour
    {
        public static FxPool Instance { get; private set; }

        [SerializeField] private ParticleSystem sparks;
        [SerializeField] private ParticleSystem smoke;
        [SerializeField] private ParticleSystem dust;

        private void Awake()
        {
            Instance = this;
        }

        private void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }

        public void Configure(ParticleSystem sparksPs, ParticleSystem smokePs, ParticleSystem dustPs)
        {
            sparks = sparksPs;
            smoke = smokePs;
            dust = dustPs;
        }

        public void Sparks(Vector3 position, Vector3 normal, int count)
        {
            Emit(sparks, position, normal, count);
        }

        public void Smoke(Vector3 position, int count)
        {
            Emit(smoke, position, Vector3.up, count);
        }

        public void Dust(Vector3 position, int count)
        {
            Emit(dust, position, Vector3.up, count);
        }

        private static void Emit(ParticleSystem ps, Vector3 position, Vector3 normal, int count)
        {
            if (ps == null || count <= 0) return;
            Transform t = ps.transform;
            t.position = position;
            if (normal.sqrMagnitude > 1e-4f) t.rotation = Quaternion.LookRotation(normal);
            ps.Emit(count);
        }

        /// <summary>Builds the three emitters (used by the scene builder and as a runtime fallback).</summary>
        public static FxPool Create(Transform parent, MaterialLibrary lib)
        {
            var root = new GameObject("FX");
            root.transform.SetParent(parent, false);
            var pool = root.AddComponent<FxPool>();
            pool.Configure(
                MakeSystem(root.transform, "Sparks", lib.Get("Spark"), 0.25f, new Vector2(4f, 11f), new Vector2(0.03f, 0.06f), 2.2f, 220, new Color(1f, 0.75f, 0.35f), true),
                MakeSystem(root.transform, "TyreSmoke", lib.Get("Smoke"), 1.6f, new Vector2(0.4f, 1.6f), new Vector2(0.8f, 1.6f), -0.05f, 260, new Color(0.85f, 0.85f, 0.88f, 0.45f), false),
                MakeSystem(root.transform, "Dust", lib.Get("Smoke"), 1.0f, new Vector2(1f, 3f), new Vector2(0.4f, 0.9f), 0.3f, 120, new Color(0.7f, 0.65f, 0.58f, 0.5f), false));
            return pool;
        }

        private static ParticleSystem MakeSystem(Transform parent, string name, Material mat, float life, Vector2 speed, Vector2 size, float gravity, int max, Color color, bool stretch)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            ParticleSystem.MainModule main = ps.main;
            main.playOnAwake = false;
            main.loop = false;
            main.startLifetime = new ParticleSystem.MinMaxCurve(life * 0.6f, life);
            main.startSpeed = new ParticleSystem.MinMaxCurve(speed.x, speed.y);
            main.startSize = new ParticleSystem.MinMaxCurve(size.x, size.y);
            main.startColor = color;
            main.gravityModifier = gravity;
            main.maxParticles = max;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            ParticleSystem.EmissionModule em = ps.emission;
            em.enabled = false;
            ParticleSystem.ShapeModule shape = ps.shape;
            shape.shapeType = ParticleSystemShapeType.Cone;
            shape.angle = stretch ? 55f : 25f;
            shape.radius = stretch ? 0.05f : 0.25f;
            ParticleSystem.ColorOverLifetimeModule col = ps.colorOverLifetime;
            col.enabled = true;
            var grad = new Gradient();
            grad.SetKeys(new[] { new GradientColorKey(color, 0f), new GradientColorKey(color, 1f) },
                new[] { new GradientAlphaKey(color.a, 0f), new GradientAlphaKey(0f, 1f) });
            col.color = grad;
            if (!stretch)
            {
                ParticleSystem.SizeOverLifetimeModule sol = ps.sizeOverLifetime;
                sol.enabled = true;
                sol.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0f, 0.6f, 1f, 2.2f));
            }

            var r = go.GetComponent<ParticleSystemRenderer>();
            r.sharedMaterial = mat;
            r.renderMode = stretch ? ParticleSystemRenderMode.Stretch : ParticleSystemRenderMode.Billboard;
            if (stretch)
            {
                r.velocityScale = 0.04f;
                r.lengthScale = 1.5f;
            }

            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            return ps;
        }
    }
}
