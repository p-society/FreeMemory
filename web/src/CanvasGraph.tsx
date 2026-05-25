import React, { useRef, useEffect, useState } from 'react';

interface Node {
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

interface CanvasGraphProps {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  onSelectNode: (node: Node | null) => void;
  highlightedNodeIds: Set<string>;
}

interface SimNode {
  id: string;
  data: Node;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

interface SimEdge {
  id: string;
  source: SimNode;
  target: SimNode;
  strength: number;
}

interface Particle {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  progress: number;
  speed: number;
  color: string;
}

export const CanvasGraph: React.FC<CanvasGraphProps> = ({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  highlightedNodeIds,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simNodesRef = useRef<SimNode[]>([]);
  const simEdgesRef = useRef<SimEdge[]>([]);
  const particlesRef = useRef<Particle[]>([]);

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const isDraggingCanvasRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const draggedNodeRef = useRef<SimNode | null>(null);
  const hoveredNodeRef = useRef<SimNode | null>(null);

  const getSectorColor = (sectorId: string | null): string => {
    if (!sectorId) return '#555555';
    let hash = 0;
    for (let i = 0; i < sectorId.length; i++) {
      hash = sectorId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 60%, 65%)`;
  };

  useEffect(() => {
    const existingMap = new Map<string, SimNode>();
    simNodesRef.current.forEach((n) => existingMap.set(n.id, n));

    const newSimNodes = nodes.map((node) => {
      const existing = existingMap.get(node.id);
      if (existing) {
        existing.data = node;
        return existing;
      }
      const angle = Math.random() * Math.PI * 2;
      const radius = 50 + Math.random() * 150;
      return {
        id: node.id,
        data: node,
        x: window.innerWidth / 2 + Math.cos(angle) * radius - pan.x,
        y: window.innerHeight / 2 + Math.sin(angle) * radius - pan.y,
        vx: 0,
        vy: 0,
        radius: 14,
      };
    });

    simNodesRef.current = newSimNodes;

    const nodeMap = new Map<string, SimNode>();
    newSimNodes.forEach((n) => nodeMap.set(n.id, n));

    simEdgesRef.current = edges
      .map((edge) => {
        const sourceNode = nodeMap.get(edge.source);
        const targetNode = nodeMap.get(edge.target);
        if (!sourceNode || !targetNode) return null;
        return {
          id: edge.id,
          source: sourceNode,
          target: targetNode,
          strength: edge.strength,
        };
      })
      .filter((e): e is SimEdge => e !== null);
  }, [nodes, edges]);

  useEffect(() => {
    if (highlightedNodeIds.size === 0) return;

    const activeEdges = simEdgesRef.current.filter(
      (e) => highlightedNodeIds.has(e.source.id) || highlightedNodeIds.has(e.target.id)
    );

    activeEdges.forEach((edge) => {
      const color = getSectorColor(edge.source.data.sectorId);
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          particlesRef.current.push({
            x: edge.source.x,
            y: edge.source.y,
            targetX: edge.target.x,
            targetY: edge.target.y,
            progress: 0,
            speed: 0.025 + Math.random() * 0.02,
            color,
          });
        }, Math.random() * 500);
      }
    });
  }, [highlightedNodeIds]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animationId: number;

    const handleResize = () => {
      canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
      canvas.height = canvas.parentElement?.clientHeight || window.innerHeight;
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    const tick = () => {
      const nodesList = simNodesRef.current;
      const edgesList = simEdgesRef.current;
      const width = canvas.width;
      const height = canvas.height;

      const gravityK = 0.012;
      const repulsionK = 1800;
      const springK = 0.03;
      const damping = 0.86;

      const centerX = width / 2;
      const centerY = height / 2;

      for (let i = 0; i < nodesList.length; i++) {
        const nodeA = nodesList[i];
        if (!nodeA) continue;

        const dx = centerX - (nodeA.x + pan.x);
        const dy = centerY - (nodeA.y + pan.y);
        nodeA.vx += dx * gravityK;
        nodeA.vy += dy * gravityK;

        for (let j = i + 1; j < nodesList.length; j++) {
          const nodeB = nodesList[j];
          if (!nodeB) continue;

          const rx = nodeA.x - nodeB.x;
          const ry = nodeA.y - nodeB.y;
          const distSq = rx * rx + ry * ry || 1;
          const dist = Math.sqrt(distSq);

          if (dist < 400) {
            const force = repulsionK / distSq;
            const fx = (rx / dist) * force;
            const fy = (ry / dist) * force;

            nodeA.vx += fx;
            nodeA.vy += fy;
            nodeB.vx -= fx;
            nodeB.vy -= fy;
          }
        }
      }

      edgesList.forEach((edge) => {
        const { source, target, strength } = edge;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const targetLen = 130 + (1 - strength) * 70;
        const force = (dist - targetLen) * springK;

        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        source.vx += fx;
        source.vy += fy;
        target.vx -= fx;
        target.vy -= fy;
      });

      nodesList.forEach((node) => {
        if (node === draggedNodeRef.current) return;
        node.x += node.vx;
        node.y += node.vy;
        node.vx *= damping;
        node.vy *= damping;
      });

      particlesRef.current = particlesRef.current
        .map((p) => {
          p.progress += p.speed;
          const sourceNode = simNodesRef.current.find((n) => Math.abs(n.x - p.x) < 50 && Math.abs(n.y - p.y) < 50);
          const targetNode = simNodesRef.current.find((n) => Math.abs(n.x - p.targetX) < 50 && Math.abs(n.y - p.targetY) < 50);
          if (sourceNode && targetNode) {
            p.x = sourceNode.x + (targetNode.x - sourceNode.x) * p.progress;
            p.y = sourceNode.y + (targetNode.y - sourceNode.y) * p.progress;
          } else {
            p.x += (p.targetX - p.x) * p.speed;
            p.y += (p.targetY - p.y) * p.speed;
          }
          return p;
        })
        .filter((p) => p.progress < 1.0);

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, width, height);

        ctx.save();
        ctx.translate(pan.x, pan.y);
        ctx.scale(zoom, zoom);

        edgesList.forEach((edge) => {
          const isHighlighted =
            highlightedNodeIds.has(edge.source.id) || highlightedNodeIds.has(edge.target.id);

          ctx.beginPath();
          ctx.moveTo(edge.source.x, edge.source.y);
          ctx.lineTo(edge.target.x, edge.target.y);
          ctx.strokeStyle = isHighlighted
            ? 'rgba(255, 255, 255, 0.4)'
            : `rgba(255, 255, 255, ${0.03 + edge.strength * 0.08})`;
          ctx.lineWidth = isHighlighted ? 1.5 : 0.5 + edge.strength * 1.0;
          ctx.stroke();
        });

        particlesRef.current.forEach((p) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.fill();
        });

        nodesList.forEach((node) => {
          const color = getSectorColor(node.data.sectorId);
          const isSelected = selectedNodeId === node.id;
          const isHighlighted = highlightedNodeIds.has(node.id);
          const isHovered = hoveredNodeRef.current?.id === node.id;

          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);

          if (isSelected) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = color;
            ctx.fillStyle = color;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
          } else if (isHighlighted) {
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.5;
          } else {
            ctx.fillStyle = '#000000';
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
          }

          ctx.fill();
          ctx.stroke();
          ctx.shadowBlur = 0;

          const label =
            node.data.content.length > 20
              ? node.data.content.slice(0, 18) + '...'
              : node.data.content;

          ctx.font = '500 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          ctx.textAlign = 'center';
          
          if (isSelected || isHighlighted || isHovered) {
            ctx.fillStyle = '#ffffff';
          } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
          }
          
          ctx.fillText(label, node.x, node.y - node.radius - 8);
        });

        ctx.restore();
      }

      animationId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
    };
  }, [pan, zoom, selectedNodeId, highlightedNodeIds]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - pan.x) / zoom;
    const mouseY = (e.clientY - rect.top - pan.y) / zoom;

    const clickedNode = simNodesRef.current.find((node) => {
      const dx = node.x - mouseX;
      const dy = node.y - mouseY;
      return dx * dx + dy * dy < node.radius * node.radius;
    });

    if (clickedNode) {
      draggedNodeRef.current = clickedNode;
      onSelectNode(clickedNode.data);
    } else {
      isDraggingCanvasRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      panStartRef.current = { ...pan };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - pan.x) / zoom;
    const mouseY = (e.clientY - rect.top - pan.y) / zoom;

    if (draggedNodeRef.current) {
      draggedNodeRef.current.x = mouseX;
      draggedNodeRef.current.y = mouseY;
      draggedNodeRef.current.vx = 0;
      draggedNodeRef.current.vy = 0;
    } else if (isDraggingCanvasRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPan({
        x: panStartRef.current.x + dx,
        y: panStartRef.current.y + dy,
      });
    } else {
      const hover = simNodesRef.current.find((node) => {
        const dx = node.x - mouseX;
        const dy = node.y - mouseY;
        return dx * dx + dy * dy < (node.radius + 5) * (node.radius + 5);
      });
      hoveredNodeRef.current = hover || null;
    }
  };

  const handleMouseUp = () => {
    draggedNodeRef.current = null;
    isDraggingCanvasRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = 1.05;
    const newZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
    setZoom(Math.max(0.1, Math.min(4, newZoom)));
  };

  const resetView = () => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ display: 'block', width: '100%', height: '100%', cursor: 'grab' }}
      />
      <button
        onClick={resetView}
        style={{
          position: 'absolute',
          bottom: '20px',
          right: '20px',
          padding: '6px 12px',
          background: '#000000',
          border: '1px solid #1a1a1a',
          borderRadius: '6px',
          color: '#888888',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fontSize: '12px',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#333333';
          e.currentTarget.style.color = '#ffffff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#1a1a1a';
          e.currentTarget.style.color = '#888888';
        }}
      >
        Reset Zoom
      </button>
    </div>
  );
};
