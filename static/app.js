'use strict';

// ── Constants ──────────────────────────────────────────────────────────────
const SESSION_LENGTH = 5;
const BREAK_INTERVAL = 3; // show a fun break after every N questions answered

const AVATARS = ['🦘','🐨','🦜','🐙','🦁','🐸','🦊','🐼','🦋','🐬'];

const DOMAIN_INFO = {
  reading:              { name: 'Reading',             icon: '📚', short: 'Reading' },
  phonemics:            { name: 'Phonemics',           icon: '👂', short: 'Sounds'  },
  numeracy:             { name: 'Numeracy',            icon: '🔢', short: 'Maths'   },
  language_conventions: { name: 'Language Conventions',icon: '✏️', short: 'Language'},
  writing:              { name: 'Writing',             icon: '📝', short: 'Writing' },
};

// ── State ──────────────────────────────────────────────────────────────────
const S = {
  children:      [],
  currentChild:  null,
  progress:      null,
  currentDomain: null,
  currentQ:      null,   // { question, difficulty, difficulty_desc }
  lastResult:    null,   // response from /api/answer
  session:       { correct: 0, total: 0, results: [] },
};

// ── DOM refs ───────────────────────────────────────────────────────────────
const appEl   = document.getElementById('app');
const homeBtn = document.getElementById('home-btn');

// ── API ────────────────────────────────────────────────────────────────────
const api = {
  async json(url, opts = {}) {
    const r = await fetch(url, opts);
    if (!r.ok) {
      const msg = await r.text();
      throw new Error(`${r.status}: ${msg}`);
    }
    return r.json();
  },
  getChildren:  ()              => api.json('/api/children'),
  addChild:     (name, age, avatar) => api.json('/api/children', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name, age: +age, avatar}) }),
  deleteChild:  (id)            => api.json(`/api/children/${id}`, { method:'DELETE' }),
  updateChild:  (id, updates)   => api.json(`/api/children/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(updates) }),
  getProgress:  (id)            => api.json(`/api/progress/${id}`),
  getQuestion:  (cid, domain)   => api.json('/api/question', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({child_id:cid, domain}) }),
  submitAnswer: (cid, domain, qdata, answer) => api.json('/api/answer', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({child_id:cid, domain, question_data:qdata, answer}) }),
  adjustDifficulty: (cid, domain, delta) => api.json(`/api/difficulty/${cid}/${domain}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({delta}) }),
  getFunBreak: (cid) => api.json(`/api/funbreak/${cid}`),
};

// ── Utilities ──────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function avatarFor(child) {
  if (child.avatar) return child.avatar;
  const idx = S.children.findIndex(c => c.id === child.id);
  return AVATARS[(idx >= 0 ? idx : 0) % AVATARS.length];
}

function avatarPickerHtml(pickerId, selectedAvatar) {
  return `<div class="avatar-picker" id="${pickerId}">
    ${AVATARS.map(a => `
      <button type="button" class="avatar-opt ${a === selectedAvatar ? 'selected' : ''}"
        data-avatar="${a}" onclick="selectAvatar(this)">${a}</button>`).join('')}
  </div>`;
}

function selectAvatar(btn) {
  btn.parentElement.querySelectorAll('.avatar-opt').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

function getSelectedAvatar(pickerId) {
  return document.querySelector(`#${pickerId} .avatar-opt.selected`)?.dataset.avatar || AVATARS[0];
}

function setLoading(msg = 'Thinking... ✨') {
  appEl.innerHTML = `<div class="loading-spinner"><div class="spinner"></div><p>${esc(msg)}</p></div>`;
}

// ── Navigation ─────────────────────────────────────────────────────────────
function goHome() {
  S.currentChild  = null;
  S.currentDomain = null;
  S.session       = { correct: 0, total: 0, results: [] };
  homeBtn.classList.add('hidden');
  renderHome();
}

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  setLoading('Loading...');
  try {
    const data = await api.getChildren();
    S.children = data.children || [];
    renderHome();
  } catch (e) {
    appEl.innerHTML = `
      <div class="card text-center">
        <p style="font-size:2.5em">⚠️</p>
        <p style="margin-top:8px">Could not connect to the server.<br>Make sure the app is running.</p>
        <button class="btn btn-primary mt-16" onclick="init()">Try Again</button>
      </div>`;
  }
}

