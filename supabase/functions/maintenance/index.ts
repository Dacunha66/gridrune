// Switched off: the one-off picture cleanup of 17.11.2026 is done. Kept only as an empty stub.
// (How it worked: a single-use key whose SHA-256 was stored in private.maintenance_tokens, the expected number of
// pictures from private.orphan_images(), then removal through the storage API – SQL may not delete stored files.)
Deno.serve(() => new Response(JSON.stringify({ error: 'gone' }), { status: 410, headers: { 'Content-Type': 'application/json' } }));
