import { withBinarySession } from "@/lib/server-auth";
import { clipImageKey, isClipImageType } from "@/lib/clip-images";

/** Images are owner-only even when their content hashes are known. Bearer upload tokens cannot read. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return withBinarySession(request, async ({ session, env }) => {
    const { id } = await context.params;
    if (!/^[a-f0-9]{64}$/.test(id)) return new Response("Not found", { status: 404 });
    const image = await env.RSS_DATA.get(clipImageKey(session.userId, id));
    const type = image?.httpMetadata?.contentType ?? "";
    if (!image || !isClipImageType(type)) return new Response("Not found", { status: 404 });
    return new Response(image.body, {
      headers: {
        "Content-Type": type,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  });
}
