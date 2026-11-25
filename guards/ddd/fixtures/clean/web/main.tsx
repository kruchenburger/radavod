import Layout from "./layout.worker?worker";
import icon from "./icon.svg?url";
import "./main.css";
import { isPerson } from "../src/shared/person";
import { title } from "./app/title";

export const lazy = () => import("./app/title");
export const main = <p title={title} data-icon={icon}>{String(isPerson)}</p>;
export const layout = import.meta.env.DEV ? undefined : new Layout();
