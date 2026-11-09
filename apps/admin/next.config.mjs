/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Anti-clickjacking + sniffing hardening on every route. Deliberately no
  // script-src CSP (Next inlines scripts). The analytics page frames PostHog
  // (outbound); frame-ancestors only restricts who may frame *us*.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }
        ]
      }
    ];
  },
  transpilePackages: [
    "@iskotify/ui",
    "@iskotify/utils",
    "nativewind",
    "react-native",
    "react-native-web",
    "react-native-css-interop"
  ],
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "react-native$": "react-native-web"
    };
    config.resolve.extensions = [
      ".web.tsx",
      ".web.ts",
      ".web.jsx",
      ".web.js",
      ...config.resolve.extensions
    ];
    return config;
  }
};

export default nextConfig;
