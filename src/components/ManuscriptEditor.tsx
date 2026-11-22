import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Bold,
  Heading2,
  Heading3,
  List,
  Minus,
  Quote,
} from 'lucide-react';
import type { CollaboratorPresence } from '../shared/ot';
import { countWords } from '../shared/ot';

interface ManuscriptEditorProps {
  title: string;
  subtitle: string;
  content: string;
  version: number;
  selfClientId: string;
  presence: CollaboratorPresence[];
  darkWorkspace: boolean;
  onTitleChange: (title: string) => void;
  onSubtitleChange: (subtitle: string) => void;
  onContentChange: (nextContent: string) => void;
  onCursorChange: (start: number, end: number) => void;
  onSelectQuoteForComment: (quote: string) => void;
  pendingCursorRestoreRef: React.MutableRefObject<{ start: number; end: number } | null>;
}

interface CaretCoord {
  clientId: string;
  name: string;
  color: string;
  x: number;
  y: number;
  visible: boolean;
}

export const ManuscriptEditor: React.FC<ManuscriptEditorProps> = ({
  title,
  subtitle,
  content,
  version,
  selfClientId,
  presence,
  darkWorkspace,
  onTitleChange,
  onSubtitleChange,
  onContentChange,
  onCursorChange,
  onSelectQuoteForComment,
  pendingCursorRestoreRef,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const [caretCoords, setCaretCoords] = useState<CaretCoord[]>([]);
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number }>({
    start: 0,
    end: 0,
  });

  // Restore cursor position synchronously after remote OT patch updates React state
  useLayoutEffect(() => {
    if (pendingCursorRestoreRef.current && textareaRef.current) {
      const { start, end } = pendingCursorRestoreRef.current;
      pendingCursorRestoreRef.current = null;
      const maxLen = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(
        Math.max(0, Math.min(start, maxLen)),
        Math.max(0, Math.min(end, maxLen))
      );
    }
  }, [content, pendingCursorRestoreRef]);

  // Measure remote collaborator carets using a synced typography mirror
  const recomputeRemoteCarets = () => {
    const ta = textareaRef.current;
    const mirror = mirrorRef.current;
    if (!ta || !mirror) return;

    const remoteUsers = presence.filter((p) => p.clientId !== selfClientId);
    if (remoteUsers.length === 0) {
      setCaretCoords([]);
      return;
    }

    const scrollTop = ta.scrollTop;
    const clientHeight = ta.clientHeight;
    const coords: CaretCoord[] = [];

    for (const user of remoteUsers) {
      const pos = Math.max(0, Math.min(user.cursorStart, content.length));
      // Build mirror DOM safely using text nodes (zero HTML injection)
      mirror.textContent = '';
      mirror.appendChild(document.createTextNode(content.slice(0, pos)));
      const marker = document.createElement('span');
      marker.textContent = '\u200b';
      mirror.appendChild(marker);
      mirror.appendChild(document.createTextNode(content.slice(pos) || ' '));

      const x = marker.offsetLeft;
      const y = marker.offsetTop - scrollTop;
      const visible = y >= -8 && y <= clientHeight - 16;

      coords.push({
        clientId: user.clientId,
        name: user.name,
        color: user.color,
        x,
        y,
        visible,
      });
    }

    setCaretCoords(coords);
  };

  useEffect(() => {
    recomputeRemoteCarets();
  }, [content, presence, selfClientId]);

  const emitSelection = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    setSelectionRange({ start, end });
    onCursorChange(start, end);
  };

  const insertFormat = (prefix: string, suffix = '', blockStart = false) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const selected = content.slice(start, end);

    let nextText = '';
    let nextCursorStart = start;
    let nextCursorEnd = end;

    if (blockStart) {
      const lineStart = content.lastIndexOf('\n', start - 1) + 1;
      nextText = content.slice(0, lineStart) + prefix + content.slice(lineStart);
      nextCursorStart = start + prefix.length;
      nextCursorEnd = end + prefix.length;
    } else {
      const replacement = `${prefix}${selected || '重点文字'}${suffix}`;
      nextText = content.slice(0, start) + replacement + content.slice(end);
      nextCursorStart = start + prefix.length;
      nextCursorEnd = start + prefix.length + (selected ? selected.length : 4);
    }

    pendingCursorRestoreRef.current = { start: nextCursorStart, end: nextCursorEnd };
    onContentChange(nextText);
    requestAnimationFrame(() => {
      ta.focus();
      onCursorChange(nextCursorStart, nextCursorEnd);
    });
  };

  const selectedText =
    selectionRange.end > selectionRange.start
      ? content.slice(selectionRange.start, selectionRange.end).trim()
      : '';

  const wordCount = countWords(content);
  const readMinutes = Math.max(1, Math.ceil(wordCount / 380));

  return (
    <div
      className={`flex flex-col h-full rounded-2xl border transition-colors ${
        darkWorkspace
          ? 'border-[#2B2C32] bg-[#18191D] text-[#EAE8E1]'
          : 'border-[#E5E3DC] bg-white text-[#141413]'
      }`}
    >
      {/* Formatting & Selection Toolbar */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 border-b ${
          darkWorkspace ? 'border-[#2B2C32]' : 'border-[#ECEAE2]'
        }`}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => insertFormat('## ', '', true)}
            title="二级标题"
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Heading2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => insertFormat('### ', '', true)}
            title="三级标题"
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Heading3 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => insertFormat('**', '**')}
            title="加粗"
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => insertFormat('> ', '', true)}
            title="金句引用"
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Quote className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => insertFormat('- ', '', true)}
            title="要点列表"
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => insertFormat('\n---\n', '')}
            title="插入分页线（小红书卡片分页）"
            className="flex h-8 px-2 items-center gap-1 rounded-md text-xs hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Minus className="h-3.5 w-3.5" />
            <span>分页</span>
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {selectedText.length > 0 && (
            <button
              type="button"
              onClick={() => onSelectQuoteForComment(selectedText.slice(0, 120))}
              className="rounded-md bg-[#C83E2B]/10 px-2.5 py-1 font-medium text-[#C83E2B] hover:bg-[#C83E2B]/20 transition-colors whitespace-nowrap cursor-pointer"
            >
              针对选中内容添加批注
            </button>
          )}
          <span className="font-mono-tabular opacity-55 whitespace-nowrap">v{version}</span>
        </div>
      </div>

      {/* Title & Subtitle Inputs */}
      <div className="px-6 sm:px-9 pt-6 pb-3">
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="输入文章主标题..."
          className="w-full bg-transparent font-editorial text-2xl sm:text-[28px] font-semibold leading-snug tracking-tight focus:outline-none placeholder:opacity-35"
        />
        <input
          type="text"
          value={subtitle}
          onChange={(e) => onSubtitleChange(e.target.value)}
          placeholder="补充导语、副标题或核心想法（可选）..."
          className="mt-2 w-full bg-transparent text-sm leading-relaxed opacity-75 focus:outline-none placeholder:opacity-40"
        />
        <div
          className={`mt-4 h-px w-full ${
            darkWorkspace ? 'bg-[#2B2C32]' : 'bg-[#ECEAE2]'
          }`}
        />
      </div>

      {/* Main Collaborative Textarea + Pixel-Accurate Remote Caret Overlay */}
      <div className="relative flex-1 min-h-[420px] px-6 sm:px-9 pb-4 overflow-hidden">
        {/* Hidden Mirror for exact cursor coordinate measurement */}
        <div
          ref={mirrorRef}
          aria-hidden="true"
          className="pointer-events-none invisible absolute top-0 left-6 right-6 sm:left-9 sm:right-9 whitespace-pre-wrap break-words text-[15.5px] leading-[1.85] font-sans"
          style={{
            fontFamily: 'var(--font-sans-body)',
          }}
        />

        {/* Remote Collaborator Live Carets */}
        <div className="pointer-events-none absolute top-0 left-6 right-6 sm:left-9 sm:right-9 bottom-4 overflow-hidden z-10">
          {caretCoords
            .filter((c) => c.visible)
            .map((c) => (
              <div
                key={c.clientId}
                className="absolute transition-all duration-75 ease-out"
                style={{
                  transform: `translate(${c.x}px, ${c.y}px)`,
                }}
              >
                <div
                  className="h-[22px] w-[2px]"
                  style={{ backgroundColor: c.color }}
                />
                <div
                  className=" -translate-y-[26px] rounded px-1.5 py-0.5 text-[10px] font-medium text-white whitespace-nowrap shadow-xs"
                  style={{ backgroundColor: c.color }}
                >
                  {c.name}
                </div>
              </div>
            ))}
        </div>

        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => {
            onContentChange(e.target.value);
            emitSelection();
          }}
          onSelect={emitSelection}
          onKeyUp={emitSelection}
          onClick={emitSelection}
          onScroll={recomputeRemoteCarets}
          spellCheck={false}
          placeholder="从这里开始写作，或点击上方「语音速记」直接说出你的想法..."
          className="relative z-0 h-full w-full resize-none bg-transparent text-[15.5px] leading-[1.85] focus:outline-none placeholder:opacity-35"
          style={{
            fontFamily: 'var(--font-sans-body)',
          }}
        />
      </div>

      {/* Quiet Editorial Footer Metrics */}
      <div
        className={`flex flex-wrap items-center justify-between gap-4 px-6 sm:px-9 py-3 border-t text-xs ${
          darkWorkspace
            ? 'border-[#2B2C32] text-[#9A9890]'
            : 'border-[#ECEAE2] text-[#6B6962]'
        }`}
      >
        <div className="flex items-center gap-3 font-mono-tabular">
          <span>{wordCount} 字</span>
          <span aria-hidden="true">·</span>
          <span>约 {readMinutes} 分钟阅读</span>
          <span aria-hidden="true">·</span>
          <span>{content.length} 字符</span>
        </div>

        <div className="flex items-center gap-3">
          {presence
            .filter((p) => p.clientId !== selfClientId)
            .map((p) => (
              <span key={p.clientId} className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                <span>{p.name}</span>
                <span className="font-mono-tabular opacity-60">@{p.cursorStart}</span>
              </span>
            ))}
        </div>
      </div>
    </div>
  );
};
