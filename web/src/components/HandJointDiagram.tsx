"use client";

import { useState } from "react";
import { JOINT_NAMES, type JointName } from "@/lib/joints";
import {
  HAND_DIAGRAM_HEIGHT,
  HAND_DIAGRAM_WIDTH,
  HAND_OUTLINE,
  HAND_WRIST_CENTER_X,
  JOINT_POSITIONS,
} from "@/lib/hand-diagram";

import { describeJoint, type DisplayJoint } from "@/lib/analysis-display";

interface HandJointDiagramProps {
  joints: DisplayJoint[];
  currentApi?: boolean;
  /** 左手表示用の反転フラグ */
  mirror?: boolean;
  className?: string;
}

const SVG_WIDTH = HAND_DIAGRAM_WIDTH;
const SVG_HEIGHT = HAND_DIAGRAM_HEIGHT;
const WRIST_CENTER_X = HAND_WRIST_CENTER_X;

export default function HandJointDiagram({
  joints,
  mirror = false,
  currentApi = false,
  className = "",
}: HandJointDiagramProps) {
  const [selectedName, setSelectedName] = useState<JointName | null>(null);
  const [hoveredName, setHoveredName] = useState<JointName | null>(null);
  const jointMap = new Map(joints.map((j) => [j.joint_name, j]));
  const selectedJoint = selectedName ? jointMap.get(selectedName) : undefined;
  const selectedDesc = selectedName ? describeJoint(selectedName, selectedJoint, currentApi) : null;
  const hoveredJoint = hoveredName ? jointMap.get(hoveredName) : undefined;
  const hoveredPos = hoveredName ? JOINT_POSITIONS[hoveredName] : null;
  const hoveredDesc = hoveredName ? describeJoint(hoveredName, hoveredJoint, currentApi) : null;
  const handLabel = mirror ? "左手" : "右手";
  const tooltipXPercent = hoveredPos
    ? ((mirror ? SVG_WIDTH - hoveredPos.x : hoveredPos.x) / SVG_WIDTH) * 100
    : 0;
  const tooltipYPercent = hoveredPos ? (hoveredPos.y / SVG_HEIGHT) * 100 : 0;
  const tooltipBelow = tooltipYPercent < 22;
  const tooltipXAlign =
    tooltipXPercent < 28 ? "start" : tooltipXPercent > 72 ? "end" : "center";
  const tooltipXTranslate =
    tooltipXAlign === "start"
      ? "translate-x-0"
      : tooltipXAlign === "end"
        ? "-translate-x-full"
        : "-translate-x-1/2";

  function selectJoint(name: JointName) {
    setSelectedName((current) => (current === name ? null : name));
  }

  return (
    <div className={className}>
      <div className="relative">
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="w-full"
          role="group"
          aria-label={`${handLabel}の関節図。関節を選ぶと陽性確率が表示されます`}
        >
          <g transform={mirror ? "translate(200 0) scale(-1 1)" : undefined}>
            <path
              d={HAND_OUTLINE}
              fill="var(--color-joint-hand)"
              stroke="var(--color-joint-outline)"
              strokeWidth="2"
              strokeLinejoin="round"
              pointerEvents="none"
            />
            {JOINT_NAMES.map((name) => {
              const pos = JOINT_POSITIONS[name];
              const joint = jointMap.get(name);
              const inflamed = joint?.is_inflamed ?? false;
              const isSelected = selectedName === name;
              const desc = describeJoint(name, joint, currentApi);

              return (
                <g
                  key={name}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  aria-label={desc.text}
                  className="group cursor-pointer outline-none"
                  onClick={() => selectJoint(name)}
                  onMouseEnter={() => setHoveredName(name)}
                  onMouseLeave={() => setHoveredName(null)}
                  onFocus={() => setHoveredName(name)}
                  onBlur={() => setHoveredName(null)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectJoint(name);
                    }
                  }}
                >
                  {inflamed && (
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r="9"
                      fill="var(--color-joint-inflamed)"
                      opacity="0.25"
                    />
                  )}
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r="11"
                    fill="none"
                    stroke={isSelected ? "rgb(var(--color-primary))" : "transparent"}
                    strokeWidth="2"
                    className="group-focus-visible:stroke-primary"
                    pointerEvents="none"
                  />
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r="5"
                    fill={
                      desc.missing ? "var(--color-joint-unavailable)" : inflamed ? "var(--color-joint-inflamed)" : "var(--color-joint-marker)"
                    }
                    stroke={
                      inflamed
                        ? "var(--color-joint-inflamed-outline)"
                        : "var(--color-joint-outline)"
                    }
                    strokeDasharray={desc.missing ? "2 2" : undefined}
                    strokeWidth="1.5"
                    pointerEvents="none"
                  />
                  <circle cx={pos.x} cy={pos.y} r="12" fill="transparent" />
                </g>
              );
            })}
          </g>
          <text
            x={mirror ? SVG_WIDTH - WRIST_CENTER_X : WRIST_CENTER_X}
            y="214"
            textAnchor="middle"
            fontSize="10"
            fontWeight="400"
            letterSpacing="0.8"
            fill="var(--color-joint-label)"
          >
            {handLabel}
          </text>
        </svg>
        {hoveredName && hoveredDesc && (
          <div
            role="tooltip"
            aria-hidden="true"
            className={`pointer-events-none absolute z-10 w-max max-w-[11rem] rounded-md bg-tooltip px-2 py-1 text-center text-[11px] leading-snug text-tooltip-foreground shadow-lg ${tooltipXTranslate} ${
              tooltipBelow ? "translate-y-2" : "-translate-y-[calc(100%+0.5rem)]"
            }`}
            style={{ left: `${tooltipXPercent}%`, top: `${tooltipYPercent}%` }}
          >
            <p className="font-medium">{hoveredDesc.label}</p>
            <p className={hoveredDesc.inflamed ? "text-tooltip-danger" : "text-tooltip-muted"}>
              {hoveredDesc.status}
              {hoveredDesc.confidence ? `　陽性確率 ${hoveredDesc.confidence}` : ""}
            </p>
          </div>
        )}
      </div>

      <div className="mt-1 min-h-[2.75rem] text-center" aria-live="polite">
        {selectedDesc ? (
          <>
            <p className="text-xs font-semibold text-foreground">{selectedDesc.label}</p>
            <p
              className={`text-xs ${
                selectedJoint?.is_inflamed ? "font-medium text-danger-foreground" : "text-muted-foreground"
              }`}
            >
              {selectedDesc.status}
              {selectedDesc.confidence !== null && `　陽性確率 ${selectedDesc.confidence}`}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">関節をタップすると陽性確率が表示されます</p>
        )}
      </div>
    </div>
  );
}
