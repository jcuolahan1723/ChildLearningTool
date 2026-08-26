import json
import os
import random
import uuid
from datetime import datetime
from typing import Optional, List

from dotenv import load_dotenv
load_dotenv()  # loads ANTHROPIC_API_KEY from .env if present

import anthropic
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="NAPLAN Tutor")

# On Azure App Service (Linux), /home is the persistent, writable directory that
# survives restarts and redeploys — the rest of the filesystem (/home/site/wwwroot)
# can be replaced on every deploy. Locally (via start.bat) DATA_DIR isn't set, so
# this falls back to a plain ./data folder next to app.py, same as before.
DATA_DIR = os.environ.get("DATA_DIR", "data")
PROGRESS_DIR = os.path.join(DATA_DIR, "progress")
CHILDREN_FILE = os.path.join(DATA_DIR, "children.json")

os.makedirs(PROGRESS_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

if not os.path.exists(CHILDREN_FILE):
    with open(CHILDREN_FILE, "w") as f:
        json.dump({"children": []}, f)

# Finance Training track — fully separate storage from the kids' data, same
# persistence approach (lives under DATA_DIR, so it survives Azure restarts too).
FINANCE_DIR = os.path.join(DATA_DIR, "finance")
FINANCE_PROGRESS_DIR = os.path.join(FINANCE_DIR, "progress")
LEARNERS_FILE = os.path.join(FINANCE_DIR, "learners.json")

os.makedirs(FINANCE_PROGRESS_DIR, exist_ok=True)

if not os.path.exists(LEARNERS_FILE):
    with open(LEARNERS_FILE, "w") as f:
        json.dump({"learners": []}, f)

client = anthropic.Anthropic()

DOMAINS = ["reading", "phonemics", "numeracy", "language_conventions", "writing"]

FUN_BREAK_KINDS = ["did_you_know", "dad_joke", "riddle"]

# ── Finance Training track ──────────────────────────────────────────────────
FINANCE_DOMAINS = [
    "corporate_finance",
    "financial_management",
    "business_economics",
    "data_analysis",
    "decentralised_finance",
    "robo_advice",
    "international_finance",
    "private_equity_vc",
    "equity_valuation",
    "fixed_income",
]

FINANCE_CORE_DOMAIN = "corporate_finance"

FINANCE_DOMAIN_INSTRUCTIONS = {
    "corporate_finance": (
        "Cover core corporate finance: capital budgeting (NPV, IRR, payback period), cost of "
        "capital (WACC), capital structure (debt vs equity trade-offs), dividend policy, working "
        "capital management, and M&A fundamentals. Vary across these sub-areas rather than "
        "repeating the same one each time."
    ),
    "financial_management": (
        "Cover financial management: reading and analysing financial statements (balance sheet, "
        "income statement, cash flow statement), ratio analysis (liquidity, profitability, "
        "leverage, efficiency), budgeting and forecasting, and financial risk management basics."
    ),
    "business_economics": (
        "Cover business economics: supply and demand, market structures (perfect competition, "
        "monopoly, oligopoly), price elasticity, inflation and interest rates, business cycles, "
        "and how key economic indicators should inform business strategy and decision-making."
    ),
    "data_analysis": (
        "Cover introductory business data analysis: descriptive statistics (mean, median, "
        "variance, standard deviation), interpreting charts and dashboards, correlation vs "
        "causation, basic probability, and drawing sound conclusions from data — the level of "
        "reasoning needed to interpret a business report or KPI dashboard, not advanced statistics."
    ),
    "decentralised_finance": (
        "Cover decentralised finance (DeFi) fundamentals: how blockchain and smart contracts "
        "underpin DeFi, lending/borrowing protocols, decentralised exchanges, stablecoins, yield "
        "farming and liquidity pools, and the key risks (smart contract risk, volatility, "
        "regulation) compared with traditional finance."
    ),
    "robo_advice": (
        "Cover robo-advice: how automated investment platforms build and rebalance portfolios "
        "(e.g. using modern portfolio theory), typical fee structures vs traditional advisors, "
        "suitability and regulatory considerations, and the trade-offs between robo-advice and "
        "human financial advice."
    ),
    "international_finance": (
        "Cover international finance: exchange rate determination and currency risk, hedging "
        "instruments (forwards, options), the balance of payments, purchasing power parity, "
        "international capital markets, and considerations in cross-border business or M&A."
    ),
    "private_equity_vc": (
        "Cover private equity and venture capital: fund structures (GP/LP, carried interest, "
        "management fees), venture funding stages (seed through Series A-C and beyond), "
        "leveraged buyouts (LBOs), valuation approaches for private companies, and typical exit "
        "strategies (IPO, trade sale, secondary sale)."
    ),
    "equity_valuation": (
        "Cover equity valuation methods: discounted cash flow (DCF) analysis, comparable company "
        "analysis, precedent transaction analysis, key valuation multiples (P/E, EV/EBITDA, P/B), "
        "and the dividend discount model — including when each method is most appropriate."
    ),
    "fixed_income": (
        "Cover fixed income fundamentals: bond pricing and yield, duration and convexity, the "
        "relationship between interest rates and bond prices, credit ratings and credit risk, the "
        "yield curve and what it signals, and the main types of bonds (government, corporate, "
        "high-yield)."
    ),
}

DOMAIN_INSTRUCTIONS = {
    "reading": (
        "Generate a reading comprehension passage followed by one multiple choice question about "
        "it. Scale to the student's year level: for primary (Foundation-Year 6), a short passage "
        "(4-6 sentences) with a mostly literal comprehension question. For secondary (Year 7+), a "
        "longer, denser passage (2-3 short paragraphs) with more analytical questions — author's "
        "purpose, tone, implied meaning, or how a specific technique affects the reader, not just "
        "recall. Use Australian context (places, people, issues) where natural."
    ),
    "phonemics": (
        "Generate one phonemic awareness / phonics read-aloud task appropriate for the difficulty "
        "level. This is NOT a multiple choice question — the child will say the answer out loud to "
        "a parent, who checks it and marks it, so do not reveal the answer in the question text. "
        "Vary across sessions between: sounding out/blending a word from its letters, segmenting a "
        "word into its individual sounds, identifying the beginning/middle/end sound in a word, "
        "producing a rhyme, counting syllables, or saying the sound a letter or letter-combination "
        "makes (e.g. 'sh', 'ai'). Keep vocabulary simple and age-appropriate, and use "
        "Australian-familiar words where natural. Use the read_aloud schema."
    ),
    "numeracy": (
        "Generate one mathematics problem, multiple choice with exactly 4 options, scaled to the "
        "student's year level. For primary (Foundation-Year 6), a mix of number, measurement, "
        "geometry, or data questions. For secondary (Year 7+), scale into algebra (simple "
        "equations/expressions), ratios and proportions, percentages, negative numbers, basic "
        "statistics or probability, and multi-step word problems, alongside the primary topics as "
        "appropriate. Vary the topic across sessions rather than repeating the same type."
    ),
    "language_conventions": (
        "Generate one question testing spelling, grammar, or punctuation, multiple choice with "
        "exactly 4 options, scaled to the student's year level. For primary (Foundation-Year 6), "
        "keep to basics: identify the misspelled word, choose the correct punctuation, pick the "
        "grammatically correct sentence. For secondary (Year 7+), also draw on more advanced "
        "areas: sentence and clause structure, active vs passive voice, correct use of semicolons "
        "and colons, and vocabulary-in-context (choosing the most precise or appropriate word)."
    ),
    "writing": (
        "Generate a writing prompt with a brief guide on word count expectations, scaled to the "
        "student's year level. Year 1-3: narrative (e.g. 'Write a story about...'). Year 4-6: "
        "persuasive (e.g. 'Write to convince...'). Year 7+: a more sophisticated persuasive or "
        "discursive prompt expecting a structured argument, evidence/examples, and awareness of a "
        "specific audience — e.g. debating a real-world issue relevant to teenagers, or writing an "
        "analytical response to a scenario."
    ),
}


# --- Pydantic models ---

class Child(BaseModel):
    name: str
    age: int
    avatar: Optional[str] = None
    active_domains: Optional[List[str]] = None
    starting_levels: Optional[dict] = None
    focus_note: Optional[str] = None


class QuestionRequest(BaseModel):
    child_id: str
    domain: str


class AnswerRequest(BaseModel):
    child_id: str
    domain: str
    question_data: dict
    answer: str


class UpdateChildRequest(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    avatar: Optional[str] = None


class AdjustDifficultyRequest(BaseModel):
    delta: float


class UpdateFocusRequest(BaseModel):
    active_domains: List[str]
    focus_note: Optional[str] = None
    starting_levels: Optional[dict] = None


# --- Finance Training models ---

class Learner(BaseModel):
    name: str
    avatar: Optional[str] = None
    active_domains: Optional[List[str]] = None
    starting_levels: Optional[dict] = None
    focus_note: Optional[str] = None


class UpdateLearnerRequest(BaseModel):
    name: Optional[str] = None
    avatar: Optional[str] = None


class UpdateLearnerFocusRequest(BaseModel):
    active_domains: List[str]
    focus_note: Optional[str] = None
    starting_levels: Optional[dict] = None


class LearnerQuestionRequest(BaseModel):
    learner_id: str
    domain: str


class LearnerAnswerRequest(BaseModel):
    learner_id: str
    domain: str
    question_data: dict
    answer: str


class LearnerAdjustDifficultyRequest(BaseModel):
    delta: float


# --- Data helpers ---

def age_to_year_level(age: int) -> int:
    return max(1, age - 5)


def load_children() -> dict:
    with open(CHILDREN_FILE) as f:
        return json.load(f)


def save_children(data: dict) -> None:
    with open(CHILDREN_FILE, "w") as f:
        json.dump(data, f, indent=2)


def load_progress(child_id: str) -> dict:
    path = os.path.join(PROGRESS_DIR, f"{child_id}.json")
    if not os.path.exists(path):
        return {"child_id": child_id, "domains": {}}
    with open(path) as f:
        return json.load(f)


def save_progress(child_id: str, progress: dict) -> None:
    path = os.path.join(PROGRESS_DIR, f"{child_id}.json")
    with open(path, "w") as f:
        json.dump(progress, f, indent=2)


def get_domain_state(progress: dict, domain: str) -> dict:
    progress.setdefault("domains", {})
    if domain not in progress["domains"]:
        progress["domains"][domain] = {
            "difficulty": 2.0,
            "total_questions": 0,
            "correct": 0,
            "recent_results": [],
            "sessions": [],
            "topics_covered": [],
            "recent_questions": [],
        }
    state = progress["domains"][domain]
    state.setdefault("recent_questions", [])  # backward-compat for progress saved before this existed
    return state


def update_difficulty(state: dict, is_correct: bool) -> None:
    results = state.get("recent_results", [])
    results.append(1 if is_correct else 0)
    results = results[-8:]
    state["recent_results"] = results

    current = state["difficulty"]
    if len(results) >= 3:
        last3 = results[-3:]
        if sum(last3) == 3:
            current = min(5.0, current + 0.3)
        elif sum(last3) == 0:
            current = max(1.0, current - 0.3)
        elif len(results) >= 5 and sum(results[-5:]) >= 4:
            current = min(5.0, current + 0.1)
    state["difficulty"] = round(current, 2)


def difficulty_label(difficulty: float, year_level: int) -> str:
    if difficulty < 1.5:
        return f"Foundation (below Yr {year_level})"
    elif difficulty < 2.5:
        return f"Year {year_level} level"
    elif difficulty < 3.5:
        return f"Above Yr {year_level} (Yr {year_level + 1})"
    elif difficulty < 4.5:
        return f"Advanced (Yr {year_level + 2})"
    else:
        return f"Extension (Yr {year_level + 3}+)"


# --- Finance Training data helpers ---

def load_learners() -> dict:
    with open(LEARNERS_FILE) as f:
        return json.load(f)


def save_learners(data: dict) -> None:
    with open(LEARNERS_FILE, "w") as f:
        json.dump(data, f, indent=2)


def load_learner_progress(learner_id: str) -> dict:
    path = os.path.join(FINANCE_PROGRESS_DIR, f"{learner_id}.json")
    if not os.path.exists(path):
        return {"learner_id": learner_id, "domains": {}}
    with open(path) as f:
        return json.load(f)


def save_learner_progress(learner_id: str, progress: dict) -> None:
    path = os.path.join(FINANCE_PROGRESS_DIR, f"{learner_id}.json")
    with open(path, "w") as f:
        json.dump(progress, f, indent=2)


def get_finance_domain_state(progress: dict, domain: str) -> dict:
    progress.setdefault("domains", {})
    if domain not in progress["domains"]:
        progress["domains"][domain] = {
            "difficulty": 2.0,
            "total_questions": 0,
            "correct": 0,
            "recent_results": [],
            "sessions": [],
            "topics_covered": [],
            "recent_questions": [],
        }
    state = progress["domains"][domain]
    state.setdefault("recent_questions", [])
    return state


def finance_difficulty_label(difficulty: float) -> str:
    if difficulty < 1.5:
        return "Beginner"
    elif difficulty < 2.5:
        return "Practitioner"
    elif difficulty < 3.5:
        return "Proficient"
    elif difficulty < 4.5:
        return "Advanced"
    else:
        return "Expert"


def parse_claude_json(text: str) -> dict:
    """Strip markdown code fences then parse JSON, with a fallback for stray text."""
    text = text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        # parts[1] starts with optional 'json\n'
        inner = parts[1]
        if inner.startswith("json"):
            inner = inner[4:]
        text = inner.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Claude occasionally adds a stray word/sentence before or after the
        # JSON object — fall back to extracting the outermost {...} block.
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(text[start:end + 1])
        raise


# --- Routes ---

@app.get("/")
async def root():
    return FileResponse("static/index.html")


@app.get("/api/children")
async def get_children():
    return load_children()


@app.post("/api/children")
async def add_child(child: Child):
    data = load_children()
    year_level = age_to_year_level(child.age)

    active_domains = [d for d in (child.active_domains or DOMAINS) if d in DOMAINS]
    if not active_domains:
        active_domains = list(DOMAINS)  # never let a child end up with zero focus areas

    new_child = {
        "id": str(uuid.uuid4()),
        "name": child.name,
        "age": child.age,
        "year_level": year_level,
        "avatar": child.avatar or "🦘",
        "active_domains": active_domains,
        "focus_note": (child.focus_note or "").strip(),
        "created_at": datetime.now().isoformat(),
    }
    data["children"].append(new_child)
    save_children(data)

    if child.starting_levels:
        progress = load_progress(new_child["id"])
        level_map = {"support": 1.3, "level": 2.0, "challenge": 3.0}
        for domain, level_key in child.starting_levels.items():
            if domain in active_domains:
                state = get_domain_state(progress, domain)
                state["difficulty"] = level_map.get(level_key, 2.0)
        save_progress(new_child["id"], progress)

    return new_child


@app.put("/api/children/{child_id}")
async def update_child(child_id: str, req: UpdateChildRequest):
    data = load_children()
    child = next((c for c in data["children"] if c["id"] == child_id), None)
    if not child:
        raise HTTPException(404, "Child not found")

    if req.name is not None and req.name.strip():
        child["name"] = req.name.strip()
    if req.age is not None:
        child["age"] = req.age
        child["year_level"] = age_to_year_level(req.age)
    if req.avatar is not None:
        child["avatar"] = req.avatar

    save_children(data)
    return child


@app.put("/api/children/{child_id}/focus")
async def update_focus(child_id: str, req: UpdateFocusRequest):
    data = load_children()
    child = next((c for c in data["children"] if c["id"] == child_id), None)
    if not child:
        raise HTTPException(404, "Child not found")

    valid_domains = [d for d in req.active_domains if d in DOMAINS]
    if not valid_domains:
        raise HTTPException(400, "At least one focus area is required")

    child["active_domains"] = valid_domains
    if req.focus_note is not None:
        child["focus_note"] = req.focus_note.strip()
    save_children(data)

    if req.starting_levels:
        progress = load_progress(child_id)
        level_map = {"support": 1.3, "level": 2.0, "challenge": 3.0}
        for domain, level_key in req.starting_levels.items():
            if domain not in DOMAINS:
                continue
            state = get_domain_state(progress, domain)
            # Only seed difficulty for a domain that hasn't been practiced yet —
            # never overwrite a difficulty that's already adapted to real answers.
            if state.get("total_questions", 0) == 0:
                state["difficulty"] = level_map.get(level_key, 2.0)
        save_progress(child_id, progress)

    return child


@app.delete("/api/children/{child_id}")
async def delete_child(child_id: str):
    data = load_children()
    data["children"] = [c for c in data["children"] if c["id"] != child_id]
    save_children(data)
    return {"ok": True}


@app.get("/api/progress/{child_id}")
async def get_progress(child_id: str):
    children = load_children()
    child = next((c for c in children["children"] if c["id"] == child_id), None)
    if not child:
        raise HTTPException(404, "Child not found")

    progress = load_progress(child_id)
    result: dict = {"child": child, "domains": {}}

    for domain in DOMAINS:
        state = get_domain_state(progress, domain)
        total = state.get("total_questions", 0)
        correct = state.get("correct", 0)
        result["domains"][domain] = {
            "difficulty": state["difficulty"],
            "difficulty_desc": difficulty_label(state["difficulty"], child["year_level"]),
            "total_questions": total,
            "correct": correct,
            "accuracy": round(correct / total * 100) if total > 0 else 0,
            "recent_results": state.get("recent_results", [])[-5:],
        }
    return result


@app.get("/api/history/{child_id}")
async def get_history(child_id: str):
    children = load_children()
    child = next((c for c in children["children"] if c["id"] == child_id), None)
    if not child:
        raise HTTPException(404, "Child not found")

    progress = load_progress(child_id)
    history: dict = {}

    for domain in DOMAINS:
        state = progress.get("domains", {}).get(domain)
        sessions = state.get("sessions", []) if state else []
        if not sessions:
            continue

        # Per-topic accuracy, built from the actual answer log rather than just a
        # flat "topics covered" list, so it can show correct/total per topic.
        topic_stats: dict = {}
        for s in sessions:
            topic = s.get("topic") or "general"
            ts = topic_stats.setdefault(topic, {"correct": 0, "total": 0})
            ts["total"] += 1
            if s.get("is_correct"):
                ts["correct"] += 1

        topics = [
            {
                "topic": t,
                "correct": v["correct"],
                "total": v["total"],
                "accuracy": round(v["correct"] / v["total"] * 100),
            }
            for t, v in topic_stats.items()
        ]
        topics.sort(key=lambda x: (x["accuracy"], -x["total"]))

        # Only flag as a genuine "needs practice" area with at least 2 attempts,
        # so one unlucky first try doesn't get singled out as a weak spot.
        improvement_areas = [t for t in topics if t["total"] >= 2 and t["accuracy"] < 70][:5]

        total = state.get("total_questions", 0)
        correct = state.get("correct", 0)

        history[domain] = {
            "total_questions": total,
            "correct": correct,
            "accuracy": round(correct / total * 100) if total > 0 else 0,
            "topics": topics,
            "improvement_areas": improvement_areas,
            "recent_sessions": list(reversed(sessions))[:15],
        }

    return {"child": child, "history": history}


@app.post("/api/question")
async def generate_question(req: QuestionRequest):
    children = load_children()
    child = next((c for c in children["children"] if c["id"] == req.child_id), None)
    if not child:
        raise HTTPException(404, "Child not found")

    progress = load_progress(req.child_id)
    state = get_domain_state(progress, req.domain)
    difficulty = state["difficulty"]
    year_level = child["year_level"]
    diff_desc = difficulty_label(difficulty, year_level)
    topics_covered = state.get("topics_covered", [])[-10:]
    recent_questions = state.get("recent_questions", [])[-12:]
    domain_display = req.domain.replace("_", " ").title()
    focus_note = (child.get("focus_note") or "").strip()

    recent_block = ""
    if recent_questions:
        numbered = "\n".join(f"- {q}" for q in recent_questions)
        recent_block = (
            "\n\nDo NOT repeat, closely rephrase, or reuse the same scenario/numbers/words as "
            "any of these recently used questions for this child — it must be genuinely "
            f"different:\n{numbered}\n"
        )

    focus_block = f"\nParent's focus note for this child: {focus_note}\n" if focus_note else ""

    prompt = f"""You are an Australian school tutor (primary or secondary, matched precisely to the \
student's year level below) creating a practice question broadly aligned with NAPLAN literacy and \
numeracy skill areas. Note: real NAPLAN only tests Years 3, 5, 7, and 9 — for other years, this is \
general matched-level practice rather than a specific NAPLAN test, so pitch it at what a student in \
that year would genuinely be working on in class.

Student: Age {child['age']}, Year {year_level}
Domain: {domain_display}
Difficulty: {diff_desc} (scale 1.0–5.0, current: {difficulty:.1f})
{focus_block}Recently covered topics (vary from these): {', '.join(topics_covered) if topics_covered else 'none yet'}
{recent_block}
Task: {DOMAIN_INSTRUCTIONS[req.domain]}

Return ONLY valid JSON — no other text, no markdown fences. Use this exact schema:

For multiple_choice:
{{
  "type": "multiple_choice",
  "passage": null,
  "question": "question text",
  "options": {{"A": "...", "B": "...", "C": "...", "D": "..."}},
  "correct_answer": "A",
  "explanation": "why this answer is correct (1-2 sentences, child-friendly)",
  "topic": "one-word topic e.g. fractions"
}}

For reading (set passage to the text, then ask question about it):
{{
  "type": "multiple_choice",
  "passage": "passage text here",
  "question": "question about the passage",
  "options": {{"A": "...", "B": "...", "C": "...", "D": "..."}},
  "correct_answer": "B",
  "explanation": "explanation",
  "topic": "comprehension"
}}

For writing:
{{
  "type": "writing",
  "passage": null,
  "question": "writing prompt",
  "options": null,
  "correct_answer": null,
  "explanation": "key elements of a good response",
  "topic": "narrative writing"
}}

For phonemics read-aloud tasks (used only for the phonemics domain):
{{
  "type": "read_aloud",
  "passage": null,
  "question": "the word, letters, or short instruction for the child to read or say aloud (do not include the answer here)",
  "options": null,
  "correct_answer": null,
  "explanation": "the correct answer / pronunciation breakdown for the parent to check against, e.g. \\"s-u-n blends to make 'sun'\\"",
  "topic": "one-word topic e.g. blending"
}}

Make questions engaging and use Australian context (animals, currency, places) naturally."""

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    question_data = parse_claude_json(message.content[0].text)

    # Track topic to avoid repetition
    topic = question_data.get("topic", "")
    if topic:
        covered = state.get("topics_covered", [])
        if topic not in covered:
            covered.append(topic)
        state["topics_covered"] = covered[-20:]

    # Track the actual question text (not just its topic) so future prompts can
    # explicitly avoid repeating it — this is what actually stops verbatim/near repeats.
    q_text = question_data.get("question", "") or ""
    passage = question_data.get("passage") or ""
    if passage:
        q_text = f"{passage[:80]}... {q_text}"
    if q_text:
        recent_qs = state.get("recent_questions", [])
        recent_qs.append(q_text)
        state["recent_questions"] = recent_qs[-15:]

    save_progress(req.child_id, progress)

    return {
        "question": question_data,
        "difficulty": difficulty,
        "difficulty_desc": diff_desc,
    }


@app.get("/api/funbreak/{child_id}")
async def get_fun_break(child_id: str):
    children = load_children()
    child = next((c for c in children["children"] if c["id"] == child_id), None)
    if not child:
        raise HTTPException(404, "Child not found")

    kind = random.choice(FUN_BREAK_KINDS)
    age = child["age"]

    if kind == "did_you_know":
        instruction = (
            f"Generate one surprising 'did you know' fact suitable for someone aged {age}. "
            "Draw from animals, space, history, science, or geography. Keep it to 1-2 short, "
            "accurate sentences that would genuinely interest someone this age — for a younger "
            "child keep it simple and fun, for a teenager it can be more substantial."
        )
    elif kind == "dad_joke":
        instruction = (
            f"Generate one clean, groan-worthy dad joke suitable for someone aged {age}. "
            "Keep it short — a single question/answer or setup/punchline, one or two "
            "sentences at most."
        )
    else:  # riddle
        instruction = (
            f"Generate one fun riddle suitable for someone aged {age}, with a clear, short "
            "(single word or short phrase) answer. Not too easy, not too hard for this age."
        )

    prompt = f"""{instruction}

Return ONLY valid JSON — no other text, no markdown fences. Use this exact schema:
{{
  "kind": "{kind}",
  "content": "the fact / joke / riddle text",
  "answer": "the riddle's answer as a short phrase (ONLY for riddle, otherwise null)"
}}"""

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )
    return parse_claude_json(message.content[0].text)


@app.post("/api/answer")
async def submit_answer(req: AnswerRequest):
    children = load_children()
    child = next((c for c in children["children"] if c["id"] == req.child_id), None)
    if not child:
        raise HTTPException(404, "Child not found")

    progress = load_progress(req.child_id)
    state = get_domain_state(progress, req.domain)
    question_data = req.question_data
    answer = req.answer.strip()

    if question_data.get("type") == "multiple_choice":
        correct = question_data.get("correct_answer", "").strip().upper()
        is_correct = answer.upper() == correct
        feedback = {
            "is_correct": is_correct,
            "correct_answer": correct,
            "explanation": question_data.get("explanation", ""),
            "feedback": None,
            "encouragement": "Fantastic! Keep going! 🌟" if is_correct else "Good try! You'll get the next one! 💪",
            "score": 1 if is_correct else 0,
            "max_score": 1,
        }
    elif question_data.get("type") == "read_aloud":
        # Parent listens and marks this directly — no AI grading call needed,
        # since the app can't hear the child read the word aloud.
        is_correct = answer.strip().lower() == "correct"
        feedback = {
            "is_correct": is_correct,
            "correct_answer": question_data.get("explanation", ""),
            "explanation": question_data.get("explanation", ""),
            "feedback": None,
            "encouragement": "Fantastic reading! 🌟" if is_correct else "Good try! Practice makes perfect! 💪",
            "score": 1 if is_correct else 0,
            "max_score": 1,
        }
    else:
        # Writing — Claude grades it
        year_level = child["year_level"]
        grading_prompt = f"""You are a warm, encouraging Australian school teacher (primary or secondary, \
matched to the student's year level) marking a Year {year_level} student's writing (age {child['age']}).

Writing prompt: {question_data['question']}
Marking guide: {question_data.get('explanation', 'Clear structure, ideas, and language')}

Student response:
{answer}

Return ONLY valid JSON:
{{
  "score": <0-5>,
  "max_score": 5,
  "is_correct": <true if score >= 3>,
  "feedback": "2-3 sentences of warm encouraging feedback written directly to the child (use 'you')",
  "correct_answer": "brief model answer or key elements that score well",
  "explanation": "one thing done well + one specific improvement tip",
  "encouragement": "short uplifting phrase"
}}"""

        msg = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=512,
            messages=[{"role": "user", "content": grading_prompt}],
        )
        feedback = parse_claude_json(msg.content[0].text)
        is_correct = feedback.get("is_correct", False)

    # Update stats
    state["total_questions"] = state.get("total_questions", 0) + 1
    if is_correct:
        state["correct"] = state.get("correct", 0) + 1

    old_difficulty = state["difficulty"]
    update_difficulty(state, is_correct)
    new_difficulty = state["difficulty"]

    state.setdefault("sessions", []).append({
        "timestamp": datetime.now().isoformat(),
        "domain": req.domain,
        "topic": question_data.get("topic", ""),
        "is_correct": is_correct,
        "difficulty": old_difficulty,
    })
    state["sessions"] = state["sessions"][-200:]

    save_progress(req.child_id, progress)

    diff_changed = None
    if new_difficulty > old_difficulty + 0.05:
        diff_changed = "up"
    elif new_difficulty < old_difficulty - 0.05:
        diff_changed = "down"

    return {
        "feedback": feedback,
        "difficulty_changed": diff_changed,
        "new_difficulty": new_difficulty,
        "new_difficulty_desc": difficulty_label(new_difficulty, child["year_level"]),
    }


