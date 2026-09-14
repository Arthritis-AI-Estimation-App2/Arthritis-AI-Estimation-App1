"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import { generatePassword } from "@/lib/generate-password";

interface Props {
  id: string;
  name?: string;
  label: string;
  initialPassword: string;
  hint?: string;
}

export default function GeneratedPasswordField({
  id,
  name = "password",
  label,
  initialPassword,
  hint = "自動生成したパスワードです。自由に変更できます。",
}: Props) {
  const [password, setPassword] = useState(initialPassword);
  const [copied, setCopied] = useState(false);

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="w-full">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-secondary-foreground">
        {label}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={id}
          name={name}
          type="text"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setCopied(false);
          }}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          data-1p-ignore="true"
          data-lpignore="true"
          required
          minLength={8}
          maxLength={72}
          className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 font-mono text-sm text-foreground tracking-wide focus:border-focus focus:outline-none focus:ring-1 focus:ring-focus"
        />
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setPassword(generatePassword());
              setCopied(false);
            }}
          >
            再生成
          </Button>
          <Button type="button" variant="secondary" onClick={() => void copyPassword()}>
            {copied ? "コピー済み" : "コピー"}
          </Button>
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
