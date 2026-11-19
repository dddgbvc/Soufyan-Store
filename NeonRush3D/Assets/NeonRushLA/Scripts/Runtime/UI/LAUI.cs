using System;
using NeonRush;
using NeonRushLA.CameraRig;
using NeonRushLA.Gameplay;
using NeonRushLA.Vehicles;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.SceneManagement;
using UnityEngine.UI;

namespace NeonRushLA.UI
{
    /// <summary>
    /// Runtime-built HUD + touch controls + pause menu (landscape, safe-area aware):
    /// speed / RPM / gear, damage, mini-map, FPS + frame time, challenge info; steering,
    /// gas, brake, handbrake, camera, reset and pause buttons; mode, quality, night, paint and
    /// classic-mode options.
    /// </summary>
    public sealed class LAUI : MonoBehaviour
    {
        private VehicleController _car;
        private VehicleDamage _damage;
        private VehicleCamera _camera;
        private LAGame _game;
        private LAQuality _quality;
        private Texture2D _minimapTex;

        private Font _font;
        private RectTransform _safe;
        private Text _speed, _gear, _mode, _info, _fps, _frame, _message, _title;
        private RectTransform _rpmFill, _damageFill;
        private Image _rpmImage;
        private RectTransform _mapContent, _mapArrow;
        private RawImage _map;
        private GameObject _pausePanel, _touchRoot, _fpsRoot;
        private TouchButton _gas, _brake, _left, _right, _hand;
        private float _messageTime;
        private float _hudTimer;
        private int _lastSpeed = -1;
        private string _lastGear = "";
        private Text[] _qualityLabels = new Text[3];

        public static readonly Color[] Paints =
        {
            new Color(0.02f, 0.02f, 0.025f), new Color(0.75f, 0.06f, 0.05f), new Color(0.05f, 0.25f, 0.75f), new Color(0.85f, 0.85f, 0.88f), new Color(0.95f, 0.55f, 0.05f)
        };

        public bool Paused { get; private set; }

        public void Build(VehicleController car, VehicleCamera cam, LAGame game, LAQuality quality, Texture2D minimap)
        {
            _car = car;
            _damage = car.GetComponent<VehicleDamage>();
            _camera = cam;
            _game = game;
            _quality = quality;
            _minimapTex = minimap;
            _font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");

            if (FindObjectOfType<EventSystem>() == null)
            {
                var es = new GameObject("EventSystem");
                es.AddComponent<EventSystem>();
                es.AddComponent<StandaloneInputModule>();
            }

            var canvasGo = new GameObject("LA_UI", typeof(RectTransform));
            canvasGo.transform.SetParent(transform, false);
            var canvas = canvasGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 20;
            var scaler = canvasGo.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920f, 1080f);
            scaler.matchWidthOrHeight = 1f;
            canvasGo.AddComponent<GraphicRaycaster>();
            _safe = Rect("SafeArea", canvasGo.transform, Vector2.zero, Vector2.one);
            _safe.gameObject.AddComponent<SafeAreaFitter>();

            BuildHud();
            BuildTouch();
            BuildPause();

            game.Message += ShowMessage;
            quality.StatsUpdated += OnStats;
            ShowMessage("NEON RUSH: LOS ANGELES");
        }

        private void OnDestroy()
        {
            if (_game != null) _game.Message -= ShowMessage;
            if (_quality != null) _quality.StatsUpdated -= OnStats;
            TouchControls.Clear();
        }

        // ------------------------------------------------------------------ layout helpers