@app.post("/api/difficulty/{child_id}/{domain}")
async def adjust_difficulty(child_id: str, domain: str, req: AdjustDifficultyRequest):
    children = load_children()
    child = next((c for c in children["children"] if c["id"] == child_id), None)
    if not child:
        raise HTTPException(404, "Child not found")

    if domain not in DOMAINS:
        raise HTTPException(400, "Invalid domain")

    progress = load_progress(child_id)
    state = get_domain_state(progress, domain)

    current = state["difficulty"]
    state["difficulty"] = round(max(1.0, min(5.0, current + req.delta)), 2)

    save_progress(child_id, progress)
    return {"difficulty": state["difficulty"]}


# ── Finance Training routes ──────────────────────────────────────────────

@app.get("/api/finance/learners")
async def get_learners():
    return load_learners()


@app.post("/api/finance/learners")
async def add_learner(learner: Learner):
    data = load_learners()

    active_domains = [d for d in (learner.active_domains or [FINANCE_CORE_DOMAIN]) if d in FINANCE_DOMAINS]
    if not active_domains:
        active_domains = [FINANCE_CORE_DOMAIN]

    new_learner = {
        "id": str(uuid.uuid4()),
        "name": learner.name,
        "avatar": learner.avatar or "💼",
        "active_domains": active_domains,
        "focus_note": (learner.focus_note or "").strip(),
        "created_at": datetime.now().isoformat(),
    }
    data["learners"].append(new_learner)
    save_learners(data)

    if learner.starting_levels:
        progress = load_learner_progress(new_learner["id"])
        level_map = {"beginner": 1.3, "practitioner": 2.0, "advanced": 3.0}
        for domain, level_key in learner.starting_levels.items():
            if domain in active_domains:
                state = get_finance_domain_state(progress, domain)
                state["difficulty"] = level_map.get(level_key, 2.0)
        save_learner_progress(new_learner["id"], progress)

    return new_learner


