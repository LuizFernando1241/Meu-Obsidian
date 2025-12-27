import { CircularProgress, Stack, Typography } from '@mui/material';

type LoadingStateProps = {
  message?: string;
};

export default function LoadingState({ message = 'Carregando...' }: LoadingStateProps) {
  return (
    <Stack spacing={1} alignItems="center" sx={{ py: 4 }}>
      <CircularProgress size={24} />
      <Typography variant="body2" color="text.secondary">
        {message}
      </Typography>
    </Stack>
  );
}
