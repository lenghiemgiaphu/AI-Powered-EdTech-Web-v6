/* AI quiz generator (#/ai-quiz) and knowledge statistics (#/stats). Loaded after app.js. */
(() => {
  const App = window.LabApp;
  if (!App) return;
  const { $, $$, view, esc, fmtDate, toast, Store, bankById, gradeQuestion, subjOf, startPracticeSession, renderNotFound } = App;

  const uid = () => (typeof Auth !== "undefined" && Auth.user ? Auth.user.uid : "guest");
  const read = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };
  const pct = (x) => `${Math.round(x * 100)}%`;
  const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

  const SUBJECT_OPTIONS = [
    ["Physics", "Vật lí"],
    ["Chemistry", "Hóa học"],
    ["Biology", "Sinh học"],
    ["General", "Môn khác / Tổng hợp"],
  ];
  const TYPE_OPTIONS = [
    ["multiple_choice", "Trắc nghiệm"],
    ["true_false", "Đúng/Sai"],
    ["short_answer", "Trả lời ngắn"],
  ];

  /* ---------------------------------------------------------------
   * Saved AI quizzes (per account, kept in this browser)
   * ------------------------------------------------------------- */
  const QuizStore = {
    key: () => `labluyen_aiquiz_${uid()}`,
    list: () => read(QuizStore.key(), []),
    get: (id) => QuizStore.list().find((q) => q.id === id),
    add(quiz) {
      const list = [quiz, ...QuizStore.list()].slice(0, 20);
      if (!write(QuizStore.key(), list)) throw new Error("Bộ nhớ trình duyệt đã đầy. Hãy xóa bớt quiz cũ.");
    },
    remove(id) {
      write(QuizStore.key(), QuizStore.list().filter((q) => q.id !== id));
    },
  };

  const registerQuiz = (quiz) => quiz.questions.forEach((q) => bankById.set(q.id, q));
  const registerSaved = () => QuizStore.list().forEach(registerQuiz);
  registerSaved();

  /* ---------------------------------------------------------------
   * Class results store (imported from students' exported files)
   * ------------------------------------------------------------- */
  const ClassStore = {
    key: () => `labluyen_class_${uid()}`,
    load: () => read(ClassStore.key(), { students: [], questions: {} }),
    save: (data) => write(ClassStore.key(), data),
    clear: () => localStorage.removeItem(ClassStore.key()),
  };
  const registerClass = () => {
    const { questions } = ClassStore.load();
    Object.values(questions).forEach((q) => !bankById.has(q.id) && bankById.set(q.id, q));
  };
  registerClass();

  /* ===============================================================
   * AI quiz generator
   * ============================================================= */
  const SOURCES = [
    { key: "file", label: "Tải tệp", icon: "fa-file-arrow-up" },
    { key: "link", label: "Link bài báo", icon: "fa-link" },
    { key: "youtube", label: "Video YouTube", icon: "fa-brands fa-youtube" },
    { key: "text", label: "Dán văn bản", icon: "fa-align-left" },
  ];

  const sourcePanel = (key) => {
    if (key === "file")
      return `<label for="ai-file" id="ai-drop" class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center transition hover:border-indigo-400 hover:bg-indigo-50/50">
        <span class="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-xl text-indigo-600"><i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i></span>
        <span class="font-bold text-slate-900" id="ai-file-name">Chọn hoặc kéo thả tệp vào đây</span>
        <span class="text-sm text-slate-500">PDF, Word (.docx), PowerPoint (.pptx) · tối đa 4 MB</span>
        <input id="ai-file" type="file" class="sr-only" accept=".pdf,.docx,.pptx">
      </label>`;
    if (key === "link")
      return `<label for="ai-url" class="mb-1.5 block text-sm font-semibold text-slate-700">Đường dẫn bài báo</label>
        <input id="ai-url" type="url" class="field" placeholder="https://vnexpress.net/…" autocomplete="off">
        <p class="mt-2 text-sm text-slate-500">Hệ thống sẽ đọc nội dung chính của bài. Một số trang yêu cầu đăng nhập sẽ không đọc được.</p>`;
    if (key === "youtube")
      return `<label for="ai-url" class="mb-1.5 block text-sm font-semibold text-slate-700">Đường dẫn video YouTube</label>
        <input id="ai-url" type="url" class="field" placeholder="https://www.youtube.com/watch?v=…" autocomplete="off">
        <p class="mt-2 text-sm text-slate-500">AI xem video công khai và soạn câu hỏi từ nội dung bài giảng. Video dài sẽ lâu hơn.</p>`;
    return `<label for="ai-text" class="mb-1.5 block text-sm font-semibold text-slate-700">Nội dung cần tạo quiz</label>
      <textarea id="ai-text" rows="8" class="field" placeholder="Dán nội dung bài học, đoạn trích sách giáo khoa… (tối thiểu 200 ký tự)"></textarea>`;
  };

  function renderGenerator() {
    const saved = QuizStore.list();
    let source = "file";

    view.innerHTML = `
    <section class="mx-auto max-w-4xl px-4 pb-16 pt-10">
      <nav aria-label="Breadcrumb" class="text-sm text-slate-500"><a href="#/" class="hover:text-indigo-600">Trang chủ</a> <span class="mx-1">/</span> <span class="font-semibold text-slate-700">Tạo quiz bằng AI</span></nav>
      <div class="mt-3 flex items-center gap-3">
        <h1 class="text-3xl font-extrabold tracking-tight text-slate-900">Tạo quiz bằng AI</h1>
        <span class="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-extrabold uppercase text-emerald-700">Mới</span>
      </div>
      <p class="mt-1.5 text-slate-600">Đưa tài liệu vào, AI sẽ tóm tắt nội dung và soạn bộ câu hỏi trắc nghiệm kèm lời giải, phân loại theo chủ đề.</p>

      <form id="ai-form" class="card mt-6 p-5 sm:p-6" novalidate>
        <div role="tablist" aria-label="Nguồn tài liệu" class="flex flex-wrap gap-2" id="ai-tabs">
          ${SOURCES.map(
            (s) => `<button type="button" role="tab" data-source="${s.key}" class="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition"><i class="fa-solid ${s.icon}" aria-hidden="true"></i>${s.label}</button>`,
          ).join("")}
        </div>
        <div id="ai-panel" class="mt-5"></div>

        <fieldset class="mt-6 grid gap-4 border-t border-slate-200 pt-5 sm:grid-cols-2">
          <legend class="sr-only">Tùy chọn quiz</legend>
          <div><label for="ai-subject" class="mb-1.5 block text-sm font-semibold text-slate-700">Môn học</label>
            <select id="ai-subject" class="field">${SUBJECT_OPTIONS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></div>
          <div><label for="ai-grade" class="mb-1.5 block text-sm font-semibold text-slate-700">Khối lớp</label>
            <select id="ai-grade" class="field"><option>10</option><option>11</option><option selected>12</option></select></div>
          <div><label for="ai-count" class="mb-1.5 block text-sm font-semibold text-slate-700">Số câu hỏi</label>
            <select id="ai-count" class="field">${[5, 10, 15, 20].map((n) => `<option ${n === 10 ? "selected" : ""}>${n}</option>`).join("")}</select></div>
          <div><label for="ai-diff" class="mb-1.5 block text-sm font-semibold text-slate-700">Độ khó</label>
            <select id="ai-diff" class="field"><option value="mixed">Trộn đều</option><option value="easy">Dễ (nhận biết)</option><option value="medium">Trung bình (thông hiểu)</option><option value="hard">Khó (vận dụng)</option></select></div>
          <div class="sm:col-span-2">
            <span class="mb-1.5 block text-sm font-semibold text-slate-700">Dạng câu hỏi</span>
            <div class="flex flex-wrap gap-3">${TYPE_OPTIONS.map(
              ([v, l]) => `<label class="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-50 px-3.5 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"><input type="checkbox" name="types" value="${v}" ${v === "short_answer" ? "" : "checked"} class="h-4 w-4 accent-indigo-600">${l}</label>`,
            ).join("")}</div>
          </div>
        </fieldset>

        <p id="ai-error" role="alert" class="mt-5 hidden rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700"></p>
        <div class="mt-6 flex flex-wrap items-center gap-4">
          <button type="submit" id="ai-submit" class="btn btn-primary btn-lg"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i><span>Tạo quiz</span></button>
          <p id="ai-progress" class="text-sm font-semibold text-slate-500" aria-live="polite"></p>
        </div>
      </form>

      <h2 class="mt-12 text-xl font-extrabold text-slate-900">Quiz đã tạo</h2>
      ${
        saved.length
          ? `<ul class="mt-4 grid gap-3">${saved
              .map(
                (q) => `<li><a href="#/ai-quiz/${q.id}" class="card card-hover flex items-center gap-4 p-4">
                  <span class="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-violet-100 text-violet-700"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i></span>
                  <span class="min-w-0"><span class="block truncate font-bold text-slate-900">${esc(q.title)}</span>
                  <span class="block truncate text-sm text-slate-500">${q.questions.length} câu · ${esc(q.sourceLabel)} · ${fmtDate(q.createdAt)}</span></span>
                  <i class="fa-solid fa-arrow-right ml-auto text-slate-300" aria-hidden="true"></i></a></li>`,
              )
              .join("")}</ul>`
          : `<p class="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-slate-500">Chưa có quiz nào. Hãy tải tài liệu đầu tiên của bạn lên.</p>`
      }
    </section>`;

    const panel = $("#ai-panel");
    const errorBox = $("#ai-error");
    const showError = (msg) => {
      errorBox.textContent = msg;
      errorBox.classList.toggle("hidden", !msg);
    };

    const paintSource = () => {
      $$("#ai-tabs [data-source]").forEach((b) => {
        const on = b.dataset.source === source;
        b.setAttribute("aria-selected", String(on));
        b.className = `inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${on ? "bg-indigo-600 text-white shadow-sm" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-indigo-300"}`;
      });
      panel.innerHTML = sourcePanel(source);
      showError("");
      const input = $("#ai-file");
      if (input) {
        const label = $("#ai-file-name");
        const drop = $("#ai-drop");
        input.addEventListener("change", () => {
          label.textContent = input.files[0] ? input.files[0].name : "Chọn hoặc kéo thả tệp vào đây";
        });
        ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("border-indigo-500"); }));
        ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("border-indigo-500")));
        drop.addEventListener("drop", (e) => {
          e.preventDefault();
          if (e.dataTransfer.files[0]) {
            input.files = e.dataTransfer.files;
            input.dispatchEvent(new Event("change"));
          }
        });
      }
    };
    $("#ai-tabs").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-source]");
      if (!btn) return;
      source = btn.dataset.source;
      paintSource();
    });
    paintSource();

    $("#ai-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      showError("");
      const body = new FormData();
      body.set("mode", source);

      if (source === "file") {
        const file = $("#ai-file").files[0];
        if (!file) return showError("Hãy chọn một tệp PDF, Word hoặc PowerPoint.");
        if (file.size > 4 * 1024 * 1024) return showError("Tệp vượt quá 4 MB. Hãy cắt bớt trang rồi thử lại.");
        if (!/\.(pdf|docx|pptx)$/i.test(file.name)) return showError("Chỉ hỗ trợ tệp PDF, .docx và .pptx.");
        body.set("file", file);
      } else if (source === "text") {
        const text = $("#ai-text").value.trim();
        if (text.length < 200) return showError("Nội dung quá ngắn. Hãy dán ít nhất 200 ký tự.");
        body.set("text", text);
      } else {
        const url = $("#ai-url").value.trim();
        if (!/^https?:\/\//i.test(url)) return showError("Hãy nhập đường dẫn bắt đầu bằng http:// hoặc https://");
        body.set("url", url);
      }

      const types = $$('input[name="types"]:checked').map((i) => i.value);
      if (!types.length) return showError("Hãy chọn ít nhất một dạng câu hỏi.");
      types.forEach((t) => body.append("types", t));
      body.set("subject", $("#ai-subject").value);
      body.set("grade", $("#ai-grade").value);
      body.set("count", $("#ai-count").value);
      body.set("difficulty", $("#ai-diff").value);

      const submit = $("#ai-submit");
      const progress = $("#ai-progress");
      const steps = ["Đang đọc tài liệu…", "Đang tóm tắt nội dung…", "Đang soạn câu hỏi…", "Đang kiểm tra đáp án…"];
      let step = 0;
      submit.disabled = true;
      submit.querySelector("i").className = "fa-solid fa-spinner fa-spin";
      progress.textContent = steps[0];
      const timer = setInterval(() => (progress.textContent = steps[Math.min(++step, steps.length - 1)]), 9000);
      const controller = new AbortController();
      const abort = setTimeout(() => controller.abort(), 115_000);

      try {
        const res = await fetch("/api/generate-quiz", { method: "POST", body, signal: controller.signal });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Không tạo được quiz. Vui lòng thử lại.");

        const id = `aq${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
        const quiz = {
          id,
          title: data.title,
          summary: data.summary,
          keyPoints: data.keyPoints,
          sourceLabel: data.sourceLabel,
          createdAt: Date.now(),
          questions: data.questions.map((q, i) => ({ ...q, id: `ai_${id}_${i + 1}`, aiQuiz: id })),
        };
        QuizStore.add(quiz);
        registerQuiz(quiz);
        toast(`Đã tạo ${quiz.questions.length} câu hỏi`, "success");
        location.hash = `#/ai-quiz/${id}`;
      } catch (err) {
        showError(err.name === "AbortError" ? "Quá thời gian chờ. Hãy thử tài liệu ngắn hơn." : err.message);
        submit.disabled = false;
        submit.querySelector("i").className = "fa-solid fa-wand-magic-sparkles";
        progress.textContent = "";
      } finally {
        clearInterval(timer);
        clearTimeout(abort);
      }
    });
  }

  function renderQuizDetail(id) {
    const quiz = QuizStore.get(id);
    if (!quiz) return renderNotFound("Không tìm thấy quiz này. Có thể nó đã bị xóa hoặc được tạo bằng tài khoản khác.");

    const topics = new Map();
    quiz.questions.forEach((q) => topics.set(q.topic, (topics.get(q.topic) || 0) + 1));

    view.innerHTML = `
    <section class="mx-auto max-w-4xl px-4 pb-16 pt-10">
      <nav aria-label="Breadcrumb" class="text-sm text-slate-500"><a href="#/ai-quiz" class="hover:text-indigo-600">Tạo quiz bằng AI</a> <span class="mx-1">/</span> <span class="font-semibold text-slate-700">${esc(clip(quiz.title, 50))}</span></nav>
      <h1 class="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">${esc(quiz.title)}</h1>
      <p class="mt-1.5 text-sm text-slate-500">${quiz.questions.length} câu · ${esc(quiz.sourceLabel)} · ${fmtDate(quiz.createdAt)}</p>
      <div class="mt-5 flex flex-wrap gap-3">
        <a href="#/ai-quiz/${id}/play" class="btn btn-primary btn-lg"><i class="fa-solid fa-play" aria-hidden="true"></i>Làm quiz</a>
        <button type="button" id="quiz-export" class="btn btn-secondary btn-lg"><i class="fa-solid fa-file-export" aria-hidden="true"></i>Xuất đề</button>
        <button type="button" id="quiz-delete" class="btn btn-secondary btn-lg"><i class="fa-regular fa-trash-can" aria-hidden="true"></i>Xóa quiz</button>
      </div>

      <div class="mt-8 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <article class="card p-6">
          <h2 class="flex items-center gap-2 font-extrabold text-slate-900"><i class="fa-solid fa-align-left text-indigo-600" aria-hidden="true"></i>Tóm tắt nội dung</h2>
          <p class="mt-3 leading-relaxed text-slate-700">${esc(quiz.summary)}</p>
          <h3 class="mt-5 font-bold text-slate-900">Ý chính cần nhớ</h3>
          <ul class="mt-2 grid gap-2">${quiz.keyPoints
            .map((k) => `<li class="flex gap-2.5 text-sm leading-relaxed text-slate-700"><i class="fa-solid fa-circle-check mt-0.5 flex-none text-emerald-500" aria-hidden="true"></i><span>${esc(k)}</span></li>`)
            .join("")}</ul>
        </article>
        <aside class="card p-6">
          <h2 class="flex items-center gap-2 font-extrabold text-slate-900"><i class="fa-solid fa-layer-group text-indigo-600" aria-hidden="true"></i>Chủ đề trong quiz</h2>
          <ul class="mt-3 grid gap-2">${[...topics]
            .map(
              ([t, n]) => `<li><a href="#/ai-quiz/${id}?topic=${encodeURIComponent(t)}" class="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:ring-indigo-300">
                <span class="min-w-0 truncate">${esc(t)}</span><span class="flex-none text-xs text-slate-500">${n} câu</span></a></li>`,
            )
            .join("")}</ul>
        </aside>
      </div>
    </section>`;

    $("#quiz-export").addEventListener("click", () => window.LabExport.open({ title: quiz.title, questions: quiz.questions }));
    $("#quiz-delete").addEventListener("click", () => {
      if (!confirm("Xóa quiz này? Lịch sử làm bài liên quan sẽ không còn hiển thị câu hỏi.")) return;
      QuizStore.remove(id);
      quiz.questions.forEach((q) => bankById.delete(q.id));
      toast("Đã xóa quiz", "success");
      location.hash = "#/ai-quiz";
    });
  }

  function playQuiz(id, topic) {
    const quiz = QuizStore.get(id);
    if (!quiz) return renderNotFound("Không tìm thấy quiz này.");
    const list = topic ? quiz.questions.filter((q) => q.topic === topic) : quiz.questions;
    if (!list.length) return renderNotFound("Chủ đề này không có câu hỏi nào.");
    startPracticeSession({
      list,
      meta: { subject: quiz.questions[0].subject, grade: quiz.questions[0].grade, topic: topic || quiz.title, types: [], levels: [], aiQuiz: id },
      crumbs: `<a href="#/ai-quiz" class="hover:text-indigo-600">Tạo quiz bằng AI</a><span class="mx-1">/</span>
        <a href="#/ai-quiz/${id}" class="hover:text-indigo-600">${esc(clip(quiz.title, 40))}</a>`,
      heading: topic ? `${quiz.title} · ${topic}` : quiz.title,
    });
  }

  /* ===============================================================
   * Knowledge statistics
   * ============================================================= */
  const mulberry = (seed) => () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

  function makeAnswer(q, correct) {
    if (q.type === "multiple_choice") {
      const keys = Object.keys(q.options);
      return correct ? q.correctAnswer : keys.find((k) => k !== q.correctAnswer);
    }
    if (q.type === "true_false") return Object.fromEntries(q.statements.map((s, i) => [i, correct ? s.isTrue : !s.isTrue]));
    if (q.type === "drag_drop") return Object.fromEntries(q.slots.map((_, i) => [i, correct ? `c${i}` : `c${(i + 1) % q.slots.length}`]));
    return correct ? q.correctAnswer : "0";
  }

  function demoStudents() {
    const names = ["Nguyễn Minh Anh", "Trần Quốc Bảo", "Lê Thu Cúc", "Phạm Gia Huy", "Võ Ngọc Lan", "Đặng Hoàng Nam", "Bùi Khánh Linh", "Hồ Đức Thành", "Ngô Phương Thảo", "Đỗ Tuấn Kiệt", "Dương Mai Chi", "Lý Anh Khoa", "Phan Bảo Ngọc", "Vũ Thế Vinh"];
    const pool = [...bankById.values()].filter((q) => !q.aiQuiz && q.subject !== "General");
    return names.map((name, si) => {
      const rnd = mulberry(si + 11);
      const ability = 0.55 + rnd() * 0.4;
      const attempts = Array.from({ length: 3 }, (_, ai) => {
        const picked = [...pool].sort(() => rnd() - 0.5).slice(0, 14);
        const answers = {};
        picked.forEach((q) => {
          const topicSkill = 0.3 + (mulberry(hash(`${q.subject}${q.topic}`))() * 0.65);
          answers[q.id] = makeAnswer(q, rnd() < topicSkill * 0.6 + ability * 0.4 - 0.05);
        });
        return { id: `demo_${si}_${ai}`, createdAt: Date.now() - (ai + 1) * 86_400_000, questionIds: picked.map((q) => q.id), answers };
      });
      return { id: `demo_${si}`, name, demo: true, attempts };
    });
  }

  function computeStats(students, subject) {
    const topics = new Map();
    let responses = 0;
    let fractionSum = 0;
    let attemptCount = 0;

    students.forEach((st) => {
      st.attempts.forEach((att) => {
        attemptCount++;
        att.questionIds.forEach((qid) => {
          const q = bankById.get(qid);
          if (!q || (subject !== "all" && q.subject !== subject)) return;
          const f = gradeQuestion(q, att.answers[qid]).fraction;
          responses++;
          fractionSum += f;

          const key = `${q.aiQuiz || ""}|${q.subject}|${q.grade}|${q.topic}`;
          const t = topics.get(key) || { key, subject: q.subject, grade: q.grade, topic: q.topic, aiQuiz: q.aiQuiz, sum: 0, n: 0, students: new Map(), questions: new Map() };
          t.sum += f;
          t.n++;
          const s = t.students.get(st.name) || { sum: 0, n: 0 };
          s.sum += f;
          s.n++;
          t.students.set(st.name, s);
          const qs = t.questions.get(qid) || { q, sum: 0, n: 0 };
          qs.sum += f;
          qs.n++;
          t.questions.set(qid, qs);
          topics.set(key, t);
        });
      });
    });

    const rows = [...topics.values()]
      .map((t) => ({
        ...t,
        wrongRate: 1 - t.sum / t.n,
        weak: [...t.students].filter(([, s]) => s.sum / s.n < 0.5).map(([name]) => name),
        hardest: [...t.questions.values()].filter((x) => x.sum / x.n < 0.7).sort((a, b) => a.sum / a.n - b.sum / b.n).slice(0, 3),
      }))
      .sort((a, b) => b.wrongRate - a.wrongRate || b.n - a.n);

    return { rows, responses, attemptCount, accuracy: responses ? fractionSum / responses : 0 };
  }

  const tone = (wrong) =>
    wrong >= 0.5
      ? { bar: "bg-rose-500", text: "text-rose-600", chip: "bg-rose-100 text-rose-700", label: "Cần giảng lại" }
      : wrong >= 0.3
        ? { bar: "bg-amber-500", text: "text-amber-600", chip: "bg-amber-100 text-amber-800", label: "Nên ôn thêm" }
        : { bar: "bg-emerald-500", text: "text-emerald-600", chip: "bg-emerald-100 text-emerald-700", label: "Nắm tốt" };

  const statsState = { mode: "mine", subject: "all" };

  function exportMine() {
    const attempts = Store.list();
    const ids = new Set(attempts.flatMap((a) => a.questionIds));
    const questions = [...ids].map((id) => bankById.get(id)).filter(Boolean);
    const user = typeof Auth !== "undefined" ? Auth.user : null;
    const payload = { kind: "labluyen-results", version: 1, exportedAt: Date.now(), student: { id: user?.uid || "guest", name: user?.name || "Học sinh ẩn danh" }, attempts, questions };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `ket-qua-${(payload.student.name || "hoc-sinh").replace(/\s+/g, "-")}.json` });
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importFiles(files) {
    const data = ClassStore.load();
    let ok = 0;
    for (const file of files) {
      try {
        const p = JSON.parse(await file.text());
        if (p.kind !== "labluyen-results" || !Array.isArray(p.attempts)) throw new Error("bad");
        const sid = String(p.student?.id || p.student?.name || file.name);
        const student = { id: sid, name: String(p.student?.name || "Học sinh").slice(0, 60), attempts: p.attempts.slice(0, 200).map((a) => ({ id: a.id, createdAt: a.createdAt, questionIds: a.questionIds, answers: a.answers })) };
        data.students = [...data.students.filter((s) => s.id !== sid), student];
        (p.questions || []).forEach((q) => q?.id && (data.questions[q.id] = q));
        ok++;
      } catch {
        toast(`Không đọc được tệp ${file.name}`, "error");
      }
    }
    if (ok && !ClassStore.save(data)) toast("Bộ nhớ trình duyệt đầy, một phần dữ liệu có thể chưa được lưu.", "error");
    registerClass();
    if (ok) toast(`Đã nhập kết quả của ${ok} học sinh`, "success");
    renderStats();
  }

  function renderStats() {
    const cls = ClassStore.load();
    const students =
      statsState.mode === "mine"
        ? [{ id: "me", name: "Bạn", attempts: Store.list() }]
        : cls.students;

    const present = new Set();
    students.forEach((s) => s.attempts.forEach((a) => a.questionIds.forEach((id) => bankById.get(id) && present.add(bankById.get(id).subject))));
    if (statsState.subject !== "all" && !present.has(statsState.subject)) statsState.subject = "all";
    const stats = computeStats(students, statsState.subject);
    const needReview = stats.rows.filter((r) => r.wrongRate >= 0.4 && r.n >= 3);
    const isClass = statsState.mode === "class";
    const hasDemo = cls.students.some((s) => s.demo);

    const seg = (key, label, icon) =>
      `<button type="button" data-mode="${key}" aria-pressed="${statsState.mode === key}" class="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${statsState.mode === key ? "bg-indigo-600 text-white shadow-sm" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-indigo-300"}"><i class="fa-solid ${icon}" aria-hidden="true"></i>${label}</button>`;

    const kpi = (label, value, icon, color) =>
      `<div class="card flex items-center gap-4 p-4"><span class="flex h-11 w-11 flex-none items-center justify-center rounded-xl ${color}"><i class="fa-solid ${icon}" aria-hidden="true"></i></span>
        <div><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">${label}</p><p class="text-2xl font-extrabold text-slate-900">${value}</p></div></div>`;

    const empty = isClass
      ? `<div class="mt-8 rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <span class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-2xl text-indigo-600"><i class="fa-solid fa-users" aria-hidden="true"></i></span>
          <h2 class="mt-4 text-lg font-extrabold text-slate-900">Chưa có dữ liệu lớp học</h2>
          <p class="mx-auto mt-1.5 max-w-lg text-slate-600">Yêu cầu học sinh bấm “Xuất kết quả” ở trang Thống kê của các em, rồi nhập các tệp .json vào đây. Hoặc xem thử với dữ liệu mẫu.</p></div>`
      : `<div class="mt-8 rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <span class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-2xl text-indigo-600"><i class="fa-solid fa-chart-column" aria-hidden="true"></i></span>
          <h2 class="mt-4 text-lg font-extrabold text-slate-900">Chưa có dữ liệu làm bài</h2>
          <p class="mx-auto mt-1.5 max-w-lg text-slate-600">Hãy làm một vài bài luyện tập hoặc đề thi, thống kê chủ đề sẽ xuất hiện ở đây.</p>
          <a href="#/bank" class="btn btn-primary mt-5">Bắt đầu luyện tập</a></div>`;

    const rowHtml = (r) => {
      const t = tone(r.wrongRate);
      const s = subjOf(r.subject);
      return `<li><details class="group card overflow-hidden">
        <summary class="flex cursor-pointer list-none flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-4">
          <div class="min-w-0 sm:w-64 sm:flex-none">
            <p class="truncate font-bold text-slate-900">${esc(r.topic)}</p>
            <p class="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500"><span class="rounded-md px-1.5 py-0.5 font-bold ${s.badge}">${r.aiQuiz ? "Quiz AI" : s.label}</span>Lớp ${r.grade}</p>
          </div>
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <div class="h-3 flex-1 overflow-hidden rounded-full bg-slate-100" role="img" aria-label="Tỉ lệ sai ${pct(r.wrongRate)}"><div class="h-full rounded-full ${t.bar}" style="width:${Math.max(3, Math.round(r.wrongRate * 100))}%"></div></div>
            <span class="w-12 flex-none text-right text-sm font-extrabold ${t.text}">${pct(r.wrongRate)}</span>
          </div>
          <div class="flex flex-none items-center gap-3"><span class="rounded-md px-2 py-0.5 text-xs font-bold ${t.chip}">${t.label}</span>
            <span class="w-16 text-right text-xs text-slate-500">${r.n} lượt</span>
            <i class="fa-solid fa-chevron-down text-xs text-slate-400 transition group-open:rotate-180" aria-hidden="true"></i></div>
        </summary>
        <div class="grid gap-5 border-t border-slate-200 bg-slate-50 p-4 lg:grid-cols-2">
          <div><h3 class="text-sm font-bold text-slate-900">Câu sai nhiều nhất</h3>
            ${
              r.hardest.length
                ? `<ul class="mt-2 grid gap-2">${r.hardest
                    .map((h) => `<li class="rounded-xl bg-white p-3 text-sm ring-1 ring-slate-200"><p class="text-slate-800">${esc(clip(h.q.questionText, 150))}</p><p class="mt-1 text-xs font-bold text-rose-600">${pct(1 - h.sum / h.n)} sai · ${h.n} lượt</p></li>`)
                    .join("")}</ul>`
                : `<p class="mt-2 text-sm text-slate-500">Chưa có câu nào sai đáng kể.</p>`
            }</div>
          <div><h3 class="text-sm font-bold text-slate-900">${isClass ? "Học sinh cần hỗ trợ" : "Gợi ý"}</h3>
            ${
              isClass
                ? r.weak.length
                  ? `<p class="mt-2 text-sm text-slate-700">${r.weak.length}/${r.students.size} học sinh đạt dưới 50% ở chủ đề này:</p><ul class="mt-2 flex flex-wrap gap-1.5">${r.weak.map((n) => `<li class="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">${esc(n)}</li>`).join("")}</ul>`
                  : `<p class="mt-2 text-sm text-slate-500">Không có học sinh nào dưới 50% ở chủ đề này.</p>`
                : `<p class="mt-2 text-sm text-slate-700">Ôn lại lý thuyết chủ đề này rồi luyện tập thêm để cải thiện tỉ lệ đúng.</p>`
            }
            <a href="${r.aiQuiz ? `#/ai-quiz/${r.aiQuiz}?topic=${encodeURIComponent(r.topic)}` : `#/practice/${r.subject}/${r.grade}/${encodeURIComponent(r.topic)}`}" class="btn btn-secondary btn-sm mt-3">Luyện tập chủ đề này</a></div>
        </div>
      </details></li>`;
    };

    view.innerHTML = `
    <section class="mx-auto max-w-6xl px-4 pb-16 pt-10">
      <nav aria-label="Breadcrumb" class="text-sm text-slate-500"><a href="#/" class="hover:text-indigo-600">Trang chủ</a> <span class="mx-1">/</span> <span class="font-semibold text-slate-700">Thống kê kiến thức</span></nav>
      <div class="mt-3 flex flex-wrap items-center gap-3">
        <h1 class="text-3xl font-extrabold tracking-tight text-slate-900">Thống kê kiến thức</h1>
        <span class="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-extrabold uppercase text-emerald-700">Mới</span>
      </div>
      <p class="mt-1.5 max-w-2xl text-slate-600">Xem chủ đề nào bị sai nhiều nhất để biết chính xác mảng kiến thức cần giảng lại hoặc ôn thêm.</p>

      <div class="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap gap-2">${seg("mine", "Của tôi", "fa-user")}${seg("class", "Cả lớp (giáo viên)", "fa-users")}</div>
        <div class="flex flex-wrap items-center gap-2">
          <label for="stats-subject" class="sr-only">Lọc theo môn</label>
          <select id="stats-subject" class="field !w-auto"><option value="all">Tất cả môn</option>${[...present].map((k) => `<option value="${k}" ${statsState.subject === k ? "selected" : ""}>${subjOf(k).label}</option>`).join("")}</select>
          ${
            isClass
              ? `<label class="btn btn-secondary cursor-pointer"><i class="fa-solid fa-file-import" aria-hidden="true"></i>Nhập kết quả (.json)<input id="stats-import" type="file" accept=".json,application/json" multiple class="sr-only"></label>
                 ${hasDemo ? "" : `<button type="button" id="stats-demo" class="btn btn-ghost"><i class="fa-solid fa-flask" aria-hidden="true"></i>Dữ liệu mẫu</button>`}
                 ${cls.students.length ? `<button type="button" id="stats-clear" class="btn btn-ghost text-rose-600"><i class="fa-regular fa-trash-can" aria-hidden="true"></i>Xóa dữ liệu lớp</button>` : ""}`
              : `<button type="button" id="stats-export" class="btn btn-secondary" ${Store.list().length ? "" : "disabled"}><i class="fa-solid fa-file-export" aria-hidden="true"></i>Xuất kết quả gửi giáo viên</button>`
          }
        </div>
      </div>
      ${isClass && hasDemo ? `<p class="mt-3 rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800">Đang hiển thị dữ liệu mẫu của 14 học sinh giả lập. Xóa dữ liệu lớp để nhập kết quả thật.</p>` : ""}

      ${
        !stats.responses
          ? empty
          : `<div class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              ${kpi(isClass ? "Học sinh" : "Số lượt làm", isClass ? students.length : stats.attemptCount, isClass ? "fa-users" : "fa-pen-to-square", "bg-indigo-100 text-indigo-700")}
              ${kpi("Lượt trả lời", stats.responses, "fa-list-check", "bg-sky-100 text-sky-700")}
              ${kpi("Độ chính xác TB", pct(stats.accuracy), "fa-bullseye", "bg-emerald-100 text-emerald-700")}
              ${kpi("Chủ đề cần ôn", needReview.length, "fa-triangle-exclamation", "bg-rose-100 text-rose-700")}
            </div>

            ${
              needReview.length
                ? `<div class="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-5">
                    <h2 class="flex items-center gap-2 font-extrabold text-rose-800"><i class="fa-solid fa-chalkboard-user" aria-hidden="true"></i>${isClass ? "Nên giảng lại" : "Nên ôn lại"} ${Math.min(3, needReview.length)} chủ đề này trước</h2>
                    <ol class="mt-3 grid gap-2 sm:grid-cols-3">${needReview.slice(0, 3).map((r, i) => `<li class="rounded-xl bg-white p-3.5 ring-1 ring-rose-200"><p class="text-xs font-bold text-rose-600">#${i + 1} · ${pct(r.wrongRate)} sai</p><p class="mt-1 font-bold text-slate-900">${esc(r.topic)}</p><p class="mt-0.5 text-xs text-slate-500">${r.aiQuiz ? "Quiz AI" : subjOf(r.subject).label} · ${r.n} lượt trả lời</p></li>`).join("")}</ol>
                  </div>`
                : ""
            }

            <h2 class="mt-10 text-xl font-extrabold text-slate-900">Tỉ lệ sai theo chủ đề</h2>
            <p class="mt-1 text-sm text-slate-500">Sắp xếp từ chủ đề sai nhiều nhất. Bấm vào từng dòng để xem câu khó và gợi ý.</p>
            <ul class="mt-4 grid gap-3">${stats.rows.map(rowHtml).join("")}</ul>`
      }
    </section>`;

    $$("[data-mode]").forEach((b) => b.addEventListener("click", () => { statsState.mode = b.dataset.mode; renderStats(); }));
    $("#stats-subject").addEventListener("change", (e) => { statsState.subject = e.target.value; renderStats(); });
    $("#stats-export")?.addEventListener("click", exportMine);
    $("#stats-import")?.addEventListener("change", (e) => importFiles([...e.target.files]));
    $("#stats-demo")?.addEventListener("click", () => {
      const data = ClassStore.load();
      data.students = [...data.students, ...demoStudents()];
      ClassStore.save(data);
      renderStats();
    });
    $("#stats-clear")?.addEventListener("click", () => {
      if (!confirm("Xóa toàn bộ dữ liệu lớp đã nhập trên trình duyệt này?")) return;
      ClassStore.clear();
      renderStats();
    });
  }

  /* ---------------------------------------------------------------
   * Router hooks
   * ------------------------------------------------------------- */
  window.LabFeatures = {
    "ai-quiz"(rest, params) {
      const [id, action] = rest;
      if (!id) return renderGenerator();
      if (action === "play" || params.has("topic")) return playQuiz(id, params.get("topic"));
      renderQuizDetail(id);
    },
    stats: () => renderStats(),
  };

  if (/^#\/(ai-quiz|stats)/.test(location.hash)) App.route();
})();
