import { Box, Typography } from '@mui/material';

type PlaceholderPageProps = {
  title: string;
};

export default function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <Box>
      <Typography variant="h4" component="h1">
        {title}
      </Typography>
    </Box>
  );
}
