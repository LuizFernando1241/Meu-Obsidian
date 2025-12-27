import { Box, Chip, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';

const TAGS = [
  { label: 'estudos', value: 'estudos' },
  { label: 'financeiro', value: 'financeiro' },
  { label: 'saúde', value: 'saúde' },
  { label: 'trabalho', value: 'trabalho' },
];

export default function TagsIndexPage() {
  const navigate = useNavigate();

  const handleTagClick = (value: string) => {
    navigate(`/tags/${encodeURIComponent(value)}`);
  };

  return (
    <Box>
      <Stack spacing={2}>
        <Typography variant="h4" component="h1">
          Tags
        </Typography>
        <Typography color="text.secondary">
          Explore por etiquetas. Estes exemplos são placeholders por enquanto.
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {TAGS.map((tag) => (
            <Chip
              key={tag.value}
              label={tag.label}
              clickable
              onClick={() => handleTagClick(tag.value)}
              variant="outlined"
            />
          ))}
        </Box>
      </Stack>
    </Box>
  );
}
