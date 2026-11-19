using System.Collections.Generic;
using UnityEngine;

namespace NeonRushLA.Geometry
{
    /// <summary>Monotone cubic (Fritsch–Carlson) interpolation through (x, y) keys. Pure managed.</summary>
    public sealed class Curve1D
    {
        private readonly float[] _x;
        private readonly float[] _y;
        private readonly float[] _m;

        public Curve1D(params Vector2[] keys)
        {
            var list = new List<Vector2>(keys);
            list.Sort((a, b) => a.x.CompareTo(b.x));
            int n = list.Count;
            _x = new float[n];
            _y = new float[n];
            _m = new float[n];
            for (int i = 0; i < n; i++)
            {
                _x[i] = list[i].x;
                _y[i] = list[i].y;
            }

            if (n < 2) return;
            var d = new float[n - 1];
            for (int i = 0; i < n - 1; i++)
            {
                float dx = Mathf.Max(1e-6f, _x[i + 1] - _x[i]);
                d[i] = (_y[i + 1] - _y[i]) / dx;
            }

            _m[0] = d[0];
            _m[n - 1] = d[n - 2];
            for (int i = 1; i < n - 1; i++)
            {
                _m[i] = d[i - 1] * d[i] <= 0f ? 0f : (d[i - 1] + d[i]) * 0.5f;
            }

            for (int i = 0; i < n - 1; i++)
            {
                if (Mathf.Abs(d[i]) < 1e-9f)
                {
                    _m[i] = 0f;
                    _m[i + 1] = 0f;
                    continue;
                }

                float a = _m[i] / d[i];
                float b = _m[i + 1] / d[i];
                float s = a * a + b * b;
                if (s > 9f)
                {
                    float t = 3f / Mathf.Sqrt(s);
                    _m[i] = t * a * d[i];
                    _m[i + 1] = t * b * d[i];
                }
            }
        }

        public float Evaluate(float x)
        {
            int n = _x.Length;
            if (n == 0) return 0f;
            if (x <= _x[0]) return _y[0];
            if (x >= _x[n - 1]) return _y[n - 1];
            int i = 0;
            while (i < n - 2 && x > _x[i + 1]) i++;
            float h = _x[i + 1] - _x[i];
            float t = (x - _x[i]) / h;
            float t2 = t * t, t3 = t2 * t;
            float h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
            return h00 * _y[i] + h10 * h * _m[i] + h01 * _y[i + 1] + h11 * h * _m[i + 1];
        }
    }
}
