import React from 'react';
import { DragIndicator, PlaylistAdd } from '@mui/icons-material';
import {
  Box,
  Checkbox,
  Divider,
  IconButton,
  Paper,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';

import type { ParsedWikilink } from '../../app/wikilinks';
import { parseWikilinks } from '../../app/wikilinks';
import type { Block, BlockType } from '../../data/types';

type BlockEditorProps = {
  block: Block;
  listNumber?: number;
  onChange: (
    patch: Partial<Block>,
    meta?: { selectionStart?: number; selectionEnd?: number },
  ) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onPaste?: (event: React.ClipboardEvent) => void;
  onFocus: () => void;
  onBlur?: () => void;
  inputRef?: React.Ref<HTMLElement>;
  onDragStart?: (event: React.DragEvent, blockId: string) => void;
  onDragEnd?: (event: React.DragEvent, blockId: string) => void;
  onPromoteChecklist?: () => void;
  showPromoteChecklist?: boolean;
  onLinkClick?: (link: ParsedWikilink) => void;
  onRequestRawEdit?: (
    blockId: string,
    selection?: { start: number; end: number },
  ) => void;
  isRaw?: boolean;
};

const BLOCK_TYPES: BlockType[] = [
  'paragraph',
  'h1',
  'h2',
  'h3',
  'bullet',
  'numbered',
  'checklist',
  'callout',
  'code',
  'divider',
];

const isBlockType = (value: string | undefined): value is BlockType =>
  !!value && BLOCK_TYPES.includes(value as BlockType);

const getBlockText = (block: Block) => block.text ?? '';

const renderLinkDecorations = (
  text: string,
  links: ParsedWikilink[],
) => {
  if (!text) {
    return '';
  }
  if (links.length === 0) {
    return text;
  }
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  links.forEach((link, index) => {
    if (link.start > lastIndex) {
      nodes.push(text.slice(lastIndex, link.start));
    }
    const rawText = text.slice(link.start, link.end);
    const closeIndex = rawText.indexOf(']]');
    if (closeIndex === -1) {
      nodes.push(rawText);
      lastIndex = link.end;
      return;
    }
    const prefix = rawText.slice(0, 2);
    const inner = rawText.slice(2, closeIndex);
    const pipeIndex = inner.indexOf('|');
    const innerHidden = pipeIndex === -1 ? '' : inner.slice(0, pipeIndex + 1);
    const displayText =
      pipeIndex === -1 ? inner : inner.slice(pipeIndex + 1);
    const closing = rawText.slice(closeIndex, closeIndex + 2);
    const suffix = rawText.slice(closeIndex + 2);
    nodes.push(
      <Box
        component="span"
        key={`${link.start}-${index}`}
        onMouseDown={(event) => event.preventDefault()}
        sx={{
          color: 'primary.main',
          textDecoration: 'underline',
          textDecorationColor: 'primary.main',
        }}
      >
        <Box component="span" sx={{ color: 'transparent' }}>
          {prefix}
        </Box>
        {innerHidden && (
          <Box component="span" sx={{ color: 'transparent' }}>
            {innerHidden}
          </Box>
        )}
        <Box component="span">{displayText}</Box>
        <Box component="span" sx={{ color: 'transparent' }}>
          {closing}
        </Box>
        {suffix && (
          <Box component="span" sx={{ color: 'transparent' }}>
            {suffix}
          </Box>
        )}
      </Box>,
    );
    lastIndex = link.end;
  });
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
};

const BaseTextField = ({
  block,
  onChange,
  onKeyDown,
  onFocus,
  onBlur,
  inputRef,
  placeholder,
  inputSx,
  onPaste,
  showLinkDecorations = true,
  onLinkClick,
  onRequestRawEdit,
  isRaw,
}: {
  block: Block;
  onChange: (
    value: string,
    meta?: { selectionStart?: number; selectionEnd?: number },
  ) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onPaste?: (event: React.ClipboardEvent) => void;
  onFocus: () => void;
  onBlur?: () => void;
  inputRef?: React.Ref<HTMLElement>;
  placeholder?: string;
  inputSx?: Record<string, unknown>;
  showLinkDecorations?: boolean;
  onLinkClick?: (link: ParsedWikilink) => void;
  onRequestRawEdit?: (selection: { start: number; end: number }) => void;
  isRaw?: boolean;
}) => {
  const text = getBlockText(block);
  const links = showLinkDecorations && text ? parseWikilinks(text) : [];
  const hasLinks = links.length > 0;
  const isDisplayMode = Boolean(showLinkDecorations && !isRaw && hasLinks);

  return (
    <Box sx={{ position: 'relative', width: '100%' }}>
      {isDisplayMode && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            color: 'text.primary',
            pointerEvents: 'none',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: 'inherit',
            fontFamily: 'inherit',
            lineHeight: 'inherit',
            ...(inputSx ?? {}),
          }}
        >
          {renderLinkDecorations(text, links)}
        </Box>
      )}
      <TextField
      variant="standard"
      fullWidth
      multiline
      minRows={1}
      value={text}
      onChange={(event) => {
        const target = event.target as HTMLInputElement | HTMLTextAreaElement;
        onChange(event.target.value, {
          selectionStart: target.selectionStart ?? undefined,
          selectionEnd: target.selectionEnd ?? undefined,
        });
      }}
      onMouseUp={(event) => {
        if (!isDisplayMode) {
          return;
        }
        const target = event.target as HTMLInputElement | HTMLTextAreaElement;
        const selectionStart = target.selectionStart ?? 0;
        const selectionEnd = target.selectionEnd ?? selectionStart;
        if (selectionStart !== selectionEnd) {
          return;
        }
        if (!text) {
          return;
        }
        const match = links.find(
          (link) => selectionStart >= link.start && selectionStart <= link.end,
        );
        if (!match) {
          return;
        }
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          event.stopPropagation();
          onRequestRawEdit?.({ start: selectionStart, end: selectionEnd });
          return;
        }
        if (!onLinkClick) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onLinkClick(match);
      }}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder={placeholder}
      inputRef={inputRef as React.Ref<HTMLInputElement | HTMLTextAreaElement>}
      InputProps={{
        disableUnderline: true,
        sx: {
          position: 'relative',
          zIndex: 1,
          backgroundColor: 'transparent',
          ...(isDisplayMode
            ? {
                '& .MuiInputBase-input': {
                  color: 'transparent',
                  caretColor: (theme) => theme.palette.text.primary,
                  '&::placeholder': {
                    color: (theme) => theme.palette.text.secondary,
                    opacity: 1,
                  },
                },
              }
            : {}),
          ...(inputSx ?? {}),
        },
      }}
    />
    </Box>
  );
};

