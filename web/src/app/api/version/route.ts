export const dynamic = "force-dynamic";

// Public build metadata only; no session or application data is exposed.
export function GET() {
  return Response.json(
    { version: process.env.NEXT_PUBLIC_APP_BUILD_VERSION || null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
