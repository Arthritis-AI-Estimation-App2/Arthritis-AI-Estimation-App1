"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { correctScreeningSubject, createSubject } from "@/app/actions/subjects";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type { Subject } from "@/lib/types";

interface Props {
  screeningId: string;
  currentSubjectId: string | null;
  subjects: Subject[];
}

function subjectLabel(subjectId: string | null) {
  return subjectId ? subjectId : "未割り当て";
}

export default function SubjectAssignmentEditor({
  screeningId,
  currentSubjectId,
  subjects,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [nextSubjectId, setNextSubjectId] = useState(currentSubjectId ?? "");
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdSubjectId, setCreatedSubjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
      <CardHeader>
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
      </CardHeader>
      {editing && <CardContent className="space-y-4">

        {editing && (
          <div className="space-y-3 rounded-lg border border-warning-border bg-warning p-3">
            <div>
              <label htmlFor="subject-id" className="mb-1 block text-sm font-medium text-foreground">
                {currentSubjectId ? "変更後の被験者ID" : "紐付ける被験者ID"}
              </label>
              <select
                id="subject-id"
                value={nextSubjectId}
                onChange={(event) => setNextSubjectId(event.target.value)}
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus:border-focus focus:outline-none focus:ring-1 focus:ring-focus"
              >
                <option value="">未割り当てにする</option>
                {createdSubjectId && !subjects.some((subject) => subject.id === createdSubjectId) && (
                  <option value={createdSubjectId}>{createdSubjectId}（新規発行）</option>
                )}
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.id}
                  </option>
                ))}
              </select>
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
