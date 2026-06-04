'use strict';

const App = {
  els: {},
  board: null,
  game: null,
  orientation: 'white',

  init() {
    this.cacheDOM();
    this.loadTheme();
    this.initGame();
    this.initBoard();
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
    };
  },

  bindEvents() {
    this.els.themeToggle.addEventListener('click', () => this.toggleTheme());
    this.els.btnFlip.addEventListener('click', () => this.flipBoard());
    this.els.btnReset.addEventListener('click', () => this.resetGame());
    this.els.btnUndo.addEventListener('click', () => this.undoMove());

    window.addEventListener('resize', () => this.board && this.board.resize());
  },

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

  initGame() {
    this.game = new Chess();
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

  onDragStart(source, piece) {
    if (this.game.game_over()) return false;

    const turn = this.game.turn();
    if ((turn === 'w' && piece.search(/^b/) !== -1) ||
        (turn === 'b' && piece.search(/^w/) !== -1)) {
      return false;
    }
  },

  onDrop(source, target) {
    const move = this.game.move({
      from: source,
      to: target,
      promotion: 'q',
    });

    if (move === null) return 'snapback';

    this.updateMoveList();
    this.updateStatus();
  },

  onSnapEnd() {
    this.board.position(this.game.fen());
  },

  updateStatus() {
    const el = this.els.gameStatus;
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
    const history = this.game.history();
    const skill = this.els.skillLevel.value;
    const el = this.els.moveList;

    if (history.length === 0) {
      el.innerHTML = '';
      return;
    }

    let html = '<table class="move-table"><tbody>';
    for (let i = 0; i < history.length; i += 2) {
      const moveNum = Math.floor(i / 2) + 1;
      const whiteMove = this.formatMove(history[i], skill);
      const blackMove = history[i + 1] ? this.formatMove(history[i + 1], skill) : '';
      const isLast = (i + 2 >= history.length);

      html += `<tr${isLast ? ' class="move-current"' : ''}>`;
      html += `<td class="move-num">${moveNum}.</td>`;
      html += `<td class="move-white">${whiteMove}</td>`;
      html += `<td class="move-black">${blackMove}</td>`;
      html += '</tr>';
    }
    html += '</tbody></table>';

    el.innerHTML = html;
    el.scrollTop = el.scrollHeight;
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

  flipBoard() {
    this.orientation = this.orientation === 'white' ? 'black' : 'white';
    this.board.orientation(this.orientation);
  },

  resetGame() {
    this.game.reset();
    this.board.start();
    this.updateMoveList();
    this.updateStatus();
  },

  undoMove() {
    this.game.undo();
    this.board.position(this.game.fen());
    this.updateMoveList();
    this.updateStatus();
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
