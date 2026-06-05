'use strict';

const App = {
  els: {},
  board: null,
  game: null,
  orientation: 'white',
  fullHistory: [],
  viewIndex: 0,
  audioCtx: null,

  init() {
    this.cacheDOM();
    this.loadTheme();
    this.initGame();
    this.initBoard();
    this.initAudio();
    this.bindEvents();
    this.updateStatus();
  },

  cacheDOM() {
    this.els = {
      board: document.getElementById('board'),
      moveList: document.getElementById('move-list'),
      gameStatus: document.getElementById('game-status'),
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
    this.audioCtx = null; // lazy-init on first interaction
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
      // Audio not available — silently ignore
    }
  },

  getSoundForMove(move) {
    if (move.san.includes('#')) return 'gameover';
    if (move.san.includes('+')) return 'check';
    if (move.san === 'O-O' || move.san === 'O-O-O') return 'castle';
    if (move.flags.includes('c') || move.flags.includes('e')) return 'capture';
    return 'move';
  },

  // ── Game & Board ─────────────────────────────────────

  initGame() {
    this.game = new Chess();
    this.fullHistory = [];
    this.viewIndex = 0;
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

    this.fullHistory.push(move);
    this.viewIndex = this.fullHistory.length;
    this.playSound(this.getSoundForMove(move));
    this.updateMoveList();
    this.updateStatus();
  },

  onSnapEnd() {
    this.board.position(this.game.fen());
  },

  // ── Navigation ───────────────────────────────────────

  goToMove(index) {
    index = Math.max(0, Math.min(index, this.fullHistory.length));
    if (index === this.viewIndex) return;

    this.viewIndex = index;

    // Rebuild game state to the target move
    this.game = new Chess();
    for (let i = 0; i < this.viewIndex; i++) {
      this.game.move(this.fullHistory[i].san);
    }

    this.board.position(this.game.fen(), false);
    this.playSound('move');
    this.updateMoveList();
    this.updateStatus();
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

      html += '<tr>';
      html += `<td class="move-num">${moveNum}.</td>`;
      html += `<td class="move-white${whiteActive}" data-index="${i + 1}">${whiteMove}</td>`;
      html += this.fullHistory[i + 1]
        ? `<td class="move-black${blackActive}" data-index="${i + 2}">${blackMove}</td>`
        : '<td class="move-black"></td>';
      html += '</tr>';
    }
    html += '</tbody></table>';

    el.innerHTML = html;

    // Click on a move to navigate there
    el.querySelectorAll('[data-index]').forEach(td => {
      td.addEventListener('click', () => {
        this.goToMove(parseInt(td.dataset.index, 10));
      });
    });

    // Scroll active move into view
    const active = el.querySelector('.move-active');
    if (active) active.scrollIntoView({ block: 'nearest' });
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
    this.board.start();
    this.updateMoveList();
    this.updateStatus();
  },

  undoMove() {
    if (this.fullHistory.length === 0) return;

    // If viewing history, jump to latest first
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
    this.board.position(this.game.fen());
    this.updateMoveList();
    this.updateStatus();
    this.closeImportModal();
    this.showToast('Game loaded successfully');
  },

  exportPGN() {
    // Rebuild full game for export (in case we're viewing history)
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

  showToast(message) {
    const el = this.els.toast;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
