export const save = () => Promise.reject(new SaveError("Не сохранено"));
declare class SaveError extends Error {}
