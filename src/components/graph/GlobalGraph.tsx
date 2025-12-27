import { Box } from '@mui/material';

import LoadingState from '../LoadingState';
import EmptyState from '../EmptyState';
import GraphCanvas, { type GraphCanvasRef } from './GraphCanvas';
import { useElementSize } from '../../graph/useElementSize';
import type { GraphData } from '../../graph/graphTypes';

type GlobalGraphProps = {
  data: GraphData;
  ready: boolean;
  selectedId?: string;
  onNodeClick?: (id: string) => void;
  graphRef?: GraphCanvasRef;
};

export default function GlobalGraph({
  data,
  ready,
  selectedId,
  onNodeClick,
  graphRef,
}: GlobalGraphProps) {
  const { ref, size } = useElementSize();

  if (!ready) {
    return <LoadingState message="Carregando grafo..." />;
  }

  if (data.nodes.length === 0) {
    return <EmptyState title="Nenhum item para mostrar no grafo." />;
  }

  return (
    <Box ref={ref} sx={{ width: '100%', height: '100%' }}>
      {size.width > 0 && size.height > 0 && (
        <GraphCanvas
          data={data}
          width={size.width}
          height={size.height}
          selectedId={selectedId}
          showLabels
          onNodeClick={onNodeClick}
          fitOnInit
          graphRef={graphRef}
        />
      )}
    </Box>
  );
}
