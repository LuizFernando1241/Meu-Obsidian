import React from 'react';
import {
  Box,
  Button,
  FormControlLabel,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import GlobalGraph from '../components/graph/GlobalGraph';
import type { GraphCanvasHandle } from '../components/graph/GraphCanvas';
import { useGlobalGraphData } from '../graph/useGraphData';
import type { GraphData } from '../graph/graphTypes';

const filterGraph = (data: GraphData, favoritesOnly: boolean) => {
  const nodes = favoritesOnly ? data.nodes.filter((node) => node.favorite) : data.nodes;
  const allowed = new Set(nodes.map((node) => node.id));
  const links = data.links.filter(
    (link) => allowed.has(String(link.source)) && allowed.has(String(link.target)),
  );
  return { nodes, links };
};

export default function GraphPage() {
  const navigate = useNavigate();
  const { data, ready } = useGlobalGraphData();
  const [favoritesOnly, setFavoritesOnly] = React.useState(false);
  const graphRef = React.useRef<GraphCanvasHandle | undefined>(undefined);

  const filteredData = React.useMemo(
    () => filterGraph(data, favoritesOnly),
    [data, favoritesOnly],
  );

  return (
    <Stack spacing={2} sx={{ height: '100%' }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        alignItems={{ md: 'center' }}
      >
        <Typography variant="h4" component="h1">
          Grafo
        </Typography>
        <FormControlLabel
          control={
            <Switch
              checked={favoritesOnly}
              onChange={(event) => setFavoritesOnly(event.target.checked)}
            />
          }
          label="Somente favoritos"
        />
        <Box sx={{ ml: { md: 'auto' } }}>
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              onClick={() => graphRef.current?.zoomToFit(400, 40)}
            >
              Centralizar
            </Button>
            <Button variant="outlined" onClick={() => navigate('/notes')}>
              Voltar para Registros
            </Button>
          </Stack>
        </Box>
      </Stack>
      <Box
        sx={{
          flexGrow: 1,
          minHeight: { xs: 320, md: 520 },
          height: { xs: 360, md: 'calc(100vh - 240px)' },
        }}
      >
        <GlobalGraph
          data={filteredData}
          ready={ready}
          onNodeClick={(id) => navigate(`/item/${id}`)}
          graphRef={graphRef}
        />
      </Box>
    </Stack>
  );
}
