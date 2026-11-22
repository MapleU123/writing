import React, { useState } from 'react';
import { ArrowRight, Mic, Plus, Sparkles, Users, FileText, Layers } from 'lucide-react';
import type { DocumentSummary, PlatformPreset } from '../shared/ot';
import { PlatformPreview } from './PlatformPreview';

interface StudioLandingProps {
  documents: DocumentSummary[];
  loadingDocs: boolean;
  docsError: string | null;
  onOpenDocument: (docId: string) => void;
  onCreateDocument: (payload: {
    title: string;
    subtitle: string;
    platformPreset: PlatformPreset;
  }) => Promise<void>;
}

const THREE_PASS_SAMPLES = [
  {
    id: 'pass1',
    step: 'Pass 01 · 语音碎片整理',
    summary: '保留口语现场感与原始细节，把三分钟散乱语音理成自然段落。',
    label: '语音转写整理稿',
    content: `昨天下午我在咖啡馆旁边的小巷子里走，看到一家修钢笔的老铺子。老板大概六十多岁，桌子上摆着好几盏黄铜台灯。我突然想到，现在大家写东西都太像在填表格了，先写大纲再往里塞词。其实我们用说话的方式先把感受录下来，再一点点修掉废话，写出来的东西反而更像人写的。`,
  },
  {
    id: 'pass2',
    step: 'Pass 02 · 剥离机器腔调',
    summary: '去掉套话连接词与模板化总分总，换成有呼吸感的短句与具体意象。',
    label: '去 AI 味精修稿',
    content: `昨天路过一条老巷，见着一间还在修钢笔的铺子。六十来岁的老师傅坐在黄铜台灯底下，用放大镜一点点校准笔尖。

那画面让人想起我们现在写文章的方式——总习惯先拉三级提纲，再像往货架上摆商品一样往里填句子。可好文字很少是填出来的，它更像把脑海里冒出来的零碎声音录下来，再耐心地做减法。`,
  },
  {
    id: 'pass3',
    step: 'Pass 03 · 节奏与个人声线定稿',
    summary: '增加节奏留白、段落金句与排版结构，直接适配微信公众号或图文卡片。',
    label: '终稿 · 可直接发布',
    content: `## 别急着列大纲，先听听自己怎么说话

昨天路过一条老巷，见着一间还在修钢笔的铺子。老师傅坐在黄铜台灯底下，捏着放大镜校准笔尖，动作慢得像上个世纪。

> 真正有温度的句子，从来不是按提纲「填」出来的，而是把口头聊天的鲜活感留下来，再做减法。

先张口说三分钟，再让编辑器帮你理顺节奏。把机器味删干净，剩下的才是你的声音。`,
  },
];

const SAMPLE_MULTIPLATFORM_DOC = `## 01. 为什么「口述初稿」比键盘硬敲更自然

当你面对空白屏幕敲字时，大脑里的「自我审查器」会提前启动，让你写出四平八稳却毫无个性的句子。

> 把写作拆成两步：第一步只管张口说真话，第二步才交给编辑台打磨节奏。

---

## 02. 一份手稿，三种体面的呈现

- **微信公众号**：适合深度叙事与长段呼吸感
- **小红书 3:4 卡片**：用分割线自动切分视觉页
- **独立通讯稿**：极简克制的专栏阅读体验`;

