export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { message: "Use POST." } }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  await req.arrayBuffer().catch(() => null);
  return new Response(null, { status: 204 });
};

export const config = {
  path: "/api/feedback"
};
