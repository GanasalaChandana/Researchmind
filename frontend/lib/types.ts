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

export interface ReportSection {
  heading: string;
  content: string;
  citations: number[];
}

export interface ResearchReport {
  session_id: string;
  topic: string;
  summary: string;
  sections: ReportSection[];
  sources: Source[];
  knowledge_graph: KnowledgeGraph;
  created_at: string;
}
