export default function ActiveBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
        isActive ? "bg-success text-success-foreground" : "bg-danger text-danger-foreground"
      }`}
    >
      {isActive ? "有効" : "無効"}
    </span>
  );
}
