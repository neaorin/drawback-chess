import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DRAWBACKS, colorName, drawbackDescription, drawbackMoveInfo, fogVisibility, legalMoves, newGame, other, play, positionAt, repetitionCount, square, visibleKingAttacks, type Color, type DrawbackId, type Game, type Kind, type Move, type Piece } from './game';
import { chooseAI, resolveEngineBan, StockfishClient } from './ai';
import { needsEngineBan, rulesFor, templateDescription } from './drawback-state';
import { loadSaved, SAVE_KEY, type Mode, type Saved } from './storage';
import { DIFFICULTY_LEVELS, difficultyLevel, type DrawbackChoice } from './drawback-catalogue';
import { randomDrawback } from './game';
import './styles.css';
import { preferredCapture, unluckySquares } from './drawback-helpers';

const names: Record<Kind, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
function Glyph({ piece }: { piece: Piece }) {
  return <img aria-hidden="true" alt="" draggable={false}
    src={`${import.meta.env.BASE_URL}pieces/cburnett/${piece.color}${piece.kind.toUpperCase()}.svg`}
    className={`piece ${piece.color === 'w' ? 'white-piece' : 'black-piece'}`} />;
}
function Icon({ name }: { name: 'shield' | 'eye' | 'flip' | 'arrow' | 'book' | 'cpu' | 'close' }) {
  const paths = {
    shield: <><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z" /><path d="m9 12 2 2 4-4" /></>,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    flip: <><path d="M4 8h15l-4-4M20 16H5l4 4" /><path d="M19 8v4M5 16v-4" /></>,
    arrow: <><path d="M4 12h16m-6-6 6 6-6 6" /></>,
    book: <><path d="M12 5v16M12 5C8 2 3 3 3 3v15s5-1 9 3c4-4 9-3 9-3V3s-5-1-9 2Z" /></>,
    cpu: <><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4" /><rect x="10" y="10" width="4" height="4" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
const initial = loadSaved();

function DrawbackSelect({ id, label, value, onChange }: {
  id: string; label: string; value: DrawbackChoice; onChange: (value: DrawbackChoice) => void;
}) {
  const drawback = DRAWBACKS.find(d => d.id === value);
  const level = drawback ? difficultyLevel(drawback.difficulty) : DIFFICULTY_LEVELS.find(level => level.choice === value);
  return <>
    <label className="field-label" htmlFor={id}>{label}</label>
    <select id={id} className="drawback-select" value={value} onChange={event => {
      const choice = event.target.value;
      if (choice === 'random') onChange(choice);
      else {
        const selected = DIFFICULTY_LEVELS.find(level => level.choice === choice)?.choice ??
          DRAWBACKS.find(d => d.id === choice)?.id;
        if (selected) onChange(selected);
      }
    }}>
      <optgroup label="Random options"><option value="random">Random · surprise me</option>{DIFFICULTY_LEVELS.map(level =>
        <option key={level.choice} value={level.choice} className={level.className}>■ Random · {level.label}</option>
      )}</optgroup>
      <optgroup label="Individual drawbacks">{DRAWBACKS.map(d => {
        const level = difficultyLevel(d.difficulty);
        return <option key={d.id} value={d.id} className={level.className} title={templateDescription(d.description)}>■ {d.name} · {level.label}</option>;
      })}</optgroup>
    </select>
    {level && <><span className={`difficulty-badge ${level.className}`}><span aria-hidden="true">■</span> {level.label}</span><p className="privacy-note">{drawback ? templateDescription(drawback.description) : `Randomly choose a ${level.label.toLowerCase()} drawback.`}</p></>}
  </>;
}

function App() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  const [game, setGame] = useState(() => initial.saved?.game ?? newGame());
  const [reviewPosition, setReviewPosition] = useState<Game | null>(null);
  const [mode, setMode] = useState<Mode>(initial.saved?.mode ?? 'ai');
  const [human, setHuman] = useState<Color>(initial.saved?.human ?? 'w');
  const [flipped, setFlipped] = useState(initial.saved?.flipped ?? false);
  const [strength, setStrength] = useState(initial.saved?.strength ?? 400);
  const [selected, setSelected] = useState<number | null>(null);
  const [sliding, setSliding] = useState<Move | null>(null);
  const [promotion, setPromotion] = useState<Move[] | null>(null);
  const [modal, setModal] = useState<'new' | 'rules' | 'drawbacks' | null>(null);
  const [draftMode, setDraftMode] = useState<Mode>(mode);
  const [draftColor, setDraftColor] = useState<Color>(human);
  const [draftStrength, setDraftStrength] = useState(strength);
  const [draftDrawback, setDraftDrawback] = useState<DrawbackChoice>('random');
  const [draftOpponentDrawback, setDraftOpponentDrawback] = useState<DrawbackChoice>('random');
  const [handoff, setHandoff] = useState(mode === 'local' && !game.result);
  const [busy, setBusy] = useState(false);
  const [engineStatus, setEngineStatus] = useState('Stockfish 19 · ready when you are');
  const [error, setError] = useState(initial.error);
  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    setTheme(next);
    const url = new URL(window.location.href);
    if (url.searchParams.has('scoutTheme')) {
      url.searchParams.set('scoutTheme', next);
      window.history.replaceState(null, '', url);
    }
    try {
      localStorage.setItem('drawback-chess-theme', next);
    } catch (error) {
      console.error('Unable to save theme preference:', error);
      setError('Your theme changed, but the preference could not be saved in this browser.');
    }
  }
  const [tab, setTab] = useState<'moves' | 'rules'>('moves');
  const [glossarySearch, setGlossarySearch] = useState('');
  const [confirmReveal, setConfirmReveal] = useState<Color | null>(null);
  const [confirmResign, setConfirmResign] = useState<Color | null>(null);
  const [showResult, setShowResult] = useState(false);
  const previousResult = useRef(game.result);
  useEffect(() => {
    if (game.result && !previousResult.current) setShowResult(true);
    previousResult.current = game.result;
  }, [game.result]);
  const boardRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const saveFailed = useRef(false);
  const dragging = useRef<number | null>(null);
  useLayoutEffect(() => {
    const board = boardRef.current!;
    const frame = board.parentElement!;
    const column = frame.parentElement!;
    const layout = column.parentElement!;
    const fitBoard = () => {
      if (window.innerWidth <= 820) {
        layout.style.removeProperty('--board-max-size');
        return;
      }
      const frameBounds = frame.getBoundingClientRect();
      const controlsHeight = column.getBoundingClientRect().bottom - frameBounds.bottom;
      const available = Math.max(0, Math.floor(window.innerHeight - frameBounds.top - controlsHeight - 16));
      layout.style.setProperty('--board-max-size', `${available}px`);
    };
    const observer = new ResizeObserver(fitBoard);
    observer.observe(column);
    observer.observe(frame);
    observer.observe(document.querySelector('.site-header')!);
    observer.observe(document.querySelector('.game-actions')!);
    window.addEventListener('resize', fitBoard);
    fitBoard();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fitBoard);
    };
  }, []);
  const viewer = mode === 'ai' ? human : game.turn;
  const displayedGame = reviewPosition ?? game;
  const viewPly = displayedGame.history.length;
  const visibilityGame = game.result ? { ...displayedGame, result: game.result } : displayedGame;
  const fogged = game.drawbacks[viewer] === 'fog' && !game.result;
  const fogHandoff = mode === 'local' && !game.result && (handoff || !!sliding) &&
    (game.drawbacks.w === 'fog' || game.drawbacks.b === 'fog');
  const { visible, occupied } = fogHandoff
    ? { visible: new Set<number>(), occupied: new Set<number>() }
    : fogVisibility(visibilityGame, viewer);
  const revealed = game.result ? { w: true, b: true } : game.revealed;
  const unluckyForbidden = !game.result && !handoff && !sliding &&
    displayedGame.turn === viewer && game.drawbacks[viewer] === 'unlucky'
    ? unluckySquares(rulesFor(displayedGame).seed, viewer, displayedGame.turns[viewer]) : new Set<number>();
  const terrainVisible = (color: Color, drawback: DrawbackId) =>
    !handoff && !(mode === 'local' && sliding) && game.drawbacks[color] === drawback &&
    (color === viewer || revealed[color]);
  const terrainSquares = (drawback: DrawbackId) => new Set(
    (['w', 'b'] as const).filter(color => terrainVisible(color, drawback))
      .map(color => rulesFor(displayedGame).params[color].square),
  );
  const sunSquares = terrainSquares('blinded-by-the-sun');
  const volcanoSquares = terrainSquares('active-volcano');
  const showRiver = (['w', 'b'] as const).some(color => terrainVisible(color, 'bridge-over-troubled-water'));
  const moveInfo = game.result || handoff || sliding ? null : drawbackMoveInfo(displayedGame, viewer, reviewPosition ? null : selected);
  const active = !reviewPosition && !game.result && !needsEngineBan(game) && !busy && !sliding && !handoff && (mode === 'local' || game.turn === human) && !modal;
  const moves = legalMoves(game);
  const mandatoryCaptures = new Set(
    game.result || handoff || sliding || displayedGame.turn !== viewer ||
      !['ooh-shiny', 'simplifier', 'escort-mission', 'evil-twin'].includes(displayedGame.drawbacks[viewer] ?? '') ? [] :
      legalMoves(displayedGame).filter(move => preferredCapture(displayedGame, move)).map(move => move.capture!),
  );
  const threatenedKings = visibleKingAttacks(visibilityGame, viewer);
  const targets = selected === null || reviewPosition ? [] : moves.filter(m => m.from === selected);
  const ownDrawback = DRAWBACKS.find(d => d.id === game.drawbacks[viewer])!;
  const ownDescription = drawbackDescription(displayedGame, viewer);
  const opponentDrawback = DRAWBACKS.find(d => d.id === game.drawbacks[other(viewer)])!;
  const last = displayedGame.history.at(-1)?.move;
  const lastColor = displayedGame.history.at(-1)?.color;
  const showLast = !fogHandoff && (!fogged || lastColor === viewer);
  const resultModal = showResult && !!game.result && !sliding;
  const overlay = !!modal || handoff || !!promotion || confirmReveal || confirmResign || resultModal;

  function navigateHistory(ply: number) {
    if (overlay || sliding) return;
    try {
      const bounded = Math.max(0, Math.min(game.history.length, ply));
      setReviewPosition(bounded === game.history.length ? null : positionAt(game, bounded));
      setSelected(null);
    } catch (cause) {
      console.error('Could not reconstruct history:', cause);
      setError(`Could not display this position: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey ||
          overlay || sliding || (target instanceof HTMLElement &&
          (target.isContentEditable || target.closest('input, textarea, select')))) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      navigateHistory(viewPly + (event.key === 'ArrowLeft' ? -1 : 1));
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, game, mode, human, flipped, strength } satisfies Saved));
    } catch (cause) {
      console.error('Could not save game:', cause);
      if (!saveFailed.current) setError('Saving is unavailable. Keep this tab open to retain your game.');
      saveFailed.current = true;
    }
  }, [game, mode, human, flipped, strength]);
  useEffect(() => { historyRef.current?.scrollTo(0, historyRef.current.scrollHeight); }, [game.history.length]);
  useEffect(() => {
    if (!sliding) return;
    const timer = setTimeout(() => {
      setSliding(null);
      if (mode === 'local' && !game.result) setHandoff(true);
    }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200);
    return () => clearTimeout(timer);
  }, [sliding, mode, game.result]);
  useEffect(() => {
    if (!overlay) return;
    const previous = document.activeElement;
    dialogRef.current?.querySelector<HTMLElement>('button, select, input')?.focus();
    return () => { if (previous instanceof HTMLElement) previous.focus(); };
  }, [overlay, modal, handoff, promotion, confirmReveal, confirmResign, resultModal]);
  useEffect(() => {
    if (!needsEngineBan(game) || sliding || handoff) return;
    let cancelled = false;
    const client = new StockfishClient();
    setBusy(true);
    setEngineStatus('Preparing your move restriction…');
    void resolveEngineBan(game, client, strength).then(result => {
      if (cancelled) return;
      setGame(result.game);
      setEngineStatus(result.source);
      if (result.warning) setError(result.warning);
    }).catch(cause => {
      if (!cancelled) {
        console.error('Could not prepare drawback:', cause);
        setError(`Could not prepare drawback: ${cause instanceof Error ? cause.message : String(cause)}. Start a new game to retry.`);
      }
    }).finally(() => {
      if (!cancelled) setBusy(false);
      client.dispose();
    });
    return () => { cancelled = true; client.dispose(); };
  }, [game, strength, sliding, handoff]);
  useEffect(() => {
    if (mode !== 'ai' || game.turn === human || game.result || sliding || needsEngineBan(game)) return;
    let cancelled = false;
    const client = new StockfishClient();
    setBusy(true);
    setEngineStatus('Stockfish is thinking…');
    void chooseAI(game, client, strength).then(result => {
      if (cancelled) return;
      setEngineStatus(result.source);
      if (result.warning) setError(result.warning);
      setGame(play(game, result.move));
      setSliding(result.move);
      setSelected(null);
    }).catch(cause => {
      if (!cancelled) {
        console.error('AI turn failed:', cause);
        setError(`AI turn failed: ${cause instanceof Error ? cause.message : String(cause)}. Start a new game to retry.`);
      }
    }).finally(() => {
      if (!cancelled) setBusy(false);
      client.dispose();
    });
    return () => { cancelled = true; client.dispose(); };
  }, [game, human, mode, strength, sliding]);

  function commit(move: Move) {
    try {
      const next = play(game, move);
      setGame(next);
      setSliding(move);
      setSelected(null);
      setPromotion(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }
  function resign(color: Color) {
    setGame(current => current.result ? current : {
      ...current, result: { winner: other(color), reason: `${colorName(color)} resigned` },
    });
    setConfirmResign(null);
    setReviewPosition(null);
    setSelected(null);
    setBusy(false);
  }
  function attempt(from: number, to: number) {
    const choices = moves.filter(m => m.from === from && m.to === to);
    if (!choices.length) return false;
    if (choices[0].promotion) setPromotion(choices);
    else commit(choices[0]);
    return true;
  }
  function chooseSquare(i: number) {
    if (!active) return;
    if (selected !== null && attempt(selected, i)) return;
    setSelected(game.board[i]?.color === game.turn && selected !== i ? i : null);
  }
  function begin() {
    setReviewPosition(null);
    setSliding(null);
    const chosen = DRAWBACKS.find(d => d.id === draftDrawback)?.id ?? randomDrawback(draftDrawback);
    const opponent = DRAWBACKS.find(d => d.id === draftOpponentDrawback)?.id ?? randomDrawback(draftOpponentDrawback);
    const chosenColor = draftMode === 'ai' ? draftColor : 'w';
    const next = newGame(chosenColor === 'w' ? chosen : opponent, chosenColor === 'b' ? chosen : opponent);
    setGame(next);
    setMode(draftMode); setHuman(draftColor); setStrength(draftStrength);
    setFlipped(draftMode === 'ai' && draftColor === 'b');
    setSelected(null); setPromotion(null); setError(null); setBusy(false);
    setHandoff(draftMode === 'local'); setModal(null);
    setEngineStatus('Stockfish 19 · ready when you are');
  }
  function newMatch() {
    setShowResult(false);
    setDraftDrawback('random');
    setDraftOpponentDrawback('random');
    setDraftMode(mode); setDraftColor(human); setDraftStrength(strength); setModal('new');
  }
  function boardKey(event: React.KeyboardEvent<HTMLButtonElement>, i: number) {
    const direction = flipped ? -1 : 1;
    const delta = { ArrowUp: -8 * direction, ArrowDown: 8 * direction }[event.key];
    if (delta !== undefined) {
      event.preventDefault();
      const next = i + delta;
      if (next >= 0 && next < 64 && (Math.abs(delta) === 8 || Math.floor(next / 8) === Math.floor(i / 8))) {
        boardRef.current?.querySelector<HTMLButtonElement>(`[data-square="${square(next)}"]`)?.focus();
      }
    }
    if (event.key === 'Escape') setSelected(null);
  }
  const topColor: Color = flipped ? 'w' : 'b';
  const bottomColor = other(topColor);
  function playerRow(color: Color) {
    const ai = mode === 'ai' && color !== human;
    return <div className={`player-row ${displayedGame.turn === color && (!game.result || reviewPosition) ? 'current-player' : ''}`}>
      <div className={`avatar ${ai ? 'ai-avatar' : ''}`}>{ai ? <Icon name="cpu" /> : <Glyph piece={{ color, kind: 'k' }} />}</div>
      <div className="player-name"><strong>{ai ? 'The machine' : mode === 'ai' ? 'You' : `${colorName(color)} player`}</strong><span>{ai ? 'Stockfish 19 + variant engine' : `${colorName(color)} pieces · ${mode === 'ai' ? 'Human ingenuity' : 'Local pass & play'}`}</span></div>
      {mode === 'local' && !revealed[color] && <button className="player-reveal" aria-label={`Reveal ${colorName(color)} drawback`} onClick={() => setConfirmReveal(color)}>Reveal rule</button>}
      <span className="player-state">{reviewPosition ? (displayedGame.turn === color ? 'To move · review' : 'Reviewing') : game.result ? (game.result.winner === null ? 'Draw' : game.result.winner === color ? 'Winner' : 'Game over') : game.turn === color ? <><span className={`status-dot ${busy ? 'pulse' : ''}`} />{busy && ai ? 'Thinking' : 'To move'}</> : 'Waiting'}</span>
    </div>;
  }
  const resultText = game.result ? game.result.winner === null ? 'Draw' : `${colorName(game.result.winner)} wins` : '';
  const turnText = reviewPosition ? `${colorName(displayedGame.turn)} to move · reviewing` : game.result ? resultText : `${colorName(game.turn)} to move.`;
  const repeatedPosition = !handoff && !sliding && (!game.result || reviewPosition) && repetitionCount(displayedGame) === 2;

  return <div className="app-shell">
    <header className="site-header"><a className="brand" href="./" aria-label="Drawback Chess home"><span className="brand-mark">♞</span><span>drawback<span className="brand-light">chess</span><span className="brand-dot">.</span></span></a>
      <nav aria-label="Main navigation"><span className="nav-active">Play</span><button onClick={() => setModal('drawbacks')}>The drawbacks <span className="count-pill">{DRAWBACKS.length}</span></button><button onClick={() => setModal('rules')}>How to play <Icon name="book" /></button></nav>
      <button className="theme-toggle" role="switch" aria-checked={theme === 'dark'} aria-label="Dark theme" title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggleTheme}><span className="theme-switch-track" aria-hidden="true"><span className="theme-switch-thumb" /></span></button>
    </header>
    <main>
      <div className="game-actions">{!game.result && <button className="outline-button" disabled={handoff || !!sliding} onClick={() => setConfirmResign(viewer)}>Resign</button>}<button className="primary-button new-game" onClick={newMatch}>New game <span>+</span></button></div>
      {error && <div role="alert" className="error-banner"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError(null)}><Icon name="close" /></button></div>}
      <div className="game-layout">
        <section className="board-column" aria-label="Chess game">
          {playerRow(topColor)}
          <div className="board-frame">
            <div className="board" ref={boardRef} role="group" aria-label="Chess board. Select a piece to highlight legal moves. Left and right arrows review history; up and down arrows navigate squares.">
              {Array.from({ length: 64 }, (_, position) => {
                const i = flipped ? 63 - position : position;
                const seen = visible.has(i), unknown = occupied.has(i);
                const p = seen ? displayedGame.board[i] : null;
                const target = seen && targets.some(m => m.to === i);
                const sun = sunSquares.has(i);
                const river = showRiver && (Math.floor(i / 8) === 3 || Math.floor(i / 8) === 4) && i % 8 !== 3 && i % 8 !== 4;
                const volcano = volcanoSquares.has(i);
                const volcanoAdjacent = [...volcanoSquares].some(at =>
                  Math.abs(Math.floor(at / 8) - Math.floor(i / 8)) + Math.abs(at % 8 - i % 8) === 1);
                const dark = (Math.floor(i / 8) + i % 8) % 2 === 1;
                const isLast = seen && showLast && last && (last.from === i || last.to === i);
                const animate = !reviewPosition && seen && !fogHandoff && (!fogged || lastColor === viewer);
                const slideFrom = !animate ? null : sliding?.to === i ? sliding.from :
                  sliding?.castle?.rookTo === i ? sliding.castle.rookFrom : null;
                const slideStyle = slideFrom === null ? undefined : {
                  '--slide-x': `${(slideFrom % 8 - i % 8) * (flipped ? -100 : 100)}%`,
                  '--slide-y': `${(Math.floor(slideFrom / 8) - Math.floor(i / 8)) * (flipped ? -100 : 100)}%`,
                } as React.CSSProperties;
                return <button key={i} data-square={square(i)} aria-label={`${square(i)}${unknown ? ' occupied by an unknown enemy piece; pawn blocked' : !seen ? ' fog of war' : p ? ` ${colorName(p.color)} ${names[p.kind]}` : ' empty'}${river ? ' river' : ''}${sun ? ' sun target' : ''}${volcano ? ' volcano' : ''}${volcanoAdjacent ? ' volcano danger zone' : ''}${seen && threatenedKings.has(i) ? ' under attack' : ''}${target ? ' legal destination' : ''}`}
                  aria-pressed={seen && selected === i} className={`square ${dark ? 'dark-square' : 'light-square'} ${!seen && !unknown ? 'fog-square' : ''} ${unknown ? 'unknown-square' : ''} ${seen && selected === i ? 'selected-square' : ''} ${isLast ? 'last-square' : ''} ${target ? 'legal-square' : ''} ${slideFrom !== null ? 'sliding-square' : ''}`}
                  onClick={() => chooseSquare(i)} onKeyDown={e => boardKey(e, i)} draggable={active && p?.color === game.turn}
                  onDragStart={e => { if (!active || p?.color !== game.turn) { e.preventDefault(); return; } dragging.current = i; setSelected(i); e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragOver={e => { if (active && dragging.current !== null) e.preventDefault(); }}
                  onDrop={e => { e.preventDefault(); if (active && dragging.current !== null) attempt(dragging.current, i); dragging.current = null; }}
                  onDragEnd={() => { dragging.current = null; }}>
                  {position % 8 === 0 && <span className="rank-label">{square(i)[1]}</span>}
                  {!seen && <span aria-hidden="true" className="fog-effect" />}
                  {unluckyForbidden.has(i) && <span className="unlucky-forbidden" role="img" aria-label="Forbidden destination this turn" />}
                  {seen && mandatoryCaptures.has(i) && <span className="mandatory-capture" role="img" aria-label="Mandatory capture target" />}
                  {river && <span className="river-overlay" aria-hidden="true" />}
                  {volcanoAdjacent && <span className="volcano-danger" aria-hidden="true" />}
                  {sun && <svg className="sun-sprite" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="13" /><path d="M32 3v9m0 40v9M3 32h9m40 0h9M11.5 11.5l6.4 6.4m28.2 28.2 6.4 6.4m0-41-6.4 6.4M17.9 46.1l-6.4 6.4" /></svg>}
                  {volcano && <svg className="volcano-sprite" viewBox="0 0 64 64" aria-hidden="true"><path className="volcano-mountain" d="M4 57 23 28h18l19 29Z" /><path className="volcano-lava" d="m23 28 5 15 5-7 6 10 2-18Z" /><path className="volcano-eruption" d="M32 20V6m-8 15-8-9m24 9 8-9M9 24l5 2m36 0 5-2" /></svg>}
                  {unknown && <span aria-hidden="true" className="unknown-occupant">?</span>}
                  {p && <span key={game.history.length} className={`board-piece ${slideFrom !== null ? 'piece-slide' : ''} ${threatenedKings.has(i) ? 'king-under-attack' : ''}`} style={slideStyle}><Glyph piece={p} /></span>}
                  {target && <span className={p ? 'capture-ring' : 'move-dot'} />}
                  {position >= 56 && <span className="file-label">{square(i)[0]}</span>}
                </button>;
              })}
            </div>
          </div>
          {playerRow(bottomColor)}
          <div className="history-navigation" aria-label="Position navigation">
            <button disabled={!!overlay || !!sliding || viewPly === 0} onClick={() => navigateHistory(viewPly - 1)} aria-label="Previous position">←</button>
            <span role="status" aria-label="Displayed position">{reviewPosition ? `Reviewing ${viewPly} / ${game.history.length}` : `Latest position · ${game.history.length} plies`}</span>
            <button disabled={!!overlay || !!sliding || !reviewPosition} onClick={() => navigateHistory(viewPly + 1)} aria-label="Next position">→</button>
            {reviewPosition && <button className="text-button" disabled={!!overlay || !!sliding} onClick={() => navigateHistory(game.history.length)}>Return to latest</button>}
          </div>
          <div className="board-toolbar"><span><span className="status-dot" /> {mode === 'ai' ? 'YOU VS. COMPUTER' : 'LOCAL PASS & PLAY'} <span className="toolbar-separator">/</span> Unrated</span><button disabled={!!sliding} onClick={() => setFlipped(!flipped)} aria-label="Flip board" title="Flip board"><Icon name="flip" /></button></div>
        </section>
        <aside className="sidebar">
          <section className="turn-card"><div className="eyebrow">MOVE {Math.floor(viewPly / 2) + 1}<span className="live-tag">{reviewPosition ? 'REVIEW' : game.result ? 'FINISHED' : 'IN PLAY'}</span></div><h2 aria-live="polite">{turnText}</h2>{(reviewPosition || game.result) && <p>{reviewPosition ? 'Read-only position. Use Left / Right to browse, or return to the latest move to play.' : game.result?.reason}</p>}{repeatedPosition && <div className="repetition-notice" role="status" aria-label="Position repetition">Position seen twice. A third occurrence is a draw.</div>}{game.result && <button className="primary-button" onClick={newMatch}>Play again <Icon name="arrow" /></button>}</section>
          <section className="drawback-card"><div className="card-heading"><span><Icon name="shield" /> Your drawback</span><span className="secret-tag">{revealed[viewer] ? 'REVEALED' : 'ONLY YOU'}</span></div>
            <div className="drawback-content">{!handoff && !(mode === 'local' && sliding) && <><div className="eyebrow">{ownDrawback.tag}</div><h3>{ownDrawback.name}</h3><p>{ownDescription}</p><div className="move-info-slot"><span className="move-info-sizing" aria-hidden="true">{ownDescription}</span>{moveInfo && moveInfo !== ownDescription && <div className="move-info" role="status" aria-label="Your move restriction"><p>{moveInfo}</p></div>}</div></>}</div>
            <div className="reveal-row"><span>{revealed[viewer] ? 'Your opponent can see your rule.' : 'Feeling transparent?'}</span><button disabled={revealed[viewer] || handoff} onClick={() => setConfirmReveal(viewer)}>{revealed[viewer] ? 'Revealed' : 'Reveal to opponent'} <Icon name="arrow" /></button></div>
          </section>
          <section className="opponent-card"><div className="opponent-symbol"><Icon name={revealed[other(viewer)] ? 'eye' : 'shield'} /></div><div><h3>{revealed[other(viewer)] ? opponentDrawback.name : 'Their drawback? A mystery.'}</h3><p>{revealed[other(viewer)] ? drawbackDescription(displayedGame, other(viewer)) : 'Watch their moves. Read between the squares.'}</p></div></section>
          <section className="history-card"><div className="tabs" role="tablist" aria-label="Game information"><button role="tab" aria-selected={tab === 'moves'} className={tab === 'moves' ? 'active-tab' : ''} onClick={() => setTab('moves')}>Move history <span>{game.history.length}</span></button><button role="tab" aria-selected={tab === 'rules'} className={tab === 'rules' ? 'active-tab' : ''} onClick={() => setTab('rules')}>The essentials</button></div>
            {tab === 'moves' ? <div ref={historyRef} className="move-history" role="tabpanel" aria-label="Move history">{!game.history.length ? <div className="empty-history"><span>♙</span><p>A blank board of possibilities.</p><small>Your moves will appear here.</small></div> :
              Array.from({ length: Math.ceil(game.history.length / 2) }, (_, n) => <div className="move-pair" key={n}><span>{n + 1}.</span>{[game.history[n * 2], game.history[n * 2 + 1]].map((entry, col) => <span key={col}>{!entry ? '…' : fogHandoff || (fogged && entry.color !== viewer) ? 'Hidden move' : entry.label}</span>)}</div>)}</div> :
              <div className="essentials" role="tabpanel"><p><strong>Capture the king.</strong> Check and checkmate don’t apply.</p><p><strong>No legal moves? You lose.</strong> Your drawback is always enforced.</p><p><strong>Threefold repetition is a draw.</strong> The same board, side to move, and capture/castling rights must occur three times.</p><p><strong>A risky castle.</strong> On the next turn, a move to the king’s home or transit square can capture it en passant.</p><button className="text-button" onClick={() => setModal('rules')}>Read all the rules →</button></div>}
          </section>
          <div className="engine-note"><Icon name="cpu" /><span>{mode === 'ai' ? engineStatus : 'Two players. One device. Two secrets.'}</span></div>
        </aside>
      </div>
      <section className="bottom-note"><Icon name="shield" /><p><strong>Fair game. Unfair circumstances.</strong> Your legal moves are highlighted. Your opponent’s secret never is.</p><button onClick={() => setModal('rules')}>Learn the twist <Icon name="arrow" /></button></section>
    </main>
    <footer><span>Less predictable. More personal. Still chess.</span><span>BUILT FOR THE UNEXPECTED <span className="brand-dot">✳</span></span></footer>
    {overlay && <div className="modal-backdrop" onKeyDown={e => {
      if (e.key === 'Escape' && !handoff) { setModal(null); setPromotion(null); setConfirmReveal(null); setConfirmResign(null); setShowResult(false); }
      if (e.key === 'Tab') {
        const elements = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select, input');
        if (!elements?.length) return;
        const first = elements[0], last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }}>
      <div ref={dialogRef} className={`modal ${modal === 'drawbacks' ? 'wide-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        {!handoff && <button className="close-modal" aria-label="Close dialog" onClick={() => { setModal(null); setPromotion(null); setConfirmReveal(null); setConfirmResign(null); setShowResult(false); }}><Icon name="close" /></button>}
        {resultModal && game.result ? <><div className="eyebrow">GAME OVER</div><h2 id="dialog-title">{resultText}</h2><p>{game.result.reason}</p><div className="result-drawbacks">{(['w', 'b'] as const).map(color => {
          const drawback = DRAWBACKS.find(d => d.id === game.drawbacks[color])!;
          const level = difficultyLevel(drawback.difficulty);
          return <section key={color} aria-label={`${colorName(color)} drawback`}><h3><span className="result-king" role="img" aria-label={`${colorName(color)} king`}><Glyph piece={{ color, kind: 'k' }} /></span><span className="result-drawback-name">{drawback.name}</span><span className={`difficulty-badge ${level.className}`}>■ {level.label}</span></h3><p>{drawbackDescription(game, color)}</p></section>;
        })}</div><button className="primary-button full-width" onClick={newMatch}>Play again <Icon name="arrow" /></button><button className="text-button" onClick={() => setShowResult(false)}>Review board</button></> :
          handoff ? <><div className="modal-emblem"><Icon name="shield" /></div><div className="eyebrow">KEEP IT BETWEEN YOU AND THE BOARD</div><h2 id="dialog-title">Pass to {colorName(game.turn)}.</h2><p>Hand over the device before continuing. Your private drawback is hidden between turns.</p><button className="primary-button full-width" onClick={() => { setHandoff(false); setFlipped(game.turn === 'b'); }}>I’m the {colorName(game.turn).toLowerCase()} player <Icon name="arrow" /></button></> :
          confirmResign ? <><h2 id="dialog-title">Resign this game?</h2><p>{colorName(confirmResign)} will resign. {colorName(other(confirmResign))} wins, and both drawbacks will be revealed.</p><button className="primary-button full-width" onClick={() => resign(confirmResign)}>Confirm resignation</button><button className="text-button" onClick={() => setConfirmResign(null)}>Keep playing</button></> :
          promotion ? <><div className="eyebrow">A WELL-EARNED UPGRADE</div><h2 id="dialog-title">Choose your promotion.</h2><div className="promotion-options">{promotion.map(m => <button key={m.promotion} aria-label={`Promote to ${names[m.promotion!]}`} onClick={() => commit(m)}><Glyph piece={{ color: game.turn, kind: m.promotion! }} /><span>{names[m.promotion!]}</span></button>)}</div></> :
          confirmReveal ? <><div className="eyebrow">NO TAKING THIS ONE BACK</div><h2 id="dialog-title">Let them in on {confirmReveal === viewer ? 'your' : `${colorName(confirmReveal)}’s`} secret?</h2><p>{confirmReveal === viewer ? 'Your' : `${colorName(confirmReveal)}’s`} drawback will be visible to the opponent for the rest of this game. The rule still applies.</p><button className="primary-button full-width" onClick={() => { setGame({ ...game, revealed: { ...game.revealed, [confirmReveal]: true } }); setConfirmReveal(null); }}>{confirmReveal === viewer ? 'Reveal my drawback' : `Reveal ${colorName(confirmReveal)}’s drawback`} <Icon name="eye" /></button></> :
          modal === 'new' ? <><div className="eyebrow">A FRESH SET OF CIRCUMSTANCES</div><h2 id="dialog-title">Make your next move.</h2><p>Choose each player’s drawback or leave it to chance. {game.history.length > 0 && 'Your current game will be replaced.'}</p>
            <label className="field-label">Your opponent</label><div className="segmented"><button className={draftMode === 'ai' ? 'chosen' : ''} onClick={() => setDraftMode('ai')}><Icon name="cpu" /> Computer</button><button className={draftMode === 'local' ? 'chosen' : ''} onClick={() => setDraftMode('local')}>♟ Pass & play</button></div>
            {draftMode === 'ai' && <><label className="field-label" htmlFor="play-color">Play as</label><select id="play-color" value={draftColor} onChange={e => setDraftColor(e.target.value as Color)}><option value="w">White · you move first</option><option value="b">Black · computer moves first</option></select><label className="field-label" htmlFor="strength">Engine thinking time</label><select id="strength" value={draftStrength} onChange={e => setDraftStrength(Number(e.target.value))}><option value={200}>Quick · 0.2 seconds</option><option value={400}>Balanced · 0.4 seconds</option><option value={900}>Thoughtful · 0.9 seconds</option></select></>}
            <DrawbackSelect id="drawback-choice" label={draftMode === 'ai' ? 'Your drawback' : 'White player’s drawback'} value={draftDrawback} onChange={setDraftDrawback} />
            <DrawbackSelect id="opponent-drawback-choice" label={draftMode === 'ai' ? 'Opponent’s drawback' : 'Black player’s drawback'} value={draftOpponentDrawback} onChange={setDraftOpponentDrawback} />
            <button className="primary-button full-width start-button" onClick={begin}>Let’s play <Icon name="arrow" /></button><small className="privacy-note">Local play is pass & play, not online multiplayer. Secrets are private on screen, not secure against browser inspection.</small></> :
          modal === 'drawbacks' ? <><div className="eyebrow">{DRAWBACKS.length} WAYS TO RETHINK THE BOARD</div><h2 id="dialog-title">Meet the drawbacks.</h2><p>One per player. Choose yours or get a random one. Knowing the possibilities is not the same as knowing their secret.</p><label className="field-label" htmlFor="glossary-search">Find a drawback</label><input id="glossary-search" type="search" value={glossarySearch} onChange={e => setGlossarySearch(e.target.value)} placeholder="Search names or rules" /><div className="glossary">{DRAWBACKS.filter(d => `${d.name} ${d.description}`.toLowerCase().includes(glossarySearch.toLowerCase())).map((d, i) => <article key={d.id}><span className="glossary-number">{String(i + 1).padStart(2, '0')}</span><div><h3>{d.name}</h3><p>{templateDescription(d.description)}</p></div></article>)}</div><p className="small-note">All 181 archived glossary definitions are supported. Parameters are assigned at game start. Fog of War follows this game’s visibility rules.</p></> :
          <><div className="eyebrow">FORGET WHAT YOU KNOW. JUST A LITTLE.</div><h2 id="dialog-title">Chess, with a catch.</h2><div className="rules-list"><p><strong>01 / Keep your secret.</strong> Each player is randomly assigned a drawback. View yours privately; reveal it whenever you want.</p><p><strong>02 / Capture the king.</strong> There is no check, checkmate, or stalemate. Ignore threats, move into danger, or move pinned pieces. Capturing the king wins.</p><p><strong>03 / No moves is a loss.</strong> If you have no legal moves on your turn, you lose. Castle Doctrine also makes losing a rook an immediate loss.</p><p><strong>04 / Castle at your own risk.</strong> Standard unmoved-piece and clear-path requirements apply, but attacked squares do not block castling. On the very next turn only, any otherwise legal move to the king’s home square or the square it crossed (where the rook lands) captures that king en passant. Your drawback still applies to that capture.</p><p><strong>05 / The familiar bits.</strong> Pawns can double-step from their starting rank, capture en passant for one turn, and promote to a queen, rook, bishop, or knight. Click or drag a piece to see its legal moves.</p><p><strong>06 / Threefold repetition.</strong> The third occurrence of the same board, side to move, and castling/en passant rights automatically draws the game. The initial position counts. Drawback memory and move counters are ignored; losing conditions take precedence.</p><p><strong>07 / About the machine.</strong> Stockfish searches only approved standard-chess root moves using UCI searchmoves. A variant-aware engine handles king captures and positions Stockfish cannot analyze. Neither engine knows your hidden drawback. Stockfish’s deeper analysis is standard chess, not a fully drawback-aware search.</p></div></>}
      </div>
    </div>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
