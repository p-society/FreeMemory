import { useState, useEffect } from 'react';
import { CanvasGraph } from './CanvasGraph';

interface Chat {
  chatId: string;
  count: number;
}

interface Sector {
  id: string;
  name: string;
  topics: string[];
  memoryCount: number;
  averageStrength: number;
}

interface MemoryNode {
  id: string;
  content: string;
  embeddingId: number | null;
  userId: string;
  chatId: string;
  userType: string;
  strength: number;
  decayRate: number;
  initialStrength: number;
  accessCount: number | null;
  reinforcementCount: number | null;
  lastAccessed: string;
  createdAt: string;
  sectorId: string | null;
  memoryType: string | null;
  archived: boolean;
  metadata: any;
}

interface Edge {
  id: string;
  source: string;
  target: string;
  strength: number;
  type: string;
}

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function App() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<MemoryNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [selectedNode, setSelectedNode] = useState<MemoryNode | null>(null);
  const [selectedNodeDetails, setSelectedNodeDetails] = useState<any>(null);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<Set<string>>(new Set());
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [newMemoryText, setNewMemoryText] = useState('');
  const [userId] = useState(() => {
    const saved = localStorage.getItem('memory_user_id');
    if (saved) return saved;
    const newId = uuidv4();
    localStorage.setItem('memory_user_id', newId);
    return newId;
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchChats = async () => {
    try {
      const res = await fetch('/api/chats');
      if (!res.ok) throw new Error('Failed to fetch chats');
      const data = await res.json();
      setChats(data.chats || []);
      
      if (data.chats && data.chats.length > 0 && !selectedChatId) {
        setSelectedChatId(data.chats[0].chatId);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchSectors = async () => {
    try {
      const res = await fetch('/api/sectors');
      if (!res.ok) throw new Error('Failed to fetch sectors');
      const data = await res.json();
      setSectors(data.sectors || []);
    } catch (err: any) {
      console.error(err);
    }
  };

  const fetchGraph = async (chatId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/graph/${chatId}`);
      if (!res.ok) throw new Error('Failed to fetch graph data');
      const data = await res.json();
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchNodeDetails = async (nodeId: string) => {
    try {
      const res = await fetch(`/api/memory/get/${nodeId}`);
      if (!res.ok) throw new Error('Failed to fetch node details');
      const data = await res.json();
      setSelectedNodeDetails(data);
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchChats();
    fetchSectors();
  }, []);

  useEffect(() => {
    if (selectedChatId) {
      fetchGraph(selectedChatId);
      setSelectedNode(null);
      setSelectedNodeDetails(null);
      setHighlightedNodeIds(new Set());
    }
  }, [selectedChatId]);

  useEffect(() => {
    if (selectedNode) {
      fetchNodeDetails(selectedNode.id);
    } else {
      setSelectedNodeDetails(null);
    }
  }, [selectedNode]);

  const handleCreateNewChat = () => {
    const newChatId = uuidv4();
    setSelectedChatId(newChatId);
    setNodes([]);
    setEdges([]);
  };

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !selectedChatId) return;

    setLoading(true);
    try {
      const res = await fetch('/api/memory/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          userId,
          chatId: selectedChatId,
          k: 5,
        }),
      });

      if (!res.ok) throw new Error('Query failed');
      const data = await res.json();

      const resultsList = data.results || [];
      setSearchResults(resultsList);
      setShowResultsModal(true);

      const matchedIds = new Set<string>(resultsList.map((r: any) => r.id));
      setHighlightedNodeIds(matchedIds);

      if (resultsList.length > 0) {
        const primaryMatch = nodes.find((n) => n.id === resultsList[0].id);
        if (primaryMatch) {
          setSelectedNode(primaryMatch);
        }
      }
      
      fetchGraph(selectedChatId);
      fetchSectors();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryText.trim() || !selectedChatId) return;

    setLoading(true);
    try {
      const res = await fetch('/api/memory/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          chatId: selectedChatId,
          userType: 'user',
          content: newMemoryText,
        }),
      });

      if (!res.ok) throw new Error('Failed to ingest memory');
      setNewMemoryText('');
      
      await fetchGraph(selectedChatId);
      await fetchChats();
      await fetchSectors();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMemory = async (memoryId: string) => {
    if (!confirm('Are you sure you want to delete/archive this memory?')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/memory/${memoryId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Deletion failed');
      
      setSelectedNode(null);
      setSelectedNodeDetails(null);
      
      await fetchGraph(selectedChatId!);
      await fetchChats();
      await fetchSectors();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>FreeMemory</h1>
          <div className="status-badge">
            <span className="status-dot"></span>
            <span>Memory Engine Online</span>
          </div>
        </div>

        <div className="chat-list">
          <button className="btn btn-secondary" onClick={handleCreateNewChat} style={{ marginBottom: '8px' }}>
            + New Chat Session
          </button>
          
          {chats.map((chat) => (
            <div
              key={chat.chatId}
              className={`chat-item ${selectedChatId === chat.chatId ? 'active' : ''}`}
              onClick={() => setSelectedChatId(chat.chatId)}
            >
              <div className="chat-id">{chat.chatId}</div>
              <div className="chat-meta">
                <span>{chat.count} memories</span>
              </div>
            </div>
          ))}
        </div>
        {sectors.length > 0 && (
          <div style={{ padding: '16px', borderTop: '1px solid var(--border-color)', background: '#050505' }}>
            <h3 style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Active Sectors</h3>
            <div className="tag-list">
              {sectors.map((sec) => (
                <span key={sec.id} className="tag" style={{ textTransform: 'capitalize' }}>
                  {sec.name} ({sec.memoryCount})
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="main-content">
        <div className="main-header">
          <div className="header-title">
            <h2>Active Graph Workspace</h2>
            {selectedChatId && <p>Chat Session ID: {selectedChatId}</p>}
          </div>

          <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
            <div>Nodes: <strong style={{ color: '#ffffff' }}>{nodes.length}</strong></div>
            <div>Connections: <strong style={{ color: '#ffffff' }}>{edges.length}</strong></div>
          </div>
        </div>

        <div className="visualizer-area">
          {error && (
            <div style={{ padding: '12px 16px', margin: '20px', background: '#000000', border: '1px solid #ef4444', borderRadius: '6px', color: '#ef4444', fontSize: '13px', zIndex: 10, position: 'absolute' }}>
              Error: {error}
            </div>
          )}

          {nodes.length === 0 ? (
            <div className="empty-state">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M18 3H6a3 3 0 00-3 3v12a3 3 0 003 3h12a3 3 0 003-3V6a3 3 0 00-3-3z" />
                <path d="M9 9l3 3 3-3" />
              </svg>
              <h3>No Memories Ingested Yet</h3>
              <p>Add some text details using the ingestion card to watch the neural graph form connections automatically.</p>
            </div>
          ) : (
            <CanvasGraph
              nodes={nodes}
              edges={edges}
              selectedNodeId={selectedNode?.id || null}
              onSelectNode={setSelectedNode}
              highlightedNodeIds={highlightedNodeIds}
            />
          )}

          <div className="overlay-panel">
            <div className="glass-card">
              <h4>Query / Search Graph</h4>
              <form onSubmit={handleQuery} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ask your memory..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button type="submit" className="btn" disabled={loading}>
                  {loading ? 'Searching...' : 'Search Neural Index'}
                </button>
              </form>
            </div>

            <div className="glass-card">
              <h4>Ingest New Memory</h4>
              <form onSubmit={handleAddMemory} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <textarea
                  className="input-field"
                  placeholder="Type a memory detail to store..."
                  value={newMemoryText}
                  onChange={(e) => setNewMemoryText(e.target.value)}
                />
                <button type="submit" className="btn" disabled={loading || !selectedChatId}>
                  Add to Active Chat
                </button>
              </form>
            </div>
          </div>

          {selectedNode && (
            <div className="inspector-panel">
              <div className="panel-header">
                <h3>Memory Details</h3>
                <button className="close-btn" onClick={() => setSelectedNode(null)}>×</button>
              </div>

              <div className="panel-body">
                <div className="glass-card">
                  <h4>Content</h4>
                  <div className="memory-text">{selectedNode.content}</div>
                </div>

                <div className="glass-card">
                  <h4>Neural Metrics</h4>
                  <div className="meta-grid">
                    <div className="meta-item">
                      <span className="meta-label">Decay Strength</span>
                      <span className="meta-value">{(selectedNode.strength * 100).toFixed(0)}%</span>
                      <div className="strength-bar-bg">
                        <div className="strength-bar-fill" style={{ width: `${selectedNode.strength * 100}%` }}></div>
                      </div>
                    </div>
                    <div className="meta-item">
                      <span className="meta-label">Access Count</span>
                      <span className="meta-value">{selectedNode.accessCount || 0} times</span>
                    </div>
                  </div>
                </div>

                {selectedNodeDetails?.sector && (
                  <div className="glass-card">
                    <h4>Cognitive Sector</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div className="meta-item">
                        <span className="meta-label">Name</span>
                        <span className="meta-value" style={{ textTransform: 'capitalize' }}>
                          {selectedNodeDetails.sector.name}
                        </span>
                      </div>
                      <div className="meta-item">
                        <span className="meta-label">Topics</span>
                        <div className="tag-list">
                          {(selectedNodeDetails.sector.topics || []).map((topic: string) => (
                            <span key={topic} className="tag">{topic}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {selectedNodeDetails?.waypoints && selectedNodeDetails.waypoints.length > 0 && (
                  <div className="glass-card">
                    <h4>Active Relationships</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {selectedNodeDetails.waypoints.map((wp: any) => {
                        const targetId = wp.sourceMemoryId === selectedNode.id ? wp.targetMemoryId : wp.sourceMemoryId;
                        const targetNode = nodes.find((n) => n.id === targetId);
                        const targetText = targetNode 
                          ? (targetNode.content.length > 30 ? targetNode.content.slice(0, 28) + '...' : targetNode.content)
                          : targetId.slice(0, 8);

                        return (
                          <div key={wp.id} className="relationship-item">
                            <span
                              className="relationship-target"
                              onClick={() => {
                                const found = nodes.find((n) => n.id === targetId);
                                if (found) setSelectedNode(found);
                              }}
                            >
                              {targetText}
                            </span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>
                              {wp.relationshipType} ({(wp.strength * 100).toFixed(0)}%)
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <button
                  className="btn btn-danger"
                  onClick={() => handleDeleteMemory(selectedNode.id)}
                  style={{ marginTop: 'auto' }}
                >
                  Archive/Soft Delete Memory
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showResultsModal && searchResults && (
        <div className="modal-overlay" onClick={() => setShowResultsModal(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="panel-header">
              <h3>Search & Retrieval Results</h3>
              <button className="close-btn" onClick={() => setShowResultsModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {searchResults.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>
                  No semantic matches found for this query.
                </div>
              ) : (
                searchResults.map((res, index) => (
                  <div key={res.id} className="result-card">
                    <div className="result-header">
                      <span className="result-index">Rank #{index + 1}</span>
                      <span className="result-score">Retrieval Score: {(res.score * 100).toFixed(0)}%</span>
                    </div>
                    <div className="result-text">{res.content}</div>
                    <div className="result-meta-row">
                      <span>Similarity: <strong>{(res.similarity * 100).toFixed(0)}%</strong></span>
                      <span>Decay Strength: <strong>{(res.strength * 100).toFixed(0)}%</strong></span>
                      {res.sectorId && <span style={{ textTransform: 'capitalize' }}>Sector: <strong>{res.sectorId}</strong></span>}
                    </div>
                    {res.relationships && res.relationships.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Retrieved Path Relationships</span>
                        <div className="tag-list">
                          {res.relationships.map((rel: any, idx: number) => {
                            const targetNode = nodes.find((n) => n.id === rel.targetId);
                            const targetText = targetNode 
                              ? (targetNode.content.length > 25 ? targetNode.content.slice(0, 23) + '...' : targetNode.content)
                              : rel.targetId.slice(0, 8);
                            return (
                              <span key={idx} className="tag">
                                {rel.relationshipType} → {targetText}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div className="result-actions">
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '11px' }}
                        onClick={() => {
                          const matched = nodes.find((n) => n.id === res.id);
                          if (matched) {
                            setSelectedNode(matched);
                          }
                          setShowResultsModal(false);
                        }}
                      >
                        Locate & Inspect Node
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
