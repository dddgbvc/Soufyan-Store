using UnityEngine;

namespace NeonRushLA.Gameplay
{
    /// <summary>Local, offline save (PlayerPrefs) for LA mode.</summary>
    public static class LASave
    {
        private const string P = "neonrushla.";

        public static int Quality
        {
            get => Mathf.Clamp(PlayerPrefs.GetInt(P + "quality", -1), -1, 2);
            set => PlayerPrefs.SetInt(P + "quality", value);
        }

        public static bool Night
        {
            get => PlayerPrefs.GetInt(P + "night", 0) == 1;
            set => PlayerPrefs.SetInt(P + "night", value ? 1 : 0);
        }

        public static int PaintIndex
        {
            get => PlayerPrefs.GetInt(P + "paint", 0);
            set => PlayerPrefs.SetInt(P + "paint", value);
        }

        public static int CameraMode
        {
            get => PlayerPrefs.GetInt(P + "camera", 0);
            set => PlayerPrefs.SetInt(P + "camera", value);
        }

        public static bool ShowFps
        {
            get => PlayerPrefs.GetInt(P + "fps", 1) == 1;
            set => PlayerPrefs.SetInt(P + "fps", value ? 1 : 0);
        }

        public static float BestDrift
        {
            get => PlayerPrefs.GetFloat(P + "bestdrift", 0f);
            set => PlayerPrefs.SetFloat(P + "bestdrift", value);
        }

        public static float BestTimeTrial
        {
            get => PlayerPrefs.GetFloat(P + "besttt", 0f);
            set => PlayerPrefs.SetFloat(P + "besttt", value);
        }

        public static float BestSprint
        {
            get => PlayerPrefs.GetFloat(P + "bestsprint", 0f);
            set => PlayerPrefs.SetFloat(P + "bestsprint", value);
        }

        public static float Odometer
        {
            get => PlayerPrefs.GetFloat(P + "odo", 0f);
            set => PlayerPrefs.SetFloat(P + "odo", value);
        }

        public static void Flush()
        {
            PlayerPrefs.Save();
        }

        public static void DeleteAll()
        {
            foreach (string k in new[] { "quality", "night", "paint", "camera", "fps", "bestdrift", "besttt", "bestsprint", "odo" })
            {
                PlayerPrefs.DeleteKey(P + k);
            }
        }
    }
}
