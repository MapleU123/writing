import React from 'react';

interface TopBarProps {
  mode: 'landing' | 'workspace';
  onNavigateHome: () => void;
  onNavigateSection: (sectionId: string) => void;
  onEnterWorkspace: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  mode,
  onNavigateHome,
  onNavigateSection,
  onEnterWorkspace,
}) => {
  return (
    <header className="sticky top-0 z-40 border-b border-[#E5E3DC] bg-[#FAFAF8]/92 backdrop-blur-md dark:border-[#27272A] dark:bg-[#111214]/92 transition-colors">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-8 px-6 lg:px-10">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={onNavigateHome}
          className="font-editorial text-xl font-semibold tracking-tight text-[#141413] dark:text-[#F4F3EF] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#C83E2B]"
        >
          VibePress
        </button>

        {/* Zone 2: 4 Concise Single-Line Navigation Links */}
        <nav
          aria-label="主导航"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-[#575651] dark:text-[#A1A1AA]"
        >
          <button
            type="button"
            onClick={() => onNavigateSection('philosophy')}
            className="hover:text-[#141413] dark:hover:text-[#F4F3EF] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            写作理念
          </button>
          <button
            type="button"
            onClick={() => onNavigateSection('three-pass')}
            className="hover:text-[#141413] dark:hover:text-[#F4F3EF] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            三轮精修
          </button>
          <button
            type="button"
            onClick={() => onNavigateSection('multi-platform')}
            className="hover:text-[#141413] dark:hover:text-[#F4F3EF] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            多端排版
          </button>
          <button
            type="button"
            onClick={() => onNavigateSection('collab-rooms')}
            className="hover:text-[#141413] dark:hover:text-[#F4F3EF] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            协作空间
          </button>
        </nav>

        {/* Zone 3: 1 Primary CTA */}
        <div className="flex items-center shrink-0">
          {mode === 'landing' ? (
            <button
              type="button"
              onClick={onEnterWorkspace}
              className="rounded-lg bg-[#141413] px-4 py-2 text-xs font-medium text-[#FAFAF8] hover:bg-[#C83E2B] dark:bg-[#F4F3EF] dark:text-[#141413] dark:hover:bg-[#C83E2B] dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C83E2B]"
            >
              进入协作编辑
            </button>
          ) : (
            <button
              type="button"
              onClick={onNavigateHome}
              className="rounded-lg border border-[#D4D1C7] bg-white px-4 py-2 text-xs font-medium text-[#141413] hover:border-[#141413] dark:border-[#323238] dark:bg-[#1A1B1E] dark:text-[#F4F3EF] dark:hover:border-[#F4F3EF] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C83E2B]"
            >
              返回主页
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
