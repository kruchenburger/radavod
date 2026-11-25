useForm({ validate: { name: (v: string) => (v ? null : "Required") } });
declare function useForm(o: object): void;
