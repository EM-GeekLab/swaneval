"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { JsonImportBar } from "@/components/json-import-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PanelField } from "@/components/panel-helpers";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Check,
  Upload,
  FolderOpen,
  Globe,
} from "lucide-react";
import {
  useUploadDataset,
  useMountDataset,
  useImportDataset,
} from "@/lib/hooks/use-datasets";
import { extractErrorDetail } from "@/lib/utils";

const emptyUploadForm = {
  name: "",
  description: "",
  tags: "",
};

const emptyMountForm = {
  name: "",
  description: "",
  server_path: "",
  format: "jsonl",
  tags: "",
};

const emptyImportForm = {
  source: "huggingface" as "huggingface" | "modelscope",
  dataset_id: "",
  name: "",
  subset: "",
  split: "test",
  description: "",
  tags: "",
};

export type ImportFormState = typeof emptyImportForm;

interface DatasetCreateFormProps {
  onSuccess: () => void;
  /** Controlled active tab */
  activeTab: string;
  onTabChange: (tab: string) => void;
  /** Report dirty state to parent */
  onDirtyChange?: (dirty: boolean) => void;
  /** Externally set import form values (e.g. from preset selection) */
  importFormOverride?: ImportFormState | null;
  /** Track import in the progress hub */
  onImportStart?: (name: string, source: string) => string;
  onImportDone?: (jobId: string) => void;
  onImportFail?: (jobId: string, error: string) => void;
}

