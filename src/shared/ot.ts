export type PlatformPreset = 'wechat' | 'xiaohongshu' | 'newsletter';
export type ThemePreset = 'paper' | 'ink' | 'linen';

export interface TextOperation {
  pos: number;
  delLen: number;
  insStr: string;
}

export interface DocComment {
  id: string;
  author: string;
  color: string;
  quote: string;
  body: string;
  createdAt: number;
  resolved: boolean;
}

export interface DocSnapshot {
  id: string;
  label: string;
  author: string;
  createdAt: number;
  version: number;
  content: string;
  wordCount: number;
}

export interface CollaborativeDocument {
  id: string;
  title: string;
  subtitle: string;
  content: string;
  platformPreset: PlatformPreset;
  themeStyle: ThemePreset;
  version: number;
  updatedAt: number;
  comments: DocComment[];
  snapshots: DocSnapshot[];
}

export interface DocumentSummary {
  id: string;
  title: string;
  subtitle: string;
  platformPreset: PlatformPreset;
  version: number;
  updatedAt: number;
  wordCount: number;
  activeUsersCount: number;
  commentCount: number;
}

export interface CollaboratorPresence {
  clientId: string;
  name: string;
  color: string;
  cursorStart: number;
  cursorEnd: number;
  lastActiveAt: number;
}

export type WsClientMessage =
  | {
      type: 'join';
      docId: string;
      clientId: string;
      name: string;
      color: string;
    }
  | {
      type: 'profile:update';
      docId: string;
      name: string;
      color: string;
    }
  | {
      type: 'doc:op';
      docId: string;
      opId: string;
      baseVersion: number;
      op: TextOperation;
      cursorStart: number;
      cursorEnd: number;
    }
  | {
      type: 'doc:meta';
      docId: string;
      title?: string;
      subtitle?: string;
      platformPreset?: PlatformPreset;
      themeStyle?: ThemePreset;
    }
  | {
      type: 'cursor:update';
      docId: string;
      cursorStart: number;
      cursorEnd: number;
    }
  | {
      type: 'comment:add';
      docId: string;
      quote: string;
      body: string;
    }
  | {
      type: 'comment:toggle';
      docId: string;
      commentId: string;
    }
  | {
      type: 'comment:delete';
      docId: string;
      commentId: string;
    }
  | {
      type: 'snapshot:create';
      docId: string;
      label: string;
    }
  | {
      type: 'snapshot:restore';
      docId: string;
      snapshotId: string;
    }
  | {
      type: 'doc:resync';
      docId: string;
    };

export type WsServerMessage =
  | {
      type: 'doc:init';
      document: CollaborativeDocument;
      presence: CollaboratorPresence[];
      checksum: string;
    }
  | {
      type: 'doc:ack';
      opId: string;
      version: number;
      checksum: string;
    }
  | {
      type: 'doc:op';
      version: number;
      op: TextOperation;
      clientId: string;
      authorName: string;
      checksum: string;
      updatedAt: number;
    }
  | {
      type: 'doc:meta';
      title: string;
      subtitle: string;
      platformPreset: PlatformPreset;
      themeStyle: ThemePreset;
      updatedAt: number;
    }
  | {
      type: 'doc:replaced';
      document: CollaborativeDocument;
      checksum: string;
      actorName: string;
    }
  | {
      type: 'presence:update';
      presence: CollaboratorPresence[];
    }
  | {
      type: 'cursor:update';
      clientId: string;
      cursorStart: number;
      cursorEnd: number;
    }
  | {
      type: 'comments:update';
      comments: DocComment[];
    }
  | {
      type: 'snapshots:update';
      snapshots: DocSnapshot[];
    }
  | {
      type: 'error';
      message: string;
    };

export function applyOp(text: string, op: TextOperation): string {
  const pos = Math.max(0, Math.min(op.pos, text.length));
  const delLen = Math.max(0, Math.min(op.delLen, text.length - pos));
  return text.slice(0, pos) + op.insStr + text.slice(pos + delLen);
}

export function computeSingleOp(prev: string, next: string): TextOperation | null {
  if (prev === next) return null;
  const minLen = Math.min(prev.length, next.length);
  let prefix = 0;
  while (prefix < minLen && prev.charCodeAt(prefix) === next.charCodeAt(prefix)) {
    prefix++;
  }
  let suffix = 0;
  const maxSuffix = minLen - prefix;
  while (
    suffix < maxSuffix &&
    prev.charCodeAt(prev.length - 1 - suffix) === next.charCodeAt(next.length - 1 - suffix)
  ) {
    suffix++;
  }
  return {
    pos: prefix,
    delLen: prev.length - prefix - suffix,
    insStr: next.slice(prefix, next.length - suffix),
  };
}

/**
 * Transforms opA so it can be applied AFTER opB has already been applied.
 * priority='left' means opA wins ties at identical insertion points.
 */
export function transformOp(
  opA: TextOperation,
  opB: TextOperation,
  priority: 'left' | 'right' = 'right'
): TextOperation {
  const aStart = opA.pos;
  const aEnd = opA.pos + opA.delLen;
  const bStart = opB.pos;
  const bEnd = opB.pos + opB.delLen;
  const bDelta = opB.insStr.length - opB.delLen;

  // Tie at exact same point for pure insertions
  if (aStart === bStart && opA.delLen === 0 && opB.delLen === 0) {
    return {
      pos: priority === 'left' ? aStart : aStart + opB.insStr.length,
      delLen: 0,
      insStr: opA.insStr,
    };
  }

  // opA strictly before opB
  if (aEnd <= bStart) {
    return { ...opA };
  }

  // opA strictly after opB
  if (aStart >= bEnd) {
    return {
      pos: Math.max(0, aStart + bDelta),
      delLen: opA.delLen,
      insStr: opA.insStr,
    };
  }

  // Overlapping regions
  if (aStart >= bStart && aEnd <= bEnd) {
    // opA's deletion range was completely deleted by opB
    return {
      pos: priority === 'left' ? bStart : bStart + opB.insStr.length,
      delLen: 0,
      insStr: opA.insStr,
    };
  }

  if (aStart < bStart && aEnd <= bEnd) {
    // opA starts before opB and ends inside opB
    return {
      pos: aStart,
      delLen: bStart - aStart,
      insStr: opA.insStr,
    };
  }

  if (aStart >= bStart && aEnd > bEnd) {
    // opA starts inside opB and ends after opB
    return {
      pos: bStart + opB.insStr.length,
      delLen: aEnd - bEnd,
      insStr: opA.insStr,
    };
  }

  // opA completely encloses opB (aStart < bStart && aEnd > bEnd)
  return {
    pos: aStart,
    delLen: Math.max(0, opA.delLen + bDelta),
    insStr: opA.insStr,
  };
}

export function transformCursor(cursor: number, op: TextOperation): number {
  const opEnd = op.pos + op.delLen;
  if (cursor <= op.pos) {
    return cursor;
  }
  if (cursor >= opEnd) {
    return Math.max(0, cursor + (op.insStr.length - op.delLen));
  }
  // Cursor was inside deleted range -> snap to end of inserted text
  return op.pos + op.insStr.length;
}

export function computeChecksum(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  // Count CJK characters + non-CJK word tokens
  const cjkMatches = trimmed.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  const nonCjk = trimmed.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ').trim();
  const latinWords = nonCjk ? nonCjk.split(/\s+/).filter(Boolean).length : 0;
  return cjkCount + latinWords;
}