@app.put("/api/finance/learners/{learner_id}")
async def update_learner(learner_id: str, req: UpdateLearnerRequest):
    data = load_learners()
    learner = next((l for l in data["learners"] if l["id"] == learner_id), None)
    if not learner:
        raise HTTPException(404, "Learner not found")

    if req.name is not None and req.name.strip():
        learner["name"] = req.name.strip()
    if req.avatar is not None:
        learner["avatar"] = req.avatar

    save_learners(data)
    return learner


@app.put("/api/finance/learners/{learner_id}/focus")
async def update_learner_focus(learner_id: str, req: UpdateLearnerFocusRequest):
    data = load_learners()
    learner = next((l for l in data["learners"] if l["id"] == learner_id), None)
    if not learner:
        raise HTTPException(404, "Learner not found")

    valid_domains = [d for d in req.active_domains if d in FINANCE_DOMAINS]
    if not valid_domains:
        raise HTTPException(400, "At least one focus area is required")

    learner["active_domains"] = valid_domains
    if req.focus_note is not None:
        learner["focus_note"] = req.focus_note.strip()
    save_learners(data)

    if req.starting_levels:
        progress = load_learner_progress(learner_id)
        level_map = {"beginner": 1.3, "practitioner": 2.0, "advanced": 3.0}
        for domain, level_key in req.starting_levels.items():
            if domain not in FINANCE_DOMAINS:
                continue
            state = get_finance_domain_state(progress, domain)
            # Only seed difficulty for a domain not yet practiced — never overwrite
            # a difficulty that's already adapted to real answers.
            if state.get("total_questions", 0) == 0:
                state["difficulty"] = level_map.get(level_key, 2.0)
        save_learner_progress(learner_id, progress)

    return learner


