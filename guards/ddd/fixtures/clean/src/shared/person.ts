import { isId } from "../kernel/id";

export const isPerson = (value: { id: string }) => isId(value.id);
