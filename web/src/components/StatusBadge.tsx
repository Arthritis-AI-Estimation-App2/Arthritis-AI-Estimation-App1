import type { Screening, ScreeningStatus } from "@/lib/types";

const STATUS_CONFIG: Record<ScreeningStatus, { label: string; className: string }> = {
  uploading: { label: "アップロード中", className: "bg-info text-info-foreground" },
  analyzing: { label: "解析中", className: "bg-warning text-warning-foreground" },
  completed: { label: "解析完了", className: "bg-success text-success-foreground" },
  failed: { label: "失敗", className: "bg-danger text-danger-foreground" },
};

function isScreeningStatus(status: string): status is ScreeningStatus {
  return status in STATUS_CONFIG;
}

export default function StatusBadge({ status }: { status: Screening["status"] }) {
  const config = isScreeningStatus(status) ? STATUS_CONFIG[status] : STATUS_CONFIG.uploading;
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}
