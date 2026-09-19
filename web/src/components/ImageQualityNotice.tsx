import { QUALITY_MESSAGES, type ImageQuality } from "@/lib/image-quality";

export default function ImageQualityNotice({ quality }: { quality: ImageQuality }) {
  if (quality.status === "ok") return null;
  return (
    <div className="rounded-lg border border-warning-border bg-warning p-3 text-left text-sm text-warning-foreground">
      <p className="font-medium">{quality.status === "unchecked" ? "画像品質は未確認です" : "撮り直しをおすすめします"}</p>
      {quality.reasons.map((reason) => <p key={reason} className="mt-1">{QUALITY_MESSAGES[reason]}</p>)}
    </div>
  );
}
