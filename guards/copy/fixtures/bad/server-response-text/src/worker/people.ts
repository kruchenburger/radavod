export const save = (c: { json(b: object): Response }) => c.json({ error: "The person was not saved" });
