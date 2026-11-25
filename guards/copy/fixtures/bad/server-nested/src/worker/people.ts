export const deny = (c: { json(b: object): Response }) => c.json({ error: { message: "Person not found" } });
