import { useState } from "react";
export function A() {
  const [text, setText] = useState("");
  return <button onClick={() => setText("Saved")}>{text}</button>;
}
