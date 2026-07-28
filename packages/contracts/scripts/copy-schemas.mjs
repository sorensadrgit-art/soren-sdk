import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const destination = new URL("../dist/schema-data/", import.meta.url);
const source = new URL("../../../schemas/", import.meta.url);

await mkdir(fileURLToPath(destination), { recursive: true });
await cp(fileURLToPath(source), fileURLToPath(destination), { recursive: true });
