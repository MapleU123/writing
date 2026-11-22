import React, { useMemo, useState } from 'react';
import type { PlatformPreset, ThemePreset } from '../shared/ot';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PlatformPreviewProps {
  title: string;
  subtitle: string;
  content: string;
  platformPreset: PlatformPreset;
  themeStyle: ThemePreset;
  authorName?: string;
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Safe React tokenization for **bold** and `code` without HTML injection
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={`b-${keyIdx++}`} className="font-semibold text-current">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={`c-${keyIdx++}`}
          className="rounded bg-black/5 dark:bg-white/10 px-1.5 py-0.5 font-mono-tabular text-[0.88em]"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

interface ParsedBlock {
  type: 'h1' | 'h2' | 'h3' | 'quote' | 'list' | 'olist' | 'hr' | 'p';
  lines: string[];
}

function parseMarkdownBlocks(markdown: string): ParsedBlock[] {
  const rawLines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: ParsedBlock[] = [];
  let currentList: ParsedBlock | null = null;
  let currentQuote: ParsedBlock | null = null;

  const flushExtras = () => {
    if (currentList) {
      blocks.push(currentList);
      currentList = null;
    }
    if (currentQuote) {
      blocks.push(currentQuote);
      currentQuote = null;
    }
  };

  for (const raw of rawLines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushExtras();
      continue;
    }

    if (trimmed === '---' || trimmed === '***') {
      flushExtras();
      blocks.push({ type: 'hr', lines: [] });
      continue;
    }

    if (trimmed.startsWith('### ')) {
      flushExtras();
      blocks.push({ type: 'h3', lines: [trimmed.slice(4)] });
      continue;
    }

    if (trimmed.startsWith('## ')) {
      flushExtras();
      blocks.push({ type: 'h2', lines: [trimmed.slice(3)] });
      continue;
    }

    if (trimmed.startsWith('# ')) {
      flushExtras();
      blocks.push({ type: 'h1', lines: [trimmed.slice(2)] });
      continue;
    }

    if (trimmed.startsWith('> ')) {
      if (currentList) {
        blocks.push(currentList);
        currentList = null;
      }
      if (!currentQuote) {
        currentQuote = { type: 'quote', lines: [trimmed.slice(2)] };
      } else {
        currentQuote.lines.push(trimmed.slice(2));
      }
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      if (currentQuote) {
        blocks.push(currentQuote);
        currentQuote = null;
      }
      const itemText = trimmed.replace(/^[-*]\s+/, '');
      if (!currentList || currentList.type !== 'list') {
        if (currentList) blocks.push(currentList);
        currentList = { type: 'list', lines: [itemText] };
      } else {
        currentList.lines.push(itemText);
      }
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      if (currentQuote) {
        blocks.push(currentQuote);
        currentQuote = null;
      }
      const itemText = trimmed.replace(/^\d+\.\s+/, '');
      if (!currentList || currentList.type !== 'olist') {
        if (currentList) blocks.push(currentList);
        currentList = { type: 'olist', lines: [itemText] };
      } else {
        currentList.lines.push(itemText);
      }
      continue;
    }

    flushExtras();
    blocks.push({ type: 'p', lines: [trimmed] });
  }

  flushExtras();
  return blocks;
}

function renderBlocks(blocks: ParsedBlock[], compact = false) {
  return blocks.map((block, idx) => {
    if (block.type === 'hr') {
      return (
        <div key={idx} className="my-6 flex items-center justify-center gap-3">
          <span className="h-px w-10 bg-current opacity-20" />
          <span className="text-xs opacity-35">§</span>
          <span className="h-px w-10 bg-current opacity-20" />
        </div>
      );
    }

    if (block.type === 'h1' || block.type === 'h2') {
      return (
        <h2
          key={idx}
          className={`font-editorial font-semibold tracking-tight ${
            compact ? 'mt-3 mb-2 text-lg leading-snug' : 'mt-7 mb-3 text-xl leading-snug'
          }`}
        >
          {renderInlineMarkdown(block.lines[0])}
        </h2>
      );
    }

    if (block.type === 'h3') {
      return (
        <h3
          key={idx}
          className={`font-semibold tracking-tight ${
            compact ? 'mt-2.5 mb-1.5 text-sm' : 'mt-5 mb-2 text-base'
          }`}
        >
          {renderInlineMarkdown(block.lines[0])}
        </h3>
      );
    }

    if (block.type === 'quote') {
      return (
        <blockquote
          key={idx}
          className={`my-4 rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.025] dark:bg-white/[0.03] px-4 py-3 text-[0.94em] leading-relaxed italic opacity-90`}
        >
          {block.lines.map((l, i) => (
            <p key={i}>{renderInlineMarkdown(l)}</p>
          ))}
        </blockquote>
      );
    }

    if (block.type === 'list') {
      return (
        <ul key={idx} className="my-3 space-y-1.5 pl-4 list-disc marker:opacity-50">
          {block.lines.map((l, i) => (
            <li key={i} className="leading-relaxed">
              {renderInlineMarkdown(l)}
            </li>
          ))}
        </ul>
      );
    }

    if (block.type === 'olist') {
      return (
        <ol key={idx} className="my-3 space-y-1.5 pl-5 list-decimal marker:font-mono-tabular marker:opacity-60">
          {block.lines.map((l, i) => (
            <li key={i} className="leading-relaxed">
              {renderInlineMarkdown(l)}
            </li>
          ))}
        </ol>
      );
    }

    return (
      <p key={idx} className={compact ? 'my-2 leading-[1.7] text-[13.5px]' : 'my-3.5 leading-[1.82] text-[15px]'}>
        {renderInlineMarkdown(block.lines[0])}
      </p>
    );
  });
}

