import 'dotenv/config';
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI } from '@google/genai';
import {
  applyOp,
  computeChecksum,
  countWords,
  transformOp,
  type CollaborativeDocument,
  type CollaboratorPresence,
  type DocComment,
  type DocSnapshot,
  type DocumentSummary,
  type PlatformPreset,
  type TextOperation,
  type ThemePreset,
  type WsClientMessage,
  type WsServerMessage,
} from './src/shared/ot.ts';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.resolve(DATA_DIR, 'documents.json');

interface OpHistoryEntry {
  version: number;
  op: TextOperation;
}

interface RoomClient {
  ws: WebSocket;
  docId: string;
  clientId: string;
  name: string;
  color: string;
  cursorStart: number;
  cursorEnd: number;
  lastActiveAt: number;
}

const VALID_PLATFORMS: PlatformPreset[] = ['wechat', 'xiaohongshu', 'newsletter'];
const VALID_THEMES: ThemePreset[] = ['paper', 'ink', 'linen'];

function sanitizeSlug(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return cleaned || `doc-${crypto.randomUUID().slice(0, 8)}`;
}

function clampString(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.slice(0, maxLen);
}

function seedDocuments(): Record<string, CollaborativeDocument> {
  const now = Date.now();
  const docs: CollaborativeDocument[] = [
    {
      id: 'vibe-manifesto',
      title: '为什么我们不再需要「大纲式写作」，而是需要 Vibe Writing',
      subtitle: '从零散的语音速记到有呼吸感的长文：重建人机协作的编辑部工作流',
      platformPreset: 'wechat',
      themeStyle: 'paper',
      version: 1,
      updatedAt: now - 1000 * 60 * 14,
      content: `## 01. 当提纲变成思维的牢笼

过去十年，效率工具一直在教我们「先列三级大纲，再往里填句子」。可真实的好文章几乎从来不是这么诞生的。

灵感往往出现在地铁站出口的一段三分钟语音备忘录里，出现在深夜散步时突然冒出来的一个比喻，或者两个人聊到兴起时的一句反问。当你强行把它塞进「背景—痛点—方案—总结」的模板里，文字的温度在第一分钟就凉了。

> 真正有生命力的表达，不是按照提纲组装零件，而是让一段真实的情绪和观察自然生长出它的骨架。

## 02. 三轮去味精修：把「人话」还给创作者

我们反感的从来不是 AI 辅助写作本身，而是那种一眼就能认出来的「翻译腔」和「总分总结构」。在 VibePress 的编辑流里，我们用三轮渐进式精修替代一次性的代写：

1. **第一轮 · 散落素材结构化**：保留你口语讲述里的语气词、具体细节和现场感，只理顺叙述时间线与逻辑断点。
2. **第二轮 · 剥离模板修辞**：删掉「综上所述」「值得注意的是」「不仅如此，更在于」这类空洞的连接词，换成短句与克制的留白。
3. **第三轮 · 节奏与个人声线定稿**：根据发布平台（公众号长文、小红书图文卡片或独立通讯）调整段落呼吸感与标题钩子。

---

## 03. 为什么写作工坊需要「实时多人同屏」？

哪怕是独立创作者，文章在定稿前也常需要一位懂你的主编、设计师或联合作者一起推敲。

打开右上角的**分享协作链接**，你可以把这篇文章实时交给身处不同城市的编辑或搭档。你们在同一份手稿里修改措辞、查看彼此的光标位置、在页边留下具体到某句话的批注——不需要反复互传 \`final_v3_修改版.docx\`。`,
      comments: [
        {
          id: 'c-seed-1',
          author: '林栖 · 主编',
          color: '#C83E2B',
          quote: '文字的温度在第一分钟就凉了',
          body: '这句开篇很有共鸣，建议保留。第二段可以再加一个具体的语音速记场景。',
          createdAt: now - 1000 * 60 * 42,
          resolved: false,
        },
        {
          id: 'c-seed-2',
          author: '周默 · 排版',
          color: '#2563EB',
          quote: '三轮去味精修',
          body: '导出公众号时建议把这三点做成带编号的轻卡片，阅读停留率会更高。',
          createdAt: now - 1000 * 60 * 18,
          resolved: false,
        },
      ],
      snapshots: [
        {
          id: 'snap-seed-1',
          label: '初稿 · 语音速记整理',
          author: '林栖',
          createdAt: now - 1000 * 60 * 90,
          version: 1,
          content: '初稿记录了关于摆脱大纲写作与三轮编辑的核心想法。',
          wordCount: 24,
        },
      ],
    },
    {
      id: 'urban-notebook',
      title: '在城市边缘重建一座个人书房：30平米空间手记',
      subtitle: '小红书 3:4 图文卡片实测模板 · 使用 --- 自动分页生成视觉卡片',
      platformPreset: 'xiaohongshu',
      themeStyle: 'linen',
      version: 1,
      updatedAt: now - 1000 * 60 * 65,
      content: `## 把白天的噪音留在玄关之外

搬进这间朝北的老房子时，窗外正对着一棵高大的梧桐。我没有买传统的标准书桌，而是用两块老榆木门板搭了一张两米四的长案。

足够宽的桌面，才能让笔记本、手稿纸和一只手冲咖啡杯同时安放，彼此不打扰。

---

## 光线是最好的装潢预算

上午十点到下午两点，北窗的漫反射光均匀地铺在纸面上，没有任何刺眼的反光。

**三件真正值得投资的器物：**
- 一盏显色指数 97 以上的台灯
- 一叠 100g 无酸微黄草稿纸
- 一把坐下去不会提醒你「该办公了」的木椅

---

## 写作者的日常仪式

每天早上不开通讯软件，先花二十分钟对着窗口把脑子里的杂念读出来，录成语音转成文字。

等情绪沉淀下来，再在编辑器里做一轮减法。大多数好句子，都是删出来的，不是挤出来的。`,
      comments: [
        {
          id: 'c-seed-3',
          author: '苏砚',
          color: '#15803D',
          quote: '两块老榆木门板搭了一张两米四的长案',
          body: '小红书第一张卡片的视觉画面已经很强了，可以直接配右栏的书房静物图。',
          createdAt: now - 1000 * 60 * 50,
          resolved: false,
        },
      ],
      snapshots: [],
    },
    {
      id: 'team-editorial-2026',
      title: '2026 独立创作者内容协作指南（共创工作稿）',
      subtitle: '邀请你的团队成员打开同一链接，测试毫秒级 OT 实时协同编辑',
      platformPreset: 'newsletter',
      themeStyle: 'paper',
      version: 1,
      updatedAt: now - 1000 * 60 * 180,
      content: `## 协作编辑测试沙盒

欢迎来到 **VibePress 实时协同工作台**。你可以点击右上角的「复制邀请链接」或在浏览器中打开一个新的标签页访问同一地址，体验真实的多端同步：

- **同时输入不覆盖**：基于文本操作转换（OT）算法，两人在不同段落甚至同一行同时打字，光标位置会自动平滑偏移，不会相互覆盖。
- **实时光标感知**：你可以看到协作者当前正在编辑的文本坐标与浮动署名标识。
- **多端格式即时切换**：在上方工具栏切换「双栏对照排版」，即可边改稿边预览公众号、小红书 3:4 卡片与独立通讯效果。

> 试着修改这里的任意文字，或点击右侧「批注」留下一条编辑意见。`,
      comments: [],
      snapshots: [],
    },
  ];

  const record: Record<string, CollaborativeDocument> = {};
  for (const d of docs) {
    record[d.id] = d;
  }
  return record;
}

