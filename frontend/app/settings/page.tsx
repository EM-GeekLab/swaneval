"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Settings,
  Database,
  Key,
  Bell,
  User,
  Save,
  TestTube,
  Server,
  Globe,
  Shield,
  Palette,
  HardDrive,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general");

  // Form states
  const [generalSettings, setGeneralSettings] = useState({
    appName: "EvalScope GUI",
    language: "en",
    theme: "light",
    timezone: "UTC",
  });

  const [dbSettings, setDbSettings] = useState({
    host: "localhost",
    port: "6001",
    username: "evalscope",
    password: "evalscope",
    database: "evalscope",
  });

  const [redisSettings, setRedisSettings] = useState({
    host: "localhost",
    port: "6379",
    password: "",
    database: "0",
  });

  const [apiSettings, setApiSettings] = useState({
    backendUrl: "http://localhost:8000",
    apiTimeout: "30",
    maxRetries: "3",
  });

  const [notificationSettings, setNotificationSettings] = useState({
    emailEnabled: false,
    emailAddress: "",
    taskCompletion: true,
    taskFailure: true,
    weeklyReport: false,
  });

  const handleSave = () => {
    console.log("Saving settings:", {
      general: generalSettings,
      database: dbSettings,
      redis: redisSettings,
      api: apiSettings,
      notifications: notificationSettings,
    });
    // TODO: Save to backend
  };

  const testConnection = (type: string) => {
    console.log(`Testing ${type} connection...`);
    // TODO: Implement connection test
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">EvalScope GUI</h1>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 border-r bg-white min-h-[calc(100vh-64px)]">
          <nav className="p-4 space-y-2">
            <Link
              href="/evaluations"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground hover:bg-muted"
            >
              <Settings className="h-5 w-5" />
              Evaluations
            </Link>
            <Link
              href="/models"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground hover:bg-muted"
            >
              <Settings className="h-5 w-5" />
              Models
            </Link>
            <Link
              href="/datasets"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground hover:bg-muted"
            >
              <Settings className="h-5 w-5" />
              Datasets
            </Link>
            <Link
              href="/results"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground hover:bg-muted"
            >
              <Settings className="h-5 w-5" />
              Results
            </Link>
            <Link
              href="/settings"
              className="flex items-center gap-3 rounded-lg bg-primary/10 px-3 py-2 text-primary"
            >
              <Settings className="h-5 w-5" />
              Settings
            </Link>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6">
          <div className="space-y-6">
            {/* Page Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Settings</h2>
                <p className="text-muted-foreground">
                  Manage application configuration
                </p>
              </div>
              <Button onClick={handleSave}>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </Button>
            </div>

            {/* Settings Tabs */}
            <Tabs defaultValue="general" className="space-y-4">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger
                  value="general"
                  className="flex items-center gap-2"
                >
                  <Settings className="h-4 w-4" />
                  General
                </TabsTrigger>
                <TabsTrigger
                  value="database"
                  className="flex items-center gap-2"
                >
                  <Database className="h-4 w-4" />
                  Database
                </TabsTrigger>
                <TabsTrigger value="redis" className="flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  Redis
                </TabsTrigger>
                <TabsTrigger value="api" className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  API
                </TabsTrigger>
                <TabsTrigger
                  value="notifications"
                  className="flex items-center gap-2"
                >
                  <Bell className="h-4 w-4" />
                  Notifications
                </TabsTrigger>
              </TabsList>

              {/* General Settings */}
              <TabsContent value="general">
                <Card>
                  <CardHeader>
                    <CardTitle>General Settings</CardTitle>
                    <CardDescription>
                      Configure general application preferences
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="grid gap-2">
                        <Label>Application Name</Label>
                        <Input
                          value={generalSettings.appName}
                          onChange={(e) =>
                            setGeneralSettings({
                              ...generalSettings,
                              appName: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Language</Label>
                        <Select
                          value={generalSettings.language}
                          onValueChange={(value) =>
                            setGeneralSettings({
                              ...generalSettings,
                              language: value,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="en">English</SelectItem>
                            <SelectItem value="zh">中文</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label>Theme</Label>
                        <Select
                          value={generalSettings.theme}
                          onValueChange={(value) =>
                            setGeneralSettings({
                              ...generalSettings,
                              theme: value,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="light">Light</SelectItem>
                            <SelectItem value="dark">Dark</SelectItem>
                            <SelectItem value="system">System</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label>Timezone</Label>
                        <Select
                          value={generalSettings.timezone}
                          onValueChange={(value) =>
                            setGeneralSettings({
                              ...generalSettings,
                              timezone: value,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="UTC">UTC</SelectItem>
                            <SelectItem value="America/New_York">
                              Eastern Time
                            </SelectItem>
                            <SelectItem value="America/Los_Angeles">
                              Pacific Time
                            </SelectItem>
                            <SelectItem value="Asia/Shanghai">
                              China Standard Time
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Database Settings */}
              <TabsContent value="database">
                <Card>
                  <CardHeader>
                    <CardTitle>PostgreSQL Configuration</CardTitle>
                    <CardDescription>
                      Configure database connection settings
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="grid gap-2">
                        <Label>Host</Label>
                        <Input
                          value={dbSettings.host}
                          onChange={(e) =>
                            setDbSettings({
                              ...dbSettings,
                              host: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Port</Label>
                        <Input
                          value={dbSettings.port}
                          onChange={(e) =>
                            setDbSettings({
                              ...dbSettings,
                              port: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Username</Label>
                        <Input
                          value={dbSettings.username}
                          onChange={(e) =>
                            setDbSettings({
                              ...dbSettings,
                              username: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Password</Label>
                        <Input
                          type="password"
                          value={dbSettings.password}
                          onChange={(e) =>
                            setDbSettings({
                              ...dbSettings,
                              password: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="grid gap-2 md:col-span-2">
                        <Label>Database Name</Label>
                        <Input
                          value={dbSettings.database}
                          onChange={(e) =>
                            setDbSettings({
                              ...dbSettings,
                              database: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 p-4 rounded-lg bg-muted">
                      <Key className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Connection string: postgresql://{dbSettings.username}:
                        {dbSettings.password}@{dbSettings.host}:
                        {dbSettings.port}/{dbSettings.database}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => testConnection("database")}
                      >
                        <TestTube className="h-4 w-4 mr-2" />
                        Test Connection
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Redis Settings */}
              <TabsContent value="redis">
                <Card>
                  <CardHeader>
                    <CardTitle>Redis Configuration</CardTitle>
                    <CardDescription>
                      Configure Redis connection for task queue
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="grid gap-2">
                        <Label>Host</Label>
                        <Input
                          value={redisSettings.host}
                          onChange={(e) =>
                            setRedisSettings({
                              ...redisSettings,
                              host: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Port</Label>
                        <Input
                          value={redisSettings.port}
                          onChange={(e) =>
                            setRedisSettings({
                              ...redisSettings,
                              port: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Password (optional)</Label>
                        <Input
                          type="password"
                          value={redisSettings.password}
                          onChange={(e) =>
                            setRedisSettings({
                              ...redisSettings,
                              password: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Database Number</Label>
                        <Input
                          value={redisSettings.database}
                          onChange={(e) =>
                            setRedisSettings({
                              ...redisSettings,
                              database: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 p-4 rounded-lg bg-muted">
                      <Key className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Connection string: redis://
                        {redisSettings.password
                          ? `:${redisSettings.password}@`
                          : ""}
                        {redisSettings.host}:{redisSettings.port}/
                        {redisSettings.database}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => testConnection("redis")}
                      >
                        <TestTube className="h-4 w-4 mr-2" />
                        Test Connection
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* API Settings */}
              <TabsContent value="api">
                <Card>
                  <CardHeader>
                    <CardTitle>API Configuration</CardTitle>
                    <CardDescription>
                      Configure backend API settings
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="grid gap-2 md:col-span-2">
                        <Label>Backend URL</Label>
                        <Input
                          value={apiSettings.backendUrl}
                          onChange={(e) =>
                            setApiSettings({
                              ...apiSettings,
                              backendUrl: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Request Timeout (seconds)</Label>
                        <Input
                          type="number"
                          value={apiSettings.apiTimeout}
                          onChange={(e) =>
                            setApiSettings({
                              ...apiSettings,
                              apiTimeout: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Max Retries</Label>
                        <Input
                          type="number"
                          value={apiSettings.maxRetries}
                          onChange={(e) =>
                            setApiSettings({
                              ...apiSettings,
                              maxRetries: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Notification Settings */}
              <TabsContent value="notifications">
                <Card>
                  <CardHeader>
                    <CardTitle>Notification Settings</CardTitle>
                    <CardDescription>
                      Configure email and alert preferences
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 rounded-lg border">
                        <div className="space-y-1">
                          <Label>Email Notifications</Label>
                          <p className="text-sm text-muted-foreground">
                            Receive email alerts for important events
                          </p>
                        </div>
                        <Button
                          variant={
                            notificationSettings.emailEnabled
                              ? "default"
                              : "outline"
                          }
                          size="sm"
                          onClick={() =>
                            setNotificationSettings({
                              ...notificationSettings,
                              emailEnabled: !notificationSettings.emailEnabled,
                            })
                          }
                        >
                          {notificationSettings.emailEnabled ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : null}
                          {notificationSettings.emailEnabled
                            ? "Enabled"
                            : "Disabled"}
                        </Button>
                      </div>

                      {notificationSettings.emailEnabled && (
                        <div className="grid gap-2 pl-4 border-l-2">
                          <Label>Email Address</Label>
                          <Input
                            type="email"
                            placeholder="admin@example.com"
                            value={notificationSettings.emailAddress}
                            onChange={(e) =>
                              setNotificationSettings({
                                ...notificationSettings,
                                emailAddress: e.target.value,
                              })
                            }
                          />
                        </div>
                      )}

                      <div className="flex items-center justify-between p-4 rounded-lg border">
                        <div className="space-y-1">
                          <Label>Task Completion</Label>
                          <p className="text-sm text-muted-foreground">
                            Notify when evaluation tasks complete
                          </p>
                        </div>
                        <Button
                          variant={
                            notificationSettings.taskCompletion
                              ? "default"
                              : "outline"
                          }
                          size="sm"
                          onClick={() =>
                            setNotificationSettings({
                              ...notificationSettings,
                              taskCompletion:
                                !notificationSettings.taskCompletion,
                            })
                          }
                        >
                          {notificationSettings.taskCompletion ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : null}
                          {notificationSettings.taskCompletion
                            ? "Enabled"
                            : "Disabled"}
                        </Button>
                      </div>

                      <div className="flex items-center justify-between p-4 rounded-lg border">
                        <div className="space-y-1">
                          <Label>Task Failure</Label>
                          <p className="text-sm text-muted-foreground">
                            Notify when evaluation tasks fail
                          </p>
                        </div>
                        <Button
                          variant={
                            notificationSettings.taskFailure
                              ? "default"
                              : "outline"
                          }
                          size="sm"
                          onClick={() =>
                            setNotificationSettings({
                              ...notificationSettings,
                              taskFailure: !notificationSettings.taskFailure,
                            })
                          }
                        >
                          {notificationSettings.taskFailure ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : null}
                          {notificationSettings.taskFailure
                            ? "Enabled"
                            : "Disabled"}
                        </Button>
                      </div>

                      <div className="flex items-center justify-between p-4 rounded-lg border">
                        <div className="space-y-1">
                          <Label>Weekly Report</Label>
                          <p className="text-sm text-muted-foreground">
                            Receive weekly performance summary
                          </p>
                        </div>
                        <Button
                          variant={
                            notificationSettings.weeklyReport
                              ? "default"
                              : "outline"
                          }
                          size="sm"
                          onClick={() =>
                            setNotificationSettings({
                              ...notificationSettings,
                              weeklyReport: !notificationSettings.weeklyReport,
                            })
                          }
                        >
                          {notificationSettings.weeklyReport ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : null}
                          {notificationSettings.weeklyReport
                            ? "Enabled"
                            : "Disabled"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </div>
  );
}
