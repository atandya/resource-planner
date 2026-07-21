"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { endOfMonth, format as formatDateFns, startOfMonth } from "date-fns";
import { Icon } from "@iconify/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast, toast } from "@/hooks/use-toast";
import { CustomRangePicker } from "@/components/timeline-v2/CustomRangePicker";
import type { ExportOption, ExportFormat } from "./ExportButton";
import { downloadCsvFile, generateExportFilename } from "@/lib/export/csv-export";
import { downloadExcelFile, generateExcelFilename } from "@/lib/export/excel-export";
import { buildExportSearchParams, type ExportFilters } from "@/lib/export/export-params";
import {
  BRAND_EXPORT_ROUTE,
  DETAILED_EXPORT_ROUTE,
  countEndpointFor,
  resolveExportCountView,
  shouldFetchExportCount,
  type ExportCountStatus,
} from "@/lib/export/export-count-state";
import { fetchExportCount } from "@/lib/export/fetch-export-count";
import {
  honorsFilter,
  selectHonoredFilters,
  FILTER_LABELS,
  type ExportFilterNames,
} from "@/lib/export/applied-filters";
import { BrandScopeField } from "./BrandScopeField";
import { DepartmentScopeField } from "./DepartmentScopeField";
import type { FilterColumnOption } from "@/components/filters/FilterColumn";
import { shouldReseed, type ExportDialogSeed } from "@/lib/export/export-dialog-seed";

/** Upper bound on the count pre-flight, so a hung request can't spin forever. */
const COUNT_TIMEOUT_MS = 15000;

