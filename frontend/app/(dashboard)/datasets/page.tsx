"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
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
import { Plus, Upload, Trash2, Eye } from "lucide-react";
import {
  useDatasets,
  useUploadDataset,
  useDeleteDataset,
  useDatasetPreview,
} from "@/lib/hooks/use-datasets";

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function DatasetsPage() {
  const { data: datasets = [], isLoading, refetch } = useDatasets();
  const upload = useUploadDataset();
  const deleteMut = useDeleteDataset();

  const [open, setOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [form, setForm] = useState({ name: "", description: "", tags: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  const preview = useDatasetPreview(previewId ?? "", !!previewId);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    await upload.mutateAsync({
      file,
      name: form.name || file.name,
      description: form.description,
      tags: form.tags,
    });
    setForm({ name: "", description: "", tags: "" });
    setOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
    } finally {
      setDeleteTarget(null);
      refetch();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">数据集 Datasets</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" /> Upload
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Upload Dataset</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpload} className="space-y-3">
              <div className="space-y-1">
                <Label>File (JSONL / CSV / JSON)</Label>
                <Input
                  ref={fileRef}
                  type="file"
                  accept=".jsonl,.csv,.json"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Optional — defaults to filename"
                />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Input
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Tags (comma-separated)</Label>
                <Input
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  placeholder="math,reasoning"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={upload.isPending}
              >
                <Upload className="mr-1 h-4 w-4" />
                {upload.isPending ? "Uploading..." : "Upload"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Format</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead className="text-right">Ver</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-muted-foreground py-8"
                  >
                    Loading...
                  </TableCell>
                </TableRow>
              ) : datasets.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-muted-foreground py-8"
                  >
                    No datasets. Upload one to get started.
                  </TableCell>
                </TableRow>
              ) : (
                datasets.map((ds) => (
                  <TableRow key={ds.id}>
                    <TableCell className="font-medium">{ds.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{ds.source_type}</Badge>
                    </TableCell>
                    <TableCell>{ds.format}</TableCell>
                    <TableCell className="text-right font-mono">
                      {ds.row_count.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatBytes(ds.size_bytes)}
                    </TableCell>
                    <TableCell>
                      {ds.tags &&
                        ds.tags.split(",").map((t) => (
                          <Badge
                            key={t}
                            variant="secondary"
                            className="mr-1"
                          >
                            {t.trim()}
                          </Badge>
                        ))}
                    </TableCell>
                    <TableCell className="text-right">
                      v{ds.version}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setPreviewId(ds.id)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() =>
                          setDeleteTarget({ id: ds.id, name: ds.name })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={!!previewId} onOpenChange={() => setPreviewId(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Dataset Preview</DialogTitle>
          </DialogHeader>
          {preview.isLoading ? (
            <p className="text-muted-foreground text-center py-8">
              Loading...
            </p>
          ) : preview.data?.rows.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No rows</p>
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
              <p className="mt-2 text-xs text-muted-foreground">
                Showing {preview.data?.rows.length} of {preview.data?.total}{" "}
                rows
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Dataset</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
