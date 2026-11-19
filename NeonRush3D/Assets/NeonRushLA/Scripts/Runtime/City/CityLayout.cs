using System.Collections.Generic;
using UnityEngine;

namespace NeonRushLA.City
{
    public enum BlockKind
    {
        Downtown,
        Commercial,
        Residential,
        Parking,
        FreewayPark
    }

    /// <summary>
    /// The street plan of the LA-inspired district (pure data, deterministic). A 7×7 grid of
    /// streets (6-lane boulevards and 4-lane streets) on 130 m spacing covering 800×800 m, an
    /// elevated 6-lane freeway with bridges and ramps, a lane graph for traffic and a
    /// sidewalk/crosswalk graph for pedestrians.
    /// </summary>
    public sealed class CityLayout
    {
        public const float HalfSize = 400f;
        public const float LaneWidth = 3.4f;
        public const float SidewalkWidth = 4.2f;
        public const float CurbHeight = 0.15f;

        public static readonly float[] Lines = { -390f, -260f, -130f, 0f, 130f, 260f, 390f };

        // Freeway (east–west, elevated)
        public const float FreewayZ = 325f;
        public const float FreewayHeight = 8.5f;
        public const float FreewayHalfWidth = 12.5f;
        public const float FreewayDeckStart = -320f;
        public const float FreewayDeckEnd = 320f;
        public const float FreewayRampEnd = 387f;

        public readonly int Seed;
        public readonly List<Block> Blocks = new List<Block>();
        public readonly List<LaneEdge> Lanes = new List<LaneEdge>();
        public readonly List<Intersection> Intersections = new List<Intersection>();
        public readonly List<WalkNode> WalkNodes = new List<WalkNode>();

        public sealed class Block
        {
            public int Ix, Iz;
            public BlockKind Kind;
            public Rect Lot;        // inside the sidewalks
            public Rect Footprint;  // lot + sidewalks (raised area)
            public Vector2 Center => Footprint.center;
            public int[] CornerNodes = new int[4]; // SW, SE, NE, NW walk nodes
        }

        public sealed class Intersection
        {
            public int Ix, Iz;
            public Vector3 Position;
            public float PhaseOffset;
            public readonly List<int> Incoming = new List<int>();
            public readonly List<int> Outgoing = new List<int>();
        }

        /// <summary>One directed lane between two intersections.</summary>
        public sealed class LaneEdge
        {
            public int Id;
            public int From, To;        // intersection indices
            public int LaneIndex;       // 0 = innermost (next to the centre line)
            public int LanesInDirection;
            public Vector3 Start, End;  // lane centreline, from stop line to stop line
            public Vector3 Direction;
            public bool AlongZ;         // vertical road (north/south) → "NS" signal phase
            public float Length;
            public float SpeedLimit;
        }

        public sealed class WalkNode
        {
            public Vector3 Position;
            public readonly List<int> Links = new List<int>();
            public readonly List<bool> IsCrossing = new List<bool>();
            public readonly List<int> CrossIntersection = new List<int>();
            public readonly List<bool> CrossesAlongZRoad = new List<bool>();
        }

        public CityLayout(int seed = 2077)
        {
            Seed = seed;
            BuildBlocks();
            BuildIntersectionsAndLanes();
            BuildWalkGraph();
        }

        public static int LanesPerDirection(int lineIndex)
        {
            return lineIndex >= 2 && lineIndex <= 4 ? 3 : 2;
        }

        public static float RoadHalfWidth(int lineIndex)
        {
            int lanes = LanesPerDirection(lineIndex);
            return lanes * LaneWidth + (lanes == 3 ? 0.6f : 0.15f);
        }

        public static float MedianHalf(int lineIndex)
        {
            return LanesPerDirection(lineIndex) == 3 ? 0.6f : 0.15f;
        }

        // ------------------------------------------------------------------ blocks

        private void BuildBlocks()
        {
            for (int ix = 0; ix < Lines.Length - 1; ix++)
            {
                for (int iz = 0; iz < Lines.Length - 1; iz++)
                {
                    float x0 = Lines[ix] + RoadHalfWidth(ix);
                    float x1 = Lines[ix + 1] - RoadHalfWidth(ix + 1);
                    float z0 = Lines[iz] + RoadHalfWidth(iz);
                    float z1 = Lines[iz + 1] - RoadHalfWidth(iz + 1);
                    var fp = Rect.MinMaxRect(x0, z0, x1, z1);
                    var lot = Rect.MinMaxRect(x0 + SidewalkWidth, z0 + SidewalkWidth, x1 - SidewalkWidth, z1 - SidewalkWidth);
                    Vector2 c = fp.center;
                    BlockKind kind;
                    if (ix == 2 && iz == 2) kind = BlockKind.Parking;
                    else if (iz == 5) kind = BlockKind.FreewayPark;
                    else if (Mathf.Abs(c.x) < 140f && Mathf.Abs(c.y) < 200f) kind = BlockKind.Downtown;
                    else if (Mathf.Abs(c.x) < 270f && Mathf.Abs(c.y) < 270f) kind = BlockKind.Commercial;
                    else kind = BlockKind.Residential;
                    Blocks.Add(new Block { Ix = ix, Iz = iz, Kind = kind, Lot = lot, Footprint = fp });
                }
            }
        }

