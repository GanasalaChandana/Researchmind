"use client";
import { useEffect, useRef, useState } from "react";
import { KnowledgeGraph as KGType } from "@/lib/types";

const NODE_COLORS: Record<string, string> = {
  concept: "#4f6ef7",
  person: "#a78bfa",
  organization: "#34d399",
  event: "#f59e0b",
  technology: "#60a5fa",
};

export default function KnowledgeGraphView({ graph }: { graph: KGType }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [ForceGraph, setForceGraph] = useState<any>(null);

  // Dynamically import — canvas APIs are browser-only
  useEffect(() => {
    import("react-force-graph-2d").then((mod) => setForceGraph(() => mod.default));
  }, []);

  // Measure container width after mount
  useEffect(() => {
    if (containerRef.current) {
      setWidth(containerRef.current.clientWidth || 800);
    }
  }, [ForceGraph]);

  const nodes = graph.entities.map((e) => ({
    id: e.id,
    name: e.name,
    type: e.type,
    description: e.description,
    color: NODE_COLORS[e.type] ?? "#94a3b8",
  }));

  const links = graph.relationships.map((r) => ({
    source: r.source_id,
    target: r.target_id,
    label: r.label,
  }));

  if (graph.entities.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
        Knowledge graph will appear here after synthesis
      </div>
    );
  }

  return (
    <div>
      <div ref={containerRef} className="w-full rounded-lg overflow-hidden bg-[#0f1117]">
        {ForceGraph ? (
          <ForceGraph
            graphData={{ nodes, links }}
            width={width}
            height={420}
            backgroundColor="#0f1117"
            nodeLabel={(n: any) => `${n.name}: ${n.description}`}
            nodeColor={(n: any) => n.color}
            nodeRelSize={5}
            linkColor={() => "#3a3d4e"}
            linkWidth={1}
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={1}
            nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
              const label = node.name;
              const fontSize = Math.max(10 / globalScale, 3);
              ctx.font = `${fontSize}px Sans-Serif`;

              // Glow ring
              ctx.fillStyle = node.color + "33";
              ctx.beginPath();
              ctx.arc(node.x, node.y, 7, 0, 2 * Math.PI);
              ctx.fill();

              // Node dot
              ctx.fillStyle = node.color;
              ctx.beginPath();
              ctx.arc(node.x, node.y, 4, 0, 2 * Math.PI);
              ctx.fill();

              // Label (only when zoomed in enough)
              if (globalScale > 0.5) {
                const textWidth = ctx.measureText(label).width;
                ctx.fillStyle = "rgba(15,17,23,0.8)";
                ctx.fillRect(
                  node.x - textWidth / 2 - 2,
                  node.y + 8,
                  textWidth + 4,
                  fontSize + 3
                );
                ctx.textAlign = "center";
                ctx.textBaseline = "top";
                ctx.fillStyle = "#e2e8f0";
                ctx.fillText(label, node.x, node.y + 9);
              }
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-[420px] text-slate-500 text-sm">
            Loading graph...
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-3 px-1">
        {Object.entries(NODE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5 text-xs text-slate-400">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
            {type}
          </div>
        ))}
      </div>
    </div>
  );
}
