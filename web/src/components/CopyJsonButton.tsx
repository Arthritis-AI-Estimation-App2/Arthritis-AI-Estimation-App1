"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

interface Props {
  json: string;
}

export default function CopyJsonButton({ json }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="px-2 py-1 text-[11px]"
      onClick={() => void handleCopy()}
    >
      {copied ? "コピーしました" : "コピー"}
    </Button>
  );
}