// ── Screen: Home ───────────────────────────────────────────────────────────
function renderHome() {
  homeBtn.classList.add('hidden');

  const cards = S.children.length === 0
    ? `<div class="card text-center" style="padding:36px">
         <p style="font-size:3em">👨‍👧‍👦</p>
         <p class="muted mt-8">No learners added yet.<br>Click <strong>Add Child</strong> to get started!</p>
       </div>`
    : `<div class="children-grid">
         ${S.children.map(ch => `
           <div class="child-card" onclick="selectChild('${ch.id}')">
             <button class="child-delete" onclick="onDeleteChild(event,'${ch.id}')" title="Remove">×</button>
             <div class="child-avatar">${avatarFor(ch)}</div>
             <div class="child-name">${esc(ch.name)}</div>
             <div class="child-meta">Age ${ch.age} · Year ${ch.year_level}</div>
           </div>`).join('')}
       </div>`;

  appEl.innerHTML = `
    <div class="text-center" style="margin-bottom:32px">
      <h1 style="font-size:2.2em;font-weight:900;color:#4F46E5">🌟 Tutor Tool</h1>
      <p class="muted mt-8">Child's extra learning for Literacy and Numeracy</p>
      <button class="btn btn-ghost btn-sm mt-8" onclick="showGuideModal()">❓ How to Use / Parent Guide</button>
    </div>
    <div class="card">
      <div class="row" style="align-items:center;margin-bottom:4px">
        <div>
          <h2 style="font-size:1.2em;font-weight:800">Who's learning today?</h2>
          <p class="muted" style="font-size:0.9em;margin-top:4px">Pick a learner to start practising</p>
        </div>
        <div style="flex:0">
          <button class="btn btn-primary" onclick="showAddModal()">+ Add Child</button>
        </div>
      </div>
      ${cards}
    </div>`;
}

// ── Screen: Dashboard ──────────────────────────────────────────────────────
async function selectChild(id) {
  setLoading('Loading progress...');
  homeBtn.classList.remove('hidden');
  try {
    const prog = await api.getProgress(id);
    S.currentChild = prog.child;
    S.progress     = prog;
    renderDashboard();
  } catch (e) {
    alert('Could not load progress — please try again.');
    renderHome();
  }
}

function renderDashboard() {
  const ch   = S.currentChild;
  const prog = S.progress;

  const domainCards = Object.entries(DOMAIN_INFO).map(([key, info]) => {
    const d    = prog.domains[key] || { difficulty:2.0, total_questions:0, correct:0, accuracy:0, difficulty_desc:'', recent_results:[] };
    const pct  = d.accuracy || 0;
    const dots = (d.recent_results || []).map(r =>
      `<div class="rdot ${r ? 'ok' : 'bad'}"></div>`).join('');
    const stats = d.total_questions > 0
      ? `${d.correct}/${d.total_questions} correct · ${esc(d.difficulty_desc)}`
      : 'Not started yet — tap to begin!';

    return `
      <div style="position:relative">
        <button class="domain-card" data-domain="${key}" onclick="startDomain('${key}')">
          <div class="domain-icon">${info.icon}</div>
          <div class="domain-name">${info.name}</div>
          <div class="domain-stats">${stats}</div>
          ${d.total_questions > 0 ? `
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
            <div class="recent-dots">${dots}</div>` : ''}
        </button>
        ${d.total_questions > 0 ? `
          <div style="display:flex;gap:6px;margin-top:8px;justify-content:center">
            <button class="btn btn-sm" style="flex:1;font-size:0.8em" onclick="adjustDifficulty('${key}',-0.5)">📉 Easier</button>
            <button class="btn btn-sm" style="flex:1;font-size:0.8em" onclick="adjustDifficulty('${key}',0.5)">📈 Harder</button>
          </div>` : ''}
      </div>`;
  }).join('');

  appEl.innerHTML = `
    <div class="card text-center" style="padding:30px">
      <div style="font-size:4em">${avatarFor(ch)}</div>
      <h2 style="font-size:1.7em;font-weight:900;margin-top:8px">${esc(ch.name)}</h2>
      <p class="muted">Age ${ch.age} · Year ${ch.year_level}</p>
      <button class="btn btn-ghost" style="margin-top:12px;font-size:0.9em" onclick="showEditChildModal()">⚙️ Edit Settings</button>
    </div>
    <h3 style="font-weight:800;font-size:1.1em;margin-bottom:4px">Choose a subject to practise</h3>
    <p class="muted" style="font-size:0.88em;margin-bottom:16px">Questions get harder as you improve — and easier if you need more practice</p>
    <div class="domain-grid">${domainCards}</div>`;
}