export const PlatformPreview: React.FC<PlatformPreviewProps> = ({
  title,
  subtitle,
  content,
  platformPreset,
  themeStyle,
  authorName = 'VibePress 作者',
}) => {
  const [slideIndex, setSlideIndex] = useState(0);
  const [coverFailed, setCoverFailed] = useState(false);

  const blocks = useMemo(() => parseMarkdownBlocks(content), [content]);

  // Split markdown into 3:4 cards on `---` or fallback to `##` headings
  const redSlides = useMemo(() => {
    const rawSections = content
      .split(/\n---+\n/g)
      .map((s) => s.trim())
      .filter(Boolean);
    const sections = rawSections.length > 0 ? rawSections : [content || '暂无内容'];
    return sections.map((sec) => parseMarkdownBlocks(sec));
  }, [content]);

  const safeSlideIdx = Math.min(slideIndex, Math.max(0, redSlides.length - 1));

  const surfaceStyles: Record<ThemePreset, string> = {
    paper: 'bg-white text-[#1A1A18] border-[#E5E3DC]',
    linen: 'bg-[#F5F2EB] text-[#1E1D1A] border-[#E0DBD0]',
    ink: 'bg-[#18191C] text-[#EAE8E1] border-[#2C2D33]',
  };

  if (platformPreset === 'xiaohongshu') {
    const totalCards = redSlides.length + 1; // Card 0 = Cover, Cards 1..N = Slides
    const currentCardIdx = Math.min(safeSlideIdx, totalCards - 1);

    return (
      <div className="flex flex-col items-center justify-center py-2">
        <div className="mb-3 flex items-center justify-between w-full max-w-[360px] text-xs text-[#6B6962] dark:text-[#A1A1AA]">
          <span>小红书 3:4 图文卡片预览</span>
          <span className="font-mono-tabular">
            {currentCardIdx + 1} / {totalCards}
          </span>
        </div>

        {/* 3:4 Card Frame */}
        <div
          className={`relative w-full max-w-[360px] aspect-[3/4] rounded-xl border overflow-hidden flex flex-col justify-between shadow-sm transition-colors ${surfaceStyles[themeStyle]}`}
        >
          {currentCardIdx === 0 ? (
            /* Cover Card */
            <div className="flex h-full flex-col justify-between p-6">
              <div>
                <div className="flex items-center justify-between text-[11px] opacity-60 font-mono-tabular mb-4">
                  <span>01 / COVER</span>
                  <span>VIBEPRESS EDITION</span>
                </div>
                <h2 className="font-editorial text-xl font-semibold leading-snug tracking-tight text-balance">
                  {title || '未命名手稿'}
                </h2>
                {subtitle && (
                  <p className="mt-2.5 text-xs leading-relaxed opacity-70 line-clamp-3">{subtitle}</p>
                )}
              </div>

              <div className="my-3 flex-1 min-h-0 overflow-hidden rounded-lg border border-black/8 dark:border-white/10">
                {!coverFailed ? (
                  <img
                    src="/src/assets/images/xiaohongshu_editorial_stilllife_1795351558871.jpg"
                    alt="小红书封面配图"
                    referrerPolicy="no-referrer"
                    onError={() => setCoverFailed(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[#EBE8DF] text-xs text-[#6B6962]">
                    {title || '封面视觉'}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 text-[11px] opacity-65">
                <span>{authorName}</span>
                <span>向右滑动阅读 →</span>
              </div>
            </div>
          ) : (
            /* Content Slide Card */
            <div className="flex h-full flex-col justify-between p-6 overflow-y-auto">
              <div>
                <div className="flex items-center justify-between text-[11px] opacity-55 font-mono-tabular pb-3 border-b border-black/10 dark:border-white/10">
                  <span>{String(currentCardIdx + 1).padStart(2, '0')} / SLIDE</span>
                  <span className="truncate max-w-[180px]">{title}</span>
                </div>
                <div className="mt-3">{renderBlocks(redSlides[currentCardIdx - 1] ?? [], true)}</div>
              </div>
              <div className="pt-3 mt-4 border-t border-black/10 dark:border-white/10 flex items-center justify-between text-[11px] opacity-55">
                <span>使用 --- 分隔生成下一页卡片</span>
                <span className="font-mono-tabular">
                  {currentCardIdx + 1}/{totalCards}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Card Pagination */}
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSlideIndex((i) => Math.max(0, i - 1))}
            disabled={currentCardIdx === 0}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E5E3DC] dark:border-[#323238] bg-white dark:bg-[#1E1F23] text-[#141413] dark:text-[#F4F3EF] disabled:opacity-35 hover:border-[#141413] cursor-pointer disabled:cursor-not-allowed transition-colors"
            aria-label="上一张卡片"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalCards }).map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setSlideIndex(idx)}
                className={`h-2 rounded-full transition-all cursor-pointer ${
                  idx === currentCardIdx
                    ? 'w-5 bg-[#C83E2B]'
                    : 'w-2 bg-[#D4D1C7] dark:bg-[#3F3F46] hover:bg-[#9C988E]'
                }`}
                aria-label={`切换到第 ${idx + 1} 张卡片`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSlideIndex((i) => Math.min(totalCards - 1, i + 1))}
            disabled={currentCardIdx === totalCards - 1}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E5E3DC] dark:border-[#323238] bg-white dark:bg-[#1E1F23] text-[#141413] dark:text-[#F4F3EF] disabled:opacity-35 hover:border-[#141413] cursor-pointer disabled:cursor-not-allowed transition-colors"
            aria-label="下一张卡片"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  if (platformPreset === 'wechat') {
    return (
      <div className="mx-auto w-full max-w-[440px]">
        <div className="mb-2.5 flex items-center justify-between text-xs text-[#6B6962] dark:text-[#A1A1AA]">
          <span>微信公众号长文排版预览</span>
          <span className="font-mono-tabular">阅读宽度 440px</span>
        </div>
        <article
          className={`rounded-xl border px-6 py-7 transition-colors ${surfaceStyles[themeStyle]}`}
        >
          <h1 className="font-editorial text-[22px] font-semibold leading-[1.35] tracking-tight text-balance">
            {title || '未命名文章'}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs opacity-60">
            <span>{authorName}</span>
            <span aria-hidden="true">·</span>
            <span>VibePress 编辑部</span>
            <span aria-hidden="true">·</span>
            <span>原创长文</span>
          </div>
          {subtitle && (
            <p className="mt-4 border-y border-black/10 dark:border-white/10 py-3 text-[13.5px] leading-relaxed opacity-75">
              {subtitle}
            </p>
          )}
          <div className="mt-4">{renderBlocks(blocks)}</div>
        </article>
      </div>
    );
  }

  // Newsletter / Independent Essay Mode
  return (
    <div className="mx-auto w-full max-w-[560px]">
      <div className="mb-2.5 flex items-center justify-between text-xs text-[#6B6962] dark:text-[#A1A1AA]">
        <span>独立博客 / Newsletter 专栏预览</span>
        <span className="font-mono-tabular">Monograph</span>
      </div>
      <article className={`rounded-xl border px-8 py-9 transition-colors ${surfaceStyles[themeStyle]}`}>
        <div className="text-xs font-mono-tabular opacity-55 mb-3">ISSUE · {new Date().getFullYear()}</div>
        <h1 className="font-editorial text-2xl font-semibold leading-tight tracking-tight text-balance">
          {title || '未命名专栏稿件'}
        </h1>
        {subtitle && <p className="mt-2.5 text-sm leading-relaxed opacity-75">{subtitle}</p>}
        <div className="mt-5 h-px w-full bg-black/10 dark:bg-white/10" />
        <div className="mt-5">{renderBlocks(blocks)}</div>
      </article>
    </div>
  );
};
