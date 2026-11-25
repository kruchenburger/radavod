const names = { keeper: "Keeper" };
export const A = () => Object.entries(names).map(([id, name]) => <p key={id}>{name}</p>);
