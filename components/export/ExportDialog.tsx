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

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exportOption: ExportOption;
  filters?: {
    brandId?: string | null;
    departmentId?: string | null;
    projectId?: string | null;
    employeeIds?: string[];
    startDate?: string;
    endDate?: string;
  };
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

  // Estimate record count
  useEffect(() => {
    // This is a rough estimate - actual count would come from API
    const estimateCount = () => {
      switch (exportOption.type) {
        case "assignments":
          return 100 + Math.floor(Math.random() * 500);
        case "utilization":
          return 50 + Math.floor(Math.random() * 100);
        case "projects":
          return 20 + Math.floor(Math.random() * 50);
        case "conflicts":
          return 5 + Math.floor(Math.random() * 30);
        default:
          return 50;
      }
    };
    setRecordCount(estimateCount());
  }, [exportOption]);

  const handleExport = async () => {
    setIsExporting(true);
    setExportProgress("Initializing export...");

    try {
      // Build query parameters
      const params = new URLSearchParams();
      params.append("format", format);

      // Always add date range if available (not just when required)
      if (dateRange.start && dateRange.end) {
        params.append("startDate", dateRange.start);
        params.append("endDate", dateRange.end);
      } else if (exportOption.requireDateRange) {
        toast({
          variant: "destructive",
          title: "Validation Error",
          description: "Start date and end date are required for this export.",
        });
        setIsExporting(false);
        setExportProgress("");
        return;
      }

      if (filters?.brandId) params.append("brandIds", filters.brandId);
      if (filters?.departmentId) params.append("departmentIds", filters.departmentId);
      if (filters?.projectId) params.append("projectIds", filters.projectId);
      if (filters?.employeeIds?.length) params.append("employeeIds", filters.employeeIds.join(","));

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
              {exportOption.formats.includes("csv") && (
                <div className="flex items-center space-x-2 rounded-md border p-3 hover:bg-accent">
                  <RadioGroupItem value="csv" id="csv" />
                  <Label htmlFor="csv" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Icon icon="lucide:file-text" className="h-4 w-4" />
                      <span className="font-medium">CSV</span>
                      <span className="text-xs text-muted-foreground">- Opens in Excel</span>
                    </div>
                  </Label>
                </div>
              )}
              {exportOption.formats.includes("excel") && (
                <div className="flex items-center space-x-2 rounded-md border p-3 hover:bg-accent">
                  <RadioGroupItem value="excel" id="excel" />
                  <Label htmlFor="excel" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Icon icon="lucide:file-spreadsheet" className="h-4 w-4 text-green-600" />
                      <span className="font-medium">Excel</span>
                      <span className="text-xs text-muted-foreground">- Multi-sheet with formatting</span>
                    </div>
                  </Label>
                </div>
              )}
            </RadioGroup>
          </div>

          {/* Record Count */}
          {recordCount !== null && (
            <div className="rounded-md bg-muted p-3">
              <div className="flex items-center gap-2 text-sm">
                <Icon icon="lucide:info" className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  Approximately <span className="font-semibold text-foreground">{recordCount}</span> records will be exported
                </span>
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
          <Button onClick={handleExport} disabled={isExporting}>
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
