"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { FilterColumnOption } from "@/components/filters/FilterColumn";
import { formatScopeSummary } from "@/lib/export/export-scope-label";

export type ExportScopePopoverRenderProps = {
  draft: FilterColumnOption[];
  selectedIds: string[];
  toggleDraft: (
    id: string,
    checked: boolean,
    options: FilterColumnOption[],
  ) => void;
};

type ExportScopePopoverProps = {
  scope: FilterColumnOption[];
  onApply: (scope: FilterColumnOption[]) => void;
  testidPrefix: string;
  allLabel: string;
  countNoun: string;
  displayScope?: FilterColumnOption[];
  onOpen?: () => void;
  onOpenChange?: (open: boolean) => void;
  children: (props: ExportScopePopoverRenderProps) => ReactNode;
};

export function ExportScopePopover(props: ExportScopePopoverProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FilterColumnOption[]>(props.scope);
  const selectedIds = draft.map((option) => option.id);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setDraft(props.scope);
      props.onOpen?.();
    }
    setOpen(next);
    props.onOpenChange?.(next);
  };

  const toggleDraft = (
    id: string,
    checked: boolean,
    options: FilterColumnOption[],
  ) => {
    setDraft((current) => {
      if (!checked) return current.filter((option) => option.id !== id);
      if (current.some((option) => option.id === id)) return current;
      const option = options.find((candidate) => candidate.id === id);
      return option ? [...current, option] : current;
    });
  };

  const triggerScope = props.displayScope ?? props.scope;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between font-normal"
          data-testid={`${props.testidPrefix}-trigger`}
        >
          <span className="truncate">
            {formatScopeSummary({
              names: triggerScope.map((option) => option.label),
              allLabel: props.allLabel,
              countNoun: props.countNoun,
            })}
          </span>
          <Icon icon="lucide:filter" className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        className="w-[360px] max-w-[92vw] p-0"
        data-testid={`${props.testidPrefix}-content`}
      >
        <div className="flex flex-col">
          <div className="p-2">
            <div className="flex h-[288px] min-h-0 flex-col overflow-hidden rounded-md border bg-muted/30">
              {props.children({ draft, selectedIds, toggleDraft })}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 border-t bg-secondary p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setDraft([])}
              data-testid={`${props.testidPrefix}-clear`}
            >
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                props.onApply(draft);
                handleOpenChange(false);
              }}
              data-testid={`${props.testidPrefix}-apply`}
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
