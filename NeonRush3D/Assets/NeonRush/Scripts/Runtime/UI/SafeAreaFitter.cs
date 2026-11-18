using UnityEngine;

namespace NeonRush
{
    /// <summary>
    /// Fits a RectTransform to Screen.safeArea (notch / Dynamic Island / home indicator),
    /// re-checking only when the screen or safe area actually changes.
    /// </summary>
    [RequireComponent(typeof(RectTransform))]
    public sealed class SafeAreaFitter : MonoBehaviour
    {
        private RectTransform _rect;
        private Rect _lastSafe;
        private Vector2Int _lastSize;

        private void Awake()
        {
            _rect = (RectTransform)transform;
            Apply();
        }

        private void Update()
        {
            if (Screen.safeArea != _lastSafe || Screen.width != _lastSize.x || Screen.height != _lastSize.y)
            {
                Apply();
            }
        }

        public static void ComputeAnchors(Rect safe, int screenWidth, int screenHeight, out Vector2 min, out Vector2 max)
        {
            if (screenWidth <= 0 || screenHeight <= 0)
            {
                min = Vector2.zero;
                max = Vector2.one;
                return;
            }

            min = new Vector2(safe.xMin / screenWidth, safe.yMin / screenHeight);
            max = new Vector2(safe.xMax / screenWidth, safe.yMax / screenHeight);
            min.x = Mathf.Clamp01(min.x);
            min.y = Mathf.Clamp01(min.y);
            max.x = Mathf.Clamp01(max.x);
            max.y = Mathf.Clamp01(max.y);
        }

        private void Apply()
        {
            _lastSafe = Screen.safeArea;
            _lastSize = new Vector2Int(Screen.width, Screen.height);
            ComputeAnchors(_lastSafe, Screen.width, Screen.height, out Vector2 min, out Vector2 max);
            _rect.anchorMin = min;
            _rect.anchorMax = max;
            _rect.offsetMin = Vector2.zero;
            _rect.offsetMax = Vector2.zero;
        }
    }
}