// ── Screen: Question ───────────────────────────────────────────────────────
async function startDomain(domain) {
  S.currentDomain = domain;
  S.session       = { correct: 0, total: 0, results: [] };
  await loadNextQuestion();
}

async function loadNextQuestion() {
  setLoading('Generating your question... ✨');
  try {
    S.currentQ = await api.getQuestion(S.currentChild.id, S.currentDomain);
    renderQuestion();
  } catch (e) {
    appEl.innerHTML = `
      <div class="card">
        <p style="font-size:1.5em">😕</p>
        <p style="margin-top:8px">Oops — couldn't generate a question. Please try again.</p>
        <button class="btn btn-primary mt-16" onclick="loadNextQuestion()">Try Again</button>
      </div>`;
  }
}

const FUN_BREAK_META = {
  did_you_know: { icon: '🦕', label: 'Did You Know?' },
  dad_joke:     { icon: '😂', label: 'Joke Break!' },
  riddle:       { icon: '🤔', label: 'Riddle Time!' },
};

async function renderFunBreak() {
  setLoading('Loading something fun... 🎉');
  try {
    S.currentBreak = await api.getFunBreak(S.currentChild.id);
    renderBreakContent();
  } catch (e) {
    // Not core to learning — if it fails, just carry on to the next question.
    loadNextQuestion();
  }
}

function renderBreakContent() {
  const b    = S.currentBreak;
  const meta = FUN_BREAK_META[b.kind] || { icon: '✨', label: 'Fun Break!' };

  let body = `
    <div class="text-center" style="font-size:3em">${meta.icon}</div>
    <div class="text-center" style="font-weight:800;font-size:1.2em;margin:8px 0 18px">${meta.label}</div>
    <p style="font-size:1.1em;line-height:1.6;text-align:center;margin-bottom:18px">${esc(b.content)}</p>`;

  if (b.kind === 'riddle' && b.answer) {
    body += `
      <div id="riddle-answer"></div>
      <button class="btn btn-primary btn-lg btn-full" id="riddle-reveal-btn" onclick="revealRiddleAnswer()">Reveal Answer 👀</button>`;
  } else {
    body += `<button class="btn btn-primary btn-lg btn-full" onclick="loadNextQuestion()">Continue →</button>`;
  }

  appEl.innerHTML = `
    <div class="card">${body}</div>
    <button class="btn btn-ghost mt-8" onclick="renderDashboard()">← Back to subjects</button>`;
}

function revealRiddleAnswer() {
  const b   = S.currentBreak;
  const box = document.getElementById('riddle-answer');
  const btn = document.getElementById('riddle-reveal-btn');
  if (box) box.innerHTML = `<div class="expl-box text-center" style="margin-bottom:16px"><strong>Answer:</strong> ${esc(b.answer)}</div>`;
  if (btn)  btn.outerHTML = `<button class="btn btn-primary btn-lg btn-full" onclick="loadNextQuestion()">Continue →</button>`;
}

