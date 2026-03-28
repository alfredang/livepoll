/**
 * app.js — LivePoll main application controller
 */
const App = {
  role: null,           // 'host' | 'participant'
  currentCode: null,
  pollData: null,
  listeners: [],        // cleanup functions
  myAnswer: null,
  dashboardPolls: [],

  // ── Init ──────────────────────────────────────────────

  async init() {
    await Sync.init();
    await Sync.waitForAuth();

    Sync.onAuth(user => this._onAuthStateChanged(user));

    // Check URL for ?join=CODE
    const params = new URLSearchParams(window.location.search);
    const code = params.get('join');
    if (code) {
      window.history.replaceState({}, '', window.location.pathname);
      setTimeout(() => this.startJoin(code), 200);
    } else {
      this.showScreen('home');
    }

    this._bindHome();
    this._bindCreate();
    this._bindHost();
    this._bindJoin();
    this._bindAuth();
    this._bindDashboard();
    this._bindShare();
    this._bindMisc();
  },

  // ── Screen Management ────────────────────────────────

  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(`screen-${id}`);
    if (el) el.classList.add('active');
  },

  // ── Auth State ──────────────────────────────────────

  _onAuthStateChanged(user) {
    const signInBtn   = document.getElementById('btnSignIn');
    const profileArea = document.getElementById('userProfile');
    const avatarImg   = document.getElementById('userAvatar');

    if (user) {
      signInBtn.style.display = 'none';
      profileArea.style.display = 'flex';
      avatarImg.src = user.photoURL || '';
      avatarImg.alt = user.displayName || 'User';

      document.getElementById('dropdownAvatar').src = user.photoURL || '';
      document.getElementById('dropdownName').textContent = user.displayName || 'User';
      document.getElementById('dropdownEmail').textContent = user.email || '';
    } else {
      signInBtn.style.display = 'inline-flex';
      profileArea.style.display = 'none';
      document.getElementById('userDropdown').style.display = 'none';
    }
  },

  _bindAuth() {
    document.getElementById('btnSignIn').onclick = async () => {
      await Sync.signInWithGoogle();
    };

    document.getElementById('btnUserMenu').onclick = (e) => {
      e.stopPropagation();
      const dropdown = document.getElementById('userDropdown');
      const isOpen = dropdown.style.display !== 'none';
      dropdown.style.display = isOpen ? 'none' : 'block';

      if (!isOpen) {
        const rect = document.getElementById('btnUserMenu').getBoundingClientRect();
        dropdown.style.top = (rect.bottom + 8) + 'px';
        dropdown.style.right = (window.innerWidth - rect.right) + 'px';
      }
    };

    document.addEventListener('click', () => {
      document.getElementById('userDropdown').style.display = 'none';
    });

    document.getElementById('btnMyPolls').onclick = () => {
      this._openDashboard();
    };

    document.getElementById('btnDropdownMyPolls').onclick = () => {
      document.getElementById('userDropdown').style.display = 'none';
      this._openDashboard();
    };

    document.getElementById('btnSignOut').onclick = async () => {
      document.getElementById('userDropdown').style.display = 'none';
      await Sync.signOut();
      this.showScreen('home');
    };
  },

  // ── Dashboard ──────────────────────────────────────

  _bindDashboard() {
    document.getElementById('btnBackFromDashboard').onclick = () => {
      this.showScreen('home');
    };

    document.getElementById('btnEmptyCreate').onclick = () => {
      this.showScreen('create');
    };

    document.getElementById('btnBackFromPollDetail').onclick = () => {
      this._openDashboard();
    };

    document.getElementById('btnDuplicatePoll').onclick = () => {
      this._duplicatePoll(this._detailPoll);
    };
  },

  async _openDashboard() {
    if (!Sync.isLoggedIn()) return;

    const listEl    = document.getElementById('dashboardList');
    const emptyEl   = document.getElementById('dashboardEmpty');
    const loadingEl = document.getElementById('dashboardLoading');

    listEl.innerHTML = '';
    emptyEl.style.display = 'none';
    loadingEl.style.display = 'flex';

    this.showScreen('dashboard');

    try {
      const polls = await Poll.getUserPolls(Sync.currentUser.uid);
      this.dashboardPolls = polls;

      loadingEl.style.display = 'none';

      if (polls.length === 0) {
        emptyEl.style.display = 'flex';
        return;
      }

      polls.forEach(poll => {
        const card = document.createElement('div');
        card.className = 'poll-card';
        card.dataset.code = poll.code;

        const statusClass = poll.status === 'ended' ? 'status-ended'
                          : (poll.status === 'active' || poll.status === 'showing_results') ? 'status-active'
                          : 'status-lobby';
        const statusLabel = poll.status === 'ended' ? 'Ended'
                          : (poll.status === 'active' || poll.status === 'showing_results') ? 'Live'
                          : 'Lobby';

        const date = poll.createdAt
          ? new Date(poll.createdAt).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric'
            })
          : '';

        card.innerHTML = `
          <div class="poll-card-header">
            <h3 class="poll-card-title">${this._escapeHtml(poll.title)}</h3>
            <span class="poll-card-status ${statusClass}">${statusLabel}</span>
          </div>
          <div class="poll-card-meta">
            <span>${poll.questionCount} question${poll.questionCount !== 1 ? 's' : ''}</span>
            <span class="meta-dot">·</span>
            <span>${poll.totalVotes} vote${poll.totalVotes !== 1 ? 's' : ''}</span>
            ${date ? `<span class="meta-dot">·</span><span>${date}</span>` : ''}
          </div>
        `;

        card.onclick = () => this._openPollDetail(poll);
        listEl.appendChild(card);
      });
    } catch (e) {
      console.error('[App] Failed to load dashboard:', e);
      loadingEl.style.display = 'none';
      listEl.innerHTML = '<p class="error-msg">Failed to load polls. Try again.</p>';
    }
  },

  _openPollDetail(poll) {
    this._detailCode = poll.code;
    this._detailTitle = poll.title;
    this._detailPoll = poll;
    document.getElementById('pollDetailTitle').textContent = poll.title;

    const metaEl = document.getElementById('pollDetailMeta');
    const date = poll.createdAt
      ? new Date(poll.createdAt).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric'
        })
      : '';
    metaEl.innerHTML = `
      <span>Code: ${poll.code}</span>
      <span class="meta-dot">·</span>
      <span>${poll.totalVotes} total votes</span>
      ${date ? `<span class="meta-dot">·</span><span>${date}</span>` : ''}
    `;

    const questionsEl = document.getElementById('pollDetailQuestions');
    questionsEl.innerHTML = '';

    poll.questions.forEach((q, i) => {
      const block = document.createElement('div');
      block.className = 'detail-question-block';

      const responses = poll.responses ? poll.responses[q.id] : null;
      const counts = Poll.tallyVotes(responses, q.options);
      const totalQ = Object.values(counts).reduce((a, b) => a + b, 0);

      block.innerHTML = `
        <div class="detail-question-label">Question ${i + 1}</div>
        <h3 class="detail-question-text">${this._escapeHtml(q.text)}</h3>
        <div class="detail-chart chart-container"></div>
        <div class="detail-vote-count">${totalQ} vote${totalQ !== 1 ? 's' : ''}</div>
      `;

      questionsEl.appendChild(block);
      Charts.render(block.querySelector('.detail-chart'), q.options, counts, totalQ || 1);
    });

    // Show duplicate only for ended polls, show QR sidebar for live polls
    const isLive = poll.status === 'active' || poll.status === 'showing_results' || poll.status === 'lobby';
    document.getElementById('pollDetailActions').style.display = isLive ? 'none' : 'flex';

    const sidebar = document.getElementById('pollDetailSidebar');
    if (isLive) {
      sidebar.style.display = 'flex';
      const qrEl = document.getElementById('detailSidebarQr');
      qrEl.innerHTML = '';
      const url = this._getJoinUrl(poll.code);
      if (typeof QRCode !== 'undefined') {
        new QRCode(qrEl, { text: url, width: 120, height: 120, colorDark: '#0f0f0f', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
      }
      document.getElementById('detailSidebarCode').textContent = poll.code;
      document.getElementById('detailSidebarUrl').textContent = url;
    } else {
      sidebar.style.display = 'none';
    }

    this.showScreen('poll-detail');
  },

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  // ── Home ─────────────────────────────────────────────

  _bindHome() {
    document.getElementById('btnCreatePoll').onclick = () => this.showScreen('create');

    document.getElementById('btnHomeJoin').onclick = () => {
      const code = document.getElementById('homeJoinCode').value.trim();
      if (code.length === 6) this.startJoin(code);
      else this.showScreen('join');
    };

    document.getElementById('homeJoinCode').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btnHomeJoin').click();
    });

    document.getElementById('homeJoinCode').addEventListener('input', e => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    });
  },

  // ── Create ────────────────────────────────────────────

  _bindCreate() {
    document.getElementById('btnBackFromCreate').onclick = () => this.showScreen('home');

    document.getElementById('btnAddQuestion').onclick = () => this._addQuestion();

    document.getElementById('btnLaunchPoll').onclick = () => this.launchPoll();

    // Start with one question
    this._addQuestion();
  },

  _addQuestion() {
    const list = document.getElementById('questionsList');
    const idx  = list.children.length + 1;
    const card = document.createElement('div');
    card.className = 'question-card';
    card.dataset.idx = idx;
    card.innerHTML = `
      <div class="question-card-header">
        <span class="question-number">Question ${idx}</span>
        <button class="btn-remove-q" title="Remove">×</button>
      </div>
      <div class="form-section">
        <input type="text" class="input-field q-text" placeholder="Ask a question…" maxlength="200">
      </div>
      <div class="options-list"></div>
      <button class="btn-add-option">+ Add option</button>
    `;

    card.querySelector('.btn-remove-q').onclick = () => {
      card.remove();
      this._renumberQuestions();
    };

    card.querySelector('.btn-add-option').onclick = () => {
      this._addOption(card.querySelector('.options-list'));
    };

    // Add 2 default options
    this._addOption(card.querySelector('.options-list'), 'Option A');
    this._addOption(card.querySelector('.options-list'), 'Option B');

    list.appendChild(card);
  },

  _addOption(list, val = '') {
    const row = document.createElement('div');
    row.className = 'option-row';
    row.innerHTML = `
      <input type="text" class="option-input" placeholder="Option…" value="${val}" maxlength="100">
      <button class="btn-remove-opt" title="Remove">×</button>
    `;
    row.querySelector('.btn-remove-opt').onclick = () => row.remove();
    list.appendChild(row);
  },

  _renumberQuestions() {
    document.querySelectorAll('.question-card .question-number').forEach((el, i) => {
      el.textContent = `Question ${i + 1}`;
    });
  },

  _collectQuestions() {
    const cards = document.querySelectorAll('.question-card');
    const questions = [];
    for (const card of cards) {
      const text = card.querySelector('.q-text').value.trim();
      const options = [...card.querySelectorAll('.option-input')]
        .map(i => i.value.trim()).filter(Boolean);
      if (!text) { alert('Please fill in all question texts.'); return null; }
      if (options.length < 2) { alert('Each question needs at least 2 options.'); return null; }
      questions.push({ text, options });
    }
    if (!questions.length) { alert('Add at least one question.'); return null; }
    return questions;
  },

  async launchPoll() {
    const title = document.getElementById('pollTitle').value.trim() || 'Untitled Poll';
    const questions = this._collectQuestions();
    if (!questions) return;

    const btn = document.getElementById('btnLaunchPoll');
    btn.textContent = 'Launching…'; btn.disabled = true;

    try {
      const code = await Poll.create(title, questions);
      this.role = 'host';
      this.currentCode = code;
      this.pollData = await Poll.get(code);
      this._openLobby();
    } catch (e) {
      console.error(e);
      alert('Failed to create poll. Check Firebase setup.');
    } finally {
      btn.textContent = 'Launch Poll →'; btn.disabled = false;
    }
  },

  // ── LOBBY (Host) ──────────────────────────────────────

  _openLobby() {
    const code = this.currentCode;
    document.getElementById('lobbyPollTitle').textContent = this.pollData.title;
    document.getElementById('lobbyRoomCode').textContent = code;

    const url = `${location.origin}${location.pathname}?join=${code}`;
    document.getElementById('lobbyUrl').textContent = url;

    const qrEl = document.getElementById('lobbyQr');
    qrEl.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
      new QRCode(qrEl, { text: url, width: 140, height: 140, colorDark: '#0f0f0f', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    }

    // Listen for participant count
    const off = Sync.on(`polls/${code}/participants`, data => {
      const count = data ? Object.keys(data).length : 0;
      document.getElementById('lobbyParticipantCount').textContent = count;
    });
    this.listeners.push(off);

    this.showScreen('lobby');
  },

  _bindHost() {
    document.getElementById('btnStartPoll').onclick = async () => {
      await Poll.setQuestion(this.currentCode, 0);
      this._openHostQuestion(0);
    };

    document.getElementById('btnHostReveal').onclick = async () => {
      await Poll.showResults(this.currentCode);
    };

    document.getElementById('btnHostNext').onclick = async () => {
      const next = (this.pollData.currentQuestion || 0) + 1;
      if (next >= this.pollData.questions.length) {
        await Poll.endPoll(this.currentCode);
        this.showScreen('ended');
      } else {
        this.pollData.currentQuestion = next;
        await Poll.setQuestion(this.currentCode, next);
        this._openHostQuestion(next);
      }
    };
  },

  _openHostQuestion(idx) {
    const q    = this.pollData.questions[idx];
    const code = this.currentCode;
    const total = this.pollData.questions.length;

    document.getElementById('hostProgress').textContent = `Q${idx + 1} of ${total}`;
    document.getElementById('hostQuestionText').textContent = q.text;
    document.getElementById('hostRoomCode').textContent = `Room: ${code}`;
    document.getElementById('hostVoteCount').textContent = '0';

    // Render sidebar QR code and room code
    const sidebarQr = document.getElementById('hostSidebarQr');
    sidebarQr.innerHTML = '';
    const url = this._getJoinUrl(code);
    if (typeof QRCode !== 'undefined') {
      new QRCode(sidebarQr, { text: url, width: 120, height: 120, colorDark: '#0f0f0f', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    }
    document.getElementById('hostSidebarCode').textContent = code;
    document.getElementById('hostSidebarUrl').textContent = url;

    const isLast = idx === total - 1;
    document.getElementById('btnHostNext').textContent = isLast ? 'End Poll' : 'Next →';
    document.getElementById('btnHostReveal').style.display = 'inline-flex';

    // Clear old listeners
    this.listeners.forEach(off => typeof off === 'function' && off());
    this.listeners = [];

    // Live vote tally
    const off = Sync.on(`polls/${code}/responses/${q.id}`, data => {
      const counts = Poll.tallyVotes(data, q.options);
      const total  = Object.values(counts).reduce((a, b) => a + b, 0);
      document.getElementById('hostVoteCount').textContent = total;
      Charts.render(document.getElementById('hostChart'), q.options, counts, total || 1);
    });
    this.listeners.push(off);

    this.showScreen('host-active');
  },

  // ── JOIN (Participant) ────────────────────────────────

  _bindJoin() {
    document.getElementById('btnJoinBack').onclick = () => this.showScreen('home');

    document.getElementById('btnJoinPoll').onclick = async () => {
      const code = document.getElementById('joinCode').value.trim();
      const btn  = document.getElementById('btnJoinPoll');
      btn.textContent = 'Joining…'; btn.disabled = true;
      await this.startJoin(code);
      btn.textContent = 'Join →'; btn.disabled = false;
    };

    document.getElementById('joinCode').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btnJoinPoll').click();
    });

    document.getElementById('joinCode').addEventListener('input', e => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
      document.getElementById('joinError').style.display = 'none';
    });
  },

  async startJoin(code) {
    if (!code || code.length !== 6) {
      this.showScreen('join');
      return;
    }

    if (!Sync.db) await Sync.init();
    const poll = await Poll.get(code);
    if (!poll || poll.status === 'ended') {
      document.getElementById('joinError').style.display = 'block';
      document.getElementById('joinCode').value = code;
      this.showScreen('join');
      return;
    }

    this.role = 'participant';
    this.currentCode = code;
    this.pollData = poll;
    this.myAnswer = null;

    await Poll.joinParticipant(code);

    // Watch poll status
    const off = Sync.on(`polls/${code}`, data => {
      if (!data) return;
      this.pollData = data;
      this._handlePollChange(data);
    });
    this.listeners.push(off);

    document.getElementById('waitingRoomCode').textContent = `Room: ${code}`;
    this.showScreen('waiting');
  },

  _handlePollChange(poll) {
    if (this.role !== 'participant') return;

    if (poll.status === 'ended') {
      this.showScreen('ended');
      return;
    }

    if (poll.status === 'lobby') {
      this.showScreen('waiting');
      return;
    }

    const idx = poll.currentQuestion || 0;
    const q   = poll.questions[idx];

    if (poll.status === 'active') {
      this.myAnswer = null;
      this._openVote(q, idx, poll.questions.length);
    }

    if (poll.status === 'showing_results') {
      this._showParticipantResults(q, poll.responses?.[q.id]);
    }
  },

  _openVote(q, idx, total) {
    document.getElementById('voteProgress').textContent = `Q${idx + 1} of ${total}`;
    document.getElementById('voteRoom').textContent = `Room: ${this.currentCode}`;
    document.getElementById('voteQuestionText').textContent = q.text;

    const container = document.getElementById('voteOptions');
    container.innerHTML = '';

    q.options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'vote-option';
      btn.textContent = opt;
      btn.onclick = async () => {
        if (this.myAnswer) return;
        this.myAnswer = opt;
        container.querySelectorAll('.vote-option').forEach(b => {
          b.classList.toggle('selected', b.textContent === opt);
          b.disabled = true;
        });
        await Poll.submitVote(this.currentCode, q.id, opt);
        setTimeout(() => this.showScreen('voted'), 400);
      };
      container.appendChild(btn);
    });

    this.showScreen('vote');
  },

  _showParticipantResults(q, responses) {
    const counts = Poll.tallyVotes(responses, q.options);
    const total  = Object.values(counts).reduce((a, b) => a + b, 0);

    document.getElementById('pResultsQuestion').textContent = q.text;

    const waiting = document.getElementById('pResultsWaiting');
    const isLast  = (this.pollData.currentQuestion || 0) >= (this.pollData.questions.length - 1);
    waiting.textContent = isLast ? 'Poll ending soon…' : 'Waiting for next question…';

    Charts.render(
      document.getElementById('pResultsChart'),
      q.options, counts, total || 1,
      this.myAnswer
    );

    this.showScreen('p-results');
  },

  // ── Misc ──────────────────────────────────────────────

  // ── Share ───────────────────────────────────────────

  _getJoinUrl(code) {
    return `${location.origin}${location.pathname}?join=${code}`;
  },

  async _copyLink(code, btn) {
    const url = this._getJoinUrl(code);
    try {
      await navigator.clipboard.writeText(url);
      const orig = btn.innerHTML;
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
      btn.classList.add('btn-copied');
      setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('btn-copied'); }, 2000);
    } catch {
      prompt('Copy this link:', url);
    }
  },

  _getWhatsAppUrl(code, title) {
    const url = this._getJoinUrl(code);
    const text = `Join my live poll "${title}" on LivePoll!\n${url}`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  },

  _getTelegramUrl(code, title) {
    const url = this._getJoinUrl(code);
    const text = `Join my live poll "${title}" on LivePoll!`;
    return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  },

  _bindShare() {
    // Lobby share buttons
    document.getElementById('btnLobbyCopyLink').onclick = () => {
      this._copyLink(this.currentCode, document.getElementById('btnLobbyCopyLink'));
    };

    document.getElementById('btnLobbyWhatsApp').onclick = () => {
      const a = document.getElementById('btnLobbyWhatsApp');
      a.href = this._getWhatsAppUrl(this.currentCode, this.pollData?.title || 'Untitled Poll');
    };

    document.getElementById('btnLobbyTelegram').onclick = () => {
      const a = document.getElementById('btnLobbyTelegram');
      a.href = this._getTelegramUrl(this.currentCode, this.pollData?.title || 'Untitled Poll');
    };

    // Host active sidebar copy button
    document.getElementById('btnHostCopyLink').onclick = () => {
      this._copyLink(this.currentCode, document.getElementById('btnHostCopyLink'));
    };

    // Poll detail share buttons
    document.getElementById('btnDetailCopyLink').onclick = () => {
      this._copyLink(this._detailCode, document.getElementById('btnDetailCopyLink'));
    };

    document.getElementById('btnDetailWhatsApp').onclick = () => {
      const a = document.getElementById('btnDetailWhatsApp');
      a.href = this._getWhatsAppUrl(this._detailCode, this._detailTitle || 'Poll');
    };

    document.getElementById('btnDetailTelegram').onclick = () => {
      const a = document.getElementById('btnDetailTelegram');
      a.href = this._getTelegramUrl(this._detailCode, this._detailTitle || 'Poll');
    };
  },

  _detailCode: null,
  _detailTitle: null,
  _detailPoll: null,

  _duplicatePoll(poll) {
    if (!poll || !poll.questions) return;

    // Clear the create form
    const list = document.getElementById('questionsList');
    list.innerHTML = '';
    document.getElementById('pollTitle').value = poll.title || '';

    // Populate questions from the source poll
    poll.questions.forEach((q, i) => {
      const idx = i + 1;
      const card = document.createElement('div');
      card.className = 'question-card';
      card.dataset.idx = idx;
      card.innerHTML = `
        <div class="question-card-header">
          <span class="question-number">Question ${idx}</span>
          <button class="btn-remove-q" title="Remove">×</button>
        </div>
        <div class="form-section">
          <input type="text" class="input-field q-text" placeholder="Ask a question…" maxlength="200" value="${this._escapeAttr(q.text)}">
        </div>
        <div class="options-list"></div>
        <button class="btn-add-option">+ Add option</button>
      `;

      card.querySelector('.btn-remove-q').onclick = () => {
        card.remove();
        this._renumberQuestions();
      };
      card.querySelector('.btn-add-option').onclick = () => {
        this._addOption(card.querySelector('.options-list'));
      };

      // Add existing options
      q.options.forEach(opt => {
        this._addOption(card.querySelector('.options-list'), opt);
      });

      list.appendChild(card);
    });

    this.showScreen('create');
  },

  _escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  _bindMisc() {
    document.getElementById('btnEndedHome').onclick = () => {
      this.listeners.forEach(off => typeof off === 'function' && off());
      this.listeners = [];
      this.role = null; this.currentCode = null; this.pollData = null;
      // Reset create screen
      document.getElementById('questionsList').innerHTML = '';
      document.getElementById('pollTitle').value = '';
      this._addQuestion();
      this.showScreen('home');
    };
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