        public Block BlockAt(int ix, int iz)
        {
            if (ix < 0 || iz < 0 || ix >= Lines.Length - 1 || iz >= Lines.Length - 1) return null;
            return Blocks[ix * (Lines.Length - 1) + iz];
        }

        public Block ParkingBlock => BlockAt(2, 2);

        // ------------------------------------------------------------------ lanes

        private int NodeIndex(int ix, int iz) => ix * Lines.Length + iz;

        private void BuildIntersectionsAndLanes()
        {
            var rng = new System.Random(Seed);
            for (int ix = 0; ix < Lines.Length; ix++)
            {
                for (int iz = 0; iz < Lines.Length; iz++)
                {
                    Intersections.Add(new Intersection
                    {
                        Ix = ix, Iz = iz, Position = new Vector3(Lines[ix], 0f, Lines[iz]), PhaseOffset = (float)rng.NextDouble() * 30f
                    });
                }
            }

            // Roads along X (constant z = Lines[iz]) connect (ix, iz) → (ix+1, iz).
            for (int iz = 0; iz < Lines.Length; iz++)
            {
                for (int ix = 0; ix < Lines.Length - 1; ix++)
                {
                    AddRoadLanes(NodeIndex(ix, iz), NodeIndex(ix + 1, iz), iz, false);
                }
            }

            // Roads along Z (constant x = Lines[ix]).
            for (int ix = 0; ix < Lines.Length; ix++)
            {
                for (int iz = 0; iz < Lines.Length - 1; iz++)
                {
                    AddRoadLanes(NodeIndex(ix, iz), NodeIndex(ix, iz + 1), ix, true);
                }
            }
        }

        private void AddRoadLanes(int a, int b, int roadLine, bool alongZ)
        {
            int lanes = LanesPerDirection(roadLine);
            float median = MedianHalf(roadLine);
            float limit = lanes == 3 ? 17f : 13f;
            for (int dir = 0; dir < 2; dir++)
            {
                int from = dir == 0 ? a : b;
                int to = dir == 0 ? b : a;
                Vector3 p0 = Intersections[from].Position;
                Vector3 p1 = Intersections[to].Position;
                Vector3 d = (p1 - p0).normalized;
                Vector3 right = new Vector3(d.z, 0f, -d.x);
                // Stop lines sit just outside the crossing road.
                float crossFrom = RoadHalfWidth(alongZ ? Intersections[from].Iz : Intersections[from].Ix) + 3.5f;
                float crossTo = RoadHalfWidth(alongZ ? Intersections[to].Iz : Intersections[to].Ix) + 3.5f;
                for (int k = 0; k < lanes; k++)
                {
                    float off = median + (k + 0.5f) * LaneWidth;
                    var e = new LaneEdge
                    {
                        Id = Lanes.Count, From = from, To = to, LaneIndex = k, LanesInDirection = lanes, AlongZ = alongZ, Direction = d,
                        Start = p0 + d * crossFrom + right * off, End = p1 - d * crossTo + right * off, SpeedLimit = limit,
                    };
                    e.Length = (e.End - e.Start).magnitude;
                    Lanes.Add(e);
                    Intersections[from].Outgoing.Add(e.Id);
                    Intersections[to].Incoming.Add(e.Id);
                }
            }
        }

        // ------------------------------------------------------------------ pedestrians

