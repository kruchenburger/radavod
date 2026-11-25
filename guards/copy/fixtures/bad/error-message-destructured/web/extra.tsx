export function A({ error }: { error: Error }) {
  const { message } = error;
  return <p>{message}</p>;
}
