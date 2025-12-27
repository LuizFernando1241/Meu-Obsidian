import { Box, Paper, Typography } from '@mui/material';

import LoadingState from '../LoadingState';
import EmptyState from '../EmptyState';
import { useLocalGraphData } from '../../graph/useGraphData';
import { useElementSize } from '../../graph/useElementSize';
import GraphCanvas from './GraphCanvas';

type LocalGraphProps = {
  centerId: string;
  height?: number;
  onNodeClick?: (id: string) => void;
};

export default function LocalGraph({
  centerId,
  height = 240,
  onNodeClick,
}: LocalGraphProps) {
  const { data, ready } = useLocalGraphData(centerId, 1);
  const { ref, size } = useElementSize();

  if (!centerId) {
    return <EmptyState title="Selecione um item para ver o grafo." />;
  }

  if (!ready) {
    return <LoadingState message="Carregando grafo..." />;
  }

  if (data.nodes.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        Nenhum link encontrado.
      </Typography>
    );
  }

  return (
    <Paper variant="outlined" sx={{ height }}>
      <Box ref={ref} sx={{ width: '100%', height: '100%' }}>
        {size.width > 0 && size.height > 0 && (
          <GraphCanvas
            data={data}
            width={size.width}
            height={size.height}
            selectedId={centerId}
            showLabels={false}
            onNodeClick={onNodeClick}
          />
        )}
      </Box>
    </Paper>
  );
}
