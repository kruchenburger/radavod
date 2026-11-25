import { useState } from "react";
export function A() {
  const [text, setText] = useState("");
  const save = () => {
    try {
      setText("");
    } catch (problem) {
      setText((problem as Error).message);
    }
  };
  return <p onClick={save}>{text}</p>;
}
