import QRCode from "qrcode";

/**
 * QR code image for the ticket email (Gmail blocks images built into the
 * email itself, so they're hosted here). It only draws the code it's given:
 * whether a code is a real ticket is decided at the door, by its signature.
 * So this needs no database and reveals nothing.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/qr/[token]">) {
  const { token } = await ctx.params;
  if (!/^D1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{16}$/.test(token)) {
    return new Response("Not found", { status: 404 });
  }
  const png = await QRCode.toBuffer(token, {
    type: "png",
    width: 440,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#1a1a1fff", light: "#ffffffff" },
  });
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      // The same token always draws the same picture.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
