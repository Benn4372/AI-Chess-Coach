'use strict';

const App = {
  els: {},
  board: null,
  orientation: 'white',

  init() {
    this.cacheDOM();
    this.bindEvents();
    this.loadTheme();
    this.initBoard();
  },

  cacheDOM() {
    this.els = {
      board: document.getElementById('board'),
      moveList: document.getElementById('move-list'),
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
    this.els.btnReset.addEventListener('click', () => this.resetBoard());

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

  initBoard() {
    this.board = Chessboard('board', {
      draggable: true,
      position: 'start',
      orientation: this.orientation,
      pieceTheme: 'assets/pieces/wikipedia/{piece}.png',
      onDragStart: (source, piece) => this.onDragStart(source, piece),
      onDrop: (source, target) => this.onDrop(source, target),
      onSnapEnd: () => this.onSnapEnd(),
    });

  },

  onDragStart(source, piece) {
    // Placeholder — chess.js validation will be added in ACC-10
  },

  onDrop(source, target) {
    // Placeholder — chess.js validation will be added in ACC-10
  },

  onSnapEnd() {
    // Placeholder — sync board position after animation
  },

  flipBoard() {
    this.orientation = this.orientation === 'white' ? 'black' : 'white';
    this.board.orientation(this.orientation);
  },

  resetBoard() {
    this.board.start();
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
