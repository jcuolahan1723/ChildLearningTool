'use strict';

// ── Constants ──────────────────────────────────────────────────────────────
const SESSION_LENGTH = 5;
const BREAK_INTERVAL = 5; // show a fun break after every N questions answered, counted across sessions (not reset per session)

const AVATARS = ['🦘','🐨','🦜','🐙','🦁','🐸','🦊','🐼','🦋','🐬','💼','📊','🎯','💡','🧠'];

const DOMAIN_INFO = {
  reading:              { name: 'Reading',             icon: '📚', short: 'Reading' },
  phonemics:            { name: 'Phonemics',           icon: '👂', short: 'Sounds'  },
  numeracy:             { name: 'Numeracy',            icon: '🔢', short: 'Maths'   },
  language_conventions: { name: 'Language Conventions',icon: '✏️', short: 'Language'},
  writing:              { name: 'Writing',             icon: '📝', short: 'Writing' },
};

const FINANCE_DOMAIN_INFO = {
  corporate_finance:     { name: 'Corporate Finance',            icon: '🏛️', short: 'Corp Finance' },
  financial_management:  { name: 'Financial Management',         icon: '📈', short: 'Fin Mgmt'     },
  business_economics:    { name: 'Business Economics',           icon: '📉', short: 'Economics'    },
  data_analysis:         { name: 'Introductory Data Analysis',   icon: '📊', short: 'Data'         },
  decentralised_finance: { name: 'Decentralised Finance',        icon: '🔗', short: 'DeFi'          },
  robo_advice:           { name: 'Robo-Advice',                  icon: '🤖', short: 'Robo-Advice'  },
  international_finance: { name: 'International Finance',        icon: '🌏', short: 'Intl Finance' },
  private_equity_vc:     { name: 'Private Equity & VC',          icon: '💰', short: 'PE & VC'       },
  equity_valuation:      { name: 'Equity Valuation',             icon: '⚖️', short: 'Valuation'    },
  fixed_income:          { name: 'Fixed Income',                 icon: '💵', short: 'Fixed Income' },
};

const FINANCE_CORE_DOMAIN = 'corporate_finance';
const FINANCE_LEVEL_LABELS = { beginner: 'Beginner', practitioner: 'Practitioner', advanced: 'Advanced' };

// ── State ──────────────────────────────────────────────────────────────────
const S = {
  mode:          localStorage.getItem('tutortool_mode') || 'kids', // 'kids' | 'finance'
  children:      [],
  currentChild:  null,
  progress:      null,
  currentDomain: null,
  currentQ:      null,   // { question, difficulty, difficulty_desc }
  lastResult:    null,   // response from /api/answer
  session:       { correct: 0, total: 0, results: [] },
  questionsSinceBreak: 0, // counts across sessions — a break shouldn't come sooner just because a session ended
  // Finance track — mirrors the above, kept entirely separate
  learners:            [],
  currentLearner:       null,
  financeProgress:      null,
  currentFinanceDomain: null,
  currentFinanceQ:      null,
  lastFinanceResult:    null,
  financeSession:       { correct: 0, total: 0, results: [] },
  currentModuleId:      null, // set when running a module quiz, null during free practice
  currentModuleName:    null,
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
  addChild:     (name, age, avatar, active_domains, starting_levels, focus_note) =>
    api.json('/api/children', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({name, age: +age, avatar, active_domains, starting_levels, focus_note}) }),
  deleteChild:  (id)            => api.json(`/api/children/${id}`, { method:'DELETE' }),
  updateChild:  (id, updates)   => api.json(`/api/children/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(updates) }),
  updateFocus:  (id, updates)   => api.json(`/api/children/${id}/focus`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(updates) }),
  getProgress:  (id)            => api.json(`/api/progress/${id}`),
  getQuestion:  (cid, domain)   => api.json('/api/question', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({child_id:cid, domain}) }),
  submitAnswer: (cid, domain, qdata, answer) => api.json('/api/answer', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({child_id:cid, domain, question_data:qdata, answer}) }),
  adjustDifficulty: (cid, domain, delta) => api.json(`/api/difficulty/${cid}/${domain}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({delta}) }),
  getFunBreak: (cid) => api.json(`/api/funbreak/${cid}`),
  getHistory: (cid) => api.json(`/api/history/${cid}`),
};

// ── Finance API ────────────────────────────────────────────────────────────
const financeApi = {
  getLearners:  ()              => api.json('/api/finance/learners'),
  addLearner:   (name, avatar, active_domains, starting_levels, focus_note) =>
    api.json('/api/finance/learners', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({name, avatar, active_domains, starting_levels, focus_note}) }),
  deleteLearner: (id)           => api.json(`/api/finance/learners/${id}`, { method:'DELETE' }),
  updateLearner: (id, updates)  => api.json(`/api/finance/learners/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(updates) }),
  updateFocus:  (id, updates)   => api.json(`/api/finance/learners/${id}/focus`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(updates) }),
  getProgress:  (id)            => api.json(`/api/finance/progress/${id}`),
  getHistory:   (id)            => api.json(`/api/finance/history/${id}`),
  getQuestion:  (lid, domain, moduleId) => api.json('/api/finance/question', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({learner_id:lid, domain, module_id: moduleId || null}) }),
  submitAnswer: (lid, domain, qdata, answer) => api.json('/api/finance/answer', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({learner_id:lid, domain, question_data:qdata, answer}) }),
  adjustDifficulty: (lid, domain, delta) => api.json(`/api/finance/difficulty/${lid}/${domain}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({delta}) }),
  getModules:   (lid, domain)   => api.json(`/api/finance/modules/${lid}/${domain}`),
  getLesson:    (lid, domain, moduleId) => api.json('/api/finance/lesson', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({learner_id:lid, domain, module_id:moduleId}) }),
  completeModule: (lid, domain, moduleId, correct, total) => api.json('/api/finance/module-complete', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({learner_id:lid, domain, module_id:moduleId, correct, total}) }),
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

function ageOptionsHtml(selectedAge) {
  return Array.from({ length: 12 }, (_, i) => i + 5) // ages 5–16 → Foundation through Year 11
    .map(a => `<option value="${a}" ${a === selectedAge ? 'selected' : ''}>Age ${a} (Year ${a - 5 < 1 ? 'Foundation' : a - 5})</option>`)
    .join('');
}

const LEVEL_LABELS = { support: 'Needs support', level: 'About right', challenge: 'Ready for more' };