function renderQuestion() {
  const { question, difficulty, difficulty_desc } = S.currentQ;
  const info    = DOMAIN_INFO[S.currentDomain];
  const results = S.session.results;

  const dots = Array.from({ length: SESSION_LENGTH }, (_, i) => {
    if      (i < results.length)     return `<div class="pdot ${results[i] ? 'correct' : 'incorrect'}"></div>`;
    else if (i === results.length)   return `<div class="pdot current"></div>`;
    else                             return `<div class="pdot"></div>`;
  }).join('');

  let body = '';

  if (question.passage) {
    body += `<div class="passage-box">${esc(question.passage)}</div>`;
  }

  body += `<div class="question-text">${esc(question.question)}</div>`;

  if (question.type === 'multiple_choice' && question.options) {
    body += `<div class="options-list">
      ${Object.entries(question.options).map(([k, v]) => `
        <button class="opt-btn" data-key="${k}" onclick="submitMCQ('${k}')">
          <span class="opt-letter">${k}</span>
          <span>${esc(v)}</span>
        </button>`).join('')}
    </div>`;
  } else if (question.type === 'read_aloud') {
    body += `
      <p class="muted mt-8" style="margin-bottom:18px">Have them read or say this out loud.</p>
      <div id="reveal-box"></div>
      <button class="btn btn-primary btn-lg btn-full mt-16" id="reveal-btn" onclick="revealReadAloud()">Show Answer 👀</button>
      <div id="mark-buttons" class="hidden mt-16">
        <p class="muted text-center" style="margin-bottom:12px">Did they get it right?</p>
        <div class="row">
          <button class="btn btn-success btn-lg" onclick="submitReadAloud(true)">✅ Got it right</button>
          <button class="btn btn-ghost btn-lg" onclick="submitReadAloud(false)">🔁 Needs practice</button>
        </div>
      </div>`;
  } else {
    body += `
      <textarea class="writing-area" id="writing-ta"
        placeholder="Start writing here…" oninput="updateWordCount()"></textarea>
      <div class="word-count" id="wc">0 words</div>
      <button class="btn btn-primary btn-lg btn-full mt-16" id="submit-writing"
        onclick="submitWriting()">Submit ✨</button>`;
  }

  appEl.innerHTML = `
    <div class="card">
      <div class="q-header">
        <span style="font-size:1.4em;margin-right:8px">${info.icon}</span>
        <strong style="flex:1">${info.name}</strong>
        <span class="diff-badge">${esc(difficulty_desc)}</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:22px">
        <div class="progress-dots">${dots}</div>
        <span class="muted" style="font-size:0.88em">Q${results.length + 1} of ${SESSION_LENGTH}</span>
      </div>
      ${body}
    </div>
    <button class="btn btn-ghost mt-8" onclick="renderDashboard()">← Back to subjects</button>`;
}

function updateWordCount() {
  const ta = document.getElementById('writing-ta');
  const wc = document.getElementById('wc');
  if (!ta || !wc) return;
  const words = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
  wc.textContent = `${words} word${words !== 1 ? 's' : ''}`;
}

async function submitMCQ(key) {
  document.querySelectorAll('.opt-btn').forEach(b => b.disabled = true);
  await processAnswer(key);
}

function revealReadAloud() {
  const q          = S.currentQ.question;
  const revealBox  = document.getElementById('reveal-box');
  const revealBtn  = document.getElementById('reveal-btn');
  const markButtons = document.getElementById('mark-buttons');
  if (revealBox)   revealBox.innerHTML = `<div class="expl-box">${esc(q.explanation)}</div>`;
  if (revealBtn)   revealBtn.classList.add('hidden');
  if (markButtons) markButtons.classList.remove('hidden');
}

async function submitReadAloud(isCorrect) {
  document.querySelectorAll('#mark-buttons .btn').forEach(b => b.disabled = true);
  await processAnswer(isCorrect ? 'correct' : 'incorrect');
}

async function submitWriting() {
  const ta = document.getElementById('writing-ta');
  if (!ta?.value.trim()) { alert('Please write something first!'); return; }
  const btn = document.getElementById('submit-writing');
  if (btn) { btn.disabled = true; btn.textContent = 'Marking… ✨'; }
  setLoading('Marking your writing… ✨');
  await processAnswer(ta.value.trim());
}