        private void BuildWalkGraph()
        {
            float inset = SidewalkWidth * 0.5f;
            foreach (Block b in Blocks)
            {
                Rect f = b.Footprint;
                var corners = new[]
                {
                    new Vector3(f.xMin + inset, CurbHeight, f.yMin + inset),
                    new Vector3(f.xMax - inset, CurbHeight, f.yMin + inset),
                    new Vector3(f.xMax - inset, CurbHeight, f.yMax - inset),
                    new Vector3(f.xMin + inset, CurbHeight, f.yMax - inset),
                };
                for (int i = 0; i < 4; i++)
                {
                    b.CornerNodes[i] = WalkNodes.Count;
                    WalkNodes.Add(new WalkNode { Position = corners[i] });
                }

                for (int i = 0; i < 4; i++) Link(b.CornerNodes[i], b.CornerNodes[(i + 1) % 4], false, -1, false);
            }

            // Crosswalks between neighbouring blocks.
            foreach (Block b in Blocks)
            {
                Block east = BlockAt(b.Ix + 1, b.Iz);
                if (east != null)
                {
                    int inter = NodeIndex(b.Ix + 1, b.Iz + 1);
                    Link(b.CornerNodes[2], east.CornerNodes[3], true, inter, true);   // NE → NW across a N–S road
                    int inter2 = NodeIndex(b.Ix + 1, b.Iz);
                    Link(b.CornerNodes[1], east.CornerNodes[0], true, inter2, true);
                }

                Block north = BlockAt(b.Ix, b.Iz + 1);
                if (north != null)
                {
                    int inter = NodeIndex(b.Ix + 1, b.Iz + 1);
                    Link(b.CornerNodes[2], north.CornerNodes[1], true, inter, false); // NE → SE across an E–W road
                    int inter2 = NodeIndex(b.Ix, b.Iz + 1);
                    Link(b.CornerNodes[3], north.CornerNodes[0], true, inter2, false);
                }
            }
        }

        private void Link(int a, int b, bool crossing, int intersection, bool acrossAlongZRoad)
        {
            WalkNodes[a].Links.Add(b);
            WalkNodes[a].IsCrossing.Add(crossing);
            WalkNodes[a].CrossIntersection.Add(intersection);
            WalkNodes[a].CrossesAlongZRoad.Add(acrossAlongZRoad);
            WalkNodes[b].Links.Add(a);
            WalkNodes[b].IsCrossing.Add(crossing);
            WalkNodes[b].CrossIntersection.Add(intersection);
            WalkNodes[b].CrossesAlongZRoad.Add(acrossAlongZRoad);
        }

        // ------------------------------------------------------------------ queries

        /// <summary>Signal state for a direction at an intersection (shared by traffic, peds and lamps).</summary>
        public static float CycleLength => 34f;

        /// <summary>0 = green, 1 = yellow, 2 = red for traffic travelling along Z (alongZ) or X.</summary>
        public int SignalState(int intersection, bool alongZ, float time)
        {
            float t = Mathf.Repeat(time + Intersections[intersection].PhaseOffset, CycleLength);
            // 0-13 NS green, 13-16 NS yellow, 16-17 all red, 17-30 EW green, 30-33 EW yellow, 33-34 all red
            if (alongZ)
            {
                if (t < 13f) return 0;
                if (t < 16f) return 1;
                return 2;
            }

            if (t >= 17f && t < 30f) return 0;
            if (t >= 30f && t < 33f) return 1;
            return 2;
        }

        public bool IsOnRoad(Vector3 p)
        {
            for (int i = 0; i < Lines.Length; i++)
            {
                if (Mathf.Abs(p.x - Lines[i]) < RoadHalfWidth(i) && Mathf.Abs(p.z) < HalfSize) return true;
                if (Mathf.Abs(p.z - Lines[i]) < RoadHalfWidth(i) && Mathf.Abs(p.x) < HalfSize) return true;
            }

            return false;
        }

        /// <summary>Nearest lane point (for respawning the player on the road).</summary>
        public Vector3 NearestRoadPoint(Vector3 p, out Vector3 direction)
        {
            float best = float.MaxValue;
            Vector3 bestP = p;
            direction = Vector3.forward;
            foreach (LaneEdge e in Lanes)
            {
                Vector3 ab = e.End - e.Start;
                float t = Mathf.Clamp01(Vector3.Dot(p - e.Start, ab) / Mathf.Max(1e-4f, ab.sqrMagnitude));
                Vector3 q = e.Start + ab * t;
                float d = (q - p).sqrMagnitude;
                if (d < best)
                {
                    best = d;
                    bestP = q;
                    direction = e.Direction;
                }
            }

            return bestP;
        }

        /// <summary>Player spawn inside the parking lot, nose towards the exit.</summary>
        public Vector3 PlayerSpawn(out Quaternion rotation)
        {
            Block p = ParkingBlock;
            rotation = Quaternion.Euler(0f, 90f, 0f); // facing +X
            return new Vector3(p.Lot.center.x - 10f, CurbHeight + 0.6f, p.Lot.center.y);
        }

        /// <summary>Time-trial checkpoints (intersections forming a loop through downtown).</summary>
        public Vector3[] TimeTrialRoute()
        {
            return new[]
            {
                new Vector3(0f, 0f, -130f), new Vector3(130f, 0f, -130f), new Vector3(130f, 0f, 130f),
                new Vector3(-130f, 0f, 130f), new Vector3(-130f, 0f, -130f), new Vector3(-65f, 0f, -130f),
            };
        }
    }
}
