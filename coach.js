'use strict';

/**
 * Coach AI Module — Phase 3
 *
 * Handles all LLM integration:
 *  - API key management (ACC-18)
 *  - 4-layer coaching prompt system with cache breakpoints (ACC-19)
 *  - Context window construction per move (ACC-20)
 *  - Triage logic — when to call the API (ACC-21)
 *  - "Coach Me" on-demand button (ACC-22)
 *  - Consequence visualization — animate PV lines (ACC-23)
 *  - Coach panel UI — chat bubbles, move tags, clickable history (ACC-24)
 *  - Streaming response handling (ACC-25)
 */
const Coach = {

  // ── State ─────────────────────────────────────────────

  apiKey: null,
  messages: [],          // { id, moveIndex, text, type: 'auto'|'ondemand'|'system', variations?: [{moves, label}] }
  isStreaming: false,
  streamAbortController: null,
  lastCoachRequestTime: 0,
  RATE_LIMIT_MS: 5000,

  // WebLLM state (ACC-18 free tier)
  localEngine: null,           // WebLLM engine instance
  localModelLoading: false,
  localModelReady: false,
  localModelError: null,
  webGPUSupported: null,       // null = not checked, true/false after check
  LOCAL_MODEL_ID: 'Phi-3.5-mini-instruct-q4f16_1-MLC',

  // Consequence visualization state
  isShowingConsequence: false,
  consequenceTimeout: null,
  savedPosition: null,   // FEN to restore after consequence animation
  savedViewIndex: null,

  // ── Initialization ────────────────────────────────────

  init() {
    this.loadApiKey();
    this.cacheDOM();
    this.bindEvents();
    this.checkWebGPU();
    this.updateKeyUI();
    this.updateCoachPanel();

    // WebLLM model loading is triggered by the module script in index.html
    // once the library finishes importing. If apiKey is set, the free tier
    // is skipped entirely — the module script checks Coach.apiKey.
  },

  cacheDOM() {
    this.els = {
      coachMessages:   document.getElementById('coach-messages'),
      btnCoach:        document.getElementById('btn-coach'),
      settingsModal:   document.getElementById('settings-modal'),
      apiKeyInput:     document.getElementById('api-key-input'),
      apiKeySave:      document.getElementById('api-key-save'),
      apiKeyClear:     document.getElementById('api-key-clear'),
      apiKeyStatus:    document.getElementById('api-key-status'),
      coachTier:       document.getElementById('coach-tier'),
    };
  },

  bindEvents() {
    // Coach Me button
    this.els.btnCoach.addEventListener('click', () => this.onCoachMe());

    // API key management
    this.els.apiKeySave.addEventListener('click', () => this.saveApiKey());
    this.els.apiKeyClear.addEventListener('click', () => this.clearApiKey());
    this.els.apiKeyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.saveApiKey();
    });
  },

  // ── WebGPU Detection & WebLLM Setup (ACC-18 free tier) ─

  checkWebGPU() {
    this.webGPUSupported = !!navigator.gpu;
  },

  async initLocalModel() {
    // Skip if API key is present (premium tier active)
    if (this.apiKey) return;

    // Skip if already loading or ready
    if (this.localModelLoading || this.localModelReady) return;

    // Check WebGPU support
    if (!this.webGPUSupported) {
      this.localModelError = 'no-webgpu';
      this.updateCoachPanel();
      return;
    }

    // Check if WebLLM library is loaded
    if (typeof webllm === 'undefined') {
      this.localModelError = 'no-library';
      this.updateCoachPanel();
      return;
    }

    this.localModelLoading = true;
    this.updateCoachPanel();
    this.updateKeyUI();

    try {
      this.localEngine = await webllm.CreateMLCEngine(this.LOCAL_MODEL_ID, {
        initProgressCallback: (progress) => {
          this.onLocalModelProgress(progress);
        },
      });

      this.localModelReady = true;
      this.localModelLoading = false;
      this.localModelError = null;
      this.updateCoachPanel();
      this.updateKeyUI();
      this.updateCoachButton();
    } catch (err) {
      this.localModelLoading = false;
      this.localModelError = err.message || 'Failed to load model';
      this.updateCoachPanel();
      console.error('WebLLM init error:', err);
    }
  },

  onLocalModelProgress(progress) {
    const bar = document.getElementById('local-model-progress');
    const text = document.getElementById('local-model-progress-text');
    if (bar && progress.progress !== undefined) {
      bar.value = progress.progress;
    }
    if (text) {
      text.textContent = progress.text || 'Loading model...';
    }
  },

  // ── API Key Management (ACC-18) ───────────────────────

  loadApiKey() {
    this.apiKey = localStorage.getItem('chess-coach-api-key') || null;
  },

  saveApiKey() {
    const raw = this.els.apiKeyInput.value.trim();
    if (!raw) return;

    // Basic validation: Anthropic keys start with sk-ant-
    if (!raw.startsWith('sk-ant-')) {
      this.els.apiKeyStatus.textContent = 'Invalid key format — should start with sk-ant-';
      this.els.apiKeyStatus.className = 'api-key-status error';
      return;
    }

    this.apiKey = raw;
    localStorage.setItem('chess-coach-api-key', raw);
    this.els.apiKeyInput.value = '';
    this.updateKeyUI();
    App.showToast('API key saved — premium coach active');
  },

  clearApiKey() {
    this.apiKey = null;
    localStorage.removeItem('chess-coach-api-key');
    this.updateKeyUI();
    this.updateCoachPanel();
    App.showToast('API key cleared — reverting to free built-in coach');

    // Start loading local model if not already loaded
    if (!this.localModelReady && !this.localModelLoading) {
      this.initLocalModel();
    }
  },

  updateKeyUI() {
    const hasKey = !!this.apiKey;
    this.els.apiKeyInput.value = '';
    this.els.apiKeyClear.style.display = hasKey ? '' : 'none';

    if (hasKey) {
      const masked = this.apiKey.slice(0, 10) + '...' + this.apiKey.slice(-4);
      this.els.apiKeyStatus.textContent = 'Premium coach active (' + masked + ')';
      this.els.apiKeyStatus.className = 'api-key-status active';
      this.els.apiKeyInput.placeholder = 'Key saved — enter a new one to replace';
    } else {
      this.els.apiKeyStatus.textContent = 'No API key — using free built-in coach. Add a key for premium coaching.';
      this.els.apiKeyStatus.className = 'api-key-status';
      this.els.apiKeyInput.placeholder = 'sk-ant-...';
    }

    // Update tier badge
    if (this.els.coachTier) {
      if (hasKey) {
        this.els.coachTier.textContent = 'Claude AI';
        this.els.coachTier.className = 'coach-tier premium';
      } else if (this.localModelReady) {
        this.els.coachTier.textContent = 'Built-in';
        this.els.coachTier.className = 'coach-tier free';
      } else if (this.localModelLoading) {
        this.els.coachTier.textContent = 'Loading...';
        this.els.coachTier.className = 'coach-tier loading';
      } else {
        this.els.coachTier.textContent = 'No Coach';
        this.els.coachTier.className = 'coach-tier';
      }
    }

    // Enable/disable Coach Me button based on available backend + game state
    this.updateCoachButton();
  },

  /** Returns true if any coaching backend (Claude API or local model) is available */
  isCoachAvailable() {
    return !!this.apiKey || this.localModelReady;
  },

  updateCoachButton() {
    const hasBackend = this.isCoachAvailable();
    const hasGame = App.fullHistory.length > 0;
    this.els.btnCoach.disabled = !hasBackend || !hasGame || this.isStreaming;

    if (!hasBackend && this.localModelLoading) {
      this.els.btnCoach.title = 'Coach model is downloading...';
    } else if (!hasBackend) {
      this.els.btnCoach.title = 'Waiting for coach to load, or add a Claude API key in Settings';
    } else if (this.isStreaming) {
      this.els.btnCoach.title = 'Coach is thinking...';
    } else if (!hasGame) {
      this.els.btnCoach.title = 'Play some moves first';
    } else {
      this.els.btnCoach.title = 'Get coaching on the current position';
    }
  },

  // ── 4-Layer Prompt System (ACC-19) ────────────────────
  //
  // Layer 1 (Persona)         — cached across entire session
  // Layer 2 (Skill Calibration) — cached across session (changes only if user changes level)
  // Layer 3 (Game Context)    — cached within a game
  // Layer 4 (Move Context)    — dynamic per call

  buildSystemPrompt(skillLevel, openingName) {
    // Layers 1 + 2: Static persona + skill calibration
    // These are combined into the first cache breakpoint
    const layer1and2 = this.getPersonaAndSkillPrompt(skillLevel);

    // Layer 3: Game context (second cache breakpoint)
    const layer3 = this.getGameContextPrompt(openingName);

    return layer1and2 + '\n\n' + layer3;
  },

  getPersonaAndSkillPrompt(skillLevel) {
    const skillInstructions = {
      beginner: `The player is a BEGINNER. Use simple, everyday language. Never use algebraic notation — describe moves as "the knight on the right side" or "your bishop." Use analogies (e.g., "your rook is like a guard watching an open hallway"). Keep explanations to 2-3 sentences max. Focus on one idea at a time. When explaining why a move is bad, focus on the most tangible consequence ("you'll lose your bishop") rather than abstract concepts.`,

      intermediate: `The player is INTERMEDIATE. Use standard algebraic notation (Nf3, Bxe5). You can reference positional concepts (open files, weak squares, piece activity, pawn structure) but briefly explain each one the first time. Keep explanations to 3-4 sentences. You can mention broader strategic themes like "you want to control the center" or "this weakens your dark squares."`,

      advanced: `The player is ADVANCED. Use precise technical language — prophylaxis, outpost squares, minority attack, pawn breaks, piece coordination, initiative. Reference named plans and structures (e.g., "the typical Carlsbad structure plan with a minority attack on the queenside"). Be concise — 2-3 sentences of high-density insight. Don't explain basic concepts. Focus on the subtlety of why the engine's move is better — the positional nuance, not just the tactical line.`
    };

    return `You are a Grandmaster-level chess coach with infinite patience and genuine warmth. You love teaching and you believe every player can improve.

Your coaching style:
- You teach concepts, not just moves. When a player makes an inaccuracy, explain the PRINCIPLE they violated, not just the better move.
- You use the Socratic method when appropriate — ask questions that guide the player to understand, rather than just telling them the answer.
- You celebrate genuinely good moves — positive reinforcement is as important as correction.
- You NEVER say "you blundered" or make the player feel bad. You say things like "this is a common pattern — let me show you what to look for next time."
- When explaining a variation, reference at most 4-5 moves. Keep it visual and concrete.
- You speak in a warm, human voice — like a patient mentor, not a textbook or an engine.

${skillInstructions[skillLevel] || skillInstructions.intermediate}

IMPORTANT FORMATTING RULES:
- Keep your response concise — 2-4 sentences for most positions.
- If you reference a sequence of moves to show consequences, format them on their own line as: **Show me:** 1. move1 move2 2. move3 move4
- The "Show me" line must use standard algebraic notation regardless of skill level (the app will animate them on the board).
- Only include ONE "Show me" line per response, showing the most critical variation.
- Never start your response with "As a chess coach" or similar self-references. Just coach naturally.`;
  },

  getGameContextPrompt(openingName) {
    let context = 'CURRENT GAME CONTEXT:';
    if (openingName) {
      context += `\nOpening: ${openingName}`;
    }
    return context;
  },

  /**
   * Simplified system prompt for the local WebLLM model (ACC-19).
   * Shorter to fit the smaller context window of in-browser models.
   */
  buildLocalSystemPrompt(skillLevel) {
    const skillNote = {
      beginner: 'The player is a beginner. Use simple language, no algebraic notation. Keep it to 2 sentences.',
      intermediate: 'The player is intermediate. Use algebraic notation. Keep it to 2-3 sentences.',
      advanced: 'The player is advanced. Use technical terms. Be concise — 2 sentences max.',
    };

    return `You are a patient chess coach. Explain chess positions clearly.
${skillNote[skillLevel] || skillNote.intermediate}
If you suggest a move sequence, write it as: **Show me:** 1. move1 move2 2. move3 move4
Never say "As a chess coach." Just coach naturally.`;
  },

  // ── Context Window Per Move (ACC-20) ──────────────────

  buildMoveContext(moveIndex, triggerType) {
    const history = App.fullHistory;
    const evals = App.evaluations;

    if (moveIndex < 1 || moveIndex > history.length) return null;

    const move = history[moveIndex - 1];
    const isWhiteMove = ((moveIndex - 1) % 2 === 0);
    const moveNumber = Math.ceil(moveIndex / 2);

    // FEN after the move
    const tempGame = new Chess();
    for (let i = 0; i < moveIndex; i++) {
      tempGame.move(history[i].san);
    }
    const fen = tempGame.fen();

    // Evals before and after
    const evalBefore = evals[moveIndex - 1];
    const evalAfter = evals[moveIndex];

    // Format eval for display
    const formatEval = (ev) => {
      if (!ev) return 'unknown';
      if (ev.score.type === 'mate') {
        return (ev.score.value > 0 ? '+' : '') + 'M' + Math.abs(ev.score.value);
      }
      const pawns = (ev.score.value / 100).toFixed(1);
      return (ev.score.value >= 0 ? '+' : '') + pawns;
    };

    // Engine's best move (from PV of the position before the move)
    const bestMove = evalBefore && evalBefore.pv && evalBefore.pv.length > 0
      ? evalBefore.pv[0]
      : 'unknown';

    // Classification
    const classification = App._moveClassifications
      ? App._moveClassifications[moveIndex - 1]
      : null;

    // Recent moves (last 5-6 moves for context)
    const recentStart = Math.max(0, moveIndex - 6);
    let recentMoves = '';
    const tempRecent = new Chess();
    for (let i = 0; i < recentStart; i++) {
      tempRecent.move(history[i].san);
    }
    for (let i = recentStart; i < moveIndex; i++) {
      const mn = Math.ceil((i + 1) / 2);
      if (i % 2 === 0) recentMoves += `${mn}. `;
      recentMoves += history[i].san + ' ';
      tempRecent.move(history[i].san);
    }

    // Build descriptive form of the move
    const descriptive = this.describeMove(move);

    // PV line (engine's best continuation from after this move)
    const pvLine = evalAfter && evalAfter.pv ? evalAfter.pv.slice(0, 6).join(' ') : '';

    let context = `MOVE CONTEXT:
FEN: ${fen}
Move played: ${move.san} (${descriptive})
Move number: ${moveNumber} (${isWhiteMove ? 'White' : 'Black'})
Eval before: ${formatEval(evalBefore)} | Eval after: ${formatEval(evalAfter)}
Engine's best move was: ${bestMove}
Classification: ${classification ? classification.toUpperCase() : 'UNKNOWN'}
Recent moves: ${recentMoves.trim()}`;

    if (pvLine) {
      context += `\nEngine's main line from here: ${pvLine}`;
    }

    // Add trigger type context
    const triggerDescriptions = {
      'great_move':              'You are responding to a GREAT MOVE. Reinforce the concept — explain why this was strong, not just that it was good.',
      'positional_inaccuracy':   'You are responding to a POSITIONAL INACCURACY. The player made a subtle mistake. Explain the principle they missed — the "why" that\'s invisible to them. This is the most valuable kind of coaching.',
      'phase_transition':        'You are responding to a PHASE TRANSITION (entering endgame, position shifting). Comment on what changes about the priorities and what the player should focus on now.',
      'on_demand':               'The player clicked "Coach Me" and wants your take on this position. Give a strategic read — what\'s the key idea, who stands better and why, what should they be thinking about.',
      'on_demand_after_blunder': 'The player clicked "Coach Me" after an obvious blunder. They explicitly asked, so respond — but focus on the lesson and the pattern to avoid, not on pointing out the obvious mistake.',
    };

    if (triggerDescriptions[triggerType]) {
      context += '\n\n' + triggerDescriptions[triggerType];
    }

    return context;
  },

  describeMove(move) {
    const pieceNames = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
    const piece = pieceNames[move.piece] || 'pawn';
    const captured = move.captured ? ` captures ${pieceNames[move.captured] || 'piece'}` : '';
    const check = move.san.includes('+') ? ' with check' : '';
    const checkmate = move.san.includes('#') ? ' with checkmate' : '';

    if (move.san === 'O-O') return 'kingside castle';
    if (move.san === 'O-O-O') return 'queenside castle';

    return `${piece} from ${move.from} to ${move.to}${captured}${check}${checkmate}`;
  },

  // ── Triage Logic (ACC-21) ─────────────────────────────
  //
  // Returns: null (stay silent) or a trigger type string

  triageMove(moveIndex) {
    // Need at least one backend available (ACC-21: routing for both tiers)
    if (!this.isCoachAvailable()) return null;

    const classification = App._moveClassifications
      ? App._moveClassifications[moveIndex - 1]
      : null;

    if (!classification) return null;

    // Coach SPEAKS on:
    // 1. Positional inaccuracies — the subtle "why" is invisible
    if (classification === 'inaccuracy') {
      return 'positional_inaccuracy';
    }

    // 2. Brilliant/great moves — reinforce good play
    if (classification === 'brilliant' || classification === 'great') {
      return 'great_move';
    }

    // 3. Phase transitions — detect endgame entry
    if (this.isPhaseTransition(moveIndex)) {
      return 'phase_transition';
    }

    // Coach STAYS SILENT on:
    // - Obvious blunders (icon/eval bar says it all)
    // - Mistakes (similar — the eval drop is visible)
    // - Good/book moves (no news is good news)
    // - Forced moves (recaptures, escaping check)
    return null;
  },

  isPhaseTransition(moveIndex) {
    if (moveIndex < 2) return false;

    const history = App.fullHistory;
    const move = history[moveIndex - 1];
    if (!move) return false;

    // Detect queen trade (both queens off the board)
    const tempBefore = new Chess();
    for (let i = 0; i < moveIndex - 1; i++) {
      tempBefore.move(history[i].san);
    }

    const tempAfter = new Chess();
    for (let i = 0; i < moveIndex; i++) {
      tempAfter.move(history[i].san);
    }

    const fenBefore = tempBefore.fen();
    const fenAfter = tempAfter.fen();

    const queensBefore = (fenBefore.match(/[qQ]/g) || []).length;
    const queensAfter = (fenAfter.match(/[qQ]/g) || []).length;

    // Queen trade just happened
    if (queensBefore === 2 && queensAfter <= 0) {
      return true;
    }

    // Detect entering endgame: few pieces left
    const piecesAfter = fenAfter.split(' ')[0].replace(/[0-9/]/g, '');
    const nonPawnPieces = piecesAfter.replace(/[pPkK]/g, '').length;

    // Check if we just crossed the endgame threshold
    if (nonPawnPieces <= 6) {
      const piecesBefore = fenBefore.split(' ')[0].replace(/[0-9/]/g, '');
      const nonPawnBefore = piecesBefore.replace(/[pPkK]/g, '').length;
      if (nonPawnBefore > 6) {
        return true;
      }
    }

    return false;
  },

  // ── Coach Me Button (ACC-22) ──────────────────────────

  onCoachMe() {
    if (!this.isCoachAvailable()) {
      if (this.localModelLoading) {
        App.showToast('Coach model is still downloading...');
      } else {
        App.showToast('No coach available — wait for model to load or add a Claude API key');
      }
      return;
    }

    if (this.isStreaming) {
      App.showToast('Coach is already thinking...');
      return;
    }

    // Rate limiting
    const now = Date.now();
    if (now - this.lastCoachRequestTime < this.RATE_LIMIT_MS) {
      const wait = Math.ceil((this.RATE_LIMIT_MS - (now - this.lastCoachRequestTime)) / 1000);
      App.showToast(`Please wait ${wait}s before asking again`);
      return;
    }

    const moveIndex = App.viewIndex;
    if (moveIndex === 0) {
      App.showToast('Play some moves first');
      return;
    }

    // Determine trigger type for on-demand
    const classification = App._moveClassifications
      ? App._moveClassifications[moveIndex - 1]
      : null;

    let triggerType = 'on_demand';
    if (classification === 'blunder' || classification === 'mistake') {
      triggerType = 'on_demand_after_blunder';
    }

    this.requestCoaching(moveIndex, triggerType);
  },

  // ── Auto-Coach on Move (called from App after eval completes) ──

  onMoveEvaluated(moveIndex) {
    const triggerType = this.triageMove(moveIndex);
    if (triggerType) {
      this.requestCoaching(moveIndex, triggerType);
    }
  },

  // ── Coaching Request Router (ACC-21 routing + ACC-25 dual backend) ──

  async requestCoaching(moveIndex, triggerType) {
    if (!this.isCoachAvailable() || this.isStreaming) return;

    const userMessage = this.buildMoveContext(moveIndex, triggerType);
    if (!userMessage) return;

    this.lastCoachRequestTime = Date.now();
    this.isStreaming = true;
    this.updateCoachButton();

    // Add a placeholder message that will be streamed into
    const msgId = 'msg-' + Date.now();
    const messageObj = {
      id: msgId,
      moveIndex: moveIndex,
      text: '',
      type: triggerType === 'on_demand' || triggerType === 'on_demand_after_blunder' ? 'ondemand' : 'auto',
      variations: [],
      isStreaming: true,
    };
    this.messages.push(messageObj);
    this.renderMessage(messageObj);
    this.scrollToBottom();

    try {
      // Route to the appropriate backend (ACC-21)
      if (this.apiKey) {
        await this.requestCoachingClaude(msgId, messageObj, triggerType, userMessage);
      } else {
        await this.requestCoachingLocal(msgId, messageObj, triggerType, userMessage);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        messageObj.text = '(Cancelled)';
      } else {
        messageObj.text = `Coach unavailable: ${err.message}`;
        messageObj.type = 'system';
      }
      messageObj.isStreaming = false;
      this.finalizeMessage(msgId, messageObj);
    } finally {
      this.isStreaming = false;
      this.streamAbortController = null;
      this.updateCoachButton();
    }
  },

  // ── Claude API Backend (ACC-25 premium) ───────────────

  async requestCoachingClaude(msgId, messageObj, triggerType, userMessage) {
    const skillLevel = App.els.skillLevel.value;
    const openingName = ''; // Phase 4 will add opening detection

    // Determine model: Sonnet for positional inaccuracies, Haiku for everything else
    const model = triggerType === 'positional_inaccuracy'
      ? 'claude-sonnet-4-20250514'
      : 'claude-haiku-4-20250414';

    this.streamAbortController = new AbortController();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 300,
        system: [
          {
            type: 'text',
            text: this.getPersonaAndSkillPrompt(skillLevel),
            cache_control: { type: 'ephemeral' }
          },
          {
            type: 'text',
            text: this.getGameContextPrompt(openingName),
            cache_control: { type: 'ephemeral' }
          }
        ],
        messages: [
          { role: 'user', content: userMessage }
        ],
        stream: true,
      }),
      signal: this.streamAbortController.signal,
    });

    if (!response.ok) {
      const errBody = await response.text();
      let errMsg = 'API error';
      try {
        const parsed = JSON.parse(errBody);
        errMsg = parsed.error?.message || `HTTP ${response.status}`;
      } catch {
        errMsg = `HTTP ${response.status}`;
      }
      throw new Error(errMsg);
    }

    // Stream SSE response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const event = JSON.parse(data);

          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            messageObj.text += event.delta.text;
            this.updateStreamingMessage(msgId, messageObj.text);
          }

          if (event.type === 'message_stop') {
            break;
          }

          if (event.type === 'error') {
            throw new Error(event.error?.message || 'Stream error');
          }
        } catch (parseErr) {
          if (parseErr.message !== 'Stream error' && !parseErr.message.includes('API')) continue;
          throw parseErr;
        }
      }
    }

    // Finalize the message
    messageObj.isStreaming = false;
    messageObj.variations = this.parseVariations(messageObj.text);
    this.finalizeMessage(msgId, messageObj);
  },

  // ── WebLLM Local Backend (ACC-25 free tier) ───────────

  async requestCoachingLocal(msgId, messageObj, triggerType, userMessage) {
    if (!this.localEngine) throw new Error('Local model not loaded');

    const skillLevel = App.els.skillLevel.value;
    const systemPrompt = this.buildLocalSystemPrompt(skillLevel);

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    // Use WebLLM streaming (ACC-25: stream tokens from the in-browser model)
    const chunks = await this.localEngine.chat.completions.create({
      messages: messages,
      max_tokens: 200,
      temperature: 0.7,
      stream: true,
    });

    for await (const chunk of chunks) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        messageObj.text += delta;
        this.updateStreamingMessage(msgId, messageObj.text);
      }
    }

    // Finalize the message
    messageObj.isStreaming = false;
    messageObj.variations = this.parseVariations(messageObj.text);
    this.finalizeMessage(msgId, messageObj);
  },

  // ── Variation Parsing (for Consequence Visualization, ACC-23) ──

  parseVariations(text) {
    // Look for "**Show me:** 1. e4 e5 2. Nf3 Nc6" patterns
    const showMeRegex = /\*\*Show me:\*\*\s*(.+?)(?:\n|$)/gi;
    const variations = [];
    let match;

    while ((match = showMeRegex.exec(text)) !== null) {
      const moveText = match[1].trim();
      // Parse algebraic notation: "1. e4 e5 2. Nf3 Nc6"
      const moves = moveText
        .replace(/\d+\.\s*/g, '')  // Remove move numbers
        .split(/\s+/)
        .filter(m => m.length > 0 && m !== '...');

      if (moves.length > 0) {
        variations.push({ moves, label: 'Show me', rawText: moveText });
      }
    }

    return variations;
  },

  // ── Consequence Visualization (ACC-23) ────────────────

  showConsequence(variation) {
    if (this.isShowingConsequence) {
      this.restorePosition();
      return;
    }

    // Save the current board state
    this.savedPosition = App.game.fen();
    this.savedViewIndex = App.viewIndex;
    this.isShowingConsequence = true;

    // Create a temporary game from current position
    const tempGame = new Chess(this.savedPosition);
    const validMoves = [];

    // Validate each move in the variation
    for (const moveStr of variation.moves) {
      const result = tempGame.move(moveStr, { sloppy: true });
      if (!result) break;
      validMoves.push(result);
    }

    if (validMoves.length === 0) {
      this.isShowingConsequence = false;
      App.showToast('Could not animate this variation');
      return;
    }

    // Show consequence indicator
    this.showConsequenceOverlay(true);

    // Animate moves one per second
    let i = 0;
    const animateGame = new Chess(this.savedPosition);

    const animateNext = () => {
      if (i >= validMoves.length || !this.isShowingConsequence) {
        return;
      }

      animateGame.move(validMoves[i].san);
      App.board.position(animateGame.fen());

      i++;
      if (i < validMoves.length && this.isShowingConsequence) {
        this.consequenceTimeout = setTimeout(animateNext, 1000);
      }
    };

    animateNext();
  },

  restorePosition() {
    if (!this.isShowingConsequence) return;

    clearTimeout(this.consequenceTimeout);
    this.isShowingConsequence = false;

    if (this.savedPosition) {
      App.board.position(this.savedPosition);
    }

    this.showConsequenceOverlay(false);
    this.savedPosition = null;
    this.savedViewIndex = null;
  },

  showConsequenceOverlay(show) {
    const existing = document.getElementById('consequence-overlay');
    if (!show) {
      if (existing) existing.remove();
      return;
    }

    if (existing) return;

    const overlay = document.createElement('div');
    overlay.id = 'consequence-overlay';
    overlay.className = 'consequence-overlay';
    overlay.innerHTML = `
      <span class="consequence-label">Showing variation</span>
      <button class="consequence-back" id="consequence-back">Back to game</button>
    `;
    App.els.board.parentElement.appendChild(overlay);
    document.getElementById('consequence-back').addEventListener('click', () => this.restorePosition());
  },

  // ── Coach Panel UI (ACC-24) ───────────────────────────

  renderMessage(msg) {
    // Remove the placeholder if it exists
    const placeholder = this.els.coachMessages.querySelector('.coach-placeholder');
    if (placeholder) placeholder.remove();

    const bubble = document.createElement('div');
    bubble.className = `coach-bubble ${msg.type}${msg.isStreaming ? ' streaming' : ''}`;
    bubble.id = msg.id;
    bubble.setAttribute('data-move-index', msg.moveIndex);

    const moveNum = Math.ceil(msg.moveIndex / 2);
    const side = (msg.moveIndex - 1) % 2 === 0 ? 'W' : 'B';

    bubble.innerHTML = `
      <div class="coach-bubble-header">
        <span class="coach-move-tag" title="Click to view this position">${moveNum}${side === 'W' ? '.' : '...'}</span>
        <span class="coach-trigger-badge ${msg.type}">${msg.type === 'ondemand' ? 'Asked' : msg.type === 'auto' ? 'Auto' : ''}</span>
      </div>
      <div class="coach-bubble-text">${msg.isStreaming ? '<span class="typing-indicator"></span>' : this.formatCoachText(msg.text, msg.variations)}</div>
    `;

    // Click on move tag to navigate
    const moveTag = bubble.querySelector('.coach-move-tag');
    moveTag.addEventListener('click', () => {
      if (!this.isShowingConsequence) {
        App.goToMove(msg.moveIndex);
      }
    });

    this.els.coachMessages.appendChild(bubble);
  },

  updateStreamingMessage(msgId, text) {
    const bubble = document.getElementById(msgId);
    if (!bubble) return;

    const textEl = bubble.querySelector('.coach-bubble-text');
    if (textEl) {
      textEl.innerHTML = this.escapeHtml(text) + '<span class="typing-indicator"></span>';
    }

    this.scrollToBottom();
  },

  finalizeMessage(msgId, msg) {
    const bubble = document.getElementById(msgId);
    if (!bubble) return;

    bubble.classList.remove('streaming');

    const textEl = bubble.querySelector('.coach-bubble-text');
    if (textEl) {
      textEl.innerHTML = this.formatCoachText(msg.text, msg.variations);
    }

    // Bind variation buttons
    bubble.querySelectorAll('.show-me-btn').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        if (msg.variations[i]) {
          this.showConsequence(msg.variations[i]);
        }
      });
    });

    this.scrollToBottom();
  },

  formatCoachText(text, variations) {
    if (!text) return '';

    // Escape HTML
    let html = this.escapeHtml(text);

    // Replace **Show me:** lines with clickable buttons
    html = html.replace(
      /\*\*Show me:\*\*\s*(.+?)(?:\n|$)/gi,
      (match, moves) => {
        return `<button class="show-me-btn" title="Animate this variation on the board">Show me: ${moves.trim()}</button>\n`;
      }
    );

    // Basic markdown: **bold**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  updateCoachPanel() {
    const container = this.els.coachMessages;
    if (this.messages.length > 0) return; // Don't overwrite existing messages

    if (this.apiKey) {
      // Premium tier — ready to go
      container.innerHTML = '<p class="coach-placeholder">Play a game and the coach will offer insights on key positions.</p>';
    } else if (this.localModelReady) {
      // Free tier — model loaded and ready
      container.innerHTML = '<p class="coach-placeholder">Free built-in coach ready! Play a game and the coach will offer insights on key positions.</p>';
    } else if (this.localModelLoading) {
      // Free tier — model downloading (ACC-18: progress bar)
      container.innerHTML = `
        <div class="coach-loading">
          <p class="coach-loading-title">Downloading your chess coach...</p>
          <progress id="local-model-progress" class="model-progress" value="0" max="1"></progress>
          <p id="local-model-progress-text" class="coach-loading-text">Preparing model...</p>
          <p class="coach-loading-hint">One-time download (~1-2 GB). Cached for future visits.</p>
        </div>`;
    } else if (this.localModelError === 'no-webgpu') {
      // No WebGPU support (ACC-18: fallback message)
      container.innerHTML = `
        <div class="coach-fallback">
          <p>Your browser doesn't support the built-in coach (requires WebGPU).</p>
          <p>Add a <strong>Claude API key</strong> in Settings for AI coaching, or use <strong>Chrome/Edge</strong> for the free built-in coach.</p>
        </div>`;
    } else if (this.localModelError === 'no-library') {
      // WebLLM library failed to load
      container.innerHTML = `
        <div class="coach-fallback">
          <p>Could not load the built-in coach library.</p>
          <p>Add a <strong>Claude API key</strong> in Settings for AI coaching.</p>
        </div>`;
    } else if (this.localModelError) {
      // Other model loading error
      container.innerHTML = `
        <div class="coach-fallback">
          <p>Built-in coach failed to load: ${this.escapeHtml(this.localModelError)}</p>
          <p>Add a <strong>Claude API key</strong> in Settings for AI coaching.</p>
        </div>`;
    } else {
      // Initial state before loading starts
      container.innerHTML = '<p class="coach-placeholder">Initializing coach...</p>';
    }
  },

  scrollToBottom() {
    const el = this.els.coachMessages;
    el.scrollTop = el.scrollHeight;
  },

  // Reset coach state for a new game (preserves model/key state)
  resetForNewGame() {
    this.messages = [];
    this.isStreaming = false;
    if (this.streamAbortController) {
      this.streamAbortController.abort();
      this.streamAbortController = null;
    }
    this.restorePosition();
    // Note: localEngine, apiKey, localModelReady are preserved across games
    this.updateCoachPanel();
    this.updateCoachButton();
  },
};
