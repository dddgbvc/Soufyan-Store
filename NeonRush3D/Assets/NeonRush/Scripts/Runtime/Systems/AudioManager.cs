using UnityEngine;

namespace NeonRush
{
    /// <summary>
    /// All audio is synthesised once at boot (no audio files, no downloads): a synthwave
    /// music loop, an engine drone whose pitch follows speed, a crash, a lane whoosh and a UI click.
    /// </summary>
    public sealed class AudioManager : MonoBehaviour
    {
        private const int SampleRate = 22050;

        [SerializeField] private AudioSource musicSource;
        [SerializeField] private AudioSource engineSource;
        [SerializeField] private AudioSource sfxSource;
        [SerializeField, Range(0f, 1f)] private float engineBaseVolume = 0.35f;

        private AudioClip _crash;
        private AudioClip _whoosh;
        private AudioClip _click;
        private float _music = 0.6f;
        private float _sfx = 0.8f;
        private bool _built;

        public bool IsReady => _built;
        public float MusicVolume => _music;
        public float SfxVolume => _sfx;

        public void Init()
        {
            if (_built)
            {
                return;
            }

            _built = true;
            musicSource.clip = BuildMusic();
            musicSource.loop = true;
            musicSource.playOnAwake = false;
            musicSource.spatialBlend = 0f;

            engineSource.clip = BuildEngine();
            engineSource.loop = true;
            engineSource.playOnAwake = false;
            engineSource.spatialBlend = 0f;

            sfxSource.playOnAwake = false;
            sfxSource.spatialBlend = 0f;
            sfxSource.ignoreListenerPause = true;

            _crash = BuildCrash();
            _whoosh = BuildWhoosh();
            _click = BuildClick();

            ApplyVolumes();
            musicSource.Play();
            engineSource.Play();
        }

        public void SetVolumes(float music, float sfx)
        {
            _music = Mathf.Clamp01(music);
            _sfx = Mathf.Clamp01(sfx);
            ApplyVolumes();
        }

        private void ApplyVolumes()
        {
            if (musicSource != null)
            {
                musicSource.volume = _music * 0.55f;
            }

            if (sfxSource != null)
            {
                sfxSource.volume = _sfx;
            }
        }

        public void SetEngine(float speed01, bool running)
        {
            if (engineSource == null)
            {
                return;
            }

            float targetVol = running ? engineBaseVolume * _sfx * (0.45f + 0.55f * speed01) : 0f;
            engineSource.volume = Mathf.MoveTowards(engineSource.volume, targetVol, Time.unscaledDeltaTime * 2f);
            engineSource.pitch = 0.75f + speed01 * 0.9f;
        }

        public void SetPaused(bool paused)
        {
            AudioListener.pause = paused;
        }

        public void PlayCrash() { PlayOneShot(_crash, 1f); }
        public void PlayWhoosh() { PlayOneShot(_whoosh, 0.55f); }
        public void PlayClick() { PlayOneShot(_click, 0.6f); }

        private void PlayOneShot(AudioClip clip, float scale)
        {
            if (clip != null && sfxSource != null && _sfx > 0.001f)
            {
                sfxSource.PlayOneShot(clip, scale);
            }
        }

        private void OnDestroy()
        {
            AudioListener.pause = false;
            DestroyClip(musicSource != null ? musicSource.clip : null);
            DestroyClip(engineSource != null ? engineSource.clip : null);
            DestroyClip(_crash);
            DestroyClip(_whoosh);
            DestroyClip(_click);
        }

        private static void DestroyClip(AudioClip clip)
        {
            if (clip != null)
            {
                Destroy(clip);
            }
        }

        // ------------------------------------------------------------------ synthesis

        private static AudioClip Make(string name, float[] data)
        {
            AudioClip clip = AudioClip.Create(name, data.Length, 1, SampleRate, false);
            clip.SetData(data, 0);
            return clip;
        }

        private static float Saw(float phase) { return 2f * (phase - Mathf.Floor(phase + 0.5f)); }
        private static float Square(float phase) { return phase - Mathf.Floor(phase) < 0.5f ? 1f : -1f; }
        private static float NoteHz(int midi) { return 440f * Mathf.Pow(2f, (midi - 69) / 12f); }

