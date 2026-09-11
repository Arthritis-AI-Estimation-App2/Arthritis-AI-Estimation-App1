"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

interface Props {
  json: string;
}

function CopyIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 7.5V6a2.25 2.25 0 0 1 2.25-2.25h7.5A2.25 2.25 0 0 1 20.25 6v7.5a2.25 2.25 0 0 1-2.25 2.25h-1.5M6 20.25h7.5A2.25 2.25 0 0 0 15.75 18v-7.5A2.25 2.25 0 0 0 13.5 8.25H6A2.25 2.25 0 0 0 3.75 10.5V18A2.25 2.25 0 0 0 6 20.25Z"
      />
    </svg>
  );
}

function CheckIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="3"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
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
      className={`px-2 py-1 text-[11px] transition-colors duration-300 ${
        copied ? "!border-success-border !bg-success !text-success-foreground" : ""
      }`}
      onClick={() => void handleCopy()}
    >
      {/* keyでcopiedの切り替えごとに再マウントし、コピー成功のポップ演出を毎回再生する */}
      <span
        key={copied ? "copied" : "idle"}
        className={`inline-flex items-center gap-1 ${copied ? "animate-copy-success-pop" : ""}`}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
        {copied ? "コピーしました" : "コピー"}
      </span>
    </Button>
  );
}
