import CaptureFlow from "@/components/CaptureFlow";

export const metadata = { title: "撮影" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CapturePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const rawParams = await searchParams;
  // デバッグ用。カメラの代わりに手元の画像ファイルを無変換で解析へ流せるようにする。
  const allowFileUpload = firstValue(rawParams.debug) === "1";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CaptureFlow allowFileUpload={allowFileUpload} />
    </div>
  );
}
