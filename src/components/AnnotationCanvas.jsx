import React, { useState, useEffect, useRef, useCallback } from 'react';
import theme from '../theme';
import useApi from '../hooks/useApi';

const TOOLS = [
  { id: 'arrow', label: 'Arrow', shortcut: 'A' },
  { id: 'circle', label: 'Circle', shortcut: 'C' },
  { id: 'rect', label: 'Rectangle', shortcut: 'R' },
  { id: 'line', label: 'Line', shortcut: 'L' },
  { id: 'freehand', label: 'Pen', shortcut: 'F' },
  { id: 'highlighter', label: 'Highlighter', shortcut: 'H' },
  { id: 'text', label: 'Text', shortcut: 'T' },
];

const LINE_WIDTHS = [
  { value: 2, label: 'Thin' },
  { value: 3, label: 'Medium' },
  { value: 5, label: 'Thick' },
  { value: 8, label: 'Extra Thick' },
];

const styles = {
  wrapper: {
    position: 'relative',
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: theme.typography.fontFamily,
  },
  toolbar: {
    display: 'flex',
    gap: '12px',
    padding: '12px',
    background: theme.colors.bgSecondary,
    borderBottom: `1px solid ${theme.colors.border}`,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  toolGroup: {
    display: 'flex',
    gap: '4px',
    alignItems: 'center',
  },
  toolBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '8px 12px',
    minWidth: '48px',
    minHeight: '48px',
    borderRadius: theme.radii.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.glassBg,
    color: theme.colors.textSecondary,
    cursor: 'pointer',
    fontSize: theme.typography.sizes.base,
    transition: `all ${theme.transitions.fast}`,
    fontFamily: theme.typography.fontFamily,
  },
  toolBtnActive: {
    background: 'rgba(99, 102, 241, 0.3)',
    borderColor: theme.colors.accent,
    color: theme.colors.accentHover,
  },
  colorPicker: {
    width: '40px',
    height: '36px',
    border: 'none',
    borderRadius: theme.radii.md,
    cursor: 'pointer',
    background: 'transparent',
  },
  sizePicker: {
    padding: '8px',
    borderRadius: theme.radii.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.bgTertiary,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.fontFamily,
  },
  saveBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '8px 16px',
    minHeight: '48px',
    borderRadius: theme.radii.md,
    border: 'none',
    background: theme.colors.gradientPrimary,
    color: '#ffffff',
    cursor: 'pointer',
    fontFamily: theme.typography.fontFamily,
    fontWeight: theme.typography.fontWeights.medium,
    fontSize: theme.typography.sizes.base,
  },
  canvasContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    background: '#000',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '300px',
  },
  image: {
    maxWidth: '100%',
    display: 'block',
  },
  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
    cursor: 'crosshair',
    touchAction: 'none',
  },
  textInput: {
    position: 'absolute',
    background: 'rgba(0, 0, 0, 0.85)',
    border: `2px solid ${theme.colors.accent}`,
    borderRadius: '4px',
    color: '#fff',
    fontFamily: theme.typography.fontFamily,
    fontWeight: theme.typography.fontWeights.bold,
    fontSize: '16px',
    padding: '4px 8px',
    minWidth: '100px',
    outline: 'none',
    zIndex: 10,
  },
};

/**
 * Canvas-based image annotation overlay with drawing tools,
 * pressure sensitivity, undo/redo, and save support.
 */
