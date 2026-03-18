"use client";

import { useState } from "react";
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Zap, Loader2 } from "lucide-react";
import {
  useModels,
  useCreateModel,
  useDeleteModel,
  useTestModel,
} from "@/lib/hooks/use-models";

export default function ModelsPage() {
  const { data: models = [], isLoading } = useModels();
  const create = useCreateModel();
  const deleteMut = useDeleteModel();
  const testModel = useTestModel();

  const [open, setOpen] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, { ok: boolean; message: string }>
  >({});
  const [form, setForm] = useState({
    name: "",
    provider: "",
    endpoint_url: "",
    api_key: "",
    model_type: "api" as string,
    description: "",
    model_name: "",
    max_tokens: "4096",
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await create.mutateAsync({
      name: form.name,
      provider: form.provider,
      endpoint_url: form.endpoint_url,
      api_key: form.api_key || undefined,
      model_type: form.model_type,
      description: form.description || undefined,
      model_name: form.model_name || undefined,
      max_tokens: form.max_tokens ? parseInt(form.max_tokens) : undefined,
    });
    setForm({
      name: "",
      provider: "",
      endpoint_url: "",
      api_key: "",
      model_type: "api",
      description: "",
      model_name: "",
      max_tokens: "4096",
    });
    setOpen(false);
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    setTestResults((prev) => ({ ...prev, [id]: { ok: false, message: "Testing..." } }));
    try {
      const result = await testModel.mutateAsync(id);
      setTestResults((prev) => ({
        ...prev,
        [id]: { ok: result.ok, message: result.message },
      }));
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [id]: { ok: false, message: "Connection failed" },
      }));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">模型 Models</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" /> Add Model
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Register Model</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Display Name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) =>
                      setForm({ ...form, name: e.target.value })
                    }
                    placeholder="GPT-4o"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Provider</Label>
                  <Input
                    value={form.provider}
                    onChange={(e) =>
                      setForm({ ...form, provider: e.target.value })
                    }
                    placeholder="openai"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Model Name / ID</Label>
                  <Input
                    value={form.model_name}
                    onChange={(e) =>
                      setForm({ ...form, model_name: e.target.value })
                    }
                    placeholder="gpt-4o-2024-08-06"
                  />
                  <p className="text-xs text-muted-foreground">
                    Actual model identifier sent to the API
                  </p>
                </div>
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select
                    value={form.model_type}
                    onValueChange={(v) =>
                      setForm({ ...form, model_type: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="api">API</SelectItem>
                      <SelectItem value="local">Local</SelectItem>
                      <SelectItem value="huggingface">HuggingFace</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Endpoint URL</Label>
                <Input
                  value={form.endpoint_url}
                  onChange={(e) =>
                    setForm({ ...form, endpoint_url: e.target.value })
                  }
                  placeholder="https://api.openai.com/v1/chat/completions"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>API Key</Label>
                  <Input
                    type="password"
                    value={form.api_key}
                    onChange={(e) =>
                      setForm({ ...form, api_key: e.target.value })
                    }
                    placeholder="sk-..."
                  />
                </div>
                <div className="space-y-1">
                  <Label>Max Tokens</Label>
                  <Input
                    type="number"
                    value={form.max_tokens}
                    onChange={(e) =>
                      setForm({ ...form, max_tokens: e.target.value })
                    }
                    placeholder="4096"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Input
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="Notes about this model configuration..."
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={create.isPending}
              >
                {create.isPending ? "Adding..." : "Add Model"}
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
                <TableHead>Provider</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground py-8"
                  >
                    Loading...
                  </TableCell>
                </TableRow>
              ) : models.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground py-8"
                  >
                    No models registered.
                  </TableCell>
                </TableRow>
              ) : (
                models.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell>{m.provider}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{m.model_type}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-[200px] truncate">
                      {m.endpoint_url}
                    </TableCell>
                    <TableCell>
                      {testResults[m.id] ? (
                        <Badge
                          variant={
                            testResults[m.id].message === "Testing..."
                              ? "outline"
                              : testResults[m.id].ok
                                ? "default"
                                : "destructive"
                          }
                        >
                          {testResults[m.id].message === "Testing..."
                            ? "Testing..."
                            : testResults[m.id].ok
                              ? "OK"
                              : "Failed"}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          -
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(m.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleTest(m.id)}
                        disabled={testingId === m.id}
                        title="Test endpoint"
                      >
                        {testingId === m.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Zap className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => deleteMut.mutate(m.id)}
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
    </div>
  );
}