export default function BlockEditor({
  block,
  listNumber,
  onChange,
  onKeyDown,
  onPaste,
  onFocus,
  onBlur,
  inputRef,
  onDragStart,
  onDragEnd,
  onPromoteChecklist,
  showPromoteChecklist,
  onLinkClick,
  onRequestRawEdit,
  isRaw,
}: BlockEditorProps) {
  const type = isBlockType(block.type) ? block.type : 'paragraph';
  const dragHandle = (
    <IconButton
      className="drag-handle"
      size="small"
      disableRipple
      draggable
      tabIndex={-1}
      aria-label="Arrastar bloco"
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', block.id);
        event.dataTransfer.setData('application/x-block-id', block.id);
        onDragStart?.(event, block.id);
      }}
      onDragEnd={(event) => onDragEnd?.(event, block.id)}
      sx={{
        opacity: 0,
        transition: 'opacity 0.15s ease',
        cursor: 'grab',
        '&:active': { cursor: 'grabbing' },
      }}
    >
      <DragIndicator fontSize="small" />
    </IconButton>
  );

  let content: React.ReactNode;

  if (type === 'divider') {
    content = (
      <Box
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        ref={inputRef as React.Ref<HTMLDivElement>}
        sx={{ outline: 'none' }}
      >
        <Divider sx={{ my: 2 }} />
      </Box>
    );
  } else if (type === 'checklist') {
    content = (
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Checkbox
          size="small"
          checked={block.checked ?? false}
          onChange={(event) => onChange({ checked: event.target.checked })}
          onFocus={onFocus}
        />
        <Box sx={{ flex: 1 }}>
          <BaseTextField
            block={block}
            onChange={(value, meta) => onChange({ text: value }, meta)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onFocus={onFocus}
            onBlur={onBlur}
            inputRef={inputRef}
            onLinkClick={onLinkClick}
            onRequestRawEdit={(selection) => onRequestRawEdit?.(block.id, selection)}
            isRaw={isRaw}
            placeholder="Checklist..."
          />
        </Box>
        {showPromoteChecklist && onPromoteChecklist && (
          <Tooltip title="Promover para tarefa">
            <IconButton
              size="small"
              aria-label="Promover para tarefa"
              onClick={(event) => {
                event.stopPropagation();
                onPromoteChecklist();
              }}
            >
              <PlaylistAdd fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    );
  } else if (type === 'callout') {
    content = (
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <BaseTextField
          block={block}
          onChange={(value, meta) => onChange({ text: value }, meta)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onFocus={onFocus}
          onBlur={onBlur}
          inputRef={inputRef}
          onLinkClick={onLinkClick}
          onRequestRawEdit={(selection) => onRequestRawEdit?.(block.id, selection)}
          isRaw={isRaw}
          placeholder="Callout..."
        />
      </Paper>
    );
  } else if (type === 'code') {
    content = (
      <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover' }}>
        <BaseTextField
          block={block}
          onChange={(value, meta) => onChange({ text: value }, meta)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onFocus={onFocus}
          onBlur={onBlur}
          inputRef={inputRef}
          placeholder="Codigo..."
          showLinkDecorations={false}
          isRaw={isRaw}
          inputSx={{
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            fontSize: '0.95rem',
          }}
        />
      </Paper>
    );
  } else if (type === 'bullet' || type === 'numbered') {
    const numbering = type === 'numbered' ? `${listNumber ?? 1}.` : '*';
    content = (
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Typography
          component="span"
          sx={{ pt: 1, color: 'text.secondary' }}
          aria-hidden
        >
          {numbering}
        </Typography>
        <BaseTextField
          block={block}
          onChange={(value, meta) => onChange({ text: value }, meta)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onFocus={onFocus}
          onBlur={onBlur}
          inputRef={inputRef}
          onLinkClick={onLinkClick}
          onRequestRawEdit={(selection) => onRequestRawEdit?.(block.id, selection)}
          isRaw={isRaw}
          placeholder="Lista..."
        />
      </Box>
    );
  } else if (type === 'h1' || type === 'h2' || type === 'h3') {
    const fontSize = type === 'h1' ? '2rem' : type === 'h2' ? '1.6rem' : '1.3rem';
    content = (
      <BaseTextField
        block={block}
        onChange={(value, meta) => onChange({ text: value }, meta)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onFocus={onFocus}
        onBlur={onBlur}
        inputRef={inputRef}
        onLinkClick={onLinkClick}
        onRequestRawEdit={(selection) => onRequestRawEdit?.(block.id, selection)}
        isRaw={isRaw}
        placeholder="Titulo..."
        inputSx={{ fontSize, fontWeight: 600 }}
      />
    );
  } else {
    content = (
      <BaseTextField
        block={block}
        onChange={(value, meta) => onChange({ text: value }, meta)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onFocus={onFocus}
        onBlur={onBlur}
        inputRef={inputRef}
        onLinkClick={onLinkClick}
        onRequestRawEdit={(selection) => onRequestRawEdit?.(block.id, selection)}
        isRaw={isRaw}
        placeholder="Digite algo..."
      />
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1,
        '&:hover .drag-handle': { opacity: 1 },
      }}
    >
      <Box sx={{ width: 28, display: 'flex', justifyContent: 'center', pt: 0.5 }}>
        {dragHandle}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>{content}</Box>
    </Box>
  );
}
