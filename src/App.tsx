import { useCallback, useEffect, useState } from 'react';
import type { CollaborativeDocument, DocumentSummary, PlatformPreset } from './shared/ot';
import { TopBar } from './components/TopBar';
import { StudioLanding } from './components/StudioLanding';
import { CollaborativeWorkspace } from './components/CollaborativeWorkspace';

function getDocIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const doc = params.get('doc');
  return doc && doc.trim() ? doc.trim() : null;
}

export default function App() {
  const [activeDocId, setActiveDocId] = useState<string | null>(() => getDocIdFromUrl());
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [docsError, setDocsError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const resp = await fetch('/api/documents');
      if (!resp.ok) {
        throw new Error('无法加载协作文档列表');
      }
      const data = (await resp.json()) as { documents: DocumentSummary[] };
      setDocuments(data.documents ?? []);
      setDocsError(null);
    } catch (err) {
      setDocsError(err instanceof Error ? err.message : '加载文档失败');
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    const onPopState = () => {
      setActiveDocId(getDocIdFromUrl());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const openDocument = useCallback((docId: string) => {
    const nextUrl = `${window.location.pathname}?doc=${encodeURIComponent(docId)}`;
    window.history.pushState({ docId }, '', nextUrl);
    setActiveDocId(docId);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const navigateHome = useCallback(() => {
    window.history.pushState({}, '', window.location.pathname);
    setActiveDocId(null);
    fetchDocuments();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [fetchDocuments]);

  const navigateSection = useCallback(
    (sectionId: string) => {
      if (activeDocId) {
        window.history.pushState({}, '', window.location.pathname);
        setActiveDocId(null);
        fetchDocuments();
        window.setTimeout(() => {
          document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
        }, 60);
      } else {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
      }
    },
    [activeDocId, fetchDocuments]
  );

  const handleCreateDocument = useCallback(
    async (payload: { title: string; subtitle: string; platformPreset: PlatformPreset }) => {
      const resp = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await resp.json()) as { document?: CollaborativeDocument; error?: string };
      if (!resp.ok || !data.document) {
        throw new Error(data.error || '创建协作文档失败');
      }
      await fetchDocuments();
      openDocument(data.document.id);
    },
    [fetchDocuments, openDocument]
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAF8] text-[#141413]">
      <TopBar
        mode={activeDocId ? 'workspace' : 'landing'}
        onNavigateHome={navigateHome}
        onNavigateSection={navigateSection}
        onEnterWorkspace={() => {
          const targetId = documents[0]?.id ?? 'vibe-manifesto';
          openDocument(targetId);
        }}
      />

      {activeDocId ? (
        <CollaborativeWorkspace
          docId={activeDocId}
          documents={documents}
          onSwitchDocument={openDocument}
          onCreateDocument={handleCreateDocument}
          onRefreshDocuments={fetchDocuments}
        />
      ) : (
        <StudioLanding
          documents={documents}
          loadingDocs={loadingDocs}
          docsError={docsError}
          onOpenDocument={openDocument}
          onCreateDocument={handleCreateDocument}
        />
      )}
    </div>
  );
}
