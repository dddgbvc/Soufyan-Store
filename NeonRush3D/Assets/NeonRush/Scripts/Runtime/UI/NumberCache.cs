namespace NeonRush
{
    /// <summary>Pre-built strings for small integers so HUD counters do not allocate.</summary>
    public static class NumberCache
    {
        private const int Size = 1000;
        private static readonly string[] Cache = Build();

        private static string[] Build()
        {
            var arr = new string[Size];
            for (int i = 0; i < Size; i++)
            {
                arr[i] = i.ToString();
            }

            return arr;
        }

        public static string Get(int value)
        {
            if (value >= 0 && value < Size)
            {
                return Cache[value];
            }

            return value.ToString();
        }
    }
}
