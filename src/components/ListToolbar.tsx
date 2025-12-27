import { Button, Stack, TextField, Typography } from '@mui/material';

type ListToolbarProps = {
  title: string;
  search: string;
  onSearchChange: (value: string) => void;
  onCreate: () => void;
  createLabel?: string;
};

export default function ListToolbar({
  title,
  search,
  onSearchChange,
  onCreate,
  createLabel = 'Novo',
}: ListToolbarProps) {
  return (
    <Stack spacing={2} direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }}>
      <Typography variant="h4" component="h1">
        {title}
      </Typography>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{ ml: { md: 'auto' }, width: { xs: '100%', md: 'auto' } }}
      >
        <TextField
          size="small"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar..."
          fullWidth
        />
        <Button variant="contained" onClick={onCreate}>
          {createLabel}
        </Button>
      </Stack>
    </Stack>
  );
}
