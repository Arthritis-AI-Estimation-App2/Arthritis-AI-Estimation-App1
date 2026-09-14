import type { Screening, ScreeningStatus } from "@/lib/types";
import { SCREENING_STATUS_LABELS } from "@/lib/screening-status";

const STATUS_CLASS_NAMES: Record<ScreeningStatus, string> = {
  uploading: "bg-info text-info-foreground",
  analyzing: "bg-warning text-warning-foreground",
  completed: "bg-success text-success-foreground",
  failed: "bg-danger text-danger-foreground",
};

function isScreeningStatus(status: string): status is ScreeningStatus {
  return status in SCREENING_STATUS_LABELS;
}

export default function StatusBadge({ status }: { status: Screening["status"] }) {
  const displayStatus = isScreeningStatus(status) ? status : "uploading";
  return (
    <span
      className={`inline-block shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS_NAMES[displayStatus]}`}
    >
      {SCREENING_STATUS_LABELS[displayStatus]}
    </span>
  );
}