export function DatasetCreateForm({
  onSuccess,
  activeTab,
  onTabChange,
  onDirtyChange,
  importFormOverride,
  onImportStart,
  onImportDone,
  onImportFail,
}: DatasetCreateFormProps) {
  const upload = useUploadDataset();
  const mount = useMountDataset();
  const importDs = useImportDataset();

  const [uploadForm, setUploadForm] = useState({ ...emptyUploadForm });
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mountForm, setMountForm] = useState({ ...emptyMountForm });
  const [importForm, setImportForm] = useState({ ...emptyImportForm });
  const [onlineImportError, setOnlineImportError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Apply external import form override when preset is selected
  useEffect(() => {
    if (importFormOverride) {
      setImportForm(importFormOverride);
    }
  }, [importFormOverride]);

  // Report dirty state
  const dirty =
    Object.entries(emptyUploadForm).some(
      ([k, v]) => uploadForm[k as keyof typeof uploadForm] !== v,
    ) ||
    Object.entries(emptyMountForm).some(
      ([k, v]) => mountForm[k as keyof typeof mountForm] !== v,
    ) ||
    Object.entries(emptyImportForm).some(
      ([k, v]) => importForm[k as keyof typeof importForm] !== v,
    ) ||
    selectedFile !== null;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const importDatasetJson = (text: string) => {
    try {
      const data = JSON.parse(text);
      if (data.server_path || data.source_uri) {
        setMountForm((f) => ({
          ...f,
          name: data.name ?? f.name,
          server_path: data.server_path ?? data.source_uri ?? f.server_path,
          format: data.format ?? f.format,
          tags: data.tags ?? f.tags,
          description: data.description ?? f.description,
        }));
      } else {
        setUploadForm((f) => ({
          ...f,
          name: data.name ?? f.name,
          tags: data.tags ?? f.tags,
          description: data.description ?? f.description,
        }));
      }
    } catch {
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = selectedFile ?? fileRef.current?.files?.[0];
    if (!file) return;
    await upload.mutateAsync({
      file,
      name: uploadForm.name || file.name,
      description: uploadForm.description,
      tags: uploadForm.tags,
    });
    setUploadForm({ ...emptyUploadForm });
    setSelectedFile(null);
    onSuccess();
  };

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        setSelectedFile(file);
        if (!uploadForm.name) {
          setUploadForm((f) => ({ ...f, name: file.name }));
        }
      }
    },
    [uploadForm.name],
  );

  const handleMount = async (e: React.FormEvent) => {
    e.preventDefault();
    await mount.mutateAsync({
      name: mountForm.name,
      description: mountForm.description,
      server_path: mountForm.server_path,
      format: mountForm.format,
      tags: mountForm.tags,
    });
    setMountForm({ ...emptyMountForm });
    onSuccess();
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setOnlineImportError("");
    const displayName = importForm.name || importForm.dataset_id;
    const source = importForm.source === "huggingface" ? "HuggingFace" : "ModelScope";
    const jobId = onImportStart?.(displayName, source);
    try {
      await importDs.mutateAsync({
        source: importForm.source,
        dataset_id: importForm.dataset_id,
        name: importForm.name || undefined,
        subset: importForm.subset || undefined,
        split: importForm.split || "test",
        description: importForm.description || undefined,
        tags: importForm.tags || undefined,
      });
      if (jobId) onImportDone?.(jobId);
      setImportForm({ ...emptyImportForm });
      onSuccess();
    } catch (err: unknown) {
      const msg = extractErrorDetail(err, "导入失败，请检查数据集 ID 是否正确");
      if (jobId) onImportFail?.(jobId, msg);
      setOnlineImportError(msg);
    }
  };

  return (
    <>
      <JsonImportBar onImport={importDatasetJson} className="mb-3" />

      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList className="w-full">
          <TabsTrigger value="online" className="flex-1">
            <Globe className="mr-1 h-3.5 w-3.5" /> 在线导入
          </TabsTrigger>
          <TabsTrigger value="upload" className="flex-1">
            <Upload className="mr-1 h-3.5 w-3.5" /> 上传
          </TabsTrigger>
          <TabsTrigger value="mount" className="flex-1">
            <FolderOpen className="mr-1 h-3.5 w-3.5" /> 路径
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
          <form onSubmit={handleUpload} className="space-y-3">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className={`relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 cursor-pointer transition-colors ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : selectedFile
                    ? "border-emerald-500/50 bg-emerald-500/5"
                    : "border-muted-foreground/25 hover:border-muted-foreground/40 hover:bg-muted/30"
              }`}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".jsonl,.csv,.json,.parquet,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setSelectedFile(file);
                    if (!uploadForm.name)
                      setUploadForm((f) => ({ ...f, name: file.name }));
                  }
                }}
              />
              {selectedFile ? (
                <>
                  <Check className="h-5 w-5 text-emerald-500" />
                  <p className="text-xs font-medium truncate max-w-full">
                    {selectedFile.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {(selectedFile.size / 1024).toFixed(1)} KB — 点击更换文件
                  </p>
                </>
              ) : (
                <>
                  <Upload
                    className={`h-6 w-6 ${dragOver ? "text-primary" : "text-muted-foreground/60"}`}
                  />
                  <p className="text-xs text-muted-foreground">
                    拖拽文件到此处，或{" "}
                    <span className="text-primary font-medium">点击选择</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    支持 JSONL、CSV、JSON、Parquet、Excel
                  </p>
                </>
              )}
            </div>
            <PanelField label="名称">
              <Input
                value={uploadForm.name}
                onChange={(e) =>
                  setUploadForm({ ...uploadForm, name: e.target.value })
                }
                placeholder="默认使用文件名"
              />
            </PanelField>
            <PanelField label="标签">
              <Input
                value={uploadForm.tags}
                onChange={(e) =>
                  setUploadForm({ ...uploadForm, tags: e.target.value })
                }
                placeholder="math,reasoning"
              />
            </PanelField>
            <PanelField label="描述">
              <Input
                value={uploadForm.description}
                onChange={(e) =>
                  setUploadForm({
                    ...uploadForm,
                    description: e.target.value,
                  })
                }
                placeholder="备注（可选）"
              />
            </PanelField>
            <div className="pt-1">
              <Button
                type="submit"
                className="w-full"
                disabled={upload.isPending}
              >
                {upload.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                {upload.isPending ? "上传中..." : "上传"}
              </Button>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="online">
          <form onSubmit={handleImport} className="space-y-3">
            <PanelField label="数据源">
              <Select
                value={importForm.source}
                onValueChange={(v) =>
                  setImportForm({ ...importForm, source: v as "huggingface" | "modelscope" })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="huggingface">HuggingFace</SelectItem>
                  <SelectItem value="modelscope">ModelScope</SelectItem>
                </SelectContent>
              </Select>
            </PanelField>
            <PanelField
              label={
                importForm.source === "huggingface"
                  ? "HuggingFace Dataset ID 或 URL"
                  : "ModelScope Dataset ID 或 URL"
              }
              required
            >
              <Input
                value={importForm.dataset_id}
                onChange={(e) =>
                  setImportForm({
                    ...importForm,
                    dataset_id: e.target.value,
                  })
                }
                placeholder={
                  importForm.source === "huggingface"
                    ? "openai/gsm8k"
                    : "modelscope/chinese_alpaca"
                }
                className="font-mono"
                required
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                {importForm.source === "huggingface"
                  ? "支持 Dataset ID（如 openai/gsm8k）或完整 URL"
                  : "支持 Dataset ID（如 modelscope/xxx）或完整 URL"}
              </p>
            </PanelField>
            <div className="grid grid-cols-2 gap-2">
              <PanelField label="子集（Subset）">
                <Input
                  value={importForm.subset}
                  onChange={(e) =>
                    setImportForm({ ...importForm, subset: e.target.value })
                  }
                  placeholder="可选"
                />
              </PanelField>
              <PanelField label="数据拆分（Split）">
                <Input
                  value={importForm.split}
                  onChange={(e) =>
                    setImportForm({ ...importForm, split: e.target.value })
                  }
                  placeholder="test"
                />
              </PanelField>
            </div>
            <PanelField label="显示名称">
              <Input
                value={importForm.name}
                onChange={(e) =>
                  setImportForm({ ...importForm, name: e.target.value })
                }
                placeholder="默认使用 Dataset ID"
              />
            </PanelField>
            <PanelField label="标签">
              <Input
                value={importForm.tags}
                onChange={(e) =>
                  setImportForm({ ...importForm, tags: e.target.value })
                }
                placeholder="math,reasoning"
              />
            </PanelField>
            {onlineImportError && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {onlineImportError}
              </div>
            )}
            <div className="pt-1">
              <Button
                type="submit"
                className="w-full"
                disabled={importDs.isPending}
              >
                {importDs.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Globe className="mr-2 h-4 w-4" />
                )}
                {importDs.isPending
                  ? "导入中（下载可能需要几分钟）..."
                  : "导入数据集"}
              </Button>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="mount">
          <form onSubmit={handleMount} className="space-y-3">
            <PanelField label="服务器路径" required>
              <Input
                value={mountForm.server_path}
                onChange={(e) =>
                  setMountForm({
                    ...mountForm,
                    server_path: e.target.value,
                  })
                }
                placeholder="/data/datasets/eval.jsonl"
                className="font-mono"
                required
              />
            </PanelField>
            <PanelField label="名称" required>
              <Input
                value={mountForm.name}
                onChange={(e) =>
                  setMountForm({ ...mountForm, name: e.target.value })
                }
                placeholder="数据集名称"
                required
              />
            </PanelField>
            <div className="grid grid-cols-2 gap-2">
              <PanelField label="格式">
                <Input
                  value={mountForm.format}
                  onChange={(e) =>
                    setMountForm({ ...mountForm, format: e.target.value })
                  }
                  placeholder="jsonl"
                />
              </PanelField>
              <PanelField label="标签">
                <Input
                  value={mountForm.tags}
                  onChange={(e) =>
                    setMountForm({ ...mountForm, tags: e.target.value })
                  }
                  placeholder="math,reasoning"
                />
              </PanelField>
            </div>
            <PanelField label="描述">
              <Input
                value={mountForm.description}
                onChange={(e) =>
                  setMountForm({
                    ...mountForm,
                    description: e.target.value,
                  })
                }
                placeholder="备注（可选）"
              />
            </PanelField>
            <div className="pt-1">
              <Button
                type="submit"
                className="w-full"
                disabled={mount.isPending}
              >
                {mount.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FolderOpen className="mr-2 h-4 w-4" />
                )}
                {mount.isPending ? "挂载中..." : "挂载路径"}
              </Button>
            </div>
          </form>
        </TabsContent>
      </Tabs>
    </>
  );
}