@app.delete("/api/finance/learners/{learner_id}")
async def delete_learner(learner_id: str):
    data = load_learners()
    data["learners"] = [l for l in data["learners"] if l["id"] != learner_id]
    save_learners(data)
    return {"ok": True}


@app.get("/api/finance/progress/{learner_id}")
async def get_learner_progress(learner_id: str):
    learners = load_learners()
    learner = next((l for l in learners["learners"] if l["id"] == learner_id), None)
    if not learner:
        raise HTTPException(404, "Learner not found")

    progress = load_learner_progress(learner_id)
    result: dict = {"learner": learner, "domains": {}}

    for domain in FINANCE_DOMAINS:
        state = get_finance_domain_state(progress, domain)
        total = state.get("total_questions", 0)
        correct = state.get("correct", 0)
        result["domains"][domain] = {
            "difficulty": state["difficulty"],
            "difficulty_desc": finance_difficulty_label(state["difficulty"]),
            "total_questions": total,
            "correct": correct,
            "accuracy": round(correct / total * 100) if total > 0 else 0,
            "recent_results": state.get("recent_results", [])[-5:],
        }
    return result


@app.get("/api/finance/history/{learner_id}")
async def get_learner_history(learner_id: str):
    learners = load_learners()
    learner = next((l for l in learners["learners"] if l["id"] == learner_id), None)
    if not learner:
        raise HTTPException(404, "Learner not found")

    progress = load_learner_progress(learner_id)
    history: dict = {}

    for domain in FINANCE_DOMAINS:
        state = progress.get("domains", {}).get(domain)
        sessions = state.get("sessions", []) if state else []
        if not sessions:
            continue

        topic_stats: dict = {}
        for s in sessions:
            topic = s.get("topic") or "general"
            ts = topic_stats.setdefault(topic, {"correct": 0, "total": 0})
            ts["total"] += 1
            if s.get("is_correct"):
                ts["correct"] += 1

        topics = [
            {
                "topic": t,
                "correct": v["correct"],
                "total": v["total"],
                "accuracy": round(v["correct"] / v["total"] * 100),
            }
            for t, v in topic_stats.items()
        ]
        topics.sort(key=lambda x: (x["accuracy"], -x["total"]))
        improvement_areas = [t for t in topics if t["total"] >= 2 and t["accuracy"] < 70][:5]

        total = state.get("total_questions", 0)
        correct = state.get("correct", 0)

        history[domain] = {
            "total_questions": total,
            "correct": correct,
            "accuracy": round(correct / total * 100) if total > 0 else 0,
            "topics": topics,
            "improvement_areas": improvement_areas,
            "recent_sessions": list(reversed(sessions))[:15],
        }

    return {"learner": learner, "history": history}


