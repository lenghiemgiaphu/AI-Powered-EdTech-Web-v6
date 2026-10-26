(() => {
  "use strict";

  /* =====================================================================
   * Helpers
   * ===================================================================== */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const view = $("#view");

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Per-character fold keeps string length identical so match indexes map back to the original text.
  const fold = (s) =>
    String(s ?? "")
      .split("")
      .map((ch) => {
        if (ch === "đ" || ch === "Đ") return "d";
        const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return (base.length === 1 ? base : ch).toLowerCase();
      })
      .join("");

  const highlight = (text, query) => {
    const q = fold(query.trim());
    if (!q) return esc(text);
    const idx = fold(text).indexOf(q);
    if (idx === -1) return esc(text);
    return `${esc(text.slice(0, idx))}<mark>${esc(text.slice(idx, idx + q.length))}</mark>${esc(text.slice(idx + q.length))}`;
  };

  const fmtScore = (n) => Number(n).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
  const fmtPercent = (n) => `${Math.round(n)}%`;
  const fmtDate = (ts) => new Date(ts).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
  const fmtDuration = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m ? `${m} phút ${s} giây` : `${s} giây`;
  };
  const fmtClock = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };
  const scoreTone = (score) => (score >= 8 ? "text-emerald-600" : score >= 5 ? "text-amber-600" : "text-rose-600");

  const bankById = new Map(questionBank.map((q) => [q.id, q]));
  const examById = new Map(mockExams.map((e) => [e.examId, e]));

  // AI-generated quizzes can cover any subject, so they fall back to a neutral style.
  const GENERAL_SUBJECT = {
    label: "Tổng hợp", icon: "fa-book-open", badge: "bg-violet-100 text-violet-700", soft: "bg-violet-50 text-violet-700 ring-violet-200",
    solid: "bg-violet-600 text-white", text: "text-violet-600", bar: "bg-violet-500",
  };
  const subjOf = (key) => SUBJECTS[key] || GENERAL_SUBJECT;
  const topicHref = (r) => (r.aiQuiz ? `#/ai-quiz/${r.aiQuiz}?topic=${encodeURIComponent(r.topic)}` : practiceHref(r.subject, r.grade, r.topic));

  const topicIndex = (() => {
    const idx = {};
    for (const q of questionBank) {
      idx[q.subject] ??= {};
      idx[q.subject][q.grade] ??= {};
      (idx[q.subject][q.grade][q.topic] ??= []).push(q);
    }
    return idx;
  })();
  const topicCount = Object.values(topicIndex).reduce(
    (sum, grades) => sum + Object.values(grades).reduce((s, topics) => s + Object.keys(topics).length, 0),
    0
  );

  const practiceHref = (subject, grade, topic, cfg) => {
    const base = `#/practice/${subject}/${grade}/${encodeURIComponent(topic)}`;
    const params = new URLSearchParams();
    if (cfg?.types?.length) params.set("types", cfg.types.join(","));
    if (cfg?.levels?.length) params.set("levels", cfg.levels.join(","));
    const query = params.toString();
    return query ? `${base}?${query}` : base;
  };

  const diffBadge = (q) => {
    const d = DIFFICULTY[q.difficulty];
    return d
      ? `<span class="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-bold ${d.badge}"><span class="h-1.5 w-1.5 rounded-full ${d.dot}" aria-hidden="true"></span>${d.label}</span>`
      : "";
  };

  const orderQuestions = (ids) =>
    ids
      .map((id) => bankById.get(id))
      .filter(Boolean)
      .map((q, i) => ({ q, i }))
      .sort((a, b) => QUESTION_TYPES[a.q.type].order - QUESTION_TYPES[b.q.type].order || a.i - b.i)
      .map((x) => x.q);

  /* =====================================================================
   * History storage (per account, kept in this browser)
   * ===================================================================== */
  const Store = {
    key: () => `labluyen_history_${Auth.user ? Auth.user.uid : "guest"}`,
    list() {
      try {
        return JSON.parse(localStorage.getItem(this.key()) || "[]");
      } catch {
        return [];
      }
    },
    add(attempt) {
      localStorage.setItem(this.key(), JSON.stringify([attempt, ...this.list()].slice(0, 200)));
    },
    get(id) {
      return this.list().find((a) => a.id === id);
    },
    clear() {
      localStorage.removeItem(this.key());
    },
  };

  /* =====================================================================
   * Grading
   * ===================================================================== */
  const normalizeShort = (s) =>
    fold(String(s ?? ""))
      .replace(/\s+/g, "")
      .replace(/,/g, ".")
      .replace(/[()₀-₉]/g, (c) => (/[₀-₉]/.test(c) ? String(c.charCodeAt(0) - 0x2080) : ""));

  function matchShortAnswer(q, answer) {
    const given = normalizeShort(answer);
    if (!given) return false;
    return [q.correctAnswer, ...(q.acceptedAnswers || [])].some((candidate) => {
      const target = normalizeShort(candidate);
      if (target === given) return true;
      const a = Number(given);
      const b = Number(target);
      return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;
    });
  }

  function gradeQuestion(q, answer) {
    if (q.type === "multiple_choice") {
      const ok = answer === q.correctAnswer;
      return { fraction: ok ? 1 : 0, answered: !!answer };
    }
    if (q.type === "true_false") {
      const given = answer || {};
      const n = q.statements.length;
      let c = 0;
      let answered = 0;
      q.statements.forEach((s, i) => {
        if (typeof given[i] === "boolean") {
          answered++;
          if (given[i] === s.isTrue) c++;
        }
      });
      // Official-style partial credit when a question has four statements.
      const fraction = n === 4 ? [0, 0.1, 0.25, 0.5, 1][c] : n === 1 ? (c === 1 ? 1 : 0) : c / n;
      return { fraction, answered: answered > 0, c, n };
    }
    if (q.type === "drag_drop") {
      const given = answer || {};
      const n = q.slots.length;
      let c = 0;
      let answered = 0;
      q.slots.forEach((_, i) => {
        if (given[i]) {
          answered++;
          if (given[i] === `c${i}`) c++;
        }
      });
      return { fraction: c / n, answered: answered > 0, c, n };
    }
    const answered = String(answer ?? "").trim().length > 0;
    return { fraction: answered && matchShortAnswer(q, answer) ? 1 : 0, answered };
  }

  function isAnswered(q, answer) {
    if (q.type === "multiple_choice") return !!answer;
    if (q.type === "true_false" || q.type === "drag_drop") return !!answer && Object.keys(answer).length > 0;
    return String(answer ?? "").trim().length > 0;
  }

  function isFullyAnswered(q, answer) {
    if (q.type === "true_false") return !!answer && q.statements.every((_, i) => typeof answer[i] === "boolean");
    if (q.type === "drag_drop") return !!answer && q.slots.every((_, i) => !!answer[i]);
    return isAnswered(q, answer);
  }

  function answerText(q, a) {
    if (q.type === "drag_drop")
      return q.slots
        .map((s, i) => `${i + 1}) ${s.prompt} → ${(a || {})[i] ? ddItemById(q, a[i]).text : "chưa chọn"}`)
        .join("; ");
    if (q.type === "multiple_choice") return a ? `${a}. ${q.options[a]}` : "Chưa trả lời";
    if (q.type === "true_false")
      return q.statements
        .map((s, i) => `${"abcdefgh"[i]}) ${s.text} → ${typeof (a || {})[i] === "boolean" ? (a[i] ? "Đúng" : "Sai") : "chưa chọn"}`)
        .join("; ");
    return String(a ?? "").trim() || "Chưa trả lời";
  }

  function correctText(q) {
    if (q.type === "drag_drop") return q.slots.map((s, i) => `${i + 1}) ${s.prompt} → ${s.answer}`).join("; ");
    if (q.type === "multiple_choice") return `${q.correctAnswer}. ${q.options[q.correctAnswer]}`;
    if (q.type === "true_false")
      return q.statements.map((s, i) => `${"abcdefgh"[i]}) ${s.isTrue ? "Đúng" : "Sai"}`).join("; ");
    return q.correctAnswer;
  }

  function buildAttempt({ type, title, examId, practice, list, answers, durationSec, spentSec, times }) {
    let sum = 0;
    let correct = 0;
    list.forEach((q) => {
      const g = gradeQuestion(q, answers[q.id]);
      sum += g.fraction;
      if (g.fraction === 1) correct++;
    });
    const total = list.length;
    return {
      id: `att_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      type, title, examId, practice,
      createdAt: Date.now(),
      durationSec, spentSec,
      times: times || {},
      questionIds: list.map((q) => q.id),
      answers: JSON.parse(JSON.stringify(answers)),
      total, correct,
      score: total ? (sum / total) * 10 : 0,
      accuracy: total ? (sum / total) * 100 : 0,
    };
  }

  /* =====================================================================
   * Shared state
   * ===================================================================== */
  let ctx = { mode: "none", answers: {}, checked: {}, list: [] };
  let session = (() => {
    try {
      return JSON.parse(sessionStorage.getItem("labluyen_session") || "null");
    } catch {
      return null;
    }
  })();
  let timerId = null;
  let ddSel = null; // { qid, chip } currently selected drag & drop chip (tap-to-place)
  let ddDrag = null; // { qid, chip } chip being dragged
  let examFilter = { kind: "all", subject: "all" };

  const saveSession = () => session && sessionStorage.setItem("labluyen_session", JSON.stringify(session));
  const clearSession = () => {
    session = null;
    sessionStorage.removeItem("labluyen_session");
  };

  /* =====================================================================
   * Modal + toast
   * ===================================================================== */
  const modalRoot = $("#modal-root");
  let lastFocus = null;

  function openModal(html, { size = "md" } = {}) {
    closeModal();
    lastFocus = document.activeElement;
    modalRoot.innerHTML = `<div class="modal-backdrop" data-modal-backdrop><div class="modal-panel ${size}" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1">${html}</div></div>`;
    document.body.classList.add("overflow-hidden");
    const panel = $(".modal-panel", modalRoot);
    (panel.querySelector("[autofocus]") || panel).focus();
  }

  function closeModal() {
    if (!modalRoot.firstChild) return;
    modalRoot.innerHTML = "";
    document.body.classList.remove("overflow-hidden");
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }

  function toast(message, type = "info") {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.innerHTML = `<i class="fa-solid ${type === "error" ? "fa-circle-exclamation" : type === "success" ? "fa-circle-check" : "fa-circle-info"}" aria-hidden="true"></i><span>${esc(message)}</span>`;
    $("#toast-root").appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  const modalHeader = (title, subtitle = "") => `
    <div class="flex items-start justify-between gap-4">
      <div>
        <h2 id="modal-title" class="text-xl font-extrabold tracking-tight text-slate-900">${title}</h2>
        ${subtitle ? `<p class="mt-1 text-sm text-slate-500">${subtitle}</p>` : ""}
      </div>
      <button type="button" data-action="close-modal" class="-mr-2 -mt-2 flex h-9 w-9 flex-none items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Đóng">
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>
    </div>`;

  /* =====================================================================
   * Question rendering
   * ===================================================================== */
  const SECTION_INFO = {
    multiple_choice: ["PHẦN I", "Câu trắc nghiệm nhiều phương án lựa chọn. Mỗi câu chỉ chọn một phương án."],
    true_false: ["PHẦN II", "Câu trắc nghiệm đúng sai. Trong mỗi ý a), b), c), d) của mỗi câu, chọn Đúng hoặc Sai."],
    short_answer: ["PHẦN III", "Câu trắc nghiệm trả lời ngắn. Chỉ nhập đáp án cuối cùng."],
    drag_drop: ["PHẦN IV", "Câu hỏi kéo thả. Kéo (hoặc chạm) mỗi đáp án vào ô tương ứng. Kho đáp án có cả đáp án nhiễu."],
  };

  function mcBody(q, a, locked) {
    const options = ["A", "B", "C", "D"]
      .map((k) => {
        let cls = locked ? "is-locked" : "";
        let mark = "";
        if (locked && k === q.correctAnswer) {
          cls += " is-correct";
          mark = '<i class="fa-solid fa-circle-check ml-auto pt-1 text-emerald-600" aria-label="Đáp án đúng"></i>';
        } else if (locked && k === a) {
          cls += " is-wrong";
          mark = '<i class="fa-solid fa-circle-xmark ml-auto pt-1 text-rose-500" aria-label="Bạn đã chọn"></i>';
        }
        return `<label class="opt ${cls}">
          <input class="sr-only" type="radio" name="q_${q.id}" value="${k}" data-q="${q.id}" ${a === k ? "checked" : ""} ${locked ? "disabled" : ""}>
          <span class="opt-key">${k}</span><span class="min-w-0 flex-1">${esc(q.options[k])}</span>${mark}
        </label>`;
      })
      .join("");
    return `<div class="mt-4 grid gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label="Các phương án trả lời">${options}</div>`;
  }

  function tfBody(q, a, locked) {
    const given = a || {};
    const rows = q.statements
      .map((s, i) => {
        const v = given[i];
        const letter = "abcdefgh"[i];
        const rowCls = locked && typeof v === "boolean" ? (v === s.isTrue ? "is-correct" : "is-wrong") : "";
        const keyT = locked && s.isTrue ? "is-key" : "";
        const keyF = locked && !s.isTrue ? "is-key" : "";
        return `<div class="tf-row ${rowCls}">
          <span class="w-5 font-bold text-slate-500">${letter})</span>
          <p class="min-w-0 flex-1 text-[.95rem] leading-relaxed">${esc(s.text)}</p>
          <div class="seg ${locked ? "is-locked" : ""}" role="radiogroup" aria-label="Đánh giá ý ${letter}">
            <label><input class="sr-only" type="radio" name="q_${q.id}_${i}" value="true" data-q="${q.id}" data-i="${i}" ${v === true ? "checked" : ""} ${locked ? "disabled" : ""}><span class="t ${keyT}">Đúng</span></label>
            <label><input class="sr-only" type="radio" name="q_${q.id}_${i}" value="false" data-q="${q.id}" data-i="${i}" ${v === false ? "checked" : ""} ${locked ? "disabled" : ""}><span class="f ${keyF}">Sai</span></label>
          </div>
        </div>`;
      })
      .join("");
    return `<div class="tf-table mt-4">${rows}</div>`;
  }

  function saBody(q, a, locked, g) {
    const cls = locked && g.answered ? (g.fraction === 1 ? "is-correct" : "is-wrong") : "";
    return `<div class="sa-wrap mt-4">
      <label class="mb-1.5 block text-sm font-semibold text-slate-600" for="sa_${q.id}">Đáp án của bạn</label>
      <input id="sa_${q.id}" type="text" autocomplete="off" spellcheck="false" class="field sa-input ${cls}" data-q="${q.id}" value="${esc(a ?? "")}" placeholder="Chỉ nhập đáp án cuối cùng" ${locked ? "disabled" : ""}>
    </div>`;
  }

  const ddCache = new Map();

  // Chips are shuffled with a seed derived from the question id so re-renders keep the same order.
  function ddItems(q) {
    if (ddCache.has(q.id)) return ddCache.get(q.id);
    const items = [
      ...q.slots.map((s, i) => ({ id: `c${i}`, text: s.answer })),
      ...q.distractors.map((text, i) => ({ id: `d${i}`, text })),
    ];
    let seed = [...q.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const rnd = () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    ddCache.set(q.id, items);
    return items;
  }

  const ddItemById = (q, id) => ddItems(q).find((it) => it.id === id);

  function ddBody(q, a, locked) {
    const given = a || {};
    const items = ddItems(q);
    const placed = new Set(Object.values(given));
    const sel = !locked && ddSel && ddSel.qid === q.id ? ddSel.chip : null;

    const chip = (it) =>
      locked
        ? `<span class="dd-chip is-static">${esc(it.text)}</span>`
        : `<div class="dd-chip ${sel === it.id ? "is-selected" : ""}" role="button" tabindex="0" draggable="true" aria-pressed="${sel === it.id}" data-action="dd-chip" data-q="${q.id}" data-chip="${it.id}"><i class="fa-solid fa-grip-vertical dd-grip" aria-hidden="true"></i><span>${esc(it.text)}</span></div>`;

    const rows = q.slots
      .map((slot, i) => {
        const it = given[i] ? ddItemById(q, given[i]) : null;
        const ok = locked && it ? given[i] === `c${i}` : null;
        const state = locked ? (!it ? "is-blank" : ok ? "is-correct" : "is-wrong") : "";
        const zone = locked ? "" : `data-action="dd-slot" data-q="${q.id}" data-slot="${i}" tabindex="0"`;
        const inner = it
          ? `${chip(it)}${locked ? "" : `<button type="button" class="dd-x" data-action="dd-remove" data-q="${q.id}" data-chip="${it.id}" aria-label="Gỡ đáp án khỏi ô ${i + 1}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>`}`
          : `<span class="dd-placeholder">${locked ? "Chưa trả lời" : sel ? "Chạm để đặt vào đây" : "Kéo đáp án vào đây"}</span>`;
        const reveal = locked && !ok
          ? `<p class="mt-1.5 text-sm text-slate-600">Đáp án đúng: <strong class="text-emerald-700">${esc(slot.answer)}</strong></p>`
          : "";
        return `<div class="dd-row ${state}">
          <span class="dd-index">${i + 1}</span>
          <div class="min-w-0 flex-1 sm:grid sm:grid-cols-2 sm:items-start sm:gap-4">
            <p class="dd-prompt">${esc(slot.prompt)}</p>
            <div><div class="dd-slot ${it ? "is-filled" : ""} ${sel && !it ? "is-target" : ""}" role="group" aria-label="Ô trả lời ${i + 1}" ${zone}>${inner}</div>${reveal}</div>
          </div>
        </div>`;
      })
      .join("");

    const rest = items.filter((it) => !placed.has(it.id));
    const bank = `<div class="dd-bank" ${locked ? "" : `data-action="dd-bank" data-q="${q.id}"`}>
      <p class="dd-bank-title">${locked ? "Đáp án còn lại (không dùng)" : `Kho đáp án · còn ${rest.length}/${items.length}`}</p>
      <div class="flex flex-wrap gap-2">${rest.map(chip).join("") || '<span class="text-sm text-slate-500">Đã dùng hết</span>'}</div>
    </div>`;

    const hint = locked
      ? ""
      : '<p class="flex gap-2 text-xs leading-relaxed text-slate-500"><i class="fa-solid fa-circle-info mt-0.5" aria-hidden="true"></i><span>Kéo thả đáp án vào ô tương ứng, hoặc chạm vào đáp án rồi chạm vào ô để đặt. Kho đáp án có cả đáp án nhiễu.</span></p>';
    return `<div class="mt-4 grid gap-3">${hint}<div class="dd-rows">${rows}</div>${bank}</div>`;
  }

  function reviewPanel(q, a, g) {
    const state = !g.answered ? "blank" : g.fraction === 1 ? "ok" : g.fraction > 0 ? "partial" : "bad";
    const meta = {
      ok: ["fa-circle-check text-emerald-600", "Chính xác"],
      partial: ["fa-circle-half-stroke text-amber-600", "Đúng một phần"],
      bad: ["fa-circle-xmark text-rose-600", "Chưa chính xác"],
      blank: ["fa-circle-minus text-slate-500", "Chưa trả lời"],
    }[state];

    let detail = "";
    if (q.type === "true_false" || q.type === "drag_drop") {
      detail = `<p class="text-sm text-slate-600">Đúng <strong>${g.c}/${g.n}</strong> ${q.type === "drag_drop" ? "ô" : "ý"} · <strong>${fmtScore(g.fraction)}</strong> điểm cho câu này</p>`;
    } else if (state !== "ok") {
      detail = `<p class="text-sm text-slate-600">Đáp án đúng: <strong class="text-slate-900">${esc(correctText(q))}</strong></p>`;
    }

    const retry =
      ctx.mode === "practice"
        ? `<button type="button" class="btn btn-secondary btn-sm" data-action="retry-question" data-q="${q.id}"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Làm lại câu này</button>`
        : "";

    return `<div class="explain-box ${state} mt-4" role="status">
      <p class="flex items-center gap-2 font-bold text-slate-900"><i class="fa-solid ${meta[0]}" aria-hidden="true"></i>${meta[1]}</p>
      ${detail ? `<div class="mt-1">${detail}</div>` : ""}
      <p class="mt-3 text-sm leading-relaxed text-slate-700"><strong class="text-slate-900">Giải thích:</strong> ${esc(q.explanation)}</p>
      <div class="mt-3 flex flex-wrap gap-2">
        <button type="button" class="btn btn-sm bg-indigo-600 text-white hover:bg-indigo-700" data-action="ask-ai" data-q="${q.id}">
          <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Hỏi AI lý do
        </button>
        ${retry}
      </div>
    </div>`;
  }

  function cardHtml(q, num) {
    const a = ctx.answers[q.id];
    const practicing = ctx.mode === "practice";
    const reviewing = ctx.mode === "review" || (practicing && ctx.checked[q.id]);
    const g = reviewing ? gradeQuestion(q, a) : null;
    const paper = ctx.mode === "exam";
    const subj = subjOf(q.subject);
    const tag = "rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600";
    const spent = ctx.mode === "review" && ctx.times?.[q.id] != null
      ? `<span class="${tag}"><i class="fa-solid fa-stopwatch mr-1" aria-hidden="true"></i>${fmtClock(ctx.times[q.id])}</span>`
      : "";

    const meta = paper
      ? `<span class="${tag}">${QUESTION_TYPES[q.type].label}</span>`
      : `<span class="rounded-md px-2 py-0.5 text-xs font-bold ${subj.badge}"><i class="fa-solid ${subj.icon} mr-1" aria-hidden="true"></i>${subj.label}</span>
         <span class="${tag}">Lớp ${q.grade}</span>
         <span class="${tag}">${esc(q.topic)}</span>
         <span class="${tag}">${QUESTION_TYPES[q.type].label}</span>
         ${diffBadge(q)}${spent}`;

    const body =
      q.type === "multiple_choice" ? mcBody(q, a, !!g)
        : q.type === "true_false" ? tfBody(q, a, !!g)
        : q.type === "drag_drop" ? ddBody(q, a, !!g)
        : saBody(q, a, !!g, g);

    const footer = reviewing ? reviewPanel(q, a, g) : "";
    const head = practicing ? "" : `<div class="flex flex-wrap items-center gap-2"><span class="q-num">Câu ${num}</span>${meta}</div>`;

    return `<article id="card-${q.id}" class="question-card ${paper || practicing ? "" : "card"}" data-qid="${q.id}">
      ${head}
      <p class="q-text ${practicing ? "" : "mt-3"}">${esc(q.questionText)}</p>
      ${body}${footer}
    </article>`;
  }

  function refreshCard(qid) {
    const q = bankById.get(qid);
    const el = $(`#card-${qid}`);
    if (!q || !el) return;
    el.outerHTML = cardHtml(q, ctx.list.indexOf(q) + 1);
  }

  function cardsHtml(list, { sections = true } = {}) {
    let html = "";
    let lastType = null;
    list.forEach((q) => {
      if (sections && q.type !== lastType) {
        if (lastType !== null) html += "</section>";
        const [title, desc] = SECTION_INFO[q.type];
        html += `<section class="paper-section"><h2 class="text-sm font-extrabold uppercase tracking-wide text-slate-900">${title}. <span class="font-semibold normal-case text-slate-600">${desc}</span></h2>`;
        lastType = q.type;
      }
      html += cardHtml(q, ctx.list.indexOf(q) + 1);
    });
    if (sections && lastType !== null) html += "</section>";
    return html;
  }

  /* =====================================================================
   * Auth UI
   * ===================================================================== */
  const GOOGLE_LOGO = `<svg viewBox="0 0 48 48" class="h-5 w-5" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

  const initials = (name) =>
    String(name || "?")
      .trim()
      .split(/\s+/)
      .slice(-2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();

  function renderAuthArea() {
    const area = $("#auth-area");
    const user = Auth.user;
    if (!user) {
      area.innerHTML = `<button type="button" data-action="open-auth" data-mode="login" class="btn btn-primary btn-sm"><i class="fa-regular fa-user" aria-hidden="true"></i> Đăng nhập</button>`;
      return;
    }
    const avatar = user.photoURL
      ? `<img src="${esc(user.photoURL)}" alt="" referrerpolicy="no-referrer" class="h-8 w-8 rounded-full object-cover">`
      : `<span class="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">${esc(initials(user.name))}</span>`;
    area.innerHTML = `<div class="relative" data-user-menu>
      <button type="button" data-action="toggle-user-menu" class="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 hover:border-indigo-300" aria-haspopup="menu" aria-expanded="false">
        ${avatar}<span class="hidden max-w-[8rem] truncate text-sm font-semibold sm:block">${esc(user.name)}</span><i class="fa-solid fa-chevron-down text-[10px] text-slate-400" aria-hidden="true"></i>
      </button>
      <div id="user-menu" role="menu" class="card absolute right-0 mt-2 hidden w-60 p-1.5 shadow-xl">
        <div class="border-b border-slate-100 px-3 py-2"><p class="truncate text-sm font-bold">${esc(user.name)}</p><p class="truncate text-xs text-slate-500">${esc(user.email || "")}</p></div>
        <a href="#/history" role="menuitem" class="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-50"><i class="fa-solid fa-clock-rotate-left w-4 text-slate-400" aria-hidden="true"></i>Lịch sử làm bài</a>
        <button type="button" role="menuitem" data-action="logout" class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-600 hover:bg-rose-50"><i class="fa-solid fa-arrow-right-from-bracket w-4" aria-hidden="true"></i>Đăng xuất</button>
      </div>
    </div>`;
  }

  let authMode = "login";

  function openAuth(mode = "login") {
    authMode = mode;
    const isLogin = mode === "login";
    openModal(
      `<div class="p-6 sm:p-8">
        ${modalHeader(isLogin ? "Chào mừng trở lại" : "Tạo tài khoản mới", isLogin ? "Đăng nhập để lưu và đồng bộ lịch sử luyện thi." : "Chỉ mất vài giây để bắt đầu ôn luyện.")}
        ${
          Auth.enabled
            ? ""
            : `<div class="mt-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900"><i class="fa-solid fa-triangle-exclamation mt-0.5" aria-hidden="true"></i><span>Firebase chưa được cấu hình. Điền <code class="font-bold">firebaseConfig</code> trong <code class="font-bold">config.js</code> để bật đăng nhập thật.</span></div>`
        }
        <button type="button" data-action="google-login" class="mt-5 flex h-12 w-full items-center justify-center gap-3 rounded-xl border-[1.5px] border-slate-200 bg-white text-[.95rem] font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
          ${GOOGLE_LOGO}<span>Tiếp tục với Google</span>
        </button>
        <div class="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-slate-400"><span class="h-px flex-1 bg-slate-200"></span>hoặc dùng email<span class="h-px flex-1 bg-slate-200"></span></div>

        <div class="seg mb-4 grid w-full grid-cols-2" role="tablist" aria-label="Chế độ">
          <label><input class="sr-only" type="radio" name="auth-tab" value="login" ${isLogin ? "checked" : ""} data-auth-tab><span class="t w-full text-center">Đăng nhập</span></label>
          <label><input class="sr-only" type="radio" name="auth-tab" value="register" ${!isLogin ? "checked" : ""} data-auth-tab><span class="t w-full text-center">Đăng ký</span></label>
        </div>

        <form id="auth-form" novalidate class="grid gap-3.5">
          ${!isLogin ? `<div><label for="auth-name" class="mb-1.5 block text-sm font-semibold text-slate-700">Họ và tên</label><input id="auth-name" name="name" type="text" autocomplete="name" class="field" placeholder="Nguyễn Văn A"></div>` : ""}
          <div><label for="auth-email" class="mb-1.5 block text-sm font-semibold text-slate-700">Email</label><input id="auth-email" name="email" type="email" autocomplete="email" class="field" placeholder="ban@example.com" ${isLogin ? "autofocus" : ""}></div>
          <div>
            <div class="mb-1.5 flex items-center justify-between"><label for="auth-password" class="text-sm font-semibold text-slate-700">Mật khẩu</label>${isLogin ? `<button type="button" data-action="forgot-password" class="text-xs font-semibold text-indigo-600 hover:underline">Quên mật khẩu?</button>` : ""}</div>
            <div class="relative"><input id="auth-password" name="password" type="password" autocomplete="${isLogin ? "current-password" : "new-password"}" class="field pr-11" placeholder="${isLogin ? "Nhập mật khẩu" : "Ít nhất 6 ký tự"}">
              <button type="button" data-action="toggle-password" class="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700" aria-label="Hiện/ẩn mật khẩu"><i class="fa-regular fa-eye" aria-hidden="true"></i></button></div>
          </div>
          <p id="auth-message" role="alert" class="hidden rounded-lg px-3 py-2 text-sm"></p>
          <button type="submit" id="auth-submit" class="btn btn-primary btn-lg w-full">${isLogin ? "Đăng nhập" : "Tạo tài khoản"}</button>
        </form>
      </div>`
    );
  }

  function setAuthMessage(text, tone = "error") {
    const el = $("#auth-message");
    if (!el) return;
    el.textContent = text;
    el.className = `rounded-lg px-3 py-2 text-sm ${tone === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`;
  }

  async function handleAuthSubmit(form) {
    const data = new FormData(form);
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");
    const name = String(data.get("name") || "").trim();
    if (!email || !password) return setAuthMessage("Vui lòng nhập email và mật khẩu.");
    if (authMode === "register" && !name) return setAuthMessage("Vui lòng nhập họ và tên.");

    const btn = $("#auth-submit");
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Đang xử lý...';
    try {
      if (authMode === "login") await Auth.signInWithEmail(email, password);
      else await Auth.registerWithEmail(name, email, password);
      closeModal();
      toast(authMode === "login" ? "Đăng nhập thành công" : "Tạo tài khoản thành công", "success");
    } catch (error) {
      setAuthMessage(Auth.errorMessage(error));
      btn.disabled = false;
      btn.textContent = authMode === "login" ? "Đăng nhập" : "Tạo tài khoản";
    }
  }

  async function handleGoogleLogin() {
    const btn = $('[data-action="google-login"]');
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>Đang mở Google...</span>';
    try {
      await Auth.signInWithGoogle();
      closeModal();
      toast("Đăng nhập Google thành công", "success");
    } catch (error) {
      setAuthMessage(Auth.errorMessage(error));
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }

  async function handleForgotPassword() {
    const email = String($("#auth-email")?.value || "").trim();
    if (!email) return setAuthMessage("Nhập email của bạn trước, sau đó bấm “Quên mật khẩu?”.");
    try {
      await Auth.resetPassword(email);
      setAuthMessage("Đã gửi email đặt lại mật khẩu. Hãy kiểm tra hộp thư.", "success");
    } catch (error) {
      setAuthMessage(Auth.errorMessage(error));
    }
  }

  /* =====================================================================
   * Home
   * ===================================================================== */
  function renderHome() {
    const subjectCards = Object.entries(SUBJECTS)
      .map(([key, s]) => {
        const n = questionBank.filter((q) => q.subject === key).length;
        return `<a href="#/bank/${key}" class="card card-hover group flex items-center gap-4 p-4">
          <span class="flex h-12 w-12 flex-none items-center justify-center rounded-xl text-xl ${s.solid}"><i class="fa-solid ${s.icon}" aria-hidden="true"></i></span>
          <span class="min-w-0"><span class="block font-bold text-slate-900">${s.label}</span><span class="block text-sm text-slate-500">${n} câu · Lớp 10, 11, 12</span></span>
          <i class="fa-solid fa-arrow-right ml-auto text-slate-300 transition group-hover:translate-x-1 group-hover:text-indigo-600" aria-hidden="true"></i>
        </a>`;
      })
      .join("");

    view.innerHTML = `
    <section class="hero-bg">
      <div class="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 lg:grid-cols-[1.05fr_.95fr] lg:pt-20">
        <div>
          <ul class="flex flex-wrap gap-2" aria-label="Điểm nổi bật">
            <li class="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-200"><i class="fa-solid fa-flask text-indigo-600" aria-hidden="true"></i>3 môn cốt lõi</li>
            <li class="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-200"><i class="fa-solid fa-graduation-cap text-indigo-600" aria-hidden="true"></i>Chương trình THPT</li>
            <li class="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-200"><i class="fa-solid fa-infinity text-indigo-600" aria-hidden="true"></i>Luyện tập miễn phí không giới hạn</li>
          </ul>
          <h1 class="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl lg:text-[3.4rem]">
            Chinh phục <span class="text-sky-600">Lý</span>, <span class="text-amber-500">Hóa</span>, <span class="text-emerald-600">Sinh</span> cùng đề thi như thật.
          </h1>
          <p class="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
            Ngân hàng câu hỏi phân loại theo chuyên đề, đề thi cuộn dọc như đề giấy có đồng hồ đếm ngược, chấm điểm thang 10 và gia sư AI giải thích từng câu.
          </p>
          <div class="mt-8 flex flex-wrap gap-3">
            <a href="#/bank" class="btn btn-primary btn-lg"><i class="fa-solid fa-book-open" aria-hidden="true"></i>Bắt đầu luyện tập</a>
            <a href="#/exams" class="btn btn-secondary btn-lg"><i class="fa-regular fa-clock" aria-hidden="true"></i>Làm đề thi thử</a>
          </div>
          <dl class="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-slate-200 pt-6">
            <div><dt class="text-xs font-semibold uppercase tracking-wide text-slate-500">Câu hỏi</dt><dd class="mt-1 text-2xl font-extrabold text-slate-900">${questionBank.length}</dd></div>
            <div><dt class="text-xs font-semibold uppercase tracking-wide text-slate-500">Chuyên đề</dt><dd class="mt-1 text-2xl font-extrabold text-slate-900">${topicCount}</dd></div>
            <div><dt class="text-xs font-semibold uppercase tracking-wide text-slate-500">Đề thi</dt><dd class="mt-1 text-2xl font-extrabold text-slate-900">${mockExams.length}</dd></div>
          </dl>
        </div>

        <div class="relative mx-auto w-full max-w-md" aria-hidden="true">
          <div class="paper float-slow !p-6">
            <div class="flex items-center justify-between border-b border-slate-200 pb-3">
              <span class="text-xs font-extrabold uppercase tracking-wide text-slate-500">Đề thi thử · Vật lí</span>
              <span class="timer-pill warn !py-1 text-xs"><i class="fa-regular fa-clock"></i><span class="timer">49:12</span></span>
            </div>
            <p class="mt-4 text-sm font-semibold leading-relaxed text-slate-900"><span class="q-num mr-2">Câu 1</span>Một ô tô đang chuyển động với vận tốc 10 m/s thì tăng tốc. Đây là chuyển động gì?</p>
            <div class="mt-3 grid gap-2 text-sm">
              <div class="opt"><span class="opt-key">A</span>Thẳng đều</div>
              <div class="opt" style="border-color:#4f46e5;background:#eef2ff"><span class="opt-key" style="background:#4f46e5;border-color:#4f46e5;color:#fff">B</span>Thẳng nhanh dần đều</div>
              <div class="opt"><span class="opt-key">C</span>Thẳng chậm dần đều</div>
            </div>
            <div class="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div class="h-full w-1/3 rounded-full bg-indigo-500"></div></div>
          </div>
          <div class="absolute -bottom-6 -left-4 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-xl ring-1 ring-slate-200">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600"><i class="fa-solid fa-chart-line"></i></span>
            <span><span class="block text-xs font-semibold text-slate-500">Điểm ước tính</span><span class="block text-lg font-extrabold text-slate-900">8,5 / 10</span></span>
          </div>
        </div>
      </div>
    </section>

    <section class="mx-auto max-w-6xl px-4 pt-16" aria-labelledby="new-title">
      <div class="flex items-center gap-3"><span class="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-emerald-700">Tính năng mới</span></div>
      <h2 id="new-title" class="mt-3 max-w-3xl text-3xl font-extrabold tracking-tight text-slate-900">Từ một tài liệu đến bộ quiz, từ điểm số đến bài giảng đúng trọng tâm</h2>
      <div class="mt-8 grid gap-5 lg:grid-cols-2">
        <article class="card flex flex-col p-6 sm:p-8">
          <span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-xl text-violet-700"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i></span>
          <h3 class="mt-5 text-xl font-extrabold text-slate-900">Tạo quiz tự động bằng AI</h3>
          <p class="mt-2 leading-relaxed text-slate-600">Tải lên tài liệu hoặc dán đường dẫn, AI sẽ đọc, tóm tắt các ý chính và soạn bộ câu hỏi kèm lời giải, phân loại theo chủ đề để bạn luyện ngay.</p>
          <ul class="mt-4 flex flex-wrap gap-2" aria-label="Nguồn tài liệu hỗ trợ">
            ${[["fa-file-pdf", "PDF"], ["fa-file-word", "Word"], ["fa-file-powerpoint", "PowerPoint"], ["fa-newspaper", "Link bài báo"], ["fa-brands fa-youtube", "Video YouTube"]]
              .map(([icon, label]) => `<li class="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"><i class="fa-solid ${icon} text-violet-600" aria-hidden="true"></i>${label}</li>`)
              .join("")}
          </ul>
          <ul class="mt-5 grid gap-2 text-sm text-slate-700">
            <li class="flex gap-2.5"><i class="fa-solid fa-circle-check mt-0.5 text-emerald-500" aria-hidden="true"></i>Tóm tắt nội dung và liệt kê ý chính cần nhớ</li>
            <li class="flex gap-2.5"><i class="fa-solid fa-circle-check mt-0.5 text-emerald-500" aria-hidden="true"></i>Chọn số câu, độ khó và dạng câu hỏi theo ý bạn</li>
            <li class="flex gap-2.5"><i class="fa-solid fa-circle-check mt-0.5 text-emerald-500" aria-hidden="true"></i>Lưu lại để làm lại và theo dõi tiến bộ</li>
          </ul>
          <div class="mt-auto pt-6"><a href="#/ai-quiz" class="btn btn-primary btn-lg"><i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i>Tạo quiz từ tài liệu</a></div>
        </article>

        <article class="card flex flex-col p-6 sm:p-8">
          <span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-xl text-rose-700"><i class="fa-solid fa-chart-column" aria-hidden="true"></i></span>
          <h3 class="mt-5 text-xl font-extrabold text-slate-900">Thống kê chủ đề hay sai</h3>
          <p class="mt-2 leading-relaxed text-slate-600">Biểu đồ trực quan cho thấy học sinh sai nhiều nhất ở chương nào, câu nào và em nào cần hỗ trợ, để giáo viên biết chính xác mảng kiến thức cần giảng lại.</p>
          <div class="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200" aria-hidden="true">
            ${[["Động lực học chất điểm", 68, "bg-rose-500"], ["Cân bằng hóa học", 52, "bg-rose-500"], ["Di truyền học", 37, "bg-amber-500"], ["Dao động cơ", 18, "bg-emerald-500"]]
              .map(([name, v, color]) => `<div><div class="flex justify-between text-xs font-semibold text-slate-600"><span>${name}</span><span>${v}% sai</span></div><div class="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-200"><div class="h-full rounded-full ${color}" style="width:${v}%"></div></div></div>`)
              .join("")}
          </div>
          <div class="mt-auto flex flex-wrap gap-3 pt-6">
            <a href="#/stats" class="btn btn-primary btn-lg"><i class="fa-solid fa-chart-line" aria-hidden="true"></i>Xem thống kê</a>
          </div>
        </article>
      </div>
    </section>

    <section class="mx-auto max-w-6xl px-4 pt-16" aria-labelledby="features-title">
      <div class="max-w-2xl"><p class="text-sm font-bold uppercase tracking-wide text-indigo-600">Tính năng</p>
        <h2 id="features-title" class="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Mọi thứ bạn cần để ôn thi hiệu quả</h2></div>
      <div class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        ${[
          ["fa-layer-group", "bg-indigo-100 text-indigo-700", "Không giới hạn câu hỏi", "Câu hỏi được phân loại chuẩn theo môn, lớp và chuyên đề, dễ tìm đúng phần cần ôn."],
          ["fa-bolt", "bg-amber-100 text-amber-700", "Phản hồi tức thì", "Biết đúng sai ngay sau mỗi câu, xem giải thích và làm lại không giới hạn số lần."],
          ["fa-list-check", "bg-sky-100 text-sky-700", "Đủ dạng câu hỏi chuẩn", "Hỗ trợ trắc nghiệm, đúng/sai, trả lời ngắn và kéo thả, mỗi câu được phân mức Nhận biết, Thông hiểu, Vận dụng."],
          ["fa-wand-magic-sparkles", "bg-emerald-100 text-emerald-700", "Gia sư AI", "Không hiểu lời giải? Bấm “Hỏi AI lý do” để được giải thích từng bước."],
        ]
          .map(
            ([icon, tone, title, desc]) => `<article class="card p-5">
              <span class="flex h-11 w-11 items-center justify-center rounded-xl text-lg ${tone}"><i class="fa-solid ${icon}" aria-hidden="true"></i></span>
              <h3 class="mt-4 font-bold text-slate-900">${title}</h3>
              <p class="mt-1.5 text-sm leading-relaxed text-slate-600">${desc}</p>
            </article>`
          )
          .join("")}
      </div>
    </section>

    <section class="mx-auto max-w-6xl px-4 pt-20" aria-labelledby="flow-title">
      <div class="max-w-2xl"><p class="text-sm font-bold uppercase tracking-wide text-indigo-600">Lộ trình</p>
        <h2 id="flow-title" class="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Học theo 3 bước đơn giản</h2></div>
      <ol class="mt-8 grid gap-4 lg:grid-cols-3">
        <li class="card relative p-6">
          <span class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-sm font-extrabold text-white">1</span>
          <h3 class="mt-4 text-lg font-bold text-slate-900">Chọn môn học</h3>
          <p class="mt-1.5 text-sm leading-relaxed text-slate-600">Bắt đầu với môn bạn muốn cải thiện nhất.</p>
          <div class="mt-4 grid gap-2.5">${subjectCards}</div>
        </li>
        <li class="card p-6">
          <span class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-sm font-extrabold text-white">2</span>
          <h3 class="mt-4 text-lg font-bold text-slate-900">Luyện tập theo chuyên đề</h3>
          <p class="mt-1.5 text-sm leading-relaxed text-slate-600">Truy cập ngân hàng câu hỏi, tìm chuyên đề và tập trung vào phần kiến thức còn yếu.</p>
          <a href="#/bank" class="btn btn-secondary mt-5"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>Mở ngân hàng câu hỏi</a>
        </li>
        <li class="card p-6">
          <span class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-sm font-extrabold text-white">3</span>
          <h3 class="mt-4 text-lg font-bold text-slate-900">Thi thử và thi thật</h3>
          <p class="mt-1.5 text-sm leading-relaxed text-slate-600">Làm đề có bấm giờ, ước tính điểm thang 10 và biết chuyên đề nào cần tập trung thêm.</p>
          <a href="#/exams" class="btn btn-secondary mt-5"><i class="fa-regular fa-clock" aria-hidden="true"></i>Xem danh sách đề thi</a>
        </li>
      </ol>
    </section>

    <section class="mx-auto mt-20 max-w-6xl px-4">
      <div class="flex flex-col items-start justify-between gap-6 rounded-3xl bg-slate-900 p-8 sm:flex-row sm:items-center sm:p-12">
        <div><h2 class="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">Sẵn sàng cho đề thi tiếp theo?</h2>
          <p class="mt-2 max-w-lg text-slate-300">Làm thử một đề ngay bây giờ, không cần đăng ký.</p></div>
        <a href="#/exams" class="btn btn-lg flex-none bg-white text-slate-900 hover:bg-indigo-50">Làm đề thi thử<i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
      </div>
    </section>`;
  }

  /* =====================================================================
   * Question bank + search
   * ===================================================================== */
  const bankFilter = { grade: "all", levels: [] };

  function renderBank(subjectKey) {
    const subject = SUBJECTS[subjectKey] ? subjectKey : "Physics";
    const s = SUBJECTS[subject];
    let query = "";
    let shownQuestions = [];

    const chipCls = (on) =>
      `rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${on ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-indigo-300"}`;

    const subjectChips = Object.entries(SUBJECTS)
      .map(([key, sub]) => {
        const active = key === subject;
        return `<a href="#/bank/${key}" aria-current="${active ? "page" : "false"}" class="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${active ? sub.solid + " shadow-sm" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-indigo-300"}"><i class="fa-solid ${sub.icon}" aria-hidden="true"></i>${sub.label}</a>`;
      })
      .join("");

    const row = (label, id, content) => `<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <span class="w-20 flex-none text-xs font-extrabold uppercase tracking-wider text-slate-400">${label}</span>
      <div id="${id}" class="flex flex-wrap gap-2">${content}</div></div>`;

    const gradeChipsHtml = () =>
      [["all", "Tất cả lớp"], ...GRADES.map((g) => [String(g), `Lớp ${g}`])]
        .map(([v, l]) => `<button type="button" data-bank-grade="${v}" aria-pressed="${bankFilter.grade === v}" class="${chipCls(bankFilter.grade === v)}">${l}</button>`)
        .join("");

    const levelChipsHtml = () =>
      Object.entries(DIFFICULTY)
        .sort((a, b) => a[1].order - b[1].order)
        .map(([k, d]) => {
          const on = bankFilter.levels.includes(k);
          return `<button type="button" data-bank-level="${k}" aria-pressed="${on}" class="inline-flex items-center gap-2 ${chipCls(on)}"><span class="h-2 w-2 rounded-full ${d.dot}" aria-hidden="true"></span>${d.sub}</button>`;
        })
        .join("");

    view.innerHTML = `
    <section id="bank-body" class="mx-auto max-w-6xl px-4 pt-10">
      <nav aria-label="Breadcrumb" class="text-sm text-slate-500"><a href="#/" class="hover:text-indigo-600">Trang chủ</a> <span class="mx-1">/</span> <span class="font-semibold text-slate-700">Ngân hàng câu hỏi</span></nav>
      <h1 class="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">Ngân hàng câu hỏi</h1>
      <p class="mt-1.5 text-slate-600">Lọc theo môn, lớp và mức độ tư duy; luyện tập tức thì hoặc xuất đề ra PDF/Word để in.</p>

      <div class="card mt-6 grid gap-4 p-5">
        ${row("Môn học", "bank-subjects", subjectChips)}
        ${row("Lớp", "bank-grades", gradeChipsHtml())}
        ${row("Mức độ", "bank-levels", levelChipsHtml())}
      </div>

      <div class="relative mt-5 w-full sm:max-w-md">
        <label for="topic-search" class="sr-only">Tìm chuyên đề</label>
        <i class="fa-solid fa-magnifying-glass pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true"></i>
        <input id="topic-search" type="search" autocomplete="off" class="field !pl-10" placeholder="Tìm trong ${s.label}: điện li, dao động...">
      </div>

      <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p id="bank-status" class="text-sm text-slate-500" aria-live="polite"></p>
        <button type="button" id="bank-export-all" data-bank-export="all" class="btn btn-secondary btn-sm"><i class="fa-solid fa-file-export" aria-hidden="true"></i><span id="bank-export-label">Xuất đề theo bộ lọc</span></button>
      </div>
      <div id="bank-results" class="mt-4 grid gap-8"></div>
    </section>`;

    const pickLevels = (all) => (bankFilter.levels.length ? all.filter((x) => bankFilter.levels.includes(x.difficulty)) : all);

    const paint = () => {
      const q = fold(query.trim());
      const grades = bankFilter.grade === "all" ? GRADES : [Number(bankFilter.grade)];
      let topicsShown = 0;
      shownQuestions = [];

      const sections = grades
        .map((grade) => {
          const topics = Object.entries(topicIndex[subject]?.[grade] || {})
            .map(([topic, all]) => {
              const questions = pickLevels(all);
              const byName = !q || fold(topic).includes(q);
              const byContent = !!q && !byName && questions.some((x) => fold(x.questionText).includes(q));
              return { topic, questions, byContent, visible: questions.length > 0 && (byName || byContent) };
            })
            .filter((t) => t.visible);
          topicsShown += topics.length;
          const gradeCount = topics.reduce((n, t) => n + t.questions.length, 0);
          topics.forEach((t) => shownQuestions.push(...t.questions));

          const cards = topics.length
            ? topics
                .map(({ topic, questions, byContent }) => {
                  const types = Object.entries(questions.reduce((acc, x) => ((acc[x.type] = (acc[x.type] || 0) + 1), acc), {}))
                    .map(([t, n]) => `<span class="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">${QUESTION_TYPES[t].label} · ${n}</span>`)
                    .join("");
                  const levels = Object.entries(DIFFICULTY)
                    .sort((a, b) => a[1].order - b[1].order)
                    .map(([k, d]) => [d, questions.filter((x) => x.difficulty === k).length])
                    .filter(([, n]) => n)
                    .map(([d, n]) => `<span class="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500"><span class="h-2 w-2 rounded-full ${d.dot}" aria-hidden="true"></span>${d.sub} ${n}</span>`)
                    .join("");
                  const attrs = `data-subject="${esc(subject)}" data-grade="${grade}" data-topic="${esc(topic)}"`;
                  return `<article class="card card-hover flex flex-col p-5">
                    <span class="inline-flex w-fit rounded-md px-2 py-0.5 text-xs font-bold ${s.badge}">Lớp ${grade}</span>
                    <h3 class="mt-3 text-lg font-bold leading-snug text-slate-900">${highlight(topic, query)}</h3>
                    <p class="mt-1 text-sm text-slate-500">${questions.length} câu hỏi${byContent ? " · khớp trong nội dung câu hỏi" : ""}</p>
                    <div class="mt-3 flex flex-wrap gap-1.5">${types}</div>
                    <div class="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">${levels}</div>
                    <div class="mt-auto grid grid-cols-2 gap-2 pt-5">
                      <button type="button" data-action="open-practice-setup" ${attrs} class="btn btn-secondary btn-sm">Luyện tập</button>
                      <button type="button" data-bank-export="topic" ${attrs} class="btn btn-secondary btn-sm"><i class="fa-solid fa-file-export text-xs" aria-hidden="true"></i>Xuất đề</button>
                    </div>
                  </article>`;
                })
                .join("")
            : `<p class="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500 sm:col-span-2 lg:col-span-3">Không có chuyên đề phù hợp bộ lọc</p>`;

          return `<section aria-labelledby="grade-${grade}">
            <div class="mb-3 flex flex-wrap items-center gap-3">
              <h2 id="grade-${grade}" class="rounded-lg px-3 py-1 text-sm font-extrabold ${s.solid}">Lớp ${grade}</h2>
              <span class="text-sm font-semibold text-slate-500">${topics.length} chuyên đề · ${gradeCount} câu</span>
            </div>
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">${cards}</div>
          </section>`;
        })
        .join("");

      $("#bank-results").innerHTML = sections;
      const scope = bankFilter.grade === "all" ? s.label : `${s.label} lớp ${bankFilter.grade}`;
      $("#bank-status").textContent = q
        ? topicsShown
          ? `Tìm thấy ${topicsShown} chuyên đề phù hợp với “${query.trim()}”.`
          : `Không tìm thấy chuyên đề nào phù hợp với “${query.trim()}”.`
        : `${topicsShown} chuyên đề · ${shownQuestions.length} câu hỏi trong ${scope}.`;
      $("#bank-export-all").disabled = !shownQuestions.length;
      $("#bank-export-label").textContent = shownQuestions.length ? `Xuất đề theo bộ lọc (${shownQuestions.length} câu)` : "Xuất đề theo bộ lọc";
    };

    paint();
    $("#topic-search").addEventListener("input", (e) => {
      query = e.target.value;
      paint();
    });

    $("#bank-body").addEventListener("click", (e) => {
      const gradeBtn = e.target.closest("[data-bank-grade]");
      const levelBtn = e.target.closest("[data-bank-level]");
      const exportBtn = e.target.closest("[data-bank-export]");
      if (gradeBtn) {
        bankFilter.grade = gradeBtn.dataset.bankGrade;
        $("#bank-grades").innerHTML = gradeChipsHtml();
        paint();
      } else if (levelBtn) {
        const k = levelBtn.dataset.bankLevel;
        bankFilter.levels = bankFilter.levels.includes(k) ? bankFilter.levels.filter((x) => x !== k) : [...bankFilter.levels, k];
        $("#bank-levels").innerHTML = levelChipsHtml();
        paint();
      } else if (exportBtn) {
        if (exportBtn.dataset.bankExport === "topic") {
          const { grade, topic } = exportBtn.dataset;
          window.LabExport.open({ title: `${topic} – ${s.label} lớp ${grade}`, questions: pickLevels(topicIndex[subject][grade][topic]) });
        } else {
          const scope = bankFilter.grade === "all" ? "" : ` lớp ${bankFilter.grade}`;
          window.LabExport.open({ title: `Đề ${s.label}${scope} tổng hợp`, questions: shownQuestions });
        }
      }
    });
  }

  /* =====================================================================
   * Practice setup popup (choose question types / difficulty)
   * ===================================================================== */
  function openPracticeSetup(subject, grade, topic) {
    const questions = topicIndex[subject]?.[grade]?.[topic];
    if (!questions) return;
    const s = SUBJECTS[subject];

    const typeRows = Object.entries(QUESTION_TYPES)
      .sort((a, b) => a[1].order - b[1].order)
      .map(([key, t]) => {
        const n = questions.filter((q) => q.type === key).length;
        return `<label class="check-card ${n ? "" : "is-disabled"}">
          <input class="sr-only" type="checkbox" name="setup-type" value="${key}" data-setup ${n ? "checked" : "disabled"}>
          <span class="check-icon ${s.solid}"><i class="fa-solid ${t.icon}" aria-hidden="true"></i></span>
          <span class="min-w-0 flex-1"><span class="block font-bold text-slate-900">${t.label}</span><span class="block text-xs leading-snug text-slate-500">${n ? t.hint : "Chuyên đề này chưa có dạng câu hỏi này"}</span></span>
          <span class="flex-none rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">${n} câu</span>
          <span class="check-box" aria-hidden="true"><i class="fa-solid fa-check"></i></span>
        </label>`;
      })
      .join("");

    const levelRows = Object.entries(DIFFICULTY)
      .sort((a, b) => a[1].order - b[1].order)
      .map(([key, d]) => {
        const n = questions.filter((q) => q.difficulty === key).length;
        return `<label class="check-chip ${n ? "" : "is-disabled"}">
          <input class="sr-only" type="checkbox" name="setup-level" value="${key}" data-setup ${n ? "checked" : "disabled"}>
          <span class="inline-block h-2 w-2 rounded-full ${d.dot}" aria-hidden="true"></span>
          <span>${d.label}</span><span class="text-xs font-semibold text-slate-400">${n}</span>
        </label>`;
      })
      .join("");

    openModal(
      `<div class="p-6 sm:p-7">
        ${modalHeader("Chọn dạng câu hỏi", `${esc(topic)} · ${s.label} lớp ${grade}`)}
        <fieldset class="mt-5">
          <div class="flex items-center justify-between gap-3">
            <legend class="text-sm font-bold text-slate-900">Dạng bài <span class="font-medium text-slate-500">(chọn một hoặc nhiều)</span></legend>
            <button type="button" class="text-xs font-bold text-indigo-600 hover:underline" data-action="setup-toggle-types">Chọn tất cả / Bỏ chọn</button>
          </div>
          <div class="mt-2.5 grid gap-2">${typeRows}</div>
        </fieldset>
        <fieldset class="mt-5">
          <legend class="text-sm font-bold text-slate-900">Độ khó <span class="font-medium text-slate-500">(tùy chọn)</span></legend>
          <div class="mt-2.5 flex flex-wrap gap-2">${levelRows}</div>
        </fieldset>
        <p id="setup-summary" class="mt-5 rounded-xl bg-slate-50 p-3 text-sm text-slate-600" aria-live="polite"></p>
        <div class="mt-5 flex justify-end gap-2.5">
          <button type="button" class="btn btn-ghost" data-action="close-modal">Hủy</button>
          <button type="button" id="setup-start" class="btn btn-primary" data-action="start-practice" data-subject="${esc(subject)}" data-grade="${grade}" data-topic="${esc(topic)}"><i class="fa-solid fa-play" aria-hidden="true"></i><span id="setup-start-label">Bắt đầu</span></button>
        </div>
      </div>`,
      { size: "lg" }
    );
    updateSetupSummary();
  }

  function setupSelection() {
    const btn = $("#setup-start");
    const questions = btn ? topicIndex[btn.dataset.subject]?.[btn.dataset.grade]?.[btn.dataset.topic] || [] : [];
    const types = $$('input[name="setup-type"]:checked').map((i) => i.value);
    const levels = $$('input[name="setup-level"]:checked').map((i) => i.value);
    const count = questions.filter((q) => types.includes(q.type) && levels.includes(q.difficulty)).length;
    return { btn, types, levels, count };
  }

  function updateSetupSummary() {
    const { btn, types, levels, count } = setupSelection();
    if (!btn) return;
    btn.disabled = count === 0;
    $("#setup-start-label").textContent = count ? `Bắt đầu (${count} câu)` : "Bắt đầu";
    $("#setup-summary").innerHTML = !types.length
      ? '<i class="fa-solid fa-circle-info mr-1.5 text-slate-400" aria-hidden="true"></i>Hãy chọn ít nhất một dạng bài.'
      : !levels.length
        ? '<i class="fa-solid fa-circle-info mr-1.5 text-slate-400" aria-hidden="true"></i>Hãy chọn ít nhất một mức độ khó.'
        : count
          ? `Bạn sẽ làm <strong class="text-slate-900">${count} câu</strong> thuộc ${types.length} dạng bài.`
          : "Không có câu hỏi nào khớp lựa chọn này. Hãy thử mở rộng độ khó.";
  }

  function toggleSetupTypes() {
    const boxes = $$('input[name="setup-type"]:not(:disabled)');
    const allOn = boxes.every((b) => b.checked);
    boxes.forEach((b) => (b.checked = !allOn));
    updateSetupSummary();
  }

  function startPractice(btn) {
    const { types, levels, count } = setupSelection();
    if (!count) return;
    const href = practiceHref(btn.dataset.subject, btn.dataset.grade, btn.dataset.topic, { types, levels });
    const same = location.hash === href;
    closeModal();
    location.hash = href;
    if (same) route();
  }

  /* =====================================================================
   * Practice (one question at a time, per-question stopwatch, flag for later)
   * ===================================================================== */
  const parseList = (raw, dict) => {
    const picked = raw ? raw.split(",").filter((k) => dict[k]) : [];
    return picked.length ? picked : Object.keys(dict);
  };

  function renderPractice(subject, grade, topic, params = new URLSearchParams()) {
    const s = SUBJECTS[subject];
    if (!s) return renderNotFound();
    const types = parseList(params.get("types"), QUESTION_TYPES);
    const levels = parseList(params.get("levels"), DIFFICULTY);
    const all = questionBank.filter((q) => q.subject === subject && q.grade === Number(grade) && q.topic === topic);
    if (!all.length) return renderNotFound();

    const list = all
      .filter((q) => types.includes(q.type) && levels.includes(q.difficulty))
      .sort(
        (a, b) =>
          QUESTION_TYPES[a.type].order - QUESTION_TYPES[b.type].order ||
          DIFFICULTY[a.difficulty].order - DIFFICULTY[b.difficulty].order
      );
    if (!list.length) return renderNotFound("Không có câu hỏi nào khớp dạng bài và độ khó bạn đã chọn.");

    startPracticeSession({
      list,
      meta: { subject, grade: Number(grade), topic, types, levels },
      crumbs: `<a href="#/bank" class="hover:text-indigo-600">Ngân hàng câu hỏi</a><span class="mx-1">/</span>
        <a href="#/bank/${subject}" class="hover:text-indigo-600">${s.label}</a><span class="mx-1">/</span>
        <span class="font-semibold text-slate-700">Lớp ${grade}</span>`,
      heading: topic,
    });
  }

  function startPracticeSession({ list, meta, crumbs, heading }) {
    const s = subjOf(meta.subject);
    const grade = meta.grade;
    const types = Object.keys(QUESTION_TYPES);

    ddSel = null;
    ctx = {
      mode: "practice", answers: {}, checked: {}, flagged: {}, qTime: {}, current: 0, tickAt: Date.now(), list,
      startedAt: Date.now(), meta,
    };

    const typeChips = types
      .filter((t) => list.some((q) => q.type === t))
      .map((t) => `<span class="rounded-md bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">${QUESTION_TYPES[t].label}</span>`)
      .join("");

    view.innerHTML = `
    <section class="mx-auto max-w-6xl px-4 pb-6 pt-8">
      <nav aria-label="Breadcrumb" class="text-sm text-slate-500">${crumbs}</nav>
      <div class="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <span class="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-bold ${s.badge}"><i class="fa-solid ${meta.aiQuiz ? "fa-wand-magic-sparkles" : s.icon}" aria-hidden="true"></i>${meta.aiQuiz ? "Quiz AI" : s.label} · Lớp ${grade}</span>
          <h1 class="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">${esc(heading)}</h1>
          <div class="mt-2 flex flex-wrap gap-1.5">${typeChips}</div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <div class="timer-pill" role="timer" aria-label="Tổng thời gian luyện tập"><i class="fa-regular fa-clock" aria-hidden="true"></i><span class="text-xs font-semibold text-slate-500">Tổng</span><span id="total-timer-text" class="timer text-base">00:00</span></div>
          <button type="button" class="btn btn-secondary btn-sm" data-action="reset-practice"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i>Làm lại tất cả</button>
          <button type="button" class="btn btn-primary btn-sm" data-action="finish-practice"><i class="fa-solid fa-flag-checkered" aria-hidden="true"></i>Kết thúc</button>
        </div>
      </div>

      <div class="mt-5 rounded-xl bg-white p-4 ring-1 ring-slate-200">
        <div class="flex items-center justify-between text-sm"><span class="font-semibold text-slate-700">Tiến độ</span><span id="practice-progress-text" class="font-bold text-slate-900"></span></div>
        <div class="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div id="practice-progress-bar" class="h-full rounded-full ${s.bar} transition-all" style="width:0%"></div></div>
      </div>

      <div id="palette-mobile" class="mt-4 flex gap-2 overflow-x-auto pb-2 lg:hidden" aria-label="Danh sách câu hỏi"></div>

      <div class="mt-5 grid items-start gap-6 lg:grid-cols-[1fr_18rem]">
        <div>
          <div id="practice-stage"></div>
          <div id="practice-actions"></div>
        </div>
        <aside id="practice-side" class="hidden lg:sticky lg:top-24 lg:block" aria-label="Điều hướng câu hỏi"></aside>
      </div>
    </section>`;

    paintPractice();
    startPracticeTimer();
  }

  const qTimeSec = (qid) => Math.floor((ctx.qTime[qid] || 0) / 1000);
  const totalTimeSec = () => Math.floor(Object.values(ctx.qTime).reduce((a, b) => a + b, 0) / 1000);

  function startPracticeTimer() {
    stopTimer();
    ctx.tickAt = Date.now();
    timerId = setInterval(() => {
      if (ctx.mode !== "practice" || !$("#practice-stage")) return stopTimer();
      const now = Date.now();
      const delta = Math.min(now - ctx.tickAt, 2000);
      ctx.tickAt = now;
      const q = ctx.list[ctx.current];
      if (q && !ctx.checked[q.id]) ctx.qTime[q.id] = (ctx.qTime[q.id] || 0) + delta;
      paintTimers();
    }, 500);
  }

  function paintTimers() {
    const q = ctx.list[ctx.current];
    const text = $("#q-timer-text");
    if (q && text) {
      text.textContent = fmtClock(qTimeSec(q.id));
      $("#q-timer")?.classList.toggle("done", !!ctx.checked[q.id]);
    }
    const total = $("#total-timer-text");
    if (total) total.textContent = fmtClock(totalTimeSec());
  }

  function practiceStageHtml(q) {
    const num = ctx.current + 1;
    const d = DIFFICULTY[q.difficulty];
    return `<div class="card overflow-hidden">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
        <div class="flex flex-wrap items-center gap-2">
          <span class="q-num">Câu ${num}/${ctx.list.length}</span>
          <span class="rounded-md bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">${QUESTION_TYPES[q.type].label}</span>
          <span class="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-bold ${d.badge}"><span class="h-1.5 w-1.5 rounded-full ${d.dot}" aria-hidden="true"></span>${d.label}</span>
          ${ctx.flagged[q.id] ? '<span class="inline-flex items-center gap-1 rounded-md bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-700"><i class="fa-solid fa-flag" aria-hidden="true"></i>Xem lại sau</span>' : ""}
        </div>
        <div id="q-timer" class="timer-pill" role="timer" aria-label="Thời gian làm câu này"><i class="fa-solid fa-stopwatch" aria-hidden="true"></i><span id="q-timer-text" class="timer text-lg">00:00</span></div>
      </div>
      <div class="p-4 sm:p-5">${cardHtml(q, num)}</div>
    </div>`;
  }

  function practiceActionsHtml(q) {
    const checked = !!ctx.checked[q.id];
    const answered = isAnswered(q, ctx.answers[q.id]);
    const first = ctx.current === 0;
    const last = ctx.current === ctx.list.length - 1;
    const flagged = !!ctx.flagged[q.id];
    const nextLabel = checked ? "Câu tiếp theo" : answered ? "Tiếp, kiểm tra sau" : "Bỏ qua câu này";
    return `<div class="mt-4 flex flex-wrap items-center gap-2">
      <button type="button" class="btn btn-secondary" data-action="prev-q" ${first ? "disabled" : ""}><i class="fa-solid fa-arrow-left" aria-hidden="true"></i><span>Câu trước</span></button>
      <button type="button" class="btn ${flagged ? "btn-flag-on" : "btn-secondary"}" data-action="toggle-flag" aria-pressed="${flagged}"><i class="fa-${flagged ? "solid" : "regular"} fa-flag" aria-hidden="true"></i><span>${flagged ? "Bỏ đánh dấu" : "Đánh dấu xem lại"}</span></button>
      <div class="ml-auto flex flex-wrap items-center gap-2">
        ${checked ? "" : `<button type="button" class="btn btn-primary" data-action="check-question" data-q="${q.id}"><i class="fa-solid fa-check" aria-hidden="true"></i>Kiểm tra đáp án</button>`}
        ${
          last
            ? `<button type="button" class="btn ${checked ? "btn-primary" : "btn-secondary"}" data-action="finish-practice"><span>Hoàn thành</span><i class="fa-solid fa-flag-checkered" aria-hidden="true"></i></button>`
            : `<button type="button" class="btn ${checked ? "btn-primary" : "btn-secondary"}" data-action="next-q"><span>${nextLabel}</span><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>`
        }
      </div>
    </div>`;
  }

  function dotState(q) {
    if (ctx.checked[q.id]) {
      const f = gradeQuestion(q, ctx.answers[q.id]).fraction;
      return f === 1 ? "is-ok" : f > 0 ? "is-part" : "is-bad";
    }
    return isAnswered(q, ctx.answers[q.id]) ? "is-answered" : "";
  }

  function paletteHtml() {
    return ctx.list
      .map((q, i) => {
        const status = ctx.checked[q.id] ? "đã ki���m tra" : isAnswered(q, ctx.answers[q.id]) ? "đã làm, chưa kiểm tra" : "chưa làm";
        return `<button type="button" class="nav-dot ${dotState(q)} ${i === ctx.current ? "is-current" : ""} ${ctx.flagged[q.id] ? "is-flagged" : ""}" data-action="goto-practice-q" data-i="${i}" aria-label="Câu ${i + 1}, ${status}${ctx.flagged[q.id] ? ", đã đánh dấu xem lại" : ""}" ${i === ctx.current ? 'aria-current="step"' : ""}>${i + 1}</button>`;
      })
      .join("");
  }

  function practiceSideHtml() {
    const checkedN = ctx.list.filter((q) => ctx.checked[q.id]).length;
    const correctN = ctx.list.filter((q) => ctx.checked[q.id] && gradeQuestion(q, ctx.answers[q.id]).fraction === 1).length;
    const flaggedN = ctx.list.filter((q) => ctx.flagged[q.id]).length;
    const legend = [
      ["bg-white ring-1 ring-slate-300", "Chưa làm"],
      ["bg-indigo-200", "Đã làm"],
      ["bg-emerald-500", "Đúng"],
      ["bg-rose-500", "Sai"],
      ["bg-orange-500", "Xem lại sau"],
    ]
      .map(([cls, label]) => `<span class="flex items-center gap-1.5"><span class="h-3 w-3 rounded ${cls}"></span>${label}</span>`)
      .join("");
    return `<div class="card p-4">
      <h2 class="text-sm font-extrabold text-slate-900">Danh sách câu hỏi</h2>
      <div class="mt-3 grid grid-cols-5 gap-2.5">${paletteHtml()}</div>
      <div class="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-slate-500">${legend}</div>
      <dl class="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center">
        <div class="rounded-lg bg-slate-50 p-2"><dt class="text-[11px] font-semibold text-slate-500">Đã kiểm tra</dt><dd class="text-lg font-extrabold text-slate-900">${checkedN}</dd></div>
        <div class="rounded-lg bg-emerald-50 p-2"><dt class="text-[11px] font-semibold text-emerald-700">Đúng</dt><dd class="text-lg font-extrabold text-emerald-700">${correctN}</dd></div>
        <div class="rounded-lg bg-orange-50 p-2"><dt class="text-[11px] font-semibold text-orange-700">Đánh dấu</dt><dd class="text-lg font-extrabold text-orange-700">${flaggedN}</dd></div>
      </dl>
      <button type="button" class="btn btn-secondary btn-sm mt-3 w-full" data-action="next-flagged" ${flaggedN ? "" : "disabled"}><i class="fa-solid fa-flag" aria-hidden="true"></i>Tới câu đã đánh dấu</button>
    </div>`;
  }

  function paintPracticeChrome() {
    const q = ctx.list[ctx.current];
    const done = ctx.list.filter((x) => ctx.checked[x.id]).length;
    $("#practice-progress-text").textContent = `${done}/${ctx.list.length} câu đã kiểm tra`;
    $("#practice-progress-bar").style.width = `${(done / ctx.list.length) * 100}%`;
    $("#practice-actions").innerHTML = practiceActionsHtml(q);
    $("#practice-side").innerHTML = practiceSideHtml();
    $("#palette-mobile").innerHTML = paletteHtml();
  }

  function paintPractice() {
    const q = ctx.list[ctx.current];
    $("#practice-stage").innerHTML = practiceStageHtml(q);
    paintPracticeChrome();
    paintTimers();
  }

  function gotoQuestion(i) {
    if (i < 0 || i >= ctx.list.length) return;
    ctx.current = i;
    ctx.tickAt = Date.now();
    ddSel = null;
    paintPractice();
    $("#practice-stage")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function toggleFlag() {
    const qid = ctx.list[ctx.current].id;
    if (ctx.flagged[qid]) delete ctx.flagged[qid];
    else {
      ctx.flagged[qid] = true;
      toast("Đã đánh dấu câu này để xem lại sau", "info");
    }
    paintPractice();
  }

  function gotoNextFlagged() {
    const n = ctx.list.length;
    for (let step = 1; step <= n; step++) {
      const i = (ctx.current + step) % n;
      if (ctx.flagged[ctx.list[i].id]) return gotoQuestion(i);
    }
    toast("Chưa có câu nào được đánh dấu", "info");
  }

  function checkQuestion(qid) {
    const q = bankById.get(qid);
    if (!isFullyAnswered(q, ctx.answers[qid])) {
      toast(
        q.type === "true_false" ? "Hãy chọn Đúng/Sai cho tất cả các ý"
          : q.type === "short_answer" ? "Hãy nhập đáp án trước khi kiểm tra"
          : q.type === "drag_drop" ? "Hãy kéo đáp án vào tất cả các ô trước khi kiểm tra"
          : "Hãy chọn một đáp án trước khi kiểm tra",
        "error"
      );
      return;
    }
    ctx.checked[qid] = true;
    ddSel = null;
    paintPractice();
  }

  function retryQuestion(qid) {
    delete ctx.checked[qid];
    delete ctx.answers[qid];
    delete ctx.qTime[qid];
    ctx.tickAt = Date.now();
    ddSel = null;
    paintPractice();
  }

  function resetPractice() {
    ctx.answers = {};
    ctx.checked = {};
    ctx.flagged = {};
    ctx.qTime = {};
    ctx.current = 0;
    ctx.startedAt = Date.now();
    ctx.tickAt = Date.now();
    ddSel = null;
    paintPractice();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function requestFinishPractice() {
    const list = ctx.list;
    const blank = list.filter((q) => !isAnswered(q, ctx.answers[q.id])).length;
    const unchecked = list.filter((q) => isAnswered(q, ctx.answers[q.id]) && !ctx.checked[q.id]).length;
    const flagged = list.filter((q) => ctx.flagged[q.id]).length;
    const row = (n, label, tone) => `<li class="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"><span class="text-slate-600">${label}</span><strong class="${n ? tone : "text-slate-400"}">${n}</strong></li>`;
    openModal(
      `<div class="p-6 sm:p-7">
        ${modalHeader("Kết thúc luyện tập?")}
        <ul class="mt-4 grid gap-2 text-sm">
          ${row(blank, "Câu chưa làm", "text-rose-600")}
          ${row(unchecked, "Câu đã làm nhưng chưa kiểm tra", "text-amber-600")}
          ${row(flagged, "Câu đã đánh dấu xem lại", "text-orange-600")}
        </ul>
        <p class="mt-3 text-sm text-slate-600">Tất cả câu đã làm sẽ được chấm điểm, câu bỏ trống tính 0 điểm. Kết quả được lưu vào lịch sử.</p>
        <div class="mt-6 flex flex-wrap justify-end gap-2.5">
          <button type="button" class="btn btn-ghost" data-action="close-modal" autofocus>Làm tiếp</button>
          ${flagged ? '<button type="button" class="btn btn-secondary" data-action="review-flagged"><i class="fa-solid fa-flag" aria-hidden="true"></i>Xem câu đánh dấu</button>' : ""}
          <button type="button" class="btn btn-primary" data-action="confirm-finish-practice"><i class="fa-solid fa-flag-checkered" aria-hidden="true"></i>Kết thúc</button>
        </div>
      </div>`
    );
  }

  function finishPractice() {
    stopTimer();
    const times = {};
    let spent = 0;
    ctx.list.forEach((q) => {
      times[q.id] = qTimeSec(q.id);
      spent += times[q.id];
    });
    const attempt = buildAttempt({
      type: "practice",
      title: ctx.meta.aiQuiz ? `Quiz AI: ${ctx.meta.topic}` : `Luyện tập: ${ctx.meta.topic} (Lớp ${ctx.meta.grade})`,
      practice: ctx.meta,
      list: ctx.list,
      answers: ctx.answers,
      durationSec: 0,
      spentSec: spent,
      times,
    });
    Store.add(attempt);
    closeModal();
    toast("Đã lưu kết quả luyện tập vào lịch sử", "success");
    location.hash = `#/result/${attempt.id}`;
  }

  /* =====================================================================
   * Exams list + settings
   * ===================================================================== */
  function renderExams() {
    const history = Store.list();
    const kinds = [["all", "Tất cả"], ["mock", "Đề thi thử"], ["real", "Đề minh họa chính thức"]];
    const subjects = [["all", "Mọi môn"], ["Physics", "Vật lí"], ["Chemistry", "Hóa học"], ["Biology", "Sinh học"], ["Mixed", "Tổng hợp"]];
    const chip = (active) => `rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${active ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-indigo-300"}`;

    const exams = mockExams.filter(
      (e) => (examFilter.kind === "all" || e.kind === examFilter.kind) && (examFilter.subject === "all" || e.subject === examFilter.subject)
    );

    const resume =
      session && examById.get(session.examId)
        ? `<div class="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
            <p class="text-sm text-indigo-900"><i class="fa-solid fa-hourglass-half mr-1.5" aria-hidden="true"></i>Bạn đang làm dở <strong>${esc(examById.get(session.examId).title)}</strong>.</p>
            <a href="#/take" class="btn btn-primary btn-sm">Tiếp tục làm bài</a></div>`
        : "";

    const cards = exams.length
      ? exams
          .map((e) => {
            const subj = SUBJECTS[e.subject];
            const qs = e.questions.map((id) => bankById.get(id)).filter(Boolean);
            const counts = Object.entries(qs.reduce((acc, q) => ((acc[q.type] = (acc[q.type] || 0) + 1), acc), {}))
              .sort((a, b) => QUESTION_TYPES[a[0]].order - QUESTION_TYPES[b[0]].order)
              .map(([t, n]) => `<span class="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">${QUESTION_TYPES[t].label} · ${n}</span>`)
              .join("");
            const last = history.find((h) => h.examId === e.examId);
            return `<article class="card card-hover flex flex-col p-5">
              <div class="flex items-center justify-between gap-2">
                <span class="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-bold ${subj ? subj.badge : "bg-indigo-100 text-indigo-700"}"><i class="fa-solid ${subj ? subj.icon : "fa-shapes"}" aria-hidden="true"></i>${subj ? subj.label : "Tổng hợp"}</span>
                <span class="text-xs font-bold uppercase tracking-wide ${e.kind === "real" ? "text-rose-600" : "text-slate-500"}">${e.kind === "real" ? "Đề minh họa" : "Đề thi thử"}</span>
              </div>
              <h3 class="mt-3 text-lg font-bold leading-snug text-slate-900">${esc(e.title)}</h3>
              <p class="mt-2 flex items-center gap-4 text-sm text-slate-500"><span><i class="fa-regular fa-clipboard mr-1" aria-hidden="true"></i>${qs.length} câu</span><span><i class="fa-regular fa-clock mr-1" aria-hidden="true"></i>${e.defaultTimeMinutes} phút</span></p>
              <div class="mt-3 flex flex-wrap gap-1.5">${counts}</div>
              <div class="mt-5 flex items-center justify-between gap-3 pt-1">
                <span class="text-xs text-slate-500">${last ? `Gần nhất: <strong class="${scoreTone(last.score)}">${fmtScore(last.score)}/10</strong>` : "Chưa làm"}</span>
                <div class="flex gap-2"><button type="button" class="btn btn-secondary btn-sm" data-action="export-exam" data-exam="${e.examId}"><i class="fa-solid fa-file-export text-xs" aria-hidden="true"></i>Xuất đề</button><button type="button" class="btn btn-primary btn-sm" data-action="open-exam-settings" data-exam="${e.examId}">Bắt đầu<i class="fa-solid fa-arrow-right text-xs" aria-hidden="true"></i></button></div>
              </div>
            </article>`;
          })
          .join("")
      : `<p class="col-span-full rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">Không có đề thi phù hợp bộ lọc.</p>`;

    view.innerHTML = `
    <section class="mx-auto max-w-6xl px-4 pt-10">
      <h1 class="text-3xl font-extrabold tracking-tight text-slate-900">Đề thi</h1>
      <p class="mt-1.5 text-slate-600">Đề thi hiển thị toàn bộ câu hỏi theo dạng cuộn dọc như đề giấy, bạn tự đặt thời gian làm bài.</p>
      <div class="mt-6">${resume}</div>
      <div class="flex flex-wrap gap-x-6 gap-y-3" role="group" aria-label="Bộ lọc đề thi">
        <div class="flex flex-wrap gap-2">${kinds.map(([k, l]) => `<button type="button" data-action="filter-exam" data-filter="kind" data-value="${k}" aria-pressed="${examFilter.kind === k}" class="${chip(examFilter.kind === k)}">${l}</button>`).join("")}</div>
        <div class="flex flex-wrap gap-2">${subjects.map(([k, l]) => `<button type="button" data-action="filter-exam" data-filter="subject" data-value="${k}" aria-pressed="${examFilter.subject === k}" class="${chip(examFilter.subject === k)}">${l}</button>`).join("")}</div>
      </div>
      <div class="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">${cards}</div>
    </section>`;
  }

  function openExamSettings(examId) {
    const exam = examById.get(examId);
    if (!exam) return;
    const presets = [...new Set([45, 50, 90, exam.defaultTimeMinutes])].sort((a, b) => a - b);
    openModal(
      `<div class="p-6 sm:p-7">
        ${modalHeader("Cài đặt bài thi", esc(exam.title))}
        <div class="mt-5 flex gap-4 rounded-xl bg-slate-50 p-3.5 text-sm text-slate-600">
          <span><i class="fa-regular fa-clipboard mr-1.5 text-slate-400" aria-hidden="true"></i><strong class="text-slate-900">${exam.questions.length}</strong> câu hỏi</span>
          <span><i class="fa-regular fa-clock mr-1.5 text-slate-400" aria-hidden="true"></i>Mặc định <strong class="text-slate-900">${exam.defaultTimeMinutes}</strong> phút</span>
        </div>
        <fieldset class="mt-5">
          <legend class="text-sm font-bold text-slate-900">Thời gian làm bài</legend>
          <div class="mt-2.5 flex flex-wrap gap-2">${presets
            .map((m) => `<button type="button" class="chip" data-action="pick-time" data-min="${m}" aria-pressed="${m === exam.defaultTimeMinutes}">${m} phút</button>`)
            .join("")}</div>
          <label for="custom-min" class="mt-4 block text-sm font-semibold text-slate-700">Hoặc nhập số phút tùy chỉnh (1 – 300)</label>
          <div class="relative mt-1.5"><input id="custom-min" type="number" inputmode="numeric" min="1" max="300" value="${exam.defaultTimeMinutes}" class="field pr-16" autofocus><span class="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">phút</span></div>
        </fieldset>
        <p class="mt-4 text-xs leading-relaxed text-slate-500"><i class="fa-solid fa-circle-info mr-1" aria-hidden="true"></i>Khi hết giờ, bài làm sẽ được nộp tự động. Có thể nộp sớm bất cứ lúc nào.</p>
        <div class="mt-6 flex justify-end gap-2.5">
          <button type="button" class="btn btn-ghost" data-action="close-modal">Hủy</button>
          <button type="button" class="btn btn-primary" data-action="start-exam" data-exam="${examId}"><i class="fa-solid fa-play" aria-hidden="true"></i>Bắt đầu làm bài</button>
        </div>
      </div>`
    );
  }

  function syncTimeChips() {
    const value = Number($("#custom-min")?.value);
    $$("[data-action='pick-time']").forEach((chip) => chip.setAttribute("aria-pressed", String(Number(chip.dataset.min) === value)));
  }

  function startExam(examId) {
    const minutes = Math.round(Number($("#custom-min")?.value));
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 300) {
      toast("Thời gian phải từ 1 đến 300 phút", "error");
      $("#custom-min")?.focus();
      return;
    }
    const now = Date.now();
    session = { examId, startedAt: now, endsAt: now + minutes * 60000, durationSec: minutes * 60, answers: {} };
    saveSession();
    closeModal();
    if (location.hash === "#/take") route();
    else location.hash = "#/take";
  }

  /* =====================================================================
   * Exam engine (continuous vertical scroll)
   * ===================================================================== */
  function renderTake() {
    const exam = session && examById.get(session.examId);
    if (!exam) {
      clearSession();
      location.hash = "#/exams";
      return;
    }
    const list = orderQuestions(exam.questions);
    ctx = { mode: "exam", answers: session.answers, checked: {}, list };
    const user = Auth.user;

    const dots = (extra = "") =>
      list.map((q, i) => `<button type="button" class="nav-dot ${extra}" data-action="goto-q" data-q="${q.id}" data-nav-q="${q.id}" aria-label="Đến câu ${i + 1}">${i + 1}</button>`).join("");

    view.innerHTML = `
    <div class="exam-header sticky top-0 z-40">
      <div class="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <button type="button" data-action="exit-exam" class="flex h-10 w-10 flex-none items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Thoát khỏi bài thi"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button>
        <div class="min-w-0">
          <p class="truncate text-sm font-extrabold text-slate-900 sm:text-base">${esc(exam.title)}</p>
          <p class="text-xs text-slate-500">Đã làm <strong id="progress-text" class="text-slate-700">0/${list.length}</strong> câu</p>
        </div>
        <div class="ml-auto flex items-center gap-2 sm:gap-3">
          <div id="timer-pill" class="timer-pill" role="timer" aria-label="Thời gian còn lại"><i class="fa-regular fa-clock" aria-hidden="true"></i><span id="timer" class="timer text-lg">--:--</span></div>
          <button type="button" class="btn btn-primary" data-action="submit-exam"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i><span>Nộp bài</span></button>
        </div>
      </div>
      <div class="h-1 bg-slate-200"><div id="progress-bar" class="h-full bg-indigo-500 transition-all" style="width:0%"></div></div>
      <div class="flex gap-2 overflow-x-auto px-4 py-2 lg:hidden" aria-label="Danh sách câu hỏi">${dots()}</div>
    </div>

    <div class="mx-auto grid max-w-6xl items-start gap-6 px-4 py-6 lg:grid-cols-[1fr_17rem]">
      <article class="paper" aria-label="Đề thi">
        <header class="text-center">
          <h1 class="text-xl font-extrabold uppercase tracking-wide text-slate-900 sm:text-2xl">${esc(exam.title)}</h1>
          <p class="mt-2 text-sm text-slate-600">Thời gian làm bài: <strong>${Math.round(session.durationSec / 60)} phút</strong> · Số câu: <strong>${list.length}</strong></p>
          <p class="mt-4 text-left text-sm text-slate-700">Họ và tên thí sinh: ${user ? `<strong>${esc(user.name)}</strong>` : '<span class="inline-block w-56 border-b border-dotted border-slate-400">&nbsp;</span>'}</p>
        </header>
        <div id="exam-questions">${cardsHtml(list)}</div>
        <div class="mt-8 flex flex-col items-center gap-3 border-t-2 border-slate-900 pt-6 text-center">
          <p class="text-sm font-semibold uppercase tracking-wide text-slate-500">— Hết —</p>
          <button type="button" class="btn btn-primary btn-lg" data-action="submit-exam"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i>Nộp bài</button>
        </div>
      </article>

      <aside class="hidden lg:sticky lg:top-28 lg:block" aria-label="Điều hướng câu hỏi">
        <div class="card p-4">
          <h2 class="text-sm font-extrabold text-slate-900">Danh sách câu hỏi</h2>
          <div class="mt-3 grid grid-cols-5 gap-2">${dots()}</div>
          <div class="mt-4 flex items-center gap-4 text-xs text-slate-500"><span class="flex items-center gap-1.5"><span class="h-3 w-3 rounded bg-indigo-600"></span>Đã làm</span><span class="flex items-center gap-1.5"><span class="h-3 w-3 rounded border border-slate-300 bg-white"></span>Chưa làm</span></div>
        </div>
      </aside>
    </div>`;

    updateExamProgress();
    startTimer();
  }

  function updateExamProgress() {
    const answered = ctx.list.filter((q) => isAnswered(q, ctx.answers[q.id])).length;
    $("#progress-text").textContent = `${answered}/${ctx.list.length}`;
    $("#progress-bar").style.width = `${(answered / ctx.list.length) * 100}%`;
    $$("[data-nav-q]").forEach((el) => el.classList.toggle("answered", isAnswered(bankById.get(el.dataset.navQ), ctx.answers[el.dataset.navQ])));
  }

  function startTimer() {
    stopTimer();
    let warned5 = false;
    let warned1 = false;
    const tick = () => {
      if (!session) return stopTimer();
      const remaining = Math.max(0, Math.round((session.endsAt - Date.now()) / 1000));
      const timer = $("#timer");
      const pill = $("#timer-pill");
      if (!timer || !pill) return stopTimer();
      timer.textContent = fmtClock(remaining);
      pill.classList.toggle("warn", remaining <= 300 && remaining > 60);
      pill.classList.toggle("danger", remaining <= 60);
      if (remaining <= 300 && remaining > 60 && !warned5 && session.durationSec > 600) {
        warned5 = true;
        toast("Còn 5 phút", "info");
      }
      if (remaining <= 60 && !warned1 && session.durationSec > 120) {
        warned1 = true;
        toast("Còn 1 phút!", "error");
      }
      if (remaining === 0) finishExam(true);
    };
    tick();
    timerId = setInterval(tick, 1000);
  }

  function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }

  function requestSubmit() {
    const unanswered = ctx.list.filter((q) => !isAnswered(q, ctx.answers[q.id])).length;
    openModal(
      `<div class="p-6 sm:p-7">
        ${modalHeader("Nộp bài?")}
        <p class="mt-3 text-slate-600">${unanswered ? `Bạn còn <strong class="text-rose-600">${unanswered}</strong> câu chưa trả lời. ` : "Bạn đã trả lời tất cả các câu. "}Sau khi nộp, bạn sẽ không thể chỉnh sửa bài làm.</p>
        <div class="mt-6 flex justify-end gap-2.5"><button type="button" class="btn btn-ghost" data-action="close-modal" autofocus>Làm tiếp</button><button type="button" class="btn btn-primary" data-action="confirm-submit"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i>Nộp bài</button></div>
      </div>`
    );
  }

  function finishExam(auto = false) {
    if (!session) return;
    stopTimer();
    const exam = examById.get(session.examId);
    const spent = Math.min(session.durationSec, Math.round((Date.now() - session.startedAt) / 1000));
    const attempt = buildAttempt({
      type: "exam",
      title: exam.title,
      examId: exam.examId,
      list: ctx.list,
      answers: ctx.answers,
      durationSec: session.durationSec,
      spentSec: auto ? session.durationSec : spent,
    });
    Store.add(attempt);
    clearSession();
    closeModal();
    if (auto) toast("Hết giờ! Bài làm đã được nộp tự động.", "info");
    location.hash = `#/result/${attempt.id}`;
  }

  function confirmExit() {
    openModal(
      `<div class="p-6 sm:p-7">
        ${modalHeader("Thoát khỏi bài thi?")}
        <p class="mt-3 text-slate-600">Bài làm hiện tại sẽ bị hủy và <strong>không được lưu</strong>. Bạn có thể nộp bài để xem kết quả.</p>
        <div class="mt-6 flex justify-end gap-2.5"><button type="button" class="btn btn-ghost" data-action="close-modal" autofocus>Ở lại</button><button type="button" class="btn btn-danger" data-action="discard-exam">Hủy bài làm</button></div>
      </div>`
    );
  }

  /* =====================================================================
   * Result + review
   * ===================================================================== */
  function topicBreakdown(list, answers) {
    const map = new Map();
    list.forEach((q) => {
      const key = `${q.aiQuiz || ""}|${q.subject}|${q.grade}|${q.topic}`;
      const row = map.get(key) || { subject: q.subject, grade: q.grade, topic: q.topic, aiQuiz: q.aiQuiz, sum: 0, n: 0 };
      row.sum += gradeQuestion(q, answers[q.id]).fraction;
      row.n += 1;
      map.set(key, row);
    });
    return [...map.values()].map((r) => ({ ...r, accuracy: (r.sum / r.n) * 100 })).sort((a, b) => a.accuracy - b.accuracy);
  }

  function renderResult(id) {
    const attempt = Store.get(id);
    if (!attempt) return renderNotFound("Không tìm thấy kết quả này. Có thể bạn đã đăng nhập/đăng xuất hoặc xóa lịch sử.");

    const list = orderQuestions(attempt.questionIds);
    ctx = { mode: "review", answers: attempt.answers, checked: {}, list, filter: "all", times: attempt.times || {} };
    const breakdown = topicBreakdown(list, attempt.answers);
    const weak = breakdown.filter((r) => r.accuracy < 60);
    const weakest = breakdown.find((r) => r.accuracy < 100);

    const C = 2 * Math.PI * 54;
    const ringColor = attempt.score >= 8 ? "#10b981" : attempt.score >= 5 ? "#f59e0b" : "#f43f5e";
    const verdict = attempt.score >= 8 ? "Xuất sắc! Bạn nắm kiến thức rất tốt." : attempt.score >= 5 ? "Khá ổn, hãy củng cố thêm các chuyên đề còn yếu." : "Đừng nản! Hãy luyện lại các chuyên đề bên dưới.";
    const skipped = list.filter((q) => !gradeQuestion(q, attempt.answers[q.id]).answered).length;

    const topicRows = breakdown
      .map((r) => {
        const s = subjOf(r.subject);
        const tone = r.accuracy >= 80 ? "bg-emerald-500" : r.accuracy >= 60 ? "bg-amber-500" : "bg-rose-500";
        return `<li class="py-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="min-w-0 text-sm font-semibold text-slate-900"><span class="mr-1.5 rounded px-1.5 py-0.5 text-xs font-bold ${s.badge}">${s.label} ${r.grade}</span>${esc(r.topic)}
              ${r.accuracy < 60 ? '<span class="ml-1.5 rounded bg-rose-100 px-1.5 py-0.5 text-xs font-bold text-rose-700">Cần tập trung</span>' : ""}</p>
            <span class="text-sm font-bold text-slate-700">${fmtPercent(r.accuracy)}</span>
          </div>
          <div class="mt-2 flex items-center gap-3"><div class="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div class="h-full rounded-full ${tone}" style="width:${r.accuracy}%"></div></div>
            <a href="${topicHref(r)}" class="text-xs font-bold text-indigo-600 hover:underline">Luyện tập</a></div>
        </li>`;
      })
      .join("");

    view.innerHTML = `
    <section class="mx-auto max-w-4xl px-4 pt-10">
      <p class="text-sm font-bold uppercase tracking-wide text-indigo-600">${attempt.type === "exam" ? "Kết quả bài thi" : "Kết quả luyện tập"}</p>
      <h1 class="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">${esc(attempt.title)}</h1>
      <p class="mt-1 text-sm text-slate-500">${fmtDate(attempt.createdAt)}${attempt.spentSec ? ` · Thời gian làm: ${fmtDuration(attempt.spentSec)}` : ""}</p>

      <div class="card mt-6 grid items-center gap-6 p-6 sm:grid-cols-[auto_1fr] sm:p-8">
        <div class="relative mx-auto h-40 w-40">
          <svg viewBox="0 0 120 120" class="h-full w-full -rotate-90" role="img" aria-label="Điểm ${fmtScore(attempt.score)} trên 10">
            <circle cx="60" cy="60" r="54" fill="none" stroke-width="10" class="ring-bg"></circle>
            <circle id="score-ring" cx="60" cy="60" r="54" fill="none" stroke-width="10" stroke-linecap="round" stroke="${ringColor}" class="ring-fg" stroke-dasharray="${C}" stroke-dashoffset="${C}"></circle>
          </svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center"><span class="text-4xl font-extrabold ${scoreTone(attempt.score)}">${fmtScore(attempt.score)}</span><span class="text-xs font-semibold text-slate-500">trên thang 10</span></div>
        </div>
        <div>
          <p class="text-lg font-bold text-slate-900">${verdict}</p>
          <dl class="mt-4 grid grid-cols-3 gap-3">
            <div class="rounded-xl bg-slate-50 p-3"><dt class="text-xs font-semibold text-slate-500">Đúng hoàn toàn</dt><dd class="mt-0.5 text-xl font-extrabold text-slate-900">${attempt.correct}/${attempt.total}</dd></div>
            <div class="rounded-xl bg-slate-50 p-3"><dt class="text-xs font-semibold text-slate-500">Độ chính xác</dt><dd class="mt-0.5 text-xl font-extrabold text-slate-900">${fmtPercent(attempt.accuracy)}</dd></div>
            <div class="rounded-xl bg-slate-50 p-3"><dt class="text-xs font-semibold text-slate-500">Bỏ trống</dt><dd class="mt-0.5 text-xl font-extrabold text-slate-900">${skipped}</dd></div>
          </dl>
          <div class="mt-5 flex flex-wrap gap-2">
            ${attempt.type === "exam" && attempt.examId ? `<button type="button" class="btn btn-primary" data-action="open-exam-settings" data-exam="${attempt.examId}"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i>Làm lại đề</button>` : attempt.practice ? `<a class="btn btn-primary" href="${attempt.practice.aiQuiz ? `#/ai-quiz/${attempt.practice.aiQuiz}` : practiceHref(attempt.practice.subject, attempt.practice.grade, attempt.practice.topic, attempt.practice)}"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i>Luyện lại</a>` : ""}
            ${weakest ? `<a href="${topicHref(weakest)}" class="btn btn-secondary"><i class="fa-solid fa-bullseye" aria-hidden="true"></i>Luyện chuyên đề yếu nhất</a>` : ""}
            <a href="#/history" class="btn btn-ghost">Lịch sử</a>
          </div>
        </div>
      </div>

      <div class="card mt-6 p-6">
        <h2 class="text-lg font-extrabold text-slate-900">Phân tích theo chuyên đề</h2>
        <p class="mt-1 text-sm text-slate-500">${weak.length ? `Bạn nên tập trung vào ${weak.length} chuyên đề có độ chính xác dưới 60%.` : "Không có chuyên đề nào dưới 60%. Tiếp tục phát huy!"}</p>
        <ul class="mt-3 divide-y divide-slate-100">${topicRows}</ul>
      </div>

      <div class="mt-10 flex flex-wrap items-end justify-between gap-3">
        <div><h2 class="text-2xl font-extrabold tracking-tight text-slate-900">Xem lại bài làm</h2><p class="text-sm text-slate-500">Bấm “Hỏi AI lý do” dưới mỗi câu để được giải thích thêm.</p></div>
        <div class="flex gap-2" role="group" aria-label="Lọc câu hỏi">
          ${[["all", "Tất cả"], ["wrong", "Chưa đúng"], ["right", "Đúng"]].map(([k, l]) => `<button type="button" data-action="filter-review" data-filter="${k}" aria-pressed="${k === "all"}" class="rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${k === "all" ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-indigo-300"}">${l}</button>`).join("")}
        </div>
      </div>
      <div id="review-list" class="mt-5 grid gap-4"></div>
    </section>`;

    paintReview("all");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const ring = $("#score-ring");
      if (ring) ring.style.strokeDashoffset = String(C * (1 - attempt.score / 10));
    }));
  }

  function paintReview(filter) {
    ctx.filter = filter;
    const items = ctx.list.filter((q) => {
      const f = gradeQuestion(q, ctx.answers[q.id]).fraction;
      return filter === "all" ? true : filter === "right" ? f === 1 : f < 1;
    });
    $("#review-list").innerHTML = items.length
      ? items.map((q) => cardHtml(q, ctx.list.indexOf(q) + 1)).join("")
      : `<p class="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">Không có câu nào trong mục này.</p>`;
    $$("[data-action='filter-review']").forEach((btn) => {
      const active = btn.dataset.filter === filter;
      btn.setAttribute("aria-pressed", String(active));
      btn.className = `rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${active ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-indigo-300"}`;
    });
  }

  /* =====================================================================
   * History dashboard
   * ===================================================================== */
  function renderHistory() {
    const list = Store.list();
    const user = Auth.user;
    const banner = user
      ? ""
      : `<div class="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600"><span><i class="fa-regular fa-circle-user mr-1.5 text-slate-400" aria-hidden="true"></i>Bạn đang dùng với tư cách khách. Đăng nhập để lưu lịch sử theo tài khoản.</span><button type="button" class="btn btn-primary btn-sm" data-action="open-auth" data-mode="login">Đăng nhập</button></div>`;

    if (!list.length) {
      view.innerHTML = `<section class="mx-auto max-w-4xl px-4 pt-10">
        <h1 class="text-3xl font-extrabold tracking-tight text-slate-900">Lịch sử làm bài</h1><div class="mt-6">${banner}</div>
        <div class="card flex flex-col items-center px-6 py-16 text-center">
          <span class="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-2xl text-indigo-600"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i></span>
          <h2 class="mt-4 text-xl font-bold text-slate-900">Chưa có lượt làm bài nào</h2>
          <p class="mt-1.5 max-w-sm text-slate-500">Hoàn thành một đề thi hoặc bài luyện tập, kết quả sẽ xuất hiện ở đây.</p>
          <div class="mt-6 flex flex-wrap justify-center gap-2"><a href="#/exams" class="btn btn-primary">Làm đề thi thử</a><a href="#/bank" class="btn btn-secondary">Luyện tập theo chuyên đề</a></div>
        </div></section>`;
      return;
    }

    const avg = (key) => list.reduce((s, a) => s + a[key], 0) / list.length;
    const best = Math.max(...list.map((a) => a.score));
    const recent = list.slice(0, 10).reverse();

    const stat = (label, value, icon) => `<div class="card p-4"><p class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><i class="fa-solid ${icon} text-indigo-500" aria-hidden="true"></i>${label}</p><p class="mt-1.5 text-2xl font-extrabold text-slate-900">${value}</p></div>`;

    const rows = list
      .map((a) => {
        const isExam = a.type === "exam";
        const again = isExam && a.examId && examById.get(a.examId)
          ? `<button type="button" class="btn btn-ghost btn-sm" data-action="open-exam-settings" data-exam="${a.examId}">Làm lại</button>`
          : a.practice ? `<a class="btn btn-ghost btn-sm" href="${a.practice.aiQuiz ? `#/ai-quiz/${a.practice.aiQuiz}` : practiceHref(a.practice.subject, a.practice.grade, a.practice.topic, a.practice)}">Làm lại</a>` : "";
        return `<li class="card flex flex-wrap items-center gap-4 p-4">
          <span class="flex h-11 w-11 flex-none items-center justify-center rounded-xl ${isExam ? "bg-indigo-100 text-indigo-700" : "bg-sky-100 text-sky-700"}"><i class="fa-solid ${isExam ? "fa-file-lines" : "fa-pen-to-square"}" aria-hidden="true"></i></span>
          <div class="min-w-0 flex-1 basis-56">
            <p class="truncate font-bold text-slate-900">${esc(a.title)}</p>
            <p class="text-xs text-slate-500">${isExam ? "Đề thi" : "Luyện tập"} · ${fmtDate(a.createdAt)} · ${a.correct}/${a.total} câu đúng</p>
            <div class="mt-2 flex items-center gap-2"><div class="h-1.5 w-40 max-w-full overflow-hidden rounded-full bg-slate-100"><div class="h-full rounded-full ${a.accuracy >= 80 ? "bg-emerald-500" : a.accuracy >= 50 ? "bg-amber-500" : "bg-rose-500"}" style="width:${a.accuracy}%"></div></div><span class="text-xs font-semibold text-slate-600">${fmtPercent(a.accuracy)}</span></div>
          </div>
          <p class="text-2xl font-extrabold ${scoreTone(a.score)}">${fmtScore(a.score)}<span class="text-sm font-semibold text-slate-400">/10</span></p>
          <div class="flex gap-1.5"><a href="#/result/${a.id}" class="btn btn-secondary btn-sm">Xem lại</a>${again}</div>
        </li>`;
      })
      .join("");

    view.innerHTML = `
    <section class="mx-auto max-w-4xl px-4 pt-10">
      <div class="flex flex-wrap items-end justify-between gap-3"><div><h1 class="text-3xl font-extrabold tracking-tight text-slate-900">Lịch sử làm bài</h1><p class="mt-1.5 text-slate-600">${list.length} lượt làm gần đây của bạn.</p></div>
        <button type="button" class="btn btn-ghost btn-sm text-rose-600 hover:bg-rose-50" data-action="clear-history"><i class="fa-regular fa-trash-can" aria-hidden="true"></i>Xóa lịch sử</button></div>
      <div class="mt-6">${banner}</div>
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        ${stat("Lượt làm", list.length, "fa-list-check")}${stat("Điểm trung bình", fmtScore(avg("score")), "fa-chart-line")}${stat("Chính xác TB", fmtPercent(avg("accuracy")), "fa-bullseye")}${stat("Điểm cao nhất", fmtScore(best), "fa-trophy")}
      </div>
      <div class="card mt-4 p-5">
        <h2 class="text-sm font-extrabold text-slate-900">Điểm ${recent.length} lượt gần nhất</h2>
        <div class="mt-4 flex h-32 items-end gap-2" role="img" aria-label="Biểu đồ điểm các lượt gần nhất">
          ${recent.map((a) => `<div class="flex h-full flex-1 flex-col items-center justify-end gap-1"><span class="text-[10px] font-bold text-slate-500">${fmtScore(a.score)}</span><div class="w-full max-w-10 rounded-t-md ${a.score >= 8 ? "bg-emerald-500" : a.score >= 5 ? "bg-amber-500" : "bg-rose-500"}" style="height:${Math.max(4, a.score * 10)}%"></div></div>`).join("")}
        </div>
      </div>
      <ul class="mt-6 grid gap-3">${rows}</ul>
    </section>`;
  }

  function renderNotFound(message = "Trang bạn tìm không tồn tại.") {
    view.innerHTML = `<section class="mx-auto max-w-xl px-4 pt-24 text-center">
      <span class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-2xl text-slate-500"><i class="fa-solid fa-compass" aria-hidden="true"></i></span>
      <h1 class="mt-5 text-2xl font-extrabold text-slate-900">Không tìm thấy nội dung</h1><p class="mt-2 text-slate-600">${esc(message)}</p>
      <a href="#/" class="btn btn-primary mt-6">Về trang chủ</a></section>`;
  }

  /* =====================================================================
   * AI tutor chat
   * ===================================================================== */
  let chat = null;

  function mdLite(text) {
    const lines = esc(text)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .split("\n");
    let out = "";
    let inList = false;
    for (const line of lines) {
      const m = line.match(/^\s*[-*]\s+(.*)/);
      if (m) {
        if (!inList) out += "<ul>";
        inList = true;
        out += `<li>${m[1]}</li>`;
      } else {
        if (inList) out += "</ul>";
        inList = false;
        if (line.trim()) out += `<p class="mb-1.5 last:mb-0">${line}</p>`;
      }
    }
    return inList ? out + "</ul>" : out;
  }

  function openAiChat(qid) {
    const q = bankById.get(qid);
    if (!q) return;
    const a = ctx.answers[qid];
    chat = {
      history: [],
      busy: false,
      messages: [{ role: "model", text: "Chào bạn! Mình là gia sư AI. Bạn muốn mình giải thích điều gì về câu hỏi này?" }],
      context: {
        subjectLabel: subjOf(q.subject).label,
        grade: q.grade,
        topic: q.topic,
        questionText: q.questionText,
        optionsText: q.type === "multiple_choice" ? Object.entries(q.options).map(([k, v]) => `${k}. ${v}`).join("\n") : q.type === "true_false" ? q.statements.map((s, i) => `${"abcdefgh"[i]}) ${s.text}`).join("\n") : q.type === "drag_drop" ? `Các ô: ${q.slots.map((s, i) => `${i + 1}) ${s.prompt}`).join("; ")}\nĐáp án cho trước: ${ddItems(q).map((it) => it.text).join("; ")}` : "",
        correctAnswerText: correctText(q),
        userAnswerText: answerText(q, a),
        explanation: q.explanation,
      },
    };
    const suggestions = ["Vì sao đáp án này đúng?", "Giải thích chi tiết từng bước", "Vì sao các đáp án khác sai?", "Cho mình ví dụ tương tự"];
    openModal(
      `<div class="flex h-[85vh] max-h-[40rem] flex-col sm:h-[36rem]">
        <div class="border-b border-slate-100 p-5 pb-4">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3"><span class="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i></span>
              <div><h2 id="modal-title" class="font-extrabold text-slate-900">Gia sư AI</h2><p class="text-xs text-slate-500">${subjOf(q.subject).label} · Lớp ${q.grade} · ${esc(q.topic)}</p></div></div>
            <button type="button" data-action="close-modal" class="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Đóng"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
          </div>
          <p class="mt-3 line-clamp-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">${esc(q.questionText)}</p>
        </div>
        <div id="chat-log" class="chat-scroll flex-1 space-y-3 overflow-y-auto p-5" aria-live="polite"></div>
        <div class="border-t border-slate-100 p-4">
          <div id="chat-suggestions" class="mb-3 flex gap-2 overflow-x-auto pb-1">${suggestions.map((s) => `<button type="button" data-action="chat-suggest" data-text="${esc(s)}" class="flex-none rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-700">${esc(s)}</button>`).join("")}</div>
          <form id="chat-form" class="flex items-end gap-2">
            <label for="chat-input" class="sr-only">Câu hỏi cho gia sư AI</label>
            <textarea id="chat-input" rows="1" class="field max-h-32 resize-none" placeholder="Nhập câu hỏi của bạn..." autofocus></textarea>
            <button type="submit" id="chat-send" class="btn btn-primary h-[2.9rem] w-12 flex-none !px-0" aria-label="Gửi"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i></button>
          </form>
        </div>
      </div>`,
      { size: "lg" }
    );
    paintChat();
  }

  function paintChat() {
    const log = $("#chat-log");
    if (!log || !chat) return;
    log.innerHTML =
      chat.messages
        .map((m) =>
          m.role === "user"
            ? `<div class="flex"><div class="bubble user">${esc(m.text).replace(/\n/g, "<br>")}</div></div>`
            : m.error
              ? `<div class="flex"><div class="bubble error"><i class="fa-solid fa-circle-exclamation mr-1.5" aria-hidden="true"></i>${esc(m.text)}</div></div>`
              : `<div class="flex"><div class="bubble model">${mdLite(m.text)}</div></div>`
        )
        .join("") +
      (chat.busy ? `<div class="flex"><div class="bubble model typing" aria-label="AI đang trả lời"><span></span><span></span><span></span></div></div>` : "");
    log.scrollTop = log.scrollHeight;
    const send = $("#chat-send");
    if (send) send.disabled = chat.busy;
  }

  async function sendChat(text) {
    text = String(text || "").trim();
    if (!text || !chat || chat.busy) return;
    chat.messages.push({ role: "user", text });
    chat.history.push({ role: "user", text });
    chat.busy = true;
    const input = $("#chat-input");
    if (input) input.value = "";
    paintChat();
    try {
      const reply = await AITutor.ask(chat.context, chat.history);
      chat.history.push({ role: "model", text: reply });
      chat.messages.push({ role: "model", text: reply });
    } catch (error) {
      chat.history.pop();
      chat.messages.push({ role: "model", text: AITutor.errorMessage(error), error: true });
    } finally {
      chat.busy = false;
      paintChat();
    }
  }

  /* =====================================================================
   * Router
   * ===================================================================== */
  function route() {
    stopTimer();
    closeModal();
    const [pathPart, queryPart = ""] = (location.hash || "#/").replace(/^#\/?/, "").split("?");
    const parts = pathPart.split("/").map((p) => decodeURIComponent(p));
    const params = new URLSearchParams(queryPart);
    const [name, ...rest] = parts;
    ddSel = null;
    const navKey = { "": "home", bank: "bank", practice: "bank", exams: "exams", take: "exams", result: "history", history: "history", "ai-quiz": "ai", "stats": "stats" }[name] || "";

    document.body.dataset.view = name || "home";
    $$("[data-nav]").forEach((a) => a.classList.toggle("is-active", a.dataset.nav === navKey));
    $("#mobile-menu").classList.add("hidden");
    $("#menu-toggle").setAttribute("aria-expanded", "false");

    const titles = { "": "LabLuyen – Luyện thi Lý, Hóa, Sinh THPT", bank: "Ngân hàng câu hỏi – LabLuyen", practice: "Luyện tập – LabLuyen", exams: "Đề thi – LabLuyen", take: "Đang làm bài – LabLuyen", result: "Kết quả – LabLuyen", history: "Lịch sử làm bài – LabLuyen", "ai-quiz": "Tạo quiz bằng AI – LabLuyen", stats: "Thống kê kiến thức – LabLuyen" };
    document.title = titles[name] || titles[""];
    if (name !== "take" && name !== "practice" && name !== "result") ctx = { mode: "none", answers: {}, checked: {}, list: [] };

    switch (name) {
      case "": renderHome(); break;
      case "bank": renderBank(rest[0]); break;
      case "practice": renderPractice(rest[0], rest[1], rest[2], params); break;
      case "exams": renderExams(); break;
      case "take": renderTake(); break;
      case "result": renderResult(rest[0]); break;
      case "history": renderHistory(); break;
      case "ai-quiz": case "stats":
        if (window.LabFeatures?.[name]) window.LabFeatures[name](rest, params);
        else renderNotFound();
        break;
      default: renderNotFound();
    }
    if (name !== "take") window.scrollTo(0, 0);
  }

  /* =====================================================================
   * Events
   * ===================================================================== */
  function setAnswer(target) {
    const qid = target.dataset.q;
    const q = bankById.get(qid);
    if (!q || (ctx.mode !== "exam" && ctx.mode !== "practice")) return;
    if (ctx.mode === "practice" && ctx.checked[qid]) return;

    if (q.type === "multiple_choice") ctx.answers[qid] = target.value;
    else if (q.type === "true_false") ctx.answers[qid] = { ...(ctx.answers[qid] || {}), [target.dataset.i]: target.value === "true" };
    else ctx.answers[qid] = target.value;

    afterAnswerChange();
  }

  function afterAnswerChange() {
    if (ctx.mode === "exam") {
      session.answers = ctx.answers;
      saveSession();
      updateExamProgress();
    } else if (ctx.mode === "practice") {
      paintPracticeChrome();
    }
  }

  const ddSlotOf = (qid, chip) => Object.entries(ctx.answers[qid] || {}).find(([, v]) => v === chip)?.[0];
  const ddEditable = (qid) => (ctx.mode === "exam" || ctx.mode === "practice") && !(ctx.mode === "practice" && ctx.checked[qid]);

  function ddCommit(qid, focusSelector) {
    refreshCard(qid);
    afterAnswerChange();
    if (focusSelector) $(`#card-${qid} ${focusSelector}`)?.focus();
  }

  function ddPlace(qid, chip, slot) {
    if (!bankById.get(qid) || !ddEditable(qid)) return;
    const ans = { ...(ctx.answers[qid] || {}) };
    const key = String(slot);
    const from = Object.keys(ans).find((k) => ans[k] === chip);
    if (from === key) {
      ddSel = null;
      return ddCommit(qid);
    }
    const displaced = ans[key];
    if (from !== undefined) {
      if (displaced) ans[from] = displaced;
      else delete ans[from];
    }
    ans[key] = chip;
    ctx.answers[qid] = ans;
    ddSel = null;
    ddCommit(qid, `[data-slot="${key}"]`);
  }

  function ddRemove(qid, chip) {
    if (!bankById.get(qid) || !ddEditable(qid)) return;
    const ans = { ...(ctx.answers[qid] || {}) };
    const from = Object.keys(ans).find((k) => ans[k] === chip);
    if (from === undefined) return;
    delete ans[from];
    if (Object.keys(ans).length) ctx.answers[qid] = ans;
    else delete ctx.answers[qid];
    ddSel = null;
    ddCommit(qid);
  }

  function ddSelect(qid, chip) {
    const prev = ddSel;
    ddSel = chip ? { qid, chip } : null;
    if (prev && prev.qid !== qid) refreshCard(prev.qid);
    refreshCard(qid);
    if (chip) $(`#card-${qid} [data-action="dd-chip"][data-chip="${chip}"]`)?.focus();
  }

  const ddSelectedFor = (qid) => (ddSel && ddSel.qid === qid ? ddSel.chip : null);

  function ddChipClick(el) {
    const { q: qid, chip } = el.dataset;
    const current = ddSelectedFor(qid);
    if (current === chip) return ddSelect(qid, null);
    const slot = ddSlotOf(qid, chip);
    if (current && slot !== undefined) return ddPlace(qid, current, slot);
    ddSelect(qid, chip);
  }

  function ddSlotClick(el) {
    const { q: qid, slot } = el.dataset;
    const current = ddSelectedFor(qid);
    if (current) ddPlace(qid, current, slot);
  }

  function ddBankClick(el) {
    const qid = el.dataset.q;
    const current = ddSelectedFor(qid);
    if (current && ddSlotOf(qid, current) !== undefined) ddRemove(qid, current);
  }

  const ddZoneFrom = (e) => e.target.closest?.(".dd-slot[data-slot], .dd-bank[data-q]");

  document.addEventListener("dragstart", (e) => {
    const chip = e.target.closest?.(".dd-chip[data-chip]");
    if (!chip) return;
    ddDrag = { qid: chip.dataset.q, chip: chip.dataset.chip };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", chip.dataset.chip);
    requestAnimationFrame(() => chip.classList.add("is-dragging"));
  });

  document.addEventListener("dragend", () => {
    ddDrag = null;
    $$(".dd-chip.is-dragging, .dd-slot.is-over, .dd-bank.is-over").forEach((n) => n.classList.remove("is-dragging", "is-over"));
  });

  document.addEventListener("dragover", (e) => {
    const zone = ddZoneFrom(e);
    if (!zone || !ddDrag || zone.dataset.q !== ddDrag.qid) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    zone.classList.add("is-over");
  });

  document.addEventListener("dragleave", (e) => {
    const zone = ddZoneFrom(e);
    if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove("is-over");
  });

  document.addEventListener("drop", (e) => {
    const zone = ddZoneFrom(e);
    if (!zone || !ddDrag || zone.dataset.q !== ddDrag.qid) return;
    e.preventDefault();
    const { qid, chip } = ddDrag;
    ddDrag = null;
    if (zone.classList.contains("dd-slot")) ddPlace(qid, chip, zone.dataset.slot);
    else ddRemove(qid, chip);
  });

  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.matches("input[data-setup]")) updateSetupSummary();
    else if (t.matches("input[data-q]") && t.type === "radio") setAnswer(t);
    else if (t.matches("[data-auth-tab]")) openAuth(t.value);
  });

  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.matches("input.sa-input[data-q]")) setAnswer(t);
    else if (t.id === "custom-min") syncTimeChips();
    else if (t.id === "chat-input") {
      t.style.height = "auto";
      t.style.height = `${Math.min(t.scrollHeight, 128)}px`;
    }
  });

  document.addEventListener("submit", (e) => {
    if (e.target.id === "auth-form") {
      e.preventDefault();
      handleAuthSubmit(e.target);
    } else if (e.target.id === "chat-form") {
      e.preventDefault();
      sendChat($("#chat-input").value);
      $("#chat-input").style.height = "auto";
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalRoot.firstChild) {
      closeModal();
      return;
    }
    if (e.key === "Tab" && modalRoot.firstChild) {
      const focusable = $$('a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])', modalRoot);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      return;
    }
    if ((e.key === "Enter" || e.key === " ") && e.target.matches?.(".dd-chip[data-action], .dd-slot[data-action]")) {
      e.preventDefault();
      e.target.click();
      return;
    }
    if (e.target.id === "chat-input" && e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      $("#chat-form").requestSubmit();
    } else if (e.target.id === "custom-min" && e.key === "Enter") {
      e.preventDefault();
      $('[data-action="start-exam"]')?.click();
    } else if (e.target.classList?.contains("sa-input") && e.key === "Enter" && ctx.mode === "practice") {
      e.preventDefault();
      checkQuestion(e.target.dataset.q);
    }
  });

  document.addEventListener("click", (e) => {
    if (e.target.matches("[data-modal-backdrop]")) return closeModal();

    const menu = $("#user-menu");
    if (menu && !e.target.closest("[data-user-menu]")) menu.classList.add("hidden");

    const el = e.target.closest("[data-action]");
    if (!el) return;
    const { action } = el.dataset;

    switch (action) {
      case "close-modal": closeModal(); break;
      case "open-auth": openAuth(el.dataset.mode); break;
      case "google-login": handleGoogleLogin(); break;
      case "forgot-password": handleForgotPassword(); break;
      case "toggle-password": {
        const input = $("#auth-password");
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        el.innerHTML = `<i class="fa-regular ${show ? "fa-eye-slash" : "fa-eye"}" aria-hidden="true"></i>`;
        break;
      }
      case "toggle-user-menu": {
        const m = $("#user-menu");
        m.classList.toggle("hidden");
        el.setAttribute("aria-expanded", String(!m.classList.contains("hidden")));
        break;
      }
      case "logout":
        Auth.signOut().then(() => toast("Đã đăng xuất", "success")).catch((err) => toast(Auth.errorMessage(err), "error"));
        break;
      case "check-question": checkQuestion(el.dataset.q); break;
      case "retry-question": retryQuestion(el.dataset.q); break;
      case "reset-practice": resetPractice(); break;
      case "open-practice-setup": openPracticeSetup(el.dataset.subject, el.dataset.grade, el.dataset.topic); break;
      case "setup-toggle-types": toggleSetupTypes(); break;
      case "start-practice": startPractice(el); break;
      case "prev-q": gotoQuestion(ctx.current - 1); break;
      case "next-q": gotoQuestion(ctx.current + 1); break;
      case "goto-practice-q": gotoQuestion(Number(el.dataset.i)); break;
      case "toggle-flag": toggleFlag(); break;
      case "next-flagged": gotoNextFlagged(); break;
      case "finish-practice": requestFinishPractice(); break;
      case "confirm-finish-practice": finishPractice(); break;
      case "review-flagged": closeModal(); gotoNextFlagged(); break;
      case "dd-chip": ddChipClick(el); break;
      case "dd-slot": ddSlotClick(el); break;
      case "dd-bank": ddBankClick(el); break;
      case "dd-remove": ddRemove(el.dataset.q, el.dataset.chip); break;
      case "ask-ai": openAiChat(el.dataset.q); break;
      case "chat-suggest": sendChat(el.dataset.text); break;
      case "open-exam-settings": openExamSettings(el.dataset.exam); break;
      case "export-exam": {
        const ex = examById.get(el.dataset.exam);
        if (ex) window.LabExport.open({ title: ex.title, questions: orderQuestions(ex.questions), minutes: ex.defaultTimeMinutes });
        break;
      }
      case "pick-time":
        $("#custom-min").value = el.dataset.min;
        syncTimeChips();
        break;
      case "start-exam": startExam(el.dataset.exam); break;
      case "filter-exam":
        examFilter[el.dataset.filter] = el.dataset.value;
        renderExams();
        break;
      case "goto-q": $(`#card-${el.dataset.q}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); break;
      case "submit-exam": requestSubmit(); break;
      case "confirm-submit": finishExam(false); break;
      case "exit-exam": confirmExit(); break;
      case "discard-exam":
        clearSession();
        closeModal();
        location.hash = "#/exams";
        break;
      case "filter-review": paintReview(el.dataset.filter); break;
      case "clear-history":
        openModal(`<div class="p-6 sm:p-7">${modalHeader("Xóa toàn bộ lịch sử?")}<p class="mt-3 text-slate-600">Hành động này không thể hoàn tác.</p>
          <div class="mt-6 flex justify-end gap-2.5"><button type="button" class="btn btn-ghost" data-action="close-modal" autofocus>Hủy</button><button type="button" class="btn btn-danger" data-action="confirm-clear-history">Xóa lịch sử</button></div></div>`);
        break;
      case "confirm-clear-history":
        Store.clear();
        closeModal();
        renderHistory();
        toast("Đã xóa lịch sử", "success");
        break;
    }
  });

  $("#menu-toggle").addEventListener("click", () => {
    const menu = $("#mobile-menu");
    const open = menu.classList.toggle("hidden") === false;
    $("#menu-toggle").setAttribute("aria-expanded", String(open));
  });

  window.addEventListener("hashchange", route);

  window.LabApp = {
    $, $$, view, esc, fmtDate, fmtPercent, fmtScore, toast, openModal, closeModal, Store, bankById, gradeQuestion,
    subjOf, startPracticeSession, renderNotFound, route,
  };
  window.dispatchEvent(new Event("labapp:ready"));

  /* =====================================================================
   * Boot
   * ===================================================================== */
  renderAuthArea();
  Auth.onChange(() => {
    renderAuthArea();
    const name = (location.hash || "#/").replace(/^#\/?/, "").split("/")[0];
    if (name === "history" || name === "exams") route();
  });
  Auth.init();
  route();
})();
