export interface AgentEvent {
  type: "thinking" | "searching" | "reading" | "synthesizing" | "done" | "error";
  agent: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

export interface Source {
  url: string;
  title: string;
  summary: string;
  relevance_score: number;
  quality_score?: number;       // 0–100 composite
  domain_authority?: string;    // "high" | "medium" | "low"
  recency_score?: number;       // 0–1
}

export interface Entity {
  id: string;
  name: string;
  type: "concept" | "person" | "organization" | "event" | "technology";
  description: string;
}

export interface Relationship {
  source_id: string;
  target_id: string;
  label: string;
  weight: number;
}

export interface KnowledgeGraph {
  entities: Entity[];
  relationships: Relationship[];
}

export interface CitationCheck {
  status: "verified" | "partial" | "unverified";
  reason: string;
}

export interface ReportSection {
  heading: string;
  content: string;
  citations: number[];
  citation_checks?: Record<string, CitationCheck>; // keyed by citation number string
}

export interface ResearchReport {
  session_id: string;
  topic: string;
  summary: string;
  sections: ReportSection[];
  sources: Source[];
  knowledge_graph: KnowledgeGraph;
  created_at: string;
  key_takeaways?: string[];
}

export interface SessionTag {
  name: string;
  color?: string;
}

export interface SessionSummary {
  id: string;
  topic: string;
  status: "running" | "completed" | "failed";
  created_at: string;
  is_favorite?: boolean;
  tags?: SessionTag[];
}
