"use client";

import { useActionState } from "react";
import { updateScreeningThresholds } from "@/app/actions/settings";
import type { ScreeningThresholds } from "@/lib/screening-thresholds";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";

export default function ScreeningThresholdForm({ thresholds }: { thresholds: ScreeningThresholds }) {
  const [state, action, pending] = useActionState(updateScreeningThresholds, { error: null, success: false });
  return (
    <Card><CardContent>
      <form action={action} className="space-y-4">
        <p className="text-sm text-secondary-foreground">
          全医療機関共通の設定です。陽性確率が閾値以上の関節を陽性と判定します。
          保存後に開始する解析から適用され、既存の結果には影響しません。
        </p>
        <Input id="thr_node" name="thr_node" label="指関節の判定閾値（0〜1）"
          type="number" min="0" max="1" step="any" required defaultValue={String(thresholds.thr_node)} />
        <Input id="thr_wrist" name="thr_wrist" label="手関節の判定閾値（0〜1）"
          type="number" min="0" max="1" step="any" required defaultValue={String(thresholds.thr_wrist)} />
        {state.error && <p role="alert" className="text-sm text-danger-foreground">{state.error}</p>}
        {state.success && <p role="status" className="text-sm text-success-foreground">判定設定を保存しました。</p>}
        <Button type="submit" disabled={pending}>{pending ? "保存中..." : "設定を保存"}</Button>
      </form>
    </CardContent></Card>
  );
}