function focusAreaListHtml(preselectedDomains, preselectedLevels, domainInfoMap, levelLabelsMap) {
  preselectedDomains = preselectedDomains || [];
  preselectedLevels  = preselectedLevels  || {};
  domainInfoMap      = domainInfoMap      || DOMAIN_INFO;
  levelLabelsMap      = levelLabelsMap     || LEVEL_LABELS;
  const defaultLevel = Object.keys(levelLabelsMap)[1]; // the "middle" option
  return Object.entries(domainInfoMap).map(([key, info]) => {
    const checked = preselectedDomains.includes(key);
    const level   = preselectedLevels[key] || defaultLevel;
    const levelBtns = Object.entries(levelLabelsMap).map(([lk, label]) => `
        <button type="button" class="level-opt ${lk === level ? 'selected' : ''}"
          data-level="${lk}" onclick="selectLevel(this)">${label}</button>`).join('');
    return `
      <div class="focus-area-item">
        <label class="focus-area-check">
          <input type="checkbox" class="focus-domain-cb" data-domain="${key}"
            ${checked ? 'checked' : ''} onchange="toggleFocusLevel(this)">
          <span>${info.icon} ${info.name}</span>
        </label>
        <div class="focus-level-picker ${checked ? '' : 'hidden'}" id="level-${key}">${levelBtns}</div>
      </div>`;
  }).join('');
}

function toggleFocusLevel(cb) {
  cb.dataset.userTouched = 'true';
  const picker = document.getElementById(`level-${cb.dataset.domain}`);
  if (picker) picker.classList.toggle('hidden', !cb.checked);
}

function defaultDomainsForAge(age) {
  const all = Object.keys(DOMAIN_INFO);
  return age > 10 ? all.filter(d => d !== 'phonemics') : all; // Phonemics isn't relevant past ~Year 5
}

function onAddAgeChange(select) {
  const cb = document.querySelector('.focus-domain-cb[data-domain="phonemics"]');
  if (!cb || cb.dataset.userTouched === 'true') return; // never override a deliberate choice
  cb.checked = (+select.value) <= 10;
  const picker = document.getElementById('level-phonemics');
  if (picker) picker.classList.toggle('hidden', !cb.checked);
}

