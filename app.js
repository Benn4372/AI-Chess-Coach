'use strict';

const App = {
  els: {},
  board: null,
  game: null,
  orientation: 'white',
  fullHistory: [],
  viewIndex: 0,
  audioCtx: null,

  // Tap-to-move state
  selectedSquare: null,

  // Engine state
  engineWorker: null,
  engineReady: false,
  evaluations: [],       // eval after each position (index 0 = starting pos)
  currentDepth: 0,
  evalQueue: null,       // pending FEN to evaluate
  engineSettings: { depth: 16, multiPV: 1 },

  init() {
    this.cacheDOM();
    this.loadTheme();
    this.loadEngineSettings();
    this.initGame();
    this.initBoard();
    this.initAudio();
    this.initEngine();
    this.bindEvents();
    this.updateStatus();
  },

  cacheDOM() {
    this.els = {
      board: document.getElementById('board'),
      moveList: document.getElementById('move-list'),
      gameStatus: document.getElementById('game-status'),
      engineStatus: document.getElementById('engine-status'),
      coachMessages: document.getElementById('coach-messages'),
      skillLevel: document.getElementById('skill-level'),
      themeToggle: document.getElementById('theme-toggle'),
      settingsBtn: document.getElementById('settings-btn'),
      btnFlip: document.getElementById('btn-flip'),
      btnFirst: document.getElementById('btn-first'),
      btnPrev: document.getElementById('btn-prev'),
      btnNext: document.getElementById('btn-next'),
      btnLast: document.getElementById('btn-last'),
      btnUndo: document.getElementById('btn-undo'),
      btnReset: document.getElementById('btn-reset'),
      btnCoach: document.getElementById('btn-coach'),
      btnImport: document.getElementById('btn-import'),
      btnExport: document.getElementById('btn-export'),
      pgnModal: document.getElementById('pgn-modal'),
      pgnInput: document.getElementById('pgn-input'),
      pgnError: document.getElementById('pgn-error'),
      pgnCancel: document.getElementById('pgn-cancel'),
      pgnLoad: document.getElementById('pgn-load'),
      toast: document.getElementById('toast'),
      evalBar: document.getElementById('eval-bar'),
      evalFill: document.getElementById('eval-fill'),
      evalLabel: document.getElementById('eval-label'),
      settingsModal: document.getElementById('settings-modal'),
      engineDepth: document.getElementById('engine-depth'),
      engineLines: document.getElementById('engine-lines'),
      depthValue: document.getElementById('depth-value'),
      linesValue: document.getElementById('lines-value'),
      settingsClose: document.getElementById('settings-close'),
    };
  },

  bindEvents() {
    this.els.themeToggle.addEventListener('click', () => this.toggleTheme());
    this.els.btnFlip.addEventListener('click', () => this.flipBoard());
    this.els.btnReset.addEventListener('click', () => this.resetGame());
    this.els.btnUndo.addEventListener('click', () => this.undoMove());
    this.els.btnFirst.addEventListener('click', () => this.goToMove(0));
    this.els.btnPrev.addEventListener('click', () => this.goToMove(this.viewIndex - 1));
    this.els.btnNext.addEventListener('click', () => this.goToMove(this.viewIndex + 1));
    this.els.btnLast.addEventListener('click', () => this.goToMove(this.fullHistory.length));
    this.els.btnImport.addEventListener('click', () => this.openImportModal());
    this.els.btnExport.addEventListener('click', () => this.exportPGN());
    this.els.pgnCancel.addEventListener('click', () => this.closeImportModal());
    this.els.pgnLoad.addEventListener('click', () => this.loadPGN());
    this.els.pgnModal.addEventListener('click', (e) => {
      if (e.target === this.els.pgnModal) this.closeImportModal();
    });

    // Settings
    this.els.settingsBtn.addEventListener('click', () => this.openSettingsModal());
    this.els.settingsClose.addEventListener('click', () => this.closeSettingsModal());
    this.els.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.els.settingsModal) this.closeSettingsModal();
    });
    this.els.engineDepth.addEventListener('input', (e) => {
      this.els.depthValue.textContent = e.target.value;
    });
    this.els.engineLines.addEventListener('input', (e) => {
      this.els.linesValue.textContent = e.target.value;
    });
    this.els.engineDepth.addEventListener('change', (e) => this.onSettingsChange());
    this.els.engineLines.addEventListener('change', (e) => this.onSettingsChange());

    // Eval bar hover
    this.els.evalBar.addEventListener('mouseenter', () => {
      this.els.evalLabel.style.opacity = '1';
    });
    this.els.evalBar.addEventListener('mouseleave', () => {
      this.els.evalLabel.style.opacity = '';
    });

    // Tap-to-move on the board
    this.els.board.addEventListener('click', (e) => this.onBoardClick(e));

    window.addEventListener('resize', () => this.board && this.board.resize());
  },

  // ── Theme ────────────────────────────────────────────

  loadTheme() {
    const saved = localStorage.getItem('chess-coach-theme');
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }
  },

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('chess-coach-theme', next);
  },

  // ── Audio ────────────────────────────────────────────

  initAudio() {
    this.audioCtx = null;
  },

  getAudioCtx() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this.audioCtx;
  },

  playSound(type) {
    try {
      const ctx = this.getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      switch (type) {
        case 'move':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(600, ctx.currentTime);
          gain.gain.setValueAtTime(0.08, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.1);
          break;
        case 'capture':
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(400, ctx.currentTime);
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.15);
          break;
        case 'check':
          osc.type = 'square';
          osc.frequency.setValueAtTime(800, ctx.currentTime);
          osc.frequency.setValueAtTime(1000, ctx.currentTime + 0.08);
          gain.gain.setValueAtTime(0.06, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.2);
          break;
        case 'castle':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(500, ctx.currentTime);
          osc.frequency.setValueAtTime(700, ctx.currentTime + 0.08);
          gain.gain.setValueAtTime(0.08, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.18);
          break;
        case 'gameover':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(523, ctx.currentTime);
          osc.frequency.setValueAtTime(659, ctx.currentTime + 0.15);
          osc.frequency.setValueAtTime(784, ctx.currentTime + 0.3);
          gain.gain.setValueAtTime(0.1, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.5);
          break;
      }
    } catch (e) {
      // Audio not available
    }
  },

  getSoundForMove(move) {
    if (move.san.includes('#')) return 'gameover';
    if (move.san.includes('+')) return 'check';
    if (move.san === 'O-O' || move.san === 'O-O-O') return 'castle';
    if (move.flags.includes('c') || move.flags.includes('e')) return 'capture';
    return 'move';
  },

  // ── Engine ───────────────────────────────────────────

  initEngine() {
    try {
      this.engineWorker = new Worker('assets/stockfish/stockfish-nnue-16-single.js');
    } catch (e) {
      this.setEngineStatus('Engine unavailable', '');
      return;
    }

    this.engineWorker.onmessage = (e) => this.onEngineMessage(e.data);
    this.engineWorker.onerror = () => {
      this.setEngineStatus('Engine error', '');
      this.engineReady = false;
    };

    this.engineWorker.postMessage('uci');
  },

  onEngineMessage(line) {
    if (typeof line !== 'string') return;

    if (line === 'uciok') {
      this.engineReady = true;
      this.setEngineStatus('Engine ready', 'ready');
      this.configureEngine();
      this.requestEval(this.game.fen());
      return;
    }

    this.parseUCIOutput(line);
  },

  configureEngine() {
    if (!this.engineWorker) return;
    this.sendUCI(`setoption name MultiPV value ${this.engineSettings.multiPV}`);
  },

  sendUCI(cmd) {
    if (this.engineWorker) this.engineWorker.postMessage(cmd);
  },

  requestEval(fen) {
    if (!this.engineReady || !this.engineWorker) return;
    this.evalQueue = fen;
    this.currentDepth = 0;
    this.setEngineStatus('Analyzing...', 'analyzing');
    this.sendUCI('stop');
    this.sendUCI('ucinewgame');
    this.sendUCI('isready');
    this.sendUCI(`position fen ${fen}`);
    this.sendUCI(`go depth ${this.engineSettings.depth}`);
  },

  parseUCIOutput(line) {
    if (typeof line !== 'string') return;

    if (line.startsWith('info') && line.includes(' score ')) {
      const depthMatch = line.match(/\bdepth (\d+)/);
      const scoreCP = line.match(/\bscore cp (-?\d+)/);
      const scoreMate = line.match(/\bscore mate (-?\d+)/);
      const pvMatch = line.match(/\bpv (.+)$/);
      const multiPVMatch = line.match(/\bmultipv (\d+)/);

      const depth = depthMatch ? parseInt(depthMatch[1]) : 0;
      const pvIndex = multiPVMatch ? parseInt(multiPVMatch[1]) - 1 : 0;

      if (pvIndex > 0) return;

      this.currentDepth = depth;

      let score;
      if (scoreMate) {
        score = { type: 'mate', value: parseInt(scoreMate[1]) };
      } else if (scoreCP) {
        score = { type: 'cp', value: parseInt(scoreCP[1]) };
      } else {
        return;
      }

      const pv = pvMatch ? pvMatch[1].trim().split(/\s+/) : [];

      // Score is from the side to move's perspective in the FEN
      // Normalize to always be from White's perspective
      const fen = this.evalQueue || this.game.fen();
      const sideToMove = fen.split(' ')[1];
      const normalizedScore = { ...score };
      if (sideToMove === 'b') {
        normalizedScore.value = -normalizedScore.value;
      }

      this.updateEvalBar(normalizedScore);
      this.setEngineStatus(`Depth ${depth}/${this.engineSettings.depth}`, 'analyzing');

      this._lastEval = { score: normalizedScore, pv, depth };
    }

    if (line.startsWith('bestmove')) {
      if (this._lastEval) {
        this.evaluations[this.viewIndex] = this._lastEval;
        this._lastEval = null;
        this.classifyMoves();
        this.updateMoveList();
      }
      this.setEngineStatus(`Depth ${this.currentDepth}`, 'ready');
    }
  },

  setEngineStatus(text, className) {
    this.els.engineStatus.textContent = text;
    this.els.engineStatus.className = 'engine-status' + (className ? ' ' + className : '');
  },

  // ── Evaluation Bar ──────────────────────────────────

  updateEvalBar(score) {
    let percentage, labelText;

    if (score.type === 'mate') {
      const mateVal = score.value;
      percentage = mateVal > 0 ? 100 : 0;
      labelText = (mateVal > 0 ? '+' : '') + 'M' + Math.abs(mateVal);
    } else {
      const cp = score.value;
      // Sigmoid-like mapping: ±10 pawns fills the bar
      percentage = 50 + 50 * (2 / (1 + Math.exp(-cp / 250)) - 1);
      percentage = Math.max(2, Math.min(98, percentage));
      const pawns = (cp / 100).toFixed(1);
      labelText = (cp >= 0 ? '+' : '') + pawns;
    }

    this.els.evalFill.style.height = percentage + '%';
    this.els.evalLabel.textContent = labelText;
  },

  // ── Move Classification ─────────────────────────────

  classifyMoves() {
    this._moveClassifications = [];

    for (let i = 0; i < this.fullHistory.length; i++) {
      const evalBefore = this.evaluations[i];
      const evalAfter = this.evaluations[i + 1];

      if (!evalBefore || !evalAfter) {
        this._moveClassifications.push(null);
        continue;
      }

      const isWhiteMove = (i % 2 === 0);
      const classification = this.classifySingleMove(evalBefore, evalAfter, isWhiteMove);
      this._moveClassifications.push(classification);
    }
  },

  classifySingleMove(evalBefore, evalAfter, isWhiteMove) {
    const scoreBefore = this.evalToNumber(evalBefore.score);
    const scoreAfter = this.evalToNumber(evalAfter.score);

    // Eval loss from the moving side's perspective
    // If white moves: positive score is good for white
    // Loss = scoreBefore - scoreAfter (from white's perspective, which is normalized)
    // If black moves: flip since scores are from white's perspective
    const loss = isWhiteMove
      ? scoreBefore - scoreAfter
      : scoreAfter - scoreBefore;

    // Missed mate detection
    if (evalBefore.score.type === 'mate' && evalAfter.score.type !== 'mate') {
      const mateFavoredMover = isWhiteMove
        ? evalBefore.score.value > 0
        : evalBefore.score.value < 0;
      if (mateFavoredMover) return 'blunder';
    }

    // Fell into mate
    if (evalAfter.score.type === 'mate') {
      const mateAgainstMover = isWhiteMove
        ? evalAfter.score.value < 0
        : evalAfter.score.value > 0;
      if (mateAgainstMover && (evalBefore.score.type !== 'mate')) return 'blunder';
    }

    // Convert centipawns to pawns for thresholds
    const lossInPawns = loss / 100;

    if (lossInPawns <= -0.5) return 'brilliant';
    if (lossInPawns <= -0.2) return 'great';
    if (lossInPawns <= 0.3)  return 'good';
    if (lossInPawns <= 1.0)  return 'inaccuracy';
    if (lossInPawns <= 2.5)  return 'mistake';
    return 'blunder';
  },

  evalToNumber(score) {
    if (score.type === 'mate') {
      return score.value > 0 ? 10000 - score.value : -10000 - score.value;
    }
    return score.value;
  },

  getClassificationIcon(classification) {
    const icons = {
      brilliant:   '!!',
      great:       '!',
      good:        '',
      inaccuracy:  '?!',
      mistake:     '?',
      blunder:     '??',
    };
    return icons[classification] || '';
  },

  // ── Game & Board ─────────────────────────────────────

  initGame() {
    this.game = new Chess();
    this.fullHistory = [];
    this.viewIndex = 0;
    this.evaluations = [];
    this._moveClassifications = [];
  },

  initBoard() {
    this.board = Chessboard('board', {
      draggable: true,
      position: 'start',
      orientation: this.orientation,
      pieceTheme: 'assets/pieces/wikipedia/{piece}.png',
      onDragStart: (source, piece, position, orient) => this.onDragStart(source, piece),
      onDrop: (source, target) => this.onDrop(source, target),
      onSnapEnd: () => this.onSnapEnd(),
    });
  },

  isViewingHistory() {
    return this.viewIndex < this.fullHistory.length;
  },

  onDragStart(source, piece) {
    if (this.isViewingHistory()) return false;
    if (this.game.game_over()) return false;

    const turn = this.game.turn();
    if ((turn === 'w' && piece.search(/^b/) !== -1) ||
        (turn === 'b' && piece.search(/^w/) !== -1)) {
      return false;
    }
  },

  onDrop(source, target) {
    if (this.isViewingHistory()) return 'snapback';

    const move = this.game.move({
      from: source,
      to: target,
      promotion: 'q',
    });

    if (move === null) return 'snapback';

    this.clearHighlights();
    this.selectedSquare = null;
    this.fullHistory.push(move);
    this.viewIndex = this.fullHistory.length;
    this.playSound(this.getSoundForMove(move));
    this.updateMoveList();
    this.updateStatus();
    this.requestEval(this.game.fen());
  },

  onSnapEnd() {
    this.board.position(this.game.fen());
  },

  // ── Tap-to-Move ──────────────────────────────────────

  onBoardClick(e) {
    if (this.isViewingHistory()) return;
    if (this.game.game_over()) return;

    const squareEl = e.target.closest('[data-square]');
    if (!squareEl) return;
    const square = squareEl.getAttribute('data-square');

    if (this.selectedSquare) {
      const legalMoves = this.game.moves({ square: this.selectedSquare, verbose: true });
      const matchingMove = legalMoves.find(m => m.to === square);

      if (matchingMove) {
        const move = this.game.move({
          from: this.selectedSquare,
          to: square,
          promotion: 'q',
        });
        this.clearHighlights();
        this.selectedSquare = null;
        if (move) {
          this.fullHistory.push(move);
          this.viewIndex = this.fullHistory.length;
          this.board.position(this.game.fen());
          this.playSound(this.getSoundForMove(move));
          this.updateMoveList();
          this.updateStatus();
          this.requestEval(this.game.fen());
        }
        return;
      }

      // Clicked a different own piece — switch selection
      const piece = this.game.get(square);
      if (piece && piece.color === this.game.turn()) {
        this.clearHighlights();
        this.selectedSquare = square;
        this.highlightMoves(square);
        return;
      }

      // Clicked empty/enemy square that isn't a legal target — deselect
      this.clearHighlights();
      this.selectedSquare = null;
      return;
    }

    // No piece selected — select if it's the current player's piece
    const piece = this.game.get(square);
    if (piece && piece.color === this.game.turn()) {
      this.selectedSquare = square;
      this.highlightMoves(square);
    }
  },

  highlightMoves(square) {
    const boardEl = this.els.board;
    const srcEl = boardEl.querySelector(`[data-square="${square}"]`);
    if (srcEl) srcEl.classList.add('square-selected');

    const moves = this.game.moves({ square, verbose: true });
    for (const move of moves) {
      const targetEl = boardEl.querySelector(`[data-square="${move.to}"]`);
      if (targetEl) {
        targetEl.classList.add(move.captured ? 'square-capture-hint' : 'square-move-hint');
      }
    }
  },

  clearHighlights() {
    const boardEl = this.els.board;
    boardEl.querySelectorAll('.square-selected').forEach(el => el.classList.remove('square-selected'));
    boardEl.querySelectorAll('.square-move-hint').forEach(el => el.classList.remove('square-move-hint'));
    boardEl.querySelectorAll('.square-capture-hint').forEach(el => el.classList.remove('square-capture-hint'));
  },

  // ── Navigation ───────────────────────────────────────

  goToMove(index) {
    index = Math.max(0, Math.min(index, this.fullHistory.length));
    if (index === this.viewIndex) return;

    this.viewIndex = index;

    this.game = new Chess();
    for (let i = 0; i < this.viewIndex; i++) {
      this.game.move(this.fullHistory[i].san);
    }

    this.board.position(this.game.fen(), false);
    this.playSound('move');
    this.updateMoveList();
    this.updateStatus();

    // Show stored eval or re-evaluate
    if (this.evaluations[this.viewIndex]) {
      this.updateEvalBar(this.evaluations[this.viewIndex].score);
    } else {
      this.requestEval(this.game.fen());
    }
  },

  // ── Status & Move List ───────────────────────────────

  updateStatus() {
    const el = this.els.gameStatus;

    if (this.isViewingHistory()) {
      el.textContent = `Viewing move ${this.viewIndex} of ${this.fullHistory.length}`;
      el.className = 'game-status status-history';
      return;
    }

    const turn = this.game.turn() === 'w' ? 'White' : 'Black';

    if (this.game.in_checkmate()) {
      const winner = this.game.turn() === 'w' ? 'Black' : 'White';
      el.textContent = `Checkmate! ${winner} wins.`;
      el.className = 'game-status status-checkmate';
    } else if (this.game.in_stalemate()) {
      el.textContent = 'Stalemate — draw.';
      el.className = 'game-status status-draw';
    } else if (this.game.in_threefold_repetition()) {
      el.textContent = 'Threefold repetition — draw.';
      el.className = 'game-status status-draw';
    } else if (this.game.insufficient_material()) {
      el.textContent = 'Insufficient material — draw.';
      el.className = 'game-status status-draw';
    } else if (this.game.in_draw()) {
      el.textContent = 'Draw (50-move rule).';
      el.className = 'game-status status-draw';
    } else if (this.game.in_check()) {
      el.textContent = `${turn} is in check.`;
      el.className = 'game-status status-check';
    } else {
      el.textContent = `${turn} to move.`;
      el.className = 'game-status';
    }
  },

  updateMoveList() {
    const skill = this.els.skillLevel.value;
    const el = this.els.moveList;

    if (this.fullHistory.length === 0) {
      el.innerHTML = '';
      return;
    }

    let html = '<table class="move-table"><tbody>';
    for (let i = 0; i < this.fullHistory.length; i += 2) {
      const moveNum = Math.floor(i / 2) + 1;
      const whiteMove = this.formatMove(this.fullHistory[i].san, skill);
      const blackMove = this.fullHistory[i + 1]
        ? this.formatMove(this.fullHistory[i + 1].san, skill)
        : '';

      const whiteActive = (i + 1) === this.viewIndex ? ' move-active' : '';
      const blackActive = (i + 2) === this.viewIndex ? ' move-active' : '';

      const whiteClass = this.getMoveClassCSS(i);
      const blackClass = this.fullHistory[i + 1] ? this.getMoveClassCSS(i + 1) : '';

      const whiteIcon = this.getMoveClassIcon(i);
      const blackIcon = this.fullHistory[i + 1] ? this.getMoveClassIcon(i + 1) : '';

      html += '<tr>';
      html += `<td class="move-num">${moveNum}.</td>`;
      html += `<td class="move-white${whiteActive}${whiteClass}" data-index="${i + 1}">${whiteMove}${whiteIcon}</td>`;
      html += this.fullHistory[i + 1]
        ? `<td class="move-black${blackActive}${blackClass}" data-index="${i + 2}">${blackMove}${blackIcon}</td>`
        : '<td class="move-black"></td>';
      html += '</tr>';
    }
    html += '</tbody></table>';

    el.innerHTML = html;

    el.querySelectorAll('[data-index]').forEach(td => {
      td.addEventListener('click', () => {
        this.goToMove(parseInt(td.dataset.index, 10));
      });
    });

    const active = el.querySelector('.move-active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  },

  getMoveClassCSS(moveIndex) {
    if (!this._moveClassifications || !this._moveClassifications[moveIndex]) return '';
    return ' move-' + this._moveClassifications[moveIndex];
  },

  getMoveClassIcon(moveIndex) {
    if (!this._moveClassifications || !this._moveClassifications[moveIndex]) return '';
    const c = this._moveClassifications[moveIndex];
    const icon = this.getClassificationIcon(c);
    if (!icon) return '';
    return `<span class="move-icon">${icon}</span>`;
  },

  formatMove(san, skill) {
    if (skill !== 'beginner') return san;

    const pieceNames = { K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight' };
    let desc = san;

    if (san === 'O-O') return 'Castles kingside';
    if (san === 'O-O-O') return 'Castles queenside';

    desc = desc.replace(/[+#]$/, '');
    const captures = desc.includes('x');
    desc = desc.replace('x', '');

    let piece = 'Pawn';
    if (desc[0] >= 'A' && desc[0] <= 'Z') {
      piece = pieceNames[desc[0]] || desc[0];
      desc = desc.substring(1);
    }

    const target = desc.replace(/[=].*/, '').slice(-2);
    let text = captures ? `${piece} takes on ${target}` : `${piece} to ${target}`;

    if (san.includes('+')) text += ' (check)';
    if (san.includes('#')) text += ' (checkmate)';
    if (san.includes('=')) text += ', promotes';

    return text;
  },

  // ── Board Controls ───────────────────────────────────

  flipBoard() {
    this.orientation = this.orientation === 'white' ? 'black' : 'white';
    this.board.orientation(this.orientation);
  },

  resetGame() {
    this.game = new Chess();
    this.fullHistory = [];
    this.viewIndex = 0;
    this.evaluations = [];
    this._moveClassifications = [];
    this.board.start();
    this.updateMoveList();
    this.updateStatus();
    this.updateEvalBar({ type: 'cp', value: 0 });
    this.requestEval(this.game.fen());
  },

  undoMove() {
    if (this.fullHistory.length === 0) return;

    if (this.isViewingHistory()) {
      this.goToMove(this.fullHistory.length);
      return;
    }

    this.fullHistory.pop();
    this.viewIndex = this.fullHistory.length;
    this.game = new Chess();
    for (const m of this.fullHistory) {
      this.game.move(m.san);
    }
    this.board.position(this.game.fen());
    this.updateMoveList();
    this.updateStatus();

    if (this.evaluations[this.viewIndex]) {
      this.updateEvalBar(this.evaluations[this.viewIndex].score);
    } else {
      this.requestEval(this.game.fen());
    }
  },

  // ── PGN Import/Export ────────────────────────────────

  openImportModal() {
    this.els.pgnInput.value = '';
    this.els.pgnError.hidden = true;
    this.els.pgnModal.hidden = false;
    this.els.pgnInput.focus();
  },

  closeImportModal() {
    this.els.pgnModal.hidden = true;
  },

  loadPGN() {
    const raw = this.els.pgnInput.value.trim();
    if (!raw) {
      this.els.pgnError.textContent = 'Please paste a PGN game.';
      this.els.pgnError.hidden = false;
      return;
    }

    const testGame = new Chess();
    const success = testGame.load_pgn(raw, { sloppy: true });

    if (!success) {
      this.els.pgnError.textContent = 'Could not parse PGN. Check the format and try again.';
      this.els.pgnError.hidden = false;
      return;
    }

    this.fullHistory = testGame.history({ verbose: true });
    this.viewIndex = this.fullHistory.length;
    this.game = testGame;
    this.evaluations = [];
    this._moveClassifications = [];
    this.board.position(this.game.fen());
    this.updateMoveList();
    this.updateStatus();
    this.closeImportModal();
    this.showToast('Game loaded — analyzing...');
    this.analyzeFullGame();
  },

  analyzeFullGame() {
    if (!this.engineReady) return;

    let posIndex = 0;
    const tempGame = new Chess();
    const positions = [tempGame.fen()];

    for (const m of this.fullHistory) {
      tempGame.move(m.san);
      positions.push(tempGame.fen());
    }

    const analyzeNext = () => {
      if (posIndex >= positions.length) {
        this.classifyMoves();
        this.updateMoveList();
        const lastEval = this.evaluations[this.viewIndex];
        if (lastEval) this.updateEvalBar(lastEval.score);
        this.setEngineStatus('Analysis complete', 'ready');
        this.showToast('Analysis complete');
        return;
      }

      const fen = positions[posIndex];
      const idx = posIndex;
      this.currentDepth = 0;
      this._lastEval = null;

      const handler = (e) => {
        const line = e.data;
        if (typeof line !== 'string') return;
        this.parseUCIBatchLine(line, idx);
        if (line.startsWith('bestmove')) {
          this.engineWorker.removeEventListener('message', handler);
          if (this._batchLastEval) {
            this.evaluations[idx] = this._batchLastEval;
            this._batchLastEval = null;
          }
          posIndex++;
          this.setEngineStatus(`Analyzing ${posIndex}/${positions.length}`, 'analyzing');
          analyzeNext();
        }
      };

      this.engineWorker.addEventListener('message', handler);
      this.sendUCI('stop');
      this.sendUCI('ucinewgame');
      this.sendUCI('isready');
      this.sendUCI(`position fen ${fen}`);
      this.sendUCI(`go depth ${this.engineSettings.depth}`);
    };

    this.setEngineStatus('Analyzing game...', 'analyzing');
    analyzeNext();
  },

  parseUCIBatchLine(line, posIndex) {
    if (typeof line !== 'string') return;
    if (!line.startsWith('info') || !line.includes(' score ')) return;

    const depthMatch = line.match(/\bdepth (\d+)/);
    const scoreCP = line.match(/\bscore cp (-?\d+)/);
    const scoreMate = line.match(/\bscore mate (-?\d+)/);
    const pvMatch = line.match(/\bpv (.+)$/);
    const multiPVMatch = line.match(/\bmultipv (\d+)/);

    if (multiPVMatch && parseInt(multiPVMatch[1]) > 1) return;

    const depth = depthMatch ? parseInt(depthMatch[1]) : 0;

    let score;
    if (scoreMate) {
      score = { type: 'mate', value: parseInt(scoreMate[1]) };
    } else if (scoreCP) {
      score = { type: 'cp', value: parseInt(scoreCP[1]) };
    } else {
      return;
    }

    const pv = pvMatch ? pvMatch[1].trim().split(/\s+/) : [];

    // Normalize: figure out side to move from stored positions
    const tempGame = new Chess();
    for (let i = 0; i < posIndex && i < this.fullHistory.length; i++) {
      tempGame.move(this.fullHistory[i].san);
    }
    const sideToMove = tempGame.fen().split(' ')[1];
    const normalizedScore = { ...score };
    if (sideToMove === 'b') {
      normalizedScore.value = -normalizedScore.value;
    }

    this._batchLastEval = { score: normalizedScore, pv, depth };
  },

  exportPGN() {
    const exportGame = new Chess();
    for (const m of this.fullHistory) {
      exportGame.move(m.san);
    }
    const pgn = exportGame.pgn();

    if (!pgn) {
      this.showToast('No moves to export');
      return;
    }

    navigator.clipboard.writeText(pgn).then(
      () => this.showToast('PGN copied to clipboard'),
      () => this.showToast('Could not copy — check clipboard permissions')
    );
  },

  // ── Settings ─────────────────────────────────────────

  loadEngineSettings() {
    const saved = localStorage.getItem('chess-coach-engine');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this.engineSettings.depth = parsed.depth || 16;
        this.engineSettings.multiPV = parsed.multiPV || 1;
      } catch (e) { /* use defaults */ }
    }
  },

  saveEngineSettings() {
    localStorage.setItem('chess-coach-engine', JSON.stringify(this.engineSettings));
  },

  openSettingsModal() {
    this.els.engineDepth.value = this.engineSettings.depth;
    this.els.depthValue.textContent = this.engineSettings.depth;
    this.els.engineLines.value = this.engineSettings.multiPV;
    this.els.linesValue.textContent = this.engineSettings.multiPV;
    this.els.settingsModal.hidden = false;
  },

  closeSettingsModal() {
    this.els.settingsModal.hidden = true;
  },

  onSettingsChange() {
    this.engineSettings.depth = parseInt(this.els.engineDepth.value);
    this.engineSettings.multiPV = parseInt(this.els.engineLines.value);
    this.saveEngineSettings();
    this.configureEngine();
  },

  showToast(message) {
    const el = this.els.toast;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
