import React from 'react';
import {
  Box,
  Button,
  FormControlLabel,
  Stack,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import GlobalGraph from '../components/graph/GlobalGraph';
import type { GraphCanvasHandle } from '../components/graph/GraphCanvas';
import { useGlobalGraphData } from '../graph/useGraphData';
import type { GraphData } from '../graph/graphTypes';
import type { ItemType } from '../data/types';

type FilterType = 'all' | ItemType;

const filterGraph = (data: GraphData, filter: FilterType, favoritesOnly: boolean) => {
  const nodes = data.nodes.filter((node) => {
    if (favoritesOnly && !node.favorite) {
      return false;
    }
    if (filter === 'all') {
      return true;
    }
    return node.type === filter;
  });
  const allowed = new Set(nodes.map((node) => node.id));
  const links = data.links.filter(
    (link) => allowed.has(String(link.source)) && allowed.has(String(link.target)),
  );
  return { nodes, links };
};

export default function GraphPage() {
  const navigate = useNavigate();
  const { data, ready } = useGlobalGraphData();
  const [filter, setFilter] = React.useState<FilterType>('all');
  const [favoritesOnly, setFavoritesOnly] = React.useState(false);
  const graphRef = React.useRef<GraphCanvasHandle | undefined>(undefined);

  const filteredData = React.useMemo(
    () => filterGraph(data, filter, favoritesOnly),
    [data, filter, favoritesOnly],
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
        <ToggleButtonGroup
          size="small"
          value={filter}
          exclusive
          onChange={(_, value) => value && setFilter(value)}
        >
          <ToggleButton value="all">Todos</ToggleButton>
          <ToggleButton value="note">Notas</ToggleButton>
          <ToggleButton value="task">Tarefas</ToggleButton>
          <ToggleButton value="project">Projetos</ToggleButton>
          <ToggleButton value="area">Areas</ToggleButton>
        </ToggleButtonGroup>
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
              Voltar para Notas
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
