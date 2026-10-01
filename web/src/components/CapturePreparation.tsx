import Button from "@/components/ui/Button";
import Link from "@/components/ui/Link";
import CapturePreparationHand from "@/components/CapturePreparationHand";

const precautions = [
  ["アクセサリーを外す", "指輪・時計・ブレスレットなどは外してください"],
  ["背景を整える", "無地の台の上で、手指以外が写り込まないようにしてください"],
  ["手の置き方", "袖をまくり、手のひらを下にして平らに置き、指は自然に開いてください"],
  ["照明", "明るい場所で、強い光の反射や影を避けてください"],
] as const;

export default function CapturePreparation({ onContinue }: { onContinue: () => void }) {
  return (
    <section aria-labelledby="capture-preparation-title" className="mx-auto w-full max-w-lg shrink-0 space-y-5 pb-[calc(2rem_+_env(safe-area-inset-bottom,0px))]">
      <h1 id="capture-preparation-title" className="text-xl font-bold text-foreground">
        撮影前のご確認
      </h1>
      <p className="text-sm leading-relaxed text-secondary-foreground">
        よりきれいに撮影いただくために、以下をご確認ください。
      </p>

      <figure className="rounded-xl border border-border bg-surface p-4 text-center">
        <div className="mx-auto flex h-52 items-center justify-center overflow-hidden rounded-lg bg-surface-muted sm:h-60">
          <CapturePreparationHand />
        </div>
        <figcaption className="mt-3 space-y-1">
          <p className="text-sm font-medium text-foreground">手の甲をカメラに向ける</p>
          <p className="text-sm text-secondary-foreground">正面から、指を自然に開いて手首まで</p>
        </figcaption>
      </figure>

      <ul className="divide-y divide-border/60 text-sm leading-relaxed">
        {precautions.map(([title, description]) => (
          <li key={title} className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0">
            <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
            <p className="min-w-0 text-secondary-foreground">
              <span className="font-semibold text-foreground">{title}</span>
              {" "}<span className="ml-1">{description}</span>
            </p>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3">
        <Button type="button" className="min-h-14 w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background" onClick={onContinue}>
          撮影へ進む
        </Button>
        <Link href="/" className="flex min-h-11 items-center justify-center rounded-lg px-4 py-2 text-center text-sm font-medium text-secondary-foreground hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
          戻る
        </Link>
      </div>
    </section>
  );
}
