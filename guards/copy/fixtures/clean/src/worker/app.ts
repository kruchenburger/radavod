export const notFound = (c: { json(body: object, status: number): Response }) =>
  c.json({ error: "not-found", name: "Алеся" }, 404);
