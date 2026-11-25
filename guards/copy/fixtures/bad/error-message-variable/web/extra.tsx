export function A({ error }: { error: Error }) {
  const text = error.message;
  return <p>{text}</p>;
}
