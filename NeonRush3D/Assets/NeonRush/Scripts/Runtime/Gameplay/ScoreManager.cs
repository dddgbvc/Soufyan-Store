using UnityEngine;

namespace NeonRush
{
    /// <summary>
    /// Distance-based scoring: 1 point per metre, multiplied by a bonus that grows by x0.25
    /// every 500 m (capped at x3). High score is stored locally.
    /// </summary>
    public sealed class ScoreManager : MonoBehaviour
    {
        public const float MetresPerMultiplierStep = 500f;
        public const float MultiplierStep = 0.25f;
        public const float MaxMultiplier = 3f;

        private LocalSaveManager _save;

        public float Distance { get; private set; }
        public float Score { get; private set; }
        public float Multiplier { get; private set; } = 1f;
        public int HighScore { get; private set; }
        public bool NewHighScore { get; private set; }

        public int ScoreInt => (int)Score;
        public int DistanceInt => (int)Distance;

        public void Init(LocalSaveManager save)
        {
            _save = save;
            HighScore = save != null ? save.LoadHighScore() : 0;
        }

        public void ResetRun()
        {
            Distance = 0f;
            Score = 0f;
            Multiplier = 1f;
            NewHighScore = false;
        }

        public static float MultiplierForDistance(float distance)
        {
            float steps = Mathf.Floor(Mathf.Max(0f, distance) / MetresPerMultiplierStep);
            return Mathf.Min(1f + steps * MultiplierStep, MaxMultiplier);
        }

        public void Tick(float metres)
        {
            if (metres <= 0f)
            {
                return;
            }

            Distance += metres;
            Multiplier = MultiplierForDistance(Distance);
            Score += metres * Multiplier;
        }

        /// <summary>Stores the high score if beaten. Returns true for a new record.</summary>
        public bool CommitRun()
        {
            if (ScoreInt > HighScore)
            {
                HighScore = ScoreInt;
                NewHighScore = true;
                if (_save != null)
                {
                    _save.SaveHighScore(HighScore);
                    _save.Flush();
                }
            }

            return NewHighScore;
        }
    }
}
