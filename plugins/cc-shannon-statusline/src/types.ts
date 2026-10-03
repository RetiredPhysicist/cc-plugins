// === Stdin Data (from Claude Code statusLine mechanism) ===

export interface StdinData {
  cwd?: string;
  session_id?: string;
  transcript_path?: string;
  model?: { id?: string; display_name?: string };
  workspace?: {
    current_dir?: string;
    project_dir?: string;
    added_dirs?: string[];
  };
  version?: string;
  output_style?: { name?: string };
  cost?: {
    total_cost_usd?: number;
    total_duration_ms?: number;
    total_api_duration_ms?: number;
    total_lines_added?: number;
    total_lines_removed?: number;
  };
  context_window?: {
    total_input_tokens?: number;
    total_output_tokens?: number;
    context_window_size?: number;
    used_percentage?: number;
    remaining_percentage?: number;
    current_usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    } | null;
  };
  exceeds_200k_tokens?: boolean;
  vim?: { mode?: string };
  agent?: { name?: string };
  permission_mode?: string;
}

// === Transcript Parsed Data ===

export interface ToolEntry {
  id: string;
  name: string;
  target: string | null;
  status: "running" | "completed" | "error";
  startTime: Date;
  endTime?: Date;
}

export interface AgentEntry {
  id: string;
  type: string;
  model: string | null;
  description: string | null;
  status: "running" | "completed";
  startTime: Date;
  endTime?: Date;
}

export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
}

export interface TranscriptData {
  tools: ToolEntry[];
  toolCounts: Record<string, number>;
  agents: AgentEntry[];
  todos: TodoItem[];
  fileActivity: string[];
  sessionStart: Date | null;
  throughput: ResponseThroughput | null;
}

export interface ResponseThroughput {
  ttftMs: number | null;
  responseDurationMs: number | null;
  outputTokens: number;
  tokensPerSecond: number | null;
}

// === Git Data ===

export interface GitFileStats {
  modified: number;
  added: number;
  deleted: number;
  untracked: number;
}

export interface GitStatus {
  branch: string;
  isDirty: boolean;
  ahead: number;
  behind: number;
  fileStats: GitFileStats | null;
}

// === Config Counts ===

export interface ConfigCounts {
  claudeMd: number;
  rules: number;
  mcp: number;
  hooks: number;
  skills: number;
}

// === Bridge Output (sent over Unix socket /tmp/shannon-<uid>.sock as NDJSON) ===

export interface ShannonBridgeData {
  session_id: string | null;
  transcript_path: string | null;
  version: string | null;
  output_style: string | null;
  exceeds_200k_tokens: boolean;

  model: { id: string; display_name: string } | null;

  context_window: {
    used_percentage: number;
    remaining_percentage: number;
    context_window_size: number;
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  } | null;

  cost: {
    total_cost_usd: number;
    total_duration_ms: number;
    total_api_duration_ms: number;
    total_lines_added: number;
    total_lines_removed: number;
  } | null;

  workspace: {
    cwd: string;
    project_dir: string | null;
    added_dirs: string[];
  } | null;

  git: {
    branch: string;
    is_dirty: boolean;
    ahead: number;
    behind: number;
    file_stats: GitFileStats | null;
  } | null;

  tools: Array<{
    name: string;
    target: string | null;
    status: "running" | "completed" | "error";
    start_time_ms: number;
    duration_ms: number | null;
  }>;
  tool_counts: Record<string, number>;

  agents: Array<{
    id: string;
    type: string;
    model: string | null;
    description: string | null;
    status: "running" | "completed";
    start_time_ms: number;
    duration_ms: number | null;
  }>;

  todos: TodoItem[];
  file_activity: string[];

  config_counts: {
    claude_md: number;
    rules: number;
    mcp: number;
    hooks: number;
    skills: number;
  };

  session_duration_ms: number | null;
  vim_mode: string | null;
  agent_name: string | null;
  permission_mode: string | null;
  timestamp: number;
}