const FORMAT_CHOICES: Array<{
  value: ExportFormat;
  label: string;
  description: string;
  icon: string;
  iconClassName?: string;
}> = [
  {
    value: "csv",
    label: "CSV",
    description: "Opens in Excel",
    icon: "lucide:file-text",
  },
  {
    value: "excel",
    label: "Excel",
    description: "Multi-sheet with formatting",
    icon: "lucide:file-spreadsheet",
    iconClassName: "text-green-600",
  },
];

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exportOption: ExportOption;
  filters?: ExportFilters & { startDate?: string; endDate?: string };
  /** Display labels for filter ids, so the seeded scope shows "Acme" rather than "206". */
  filterNames?: ExportFilterNames;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({
  open,
  onOpenChange,
  exportOption,
  filters,
  filterNames,
}) => {
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState("");
  const [recordCount, setRecordCount] = useState<number | null>(null);
  const [countStatus, setCountStatus] = useState<ExportCountStatus>("idle");
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [scopeBrands, setScopeBrands] = useState<FilterColumnOption[]>([]);
  const [scopeDepartments, setScopeDepartments] = useState<FilterColumnOption[]>([]);
  const lastAppliedSeed = useRef<ExportDialogSeed | null>(null);

  // Set default format based on what's available
  useEffect(() => {
    if (!exportOption.formats.includes(format)) {
      setFormat(exportOption.formats[0]);
    }
  }, [exportOption, format]);

  // Rule C: dialog edits (scope AND dates) survive close/reopen, and re-seed
  // from the timeline only when its contribution changed since last applied.
  // This replaces the old always-reseed-on-open rule so both fields share one
  // memory model. The dialog stays mounted after close (ExportButton renders
  // on selectedExport, not open), which is what makes persistence work.
  useEffect(() => {
    if (!open) return;
    const incomingSeed: ExportDialogSeed = {
      brandIds: filters?.brandIds ?? [],
      departmentIds: filters?.departmentIds ?? [],
      startDate: filters?.startDate,
      endDate: filters?.endDate,
    };
    if (!shouldReseed({ incomingSeed, lastAppliedSeed: lastAppliedSeed.current })) return;
    lastAppliedSeed.current = incomingSeed;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setDateRange({
      start: incomingSeed.startDate || monthStart.toISOString().split("T")[0],
      end: incomingSeed.endDate || monthEnd.toISOString().split("T")[0],
    });
    const brandNameById = filterNames?.brandIds ?? {};
    setScopeBrands(incomingSeed.brandIds.map((id) => ({ id, label: brandNameById[id] ?? id })));
    const departmentNameById = filterNames?.departmentIds ?? {};
    setScopeDepartments(
      incomingSeed.departmentIds.map((id) => ({ id, label: departmentNameById[id] ?? id })),
    );
    // Seed inputs are read fresh on each open; comparing inside the effect is
    // the point, so `open` is the only dependency (same as before).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Only the filters this export actually applies. Sending the rest would put
  // params in the URL that the route discards, and would re-count on changes
  // that cannot move the number.
  const honoredFilters = useMemo(
    () =>
      selectHonoredFilters(exportOption.type, {
        ...filters,
        // brandIds and departmentIds come from dialog-local scope, not the
        // timeline props: each scope field's Apply is the source of truth once
        // the dialog has seeded.
        brandIds: scopeBrands.map((option) => option.id),
        departmentIds: scopeDepartments.map((option) => option.id),
      }),
    // `filters` gets a new identity on every parent render; its inner arrays
    // are the stable pieces this derivation can actually consume, so depend on
    // those (brandIds and departmentIds are overridden by the scope state above
    // and are deliberately absent).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      exportOption.type,
      scopeBrands,
      scopeDepartments,
      filters?.projectIds,
      filters?.employeeIds,
    ],
  );
  // Stable key: cheap to derive from the memoized object, and the count effect
  // below keys off the honored contents instead of `filters` identity.
  const honoredFiltersKey = JSON.stringify(honoredFilters);

  // Live record count: debounced countOnly pre-flight against the same route
  // and params the export itself uses, so the number can't disagree with the file.
  useEffect(() => {
    const endpoint = countEndpointFor(exportOption.type);
    if (!endpoint || !shouldFetchExportCount({ open, exportType: exportOption.type, dateRange })) {
      setRecordCount(null);
      setCountStatus("idle");
      return;
    }
    const controller = new AbortController();
    // Both paths below abort the same controller, so `aborted` alone cannot say
    // which happened. A timeout is a genuine failure the user should stop
    // waiting on; a cleanup abort means this effect is stale and must not write
    // state at all. This flag is the only thing that tells them apart.
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    setCountStatus("loading");
    const timer = setTimeout(async () => {
      // Started here, not with the debounce, so the budget covers the request
      // itself rather than being partly eaten by the 400ms wait.
      timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, COUNT_TIMEOUT_MS);
      try {
        const count = await fetchExportCount(
          endpoint,
          { dateRange, filters: honoredFilters },
          controller.signal,
        );
        // A response that resolved just before cleanup must not overwrite the
        // count for a range the user has already moved on from.
        if (controller.signal.aborted) return;
        setRecordCount(count);
        setCountStatus("ready");
      } catch {
        // Report a timeout as an error; stay silent for a cleanup cancellation.
        if (timedOut || !controller.signal.aborted) {
          setRecordCount(null);
          setCountStatus("error");
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      clearTimeout(timeoutId);
      controller.abort();
    };
    // `filters` identity changes on every parent render, so depend on the
    // serialized honored subset instead — same reason the range-seeding effect
    // above ignores it. Adding a filter to HONORED_FILTERS for this export type
    // automatically re-counts on its changes; nobody has to touch this array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, exportOption.type, dateRange.start, dateRange.end, honoredFiltersKey]);

  const handleExport = async () => {
    setIsExporting(true);
    setExportProgress("Initializing export...");

    try {
      if (exportOption.requireDateRange && (!dateRange.start || !dateRange.end)) {
        toast({
          variant: "destructive",
          title: "Validation Error",
          description: "Start date and end date are required for this export.",
        });
        setIsExporting(false);
        setExportProgress("");
        return;
      }

      // Same builder and same honored subset as the countOnly pre-flight, so
      // count and file agree.
      const params = buildExportSearchParams({ dateRange, filters: honoredFilters });
      params.append("format", format);

      // Build API URL
      let apiUrl: string;
      if (format === "excel" && exportOption.type === "utilization") {
        apiUrl = `/api/export/utilization/excel?${params.toString()}`;
      } else if (format === "excel" && exportOption.type === "projects") {
        apiUrl = `/api/export/projects/excel?${params.toString()}`;
      } else if (format === "excel" && exportOption.type === "assignments") {
        apiUrl = `/api/export/assignments/excel?${params.toString()}`;
      } else if (format === "excel" && exportOption.type === "conflicts") {
        apiUrl = `/api/export/conflicts/excel?${params.toString()}`;
      } else if (format === "excel" && exportOption.type === "brand") {
        // Same route constant the count pre-flight resolves to, so the number
        // in the dialog and the file it describes can never target different URLs.
        apiUrl = `${BRAND_EXPORT_ROUTE}?${params.toString()}`;
      } else if (format === "excel" && exportOption.type === "detailed") {
        // Same rule as the brand branch above: one constant for both the count
        // pre-flight and the file, so they can never target different URLs.
        apiUrl = `${DETAILED_EXPORT_ROUTE}?${params.toString()}`;
      } else {
        apiUrl = `/api/export/${exportOption.type}?${params.toString()}`;
      }

      // Fetch export data with better progress tracking
      console.log('[Export Dialog] Fetching from:', apiUrl);
      setExportProgress("Fetching data from database...");

      // Add timeout to prevent hanging - different timeouts for different export types
      // Project export needs more time due to complex data processing
      const timeoutMs = exportOption.type === 'projects' ? 120000 : 60000; // 120s for projects, 60s for others
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      let response;
      try {
        console.log('[Export Dialog] Starting fetch:', apiUrl);
        response = await fetch(apiUrl, { signal: controller.signal });
        console.log('[Export Dialog] Response status:', response.status, 'ok:', response.ok, 'content-type:', response.headers.get('content-type'));
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error('Export timed out. Please try again or contact support.');
        }
        throw fetchError;
      }
      clearTimeout(timeoutId);

      if (!response.ok) {
        // Try to parse error as JSON first
        let errorMessage = 'Export failed';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If JSON parse fails, try text
          errorMessage = await response.text().catch(() => errorMessage);
        }

        // Handle 404 (no data) gracefully
        if (response.status === 404) {
          toast({
            variant: "destructive",
            title: "No Data Found",
            description: errorMessage || `No ${exportOption.label.toLowerCase()} data found for the selected criteria. Try adjusting the date range or filters.`,
          });
          setIsExporting(false);
          setExportProgress("");
          return;
        }

        throw new Error(errorMessage);
      }

      // Get filename from Content-Disposition header or generate one
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename: string;

      if (contentDisposition) {
        const match = contentDisposition.match(/filename="([^"]+)"/);
        filename = match ? match[1] : generateExportFilename(exportOption.type, format);
      } else {
        filename = generateExportFilename(exportOption.type, format);
      }

      // Download file with progress
      setExportProgress(format === "excel" ? "Generating Excel file..." : "Preparing CSV download...");

      if (format === "excel") {
        const buffer = await response.arrayBuffer();
        setExportProgress("Downloading Excel file...");
        downloadExcelFile(Buffer.from(buffer), filename);
      } else {
        const csvContent = await response.text();
        setExportProgress("Downloading CSV file...");
        downloadCsvFile(csvContent, filename);
      }

      toast({
        title: "Export successful",
        description: `${exportOption.label} has been exported to ${filename}.`,
      });

      onOpenChange(false);
    } catch (error) {
      console.error("[Export Dialog] Export failed:", error);
      toast({
        variant: "destructive",
        title: "Export failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
      });
    } finally {
      setIsExporting(false);
      setExportProgress("");
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const countView = resolveExportCountView({
    exportType: exportOption.type,
    status: countStatus,
    count: recordCount,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon icon={exportOption.icon} className="w-4 h-4 text-primary" />
            </div>
            <div>
              <DialogTitle>Export {exportOption.label}</DialogTitle>
              <DialogDescription>{exportOption.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Date Range (if required) */}
          {exportOption.requireDateRange && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Date Range</Label>
              <CustomRangePicker
                value={
                  dateRange.start && dateRange.end
                    ? {
                        start: startOfMonth(new Date(dateRange.start)),
                        end: startOfMonth(new Date(dateRange.end)),
                      }
                    : null
                }
                onApply={(range) =>
                  setDateRange({
                    start: formatDateFns(range.start, "yyyy-MM-dd"),
                    end: formatDateFns(endOfMonth(range.end), "yyyy-MM-dd"),
                  })
                }
              >
                <Button variant="outline" className="w-full justify-between font-normal">
                  <span>
                    {dateRange.start && dateRange.end
                      ? `${formatDate(dateRange.start)} - ${formatDate(dateRange.end)}`
                      : "Select date range"}
                  </span>
                  <Icon icon="lucide:calendar" className="h-4 w-4 text-muted-foreground" />
                </Button>
              </CustomRangePicker>
            </div>
          )}

          {/* Editable scope — rendered only for filters this export honors. */}
          {honorsFilter(exportOption.type, "brandIds") && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {FILTER_LABELS.brandIds.many}
              </Label>
              <BrandScopeField scope={scopeBrands} onApply={setScopeBrands} />
            </div>
          )}

          {honorsFilter(exportOption.type, "departmentIds") && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {FILTER_LABELS.departmentIds.many}
              </Label>
              <DepartmentScopeField scope={scopeDepartments} onApply={setScopeDepartments} />
            </div>
          )}

          {/* Format Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Format</Label>
            <RadioGroup value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
              {FORMAT_CHOICES.map((choice) => {
                const isAvailable = exportOption.formats.includes(choice.value);
                return (
                  <div
                    key={choice.value}
                    className={`flex items-center space-x-2 rounded-md border p-3 ${
                      isAvailable ? "hover:bg-accent" : "opacity-50"
                    }`}
                  >
                    <RadioGroupItem value={choice.value} id={choice.value} disabled={!isAvailable} />
                    <Label
                      htmlFor={choice.value}
                      className={`flex-1 ${isAvailable ? "cursor-pointer" : "cursor-not-allowed"}`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon icon={choice.icon} className={`h-4 w-4 ${choice.iconClassName}`} />
                        <span className="font-medium">{choice.label}</span>
                        <span className="text-xs text-muted-foreground">
                          - {isAvailable ? choice.description : "Not available for this report"}
                        </span>
                      </div>
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
          </div>

          {/* Record Count */}
          {countView.banner && (
            <div className="rounded-md bg-muted p-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {countView.banner.kind === "loading" && (
                  <>
                    <Icon icon="lucide:loader-2" className="h-4 w-4 animate-spin" />
                    <span>Counting records…</span>
                  </>
                )}
                {countView.banner.kind === "empty" && (
                  <>
                    <Icon icon="lucide:info" className="h-4 w-4" />
                    <span>No data in the selected range</span>
                  </>
                )}
                {countView.banner.kind === "count" && (
                  <>
                    <Icon icon="lucide:info" className="h-4 w-4" />
                    <span>
                      <span className="font-semibold text-foreground">
                        {countView.banner.count.toLocaleString()}
                      </span>{" "}
                      record{countView.banner.count === 1 ? "" : "s"} will be exported
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isExporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting || countView.blocksExport}>
            {isExporting ? (
              <>
                <Icon icon="lucide:loader-2" className="mr-2 h-4 w-4 animate-spin" />
                {exportProgress || "Exporting..."}
              </>
            ) : (
              <>
                <Icon icon="lucide:download" className="mr-2 h-4 w-4" />
                Export {exportOption.label}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExportDialog;
