"use client";

import React, { useState, useEffect } from "react";
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
  resolveExportCountView,
  shouldFetchExportCount,
  type ExportCountStatus,
} from "@/lib/export/export-count-state";

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
}

export const ExportDialog: React.FC<ExportDialogProps> = ({
  open,
  onOpenChange,
  exportOption,
  filters,
}) => {
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState("");
  const [recordCount, setRecordCount] = useState<number | null>(null);
  const [countStatus, setCountStatus] = useState<ExportCountStatus>("idle");
  const [dateRange, setDateRange] = useState({ start: "", end: "" });

  // Set default format based on what's available
  useEffect(() => {
    if (!exportOption.formats.includes(format)) {
      setFormat(exportOption.formats[0]);
    }
  }, [exportOption, format]);

  // Seed the date range only when the dialog opens. The timeline default
  // arrives via filters, whose identity changes on every parent render —
  // re-seeding on those changes would clobber a range the user picked here.
  useEffect(() => {
    if (!open) return;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setDateRange({
      start: filters?.startDate || monthStart.toISOString().split('T')[0],
      end: filters?.endDate || monthEnd.toISOString().split('T')[0],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Stable key for the employee filter: the array's identity changes on every
  // parent render, so the effect below keys off its contents instead.
  const employeeIdsKey = filters?.employeeIds?.join(",");

  // Live record count: debounced countOnly pre-flight against the same route
  // and params the export itself uses, so the number can't disagree with the file.
  useEffect(() => {
    if (!shouldFetchExportCount({ open, exportType: exportOption.type, dateRange })) {
      setRecordCount(null);
      setCountStatus("idle");
      return;
    }
    const controller = new AbortController();
    setCountStatus("loading");
    const timer = setTimeout(async () => {
      try {
        const params = buildExportSearchParams({ dateRange, filters });
        params.append("countOnly", "true");
        const response = await fetch(`/api/export/brand/excel?${params.toString()}`, {
          signal: controller.signal,
        });
        // Non-200 means the request failed (401/400/500) — never "zero rows",
        // which the route returns as 200 with { count: 0 }.
        if (!response.ok) throw new Error(`Count request failed: ${response.status}`);
        const data = await response.json();
        // A response that resolved just before cleanup must not overwrite the
        // count for a range the user has already moved on from.
        if (controller.signal.aborted) return;
        setRecordCount(typeof data.count === "number" ? data.count : null);
        setCountStatus("ready");
      } catch {
        if (!controller.signal.aborted) {
          setRecordCount(null);
          setCountStatus("error");
        }
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `filters` identity changes on every parent render, so depend on its
    // primitive fields — same reason the range-seeding effect above ignores it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    exportOption.type,
    dateRange.start,
    dateRange.end,
    filters?.brandId,
    filters?.departmentId,
    filters?.projectId,
    employeeIdsKey,
  ]);

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

      // Same builder as the countOnly pre-flight, so count and file agree.
      const params = buildExportSearchParams({ dateRange, filters });
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
        apiUrl = `/api/export/brand/excel?${params.toString()}`;
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
                      <span className="font-semibold text-foreground">{countView.banner.count}</span>{" "}
                      records will be exported
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Applied Filters */}
          {filters && (filters.brandId || filters.departmentId || filters.projectId) && (
            <div className="rounded-md bg-blue-50 dark:bg-blue-950 p-3">
              <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                <Icon icon="lucide:filter" className="h-4 w-4" />
                <span className="font-medium">Applied Filters</span>
              </div>
              <div className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                {filters.brandId && <div>Brand: {filters.brandId}</div>}
                {filters.departmentId && <div>Department: {filters.departmentId}</div>}
                {filters.projectId && <div>Project: {filters.projectId}</div>}
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
