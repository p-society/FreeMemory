import { Hono } from "hono";

const hono = new Hono();

hono.get("/", (c) => c.text("Hello, World!"));

export default hono;