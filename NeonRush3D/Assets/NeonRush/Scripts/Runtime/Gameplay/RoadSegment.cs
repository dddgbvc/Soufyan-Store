using UnityEngine;

namespace NeonRush
{
    /// <summary>
    /// One recyclable slice of road (pivot at its start, extends +Z by Length).
    /// Road, lane lines and rails are pre-combined meshes; buildings are re-shaped on recycle
    /// so the skyline never repeats, without allocating.
    /// </summary>
    public sealed class RoadSegment : MonoBehaviour
    {
        [SerializeField] private float length = 20f;
        [SerializeField] private Transform[] buildings = new Transform[0];
        [SerializeField] private Transform[] buildingTrims = new Transform[0];
        [SerializeField] private float buildingEdgeX = 7f;
        [SerializeField] private Vector2 heightRange = new Vector2(7f, 30f);
        [SerializeField] private Vector2 widthRange = new Vector2(4f, 8f);
        [SerializeField] private Vector2 depthRange = new Vector2(6f, 9.5f);

        public float Length => length;
        public int BuildingCount => buildings.Length;

        public void Randomize()
        {
            for (int i = 0; i < buildings.Length; i++)
            {
                Transform b = buildings[i];
                if (b == null)
                {
                    continue;
                }

                float side = b.localPosition.x >= 0f ? 1f : -1f;
                float h = Random.Range(heightRange.x, heightRange.y);
                float w = Random.Range(widthRange.x, widthRange.y);
                float d = Random.Range(depthRange.x, depthRange.y);
                float z = b.localPosition.z;

                b.localScale = new Vector3(w, h, d);
                b.localPosition = new Vector3(side * (buildingEdgeX + w * 0.5f), h * 0.5f, z);

                if (i < buildingTrims.Length && buildingTrims[i] != null)
                {
                    Transform trim = buildingTrims[i];
                    float trimY = h * Random.Range(0.55f, 0.92f);
                    trim.localScale = new Vector3(0.12f, 0.12f, d * 0.98f);
                    trim.localPosition = new Vector3(side * (buildingEdgeX - 0.02f), trimY, z);
                }
            }
        }
    }
}
