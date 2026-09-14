import { spawnSync } from "node:child_process";
import { existsSync, renameSync, rmSync, writeFileSync } from "node:fs";

const target = "src/lib/supabase/database.types.ts";
const temporary = `${target}.tmp`;
const command = process.platform === "win32" ? "supabase.cmd" : "supabase";

const result = spawnSync(
  command,
  ["gen", "types", "typescript", "--local", "--schema", "public"],
  {
    encoding: "utf8",
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" },
  }
);

if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

try {
  writeFileSync(temporary, `${result.stdout.trimEnd()}\n`);
  renameSync(temporary, target);
} finally {
  if (existsSync(temporary)) rmSync(temporary);
}