async function processAnswer(answer) {
  try {
    const result = await api.submitAnswer(
      S.currentChild.id, S.currentDomain, S.currentQ.question, answer
    );
    S.lastResult = result;
    const correct = result.feedback.is_correct;
    S.session.total++;
    if (correct) S.session.correct++;
    S.session.results.push(correct ? 1 : 0);
    renderFeedback();
  } catch (e) {
    appEl.innerHTML = `
      <div class="card">
        <p>Error submitting answer — please try again.</p>
        <button class="btn btn-primary mt-16" onclick="renderQuestion()">Back</button>
      </div>`;
  }
}

// ── Screen: Feedback ───────────────────────────────────────────────────────
function renderFeedback() {
  const { feedback, difficulty_changed, new_difficulty_desc } = S.lastResult;
  const q        = S.currentQ.question;
  const correct  = feedback.is_correct;
  const isLast   = S.session.results.length >= SESSION_LENGTH;
  const showBreakNext = !isLast && S.session.results.length % BREAK_INTERVAL === 0;

  // Re-render MCQ options with colour coding
  let answerBlock = '';
  if (q.type === 'multiple_choice' && q.options) {
    answerBlock = `<div class="options-list" style="margin-bottom:14px">
      ${Object.entries(q.options).map(([k, v]) => {
        const isRight = k === feedback.correct_answer;
        return `<div class="opt-btn ${isRight ? 'correct-ans' : ''}" style="cursor:default">
          <span class="opt-letter">${k}</span>
          <span>${esc(v)}</span>
          ${isRight ? '<span style="margin-left:auto;color:var(--success);font-size:1.2em">✓</span>' : ''}
        </div>`;
      }).join('')}
    </div>`;
  }

  let levelHtml = '';
  if (difficulty_changed === 'up')
    levelHtml = `<div class="text-center mt-8"><span class="level-pill level-up">🚀 Challenge level increased!</span></div>`;
  else if (difficulty_changed === 'down')
    levelHtml = `<div class="text-center mt-8"><span class="level-pill level-down">💡 Let's practise a little easier first</span></div>`;

  const writingFeedback = feedback.feedback
    ? `<p style="font-style:italic;color:var(--muted);margin-bottom:12px">${esc(feedback.feedback)}</p>`
    : '';

  appEl.innerHTML = `
    <div class="card">
      <div class="feedback-emoji">${correct ? '🌟' : '💪'}</div>
      <div class="feedback-result ${correct ? 'correct' : 'incorrect'}">
        ${correct ? 'Correct! Well done!' : 'Not quite — keep going!'}
      </div>
      ${levelHtml}
      ${answerBlock}
      <div class="expl-box">
        <strong>💡 ${correct ? 'Why this is right:' : 'The answer:'}</strong><br>
        ${esc(feedback.explanation || '')}
      </div>
      ${writingFeedback}
      <div class="row mt-16">
        <button class="btn btn-ghost" onclick="renderDashboard()">📊 Dashboard</button>
        <button class="btn btn-primary btn-lg" style="flex:2"
          onclick="${isLast ? 'renderComplete()' : showBreakNext ? 'renderFunBreak()' : 'loadNextQuestion()'}">
          ${isLast ? '🏆 See Results' : 'Next Question →'}
        </button>
      </div>
    </div>`;
}

