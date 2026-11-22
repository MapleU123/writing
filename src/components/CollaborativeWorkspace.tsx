import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  History,
  MessageSquare,
  Mic,
  MicOff,
  Moon,
  Plus,
  RotateCcw,
  Sparkles,
  Sun,
  Trash2,
  User,
  X,
} from 'lucide-react';
import {
  applyOp,
  computeChecksum,
  computeSingleOp,
  transformCursor,
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
} from '../shared/ot';
import { ManuscriptEditor } from './ManuscriptEditor';
import { PlatformPreview } from './PlatformPreview';

interface CollaborativeWorkspaceProps {
  docId: string;
  documents: DocumentSummary[];
  onSwitchDocument: (docId: string) => void;
  onCreateDocument: (payload: {
    title: string;
    subtitle: string;
    platformPreset: PlatformPreset;
  }) => Promise<void>;
  onRefreshDocuments: () => void;
}

const INK_COLORS = [
  { name: '朱砂红', hex: '#C83E2B' },
  { name: '钴蓝', hex: '#2563EB' },
  { name: '松烟绿', hex: '#15803D' },
  { name: '赭石黄', hex: '#B45309' },
  { name: '紫檀', hex: '#7E22CE' },
];

type ViewMode = 'split' | 'write' | 'preview';
type SidePanel = 'none' | 'comments' | 'snapshots' | 'editorial';
type RefinePassMode = 'pass1-structure' | 'pass2-deai' | 'pass3-rhythm' | 'custom';

