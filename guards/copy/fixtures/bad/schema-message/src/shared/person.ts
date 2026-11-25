export const schema = (z: { min(n: number, text: string): object }) => z.min(1, "Enter a name");