class DocumentStore {
  private docs: Map<string, CollaborativeDocument> = new Map();
  private opHistories: Map<string, OpHistoryEntry[]> = new Map();
  private saveTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.loadFromDisk();
  }

  private loadFromDisk() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as Record<string, CollaborativeDocument>;
        for (const [id, doc] of Object.entries(parsed)) {
          this.docs.set(id, {
            ...doc,
            comments: Array.isArray(doc.comments) ? doc.comments : [],
            snapshots: Array.isArray(doc.snapshots) ? doc.snapshots : [],
          });
          this.opHistories.set(id, []);
        }
      }
    } catch (err) {
      console.error('Failed to load documents store, seeding defaults:', err);
    }

    if (this.docs.size === 0) {
      const seeded = seedDocuments();
      for (const [id, doc] of Object.entries(seeded)) {
        this.docs.set(id, doc);
        this.opHistories.set(id, []);
      }
      this.flushNow();
    }
  }

  private scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushNow(), 350);
  }

  private flushNow() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const obj: Record<string, CollaborativeDocument> = {};
      for (const [id, doc] of this.docs.entries()) {
        obj[id] = doc;
      }
      const tmpFile = `${DATA_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(obj, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DATA_FILE);
    } catch (err) {
      console.error('Failed to persist documents store:', err);
    }
  }

  listSummaries(getRoomCount: (docId: string) => number): DocumentSummary[] {
    return Array.from(this.docs.values())
      .map((doc) => ({
        id: doc.id,
        title: doc.title,
        subtitle: doc.subtitle,
        platformPreset: doc.platformPreset,
        version: doc.version,
        updatedAt: doc.updatedAt,
        wordCount: countWords(doc.content),
        activeUsersCount: getRoomCount(doc.id),
        commentCount: doc.comments.filter((c) => !c.resolved).length,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(docId: string): CollaborativeDocument | undefined {
    return this.docs.get(docId);
  }

  create(input: {
    id?: string;
    title: string;
    subtitle?: string;
    content?: string;
    platformPreset?: PlatformPreset;
    themeStyle?: ThemePreset;
  }): CollaborativeDocument {
    let baseId = sanitizeSlug(input.id || input.title || 'untitled');
    let candidate = baseId;
    let suffix = 2;
    while (this.docs.has(candidate)) {
      candidate = `${baseId}-${suffix++}`;
    }

    const platform = VALID_PLATFORMS.includes(input.platformPreset as PlatformPreset)
      ? (input.platformPreset as PlatformPreset)
      : 'wechat';
    const theme = VALID_THEMES.includes(input.themeStyle as ThemePreset)
      ? (input.themeStyle as ThemePreset)
      : 'paper';

    const doc: CollaborativeDocument = {
      id: candidate,
      title: clampString(input.title, 120) || '未命名协作手稿',
      subtitle: clampString(input.subtitle || '', 220),
      content:
        typeof input.content === 'string' && input.content.length > 0
          ? clampString(input.content, 120000)
          : `## 新的灵感起点\n\n在这里记录你的想法，或点击上方「语音速记」直接口述初稿。\n\n分享当前房间链接给协作者，即可在同一份文档中实时同行编辑。`,
      platformPreset: platform,
      themeStyle: theme,
      version: 1,
      updatedAt: Date.now(),
      comments: [],
      snapshots: [],
    };
    this.docs.set(doc.id, doc);
    this.opHistories.set(doc.id, []);
    this.scheduleSave();
    return doc;
  }

  delete(docId: string): boolean {
    if (this.docs.size <= 1) return false;
    const existed = this.docs.delete(docId);
    this.opHistories.delete(docId);
    if (existed) this.scheduleSave();
    return existed;
  }

  applyClientOp(
    docId: string,
    baseVersion: number,
    rawOp: TextOperation
  ): { ok: true; version: number; transformedOp: TextOperation; checksum: string; updatedAt: number } | { ok: false; needsResync: boolean } {
    const doc = this.docs.get(docId);
    if (!doc) return { ok: false, needsResync: false };

    const history = this.opHistories.get(docId) ?? [];
    const earliestVersion = history.length > 0 ? history[0].version - 1 : doc.version;

    if (baseVersion > doc.version || baseVersion < earliestVersion) {
      return { ok: false, needsResync: true };
    }

    let op: TextOperation = {
      pos: Math.max(0, Math.floor(rawOp.pos)),
      delLen: Math.max(0, Math.floor(rawOp.delLen)),
      insStr: clampString(rawOp.insStr, 60000),
    };

    // Transform incoming op against every op that happened since baseVersion
    for (const entry of history) {
      if (entry.version > baseVersion) {
        op = transformOp(op, entry.op, 'right');
      }
    }

    // Clamp to current doc length safely
    op.pos = Math.max(0, Math.min(op.pos, doc.content.length));
    op.delLen = Math.max(0, Math.min(op.delLen, doc.content.length - op.pos));

    doc.content = applyOp(doc.content, op);
    doc.version += 1;
    doc.updatedAt = Date.now();

    history.push({ version: doc.version, op });
    if (history.length > 500) {
      history.shift();
    }
    this.opHistories.set(docId, history);
    this.scheduleSave();

    return {
      ok: true,
      version: doc.version,
      transformedOp: op,
      checksum: computeChecksum(doc.content),
      updatedAt: doc.updatedAt,
    };
  }

  updateMeta(
    docId: string,
    patch: {
      title?: string;
      subtitle?: string;
      platformPreset?: PlatformPreset;
      themeStyle?: ThemePreset;
    }
  ): CollaborativeDocument | null {
    const doc = this.docs.get(docId);
    if (!doc) return null;
    if (typeof patch.title === 'string') {
      doc.title = clampString(patch.title, 120);
    }
    if (typeof patch.subtitle === 'string') {
      doc.subtitle = clampString(patch.subtitle, 220);
    }
    if (patch.platformPreset && VALID_PLATFORMS.includes(patch.platformPreset)) {
      doc.platformPreset = patch.platformPreset;
    }
    if (patch.themeStyle && VALID_THEMES.includes(patch.themeStyle)) {
      doc.themeStyle = patch.themeStyle;
    }
    doc.updatedAt = Date.now();
    this.scheduleSave();
    return doc;
  }

  addComment(docId: string, author: string, color: string, quote: string, body: string): DocComment[] | null {
    const doc = this.docs.get(docId);
    if (!doc) return null;
    const trimmedBody = clampString(body, 1000).trim();
    if (!trimmedBody) return doc.comments;
    const comment: DocComment = {
      id: `c-${crypto.randomUUID().slice(0, 8)}`,
      author: clampString(author, 40) || '协作者',
      color: clampString(color, 16) || '#C83E2B',
      quote: clampString(quote, 160).trim(),
      body: trimmedBody,
      createdAt: Date.now(),
      resolved: false,
    };
    doc.comments = [comment, ...doc.comments].slice(0, 100);
    doc.updatedAt = Date.now();
    this.scheduleSave();
    return doc.comments;
  }

  toggleComment(docId: string, commentId: string): DocComment[] | null {
    const doc = this.docs.get(docId);
    if (!doc) return null;
    doc.comments = doc.comments.map((c) => (c.id === commentId ? { ...c, resolved: !c.resolved } : c));
    doc.updatedAt = Date.now();
    this.scheduleSave();
    return doc.comments;
  }

  deleteComment(docId: string, commentId: string): DocComment[] | null {
    const doc = this.docs.get(docId);
    if (!doc) return null;
    doc.comments = doc.comments.filter((c) => c.id !== commentId);
    doc.updatedAt = Date.now();
    this.scheduleSave();
    return doc.comments;
  }

  createSnapshot(docId: string, label: string, author: string): DocSnapshot[] | null {
    const doc = this.docs.get(docId);
    if (!doc) return null;
    const snapshot: DocSnapshot = {
      id: `snap-${crypto.randomUUID().slice(0, 8)}`,
      label: clampString(label, 80).trim() || `版本快照 v${doc.version}`,
      author: clampString(author, 40) || '协作者',
      createdAt: Date.now(),
      version: doc.version,
      content: doc.content,
      wordCount: countWords(doc.content),
    };
    doc.snapshots = [snapshot, ...doc.snapshots].slice(0, 30);
    this.scheduleSave();
    return doc.snapshots;
  }

  restoreSnapshot(docId: string, snapshotId: string): CollaborativeDocument | null {
    const doc = this.docs.get(docId);
    if (!doc) return null;
    const snap = doc.snapshots.find((s) => s.id === snapshotId);
    if (!snap) return null;

    // Save current state automatically before restoring
    const autoSnap: DocSnapshot = {
      id: `snap-${crypto.randomUUID().slice(0, 8)}`,
      label: `恢复前自动备份 (v${doc.version})`,
      author: '系统备份',
      createdAt: Date.now(),
      version: doc.version,
      content: doc.content,
      wordCount: countWords(doc.content),
    };

    doc.content = snap.content;
    doc.version += 1;
    doc.updatedAt = Date.now();
    doc.snapshots = [autoSnap, ...doc.snapshots].slice(0, 30);
    // Reset opHistory base on full document replacement
    this.opHistories.set(docId, []);
    this.scheduleSave();
    return doc;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const store = new DocumentStore();
  const rooms = new Map<string, Set<RoomClient>>();

  const getRoomClients = (docId: string): Set<RoomClient> => {
    let set = rooms.get(docId);
    if (!set) {
      set = new Set();
      rooms.set(docId, set);
    }
    return set;
  };

  const getPresenceList = (docId: string): CollaboratorPresence[] => {
    return Array.from(getRoomClients(docId)).map((c) => ({
      clientId: c.clientId,
      name: c.name,
      color: c.color,
      cursorStart: c.cursorStart,
      cursorEnd: c.cursorEnd,
      lastActiveAt: c.lastActiveAt,
    }));
  };

  const sendWs = (ws: WebSocket, payload: WsServerMessage) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  };

  const broadcastToRoom = (docId: string, payload: WsServerMessage, excludeClientId?: string) => {
    const clients = getRoomClients(docId);
    const data = JSON.stringify(payload);
    for (const c of clients) {
      if (excludeClientId && c.clientId === excludeClientId) continue;
      if (c.ws.readyState === WebSocket.OPEN) {
        c.ws.send(data);
      }
    }
  };

  // REST API routes
  app.get('/api/documents', (_req, res) => {
    const summaries = store.listSummaries((docId) => getRoomClients(docId).size);
    res.json({ documents: summaries });
  });

  app.post('/api/documents', (req, res) => {
    const { title, subtitle, content, platformPreset, themeStyle } = req.body ?? {};
    if (typeof title !== 'string' || !title.trim()) {
      res.status(400).json({ error: '请输入文档标题。' });
      return;
    }
    const created = store.create({
      title: title.trim(),
      subtitle: typeof subtitle === 'string' ? subtitle : '',
      content: typeof content === 'string' ? content : undefined,
      platformPreset,
      themeStyle,
    });
    res.status(201).json({ document: created });
  });

  app.get('/api/documents/:id', (req, res) => {
    const doc = store.get(req.params.id);
    if (!doc) {
      res.status(404).json({ error: '未找到对应的协作文档。' });
      return;
    }
    res.json({
      document: doc,
      activeUsersCount: getRoomClients(doc.id).size,
    });
  });

  app.delete('/api/documents/:id', (req, res) => {
    const ok = store.delete(req.params.id);
    if (!ok) {
      res.status(400).json({ error: '无法删除最后一个文档或文档不存在。' });
      return;
    }
    res.json({ deleted: true });
  });

  app.post('/api/editorial/refine', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(503).json({
        error: '尚未配置 GEMINI_API_KEY，请在 AI Studio Secrets 面板配置后启用三轮精修助手。',
      });
      return;
    }

    const { content, passMode, customInstruction } = req.body ?? {};
    if (typeof content !== 'string' || !content.trim()) {
      res.status(400).json({ error: '文档内容不能为空。' });
      return;
    }

    const clipped = content.slice(0, 24000);
    const modeDirectives: Record<string, string> = {
      'pass1-structure':
        '执行【第一轮：灵感结构化】。把口语化或碎片化的段落梳理为清晰的小标题（##）与自然过渡，但严格保留作者的原话细节、现场感与真实情绪，不要扩写成空洞套话。',
      'pass2-deai':
        '执行【第二轮：深度去 AI 味】。彻底删掉「综上所述」「值得注意的是」「不仅如此」「赋能」「抓手」「总而言之」等生硬大模型腔调；把长排比和对称句拆成有呼吸感的短句与真实口语表达，像资深杂志主编一样落笔。',
      'pass3-rhythm':
        '执行【第三轮：节奏与金句定稿】。优化段落长短交替（长短句节奏），打磨核心金句（可用 > 引用块突出），保持 Markdown 结构干净利落，适合微信公众号与独立专栏阅读。',
      'custom':
        typeof customInstruction === 'string' && customInstruction.trim()
          ? `按作者要求进行针对性编辑润色：${customInstruction.trim().slice(0, 400)}`
          : '优化行文自然度与阅读流畅感，保留原意与 Markdown 格式。',
    };

    const directive = modeDirectives[String(passMode)] || modeDirectives['pass2-deai'];

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `请严格遵循指令处理以下 Markdown 文稿，直接输出精修后的完整 Markdown 正文（不要附带「好的」「以下是修改后」等寒暄前缀）：\n\n---\n${clipped}`,
        config: {
          systemInstruction: `你是 VibePress 编辑部主编，擅长去除机器写作腔调、保留创作者真实声线。${directive} 保持原有语言（中文为主）及必要的 Markdown 语法（##、>、---、**）。`,
        },
      });

      const refinedText = (response.text ?? '').trim();
      if (!refinedText) {
        res.status(502).json({ error: '模型未返回有效文本，请稍后重试。' });
        return;
      }

      res.json({ refinedText });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '调用编辑模型时发生未知错误';
      console.error('Gemini editorial refine error:', err);
      res.status(502).json({ error: `精修服务暂时不可用：${message}` });
    }
  });

  // Setup HTTP + WebSocket Server on single port 3000
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    let currentClient: RoomClient | null = null;

    ws.on('message', (raw) => {
      let msg: WsClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as WsClientMessage;
      } catch {
        sendWs(ws, { type: 'error', message: '无效的消息格式' });
        return;
      }

      if (!msg || typeof msg.type !== 'string') return;

      if (msg.type === 'join') {
        const doc = store.get(msg.docId);
        if (!doc) {
          sendWs(ws, { type: 'error', message: '目标文档不存在' });
          return;
        }

        // Leave previous room if switching
        if (currentClient) {
          const prevClients = getRoomClients(currentClient.docId);
          prevClients.delete(currentClient);
          broadcastToRoom(currentClient.docId, {
            type: 'presence:update',
            presence: getPresenceList(currentClient.docId),
          });
        }

        const safeClientId = clampString(msg.clientId, 64) || crypto.randomUUID().slice(0, 10);
        const safeName = clampString(msg.name, 32).trim() || '匿名协作者';
        const safeColor = /^#[0-9a-fA-F]{6}$/.test(msg.color) ? msg.color : '#C83E2B';

        currentClient = {
          ws,
          docId: doc.id,
          clientId: safeClientId,
          name: safeName,
          color: safeColor,
          cursorStart: 0,
          cursorEnd: 0,
          lastActiveAt: Date.now(),
        };

        const clients = getRoomClients(doc.id);
        // Ensure same clientId doesn't duplicate on reconnect
        for (const existing of clients) {
          if (existing.clientId === safeClientId && existing.ws !== ws) {
            clients.delete(existing);
          }
        }
        clients.add(currentClient);

        sendWs(ws, {
          type: 'doc:init',
          document: doc,
          presence: getPresenceList(doc.id),
          checksum: computeChecksum(doc.content),
        });

        broadcastToRoom(
          doc.id,
          {
            type: 'presence:update',
            presence: getPresenceList(doc.id),
          },
          safeClientId
        );
        return;
      }

      if (!currentClient || currentClient.docId !== msg.docId) return;

      if (msg.type === 'profile:update') {
        currentClient.name = clampString(msg.name, 32).trim() || currentClient.name;
        if (/^#[0-9a-fA-F]{6}$/.test(msg.color)) {
          currentClient.color = msg.color;
        }
        currentClient.lastActiveAt = Date.now();
        broadcastToRoom(currentClient.docId, {
          type: 'presence:update',
          presence: getPresenceList(currentClient.docId),
        });
        return;
      }

      if (msg.type === 'doc:resync') {
        const doc = store.get(currentClient.docId);
        if (doc) {
          sendWs(ws, {
            type: 'doc:init',
            document: doc,
            presence: getPresenceList(doc.id),
            checksum: computeChecksum(doc.content),
          });
        }
        return;
      }

      if (msg.type === 'doc:op') {
        if (
          !msg.op ||
          typeof msg.op.pos !== 'number' ||
          typeof msg.op.delLen !== 'number' ||
          typeof msg.op.insStr !== 'string'
        ) {
          return;
        }

        const result = store.applyClientOp(currentClient.docId, msg.baseVersion, msg.op);
        if (!result.ok) {
          if (result.needsResync) {
            const doc = store.get(currentClient.docId);
            if (doc) {
              sendWs(ws, {
                type: 'doc:init',
                document: doc,
                presence: getPresenceList(doc.id),
                checksum: computeChecksum(doc.content),
              });
            }
          }
          return;
        }

        currentClient.cursorStart = Math.max(0, Math.floor(msg.cursorStart || 0));
        currentClient.cursorEnd = Math.max(0, Math.floor(msg.cursorEnd || 0));
        currentClient.lastActiveAt = Date.now();

        sendWs(ws, {
          type: 'doc:ack',
          opId: msg.opId,
          version: result.version,
          checksum: result.checksum,
        });

        broadcastToRoom(
          currentClient.docId,
          {
            type: 'doc:op',
            version: result.version,
            op: result.transformedOp,
            clientId: currentClient.clientId,
            authorName: currentClient.name,
            checksum: result.checksum,
            updatedAt: result.updatedAt,
          },
          currentClient.clientId
        );
        return;
      }

      if (msg.type === 'cursor:update') {
        currentClient.cursorStart = Math.max(0, Math.floor(msg.cursorStart || 0));
        currentClient.cursorEnd = Math.max(0, Math.floor(msg.cursorEnd || 0));
        currentClient.lastActiveAt = Date.now();
        broadcastToRoom(
          currentClient.docId,
          {
            type: 'cursor:update',
            clientId: currentClient.clientId,
            cursorStart: currentClient.cursorStart,
            cursorEnd: currentClient.cursorEnd,
          },
          currentClient.clientId
        );
        return;
      }

      if (msg.type === 'doc:meta') {
        const updated = store.updateMeta(currentClient.docId, {
          title: msg.title,
          subtitle: msg.subtitle,
          platformPreset: msg.platformPreset,
          themeStyle: msg.themeStyle,
        });
        if (updated) {
          broadcastToRoom(
            currentClient.docId,
            {
              type: 'doc:meta',
              title: updated.title,
              subtitle: updated.subtitle,
              platformPreset: updated.platformPreset,
              themeStyle: updated.themeStyle,
              updatedAt: updated.updatedAt,
            },
            currentClient.clientId
          );
        }
        return;
      }

      if (msg.type === 'comment:add') {
        const comments = store.addComment(
          currentClient.docId,
          currentClient.name,
          currentClient.color,
          msg.quote,
          msg.body
        );
        if (comments) {
          broadcastToRoom(currentClient.docId, {
            type: 'comments:update',
            comments,
          });
        }
        return;
      }

      if (msg.type === 'comment:toggle') {
        const comments = store.toggleComment(currentClient.docId, msg.commentId);
        if (comments) {
          broadcastToRoom(currentClient.docId, {
            type: 'comments:update',
            comments,
          });
        }
        return;
      }

      if (msg.type === 'comment:delete') {
        const comments = store.deleteComment(currentClient.docId, msg.commentId);
        if (comments) {
          broadcastToRoom(currentClient.docId, {
            type: 'comments:update',
            comments,
          });
        }
        return;
      }

      if (msg.type === 'snapshot:create') {
        const snapshots = store.createSnapshot(currentClient.docId, msg.label, currentClient.name);
        if (snapshots) {
          broadcastToRoom(currentClient.docId, {
            type: 'snapshots:update',
            snapshots,
          });
        }
        return;
      }

      if (msg.type === 'snapshot:restore') {
        const doc = store.restoreSnapshot(currentClient.docId, msg.snapshotId);
        if (doc) {
          broadcastToRoom(currentClient.docId, {
            type: 'doc:replaced',
            document: doc,
            checksum: computeChecksum(doc.content),
            actorName: currentClient.name,
          });
        }
      }
    });

    ws.on('close', () => {
      if (currentClient) {
        const clients = getRoomClients(currentClient.docId);
        clients.delete(currentClient);
        broadcastToRoom(currentClient.docId, {
          type: 'presence:update',
          presence: getPresenceList(currentClient.docId),
        });
      }
    });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`VibePress Studio server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
