using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace NeonRushLA.UI
{
    /// <summary>
    /// Hold-able multi-touch button: stays pressed while any finger that started on it is
    /// down (sliding off does not release — forgiving for driving). Also fires a tap event.
    /// </summary>
    public sealed class TouchButton : MonoBehaviour, IPointerDownHandler, IPointerUpHandler
    {
        private readonly HashSet<int> _pointers = new HashSet<int>();
        private Image _image;
        private Color _idle;
        private Color _pressed;

        public event Action Pressed;
        public bool IsHeld => _pointers.Count > 0;

        public void Init(Color idle, Color pressed)
        {
            _image = GetComponent<Image>();
            _idle = idle;
            _pressed = pressed;
            if (_image != null) _image.color = idle;
        }

        public void OnPointerDown(PointerEventData e)
        {
            _pointers.Add(e.pointerId);
            if (_image != null) _image.color = _pressed;
            Pressed?.Invoke();
        }

        public void OnPointerUp(PointerEventData e)
        {
            _pointers.Remove(e.pointerId);
            if (_pointers.Count == 0 && _image != null) _image.color = _idle;
        }

        private void OnDisable()
        {
            _pointers.Clear();
            if (_image != null) _image.color = _idle;
        }
    }
}
