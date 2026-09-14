import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

writeFileSync(
  new URL("../app-version.json", import.meta.url),
  JSON.stringify({ version: randomUUID() }) + "\n",
);
