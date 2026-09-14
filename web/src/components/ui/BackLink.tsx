import Link from "next/link";
import type { ReactNode } from "react";

/** 詳細・編集画面から親一覧へ戻るリンク。見出しの直上に置く。 */
export default function BackLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className="inline-block text-sm text-link hover:underline">
      ← {children}
    </Link>
  );
}