// ── Screen: Session complete ───────────────────────────────────────────────
function renderComplete() {
  const { correct, total } = S.session;
  const pct   = Math.round(correct / total * 100);
  const stars = pct >= 80 ? '⭐⭐⭐' : pct >= 60 ? '⭐⭐' : '⭐';
  const msg   = pct === 100 ? "Perfect score! You're a superstar! 🎉"
              : pct >= 80   ? "Amazing work! Keep it up! 🎊"
              : pct >= 60   ? "Great effort! You're improving! 💪"
              :               "Good try! Practice makes perfect! 📚";

  appEl.innerHTML = `
    <div class="card text-center" style="padding:40px">
      <div class="stars-row">${stars}</div>
      <h2 style="font-size:1.5em;font-weight:900">Session Complete!</h2>
      <div class="score-big">${correct}/${total}</div>
      <p class="score-sub">${pct}% correct</p>
      <p class="muted" style="margin-bottom:32px">${msg}</p>
      <div class="row" style="justify-content:center">
        <button class="btn btn-ghost" onclick="renderDashboard()">📊 View Progress</button>
        <button class="btn btn-primary btn-lg" onclick="startDomain('${S.currentDomain}')">🔄 Practice Again</button>
      </div>
    </div>`;
}

// ── Modal: Parent Guide ──────────────────────────────────────────────────
function showGuideModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'guide-modal';

  overlay.innerHTML = `
    <div class="modal modal-guide">
      <h2 class="modal-title">📖 Parent Guide</h2>

      <div class="guide-section">
        <h3>What this is</h3>
        <p>Tutor Tool generates fresh, AI-written practice questions for your kids, modelled on
        the Australian NAPLAN framework — Reading, Phonemics, Numeracy, Language Conventions, and
        Writing. Every question is created on the spot and tailored to each child, so sessions
        don't repeat the same fixed question bank.</p>
      </div>

      <div class="guide-section">
        <h3>Getting started</h3>
        <p>Add each child from the home screen — name, age, and a chosen avatar. Tap their card,
        pick a subject, and they'll work through a short session (5 questions) in that area.</p>
      </div>

      <div class="guide-section">
        <h3>The 5 learning areas</h3>
        <ul>
          <li><strong>📚 Reading</strong> — a short passage plus a comprehension question</li>
          <li><strong>👂 Phonemics</strong> — the child reads or sounds a word out loud; there's
          no microphone, so you listen in and mark it yourself after tapping "Show Answer"</li>
          <li><strong>🔢 Numeracy</strong> — number, measurement, geometry, and data questions</li>
          <li><strong>✏️ Language Conventions</strong> — spelling, grammar, and punctuation</li>
          <li><strong>📝 Writing</strong> — a prompt, with the AI marking the response and giving
          encouraging, age-appropriate feedback</li>
        </ul>
      </div>

      <div class="guide-section">
        <h3>Fun breaks 🎉</h3>
        <p>Every few questions, a quick "Did you know?" fact, dad joke, or riddle pops up to
        break things up before the next question.</p>
      </div>

      <div class="guide-section">
        <h3>How the difficulty adapts</h3>
        <p>Each child has their own difficulty score per subject, starting at <strong>2.0</strong>
        on a <strong>1.0–5.0</strong> scale. It's not fixed to their age — it moves based on how
        they're actually doing:</p>
        <ul>
          <li>3 correct answers in a row → difficulty rises</li>
          <li>3 wrong in a row → difficulty eases back down</li>
          <li>A generally strong run (4 of the last 5) → a smaller nudge upward</li>
        </ul>
        <p>You'll see this reflected as a badge like "Year 3 level" or "Above Yr 3" during
        questions — it's relative to their own age, not a race against other kids.</p>
      </div>

      <div class="guide-section">
        <h3>Manual adjustment</h3>
        <p>On the subject dashboard, the <strong>📉 Easier / 📈 Harder</strong> buttons let you
        nudge the difficulty yourself at any time, independent of the automatic system.</p>
      </div>

      <div class="guide-section">
        <h3>Progress tracking</h3>
        <p>Each subject card shows total questions answered, accuracy, and recent results at a
        glance — tap into a subject any time to see where things stand.</p>
      </div>

      <button class="btn btn-primary btn-full mt-16" onclick="closeModal()">Got it, thanks!</button>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
}

// ── Modal: Add child ───────────────────────────────────────────────────────
function showAddModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'add-modal';

  const ageOptions = Array.from({ length: 8 }, (_, i) => i + 5)
    .map(a => `<option value="${a}" ${a === 8 ? 'selected' : ''}>Age ${a} (Year ${a - 5 < 1 ? 'Foundation' : a - 5})</option>`)
    .join('');

  overlay.innerHTML = `
    <div class="modal">
      <h2 class="modal-title">➕ Add a Learner</h2>
      <div class="form-group">
        <label class="form-label">Child's Name</label>
        <input class="form-input" id="m-name" type="text" placeholder="e.g. Emma" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label">Age</label>
        <select class="form-input" id="m-age">${ageOptions}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Choose an Avatar</label>
        ${avatarPickerHtml('m-avatar-picker', AVATARS[0])}
      </div>
      <div class="row mt-24">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" style="flex:2" onclick="confirmAdd()">Add Child ✨</button>
      </div>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);

  const inp = document.getElementById('m-name');
  inp.focus();
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') confirmAdd(); });
}

