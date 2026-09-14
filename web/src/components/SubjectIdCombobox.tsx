"use client";

import { Combobox } from "@base-ui/react/combobox";
import type { Ref } from "react";

export type SubjectIdOption = {
  value: string;
  label: string;
};

interface Props {
  id?: string;
  value: string;
  options: SubjectIdOption[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
    </svg>
  );
}

export default function SubjectIdCombobox({
  id,
  value,
  options,
  onValueChange,
  placeholder = "被験者IDを入力して検索",
  disabled = false,
  inputRef,
}: Props) {
  const selectedOption = options.find((option) => option.value === value) ?? null;

  return (
    <Combobox.Root
      items={options}
      value={selectedOption}
      onValueChange={(option) => onValueChange(option?.value ?? "")}
      isItemEqualToValue={(option, selected) => option.value === selected.value}
      filter={(option, query) =>
        option.value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
      }
      disabled={disabled}
    >
      <Combobox.InputGroup className="relative h-11 w-full rounded-lg border border-border-strong bg-surface focus-within:border-focus focus-within:ring-1 focus-within:ring-focus">
        <Combobox.Input
          id={id}
          ref={inputRef}
          placeholder={placeholder}
          autoComplete="off"
          className="h-full w-full rounded-lg bg-transparent px-3 pr-11 text-base text-foreground outline-none placeholder:text-subtle-foreground sm:text-sm"
        />
        <Combobox.Trigger
          aria-label="被験者IDの候補を表示"
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground hover:bg-surface-hover disabled:opacity-50"
        >
          <ChevronIcon />
        </Combobox.Trigger>
      </Combobox.InputGroup>

      <Combobox.Portal>
        <Combobox.Positioner
          className="z-50 outline-none"
          sideOffset={4}
          align="start"
        >
          <Combobox.Popup className="w-[var(--anchor-width)] max-w-[var(--available-width)] overflow-hidden rounded-lg border border-border-strong bg-surface text-foreground shadow-lg">
            <Combobox.Empty>
              <div className="px-3 py-4 text-sm text-muted-foreground">
                一致する被験者IDはありません
              </div>
            </Combobox.Empty>
            <Combobox.List className="max-h-[min(20rem,var(--available-height))] overflow-y-auto overscroll-contain p-1 outline-none">
              {(option: SubjectIdOption) => (
                <Combobox.Item
                  key={option.value || "unassigned"}
                  value={option}
                  className="grid cursor-pointer grid-cols-[1rem_minmax(0,1fr)] items-center gap-2 rounded-md px-2 py-2.5 text-sm outline-none data-highlighted:bg-surface-hover data-selected:font-medium"
                >
                  <Combobox.ItemIndicator className="text-primary">
                    <CheckIcon />
                  </Combobox.ItemIndicator>
                  <span className="col-start-2 min-w-0 break-all">
                    {option.label}
                  </span>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
