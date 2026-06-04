'use strict';

const App = {
  els: {},

  init() {
    this.cacheDOM();
    this.bindEvents();
    this.loadTheme();
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
};

document.addEventListener('DOMContentLoaded', () => App.init());
