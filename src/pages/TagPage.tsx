import { Button, Stack, Typography } from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export default function TagPage() {
  const { tag } = useParams();
  const navigate = useNavigate();
  const tagLabel = tag ? safeDecode(tag) : '...';

  return (
    <Stack spacing={2}>
      <Typography variant="h4" component="h1">
        Tag: {tagLabel}
      </Typography>
      <Typography color="text.secondary">
        Itens com essa tag aparecerão aqui (em breve)
      </Typography>
      <Button variant="outlined" onClick={() => navigate('/tags')}>
        Voltar para Tags
      </Button>
    </Stack>
  );
}
