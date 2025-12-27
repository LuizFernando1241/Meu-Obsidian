import React from 'react';
import ForceGraph2D, { type ForceGraphMethods, type NodeObject } from 'react-force-graph-2d';

import type { GraphData, GraphLink, GraphNode } from '../../graph/graphTypes';

type GraphCanvasProps = {
  data: GraphData;
  width: number;
  height: number;
  selectedId?: string;
  showLabels?: boolean;
  onNodeClick?: (id: string) => void;
  fitOnInit?: boolean;
  graphRef?: GraphCanvasRef;
};

type NodeWithCoords = GraphNode & { x?: number; y?: number; color?: string };
type GraphNodeObject = NodeObject<NodeWithCoords>;

export type GraphCanvasHandle = ForceGraphMethods<NodeWithCoords, GraphLink>;
export type GraphCanvasRef = React.MutableRefObject<GraphCanvasHandle | undefined>;

export default function GraphCanvas({
  data,
  width,
  height,
  selectedId,
  showLabels = true,
  onNodeClick,
  fitOnInit = false,
  graphRef,
}: GraphCanvasProps) {
  const localRef = React.useRef<GraphCanvasHandle | undefined>(undefined);
  const ref = graphRef ?? localRef;

  React.useEffect(() => {
    if (!fitOnInit || !ref.current) {
      return;
    }
    ref.current.zoomToFit(400, 40);
  }, [data, fitOnInit]);

  const drawNode = React.useCallback(
    (node: GraphNodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const radius = node.id === selectedId ? 6 : 4;
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      ctx.beginPath();
      ctx.fillStyle = node.color ?? '#90caf9';
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fill();

      if (selectedId && node.id === selectedId) {
        ctx.lineWidth = Math.max(1, 2 / globalScale);
        ctx.strokeStyle = '#f59e0b';
        ctx.stroke();
      }

      if (showLabels && globalScale > 1.2) {
        const label = node.label;
        const fontSize = 12 / globalScale;
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillStyle = '#111827';
        ctx.fillText(label, x + radius + 2, y + radius + 2);
      }
    },
    [selectedId, showLabels],
  );

  const paintPointerArea = React.useCallback(
    (node: GraphNodeObject, color: string, ctx: CanvasRenderingContext2D) => {
      const radius = node.id === selectedId ? 6 : 4;
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, radius + 2, 0, 2 * Math.PI);
      ctx.fill();
    },
    [selectedId],
  );

  return (
    <ForceGraph2D<NodeWithCoords, GraphLink>
      ref={ref}
      width={width}
      height={height}
      graphData={data}
      nodeAutoColorBy="type"
      nodeLabel="label"
      linkDirectionalArrowLength={4}
      linkDirectionalArrowRelPos={1}
      onNodeClick={(node) => onNodeClick?.(String(node.id))}
      nodeCanvasObject={drawNode}
      nodePointerAreaPaint={paintPointerArea}
    />
  );
}