export default function AnnotationCanvas({
  imageUrl,
  caseId,
  imageId,
  existingAnnotations,
  onSave: onSaveProp,
}) {
  const api = useApi();

  // Tool state
  const [currentTool, setCurrentTool] = useState('arrow');
  const [color, setColor] = useState('#ef4444');
  const [lineWidth, setLineWidth] = useState(3);

  // Annotations state (with undo/redo)
  const [annotations, setAnnotations] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Drawing state refs (not re-rendered per move)
  const isDrawingRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });
  const currentPathRef = useRef(null);
  const activePointerIdRef = useRef(null);
  const currentMoveRef = useRef({ x: 0, y: 0 });

  // Text input state
  const [textInput, setTextInput] = useState(null); // { x, y, color }

  // DOM refs
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const containerRef = useRef(null);

  // Load existing annotations
  useEffect(() => {
    if (existingAnnotations && existingAnnotations.length > 0) {
      setAnnotations(existingAnnotations);
      setHistoryIndex(existingAnnotations.length - 1);
    }
  }, [existingAnnotations]);

  // Setup canvas dimensions when image loads
  const handleImageLoad = useCallback(() => {
    const img = imageRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    const rect = img.getBoundingClientRect();
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
  }, []);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      const img = imageRef.current;
      const canvas = canvasRef.current;
      if (!img || !canvas) return;
      const rect = img.getBoundingClientRect();
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- Drawing helpers ---

  const getCoords = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const getPressureWidth = useCallback((e, baseWidth) => {
    if (e.pointerType !== 'pen') return baseWidth;
    const pressure = e.pressure;
    if (pressure <= 0) return baseWidth;
    const clamped = Math.max(0.1, Math.min(1.0, pressure));
    return 1 + ((clamped - 0.1) / 0.9) * (baseWidth * 2 - 1);
  }, []);

  // --- Canvas rendering ---

  const drawAnnotation = useCallback((ctx, ann) => {
    ctx.strokeStyle = ann.color;
    ctx.fillStyle = ann.color;
    ctx.lineWidth = ann.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 1.0;

    switch (ann.type) {
      case 'arrow': {
        const headLen = 15 + ann.lineWidth * 2;
        const angle = Math.atan2(ann.endY - ann.startY, ann.endX - ann.startX);
        ctx.beginPath();
        ctx.moveTo(ann.startX, ann.startY);
        ctx.lineTo(ann.endX, ann.endY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ann.endX, ann.endY);
        ctx.lineTo(ann.endX - headLen * Math.cos(angle - Math.PI / 6), ann.endY - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(ann.endX - headLen * Math.cos(angle + Math.PI / 6), ann.endY - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'circle': {
        const radiusX = Math.abs(ann.endX - ann.startX) / 2;
        const radiusY = Math.abs(ann.endY - ann.startY) / 2;
        const centerX = Math.min(ann.startX, ann.endX) + radiusX;
        const centerY = Math.min(ann.startY, ann.endY) + radiusY;
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
        ctx.stroke();
        break;
      }
      case 'rect':
        ctx.beginPath();
        ctx.strokeRect(ann.startX, ann.startY, ann.endX - ann.startX, ann.endY - ann.startY);
        break;
      case 'line':
        ctx.beginPath();
        ctx.moveTo(ann.startX, ann.startY);
        ctx.lineTo(ann.endX, ann.endY);
        ctx.stroke();
        break;
      case 'freehand':
        if (!ann.path || ann.path.length < 2) break;
        ctx.strokeStyle = ann.color;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (ann.path[0].width !== undefined) {
          for (let i = 1; i < ann.path.length; i++) {
            ctx.beginPath();
            ctx.lineWidth = ann.path[i].width;
            ctx.moveTo(ann.path[i - 1].x, ann.path[i - 1].y);
            ctx.lineTo(ann.path[i].x, ann.path[i].y);
            ctx.stroke();
          }
        } else {
          ctx.lineWidth = ann.lineWidth;
          ctx.beginPath();
          ctx.moveTo(ann.path[0].x, ann.path[0].y);
          for (let i = 1; i < ann.path.length; i++) {
            ctx.lineTo(ann.path[i].x, ann.path[i].y);
          }
          ctx.stroke();
        }
        break;
      case 'highlighter':
        if (!ann.path || ann.path.length < 2) break;
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = ann.color;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (ann.path[0].width !== undefined) {
          for (let i = 1; i < ann.path.length; i++) {
            ctx.beginPath();
            ctx.lineWidth = ann.path[i].width;
            ctx.moveTo(ann.path[i - 1].x, ann.path[i - 1].y);
            ctx.lineTo(ann.path[i].x, ann.path[i].y);
            ctx.stroke();
          }
        } else {
          ctx.lineWidth = ann.lineWidth;
          ctx.beginPath();
          ctx.moveTo(ann.path[0].x, ann.path[0].y);
          for (let i = 1; i < ann.path.length; i++) {
            ctx.lineTo(ann.path[i].x, ann.path[i].y);
          }
          ctx.stroke();
        }
        ctx.restore();
        break;
      case 'text': {
        const fontSize = ann.fontSize || 16;
        ctx.font = `bold ${fontSize}px Inter, sans-serif`;
        const metrics = ctx.measureText(ann.text);
        const padding = 6;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(ann.x - padding, ann.y - fontSize - padding, metrics.width + padding * 2, fontSize + padding * 2);
        ctx.fillStyle = ann.color;
        ctx.fillText(ann.text, ann.x, ann.y);
        break;
      }
      default:
        break;
    }
    ctx.globalAlpha = 1.0;
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i <= historyIndex && i < annotations.length; i++) {
      drawAnnotation(ctx, annotations[i]);
    }
  }, [annotations, historyIndex, drawAnnotation]);

  // Redraw on state changes
  useEffect(() => {
    redraw();
  }, [redraw]);

  // --- Drawing preview (live feedback) ---

  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // First redraw committed annotations
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i <= historyIndex && i < annotations.length; i++) {
      drawAnnotation(ctx, annotations[i]);
    }

    // Then draw the in-progress shape
    const { x: endX, y: endY } = currentMoveRef.current;
    const start = startRef.current;

    if (currentTool === 'freehand' && currentPathRef.current) {
      const path = currentPathRef.current;
      if (path.length >= 2) {
        ctx.strokeStyle = color;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let i = 1; i < path.length; i++) {
          ctx.beginPath();
          ctx.lineWidth = path[i].width !== undefined ? path[i].width : lineWidth;
          ctx.moveTo(path[i - 1].x, path[i - 1].y);
          ctx.lineTo(path[i].x, path[i].y);
          ctx.stroke();
        }
      }
    } else if (currentTool === 'highlighter' && currentPathRef.current) {
      const path = currentPathRef.current;
      if (path.length >= 2) {
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = '#facc15';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let i = 1; i < path.length; i++) {
          ctx.beginPath();
          ctx.lineWidth = path[i].width !== undefined ? path[i].width : lineWidth * 3;
          ctx.moveTo(path[i - 1].x, path[i - 1].y);
          ctx.lineTo(path[i].x, path[i].y);
          ctx.stroke();
        }
        ctx.restore();
      }
    } else if (currentTool !== 'text') {
      drawAnnotation(ctx, {
        type: currentTool,
        startX: start.x,
        startY: start.y,
        endX,
        endY,
        color,
        lineWidth,
      });
    }
  }, [annotations, historyIndex, currentTool, color, lineWidth, drawAnnotation]);

  // --- Pointer event handlers ---

  const onPointerDown = useCallback((e) => {
    if (e.pointerType === 'touch' && activePointerIdRef.current != null) return;
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    activePointerIdRef.current = e.pointerId;

    const coords = getCoords(e);

    if (currentTool === 'text') {
      setTextInput({ x: coords.x, y: coords.y, color });
      return;
    }

    isDrawingRef.current = true;
    startRef.current = coords;
    currentMoveRef.current = coords;

    if (currentTool === 'freehand') {
      const pw = getPressureWidth(e, lineWidth);
      currentPathRef.current = [{ x: coords.x, y: coords.y, width: pw }];
    } else if (currentTool === 'highlighter') {
      const pw = getPressureWidth(e, lineWidth * 3);
      currentPathRef.current = [{ x: coords.x, y: coords.y, width: pw }];
    }
  }, [currentTool, color, lineWidth, getCoords, getPressureWidth]);

  const onPointerMove = useCallback((e) => {
    if (!isDrawingRef.current || e.pointerId !== activePointerIdRef.current) return;
    e.preventDefault();
    const coords = getCoords(e);
    currentMoveRef.current = coords;

    if (currentTool === 'freehand' && currentPathRef.current) {
      const pw = getPressureWidth(e, lineWidth);
      currentPathRef.current.push({ x: coords.x, y: coords.y, width: pw });
    } else if (currentTool === 'highlighter' && currentPathRef.current) {
      const pw = getPressureWidth(e, lineWidth * 3);
      currentPathRef.current.push({ x: coords.x, y: coords.y, width: pw });
    }

    drawPreview();
  }, [currentTool, lineWidth, getCoords, getPressureWidth, drawPreview]);

  const addAnnotation = useCallback((ann) => {
    setAnnotations((prev) => {
      const trimmed = prev.slice(0, historyIndex + 1);
      return [...trimmed, ann];
    });
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex]);

  const onPointerUp = useCallback((e) => {
    if (!isDrawingRef.current || e.pointerId !== activePointerIdRef.current) return;
    activePointerIdRef.current = null;
    isDrawingRef.current = false;

    const coords = getCoords(e);

    if (currentTool === 'freehand' && currentPathRef.current) {
      addAnnotation({
        type: 'freehand',
        path: currentPathRef.current,
        color,
        lineWidth,
      });
      currentPathRef.current = null;
    } else if (currentTool === 'highlighter' && currentPathRef.current) {
      addAnnotation({
        type: 'highlighter',
        path: currentPathRef.current,
        color: '#facc15',
        lineWidth: lineWidth * 3,
      });
      currentPathRef.current = null;
    } else if (currentTool !== 'text') {
      addAnnotation({
        type: currentTool,
        startX: startRef.current.x,
        startY: startRef.current.y,
        endX: coords.x,
        endY: coords.y,
        color,
        lineWidth,
      });
    }
  }, [currentTool, color, lineWidth, getCoords, addAnnotation]);

  // --- Text input ---

  const commitTextInput = useCallback((text) => {
    if (!textInput) return;
    if (text && text.trim()) {
      const fontSize = Math.max(16, Math.min(20, lineWidth * 5));
      addAnnotation({
        type: 'text',
        x: textInput.x,
        y: textInput.y,
        text: text.trim(),
        color: textInput.color,
        fontSize,
      });
    }
    setTextInput(null);
  }, [textInput, lineWidth, addAnnotation]);

  // --- Undo/Redo/Clear ---

  const undo = useCallback(() => {
    setHistoryIndex((prev) => Math.max(-1, prev - 1));
  }, []);

  const redo = useCallback(() => {
    setHistoryIndex((prev) => Math.min(annotations.length - 1, prev + 1));
  }, [annotations.length]);

  const clearAll = useCallback(() => {
    setAnnotations([]);
    setHistoryIndex(-1);
  }, []);

  // --- Save ---

  const save = useCallback(async () => {
    const data = annotations.slice(0, historyIndex + 1);

    if (onSaveProp) {
      onSaveProp(data);
      return;
    }

    if (caseId) {
      try {
        await api.put(`/api/cases/${caseId}/annotations`, { annotations: data });
      } catch {
        // silent
      }
    }
  }, [annotations, historyIndex, onSaveProp, caseId, api]);

  // --- Keyboard shortcuts ---

  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') { e.preventDefault(); undo(); }
        if (e.key === 'y') { e.preventDefault(); redo(); }
      } else {
        const toolMap = { a: 'arrow', c: 'circle', r: 'rect', l: 'line', f: 'freehand', h: 'highlighter', t: 'text' };
        const tool = toolMap[e.key.toLowerCase()];
        if (tool) setCurrentTool(tool);
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [undo, redo]);

  return (
    <div style={styles.wrapper}>
      {/* Toolbar */}
      <div style={styles.toolbar} role="toolbar" aria-label="Annotation tools">
        {/* Tool buttons */}
        <div style={styles.toolGroup}>
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              style={{
                ...styles.toolBtn,
                ...(currentTool === tool.id ? styles.toolBtnActive : {}),
              }}
              onClick={() => setCurrentTool(tool.id)}
              title={`${tool.label} (${tool.shortcut})`}
              aria-label={tool.label}
              aria-pressed={currentTool === tool.id}
            >
              {tool.label}
            </button>
          ))}
        </div>

        {/* Color and size */}
        <div style={styles.toolGroup}>
          <input
            type="color"
            style={styles.colorPicker}
            value={color}
            onChange={(e) => setColor(e.target.value)}
            title="Annotation color"
            aria-label="Annotation color"
          />
          <select
            style={styles.sizePicker}
            value={lineWidth}
            onChange={(e) => setLineWidth(parseInt(e.target.value))}
            title="Line width"
            aria-label="Line width"
          >
            {LINE_WIDTHS.map((lw) => (
              <option key={lw.value} value={lw.value}>{lw.label}</option>
            ))}
          </select>
        </div>

        {/* Undo/Redo/Clear */}
        <div style={styles.toolGroup}>
          <button
            style={styles.toolBtn}
            onClick={undo}
            disabled={historyIndex < 0}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            Undo
          </button>
          <button
            style={styles.toolBtn}
            onClick={redo}
            disabled={historyIndex >= annotations.length - 1}
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
          >
            Redo
          </button>
          <button
            style={styles.toolBtn}
            onClick={clearAll}
            title="Clear all annotations"
            aria-label="Clear all"
          >
            Clear
          </button>
        </div>

        {/* Save */}
        <div style={styles.toolGroup}>
          <button
            style={styles.saveBtn}
            onClick={save}
            disabled={api.loading}
            aria-label="Save annotations"
          >
            Save
          </button>
        </div>
      </div>

      {/* Canvas container */}
      <div style={styles.canvasContainer} ref={containerRef}>
        <img
          ref={imageRef}
          src={imageUrl}
          alt="Annotation target"
          style={styles.image}
          onLoad={handleImageLoad}
          crossOrigin="anonymous"
        />
        <canvas
          ref={canvasRef}
          style={styles.canvas}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onPointerCancel={onPointerUp}
        />

        {/* Text input overlay */}
        {textInput && (
          <TextInputOverlay
            x={textInput.x}
            y={textInput.y}
            color={textInput.color}
            canvasRef={canvasRef}
            containerRef={containerRef}
            onCommit={commitTextInput}
            onCancel={() => setTextInput(null)}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Inline text input overlay positioned at the canvas coordinates.
 */
function TextInputOverlay({ x, y, color, canvasRef, containerRef, onCommit, onCancel }) {
  const inputRef = useRef(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onCommit(value);
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  const handleBlur = () => {
    setTimeout(() => onCommit(value), 100);
  };

  // Compute position
  let left = 0;
  let top = 0;
  if (canvasRef.current && containerRef.current) {
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    const scaleX = canvasRect.width / canvasRef.current.width;
    const scaleY = canvasRect.height / canvasRef.current.height;
    left = (canvasRect.left - containerRect.left) + x * scaleX;
    top = (canvasRect.top - containerRect.top) + y * scaleY;
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      style={{
        ...styles.textInput,
        left: `${left}px`,
        top: `${top}px`,
        color,
      }}
      aria-label="Annotation text"
    />
  );
}