        private static AudioClip BuildMusic()
        {
            // 8 bars at 112 BPM, A-minor synthwave: bass + arpeggio + soft kick/hat.
            const float bpm = 112f;
            float beat = 60f / bpm;
            int bars = 8;
            float seconds = bars * 4f * beat;
            int n = Mathf.CeilToInt(seconds * SampleRate);
            var data = new float[n];

            int[] roots = { 45, 45, 41, 41, 43, 43, 40, 40 };          // A A F F G G E E
            int[] arp = { 0, 7, 12, 15, 12, 7, 3, 7 };
            var rng = new System.Random(1337);

            float lpBass = 0f;
            float lpArp = 0f;
            for (int i = 0; i < n; i++)
            {
                float t = (float)i / SampleRate;
                float beatPos = t / beat;
                int bar = Mathf.Min(bars - 1, (int)(beatPos / 4f));
                int root = roots[bar];

                // Bass: 8th notes, filtered saw.
                float eighth = beatPos * 2f;
                float eighthFrac = eighth - Mathf.Floor(eighth);
                float bassEnv = Mathf.Exp(-eighthFrac * 3.5f);
                float bassRaw = Saw(t * NoteHz(root - 12)) * bassEnv;
                lpBass += (bassRaw - lpBass) * 0.08f;

                // Arp: 16th notes.
                float sixteenth = beatPos * 4f;
                int step = (int)sixteenth % arp.Length;
                float sixFrac = sixteenth - Mathf.Floor(sixteenth);
                float arpEnv = Mathf.Exp(-sixFrac * 5f);
                float arpRaw = Square(t * NoteHz(root + 12 + arp[step])) * arpEnv * 0.5f
                               + Saw(t * NoteHz(root + 24 + arp[step]) * 1.003f) * arpEnv * 0.25f;
                lpArp += (arpRaw - lpArp) * 0.18f;

                // Kick on every beat, hat on off-beats.
                float beatFrac = beatPos - Mathf.Floor(beatPos);
                float kick = Mathf.Sin(2f * Mathf.PI * (50f + 90f * Mathf.Exp(-beatFrac * 30f)) * beatFrac * beat) *
                             Mathf.Exp(-beatFrac * 9f);
                float hatPhase = eighthFrac;
                bool offBeat = ((int)eighth & 1) == 1;
                float hat = offBeat ? ((float)rng.NextDouble() * 2f - 1f) * Mathf.Exp(-hatPhase * 40f) * 0.18f : 0f;

                float s = lpBass * 0.55f + lpArp * 0.35f + kick * 0.5f + hat;
                data[i] = Mathf.Clamp(s * 0.6f, -1f, 1f);
            }

            // Short crossfade to make the loop seamless.
            int fade = SampleRate / 50;
            for (int i = 0; i < fade; i++)
            {
                float k = (float)i / fade;
                data[i] *= k;
                data[n - 1 - i] *= k;
            }

            return Make("NR_Music", data);
        }

        private static AudioClip BuildEngine()
        {
            // 1 second seamless loop: integer cycle counts so the loop point is click-free.
            int n = SampleRate;
            var data = new float[n];
            float lp = 0f;
            var rng = new System.Random(7);
            for (int i = 0; i < n; i++)
            {
                float t = (float)i / n;
                float s = Saw(t * 55f) * 0.6f + Saw(t * 110f) * 0.25f + Mathf.Sin(2f * Mathf.PI * t * 27f) * 0.3f;
                s += ((float)rng.NextDouble() * 2f - 1f) * 0.05f;
                lp += (s - lp) * 0.12f;
                data[i] = lp * 0.8f;
            }

            return Make("NR_Engine", data);
        }

        private static AudioClip BuildCrash()
        {
            int n = (int)(SampleRate * 0.9f);
            var data = new float[n];
            var rng = new System.Random(99);
            float lp = 0f;
            for (int i = 0; i < n; i++)
            {
                float t = (float)i / SampleRate;
                float noise = (float)rng.NextDouble() * 2f - 1f;
                lp += (noise - lp) * Mathf.Lerp(0.6f, 0.05f, t / 0.9f);
                float thump = Mathf.Sin(2f * Mathf.PI * 60f * t) * Mathf.Exp(-t * 8f);
                data[i] = Mathf.Clamp((lp * 0.9f + thump) * Mathf.Exp(-t * 4f), -1f, 1f);
            }

            return Make("NR_Crash", data);
        }

        private static AudioClip BuildWhoosh()
        {
            int n = (int)(SampleRate * 0.22f);
            var data = new float[n];
            var rng = new System.Random(3);
            float lp = 0f;
            for (int i = 0; i < n; i++)
            {
                float k = (float)i / n;
                float noise = (float)rng.NextDouble() * 2f - 1f;
                lp += (noise - lp) * Mathf.Lerp(0.05f, 0.35f, k);
                data[i] = lp * Mathf.Sin(Mathf.PI * k) * 0.8f;
            }

            return Make("NR_Whoosh", data);
        }

        private static AudioClip BuildClick()
        {
            int n = (int)(SampleRate * 0.06f);
            var data = new float[n];
            for (int i = 0; i < n; i++)
            {
                float t = (float)i / SampleRate;
                data[i] = Mathf.Sin(2f * Mathf.PI * Mathf.Lerp(1800f, 900f, t / 0.06f) * t) * Mathf.Exp(-t * 60f) * 0.6f;
            }

            return Make("NR_Click", data);
        }
    }
}
