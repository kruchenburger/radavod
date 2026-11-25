export const deny = () => new Response(JSON.stringify({ error: "Person not found" }));
