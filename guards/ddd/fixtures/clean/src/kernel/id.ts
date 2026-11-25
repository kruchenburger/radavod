export type Id = string;
export const isId = (value: string): value is Id => value.length > 0;