        private RectTransform Rect(string name, Transform parent, Vector2 aMin, Vector2 aMax)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            var rt = (RectTransform)go.transform;
            rt.anchorMin = aMin;
            rt.anchorMax = aMax;
            rt.offsetMin = Vector2.zero;
            rt.offsetMax = Vector2.zero;
            return rt;
        }

        private RectTransform Box(string name, Transform parent, Vector2 anchor, Vector2 pos, Vector2 size, Color color, bool raycast = false)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image));
            go.transform.SetParent(parent, false);
            var rt = (RectTransform)go.transform;
            rt.anchorMin = rt.anchorMax = anchor;
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.anchoredPosition = pos;
            rt.sizeDelta = size;
            var img = go.GetComponent<Image>();
            img.color = color;
            img.raycastTarget = raycast;
            return rt;
        }

        private Text Label(Transform parent, string text, int size, Color color, Vector2 anchor, Vector2 pos, Vector2 box, TextAnchor align = TextAnchor.MiddleCenter, FontStyle style = FontStyle.Bold)
        {
            var go = new GameObject("Text", typeof(RectTransform));
            go.transform.SetParent(parent, false);
            var rt = (RectTransform)go.transform;
            rt.anchorMin = rt.anchorMax = anchor;
            rt.anchoredPosition = pos;
            rt.sizeDelta = box;
            var t = go.AddComponent<Text>();
            t.font = _font;
            t.text = text;
            t.fontSize = size;
            t.color = color;
            t.alignment = align;
            t.fontStyle = style;
            t.raycastTarget = false;
            t.horizontalOverflow = HorizontalWrapMode.Overflow;
            go.AddComponent<Shadow>().effectColor = new Color(0f, 0f, 0f, 0.7f);
            return t;
        }

        private Button MenuButton(Transform parent, string text, Vector2 pos, Vector2 size, Action onClick, Color? color = null)
        {
            RectTransform rt = Box("Btn_" + text, parent, new Vector2(0.5f, 0.5f), pos, size, color ?? new Color(0.12f, 0.1f, 0.2f, 0.92f), true);
            var b = rt.gameObject.AddComponent<Button>();
            b.onClick.AddListener(() => onClick());
            Label(rt, text, 34, Color.white, new Vector2(0.5f, 0.5f), Vector2.zero, size);
            return b;
        }

        // ------------------------------------------------------------------ HUD

        private void BuildHud()
        {
            Color cyan = new Color(0.2f, 0.95f, 1f);
            // Speed cluster (bottom centre)
            RectTransform cluster = Box("Cluster", _safe, new Vector2(0.5f, 0f), new Vector2(0f, 120f), new Vector2(460f, 190f), new Color(0.02f, 0.02f, 0.06f, 0.55f));
            _speed = Label(cluster, "0", 96, Color.white, new Vector2(0.5f, 0.5f), new Vector2(-40f, 18f), new Vector2(260f, 110f), TextAnchor.MiddleRight);
            Label(cluster, "KM/H", 26, cyan, new Vector2(0.5f, 0.5f), new Vector2(45f, 0f), new Vector2(120f, 40f), TextAnchor.MiddleLeft);
            _gear = Label(cluster, "1", 70, new Color(1f, 0.85f, 0.3f), new Vector2(0.5f, 0.5f), new Vector2(160f, 18f), new Vector2(90f, 100f));
            RectTransform rpmBg = Box("RPM", cluster, new Vector2(0.5f, 0.5f), new Vector2(0f, -62f), new Vector2(400f, 18f), new Color(1f, 1f, 1f, 0.12f));
            _rpmFill = Box("Fill", rpmBg, new Vector2(0f, 0.5f), Vector2.zero, new Vector2(0f, 18f), cyan);
            _rpmFill.pivot = new Vector2(0f, 0.5f);
            _rpmImage = _rpmFill.GetComponent<Image>();
            Label(cluster, "RPM", 20, new Color(1f, 1f, 1f, 0.6f), new Vector2(0.5f, 0.5f), new Vector2(-170f, -38f), new Vector2(80f, 26f));

            // Damage bar
            RectTransform dmg = Box("Damage", _safe, new Vector2(0.5f, 0f), new Vector2(0f, 26f), new Vector2(300f, 10f), new Color(1f, 1f, 1f, 0.12f));
            _damageFill = Box("Fill", dmg, new Vector2(0f, 0.5f), Vector2.zero, new Vector2(0f, 10f), new Color(1f, 0.3f, 0.25f));
            _damageFill.pivot = new Vector2(0f, 0.5f);

            // Mini-map (top left), rotates with the car
            RectTransform mapFrame = Box("Minimap", _safe, new Vector2(0f, 1f), new Vector2(170f, -170f), new Vector2(280f, 280f), new Color(0f, 0f, 0f, 0.6f));
            mapFrame.gameObject.AddComponent<RectMask2D>();
            var mapGo = new GameObject("Map", typeof(RectTransform), typeof(RawImage));
            mapGo.transform.SetParent(mapFrame, false);
            _mapContent = (RectTransform)mapGo.transform;
            _mapContent.sizeDelta = new Vector2(1600f, 1600f);
            _map = mapGo.GetComponent<RawImage>();
            _map.texture = _minimapTex;
            _map.raycastTarget = false;
            _mapArrow = Box("Player", mapFrame, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(16f, 24f), new Color(1f, 0.3f, 0.3f));

            // Mode / info (top centre)
            _mode = Label(_safe, "", 34, Color.white, new Vector2(0.5f, 1f), new Vector2(0f, -40f), new Vector2(1000f, 50f));
            _info = Label(_safe, "", 28, new Color(1f, 0.85f, 0.3f), new Vector2(0.5f, 1f), new Vector2(0f, -84f), new Vector2(1000f, 40f));
            _message = Label(_safe, "", 40, cyan, new Vector2(0.5f, 0.5f), new Vector2(0f, 220f), new Vector2(1600f, 60f));
            _title = Label(_safe, "", 30, new Color(1f, 1f, 1f, 0.8f), new Vector2(0.5f, 0.5f), new Vector2(0f, 170f), new Vector2(1600f, 40f));

            // FPS (top right, below the system buttons)
            _fpsRoot = Box("FPS", _safe, new Vector2(1f, 1f), new Vector2(-170f, -200f), new Vector2(300f, 80f), new Color(0f, 0f, 0f, 0.45f)).gameObject;
            _fps = Label(_fpsRoot.transform, "0 FPS", 34, new Color(0.3f, 1f, 0.6f), new Vector2(0.5f, 0.5f), new Vector2(0f, 14f), new Vector2(300f, 44f));
            _frame = Label(_fpsRoot.transform, "", 20, new Color(0.85f, 0.85f, 1f), new Vector2(0.5f, 0.5f), new Vector2(0f, -22f), new Vector2(300f, 30f), TextAnchor.MiddleCenter, FontStyle.Normal);
            _fpsRoot.SetActive(LASave.ShowFps);
        }

        // ------------------------------------------------------------------ touch controls

        private TouchButton HoldButton(string label, Vector2 anchor, Vector2 pos, Vector2 size, Color color)
        {
            RectTransform rt = Box(label, _touchRoot.transform, anchor, pos, size, color, true);
            Label(rt, label, 34, Color.white, new Vector2(0.5f, 0.5f), Vector2.zero, size);
            var b = rt.gameObject.AddComponent<TouchButton>();
            b.Init(color, new Color(color.r * 1.6f + 0.1f, color.g * 1.6f + 0.1f, color.b * 1.6f + 0.1f, 0.9f));
            return b;
        }

        private void BuildTouch()
        {
            _touchRoot = Rect("Touch", _safe, Vector2.zero, Vector2.one).gameObject;
            var dark = new Color(0.1f, 0.1f, 0.16f, 0.45f);
            _left = HoldButton("<", new Vector2(0f, 0f), new Vector2(140f, 150f), new Vector2(200f, 200f), dark);
            _right = HoldButton(">", new Vector2(0f, 0f), new Vector2(370f, 150f), new Vector2(200f, 200f), dark);
            _gas = HoldButton("GAS", new Vector2(1f, 0f), new Vector2(-130f, 190f), new Vector2(190f, 280f), new Color(0.05f, 0.45f, 0.25f, 0.5f));
            _brake = HoldButton("BRAKE", new Vector2(1f, 0f), new Vector2(-350f, 130f), new Vector2(200f, 160f), new Color(0.5f, 0.08f, 0.08f, 0.5f));
            _hand = HoldButton("HAND", new Vector2(1f, 0f), new Vector2(-350f, 310f), new Vector2(200f, 130f), new Color(0.45f, 0.3f, 0.05f, 0.5f));

            TouchButton camBtn = HoldButton("CAM", new Vector2(1f, 1f), new Vector2(-370f, -60f), new Vector2(120f, 80f), dark);
            camBtn.Pressed += () =>
            {
                _camera.Cycle();
                LASave.CameraMode = (int)_camera.Mode;
            };
            TouchButton reset = HoldButton("RESET", new Vector2(1f, 1f), new Vector2(-240f, -60f), new Vector2(130f, 80f), dark);
            reset.Pressed += () => _car.ResetVehicle();
            TouchButton pause = HoldButton("II", new Vector2(1f, 1f), new Vector2(-100f, -60f), new Vector2(110f, 80f), dark);
            pause.Pressed += () => SetPaused(true);
        }

        // ------------------------------------------------------------------ pause menu

        private void BuildPause()
        {
            RectTransform p = Box("Pause", _safe, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(1500f, 900f), new Color(0.02f, 0.01f, 0.05f, 0.9f), true);
            _pausePanel = p.gameObject;
            Label(p, "PAUSED", 70, new Color(0.2f, 0.95f, 1f), new Vector2(0.5f, 0.5f), new Vector2(0f, 380f), new Vector2(800f, 90f));

            float x0 = -470f;
            MenuButton(p, "RESUME", new Vector2(x0, 250f), new Vector2(420f, 90f), () => SetPaused(false), new Color(0.05f, 0.5f, 0.6f, 0.95f));
            MenuButton(p, "FREE ROAM", new Vector2(x0, 140f), new Vector2(420f, 80f), () => StartMode(GameMode.FreeRoam));
            MenuButton(p, "DRIFT CHALLENGE", new Vector2(x0, 50f), new Vector2(420f, 80f), () => StartMode(GameMode.Drift));
            MenuButton(p, "TIME TRIAL", new Vector2(x0, -40f), new Vector2(420f, 80f), () => StartMode(GameMode.TimeTrial));
            MenuButton(p, "HIGHWAY SPRINT", new Vector2(x0, -130f), new Vector2(420f, 80f), () => StartMode(GameMode.HighwaySprint));
            MenuButton(p, "CLASSIC NEON RUSH", new Vector2(x0, -260f), new Vector2(420f, 80f), () =>
            {
                Time.timeScale = 1f;
                SceneManager.LoadScene("NeonRush");
            });

            Label(p, "GRAPHICS", 30, Color.white, new Vector2(0.5f, 0.5f), new Vector2(200f, 260f), new Vector2(600f, 40f));
            string[] q = { "PERFORMANCE", "BALANCED", "QUALITY" };
            for (int i = 0; i < 3; i++)
            {
                int idx = i;
                Button b = MenuButton(p, q[i], new Vector2(-10f + i * 220f, 190f), new Vector2(210f, 74f), () => SetQuality((LAQualityMode)idx));
                _qualityLabels[i] = b.GetComponentInChildren<Text>();
                _qualityLabels[i].fontSize = 24;
            }

            Label(p, "PAINT", 30, Color.white, new Vector2(0.5f, 0.5f), new Vector2(200f, 100f), new Vector2(600f, 40f));
            for (int i = 0; i < Paints.Length; i++)
            {
                int idx = i;
                RectTransform sw = Box("Paint" + i, p, new Vector2(0.5f, 0.5f), new Vector2(-20f + i * 110f, 40f), new Vector2(90f, 70f), Paints[i], true);
                sw.gameObject.AddComponent<Button>().onClick.AddListener(() => SetPaint(idx));
            }

            MenuButton(p, "NIGHT MODE", new Vector2(100f, -70f), new Vector2(300f, 80f), () => SetNight(!_quality.Night));
            MenuButton(p, "SHOW FPS", new Vector2(420f, -70f), new Vector2(300f, 80f), () =>
            {
                LASave.ShowFps = !LASave.ShowFps;
                _fpsRoot.SetActive(LASave.ShowFps);
            });
            MenuButton(p, "CAMERA", new Vector2(100f, -170f), new Vector2(300f, 80f), () => _camera.Cycle());
            MenuButton(p, "REPAIR + RESET", new Vector2(420f, -170f), new Vector2(300f, 80f), () =>
            {
                if (_damage != null) _damage.Repair();
                _car.ResetVehicle();
            });
            Label(p, "Keyboard: W/S or arrows gas/brake · A/D steer · SPACE handbrake · C camera · R reset · ESC pause", 22,
                new Color(0.7f, 0.7f, 0.85f), new Vector2(0.5f, 0.5f), new Vector2(0f, -380f), new Vector2(1400f, 40f), TextAnchor.MiddleCenter, FontStyle.Normal);
            _pausePanel.SetActive(false);
            RefreshQualityLabels();
        }

        public void SetPaused(bool paused)
        {
            Paused = paused;
            _pausePanel.SetActive(paused);
            _touchRoot.SetActive(!paused);
            Time.timeScale = paused ? 0f : 1f;
            AudioListener.pause = paused;
            if (!paused) LASave.Flush();
        }

        private void StartMode(GameMode m)
        {
            SetPaused(false);
            _game.StartMode(m);
        }

        public void SetQuality(LAQualityMode m)
        {
            _quality.SetMode(m);
            LASave.Quality = (int)m;
            RefreshQualityLabels();
        }

        private void RefreshQualityLabels()
        {
            for (int i = 0; i < 3; i++)
            {
                if (_qualityLabels[i] != null) _qualityLabels[i].color = i == (int)_quality.Mode ? new Color(0.2f, 0.95f, 1f) : Color.white;
            }
        }

        public void SetPaint(int i)
        {
            i = Mathf.Clamp(i, 0, Paints.Length - 1);
            LASave.PaintIndex = i;
            if (_damage != null) _damage.SetPaintColor(Paints[i]);
        }

        public void SetNight(bool night)
        {
            _quality.SetNight(night);
            LASave.Night = night;
        }

        private void ShowMessage(string m)
        {
            _message.text = m;
            _messageTime = 4f;
        }

        // ------------------------------------------------------------------ per frame

        private void Update()
        {
            TouchControls.Gas = _gas != null && _gas.IsHeld;
            TouchControls.Brake = _brake != null && _brake.IsHeld;
            TouchControls.Left = _left != null && _left.IsHeld;
            TouchControls.Right = _right != null && _right.IsHeld;
            TouchControls.Handbrake = _hand != null && _hand.IsHeld;

            if (Input.GetKeyDown(KeyCode.Escape)) SetPaused(!Paused);
            if (Input.GetKeyDown(KeyCode.C)) _camera.Cycle();
            if (Input.GetKeyDown(KeyCode.R)) _car.ResetVehicle();

            if (_messageTime > 0f)
            {
                _messageTime -= Time.unscaledDeltaTime;
                if (_messageTime <= 0f) _message.text = "";
            }

            // Mini-map: centre on the car, rotate so the car points up.
            Vector3 p = _car.transform.position;
            float scale = _mapContent.sizeDelta.x / (City.CityLayout.HalfSize * 2f);
            _mapContent.localRotation = Quaternion.Euler(0f, 0f, _car.transform.eulerAngles.y);
            _mapContent.anchoredPosition = _mapContent.localRotation * new Vector3(-p.x * scale, -p.z * scale, 0f);

            _hudTimer -= Time.unscaledDeltaTime;
            if (_hudTimer > 0f) return;
            _hudTimer = 0.066f;
            int kmh = Mathf.RoundToInt(_car.SpeedKmh);
            if (kmh != _lastSpeed)
            {
                _lastSpeed = kmh;
                _speed.text = NumberCache.Get(kmh);
            }

            if (_car.GearLabel != _lastGear)
            {
                _lastGear = _car.GearLabel;
                _gear.text = _lastGear;
            }

            float rpm = _car.Rpm01;
            _rpmFill.sizeDelta = new Vector2(400f * rpm, 18f);
            _rpmImage.color = rpm > 0.9f ? new Color(1f, 0.25f, 0.2f) : new Color(0.2f, 0.95f, 1f);
            if (_damage != null) _damageFill.sizeDelta = new Vector2(300f * _damage.Damage / 100f, 10f);

            switch (_game.Mode)
            {
                case GameMode.Drift when _game.Running:
                    _mode.text = "DRIFT  " + Mathf.CeilToInt(_game.Timer) + "s";
                    _info.text = "SCORE " + Mathf.RoundToInt(_game.DriftScore) + (_game.Drifting ? "   x" + _game.DriftMultiplier.ToString("0.0") : "");
                    break;
                case GameMode.TimeTrial when _game.Running:
                case GameMode.HighwaySprint when _game.Running:
                    _mode.text = (_game.Mode == GameMode.TimeTrial ? "TIME TRIAL  " : "HIGHWAY SPRINT  ") + _game.Timer.ToString("0.0") + "s";
                    _info.text = "GATE " + (_game.Checkpoint + 1) + "/" + _game.CheckpointCount;
                    break;
                default:
                    _mode.text = "FREE ROAM";
                    _info.text = _game.Drifting ? "DRIFT x" + _game.DriftMultiplier.ToString("0.0") : _game.LastResult;
                    break;
            }
        }

        private void OnStats()
        {
            if (!_fpsRoot.activeSelf) return;
            _fps.text = NumberCache.Get(Mathf.RoundToInt(_quality.Fps)) + " FPS";
            float ratio = _quality.Fps / Mathf.Max(1, _quality.TargetFps);
            _fps.color = ratio >= 0.95f ? new Color(0.3f, 1f, 0.6f) : ratio >= 0.75f ? new Color(1f, 0.85f, 0.2f) : new Color(1f, 0.3f, 0.35f);
            _frame.text = _quality.AvgMs.ToString("0.0") + " ms · " + NumberCache.Get(_quality.TargetFps) + " Hz · " + NumberCache.Get(Mathf.RoundToInt(_quality.RenderScale * 100f)) + "%";
        }
    }
}
