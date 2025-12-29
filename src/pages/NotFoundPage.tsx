import { Button, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <Stack spacing={2}>
      <Typography variant="h4" component="h1">
        Pagina nao encontrada
      </Typography>
      <Typography color="text.secondary">
        A rota solicitada nao existe ou foi movida.
      </Typography>
      <Button variant="contained" onClick={() => navigate('/')}>
        Ir para Inicio
      </Button>
    </Stack>
  );
}