function getTabIdentity() {
  let clientId = sessionStorage.getItem('vibepress_client_id');
  if (!clientId) {
    clientId = `u-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem('vibepress_client_id', clientId);
  }
  let name = sessionStorage.getItem('vibepress_user_name');
  if (!name) {
    name = `作者 ${clientId.slice(-3).toUpperCase()}`;
    sessionStorage.setItem('vibepress_user_name', name);
  }
  let color = sessionStorage.getItem('vibepress_user_color');
  if (!color) {
    color = INK_COLORS[Math.floor(Math.random() * INK_COLORS.length)].hex;
    sessionStorage.setItem('vibepress_user_color', color);
  }
  return { clientId, name, color };
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export const CollaborativeWorkspace: React.FC<CollaborativeWorkspaceProps> = ({
  docId,
  documents,
  onSwitchDocument,
  onCreateDocument,
  onRefreshDocuments,
}) => {
  const [identity, setIdentity] = useState(getTabIdentity);
  const [showProfilePopover, setShowProfilePopover] = useState(false);
  const [draftName, setDraftName] = useState(identity.name);

  // Document state synced with server
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [content, setContent] = useState('');
  const [platformPreset, setPlatformPreset] = useState<PlatformPreset>('wechat');
  const [themeStyle, setThemeStyle] = useState<ThemePreset>('paper');
  const [version, setVersion] = useState(1);
  const [comments, setComments] = useState<DocComment[]>([]);
  const [snapshots, setSnapshots] = useState<DocSnapshot[]>([]);
  const [presence, setPresence] = useState<CollaboratorPresence[]>([]);

  // Connection & UI controls
  const [connState, setConnState] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting');
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [darkWorkspace, setDarkWorkspace] = useState(false);
  const [sidePanel, setSidePanel] = useState<SidePanel>('none');
  const [copiedLink, setCopiedLink] = useState(false);

  // New Document Modal
  const [showNewDocModal, setShowNewDocModal] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocPlatform, setNewDocPlatform] = useState<PlatformPreset>('wechat');
  const [creatingDoc, setCreatingDoc] = useState(false);

  // Comments Drawer State
  const [commentQuote, setCommentQuote] = useState('');
  const [commentBody, setCommentBody] = useState('');

  // Snapshots Drawer State
  const [snapshotLabel, setSnapshotLabel] = useState('');

  // Editorial 3-Pass Gemini Assistant State
  const [refineMode, setRefineMode] = useState<RefinePassMode>('pass2-deai');
  const [customInstruction, setCustomInstruction] = useState('');
  const [refining, setRefining] = useState(false);
  const [refinedResult, setRefinedResult] = useState<string | null>(null);
  const [refineError, setRefineError] = useState<string | null>(null);

  // Voice Dictation State
  const [dictating, setDictating] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const speechRecRef = useRef<SpeechRecognitionLike | null>(null);

  // OT Client Refs
  const wsRef = useRef<WebSocket | null>(null);
  const serverVersionRef = useRef<number>(1);
  const localContentRef = useRef<string>('');
  const inFlightOpRef = useRef<{ opId: string; op: TextOperation } | null>(null);
  const pendingOpsRef = useRef<TextOperation[]>([]);
  const cursorRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const pendingCursorRestoreRef = useRef<{ start: number; end: number } | null>(null);
  const lastCursorSentRef = useRef<number>(0);

  const sendWsMessage = useCallback((msg: WsClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const flushNextPendingOp = useCallback(() => {
    if (inFlightOpRef.current || pendingOpsRef.current.length === 0) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const nextOp = pendingOpsRef.current.shift();
    if (!nextOp) return;

    const opId = `${identity.clientId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    inFlightOpRef.current = { opId, op: nextOp };

    ws.send(
      JSON.stringify({
        type: 'doc:op',
        docId,
        opId,
        baseVersion: serverVersionRef.current,
        op: nextOp,
        cursorStart: cursorRef.current.start,
        cursorEnd: cursorRef.current.end,
      } satisfies WsClientMessage)
    );
  }, [docId, identity.clientId]);

  // Connect & sync WebSocket when docId changes
  useEffect(() => {
    let closedByEffect = false;
    let reconnectTimer: number | null = null;
    let backoffMs = 1000;

    setConnState('connecting');
    inFlightOpRef.current = null;
    pendingOpsRef.current = [];
    setRefinedResult(null);
    setRefineError(null);

    const connect = () => {
      if (closedByEffect) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        backoffMs = 1000;
        setConnState('connected');
        ws.send(
          JSON.stringify({
            type: 'join',
            docId,
            clientId: identity.clientId,
            name: identity.name,
            color: identity.color,
          } satisfies WsClientMessage)
        );
      };

      ws.onmessage = (event) => {
        let msg: WsServerMessage;
        try {
          msg = JSON.parse(event.data) as WsServerMessage;
        } catch {
          return;
        }

        if (msg.type === 'doc:init') {
          const doc: CollaborativeDocument = msg.document;
          serverVersionRef.current = doc.version;
          localContentRef.current = doc.content;
          inFlightOpRef.current = null;
          pendingOpsRef.current = [];

          setTitle(doc.title);
          setSubtitle(doc.subtitle);
          setContent(doc.content);
          setPlatformPreset(doc.platformPreset);
          setThemeStyle(doc.themeStyle);
          setVersion(doc.version);
          setComments(doc.comments);
          setSnapshots(doc.snapshots);
          setPresence(msg.presence);
          return;
        }

        if (msg.type === 'doc:ack') {
          if (inFlightOpRef.current && inFlightOpRef.current.opId === msg.opId) {
            serverVersionRef.current = msg.version;
            setVersion(msg.version);
            inFlightOpRef.current = null;

            if (pendingOpsRef.current.length > 0) {
              flushNextPendingOp();
            } else if (computeChecksum(localContentRef.current) !== msg.checksum) {
              sendWsMessage({ type: 'doc:resync', docId });
            }
          }
          return;
        }

        if (msg.type === 'doc:op') {
          let r = msg.op;

          if (inFlightOpRef.current) {
            const nextInFlight = transformOp(inFlightOpRef.current.op, r, 'right');
            r = transformOp(r, inFlightOpRef.current.op, 'left');
            inFlightOpRef.current = { ...inFlightOpRef.current, op: nextInFlight };
          }

          for (let i = 0; i < pendingOpsRef.current.length; i++) {
            const p = pendingOpsRef.current[i];
            const nextP = transformOp(p, r, 'right');
            r = transformOp(r, p, 'left');
            pendingOpsRef.current[i] = nextP;
          }

          serverVersionRef.current = msg.version;
          setVersion(msg.version);

          const updated = applyOp(localContentRef.current, r);
          localContentRef.current = updated;

          // Preserve local cursor without jumping
          const nextStart = transformCursor(cursorRef.current.start, r);
          const nextEnd = transformCursor(cursorRef.current.end, r);
          cursorRef.current = { start: nextStart, end: nextEnd };
          pendingCursorRestoreRef.current = { start: nextStart, end: nextEnd };

          setContent(updated);

          // Shift collaborator cursors locally until their next cursor packet
          setPresence((prev) =>
            prev.map((p) =>
              p.clientId === msg.clientId
                ? p
                : {
                    ...p,
                    cursorStart: transformCursor(p.cursorStart, r),
                    cursorEnd: transformCursor(p.cursorEnd, r),
                  }
            )
          );

          if (
            !inFlightOpRef.current &&
            pendingOpsRef.current.length === 0 &&
            computeChecksum(updated) !== msg.checksum
          ) {
            sendWsMessage({ type: 'doc:resync', docId });
          }
          return;
        }

        if (msg.type === 'doc:meta') {
          setTitle(msg.title);
          setSubtitle(msg.subtitle);
          setPlatformPreset(msg.platformPreset);
          setThemeStyle(msg.themeStyle);
          return;
        }

        if (msg.type === 'doc:replaced') {
          const doc = msg.document;
          serverVersionRef.current = doc.version;
          localContentRef.current = doc.content;
          inFlightOpRef.current = null;
          pendingOpsRef.current = [];

          setTitle(doc.title);
          setSubtitle(doc.subtitle);
          setContent(doc.content);
          setVersion(doc.version);
          setSnapshots(doc.snapshots);
          setSyncNotice(`${msg.actorName} 恢复了历史版本快照`);
          window.setTimeout(() => setSyncNotice(null), 3200);
          return;
        }

        if (msg.type === 'presence:update') {
          setPresence(msg.presence);
          return;
        }

        if (msg.type === 'cursor:update') {
          setPresence((prev) =>
            prev.map((p) =>
              p.clientId === msg.clientId
                ? { ...p, cursorStart: msg.cursorStart, cursorEnd: msg.cursorEnd }
                : p
            )
          );
          return;
        }

        if (msg.type === 'comments:update') {
          setComments(msg.comments);
          return;
        }

        if (msg.type === 'snapshots:update') {
          setSnapshots(msg.snapshots);
          return;
        }

        if (msg.type === 'error') {
          setSyncNotice(msg.message);
          window.setTimeout(() => setSyncNotice(null), 3500);
        }
      };

      ws.onclose = () => {
        if (closedByEffect) return;
        setConnState('reconnecting');
        reconnectTimer = window.setTimeout(() => {
          backoffMs = Math.min(8000, backoffMs * 1.6);
          connect();
        }, backoffMs);
      };
    };

    connect();

    return () => {
      closedByEffect = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [docId, flushNextPendingOp, identity.clientId, sendWsMessage]);

  // Propagate profile update without dropping socket
  const saveProfile = (nextName: string, nextColor: string) => {
    const cleanName = nextName.trim() || identity.name;
    sessionStorage.setItem('vibepress_user_name', cleanName);
    sessionStorage.setItem('vibepress_user_color', nextColor);
    setIdentity((prev) => ({ ...prev, name: cleanName, color: nextColor }));
    sendWsMessage({
      type: 'profile:update',
      docId,
      name: cleanName,
      color: nextColor,
    });
    setShowProfilePopover(false);
  };

  // Local content edits -> OT delta -> Server
  const handleLocalContentChange = (nextText: string) => {
    const op = computeSingleOp(localContentRef.current, nextText);
    if (!op) return;

    localContentRef.current = nextText;
    setContent(nextText);
    pendingOpsRef.current.push(op);
    flushNextPendingOp();
  };

  const handleCursorChange = (start: number, end: number) => {
    cursorRef.current = { start, end };
    const now = Date.now();
    if (now - lastCursorSentRef.current > 45) {
      lastCursorSentRef.current = now;
      sendWsMessage({
        type: 'cursor:update',
        docId,
        cursorStart: start,
        cursorEnd: end,
      });
    }
  };

  const handleMetaUpdate = (patch: {
    title?: string;
    subtitle?: string;
    platformPreset?: PlatformPreset;
    themeStyle?: ThemePreset;
  }) => {
    if (patch.title !== undefined) setTitle(patch.title);
    if (patch.subtitle !== undefined) setSubtitle(patch.subtitle);
    if (patch.platformPreset !== undefined) setPlatformPreset(patch.platformPreset);
    if (patch.themeStyle !== undefined) setThemeStyle(patch.themeStyle);
    sendWsMessage({
      type: 'doc:meta',
      docId,
      ...patch,
    });
  };

  const handleCopyInviteLink = async () => {
    const shareUrl = `${window.location.origin}/?doc=${encodeURIComponent(docId)}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      setSyncNotice(`协作链接：${shareUrl}`);
    }
  };

  const handleDownloadMarkdown = () => {
    const md = `# ${title}\n\n${subtitle ? `> ${subtitle}\n\n` : ''}${content}`;
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${docId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Voice Dictation (Web Speech API)
  const toggleVoiceDictation = () => {
    if (dictating && speechRecRef.current) {
      speechRecRef.current.stop();
      setDictating(false);
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRec) {
      setVoiceNotice('当前浏览器不支持原生语音识别，建议使用桌面端 Chrome / Edge 体验语音速记。');
      window.setTimeout(() => setVoiceNotice(null), 4000);
      return;
    }

    const rec = new SpeechRec();
    rec.lang = 'zh-CN';
    rec.continuous = true;
    rec.interimResults = false;

    rec.onresult = (ev) => {
      let spoken = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) {
          spoken += ev.results[i][0].transcript;
        }
      }
      if (spoken.trim()) {
        const cur = localContentRef.current;
        const pos = Math.max(0, Math.min(cursorRef.current.start, cur.length));
        const insertStr = (pos > 0 && cur[pos - 1] !== '\n' ? ' ' : '') + spoken.trim();
        const nextText = cur.slice(0, pos) + insertStr + cur.slice(pos);
        const nextPos = pos + insertStr.length;
        pendingCursorRestoreRef.current = { start: nextPos, end: nextPos };
        cursorRef.current = { start: nextPos, end: nextPos };
        handleLocalContentChange(nextText);
      }
    };

    rec.onerror = (ev) => {
      setDictating(false);
      setVoiceNotice(`语音识别已停止（${ev.error}）`);
      window.setTimeout(() => setVoiceNotice(null), 3500);
    };

    rec.onend = () => {
      setDictating(false);
    };

    try {
      rec.start();
      speechRecRef.current = rec;
      setDictating(true);
    } catch {
      setDictating(false);
    }
  };

  // Server-side 3-Pass Editorial Refine
  const handleRunEditorialRefine = async () => {
    if (!content.trim()) {
      setRefineError('请先输入一些草稿或语音速记文本。');
      return;
    }
    setRefining(true);
    setRefineError(null);
    try {
      const resp = await fetch('/api/editorial/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          passMode: refineMode,
          customInstruction,
        }),
      });
      const data = (await resp.json()) as { refinedText?: string; error?: string };
      if (!resp.ok || !data.refinedText) {
        setRefineError(data.error || '精修失败，请稍后重试。');
        return;
      }
      setRefinedResult(data.refinedText);
    } catch (err) {
      setRefineError(err instanceof Error ? err.message : '网络请求失败');
    } finally {
      setRefining(false);
    }
  };

  const applyRefinedTextToDoc = () => {
    if (!refinedResult) return;
    handleLocalContentChange(refinedResult);
    setRefinedResult(null);
    setSyncNotice('已将精修稿同步至当前协作房间');
    window.setTimeout(() => setSyncNotice(null), 2500);
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    sendWsMessage({
      type: 'comment:add',
      docId,
      quote: commentQuote.trim(),
      body: commentBody.trim(),
    });
    setCommentQuote('');
    setCommentBody('');
  };

  const handleCreateSnapshot = (e: React.FormEvent) => {
    e.preventDefault();
    sendWsMessage({
      type: 'snapshot:create',
      docId,
      label: snapshotLabel.trim() || `手稿检查点 v${version}`,
    });
    setSnapshotLabel('');
  };

  const handleCreateNewDocSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocTitle.trim()) return;
    setCreatingDoc(true);
    try {
      await onCreateDocument({
        title: newDocTitle.trim(),
        subtitle: '',
        platformPreset: newDocPlatform,
      });
      setNewDocTitle('');
      setShowNewDocModal(false);
      onRefreshDocuments();
    } finally {
      setCreatingDoc(false);
    }
  };

  const openCommentsCount = comments.filter((c) => !c.resolved).length;
  const shareUrl = `/?doc=${encodeURIComponent(docId)}`;

  return (
    <div
      className={`min-h-[calc(100vh-4rem)] transition-colors ${
        darkWorkspace
          ? 'dark bg-[#111214] text-[#F4F3EF]'
          : 'bg-[#F4F3EE] text-[#141413]'
      }`}
    >
      {/* Workspace Action Toolbar (below Header Top Bar) */}
      <div
        className={`border-b px-4 sm:px-6 lg:px-10 py-3 ${
          darkWorkspace
            ? 'border-[#27272A] bg-[#16171A]'
            : 'border-[#E5E3DC] bg-[#FAFAF8]'
        }`}
      >
        <div className="mx-auto max-w-[1400px] flex flex-wrap items-center justify-between gap-3">
          {/* Left: Document Switcher + New Doc + Real WebSocket Connection Telemetry */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label="切换协作文档"
              value={docId}
              onChange={(e) => onSwitchDocument(e.target.value)}
              className={`max-w-[240px] rounded-lg border px-3 py-1.5 text-xs font-medium focus:outline-none ${
                darkWorkspace
                  ? 'border-[#323238] bg-[#1E1F24] text-[#F4F3EF]'
                  : 'border-[#D4D1C7] bg-white text-[#141413]'
              }`}
            >
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setShowNewDocModal(true)}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${
                darkWorkspace
                  ? 'border-[#323238] bg-[#1E1F24] hover:border-[#F4F3EF]'
                  : 'border-[#D4D1C7] bg-white hover:border-[#141413]'
              }`}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>新建</span>
            </button>

            {/* Real Live WebSocket Connection State */}
            <div className="flex items-center gap-1.5 text-xs text-[#6B6962] dark:text-[#A1A1AA] whitespace-nowrap">
              <span
                className={`h-2 w-2 rounded-full ${
                  connState === 'connected'
                    ? 'bg-[#16A34A]'
                    : connState === 'reconnecting'
                    ? 'bg-[#D97706] animate-pulse'
                    : 'bg-[#9CA3AF]'
                }`}
              />
              <span>
                {connState === 'connected'
                  ? `已实时同步 · ${presence.length} 人在线`
                  : connState === 'reconnecting'
                  ? '正在重新连接...'
                  : '正在接入房间...'}
              </span>
            </div>
          </div>

          {/* Center: View Mode & Platform Switcher */}
          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`flex items-center gap-1 p-1 rounded-lg border ${
                darkWorkspace
                  ? 'border-[#2B2C32] bg-[#111214]'
                  : 'border-[#E5E3DC] bg-[#EFECE4]'
              }`}
            >
              {(
                [
                  { key: 'write', label: '纯粹写作' },
                  { key: 'split', label: '双栏对照' },
                  { key: 'preview', label: '排版预览' },
                ] as const
              ).map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setViewMode(m.key)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    viewMode === m.key
                      ? darkWorkspace
                        ? 'bg-[#25262C] text-white'
                        : 'bg-white text-[#141413] shadow-xs'
                      : 'text-[#6B6962] dark:text-[#A1A1AA] hover:text-current'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <select
              aria-label="排版平台预设"
              value={platformPreset}
              onChange={(e) =>
                handleMetaUpdate({ platformPreset: e.target.value as PlatformPreset })
              }
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium focus:outline-none ${
                darkWorkspace
                  ? 'border-[#323238] bg-[#1E1F24] text-[#F4F3EF]'
                  : 'border-[#D4D1C7] bg-white text-[#141413]'
              }`}
            >
              <option value="wechat">公众号长文</option>
              <option value="xiaohongshu">小红书 3:4 卡片</option>
              <option value="newsletter">独立通讯专栏</option>
            </select>

            <select
              aria-label="预览纸张风格"
              value={themeStyle}
              onChange={(e) => handleMetaUpdate({ themeStyle: e.target.value as ThemePreset })}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium focus:outline-none ${
                darkWorkspace
                  ? 'border-[#323238] bg-[#1E1F24] text-[#F4F3EF]'
                  : 'border-[#D4D1C7] bg-white text-[#141413]'
              }`}
            >
              <option value="paper">素纸白</option>
              <option value="linen">暖麻米</option>
              <option value="ink">深墨夜</option>
            </select>
          </div>

          {/* Right: Presence Profile, Share, Tools */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Active Collaborators & Self Identity Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setDraftName(identity.name);
                  setShowProfilePopover((v) => !v);
                }}
                className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer ${
                  darkWorkspace
                    ? 'border-[#323238] bg-[#1E1F24] hover:border-[#F4F3EF]'
                    : 'border-[#D4D1C7] bg-white hover:border-[#141413]'
                }`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: identity.color }}
                />
                <User className="h-3.5 w-3.5 opacity-60" />
                <span className="max-w-[90px] truncate">{identity.name}</span>
              </button>

              {showProfilePopover && (
                <div
                  className={`absolute right-0 mt-2 w-64 rounded-xl border p-4 shadow-lg z-40 ${
                    darkWorkspace
                      ? 'border-[#323238] bg-[#1A1B1F] text-[#F4F3EF]'
                      : 'border-[#E5E3DC] bg-white text-[#141413]'
                  }`}
                >
                  <p className="text-xs font-semibold">设置协作者署名与光标色</p>
                  <input
                    type="text"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    maxLength={24}
                    className={`mt-2.5 w-full rounded-lg border px-3 py-1.5 text-xs focus:outline-none ${
                      darkWorkspace
                        ? 'border-[#323238] bg-[#111214]'
                        : 'border-[#D4D1C7] bg-[#FAFAF8]'
                    }`}
                  />
                  <div className="mt-3 flex items-center gap-2">
                    {INK_COLORS.map((c) => (
                      <button
                        key={c.hex}
                        type="button"
                        title={c.name}
                        onClick={() => saveProfile(draftName, c.hex)}
                        className={`h-6 w-6 rounded-full cursor-pointer transition-transform ${
                          identity.color === c.hex ? 'ring-2 ring-offset-2 ring-[#141413] scale-110' : ''
                        }`}
                        style={{ backgroundColor: c.hex }}
                      />
                    ))}
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowProfilePopover(false)}
                      className="text-xs opacity-60 hover:opacity-100 cursor-pointer"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => saveProfile(draftName, identity.color)}
                      className="rounded-md bg-[#141413] px-3 py-1 text-xs font-medium text-white dark:bg-[#F4F3EF] dark:text-[#141413] cursor-pointer"
                    >
                      保存
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Copy Invite Link */}
            <button
              type="button"
              onClick={handleCopyInviteLink}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${
                darkWorkspace
                  ? 'border-[#323238] bg-[#1E1F24] hover:border-[#F4F3EF]'
                  : 'border-[#D4D1C7] bg-white hover:border-[#141413]'
              }`}
            >
              {copiedLink ? <Check className="h-3.5 w-3.5 text-[#16A34A]" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedLink ? '已复制链接' : '邀请协作'}</span>
            </button>

            {/* Open Second Tab Link (no window.open) */}
            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="在新标签页打开同一文档，立即实测双人实时同屏同步"
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                darkWorkspace
                  ? 'border-[#323238] bg-[#1E1F24] hover:border-[#F4F3EF]'
                  : 'border-[#D4D1C7] bg-white hover:border-[#141413]'
              }`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">新窗口同屏</span>
            </a>

            {/* Voice Dictation */}
            <button
              type="button"
              onClick={toggleVoiceDictation}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${
                dictating
                  ? 'border-[#C83E2B] bg-[#C83E2B] text-white'
                  : darkWorkspace
                  ? 'border-[#323238] bg-[#1E1F24] hover:border-[#F4F3EF]'
                  : 'border-[#D4D1C7] bg-white hover:border-[#141413]'
              }`}
            >
              {dictating ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              <span>{dictating ? '停止速记' : '语音速记'}</span>
            </button>

            {/* 3-Pass AI Refine Drawer Toggle */}
            <button
              type="button"
              onClick={() => setSidePanel((p) => (p === 'editorial' ? 'none' : 'editorial'))}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${
                sidePanel === 'editorial'
                  ? 'bg-[#C83E2B] text-white'
                  : 'bg-[#141413] text-white hover:bg-[#C83E2B] dark:bg-[#F4F3EF] dark:text-[#141413]'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>三轮精修</span>
            </button>

            {/* Comments Drawer Toggle */}
            <button
              type="button"
              onClick={() => setSidePanel((p) => (p === 'comments' ? 'none' : 'comments'))}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${
                sidePanel === 'comments'
                  ? 'border-[#C83E2B] text-[#C83E2B]'
                  : darkWorkspace
                  ? 'border-[#323238] bg-[#1E1F24]'
                  : 'border-[#D4D1C7] bg-white'
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="font-mono-tabular">{openCommentsCount}</span>
            </button>

            {/* Snapshots Drawer Toggle */}
            <button
              type="button"
              onClick={() => setSidePanel((p) => (p === 'snapshots' ? 'none' : 'snapshots'))}
              title="历史快照"
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${
                sidePanel === 'snapshots'
                  ? 'border-[#C83E2B] text-[#C83E2B]'
                  : darkWorkspace
                  ? 'border-[#323238] bg-[#1E1F24]'
                  : 'border-[#D4D1C7] bg-white'
              }`}
            >
              <History className="h-3.5 w-3.5" />
              <span className="font-mono-tabular">{snapshots.length}</span>
            </button>

            {/* Export Markdown */}
            <button
              type="button"
              onClick={handleDownloadMarkdown}
              title="导出 Markdown"
              className={`flex h-8 w-8 items-center justify-center rounded-lg border cursor-pointer transition-colors ${
                darkWorkspace
                  ? 'border-[#323238] bg-[#1E1F24] hover:border-[#F4F3EF]'
                  : 'border-[#D4D1C7] bg-white hover:border-[#141413]'
              }`}
            >
              <Download className="h-3.5 w-3.5" />
            </button>

            {/* Workspace Dark/Light Toggle */}
            <button
              type="button"
              onClick={() => setDarkWorkspace((d) => !d)}
              title="切换工作台昼夜主题"
              className={`flex h-8 w-8 items-center justify-center rounded-lg border cursor-pointer transition-colors ${
                darkWorkspace
                  ? 'border-[#323238] bg-[#1E1F24] hover:border-[#F4F3EF]'
                  : 'border-[#D4D1C7] bg-white hover:border-[#141413]'
              }`}
            >
              {darkWorkspace ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Inline Notification Banner if any */}
      {(syncNotice || voiceNotice) && (
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-10 pt-3">
          <div className="rounded-lg border border-[#C83E2B]/30 bg-[#C83E2B]/10 px-4 py-2 text-xs text-[#C83E2B] flex items-center justify-between">
            <span>{syncNotice || voiceNotice}</span>
            <button
              type="button"
              onClick={() => {
                setSyncNotice(null);
                setVoiceNotice(null);
              }}
              className="cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Split Workspace + Optional Side Drawer */}
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-10 py-6">
        <div className="flex flex-col lg:flex-row gap-6 items-stretch min-h-[calc(100vh-11rem)]">
          {/* Editor Pane */}
          {viewMode !== 'preview' && (
            <div className={viewMode === 'split' ? 'flex-1 min-w-0' : 'mx-auto w-full max-w-[820px] flex-1'}>
              <ManuscriptEditor
                title={title}
                subtitle={subtitle}
                content={content}
                version={version}
                selfClientId={identity.clientId}
                presence={presence}
                darkWorkspace={darkWorkspace}
                onTitleChange={(t) => handleMetaUpdate({ title: t })}
                onSubtitleChange={(s) => handleMetaUpdate({ subtitle: s })}
                onContentChange={handleLocalContentChange}
                onCursorChange={handleCursorChange}
                onSelectQuoteForComment={(quote) => {
                  setCommentQuote(quote);
                  setSidePanel('comments');
                }}
                pendingCursorRestoreRef={pendingCursorRestoreRef}
              />
            </div>
          )}

          {/* Live Platform Preview Pane */}
          {viewMode !== 'write' && (
            <div
              className={`${
                viewMode === 'split' ? 'lg:w-[460px] xl:w-[500px] shrink-0' : 'flex-1'
              } rounded-2xl border p-5 sm:p-6 overflow-y-auto ${
                darkWorkspace
                  ? 'border-[#2B2C32] bg-[#16171B]'
                  : 'border-[#E5E3DC] bg-[#ECEAE2]/65'
              }`}
            >
              <PlatformPreview
                title={title}
                subtitle={subtitle}
                content={content}
                platformPreset={platformPreset}
                themeStyle={themeStyle}
                authorName={identity.name}
              />
            </div>
          )}

          {/* Slide-Over Side Drawer (Editorial Refine / Comments / Snapshots) */}
          {sidePanel !== 'none' && (
            <aside
              className={`w-full lg:w-[360px] shrink-0 rounded-2xl border p-5 flex flex-col max-h-[calc(100vh-11rem)] overflow-y-auto ${
                darkWorkspace
                  ? 'border-[#2B2C32] bg-[#18191D]'
                  : 'border-[#E5E3DC] bg-white'
              }`}
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#E5E3DC] dark:border-[#2B2C32]">
                <h2 className="font-editorial text-base font-semibold">
                  {sidePanel === 'editorial'
                    ? '三轮去味精修台'
                    : sidePanel === 'comments'
                    ? '页边批注与讨论'
                    : '版本历史快照'}
                </h2>
                <button
                  type="button"
                  onClick={() => setSidePanel('none')}
                  className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* 1. Editorial 3-Pass Drawer */}
              {sidePanel === 'editorial' && (
                <div className="mt-4 flex flex-col gap-4 flex-1">
                  <p className="text-xs leading-relaxed opacity-70">
                    基于 Vibe Writing 编辑流，保留你的口述细节与真实声线，渐进剥离生硬模板腔。
                  </p>
                  <div className="space-y-2">
                    {(
                      [
                        { id: 'pass1-structure', label: 'Pass 1 · 碎片结构化', desc: '梳理自然段落与小标题，保留口语现场感' },
                        { id: 'pass2-deai', label: 'Pass 2 · 剥离机器腔', desc: '删掉套话连接词，换成有呼吸感的短句' },
                        { id: 'pass3-rhythm', label: 'Pass 3 · 节奏与金句', desc: '提炼核心引用块，适配长文与卡片阅读' },
                        { id: 'custom', label: '自定义编辑指令', desc: '输入你想调整的语气、受众或篇幅要求' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setRefineMode(m.id)}
                        className={`w-full text-left rounded-lg border p-3 transition-colors cursor-pointer ${
                          refineMode === m.id
                            ? 'border-[#C83E2B] bg-[#C83E2B]/5'
                            : 'border-[#E5E3DC] dark:border-[#2B2C32]'
                        }`}
                      >
                        <div className="text-xs font-semibold">{m.label}</div>
                        <div className="mt-0.5 text-[11px] opacity-65">{m.desc}</div>
                      </button>
                    ))}
                  </div>

                  {refineMode === 'custom' && (
                    <textarea
                      value={customInstruction}
                      onChange={(e) => setCustomInstruction(e.target.value)}
                      rows={3}
                      placeholder="例如：改写成更松弛的夜话随笔语气，适合发小红书..."
                      className="w-full rounded-lg border border-[#D4D1C7] dark:border-[#323238] bg-transparent p-2.5 text-xs focus:outline-none"
                    />
                  )}

                  <button
                    type="button"
                    onClick={handleRunEditorialRefine}
                    disabled={refining}
                    className="w-full rounded-lg bg-[#141413] dark:bg-[#F4F3EF] dark:text-[#141413] py-2.5 text-xs font-medium text-white hover:bg-[#C83E2B] dark:hover:bg-[#C83E2B] dark:hover:text-white disabled:opacity-50 cursor-pointer transition-colors"
                  >
                    {refining ? '正在精修推敲...' : '执行本轮精修'}
                  </button>

                  {refineError && (
                    <div className="rounded-lg border border-[#C83E2B]/40 bg-[#C83E2B]/10 p-3 text-xs text-[#C83E2B] leading-relaxed">
                      {refineError}
                    </div>
                  )}

                  {refinedResult && (
                    <div className="mt-1 flex flex-col gap-3">
                      <div className="flex items-center justify-between text-xs font-semibold text-[#C83E2B]">
                        <span>精修预览稿</span>
                        <button
                          type="button"
                          onClick={() => setRefinedResult(null)}
                          className="text-[11px] opacity-65 hover:opacity-100 cursor-pointer"
                        >
                          丢弃
                        </button>
                      </div>
                      <div className="max-h-64 overflow-y-auto rounded-lg border border-[#E5E3DC] dark:border-[#2B2C32] bg-[#FAFAF8] dark:bg-[#111214] p-3 text-xs leading-relaxed whitespace-pre-wrap">
                        {refinedResult}
                      </div>
                      <button
                        type="button"
                        onClick={applyRefinedTextToDoc}
                        className="w-full rounded-lg bg-[#C83E2B] py-2 text-xs font-medium text-white hover:bg-[#A63120] cursor-pointer"
                      >
                        采纳并实时同步到文档
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 2. Margin Comments Drawer */}
              {sidePanel === 'comments' && (
                <div className="mt-4 flex flex-col gap-4 flex-1">
                  <form onSubmit={handleAddComment} className="space-y-2.5">
                    {commentQuote && (
                      <div className="flex items-start justify-between gap-2 rounded-lg border border-[#E5E3DC] dark:border-[#2B2C32] bg-black/[0.025] dark:bg-white/[0.03] px-3 py-2 text-[11px] italic">
                        <span className="line-clamp-2">“{commentQuote}”</span>
                        <button
                          type="button"
                          onClick={() => setCommentQuote('')}
                          className="shrink-0 opacity-60 hover:opacity-100 cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    <textarea
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      rows={3}
                      placeholder="写下你的修改建议或批注（所有在线协作者实时可见）..."
                      className="w-full rounded-lg border border-[#D4D1C7] dark:border-[#323238] bg-transparent p-2.5 text-xs focus:outline-none focus:border-[#141413]"
                    />
                    <button
                      type="submit"
                      disabled={!commentBody.trim()}
                      className="w-full rounded-lg bg-[#141413] dark:bg-[#F4F3EF] dark:text-[#141413] py-2 text-xs font-medium text-white disabled:opacity-40 cursor-pointer"
                    >
                      发布实时批注
                    </button>
                  </form>

                  <div className="space-y-3 pt-2 border-t border-[#E5E3DC] dark:border-[#2B2C32]">
                    {comments.length === 0 ? (
                      <p className="text-xs opacity-60 text-center py-6">
                        暂无批注。在编辑器中选中任意文本即可针对性批注。
                      </p>
                    ) : (
                      comments.map((c) => (
                        <div
                          key={c.id}
                          className={`rounded-xl border p-3 text-xs transition-opacity ${
                            c.resolved
                              ? 'opacity-50 border-[#E5E3DC] dark:border-[#2B2C32]'
                              : 'border-[#E5E3DC] dark:border-[#2B2C32]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold flex items-center gap-1.5">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: c.color }}
                              />
                              <span>{c.author}</span>
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  sendWsMessage({
                                    type: 'comment:toggle',
                                    docId,
                                    commentId: c.id,
                                  })
                                }
                                className="text-[11px] hover:underline cursor-pointer"
                              >
                                {c.resolved ? '重新打开' : '标记已解决'}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  sendWsMessage({
                                    type: 'comment:delete',
                                    docId,
                                    commentId: c.id,
                                  })
                                }
                                className="opacity-50 hover:opacity-100 cursor-pointer"
                                title="删除批注"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                          {c.quote && (
                            <p className="mt-2 rounded bg-black/[0.03] dark:bg-white/[0.04] px-2 py-1 text-[11px] italic opacity-75">
                              “{c.quote}”
                            </p>
                          )}
                          <p className="mt-2 leading-relaxed">{c.body}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* 3. Version Snapshots Drawer */}
              {sidePanel === 'snapshots' && (
                <div className="mt-4 flex flex-col gap-4 flex-1">
                  <form onSubmit={handleCreateSnapshot} className="space-y-2.5">
                    <input
                      type="text"
                      value={snapshotLabel}
                      onChange={(e) => setSnapshotLabel(e.target.value)}
                      placeholder={`快照命名（如：Pass 2 定稿 v${version}）`}
                      className="w-full rounded-lg border border-[#D4D1C7] dark:border-[#323238] bg-transparent px-3 py-2 text-xs focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="w-full rounded-lg bg-[#141413] dark:bg-[#F4F3EF] dark:text-[#141413] py-2 text-xs font-medium text-white cursor-pointer"
                    >
                      保存当前版本快照
                    </button>
                  </form>

                  <div className="space-y-2.5 pt-2 border-t border-[#E5E3DC] dark:border-[#2B2C32]">
                    {snapshots.length === 0 ? (
                      <p className="text-xs opacity-60 text-center py-6">
                        还没有版本快照，重大改稿前建议先保存一个检查点。
                      </p>
                    ) : (
                      snapshots.map((s) => (
                        <div
                          key={s.id}
                          className="rounded-xl border border-[#E5E3DC] dark:border-[#2B2C32] p-3 text-xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-semibold">{s.label}</div>
                              <div className="mt-1 text-[11px] opacity-60 font-mono-tabular">
                                {s.author} · {s.wordCount} 字 · v{s.version}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                sendWsMessage({
                                  type: 'snapshot:restore',
                                  docId,
                                  snapshotId: s.id,
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-md border border-[#D4D1C7] dark:border-[#323238] px-2 py-1 text-[11px] hover:border-[#C83E2B] hover:text-[#C83E2B] cursor-pointer shrink-0"
                            >
                              <RotateCcw className="h-3 w-3" />
                              <span>恢复</span>
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </aside>
          )}
        </div>
      </div>

      {/* Create New Collaborative Document Modal */}
      {showNewDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className={`w-full max-w-md rounded-2xl border p-6 shadow-xl ${
              darkWorkspace
                ? 'border-[#323238] bg-[#18191D] text-[#F4F3EF]'
                : 'border-[#E5E3DC] bg-white text-[#141413]'
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-editorial text-lg font-semibold">新建实时协同文档</h3>
              <button
                type="button"
                onClick={() => setShowNewDocModal(false)}
                className="p-1 opacity-60 hover:opacity-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreateNewDocSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium opacity-75 mb-1.5">文章标题</label>
                <input
                  type="text"
                  value={newDocTitle}
                  onChange={(e) => setNewDocTitle(e.target.value)}
                  placeholder="例如：独立产品的设计手记"
                  required
                  className="w-full rounded-lg border border-[#D4D1C7] dark:border-[#323238] bg-transparent px-3 py-2 text-sm focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium opacity-75 mb-1.5">目标发布平台</label>
                <select
                  value={newDocPlatform}
                  onChange={(e) => setNewDocPlatform(e.target.value as PlatformPreset)}
                  className="w-full rounded-lg border border-[#D4D1C7] dark:border-[#323238] bg-transparent px-3 py-2 text-sm focus:outline-none"
                >
                  <option value="wechat">微信公众号长文</option>
                  <option value="xiaohongshu">小红书 3:4 图文卡片</option>
                  <option value="newsletter">独立通讯专栏</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewDocModal(false)}
                  className="rounded-lg border border-[#D4D1C7] dark:border-[#323238] px-4 py-2 text-xs font-medium cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creatingDoc || !newDocTitle.trim()}
                  className="rounded-lg bg-[#C83E2B] px-4 py-2 text-xs font-medium text-white hover:bg-[#A63120] disabled:opacity-50 cursor-pointer"
                >
                  {creatingDoc ? '创建中...' : '创建并进入'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
