/**
 * poll.js — Poll data management
 */
const Poll = {
  genCode: () => Math.floor(100000 + Math.random() * 900000).toString(),
  genId:   () => Math.random().toString(36).slice(2, 9),

  async create(title, questions) {
    const code = Poll.genCode();
    const poll = {
      code,
      title: title || 'Untitled Poll',
      hostId: Sync.sessionId,
      status: 'lobby',         // lobby | active | showing_results | ended
      currentQuestion: 0,
      questions: questions.map((q, i) => ({
        id: Poll.genId(),
        index: i,
        text: q.text,
        options: q.options
      })),
      participants: {},
      responses: {},
      createdAt: Sync.serverTime()
    };

    if (Sync.isLoggedIn()) {
      poll.userId = Sync.currentUser.uid;
    }

    await Sync.set(`polls/${code}`, poll);

    if (Sync.isLoggedIn()) {
      await Sync.set(`users/${Sync.currentUser.uid}/polls/${code}`, true);
    }

    return code;
  },

  async get(code) { return Sync.get(`polls/${code}`); },

  async updateStatus(code, status) {
    await Sync.update(`polls/${code}`, { status });
  },

  async setQuestion(code, index) {
    await Sync.update(`polls/${code}`, {
      currentQuestion: index,
      status: 'active'
    });
  },

  async showResults(code) {
    await Sync.update(`polls/${code}`, { status: 'showing_results' });
  },

  async endPoll(code) {
    await Sync.update(`polls/${code}`, { status: 'ended' });
  },

  async submitVote(code, questionId, answer) {
    await Sync.set(`polls/${code}/responses/${questionId}/${Sync.sessionId}`, answer);
  },

  async joinParticipant(code) {
    const ref = Sync.ref(`polls/${code}/participants/${Sync.sessionId}`);
    await ref.set({ joinedAt: Sync.serverTime() });
    ref.onDisconnect().remove();
  },

  tallyVotes(responses, options) {
    const counts = {};
    options.forEach(o => counts[o] = 0);
    if (responses) {
      Object.values(responses).forEach(ans => {
        if (counts[ans] !== undefined) counts[ans]++;
      });
    }
    return counts;
  },

  async getUserPolls(uid) {
    const index = await Sync.get(`users/${uid}/polls`);
    if (!index) return [];

    const codes = Object.keys(index);
    const polls = await Promise.all(
      codes.map(async code => {
        const poll = await Sync.get(`polls/${code}`);
        if (!poll) return null;
        return {
          code,
          title: poll.title,
          status: poll.status,
          createdAt: poll.createdAt,
          questionCount: poll.questions ? poll.questions.length : 0,
          totalVotes: Poll._countTotalVotes(poll),
          questions: poll.questions,
          responses: poll.responses
        };
      })
    );

    return polls.filter(Boolean).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  },

  _countTotalVotes(poll) {
    if (!poll.responses) return 0;
    let total = 0;
    for (const qId of Object.keys(poll.responses)) {
      total += Object.keys(poll.responses[qId]).length;
    }
    return total;
  }
};
