import { Hono } from "hono";
import { DurableObject } from "cloudflare:workers";
import { Buffer } from "node:buffer";
import { addChild } from "../scenarios/add-child";
import { isPerson } from "../shared/person";

export const app = new Hono();
export class Tree extends DurableObject {}
export const used = { addChild, isPerson, Buffer };
export const refusal = { code: "access_denied", secret: "ACCESS_TOKEN" };
export const message = "cannot rename to an empty name";
