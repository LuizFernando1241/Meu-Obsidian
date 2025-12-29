import React from 'react';
import { TextField } from '@mui/material';
import type { TextFieldProps } from '@mui/material';

import { isValidISODate } from '../views/calendarDate';

type DateFieldProps = Omit<TextFieldProps, 'type' | 'value' | 'onChange'> & {
  value?: string | null;
  onCommit: (value: string | null) => void;
};

export default function DateField({
  value,
  onCommit,
  InputLabelProps,
  ...rest
}: DateFieldProps) {
  const [draft, setDraft] = React.useState(value ?? '');

  React.useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    setDraft(next);
    if (next && isValidISODate(next)) {
      onCommit(next);
    }
  };

  const handleBlur = () => {
    if (!draft) {
      onCommit(null);
      return;
    }
    if (isValidISODate(draft)) {
      onCommit(draft);
      return;
    }
    setDraft(value ?? '');
  };

  return (
    <TextField
      {...rest}
      type="date"
      value={draft}
      onChange={handleChange}
      onBlur={handleBlur}
      InputLabelProps={{ shrink: true, ...InputLabelProps }}
    />
  );
}
