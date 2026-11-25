export const deny = () => {
  throw new HTTPException(403, { message: "Only a keeper can do this" });
};
declare class HTTPException extends Error {
  constructor(status: number, o: object);
}