@app.post("/api/finance/question")
async def generate_learner_question(req: LearnerQuestionRequest):
    learners = load_learners()
    learner = next((l for l in learners["learners"] if l["id"] == req.learner_id), None)
    if not learner:
        raise HTTPException(404, "Learner not found")

    progress = load_learner_progress(req.learner_id)
    state = get_finance_domain_state(progress, req.domain)
    difficulty = state["difficulty"]
    diff_desc = finance_difficulty_label(difficulty)
    topics_covered = state.get("topics_covered", [])[-10:]
    recent_questions = state.get("recent_questions", [])[-12:]
    domain_display = req.domain.replace("_", " ").title()
    focus_note = (learner.get("focus_note") or "").strip()

    recent_block = ""
    if recent_questions:
        numbered = "\n".join(f"- {q}" for q in recent_questions)
        recent_block = (
            "\n\nDo NOT repeat, closely rephrase, or reuse the same scenario/numbers as any of "
            f"these recently used questions for this learner — it must be genuinely different:\n{numbered}\n"
        )

    focus_block = f"\nLearner's focus note: {focus_note}\n" if focus_note else ""

    prompt = f"""You are an experienced finance educator creating a practice question for a working \
professional building core corporate finance and business management skills — similar in spirit to \
an introductory MBA or professional finance certification curriculum.

Domain: {domain_display}
Difficulty: {diff_desc} (scale 1.0–5.0, current: {difficulty:.1f})
{focus_block}Recently covered topics (vary from these): {', '.join(topics_covered) if topics_covered else 'none yet'}
{recent_block}
Task: {FINANCE_DOMAIN_INSTRUCTIONS[req.domain]}

Return ONLY valid JSON — no other text, no markdown fences. Use this exact schema:
{{
  "type": "multiple_choice",
  "passage": null (or a short scenario/case-study paragraph if it adds useful context, otherwise null),
  "question": "question text",
  "options": {{"A": "...", "B": "...", "C": "...", "D": "..."}},
  "correct_answer": "A",
  "explanation": "why this answer is correct, and briefly why the main distractor is wrong (2-3 sentences)",
  "topic": "one-word or short topic tag, e.g. wacc, npv, hedging, dcf"
}}

Make it practical and grounded in realistic business scenarios — plausible company names, figures, \
and situations a working professional would actually encounter — not abstract textbook toy examples."""

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    question_data = parse_claude_json(message.content[0].text)

    topic = question_data.get("topic", "")
    if topic:
        covered = state.get("topics_covered", [])
        if topic not in covered:
            covered.append(topic)
        state["topics_covered"] = covered[-20:]

    q_text = question_data.get("question", "") or ""
    passage = question_data.get("passage") or ""
    if passage:
        q_text = f"{passage[:80]}... {q_text}"
    if q_text:
        recent_qs = state.get("recent_questions", [])
        recent_qs.append(q_text)
        state["recent_questions"] = recent_qs[-15:]

    save_learner_progress(req.learner_id, progress)

    return {
        "question": question_data,
        "difficulty": difficulty,
        "difficulty_desc": diff_desc,
    }


