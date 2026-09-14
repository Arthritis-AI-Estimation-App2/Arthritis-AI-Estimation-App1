import { readFileSync } from "node:fs";

// npm run build generates this ID once. Embed it in both server and client
// bundles so server restarts and replicas of the same build keep the same ID.
const appVersion = process.env.NODE_ENV === "production"
  ? JSON.parse(readFileSync(new URL("./app-version.json", import.meta.url), "utf8")).version
  : "";

function getSupabaseOrigin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;

  try {
    return new URL(supabaseUrl).origin;
  } catch {
    console.warn("NEXT_PUBLIC_SUPABASE_URL is not a valid URL");
    return null;
  }
}

const supabaseOrigin = getSupabaseOrigin();
const supabaseSource = supabaseOrigin ? ` ${supabaseOrigin}` : "";
const scriptSource =
  process.env.NODE_ENV === "development"
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "frame-src 'none'",
      "object-src 'none'",
      scriptSource,
      "style-src 'self' 'unsafe-inline'",
      `connect-src 'self'${supabaseSource}`,
      `img-src 'self' blob: data:${supabaseSource}`,
      "media-src 'self' blob:",
      "font-src 'self' data:",
      "worker-src 'self' blob:",
    ].join("; "),
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { NEXT_PUBLIC_APP_BUILD_VERSION: appVersion },
  turbopack: {
    root: import.meta.dirname,
  },
  outputFileTracingRoot: import.meta.dirname,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
