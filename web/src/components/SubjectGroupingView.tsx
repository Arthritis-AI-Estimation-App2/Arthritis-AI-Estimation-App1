"use client";

import StatusBadge from "@/components/StatusBadge";
import { staffDisplayName } from "@/lib/staff-display-name";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { assignScreeningsToSubject, createSubject } from "@/app/actions/subjects";
import Button from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { JOINT_LABELS, JOINT_NAMES, type JointName } from "@/lib/joints";
import {
  formatJapanDateWithWeekday,
  formatJapanTime,
  japanCalendarDayKey,
} from "@/lib/japan-date-time";
import type { JointResult, Screening, Subject } from "@/lib/types";
import PaginationNav from "@/components/PaginationNav";

type GroupingJoint = Pick<JointResult, "side" | "joint_name" | "is_inflamed">;

export type UnassignedScreening = Pick<
  Screening,
  "id" | "subject_id" | "created_by" | "status" | "total_inflamed_joints" | "created_at"
> & {
  profiles: { full_name: string; deleted_at: string | null } | null;
  joint_results?: GroupingJoint[] | null;
};

type SubjectWithScreenings = Subject & {
  screenings?: Pick<Screening, "id">[];
};

interface Props {
  unassignedScreenings: UnassignedScreening[];
  subjects: SubjectWithScreenings[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function calendarDayKey(iso: string) {
  return japanCalendarDayKey(iso);
}

function dateHeading(iso: string) {
  const today = japanCalendarDayKey(new Date());
  const yesterday = japanCalendarDayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const day = japanCalendarDayKey(iso);

  if (day === today) return "今日";
  if (day === yesterday) return "昨日";
  return formatJapanDateWithWeekday(iso);
}

function formatTime(iso: string) {
  return formatJapanTime(iso, true);
}

function formatRelativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return null;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  return null;
}

function groupByCaptureDate(screenings: UnassignedScreening[]) {
  const groups: { key: string; label: string; items: UnassignedScreening[] }[] = [];

  for (const screening of screenings) {
    const key = calendarDayKey(screening.created_at);
    const last = groups.at(-1);
    if (last && last.key === key) {
      last.items.push(screening);
    } else {
      groups.push({ key, label: dateHeading(screening.created_at), items: [screening] });
    }
  }

  return groups;
}

function jointLabel(name: string) {
  return name in JOINT_LABELS ? JOINT_LABELS[name as JointName] : name;
}

function inflamedLabels(joints: GroupingJoint[] | null | undefined, side: "right" | "left") {
  return (joints ?? [])
    .filter((joint) => joint.is_inflamed && joint.side === side)
    .sort((a, b) => {
      const aIndex = JOINT_NAMES.indexOf(a.joint_name as JointName);
      const bIndex = JOINT_NAMES.indexOf(b.joint_name as JointName);
      return (aIndex === -1 ? JOINT_NAMES.length : aIndex) - (bIndex === -1 ? JOINT_NAMES.length : bIndex);
    })
    .map((joint) => jointLabel(joint.joint_name));
}

function screeningFindings(screening: UnassignedScreening) {
  if (screening.status !== "completed") return null;

  const right = inflamedLabels(screening.joint_results, "right");
  const left = inflamedLabels(screening.joint_results, "left");
  const count = screening.total_inflamed_joints ?? right.length + left.length;

  return { count, right, left };
}

export default function SubjectGroupingView({
  unassignedScreenings,
  subjects,
  total,
  page,
  pageSize,
  totalPages,
}: Props) {
  const router = useRouter();
  const [selectedScreenings, setSelectedScreenings] = useState<string[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const firstResult = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastResult = Math.min(page * pageSize, total);

  const toggleScreening = (id: string) => {
    setSelectedScreenings((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleCreateNewSubject = async () => {
    setLoading(true);
    setError(null);
    const res = await createSubject();
    setLoading(false);
    if (res.error) {
      setError(res.error);
    } else if (res.subjectId) {
      setSelectedSubjectId(res.subjectId);
      setSuccess(`新しい被験者ID（${res.subjectId}）を発行しました。`);
    }
  };

  const handleAssign = async () => {
    if (!selectedSubjectId) {
      setError("グループ化先の被験者IDを選択するか、新規作成してください。");
      return;
    }
    if (selectedScreenings.length === 0) {
      setError("グループ化する画像データを選択してください。");
      return;
    }

    setLoading(true);
    setError(null);
    const res = await assignScreeningsToSubject(selectedSubjectId, selectedScreenings);
    setLoading(false);

    if (res.error) {
      setError(res.error);
    } else {
      setSuccess("画像のグループ化が完了しました。");
      setSelectedScreenings([]);
      router.refresh();
    }
  };

  const dateGroups = groupByCaptureDate(unassignedScreenings);
  const selectedCount = selectedScreenings.length;

  return (
    <div className={`space-y-6 ${selectedCount > 0 ? "pb-36 sm:pb-24" : ""}`}>
      {error && <p className="rounded-lg bg-danger p-3 text-sm text-danger-foreground">{error}</p>}
      {success && <p className="rounded-lg bg-success p-3 text-sm text-success-foreground">{success}</p>}

      <Card>
        <CardContent className="space-y-4">
          <h2 className="text-lg font-bold text-foreground">1. グループ化先の被験者IDを選択</h2>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm text-foreground focus:border-focus focus:outline-none focus:ring-1 focus:ring-focus"
            >
              <option value="">既存の被験者IDから選択...</option>
              {subjects.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  被験者ID: {sub.id} ({sub.screenings?.length ?? 0}件のデータ)
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">または</span>
            <Button type="button" variant="secondary" onClick={handleCreateNewSubject} disabled={loading}>
              ＋ 新しい被験者IDを発行
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4">
          <h2 className="text-lg font-bold text-foreground">
            2. 未割り当ての撮影データを選択 ({total}件)
          </h2>
          {unassignedScreenings.length === 0 ? (
            <p className="text-sm text-muted-foreground">未割り当ての撮影データはありません。</p>
          ) : (
            <div className="space-y-5">
              {dateGroups.map((group) => (
                <section key={group.key} className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">{group.label}</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {group.items.map((sc) => {
                      const isSelected = selectedScreenings.includes(sc.id);
                      const findings = screeningFindings(sc);
                      const relative = formatRelativeTime(sc.created_at);
                      const time = formatTime(sc.created_at);

                      return (
                        <div
                          key={sc.id}
                          className={`flex flex-col rounded-lg border transition-colors ${
                            isSelected
                              ? "border-primary bg-primary-subtle"
                              : "border-border bg-surface hover:border-border-strong"
                          }`}
                        >
                          <label className="block flex-1 cursor-pointer p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-base font-semibold tabular-nums text-foreground">{time}</p>
                                {relative && <p className="text-xs text-muted-foreground">{relative}</p>}
                              </div>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleScreening(sc.id)}
                                className="mt-1 h-4 w-4 rounded border-border-strong bg-surface text-primary focus:ring-2 focus:ring-focus focus:ring-offset-2 focus:ring-offset-surface"
                                aria-label={`${group.label} ${time}の撮影`}
                              />
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <StatusBadge status={sc.status} />
                              <span className="text-xs text-muted-foreground">撮影ID: {sc.id.slice(0, 8)}</span>
                            </div>
                            <p className="mt-2 break-words text-sm text-secondary-foreground">担当者: {staffDisplayName(sc.profiles)}</p>
                            {findings &&
                              (findings.count === 0 ? (
                                <p className="mt-2 text-xs text-secondary-foreground">炎症の疑いなし</p>
                              ) : (
                                <div className="mt-2 space-y-0.5">
                                  <p className="text-xs font-medium text-foreground">
                                    炎症 {findings.count}箇所
                                  </p>
                                  {findings.right.length > 0 && (
                                    <p className="text-xs text-secondary-foreground">右手: {findings.right.join("、")}</p>
                                  )}
                                  {findings.left.length > 0 && (
                                    <p className="text-xs text-secondary-foreground">左手: {findings.left.join("、")}</p>
                                  )}
                                </div>
                              ))}
                          </label>
                          <a
                            href={`/results/${sc.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block border-t border-border px-3 py-3 text-sm font-medium text-primary hover:underline"
                          >
                            詳細を確認 ↗
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}

          {total > 0 && (
            <div>
              <p className="text-xs text-muted-foreground">
                {total}件中 {firstResult}〜{lastResult}件を表示
              </p>
              <PaginationNav
                page={page}
                totalPages={totalPages}
                pathname="/grouping"
                ariaLabel="未割り当て撮影データのページ移動"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {selectedCount > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4.0625rem+env(safe-area-inset-bottom,0px))] z-20 border-t border-border bg-surface shadow-[0_-4px_12px_rgb(0_0_0/0.08)] sm:bottom-[calc(2.75rem+env(safe-area-inset-bottom,0px))]">
          <div className="mx-auto flex max-w-4xl flex-col gap-3 px-safe-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {selectedSubjectId
                  ? `紐付け先: 被験者ID ${selectedSubjectId}`
                  : "紐付け先が選択されていません"}
              </p>
              <p className="text-xs text-muted-foreground">このページで{selectedCount}件を選択中</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setSelectedScreenings([])}
                disabled={loading}
                className="shrink-0"
              >
                選択解除
              </Button>
              <Button
                type="button"
                onClick={handleAssign}
                disabled={loading || !selectedSubjectId}
                className="min-w-0 flex-1 sm:flex-none"
              >
                {loading
                  ? "紐付け中..."
                  : selectedSubjectId
                    ? `${selectedSubjectId}へ${selectedCount}件を紐付け`
                    : "被験者IDを選択"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
