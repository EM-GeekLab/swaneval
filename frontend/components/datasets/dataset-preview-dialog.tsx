"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { useDatasetPreview } from "@/lib/hooks/use-datasets";

interface DatasetPreviewDialogProps {
  datasetId: string | null;
  onClose: () => void;
}

export function DatasetPreviewDialog({ datasetId, onClose }: DatasetPreviewDialogProps) {
  const preview = useDatasetPreview(datasetId ?? "", !!datasetId);

  return (
    <Dialog open={!!datasetId} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>数据集预览</DialogTitle>
          <DialogDescription>显示数据集的前几行数据</DialogDescription>
        </DialogHeader>
        {preview.isLoading ? (
          <div className="py-8 text-center text-base-content/50">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
            加载中...
          </div>
        ) : preview.data?.rows.length === 0 ? (
          <p className="text-base-content/50 text-center py-8">暂无数据</p>
        ) : (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {preview.data?.rows[0] &&
                    Object.keys(preview.data.rows[0]).map((k) => (
                      <TableHead key={k}>{k}</TableHead>
                    ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.data?.rows.map((row, i) => (
                  <TableRow key={i}>
                    {Object.values(row).map((v, j) => (
                      <TableCell key={j} className="max-w-xs truncate">
                        {String(v)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-2 text-xs text-base-content/50">
              显示 {preview.data?.rows.length} / {preview.data?.total} 行
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
