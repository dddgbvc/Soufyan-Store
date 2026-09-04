/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Provider secrets are read on the server only. Nothing here is exposed to the browser
  // beyond NEXT_PUBLIC_* values, which are documented in .env.example.
};

export default nextConfig;
