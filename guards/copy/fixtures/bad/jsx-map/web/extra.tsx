const names = { keeper: "Keeper", reader: "Reader" };
export const A = ({ role }: { role: "keeper" | "reader" }) => <p>{names[role]}</p>;
