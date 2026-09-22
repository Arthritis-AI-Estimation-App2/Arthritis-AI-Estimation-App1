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
  // pg-metaでは計算列とRPC引数のNULL許容が生成されないため補完する。
  // 手修正ではなく再生成時にも同じ型契約を維持する。
  const source = result.stdout
    .replace("screenings: {\n        Row: {", "screenings: {\n        Row: {\n          screening_clinic_id: string | null")
    .replace(/(p_expected_subject_id|p_new_subject_id|p_expected_run_id): string\b/g, "$1: string | null")
    .replace(/p_http_status: number\b/g, "p_http_status: number | null");
  writeFileSync(temporary, `${source.trimEnd()}\n`);
  renameSync(temporary, target);
} finally {
  if (existsSync(temporary)) rmSync(temporary);
}