export const StudioLanding: React.FC<StudioLandingProps> = ({
  documents,
  loadingDocs,
  docsError,
  onOpenDocument,
  onCreateDocument,
}) => {
  const [activePassIdx, setActivePassIdx] = useState(2);
  const [previewPlatform, setPreviewPlatform] = useState<PlatformPreset>('xiaohongshu');
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [craftImgFailed, setCraftImgFailed] = useState(false);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSubtitle, setNewSubtitle] = useState('');
  const [newPlatform, setNewPlatform] = useState<PlatformPreset>('wechat');
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      setCreateErr('请输入文档标题');
      return;
    }
    setCreating(true);
    setCreateErr(null);
    try {
      await onCreateDocument({
        title: newTitle.trim(),
        subtitle: newSubtitle.trim(),
        platformPreset: newPlatform,
      });
      setNewTitle('');
      setNewSubtitle('');
      setShowCreateForm(false);
    } catch (err) {
      setCreateErr(err instanceof Error ? err.message : '创建文档失败');
    } finally {
      setCreating(false);
    }
  };

  const formatTime = (ts: number) => {
    const diffMin = Math.max(1, Math.floor((Date.now() - ts) / 60000));
    if (diffMin < 60) return `${diffMin} 分钟前`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} 小时前`;
    return `${Math.floor(diffHr / 24)} 天前`;
  };

  const platformLabel = (p: PlatformPreset) => {
    if (p === 'wechat') return '微信公众号';
    if (p === 'xiaohongshu') return '小红书卡片';
    return '独立专栏';
  };

  const activePass = THREE_PASS_SAMPLES[activePassIdx];

  return (
    <main className="bg-[#FAFAF8] text-[#141413]">
      {/* Hero Split Section */}
      <section id="philosophy" className="mx-auto max-w-[1280px] px-6 lg:px-10 pt-10 pb-14 lg:pt-14 lg:pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
          {/* Left Column */}
          <div className="lg:col-span-6 flex flex-col justify-between py-2">
            <div>
              <p className="text-xs font-medium tracking-wide text-[#C83E2B]">
                个人风格写作与实时协同编辑工坊
              </p>
              <h1 className="mt-4 font-editorial text-4xl sm:text-5xl font-semibold leading-[1.14] tracking-tight text-[#141413] text-balance">
                让灵感自然流淌，让多人协作如同一人执笔。
              </h1>
              <p className="mt-5 max-w-xl text-base leading-[1.75] text-[#575651]">
                受 Vibe Writing 哲学启发而构建的个人编辑系统。从语音速记与零散念头出发，历经三轮去 AI 味精修，一键适配公众号长文与小红书 3:4 图文卡片，并支持基于 WebSocket OT 的毫秒级多人实时同屏共创。
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => {
                    const firstDoc = documents[0]?.id ?? 'vibe-manifesto';
                    onOpenDocument(firstDoc);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#141413] px-5 py-3 text-sm font-medium text-[#FAFAF8] hover:bg-[#C83E2B] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C83E2B]"
                >
                  <span>打开协作工作台</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(true);
                    document.getElementById('collab-rooms')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#D4D1C7] bg-white px-5 py-3 text-sm font-medium text-[#141413] hover:border-[#141413] transition-colors cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>新建多人文档</span>
                </button>
              </div>
            </div>

            <div className="mt-10 pt-6 border-t border-[#E5E3DC] flex flex-wrap items-center gap-3 text-xs text-[#6B6962]">
              <span>真实 WebSocket 同屏同步</span>
              <span aria-hidden="true">·</span>
              <span>支持语音速记转写</span>
              <span aria-hidden="true">·</span>
              <span>三轮去 AI 味精修</span>
            </div>
          </div>

          {/* Right Column: Editorial Studio Photography */}
          <div className="lg:col-span-6">
            <div className="relative h-full min-h-[340px] lg:min-h-[460px] overflow-hidden rounded-2xl border border-[#E5E3DC] bg-[#EFECE4]">
              {!heroImgFailed ? (
                <img
                  src="/src/assets/images/hero_editorial_studio_1795351559916.jpg"
                  alt="晨光中的个人创作书桌与手稿纸张"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgFailed(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center p-10 text-center text-[#575651]">
                  <FileText className="h-10 w-10 mb-3 opacity-40" />
                  <p className="font-editorial text-lg">VibePress 个人编辑部</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Full-Width 4-Column Feature Strip Below Hero */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-y border-[#E5E3DC] divide-y sm:divide-y-0 sm:divide-x divide-[#E5E3DC]">
          <div className="py-6 sm:pr-6">
            <div className="flex items-center gap-2 text-xs font-mono-tabular text-[#C83E2B]">
              <Mic className="h-3.5 w-3.5" />
              <span>01</span>
            </div>
            <h3 className="mt-2 text-sm font-semibold text-[#141413]">口述灵感直入草稿</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-[#6B6962]">
              跳过空白页焦虑，内置浏览器语音听写，边想边说直接写入协同画布。
            </p>
          </div>

          <div className="py-6 sm:px-6">
            <div className="flex items-center gap-2 text-xs font-mono-tabular text-[#C83E2B]">
              <Sparkles className="h-3.5 w-3.5" />
              <span>02</span>
            </div>
            <h3 className="mt-2 text-sm font-semibold text-[#141413]">三轮去味渐进精修</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-[#6B6962]">
              结构整理、剥离机器腔调、节奏定稿三步走，对照比对后再一键采纳。
            </p>
          </div>

          <div className="py-6 sm:px-6">
            <div className="flex items-center gap-2 text-xs font-mono-tabular text-[#C83E2B]">
              <Users className="h-3.5 w-3.5" />
              <span>03</span>
            </div>
            <h3 className="mt-2 text-sm font-semibold text-[#141413]">OT 实时协同不覆盖</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-[#6B6962]">
              多人同屏编辑自动转换字符偏移，实时展示协作者光标坐标与页边批注。
            </p>
          </div>

          <div className="py-6 sm:pl-6">
            <div className="flex items-center gap-2 text-xs font-mono-tabular text-[#C83E2B]">
              <Layers className="h-3.5 w-3.5" />
              <span>04</span>
            </div>
            <h3 className="mt-2 text-sm font-semibold text-[#141413]">公众号与小红书适配</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-[#6B6962]">
              双栏对照即时渲染长文与 3:4 视觉分页卡片，所见即所发。
            </p>
          </div>
        </div>
      </section>

      {/* Section 1: 3-Pass De-AI Editorial Workflow */}
      <section id="three-pass" className="mx-auto max-w-[1280px] px-6 lg:px-10 py-14 border-b border-[#E5E3DC]">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div className="max-w-2xl">
            <p className="text-xs font-mono-tabular text-[#6B6962]">01. 编辑方法论</p>
            <h2 className="mt-2 font-editorial text-3xl font-semibold tracking-tight text-[#141413] text-balance">
              三轮去味精修：保留人的体温，删掉机器的套话
            </h2>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#EFECE4] border border-[#E5E3DC] shrink-0">
            {THREE_PASS_SAMPLES.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActivePassIdx(idx)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activePassIdx === idx
                    ? 'bg-white text-[#141413] shadow-xs'
                    : 'text-[#575651] hover:text-[#141413]'
                }`}
              >
                {`Pass ${idx + 1}`}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Interactive Manuscript Card */}
          <div className="lg:col-span-7 rounded-2xl border border-[#E5E3DC] bg-white p-7 sm:p-9 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#E5E3DC]">
                <span className="text-xs font-semibold text-[#C83E2B]">{activePass.step}</span>
                <span className="text-xs text-[#6B6962] font-mono-tabular">{activePass.label}</span>
              </div>
              <p className="mt-4 text-sm text-[#575651]">{activePass.summary}</p>
              <div className="mt-6 rounded-xl border border-[#E5E3DC] bg-[#FAFAF8] p-6 whitespace-pre-wrap text-[15px] leading-[1.85] text-[#141413]">
                {activePass.content}
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-[#E5E3DC] flex items-center justify-between text-xs text-[#6B6962]">
              <span>工作台内置服务端 Gemini 4 精修引擎，支持任意草稿三轮改写</span>
              <button
                type="button"
                onClick={() => onOpenDocument('vibe-manifesto')}
                className="font-medium text-[#141413] hover:text-[#C83E2B] underline underline-offset-4 whitespace-nowrap shrink-0 cursor-pointer"
              >
                去工作台试写 →
              </button>
            </div>
          </div>

          {/* Editorial Craft Photography */}
          <div className="lg:col-span-5">
            <div className="h-full min-h-[300px] overflow-hidden rounded-2xl border border-[#E5E3DC] bg-[#E8E6DF]">
              {!craftImgFailed ? (
                <img
                  src="/src/assets/images/editorial_craft_proofs_1795351560599.jpg"
                  alt="带有编辑红笔修改批注的印刷校样稿件"
                  referrerPolicy="no-referrer"
                  onError={() => setCraftImgFailed(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center p-8 text-sm text-[#575651]">
                  纸面红笔精修校样
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Multi-Platform Adaptive Preview */}
      <section id="multi-platform" className="mx-auto max-w-[1280px] px-6 lg:px-10 py-14 border-b border-[#E5E3DC]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-5 lg:sticky lg:top-24">
            <p className="text-xs font-mono-tabular text-[#6B6962]">02. 多端视觉排版</p>
            <h2 className="mt-2 font-editorial text-3xl font-semibold tracking-tight text-[#141413] text-balance">
              一份手稿，同步生成不同平台的阅读体面
            </h2>
            <p className="mt-4 text-sm leading-[1.75] text-[#575651]">
              写作时只需专注纯净的 Markdown 文本与思路本身。在协作工作台中随时切换排版视图，实时预览它在公众号阅读器、小红书 3:4 分页卡片以及独立通讯专栏中的真实效果。
            </p>

            <div className="mt-7 space-y-2.5">
              {(
                [
                  {
                    key: 'wechat',
                    title: '微信公众号长文',
                    desc: '舒适的 440px 移动端栏宽、优雅的衬线标题与克制引用块。',
                  },
                  {
                    key: 'xiaohongshu',
                    title: '小红书 3:4 图文卡片',
                    desc: '以 --- 分割线自动切页，生成带封面图与页码的 3:4 视觉滑块。',
                  },
                  {
                    key: 'newsletter',
                    title: '独立博客 / Newsletter',
                    desc: 'Monograph 杂志级双栏留白排版，适合长篇随笔与专栏推送。',
                  },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setPreviewPlatform(opt.key)}
                  className={`w-full text-left rounded-xl border p-4 transition-colors cursor-pointer ${
                    previewPlatform === opt.key
                      ? 'border-[#141413] bg-white'
                      : 'border-[#E5E3DC] bg-transparent hover:bg-white/70'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#141413]">{opt.title}</span>
                    {previewPlatform === opt.key && (
                      <span className="text-xs font-medium text-[#C83E2B]">当前预览</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[#6B6962]">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7 rounded-2xl border border-[#E5E3DC] bg-[#F2F0E8] p-6 sm:p-10">
            <PlatformPreview
              title="在城市边缘重建一座个人书房：30平米手记"
              subtitle="关于口述初稿、去 AI 味精修与多端排版的实测示例"
              content={SAMPLE_MULTIPLATFORM_DOC}
              platformPreset={previewPlatform}
              themeStyle={previewPlatform === 'xiaohongshu' ? 'linen' : 'paper'}
              authorName="林栖"
            />
          </div>
        </div>
      </section>

      {/* Section 3: Collaborative Documents Directory */}
      <section id="collab-rooms" className="mx-auto max-w-[1280px] px-6 lg:px-10 py-14">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-xs font-mono-tabular text-[#6B6962]">03. 实时协作文档空间</p>
            <h2 className="mt-2 font-editorial text-3xl font-semibold tracking-tight text-[#141413]">
              选择一篇手稿，或发起新的协同编辑房间
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateForm((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#141413] px-4 py-2.5 text-xs font-medium text-white hover:bg-[#C83E2B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>{showCreateForm ? '收起新建表单' : '新建协作文档'}</span>
          </button>
        </div>

        {/* Inline Create Document Panel */}
        {showCreateForm && (
          <form
            onSubmit={handleCreateSubmit}
            className="mb-8 rounded-2xl border border-[#141413] bg-white p-6 sm:p-8"
          >
            <h3 className="text-base font-semibold text-[#141413]">创建新的实时协同文档</h3>
            <p className="mt-1 text-xs text-[#6B6962]">
              创建后将自动生成独立房间链接，发给协作者即可同一时间同屏输入。
            </p>
            <div className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-5">
                <label className="block text-xs font-medium text-[#575651] mb-1.5">文章标题</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="例如：我的 2026 年度写作方法论"
                  className="w-full rounded-lg border border-[#D4D1C7] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#141413] focus:border-[#141413] focus:outline-none"
                />
              </div>
              <div className="md:col-span-4">
                <label className="block text-xs font-medium text-[#575651] mb-1.5">副标题 / 导语（可选）</label>
                <input
                  type="text"
                  value={newSubtitle}
                  onChange={(e) => setNewSubtitle(e.target.value)}
                  placeholder="简要描述写作目标或目标读者"
                  className="w-full rounded-lg border border-[#D4D1C7] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#141413] focus:border-[#141413] focus:outline-none"
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-[#575651] mb-1.5">默认排版模式</label>
                <select
                  value={newPlatform}
                  onChange={(e) => setNewPlatform(e.target.value as PlatformPreset)}
                  className="w-full rounded-lg border border-[#D4D1C7] bg-[#FAFAF8] px-3 py-2.5 text-sm text-[#141413] focus:border-[#141413] focus:outline-none"
                >
                  <option value="wechat">微信公众号长文</option>
                  <option value="xiaohongshu">小红书 3:4 卡片</option>
                  <option value="newsletter">独立博客 / 专栏</option>
                </select>
              </div>
            </div>
            {createErr && <p className="mt-3 text-xs text-[#C83E2B]">{createErr}</p>}
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="rounded-lg border border-[#D4D1C7] px-4 py-2 text-xs font-medium text-[#575651] hover:text-[#141413] cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={creating}
                className="rounded-lg bg-[#C83E2B] px-5 py-2 text-xs font-medium text-white hover:bg-[#A63120] disabled:opacity-50 cursor-pointer"
              >
                {creating ? '正在创建...' : '创建并进入协作'}
              </button>
            </div>
          </form>
        )}

        {/* Document List */}
        {loadingDocs ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-44 rounded-2xl border border-[#E5E3DC] bg-white p-6 animate-pulse" />
            ))}
          </div>
        ) : docsError ? (
          <div className="rounded-2xl border border-[#E5E3DC] bg-white p-8 text-center text-sm text-[#C83E2B]">
            {docsError}
          </div>
        ) : documents.length === 0 ? (
          <div className="rounded-2xl border border-[#E5E3DC] bg-white p-10 text-center">
            <p className="text-sm text-[#575651]">还没有协作文档，点击右上角「新建协作文档」开始吧。</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {documents.map((doc) => (
              <div
                key={doc.id}
                onClick={() => onOpenDocument(doc.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpenDocument(doc.id);
                  }
                }}
                className="group flex flex-col justify-between rounded-2xl border border-[#E5E3DC] bg-white p-6 hover:border-[#141413] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#C83E2B]"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs text-[#6B6962]">
                    <span>{platformLabel(doc.platformPreset)}</span>
                    <span className="font-mono-tabular">v{doc.version}</span>
                  </div>
                  <h3 className="mt-3 font-editorial text-lg font-semibold leading-snug text-[#141413] group-hover:text-[#C83E2B] transition-colors line-clamp-2">
                    {doc.title}
                  </h3>
                  {doc.subtitle && (
                    <p className="mt-2 text-xs leading-relaxed text-[#6B6962] line-clamp-2">
                      {doc.subtitle}
                    </p>
                  )}
                </div>

                <div className="mt-6 pt-4 border-t border-[#E5E3DC] flex items-center justify-between text-xs text-[#6B6962]">
                  <div className="flex items-center gap-2 font-mono-tabular">
                    <span>{doc.wordCount} 字</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatTime(doc.updatedAt)}</span>
                  </div>
                  <span className="font-medium text-[#141413] group-hover:text-[#C83E2B] whitespace-nowrap">
                    {doc.activeUsersCount > 0 ? `${doc.activeUsersCount} 人在线 · 加入` : '打开编辑 →'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Clean Restrained Footer */}
      <footer className="border-t border-[#E5E3DC] bg-[#FAFAF8]">
        <div className="mx-auto max-w-[1280px] px-6 lg:px-10 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#6B6962]">
          <span>VibePress · 个人风格写作与实时协同编辑工坊</span>
          <div className="flex items-center gap-5">
            <span>OT 文本同步引擎</span>
            <span aria-hidden="true">·</span>
            <span>微信公众号与小红书排版</span>
            <span aria-hidden="true">·</span>
            <span>2026</span>
          </div>
        </div>
      </footer>
    </main>
  );
};
