"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { correctScreeningSubject, createSubject } from "@/app/actions/subjects";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import StatusBadge from "@/components/StatusBadge";
import { formatJapanDateTime } from "@/lib/japan-date-time";
import { formatFullScreeningId } from "@/lib/admin-screening-filters";
import type { Screening, Subject } from "@/lib/types";
import SubjectIdCombobox, { type SubjectIdOption } from "@/components/SubjectIdCombobox";

interface Props {
  screeningId: string;
  currentSubjectId: string | null;
  subjects: Subject[];
  capturedAt?: string;
  status?: Screening["status"];
}

function subjectLabel(subjectId: string | null) {
  return subjectId ? subjectId : "未割り当て";
}

export default function SubjectAssignmentEditor({
  screeningId,
  currentSubjectId,
  subjects,
  capturedAt,
  status,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [nextSubjectId, setNextSubjectId] = useState(currentSubjectId ?? "");
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdSubjectId, setCreatedSubjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const subjectOptions: SubjectIdOption[] = [
    { value: "", label: "未割り当てにする" },
    ...subjects.map((subject) => ({ value: subject.id, label: subject.id })),
  ];
  if (
    createdSubjectId &&
    !subjectOptions.some((option) => option.value === createdSubjectId)
  ) {
    subjectOptions.splice(1, 0, {
      value: createdSubjectId,
      label: `${createdSubjectId}（新規発行）`,
    });
  }

  const cancel = () => {
    setNextSubjectId(currentSubjectId ?? "");
    setError(null);
    setSuccess(null);
    setEditing(false);
  };

  const createNewSubject = async () => {
    setCreating(true);
    setError(null);
    setSuccess(null);
    const result = await createSubject(screeningId);
    setCreating(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    if (!result.subjectId) {
      setError("被験者IDの作成に失敗しました");
      return;
    }

    setCreatedSubjectId(result.subjectId);
    setNextSubjectId(result.subjectId);
    setSuccess(`新しい被験者ID（${result.subjectId}）を発行し、変更先に選択しました。`);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    const result = await correctScreeningSubject(screeningId, nextSubjectId || null);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEditing(false);
    router.refresh();
  };

  return (
    <Card>
      <CardHeader className={editing ? "" : "border-b-0"}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-xs text-muted-foreground">被験者ID</CardTitle>
            <p className="mt-1 break-all text-sm text-foreground">{subjectLabel(currentSubjectId)}</p>
          </div>
          {!editing && (
            <Button type="button" variant="secondary" size="sm" className="shrink-0 whitespace-nowrap" onClick={() => setEditing(true)}>
              {currentSubjectId ? "修正・解除" : "紐付け"}
            </Button>
          )}
        </div>
        {capturedAt && status && (
          <div className="mt-3 space-y-0.5 border-t border-border pt-3">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 text-xs text-muted-foreground">
                撮影日時: {formatJapanDateTime(capturedAt)}
              </p>
              <StatusBadge status={status} />
            </div>
            <p className="break-all text-xs text-muted-foreground">
              撮影ID:{" "}
              <span className="font-mono tracking-tight">
                {formatFullScreeningId(screeningId)}
              </span>
            </p>
          </div>
        )}
      </CardHeader>
      {editing && <CardContent className="space-y-4">

        {editing && (
          <div className="space-y-3 rounded-lg border border-warning-border bg-warning p-3">
            <div>
              <label htmlFor="subject-id" className="mb-1 block text-sm font-medium text-foreground">
                {currentSubjectId ? "変更後の被験者ID" : "紐付ける被験者ID"}
              </label>
              <SubjectIdCombobox
                id="subject-id"
                value={nextSubjectId}
                options={subjectOptions}
                onValueChange={setNextSubjectId}
                placeholder="被験者IDを入力して検索"
                disabled={saving || creating}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-secondary-foreground">一覧にない場合</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={createNewSubject}
                disabled={saving || creating}
              >
                {creating ? "発行中..." : "＋ 新しい被験者IDを発行"}
              </Button>
            </div>
            {error && (
              <p className="text-sm text-danger-foreground" role="alert">
                {error}
              </p>
            )}
            {success && (
              <p className="text-sm text-success-foreground" aria-live="polite">
                {success}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={cancel}
                disabled={saving || creating}
              >
                キャンセル
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={save}
                disabled={saving || creating || nextSubjectId === (currentSubjectId ?? "")}
              >
                {saving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>}
    </Card>
  );
}