function closeModal() {
  document.querySelector('.modal-overlay')?.remove();
}

async function confirmAdd() {
  const name   = document.getElementById('m-name')?.value.trim();
  const age    = document.getElementById('m-age')?.value;
  const avatar = getSelectedAvatar('m-avatar-picker');
  if (!name) { alert('Please enter a name!'); return; }

  try {
    const child = await api.addChild(name, age, avatar);
    S.children.push(child);
    closeModal();
    renderHome();
  } catch (e) {
    alert('Error adding child — please try again.');
  }
}

async function onDeleteChild(e, id) {
  e.stopPropagation();
  const ch = S.children.find(c => c.id === id);
  if (!confirm(`Remove ${ch?.name ?? 'this child'}? Their progress will be lost.`)) return;
  try {
    await api.deleteChild(id);
    S.children = S.children.filter(c => c.id !== id);
    renderHome();
  } catch { alert('Error removing child.'); }
}

// ── Modal: Edit Child ─────────────────────────────────────────────────────
function showEditChildModal() {
  const ch = S.currentChild;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'edit-modal';

  const ageOptions = Array.from({ length: 8 }, (_, i) => i + 5)
    .map(a => `<option value="${a}" ${a === ch.age ? 'selected' : ''}>Age ${a} (Year ${a - 5 < 1 ? 'Foundation' : a - 5})</option>`)
    .join('');

  overlay.innerHTML = `
    <div class="modal">
      <h2 class="modal-title">⚙️ Edit Learner Settings</h2>
      <div class="form-group">
        <label class="form-label">Child's Name</label>
        <input class="form-input" id="m-edit-name" type="text" value="${esc(ch.name)}" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label">Age</label>
        <select class="form-input" id="m-edit-age">${ageOptions}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Avatar</label>
        ${avatarPickerHtml('m-edit-avatar-picker', avatarFor(ch))}
      </div>
      <p class="muted" style="font-size:0.85em;margin-bottom:16px">✓ Changing age will update the child's year level and starting difficulty for new questions.</p>
      <div class="row mt-24">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" style="flex:2" onclick="confirmEditChild()">Save Changes ✓</button>
      </div>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
}

async function confirmEditChild() {
  const name   = document.getElementById('m-edit-name')?.value.trim();
  const age    = document.getElementById('m-edit-age')?.value;
  const avatar = getSelectedAvatar('m-edit-avatar-picker');
  if (!name) { alert('Please enter a name!'); return; }
  if (!age)  { alert('Please select an age!'); return; }

  try {
    await api.updateChild(S.currentChild.id, { name, age: +age, avatar });
    const prog = await api.getProgress(S.currentChild.id);
    S.currentChild = prog.child;
    S.progress = prog;
    closeModal();
    renderDashboard();
  } catch (e) {
    alert('Error updating child — please try again.');
  }
}

async function adjustDifficulty(domain, delta) {
  try {
    await api.adjustDifficulty(S.currentChild.id, domain, delta);
    const prog = await api.getProgress(S.currentChild.id);
    S.progress = prog;
    renderDashboard();
  } catch (e) {
    alert('Error adjusting difficulty — please try again.');
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────
init();
