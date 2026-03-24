import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
const clerkFrontendApi = process.env.NEXT_PUBLIC_CLERK_FRONTEND_API;
const clerkOrigin = clerkFrontendApi
  ? `https://${clerkFrontendApi}`
  : isDev
    ? "https://*.clerk.accounts.dev"
    : "";
const clerkCspSource = clerkOrigin ? ` ${clerkOrigin}` : "";

const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${clerkCspSource} https://challenges.cloudflare.com https://www.youtube.com https://s.ytimg.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data: https://img.clerk.com https://image.mux.com https://i.ytimg.com;
  font-src 'self';
  connect-src 'self'${clerkCspSource} https://api.openai.com https://*.mux.com https://*.upstash.io https://vercel.com;
  frame-src https://challenges.cloudflare.com https://www.youtube.com https://www.youtube-nocookie.com;
  media-src 'self' blob: https://stream.mux.com https://*.mux.com;
  worker-src 'self' blob:;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`.replace(/\n/g, "").replace(/\s{2,}/g, " ").trim();

const nextConfig: NextConfig = {
  serverExternalPackages: ["jieba-wasm"],
  async rewrites() {
    return [
      {
        // Proxy Vercel Blob uploads through our own domain so the browser
        // makes a same-origin request — avoids CORS issues entirely.
        source: "/api/blob-proxy",
        destination: "https://vercel.com/api/blob/",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Content-Security-Policy",
            value: cspHeader,
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
