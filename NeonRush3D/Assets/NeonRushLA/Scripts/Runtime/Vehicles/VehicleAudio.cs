using UnityEngine;

namespace NeonRushLA.Vehicles
{
    /// <summary>Synthesised audio (no files): V8 engine loop pitched by RPM, tyre screech, impacts.</summary>
    public sealed class VehicleAudio : MonoBehaviour
    {
        [SerializeField] private VehicleController vehicle;
        [SerializeField] private VehicleDamage damage;
        [SerializeField] private AudioSource engine;
        [SerializeField] private AudioSource screech;
        [SerializeField] private AudioSource impacts;
        [SerializeField] private float baseRpm = 1500f;

        private static AudioClip _engineClip, _screechClip, _crashClip, _thudClip;
        public float MasterVolume { get; set; } = 1f;

        public void Configure(VehicleController v, VehicleDamage d, AudioSource e, AudioSource s, AudioSource i)
        {
            vehicle = v;
            damage = d;
            engine = e;
            screech = s;
            impacts = i;
        }

        private void Start()
        {
            BuildClips();
            Setup(engine, _engineClip, true);
            Setup(screech, _screechClip, true);
            Setup(impacts, null, false);
            if (engine != null) engine.Play();
            if (screech != null)
            {
                screech.volume = 0f;
                screech.Play();
            }

            if (damage != null) damage.Impact += OnImpact;
        }

        private void OnDestroy()
        {
            if (damage != null) damage.Impact -= OnImpact;
        }

        private static void Setup(AudioSource src, AudioClip clip, bool loop)
        {
            if (src == null) return;
            src.clip = clip;
            src.loop = loop;
            src.playOnAwake = false;
            src.spatialBlend = 0f;
            src.dopplerLevel = 0f;
        }

        private void Update()
        {
            if (vehicle == null) return;
            if (engine != null)
            {
                float pitch = Mathf.Clamp(vehicle.Rpm / baseRpm, 0.45f, 4.2f);
                engine.pitch = Mathf.Lerp(engine.pitch, pitch, 1f - Mathf.Exp(-20f * Time.deltaTime));
                engine.volume = MasterVolume * (0.35f + 0.45f * vehicle.Throttle + 0.2f * vehicle.Rpm01);
            }

            if (screech != null)
            {
                float slip = vehicle.IsGrounded ? Mathf.Clamp01((vehicle.RearSlip - 0.35f) * 1.6f) : 0f;
                if (vehicle.SpeedMs < 3f) slip = 0f;
                screech.volume = Mathf.MoveTowards(screech.volume, slip * 0.75f * MasterVolume, Time.deltaTime * 3f);
                screech.pitch = 0.9f + 0.2f * slip;
            }
        }

        private void OnImpact(float speed, Vector3 point)
        {
            if (impacts == null) return;
            float v = Mathf.Clamp01(speed / 18f) * MasterVolume;
            impacts.pitch = Random.Range(0.85f, 1.1f);
            impacts.PlayOneShot(speed > 7f ? _crashClip : _thudClip, 0.4f + 0.6f * v);
        }

        // ------------------------------------------------------------------ synthesis

        private const int Rate = 22050;

        private static void BuildClips()
        {
            if (_engineClip != null) return;
            _engineClip = Engine();
            _screechClip = Screech();
            _crashClip = Crash(0.9f, 1f);
            _thudClip = Crash(0.35f, 0.5f);
        }

        private static AudioClip Make(string name, float[] d)
        {
            AudioClip c = AudioClip.Create(name, d.Length, 1, Rate, false);
            c.SetData(d, 0);
            return c;
        }

        /// <summary>Cross-plane V8 at 1500 rpm: 100 Hz firing with uneven-fire burble.</summary>
        private static AudioClip Engine()
        {
            int n = Rate; // 1 s seamless (integer cycles)
            var d = new float[n];
            var rng = new System.Random(5);
            float lp = 0f;
            for (int i = 0; i < n; i++)
            {
                float t = (float)i / Rate;
                float fire = 100f;
                float s = 0f;
                s += Mathf.Sin(2f * Mathf.PI * fire * 0.5f * t) * 0.55f; // crank order burble
                s += Mathf.Sin(2f * Mathf.PI * fire * t) * 0.8f;
                s += Mathf.Sin(2f * Mathf.PI * fire * 2f * t) * 0.35f;
                s += Mathf.Sin(2f * Mathf.PI * fire * 3f * t + 0.6f) * 0.18f;
                s += Mathf.Sin(2f * Mathf.PI * fire * 4.5f * t) * 0.08f;
                float am = 0.75f + 0.25f * Mathf.Sin(2f * Mathf.PI * 25f * t);
                s = s * am + ((float)rng.NextDouble() * 2f - 1f) * 0.12f;
                lp += (s - lp) * 0.35f;
                d[i] = Mathf.Clamp(lp * 0.45f, -1f, 1f);
            }

            return Make("LA_Engine", d);
        }

        private static AudioClip Screech()
        {
            int n = Rate;
            var d = new float[n];
            var rng = new System.Random(9);
            float bp1 = 0f, bp2 = 0f;
            for (int i = 0; i < n; i++)
            {
                float t = (float)i / Rate;
                float noise = (float)rng.NextDouble() * 2f - 1f;
                bp1 += (noise - bp1) * 0.25f;
                bp2 += (bp1 - bp2) * 0.25f;
                float whine = Mathf.Sin(2f * Mathf.PI * (1000f + 60f * Mathf.Sin(2f * Mathf.PI * 3f * t)) * t);
                d[i] = (bp1 - bp2) * 1.4f * 0.6f + whine * 0.18f;
            }

            return Make("LA_Screech", d);
        }

        private static AudioClip Crash(float seconds, float intensity)
        {
            int n = (int)(Rate * seconds);
            var d = new float[n];
            var rng = new System.Random(n);
            float lp = 0f;
            for (int i = 0; i < n; i++)
            {
                float t = (float)i / Rate;
                float noise = (float)rng.NextDouble() * 2f - 1f;
                lp += (noise - lp) * Mathf.Lerp(0.7f, 0.06f, t / seconds);
                float thump = Mathf.Sin(2f * Mathf.PI * 55f * t) * Mathf.Exp(-t * 9f);
                float ring = Mathf.Sin(2f * Mathf.PI * 1800f * t) * Mathf.Exp(-t * 14f) * 0.15f * intensity;
                d[i] = Mathf.Clamp((lp * 0.8f * intensity + thump + ring) * Mathf.Exp(-t * 3.5f), -1f, 1f);
            }

            return Make("LA_Crash", d);
        }
    }
}
