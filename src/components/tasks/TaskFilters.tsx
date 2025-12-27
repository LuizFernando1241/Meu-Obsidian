import { ToggleButton, ToggleButtonGroup } from '@mui/material';

export type TaskFilterKey = 'all' | 'today' | 'week' | 'overdue' | 'noDate' | 'done';

type TaskFiltersProps = {
  value: TaskFilterKey;
  onChange: (value: TaskFilterKey) => void;
};

export default function TaskFilters({ value, onChange }: TaskFiltersProps) {
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={value}
      onChange={(_, next) => {
        if (next) {
          onChange(next as TaskFilterKey);
        }
      }}
    >
      <ToggleButton value="all">Todas</ToggleButton>
      <ToggleButton value="today">Hoje</ToggleButton>
      <ToggleButton value="week">Semana</ToggleButton>
      <ToggleButton value="overdue">Atrasadas</ToggleButton>
      <ToggleButton value="noDate">Sem data</ToggleButton>
      <ToggleButton value="done">Concluidas</ToggleButton>
    </ToggleButtonGroup>
  );
}
