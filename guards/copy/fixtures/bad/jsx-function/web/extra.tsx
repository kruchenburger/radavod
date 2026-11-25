const word = (n: number) => (n === 1 ? "person" : "people");
export const A = ({ n }: { n: number }) => <p>{word(n)}</p>;