function selectLevel(btn) {
  btn.parentElement.querySelectorAll('.level-opt').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

function getFocusSelections() {
  const active_domains = [];
  const starting_levels = {};
  document.querySelectorAll('.focus-domain-cb').forEach(cb => {
    if (cb.checked) {
      const domain = cb.dataset.domain;
      active_domains.push(domain);
      const picker = document.getElementById(`level-${domain}`);
      const sel = picker?.querySelector('.level-opt.selected') || picker?.querySelector('.level-opt');
      starting_levels[domain] = sel ? sel.dataset.level : null;
    }
  });
  return { active_domains, starting_levels };
}

function setLoading(msg = 'Thinking... ✨') {
  appEl.innerHTML = `<div class="loading-spinner"><div class="spinner"></div><p>${esc(msg)}</p></div>`;
}

// ── Navigation ─────────────────────────────────────────────────────────────
function goHome() {
  S.currentChild  = null;
  S.currentDomain = null;
  S.session       = { correct: 0, total: 0, results: [] };
  S.questionsSinceBreak = 0;
  S.currentLearner       = null;
  S.currentFinanceDomain = null;
  S.financeSession       = { correct: 0, total: 0, results: [] };
  homeBtn.classList.add('hidden');
  if (S.mode === 'parents') renderParentsHome(); else renderHome();
}

function setMode(mode) {
  if (S.mode === mode) return;
  S.mode = mode;
  localStorage.setItem('tutortool_mode', mode);
  updateModeToggleUI();
  goHome();
}

function updateModeToggleUI() {
  document.getElementById('mode-btn-kids')?.classList.toggle('active', S.mode === 'kids');
  document.getElementById('mode-btn-parents')?.classList.toggle('active', S.mode === 'parents');
}

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  updateModeToggleUI();
  if (S.mode === 'parents') {
    renderParentsHome();
    return;
  }
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
  const activeDomains = (ch.active_domains && ch.active_domains.length) ? ch.active_domains : Object.keys(DOMAIN_INFO);

  const domainCards = Object.entries(DOMAIN_INFO).map(([key, info]) => {
    if (!activeDomains.includes(key)) {
      return `
        <div style="position:relative">
          <button class="domain-card domain-card-inactive" data-domain="${key}" onclick="quickAddFocusArea('${key}')">
            <div class="domain-icon">${info.icon}</div>
            <div class="domain-name">${info.name}</div>
            <div class="domain-stats">＋ Add this area</div>
          </button>
        </div>`;
    }

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
      ${ch.focus_note ? `<p class="muted" style="font-size:0.85em;margin-top:6px;font-style:italic">"${esc(ch.focus_note)}"</p>` : ''}
      <div class="row" style="justify-content:center;gap:8px;margin-top:12px;max-width:460px;margin-left:auto;margin-right:auto">
        <button class="btn btn-ghost" style="font-size:0.9em" onclick="showEditChildModal()">⚙️ Edit Settings</button>
        <button class="btn btn-ghost" style="font-size:0.9em" onclick="showManageFocusModal()">🎯 Focus Areas</button>
        <button class="btn btn-ghost" style="font-size:0.9em" onclick="showProgressReportModal()">📊 Progress Report</button>
      </div>
    </div>
    <h3 style="font-weight:800;font-size:1.1em;margin-bottom:4px">Choose a subject to practise</h3>
    <p class="muted" style="font-size:0.88em;margin-bottom:16px">Questions get harder as you improve — and easier if you need more practice</p>
    <div class="domain-grid">${domainCards}</div>`;
}

async function quickAddFocusArea(domain) {
  const ch = S.currentChild;
  const current = (ch.active_domains && ch.active_domains.length) ? ch.active_domains : Object.keys(DOMAIN_INFO);
  if (current.includes(domain)) return;
  const updated = [...current, domain];

  try {
    const updatedChild = await api.updateFocus(ch.id, { active_domains: updated, focus_note: ch.focus_note });
    S.currentChild = updatedChild;
    S.progress = await api.getProgress(ch.id);
    renderDashboard();
  } catch (e) {
    alert('Could not add this area — please try again.');
  }
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
  S.questionsSinceBreak = 0;
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
    S.questionsSinceBreak++;
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
  const showBreakNext = !isLast && S.questionsSinceBreak >= BREAK_INTERVAL;

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
        the Australian NAPLAN skill areas — Reading, Phonemics, Numeracy, Language Conventions, and
        Writing. Every question is created on the spot and tailored to each child's age and year
        level, so sessions don't repeat the same fixed question bank. It covers Foundation through
        Year 11 (ages 5–16), scaling content up for secondary students rather than treating every
        age the same. Note that real NAPLAN only tests Years 3, 5, 7, and 9 — for the other years,
        this is general matched-level practice rather than a specific NAPLAN test.</p>
      </div>

      <div class="guide-section">
        <h3>Getting started</h3>
        <p>Add each child from the home screen — name, age, and a chosen avatar. You'll also
        pick which subjects to focus on right now and how they're currently going in each, which
        sets a smart starting point instead of one-size-fits-all. Tap their card, pick a subject,
        and they'll work through a short session (5 questions) in that area.</p>
      </div>

      <div class="guide-section">
        <h3>Focus areas</h3>
        <p>You don't need to start all 5 subjects at once — tick just what's relevant right now
        (e.g. only Language Conventions, if that's the current priority). Skipped areas still
        show on the dashboard, greyed out with a <strong>+ Add this area</strong> button, so you
        can bring them in later with one tap. Tap <strong>🎯 Focus Areas</strong> on a child's
        dashboard any time to add, remove, or update subjects — and to add or edit a short focus
        note (e.g. "struggles with blending sounds") that gets factored into the questions the AI
        generates for that child.</p>
      </div>

      <div class="guide-section">
        <h3>The 5 learning areas</h3>
        <ul>
          <li><strong>📚 Reading</strong> — a passage plus a comprehension question; scales from
          short and literal for primary to longer and more analytical for secondary</li>
          <li><strong>👂 Phonemics</strong> — the child reads or sounds a word out loud; there's
          no microphone, so you listen in and mark it yourself after tapping "Show Answer".
          Mainly relevant for younger/early readers, so it's not ticked by default past age 10</li>
          <li><strong>🔢 Numeracy</strong> — number, measurement, geometry, and data for primary;
          adds algebra, ratios, percentages, and multi-step problems for secondary</li>
          <li><strong>✏️ Language Conventions</strong> — spelling, grammar, and punctuation for
          primary; adds sentence structure, voice, and vocabulary-in-context for secondary</li>
          <li><strong>📝 Writing</strong> — a prompt, with the AI marking the response and giving
          encouraging, age-appropriate feedback; scales from narrative/persuasive for primary to
          structured argument and analysis for secondary</li>
        </ul>
      </div>

      <div class="guide-section">
        <h3>Fun breaks 🎉</h3>
        <p>Every few questions, a quick "Did you know?" fact, dad joke, or riddle pops up to
        break things up before the next question.</p>
      </div>

      <div class="guide-section">
        <h3>How the difficulty adapts</h3>
        <p>Each child has their own difficulty score per subject, on a <strong>1.0–5.0</strong>
        scale. When you add a focus area, your level pick sets where it starts — roughly
        <strong>1.3</strong> for "Needs support", <strong>2.0</strong> for "About right", or
        <strong>3.0</strong> for "Ready for more". From there, it's not fixed to their age — it
        moves based on how they're actually doing:</p>
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
        glance. For the full picture, tap <strong>📊 Progress Report</strong> on a child's
        dashboard — it breaks down accuracy by topic (so you can see exactly where they're
        struggling, not just an overall score) and shows a recent history of individual answers
        with dates, across every subject they've practiced.</p>
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

  const ageOptions = ageOptionsHtml(8);

  overlay.innerHTML = `
    <div class="modal modal-guide">
      <h2 class="modal-title">➕ Add a Learner</h2>
      <div class="form-group">
        <label class="form-label">Child's Name</label>
        <input class="form-input" id="m-name" type="text" placeholder="e.g. Emma" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label">Age</label>
        <select class="form-input" id="m-age" onchange="onAddAgeChange(this)">${ageOptions}</select>
        <p class="muted" style="font-size:0.8em;margin-top:6px">Covers Foundation through Year 11
        (ages 5–16). Real NAPLAN only tests Years 3, 5, 7, and 9 — other years still get
        matched practice, just not tied to an actual NAPLAN test that year.</p>
      </div>
      <div class="form-group">
        <label class="form-label">Choose an Avatar</label>
        ${avatarPickerHtml('m-avatar-picker', AVATARS[0])}
      </div>
      <div class="form-group">
        <label class="form-label">Focus Areas — what should we start with?</label>
        <p class="muted" style="font-size:0.85em;margin-bottom:10px">Ticked by default based on
        age — untick or tick any to suit (e.g. Phonemics usually isn't relevant for secondary
        students, but it's there if needed). For each one you keep, pick the level that fits
        best right now.</p>
        <div class="focus-area-list">${focusAreaListHtml(defaultDomainsForAge(8), {})}</div>
      </div>
      <div class="form-group">
        <label class="form-label">Anything specific? <span class="muted" style="font-weight:400">(optional)</span></label>
        <textarea class="form-input" id="m-focus-note" rows="2" placeholder="e.g. struggles with blending sounds, confident with times tables..."></textarea>
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
  const focus_note = document.getElementById('m-focus-note')?.value.trim() || null;
  const { active_domains, starting_levels } = getFocusSelections();
  if (!name) { alert('Please enter a name!'); return; }
  if (active_domains.length === 0) { alert('Please pick at least one focus area to start with!'); return; }

  try {
    const child = await api.addChild(name, age, avatar, active_domains, starting_levels, focus_note);
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

  const ageOptions = ageOptionsHtml(ch.age);

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

// ── Modal: Manage Focus Areas ────────────────────────────────────────────
function showManageFocusModal() {
  const ch = S.currentChild;
  const active = (ch.active_domains && ch.active_domains.length) ? ch.active_domains : Object.keys(DOMAIN_INFO);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'focus-modal';

  overlay.innerHTML = `
    <div class="modal modal-guide">
      <h2 class="modal-title">🎯 Focus Areas</h2>
      <p class="muted" style="font-size:0.88em;margin-bottom:16px">Choose which subjects
      ${esc(ch.name)} is currently working on. Unticked areas stay available to add anytime —
      nothing is lost. The level pick only applies to areas not yet started.</p>
      <div class="focus-area-list">${focusAreaListHtml(active, {})}</div>
      <div class="form-group mt-16">
        <label class="form-label">Focus note <span class="muted" style="font-weight:400">(optional)</span></label>
        <textarea class="form-input" id="m-focus-note-edit" rows="2" placeholder="e.g. struggles with blending sounds...">${esc(ch.focus_note || '')}</textarea>
      </div>
      <div class="row mt-24">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" style="flex:2" onclick="confirmManageFocus()">Save Changes ✓</button>
      </div>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
}

async function confirmManageFocus() {
  const { active_domains, starting_levels } = getFocusSelections();
  const focus_note = document.getElementById('m-focus-note-edit')?.value.trim() || '';
  if (active_domains.length === 0) { alert('Please keep at least one focus area active!'); return; }

  try {
    const updatedChild = await api.updateFocus(S.currentChild.id, { active_domains, focus_note, starting_levels });
    S.currentChild = updatedChild;
    S.progress = await api.getProgress(S.currentChild.id);
    closeModal();
    renderDashboard();
  } catch (e) {
    alert('Error updating focus areas — please try again.');
  }
}

// ── Modal: Progress Report ───────────────────────────────────────────────
async function showProgressReportModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'report-modal';
  overlay.innerHTML = `
    <div class="modal modal-guide">
      <h2 class="modal-title">📊 Progress Report</h2>
      <div class="loading-spinner"><div class="spinner"></div><p>Loading report...</p></div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);

  try {
    const data = await api.getHistory(S.currentChild.id);
    renderProgressReport(data);
  } catch (e) {
    const modal = document.querySelector('#report-modal .modal');
    if (modal) modal.innerHTML = `
      <h2 class="modal-title">📊 Progress Report</h2>
      <p>Couldn't load the report right now — please try again.</p>
      <button class="btn btn-primary btn-full mt-16" onclick="closeModal()">Close</button>`;
  }
}

function renderProgressReport(data) {
  const modal = document.querySelector('#report-modal .modal');
  if (!modal) return; // modal was closed before the fetch finished

  const domains = Object.entries(data.history || {});
  if (domains.length === 0) {
    modal.innerHTML = `
      <h2 class="modal-title">📊 Progress Report</h2>
      <p class="muted">No questions answered yet — once ${esc(data.child.name)} completes a
      few, their results and improvement areas will show up here.</p>
      <button class="btn btn-primary btn-full mt-16" onclick="closeModal()">Close</button>`;
    return;
  }

  const sections = domains.map(([domain, d]) => {
    const info = DOMAIN_INFO[domain] || { icon: '✨', name: domain };

    const improvementHtml = d.improvement_areas.length
      ? d.improvement_areas.map(t => `
          <div class="topic-row">
            <span>${esc(t.topic)}</span>
            <span class="topic-badge">${t.correct}/${t.total} · ${t.accuracy}%</span>
          </div>`).join('')
      : `<p class="muted" style="font-size:0.88em">No clear problem areas yet — going well!</p>`;

    const recentHtml = d.recent_sessions.map(s => {
      const date = new Date(s.timestamp).toLocaleString(undefined,
        { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
      return `
        <div class="session-row">
          <span>${s.is_correct ? '✅' : '❌'}</span>
          <span class="session-topic">${esc(s.topic || 'general')}</span>
          <span class="muted session-date">${date}</span>
        </div>`;
    }).join('');

    return `
      <div class="guide-section">
        <h3>${info.icon} ${info.name} — ${d.accuracy}% overall (${d.correct}/${d.total_questions})</h3>
        <p class="muted" style="font-size:0.85em;margin-bottom:6px;font-weight:700">🎯 Areas to focus on</p>
        ${improvementHtml}
        <p class="muted" style="font-size:0.85em;margin:14px 0 6px;font-weight:700">🕐 Recent answers</p>
        <div class="session-list">${recentHtml}</div>
      </div>`;
  }).join('');

  modal.innerHTML = `
    <h2 class="modal-title">📊 ${esc(data.child.name)}'s Progress Report</h2>
    ${sections}
    <button class="btn btn-primary btn-full mt-16" onclick="closeModal()">Close</button>`;
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

// ═══════════════════════════════════════════════════════════════════════════
// FINANCE TRAINING TRACK — separate from the kids' section above, but reuses
// the same shared helpers (esc, setLoading, avatarPickerHtml, focusAreaListHtml,
// getFocusSelections, selectLevel/toggleFocusLevel, modal CSS classes, etc.)
// ═══════════════════════════════════════════════════════════════════════════

function avatarForLearner(learner) {
  if (learner.avatar) return learner.avatar;
  const idx = S.learners.findIndex(l => l.id === learner.id);
  return AVATARS[(idx >= 0 ? idx : 0) % AVATARS.length];
}

// ── Screen: Parents Home (topic picker) ──────────────────────────────────
function renderParentsHome() {
  homeBtn.classList.add('hidden');
  appEl.innerHTML = `
    <div class="text-center" style="margin-bottom:32px">
      <h1 style="font-size:2.2em;font-weight:900;color:#4F46E5">🎓 Parents Area</h1>
      <p class="muted mt-8">Your own professional development, kept separate from the kids' learning</p>
    </div>
    <div class="card">
      <h2 style="font-size:1.2em;font-weight:800;margin-bottom:4px">Choose a topic</h2>
      <p class="muted" style="font-size:0.9em;margin-bottom:16px">More topics can be added here over time</p>
      <div class="children-grid">
        <div class="child-card" onclick="enterFinanceTraining()">
          <div class="child-avatar">💼</div>
          <div class="child-name">Finance Training</div>
          <div class="child-meta">Core finance &amp; business management</div>
        </div>
      </div>
    </div>`;
}

async function enterFinanceTraining() {
  setLoading('Loading...');
  homeBtn.classList.remove('hidden');
  try {
    const data = await financeApi.getLearners();
    S.learners = data.learners || [];
    renderFinanceHome();
  } catch (e) {
    appEl.innerHTML = `
      <div class="card text-center">
        <p style="font-size:2.5em">⚠️</p>
        <p style="margin-top:8px">Could not connect to the server.<br>Make sure the app is running.</p>
        <button class="btn btn-primary mt-16" onclick="enterFinanceTraining()">Try Again</button>
      </div>`;
  }
}

// ── Screen: Finance Home ─────────────────────────────────────────────────
function renderFinanceHome() {
  homeBtn.classList.remove('hidden'); // one level below Parents Home now — "← Home" returns to the topic picker

  const cards = S.learners.length === 0
    ? `<div class="card text-center" style="padding:36px">
         <p style="font-size:3em">💼</p>
         <p class="muted mt-8">No profiles yet.<br>Click <strong>Add Learner</strong> to get started!</p>
       </div>`
    : `<div class="children-grid">
         ${S.learners.map(l => `
           <div class="child-card" onclick="selectLearner('${l.id}')">
             <button class="child-delete" onclick="onDeleteLearner(event,'${l.id}')" title="Remove">×</button>
             <div class="child-avatar">${avatarForLearner(l)}</div>
             <div class="child-name">${esc(l.name)}</div>
             <div class="child-meta">Professional Finance Training</div>
           </div>`).join('')}
       </div>`;

  appEl.innerHTML = `
    <div class="text-center" style="margin-bottom:32px">
      <h1 style="font-size:2.2em;font-weight:900;color:#4F46E5">💼 Finance Training</h1>
      <p class="muted mt-8">Core finance management education, built around Corporate Finance
      with electives to explore and adapt over time</p>
      <p class="muted" style="font-size:0.8em;margin-top:6px">Educational practice content only
      — not personal financial or investment advice.</p>
    </div>
    <div class="card">
      <div class="row" style="align-items:center;margin-bottom:4px">
        <div>
          <h2 style="font-size:1.2em;font-weight:800">Who's training?</h2>
          <p class="muted" style="font-size:0.9em;margin-top:4px">Pick a profile to continue</p>
        </div>
        <div style="flex:0">
          <button class="btn btn-primary" onclick="showAddLearnerModal()">+ Add Learner</button>
        </div>
      </div>
      ${cards}
    </div>`;
}

async function selectLearner(id) {
  setLoading('Loading progress...');
  homeBtn.classList.remove('hidden');
  try {
    const prog = await financeApi.getProgress(id);
    S.currentLearner  = prog.learner;
    S.financeProgress = prog;
    renderFinanceDashboard();
  } catch (e) {
    alert('Could not load progress — please try again.');
    renderFinanceHome();
  }
}

async function onDeleteLearner(e, id) {
  e.stopPropagation();
  const l = S.learners.find(x => x.id === id);
  if (!confirm(`Remove ${l?.name ?? 'this profile'}? Their progress will be lost.`)) return;
  try {
    await financeApi.deleteLearner(id);
    S.learners = S.learners.filter(x => x.id !== id);
    renderFinanceHome();
  } catch { alert('Error removing profile.'); }
}

// ── Modal: Add Learner (Finance) ─────────────────────────────────────────
function showAddLearnerModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'add-learner-modal';

  overlay.innerHTML = `
    <div class="modal modal-guide">
      <h2 class="modal-title">➕ Add a Learner</h2>
      <div class="form-group">
        <label class="form-label">Name</label>
        <input class="form-input" id="ml-name" type="text" placeholder="e.g. Jason" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label">Choose an Avatar</label>
        ${avatarPickerHtml('ml-avatar-picker', '💼')}
      </div>
      <div class="form-group">
        <label class="form-label">Focus Areas — what should we start with?</label>
        <p class="muted" style="font-size:0.85em;margin-bottom:10px"><strong>Corporate Finance</strong>
        is the core area and is ticked by default. Tick any electives to start now — you can add
        more any time. Pick the level that fits best for each.</p>
        <div class="focus-area-list">${focusAreaListHtml([FINANCE_CORE_DOMAIN], {}, FINANCE_DOMAIN_INFO, FINANCE_LEVEL_LABELS)}</div>
      </div>
      <div class="form-group">
        <label class="form-label">Anything specific? <span class="muted" style="font-weight:400">(optional)</span></label>
        <textarea class="form-input" id="ml-focus-note" rows="2" placeholder="e.g. want to get better at valuation for work conversations..."></textarea>
      </div>
      <div class="row mt-24">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" style="flex:2" onclick="confirmAddLearner()">Add Learner ✨</button>
      </div>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);

  const inp = document.getElementById('ml-name');
  inp.focus();
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') confirmAddLearner(); });
}

async function confirmAddLearner() {
  const name   = document.getElementById('ml-name')?.value.trim();
  const avatar = getSelectedAvatar('ml-avatar-picker');
  const focus_note = document.getElementById('ml-focus-note')?.value.trim() || null;
  const { active_domains, starting_levels } = getFocusSelections();
  if (!name) { alert('Please enter a name!'); return; }
  if (active_domains.length === 0) { alert('Please pick at least one focus area to start with!'); return; }

  try {
    const learner = await financeApi.addLearner(name, avatar, active_domains, starting_levels, focus_note);
    S.learners.push(learner);
    closeModal();
    renderFinanceHome();
  } catch (e) {
    alert('Error adding learner — please try again.');
  }
}

// ── Screen: Finance Dashboard ─────────────────────────────────────────────
function renderFinanceDashboard() {
  const l    = S.currentLearner;
  const prog = S.financeProgress;
  const activeDomains = (l.active_domains && l.active_domains.length) ? l.active_domains : [FINANCE_CORE_DOMAIN];

  const domainCards = Object.entries(FINANCE_DOMAIN_INFO).map(([key, info]) => {
    if (!activeDomains.includes(key)) {
      return `
        <div style="position:relative">
          <button class="domain-card domain-card-inactive" data-domain="${key}" onclick="quickAddLearnerFocusArea('${key}')">
            <div class="domain-icon">${info.icon}</div>
            <div class="domain-name">${info.name}</div>
            <div class="domain-stats">＋ Add this area</div>
          </button>
        </div>`;
    }

    const d    = prog.domains[key] || { difficulty:2.0, total_questions:0, correct:0, accuracy:0, difficulty_desc:'', recent_results:[] };
    const pct  = d.accuracy || 0;
    const dots = (d.recent_results || []).map(r =>
      `<div class="rdot ${r ? 'ok' : 'bad'}"></div>`).join('');
    const stats = d.total_questions > 0
      ? `${d.correct}/${d.total_questions} correct · ${esc(d.difficulty_desc)}`
      : 'Not started yet — tap to begin!';

    return `
      <div style="position:relative">
        <button class="domain-card" data-domain="${key}" onclick="renderModuleList('${key}')">
          <div class="domain-icon">${info.icon}</div>
          <div class="domain-name">${info.name}</div>
          <div class="domain-stats">${stats}</div>
          ${d.total_questions > 0 ? `
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
            <div class="recent-dots">${dots}</div>` : ''}
        </button>
        ${d.total_questions > 0 ? `
          <div style="display:flex;gap:6px;margin-top:8px;justify-content:center">
            <button class="btn btn-sm" style="flex:1;font-size:0.8em" onclick="adjustLearnerDifficulty('${key}',-0.5)">📉 Easier</button>
            <button class="btn btn-sm" style="flex:1;font-size:0.8em" onclick="adjustLearnerDifficulty('${key}',0.5)">📈 Harder</button>
          </div>` : ''}
      </div>`;
  }).join('');

  appEl.innerHTML = `
    <div class="card text-center" style="padding:30px">
      <div style="font-size:4em">${avatarForLearner(l)}</div>
      <h2 style="font-size:1.7em;font-weight:900;margin-top:8px">${esc(l.name)}</h2>
      <p class="muted">Finance Training</p>
      ${l.focus_note ? `<p class="muted" style="font-size:0.85em;margin-top:6px;font-style:italic">"${esc(l.focus_note)}"</p>` : ''}
      <div class="row" style="justify-content:center;gap:8px;margin-top:12px;max-width:460px;margin-left:auto;margin-right:auto">
        <button class="btn btn-ghost" style="font-size:0.9em" onclick="showEditLearnerModal()">⚙️ Edit Settings</button>
        <button class="btn btn-ghost" style="font-size:0.9em" onclick="showManageLearnerFocusModal()">🎯 Focus Areas</button>
        <button class="btn btn-ghost" style="font-size:0.9em" onclick="showLearnerProgressReportModal()">📊 Progress Report</button>
      </div>
    </div>
    <h3 style="font-weight:800;font-size:1.1em;margin-bottom:4px">Choose an area to practise</h3>
    <p class="muted" style="font-size:0.88em;margin-bottom:16px">Questions get harder as you improve — and easier if you need more practice</p>
    <div class="domain-grid">${domainCards}</div>`;
}

async function quickAddLearnerFocusArea(domain) {
  const l = S.currentLearner;
  const current = (l.active_domains && l.active_domains.length) ? l.active_domains : [FINANCE_CORE_DOMAIN];
  if (current.includes(domain)) return;
  const updated = [...current, domain];

  try {
    const updatedLearner = await financeApi.updateFocus(l.id, { active_domains: updated, focus_note: l.focus_note });
    S.currentLearner = updatedLearner;
    S.financeProgress = await financeApi.getProgress(l.id);
    renderFinanceDashboard();
  } catch (e) {
    alert('Could not add this area — please try again.');
  }
}

async function adjustLearnerDifficulty(domain, delta) {
  try {
    await financeApi.adjustDifficulty(S.currentLearner.id, domain, delta);
    S.financeProgress = await financeApi.getProgress(S.currentLearner.id);
    renderFinanceDashboard();
  } catch (e) {
    alert('Error adjusting difficulty — please try again.');
  }
}

// ── Screen: Module List ───────────────────────────────────────────────────
async function renderModuleList(domain) {
  S.currentFinanceDomain = domain;
  S.currentModuleId      = null;
  setLoading('Loading modules...');
  try {
    const data = await financeApi.getModules(S.currentLearner.id, domain);
    renderModuleListContent(data);
  } catch (e) {
    alert('Could not load modules — please try again.');
    renderFinanceDashboard();
  }
}

function renderModuleListContent(data) {
  const info = FINANCE_DOMAIN_INFO[data.domain];

  const rows = data.modules.map((m, i) => `
    <div class="module-row ${m.unlocked ? '' : 'module-locked'} ${m.passed ? 'module-passed' : ''}"
         ${m.unlocked ? `onclick="openModule('${data.domain}','${m.id}','${esc(m.name)}')"` : ''}>
      <div class="module-num">${m.passed ? '✓' : i + 1}</div>
      <div class="module-info">
        <div class="module-name">${esc(m.name)}</div>
        <div class="module-blurb">${esc(m.focus)}</div>
        ${m.attempts > 0 ? `<div class="module-status">Best attempt: ${m.best_score_pct}%${m.passed ? ' · Passed ✅' : ' · Not yet passed'}</div>` : ''}
      </div>
      ${!m.unlocked ? '<div class="module-lock">🔒</div>' : ''}
    </div>`).join('');

  appEl.innerHTML = `
    <div class="card">
      <div class="q-header" style="margin-bottom:6px">
        <span style="font-size:1.4em;margin-right:8px">${info.icon}</span>
        <strong style="flex:1;font-size:1.15em">${esc(info.name)}</strong>
      </div>
      <p class="muted" style="font-size:0.9em;margin-bottom:18px">Work through each module in
      order — read the lesson, then pass its quiz (4/5 or better) to unlock the next.</p>
      <div class="module-list">${rows}</div>
      <button class="btn btn-ghost btn-full mt-16" onclick="startLearnerDomain('${data.domain}')">🎲 Free Practice (mixes all unlocked modules)</button>
    </div>
    <button class="btn btn-ghost mt-8" onclick="renderFinanceDashboard()">← Back to dashboard</button>`;
}

// ── Screen: Module Lesson ─────────────────────────────────────────────────
async function openModule(domain, moduleId, moduleName) {
  S.currentFinanceDomain = domain;
  S.currentModuleId      = moduleId;
  S.currentModuleName    = moduleName;
  setLoading('Preparing your lesson... 📖');
  try {
    const lesson = await financeApi.getLesson(S.currentLearner.id, domain, moduleId);
    renderModuleLesson(lesson);
  } catch (e) {
    appEl.innerHTML = `
      <div class="card">
        <p style="font-size:1.5em">😕</p>
        <p style="margin-top:8px">Couldn't load the lesson — please try again.</p>
        <button class="btn btn-primary mt-16" onclick="openModule('${domain}','${moduleId}','${esc(moduleName)}')">Try Again</button>
      </div>`;
  }
}

function renderModuleLesson(lesson) {
  const sectionsHtml = (lesson.sections || []).map(s => `
    <div class="guide-section">
      <h3>${esc(s.heading)}</h3>
      <p>${esc(s.content)}</p>
    </div>`).join('');

  const takeawaysHtml = (lesson.key_takeaways && lesson.key_takeaways.length) ? `
    <div class="expl-box mt-16">
      <strong>🔑 Key Takeaways</strong>
      <ul style="margin-top:8px;padding-left:20px;line-height:1.7">
        ${lesson.key_takeaways.map(t => `<li>${esc(t)}</li>`).join('')}
      </ul>
    </div>` : '';

  appEl.innerHTML = `
    <div class="card">
      <h2 style="font-size:1.5em;font-weight:900;margin-bottom:6px">${esc(lesson.title || S.currentModuleName)}</h2>
      <p class="muted" style="margin-bottom:20px">${esc(lesson.intro || '')}</p>
      ${sectionsHtml}
      ${takeawaysHtml}
      <button class="btn btn-primary btn-lg btn-full mt-24" onclick="beginModuleQuiz()">Take the Quiz →</button>
    </div>
    <button class="btn btn-ghost mt-8" onclick="renderModuleList('${S.currentFinanceDomain}')">← Back to modules</button>`;
}

async function beginModuleQuiz() {
  S.financeSession = { correct: 0, total: 0, results: [] };
  await loadNextLearnerQuestion();
}

// ── Screen: Finance Question ──────────────────────────────────────────────
async function startLearnerDomain(domain) {
  S.currentFinanceDomain = domain;
  S.currentModuleId      = null;   // free practice — not scoped to a module
  S.currentModuleName    = null;
  S.financeSession       = { correct: 0, total: 0, results: [] };
  await loadNextLearnerQuestion();
}

async function loadNextLearnerQuestion() {
  setLoading('Generating your question... ✨');
  try {
    S.currentFinanceQ = await financeApi.getQuestion(S.currentLearner.id, S.currentFinanceDomain, S.currentModuleId);
    renderLearnerQuestion();
  } catch (e) {
    appEl.innerHTML = `
      <div class="card">
        <p style="font-size:1.5em">😕</p>
        <p style="margin-top:8px">Oops — couldn't generate a question. Please try again.</p>
        <button class="btn btn-primary mt-16" onclick="loadNextLearnerQuestion()">Try Again</button>
      </div>`;
  }
}

function renderLearnerQuestion() {
  const { question, difficulty_desc } = S.currentFinanceQ;
  const info    = FINANCE_DOMAIN_INFO[S.currentFinanceDomain];
  const results = S.financeSession.results;
  const headerLabel = S.currentModuleId ? `${esc(info.name)} · ${esc(S.currentModuleName)}` : esc(info.name);
  const backTarget  = S.currentModuleId ? `renderModuleList('${S.currentFinanceDomain}')` : 'renderFinanceDashboard()';

  const dots = Array.from({ length: SESSION_LENGTH }, (_, i) => {
    if      (i < results.length)     return `<div class="pdot ${results[i] ? 'correct' : 'incorrect'}"></div>`;
    else if (i === results.length)   return `<div class="pdot current"></div>`;
    else                              return `<div class="pdot"></div>`;
  }).join('');

  let body = '';
  if (question.passage) {
    body += `<div class="passage-box">${esc(question.passage)}</div>`;
  }
  body += `<div class="question-text">${esc(question.question)}</div>`;
  body += `<div class="options-list">
    ${Object.entries(question.options).map(([k, v]) => `
      <button class="opt-btn" data-key="${k}" onclick="submitLearnerMCQ('${k}')">
        <span class="opt-letter">${k}</span>
        <span>${esc(v)}</span>
      </button>`).join('')}
  </div>`;

  appEl.innerHTML = `
    <div class="card">
      <div class="q-header">
        <span style="font-size:1.4em;margin-right:8px">${info.icon}</span>
        <strong style="flex:1">${headerLabel}</strong>
        <span class="diff-badge">${esc(difficulty_desc)}</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:22px">
        <div class="progress-dots">${dots}</div>
        <span class="muted" style="font-size:0.88em">Q${results.length + 1} of ${SESSION_LENGTH}</span>
      </div>
      ${body}
    </div>
    <button class="btn btn-ghost mt-8" onclick="${backTarget}">← Back</button>`;
}

async function submitLearnerMCQ(key) {
  document.querySelectorAll('.opt-btn').forEach(b => b.disabled = true);
  await processLearnerAnswer(key);
}

async function processLearnerAnswer(answer) {
  try {
    const result = await financeApi.submitAnswer(
      S.currentLearner.id, S.currentFinanceDomain, S.currentFinanceQ.question, answer
    );
    S.lastFinanceResult = result;
    const correct = result.feedback.is_correct;
    S.financeSession.total++;
    if (correct) S.financeSession.correct++;
    S.financeSession.results.push(correct ? 1 : 0);
    renderLearnerFeedback();
  } catch (e) {
    appEl.innerHTML = `
      <div class="card">
        <p>Error submitting answer — please try again.</p>
        <button class="btn btn-primary mt-16" onclick="renderLearnerQuestion()">Back</button>
      </div>`;
  }
}

// ── Screen: Finance Feedback ───────────────────────────────────────────────
function renderLearnerFeedback() {
  const { feedback, difficulty_changed } = S.lastFinanceResult;
  const q       = S.currentFinanceQ.question;
  const correct = feedback.is_correct;
  const isLast  = S.financeSession.results.length >= SESSION_LENGTH;
  const backTarget = S.currentModuleId ? `renderModuleList('${S.currentFinanceDomain}')` : 'renderFinanceDashboard()';

  const answerBlock = `<div class="options-list" style="margin-bottom:14px">
    ${Object.entries(q.options).map(([k, v]) => {
      const isRight = k === feedback.correct_answer;
      return `<div class="opt-btn ${isRight ? 'correct-ans' : ''}" style="cursor:default">
        <span class="opt-letter">${k}</span>
        <span>${esc(v)}</span>
        ${isRight ? '<span style="margin-left:auto;color:var(--success);font-size:1.2em">✓</span>' : ''}
      </div>`;
    }).join('')}
  </div>`;

  let levelHtml = '';
  if (difficulty_changed === 'up')
    levelHtml = `<div class="text-center mt-8"><span class="level-pill level-up">🚀 Difficulty increased!</span></div>`;
  else if (difficulty_changed === 'down')
    levelHtml = `<div class="text-center mt-8"><span class="level-pill level-down">💡 Let's ease back a little first</span></div>`;

  appEl.innerHTML = `
    <div class="card">
      <div class="feedback-emoji">${correct ? '🌟' : '📘'}</div>
      <div class="feedback-result ${correct ? 'correct' : 'incorrect'}">
        ${correct ? 'Correct!' : 'Not quite'}
      </div>
      ${levelHtml}
      ${answerBlock}
      <div class="expl-box">
        <strong>💡 ${correct ? 'Why this is right:' : 'The answer:'}</strong><br>
        ${esc(feedback.explanation || '')}
      </div>
      <div class="row mt-16">
        <button class="btn btn-ghost" onclick="${backTarget}">${S.currentModuleId ? '📚 Modules' : '📊 Dashboard'}</button>
        <button class="btn btn-primary btn-lg" style="flex:2"
          onclick="${isLast ? 'renderLearnerComplete()' : 'loadNextLearnerQuestion()'}">
          ${isLast ? '🏆 See Results' : 'Next Question →'}
        </button>
      </div>
    </div>`;
}

// ── Screen: Finance Session complete ───────────────────────────────────────
async function renderLearnerComplete() {
  const { correct, total } = S.financeSession;

  if (S.currentModuleId) {
    setLoading('Checking your results...');
    try {
      const result = await financeApi.completeModule(S.currentLearner.id, S.currentFinanceDomain, S.currentModuleId, correct, total);
      renderModuleResult(result);
    } catch (e) {
      alert('Could not record your result — please try again.');
      renderModuleList(S.currentFinanceDomain);
    }
    return;
  }

  const pct = Math.round(correct / total * 100);
  const msg = pct === 100 ? "Perfect score — excellent grasp of this area! 🎉"
            : pct >= 80   ? "Strong session — you're building real fluency here. 🎊"
            : pct >= 60   ? "Solid progress — a bit more practice will consolidate this. 💪"
            :               "Good effort — this area's worth another pass soon. 📘";

  appEl.innerHTML = `
    <div class="card text-center" style="padding:40px">
      <h2 style="font-size:1.5em;font-weight:900">Session Complete!</h2>
      <div class="score-big">${correct}/${total}</div>
      <p class="score-sub">${pct}% correct</p>
      <p class="muted" style="margin-bottom:32px">${msg}</p>
      <div class="row" style="justify-content:center">
        <button class="btn btn-ghost" onclick="renderFinanceDashboard()">📊 View Progress</button>
        <button class="btn btn-primary btn-lg" onclick="startLearnerDomain('${S.currentFinanceDomain}')">🔄 Practice Again</button>
      </div>
    </div>`;
}

function renderModuleResult(result) {
  const { passed, score, total } = result;
  const pct = Math.round(score / total * 100);
  const msg = passed
    ? "🎉 Module passed! The next module is now unlocked."
    : `You got ${score}/${total} (${pct}%). You need at least 4/5 to pass — review the lesson and try again whenever you're ready.`;

  appEl.innerHTML = `
    <div class="card text-center" style="padding:40px">
      <div style="font-size:3em">${passed ? '🏆' : '📘'}</div>
      <h2 style="font-size:1.5em;font-weight:900;margin-top:8px">${passed ? 'Module Complete!' : 'Not Quite There Yet'}</h2>
      <div class="score-big">${score}/${total}</div>
      <p class="score-sub">${pct}% correct</p>
      <p class="muted" style="margin-bottom:32px">${msg}</p>
      <div class="row" style="justify-content:center">
        <button class="btn btn-ghost" onclick="openModule('${S.currentFinanceDomain}','${S.currentModuleId}','${esc(S.currentModuleName)}')">📖 Review Lesson</button>
        <button class="btn btn-primary btn-lg" onclick="renderModuleList('${S.currentFinanceDomain}')">📚 ${passed ? 'Next Module' : 'Back to Modules'}</button>
      </div>
    </div>`;
}

// ── Modal: Edit Learner Settings ─────────────────────────────────────────
function showEditLearnerModal() {
  const l = S.currentLearner;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'edit-learner-modal';

  overlay.innerHTML = `
    <div class="modal">
      <h2 class="modal-title">⚙️ Edit Learner Settings</h2>
      <div class="form-group">
        <label class="form-label">Name</label>
        <input class="form-input" id="ml-edit-name" type="text" value="${esc(l.name)}" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label">Avatar</label>
        ${avatarPickerHtml('ml-edit-avatar-picker', avatarForLearner(l))}
      </div>
      <div class="row mt-24">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" style="flex:2" onclick="confirmEditLearner()">Save Changes ✓</button>
      </div>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
}

async function confirmEditLearner() {
  const name   = document.getElementById('ml-edit-name')?.value.trim();
  const avatar = getSelectedAvatar('ml-edit-avatar-picker');
  if (!name) { alert('Please enter a name!'); return; }

  try {
    await financeApi.updateLearner(S.currentLearner.id, { name, avatar });
    const prog = await financeApi.getProgress(S.currentLearner.id);
    S.currentLearner  = prog.learner;
    S.financeProgress = prog;
    closeModal();
    renderFinanceDashboard();
  } catch (e) {
    alert('Error updating learner — please try again.');
  }
}

// ── Modal: Manage Focus Areas (Finance) ──────────────────────────────────
function showManageLearnerFocusModal() {
  const l = S.currentLearner;
  const active = (l.active_domains && l.active_domains.length) ? l.active_domains : [FINANCE_CORE_DOMAIN];

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'learner-focus-modal';

  overlay.innerHTML = `
    <div class="modal modal-guide">
      <h2 class="modal-title">🎯 Focus Areas</h2>
      <p class="muted" style="font-size:0.88em;margin-bottom:16px">Choose which areas
      ${esc(l.name)} is currently working on. Corporate Finance is the recommended core — the
      rest are electives. Unticked areas stay available to add anytime. The level pick only
      applies to areas not yet started.</p>
      <div class="focus-area-list">${focusAreaListHtml(active, {}, FINANCE_DOMAIN_INFO, FINANCE_LEVEL_LABELS)}</div>
      <div class="form-group mt-16">
        <label class="form-label">Focus note <span class="muted" style="font-weight:400">(optional)</span></label>
        <textarea class="form-input" id="ml-focus-note-edit" rows="2" placeholder="e.g. want to get better at valuation...">${esc(l.focus_note || '')}</textarea>
      </div>
      <div class="row mt-24">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" style="flex:2" onclick="confirmManageLearnerFocus()">Save Changes ✓</button>
      </div>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
}

async function confirmManageLearnerFocus() {
  const { active_domains, starting_levels } = getFocusSelections();
  const focus_note = document.getElementById('ml-focus-note-edit')?.value.trim() || '';
  if (active_domains.length === 0) { alert('Please keep at least one focus area active!'); return; }

  try {
    const updatedLearner = await financeApi.updateFocus(S.currentLearner.id, { active_domains, focus_note, starting_levels });
    S.currentLearner = updatedLearner;
    S.financeProgress = await financeApi.getProgress(S.currentLearner.id);
    closeModal();
    renderFinanceDashboard();
  } catch (e) {
    alert('Error updating focus areas — please try again.');
  }
}

// ── Modal: Progress Report (Finance) ─────────────────────────────────────
async function showLearnerProgressReportModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'learner-report-modal';
  overlay.innerHTML = `
    <div class="modal modal-guide">
      <h2 class="modal-title">📊 Progress Report</h2>
      <div class="loading-spinner"><div class="spinner"></div><p>Loading report...</p></div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);

  try {
    const data = await financeApi.getHistory(S.currentLearner.id);
    renderLearnerProgressReport(data);
  } catch (e) {
    const modal = document.querySelector('#learner-report-modal .modal');
    if (modal) modal.innerHTML = `
      <h2 class="modal-title">📊 Progress Report</h2>
      <p>Couldn't load the report right now — please try again.</p>
      <button class="btn btn-primary btn-full mt-16" onclick="closeModal()">Close</button>`;
  }
}

function renderLearnerProgressReport(data) {
  const modal = document.querySelector('#learner-report-modal .modal');
  if (!modal) return;

  const domains = Object.entries(data.history || {});
  if (domains.length === 0) {
    modal.innerHTML = `
      <h2 class="modal-title">📊 Progress Report</h2>
      <p class="muted">No questions answered yet — once ${esc(data.learner.name)} completes a
      few, results and improvement areas will show up here.</p>
      <button class="btn btn-primary btn-full mt-16" onclick="closeModal()">Close</button>`;
    return;
  }

  const sections = domains.map(([domain, d]) => {
    const info = FINANCE_DOMAIN_INFO[domain] || { icon: '✨', name: domain };

    const improvementHtml = d.improvement_areas.length
      ? d.improvement_areas.map(t => `
          <div class="topic-row">
            <span>${esc(t.topic)}</span>
            <span class="topic-badge">${t.correct}/${t.total} · ${t.accuracy}%</span>
          </div>`).join('')
      : `<p class="muted" style="font-size:0.88em">No clear problem areas yet — going well!</p>`;

    const recentHtml = d.recent_sessions.map(s => {
      const date = new Date(s.timestamp).toLocaleString(undefined,
        { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
      return `
        <div class="session-row">
          <span>${s.is_correct ? '✅' : '❌'}</span>
          <span class="session-topic">${esc(s.topic || 'general')}</span>
          <span class="muted session-date">${date}</span>
        </div>`;
    }).join('');

    return `
      <div class="guide-section">
        <h3>${info.icon} ${info.name} — ${d.accuracy}% overall (${d.correct}/${d.total_questions})</h3>
        <p class="muted" style="font-size:0.85em;margin-bottom:6px;font-weight:700">🎯 Areas to focus on</p>
        ${improvementHtml}
        <p class="muted" style="font-size:0.85em;margin:14px 0 6px;font-weight:700">🕐 Recent answers</p>
        <div class="session-list">${recentHtml}</div>
      </div>`;
  }).join('');

  modal.innerHTML = `
    <h2 class="modal-title">📊 ${esc(data.learner.name)}'s Progress Report</h2>
    ${sections}
    <button class="btn btn-primary btn-full mt-16" onclick="closeModal()">Close</button>`;
}

// ── Boot ───────────────────────────────────────────────────────────────────
init();