@app.post("/api/finance/answer")
async def submit_learner_answer(req: LearnerAnswerRequest):
    learners = load_learners()
    learner = next((l for l in learners["learners"] if l["id"] == req.learner_id), None)
    if not learner:
        raise HTTPException(404, "Learner not found")

    progress = load_learner_progress(req.learner_id)
    state = get_finance_domain_state(progress, req.domain)
    question_data = req.question_data
    answer = req.answer.strip()

    correct = question_data.get("correct_answer", "").strip().upper()
    is_correct = answer.upper() == correct
    feedback = {
        "is_correct": is_correct,
        "correct_answer": correct,
        "explanation": question_data.get("explanation", ""),
        "feedback": None,
        "encouragement": "Nice work — solid grasp of that one." if is_correct else "Not quite — worth a re-read of the explanation.",
        "score": 1 if is_correct else 0,
        "max_score": 1,
    }

    state["total_questions"] = state.get("total_questions", 0) + 1
    if is_correct:
        state["correct"] = state.get("correct", 0) + 1

    old_difficulty = state["difficulty"]
    update_difficulty(state, is_correct)
    new_difficulty = state["difficulty"]

    state.setdefault("sessions", []).append({
        "timestamp": datetime.now().isoformat(),
        "domain": req.domain,
        "topic": question_data.get("topic", ""),
        "is_correct": is_correct,
        "difficulty": old_difficulty,
    })
    state["sessions"] = state["sessions"][-200:]

    save_learner_progress(req.learner_id, progress)

    diff_changed = None
    if new_difficulty > old_difficulty + 0.05:
        diff_changed = "up"
    elif new_difficulty < old_difficulty - 0.05:
        diff_changed = "down"

    return {
        "feedback": feedback,
        "difficulty_changed": diff_changed,
        "new_difficulty": new_difficulty,
        "new_difficulty_desc": finance_difficulty_label(new_difficulty),
    }


@app.post("/api/finance/difficulty/{learner_id}/{domain}")
async def adjust_learner_difficulty(learner_id: str, domain: str, req: LearnerAdjustDifficultyRequest):
    learners = load_learners()
    learner = next((l for l in learners["learners"] if l["id"] == learner_id), None)
    if not learner:
        raise HTTPException(404, "Learner not found")

    if domain not in FINANCE_DOMAINS:
        raise HTTPException(400, "Invalid domain")

    progress = load_learner_progress(learner_id)
    state = get_finance_domain_state(progress, domain)

    current = state["difficulty"]
    state["difficulty"] = round(max(1.0, min(5.0, current + req.delta)), 2)

    save_learner_progress(learner_id, progress)
    return {"difficulty": state["difficulty"]}


app.mount("/static", StaticFiles(directory="static"), name="static")
