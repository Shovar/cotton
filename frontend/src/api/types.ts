export type LogLevel = "debug" | "info" | "warn" | "error" | null;

export interface EnvironmentInfo {
  distro: string;
  domain_id: number;
  rmw: string | null;
  workspace: string | null;
  ros_version: string | null;
  app_version: string;
}

export interface NodeInfo {
  name: string;
  namespace: string;
  publishers: string[];
  subscribers: string[];
  services: string[];
  actions: string[];
}

export interface TopicInfo {
  name: string;
  types: string[];
  publishers: string[];
  subscribers: string[];
}

export interface GraphSnapshot {
  nodes: NodeInfo[];
  topics: TopicInfo[];
  services: Record<string, string[]>;
  actions: Record<string, string[]>;
  revision: number;
}

export type ProcessState = "starting" | "running" | "stopping" | "exited" | "failed";

export interface ProcessSpec {
  id: string;
  argv: string[];
  cwd: string | null;
  env: Record<string, string>;
  plugin: string | null;
  autostart: boolean;
}

export interface ProcessRecord {
  id: string;
  spec: ProcessSpec;
  state: ProcessState;
  pid: number | null;
  pgid: number | null;
  started_at: string | null;
  exit_code: number | null;
  error: string | null;
  recovered: boolean;
}

export interface Profile {
  id: string;
  name: string;
  processes: ProcessSpec[];
}

export interface LogLine {
  id: string;
  stream: "stdout" | "stderr";
  level: LogLevel;
  ts: string;
  text: string;
}

export type PluginState = "discovered" | "active" | "stopped" | "error";

export type PluginPanelType = "iframe" | "stream" | "native";

export interface PluginPanelSpec {
  id: string;
  title: string;
  type: PluginPanelType;
  url: string | null;
}

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  processes: ProcessSpec[];
  panels: PluginPanelSpec[];
  permissions: string[];
}

export interface PluginRecord {
  name: string;
  state: PluginState;
  error: string | null;
  manifest: PluginManifest;
}

export type TerminalKind = "shell" | "command";
export type TerminalState = "starting" | "running" | "exited" | "failed";

export interface TerminalSpec {
  id: string;
  kind: TerminalKind;
  argv: string[];
  cwd: string;
  env: Record<string, string>;
}

export interface TerminalRecord {
  spec: TerminalSpec;
  state: TerminalState;
  pid: number | null;
  started_at: string | null;
  exit_code: number | null;
  error: string | null;
}

export interface TerminalOutput {
  id: string;
  sequence: number;
  data: string;
}

export type TerminalControlMessage =
  | { type: "terminal.attach"; data: { id: string; after_sequence: number } }
  | { type: "terminal.detach"; data: { id: string } }
  | { type: "terminal.input"; data: { id: string; data: string } }
  | { type: "terminal.resize"; data: { id: string; cols: number; rows: number } };

export interface ErrorData {
  code: string;
  message: string;
}

export type ParamValue = boolean | number | string | (boolean | number | string)[] | null;

export interface RateResult {
  available: boolean;
  hz: number | null;
  window_s: number;
  reason: string | null;
}

export type ServerEvent =
  | { type: "graph.update"; data: GraphSnapshot }
  | { type: "ros.status"; data: { connected: boolean; error: string | null } }
  | { type: "process.state"; data: ProcessRecord }
  | { type: "process.removed"; data: { id: string } }
  | { type: "process.log"; data: LogLine }
  | { type: "plugin.state"; data: PluginRecord }
  | { type: "terminal.state"; data: TerminalRecord }
  | { type: "terminal.output"; data: TerminalOutput }
  | { type: "terminal.removed"; data: { id: string } }
  | { type: "error"; data: ErrorData };
