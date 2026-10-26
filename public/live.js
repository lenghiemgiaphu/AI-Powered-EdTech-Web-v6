/* Live quiz battle (#/live): host a room, join with a code, realtime leaderboard. Loaded after app.js. */
(() => {
  const App = window.LabApp;
  if (!App) return;
  const { $, view, esc, toast, openModal, closeModal } = App;

  const OPT = {
    A: { bg: "bg-rose-500", ring: "ring-rose-300", bar: "bg-rose-500", icon: "fa-play", rotate: "-rotate-90" },
    B: { bg: "bg-sky-500", ring: "ring-sky-300", bar: "bg-sky-500", icon: "fa-diamond", rotate: "" },
    C: { bg: "bg-amber-500", ring: "ring-amber-300", bar: "bg-amber-500", icon: "fa-circle", rotate: "" },
    D: { bg: "bg-emerald-600", ring: "ring-emerald-300", bar: "bg-emerald-600", icon: "fa-square", rotate: "" },
  };
  const LETTERS = ["A", "B", "C", "D"];
  const fmt = (n) => Number(n).toLocaleString("vi-VN");

  const read = (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const write = (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  };
  const uid = () => (typeof Auth !== "undefined" && Auth.user ? Auth.user.uid : "guest");

  const L = { run: 0, timer: null, tick: null, sig: "", offset: 0, mode: "", code: "", pid: "", host: "", state: null, localChoice: null, rewarded: false, reward: null, bestStreak: 0, fails: 0 };

  async function api(method, body, query) {
    const res = await fetch(method === "GET" ? `/api/live?${new URLSearchParams(query)}` : "/api/live", {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || "Có lỗi xảy ra. Vui lòng thử lại."), { status: res.status });
    return data;
  }

  function stopPolling() {
    L.run++;
    clearTimeout(L.timer);
    clearInterval(L.tick);
    L.timer = L.tick = null;
  }

  const shell = (inner, width = "max-w-5xl") => `<section class="mx-auto ${width} px-4 pb-16 pt-8">${inner}</section>`;
  const errorPanel = (message) => {
    view.innerHTML = shell(`<div class="card mx-auto max-w-lg p-8 text-center">
      <span class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-2xl text-rose-600"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i></span>
      <h1 class="mt-4 text-xl font-extrabold text-slate-900">Không vào được phòng</h1>
      <p class="mt-2 text-slate-600">${esc(message)}</p>
      <a href="#/live" class="btn btn-primary mt-6">Quay lại đấu trực tiếp</a></div>`, "max-w-2xl");
  };

  /* =================================================================
   * Landing
   * ================================================================= */
  function renderLanding(prefillCode = "") {
    stopPolling();
    const name = read("labluyen_live_name") || "";
    view.innerHTML = `
    <section class="hero-bg">
      <div class="mx-auto max-w-6xl px-4 pb-14 pt-12">
        <span class="inline-flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-rose-700"><span class="relative flex h-2 w-2"><span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75"></span><span class="relative inline-flex h-2 w-2 rounded-full bg-rose-500"></span></span>Trực tiếp</span>
        <h1 class="mt-4 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl">Đấu trắc nghiệm thời gian thực ngay tại lớp học</h1>
        <p class="mt-4 max-w-2xl text-lg leading-relaxed text-slate-600">Giáo viên mở phòng, học sinh nhập mã bằng điện thoại. Mỗi câu hỏi có đồng hồ đếm ngược, trả lời càng nhanh càng nhiều điểm và bảng xếp hạng cập nhật liên tục.</p>

        <div class="mt-9 grid gap-5 lg:grid-cols-2">
          <form id="live-join-form" class="card p-6 sm:p-8" novalidate>
            <span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-xl text-indigo-700"><i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i></span>
            <h2 class="mt-4 text-xl font-extrabold text-slate-900">Tham gia bằng mã phòng</h2>
            <p class="mt-1 text-sm text-slate-500">Nhập mã 6 số do giáo viên hoặc bạn bè chia sẻ.</p>
            <label for="join-code" class="mt-5 block text-sm font-semibold text-slate-700">Mã phòng</label>
            <input id="join-code" name="code" inputmode="numeric" autocomplete="off" maxlength="6" class="field mt-1.5 text-center text-2xl font-extrabold tracking-[0.4em]" placeholder="000000" value="${esc(prefillCode)}" ${prefillCode ? "" : "autofocus"}>
            <label for="join-name" class="mt-4 block text-sm font-semibold text-slate-700">Tên hiển thị</label>
            <input id="join-name" name="name" maxlength="20" autocomplete="nickname" class="field mt-1.5" placeholder="Ví dụ: Minh Anh 11A2" value="${esc(name)}" ${prefillCode ? "autofocus" : ""}>
            <p id="join-error" class="mt-3 hidden text-sm font-semibold text-rose-600" role="alert"></p>
            <button type="submit" class="btn btn-primary btn-lg mt-5 w-full">Vào phòng<i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
          </form>

          <div class="card flex flex-col p-6 sm:p-8">
            <span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-xl text-amber-700"><i class="fa-solid fa-chalkboard-user" aria-hidden="true"></i></span>
            <h2 class="mt-4 text-xl font-extrabold text-slate-900">Tổ chức trận đấu</h2>
            <p class="mt-1 text-sm text-slate-500">Dành cho giáo viên hoặc nhóm học tập muốn kiểm tra nhanh tại lớp.</p>
            <ol class="mt-5 grid gap-3 text-sm text-slate-700">
              <li class="flex gap-3"><span class="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-slate-900 text-xs font-extrabold text-white">1</span>Chọn môn, chuyên đề, số câu và thời gian mỗi câu.</li>
              <li class="flex gap-3"><span class="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-slate-900 text-xs font-extrabold text-white">2</span>Chiếu mã phòng lên màn hình để học sinh tham gia.</li>
              <li class="flex gap-3"><span class="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-slate-900 text-xs font-extrabold text-white">3</span>Điều khiển từng câu, xem tỉ lệ chọn đáp án và bảng xếp hạng.</li>
            </ol>
            <div class="mt-auto pt-6"><a href="#/live/host" class="btn btn-secondary btn-lg w-full"><i class="fa-solid fa-plus" aria-hidden="true"></i>Tạo phòng mới</a></div>
          </div>
        </div>
      </div>
    </section>
    <section class="mx-auto max-w-6xl px-4 pt-12">
      <h2 class="text-2xl font-extrabold tracking-tight text-slate-900">Cách tính điểm</h2>
      <div class="mt-5 grid gap-4 sm:grid-cols-3">
        ${[
          ["fa-stopwatch", "bg-sky-100 text-sky-700", "Nhanh được thưởng", "Trả lời đúng nhận từ 500 đến 1000 điểm, càng sớm càng cao."],
          ["fa-fire", "bg-orange-100 text-orange-600", "Chuỗi đúng liên tiếp", "Mỗi câu đúng liên tiếp cộng thêm 50 điểm, tối đa 250 điểm."],
          ["fa-bolt", "bg-indigo-100 text-indigo-700", "Nhận XP khi kết thúc", "Tham gia và xếp hạng cao giúp bạn lên cấp và mở khóa huy hiệu."],
        ].map(([icon, tone, t, d]) => `<article class="card p-5"><span class="flex h-11 w-11 items-center justify-center rounded-xl text-lg ${tone}"><i class="fa-solid ${icon}" aria-hidden="true"></i></span><h3 class="mt-3 font-bold text-slate-900">${t}</h3><p class="mt-1 text-sm leading-relaxed text-slate-600">${d}</p></article>`).join("")}
      </div>
    </section>`;
  }

  async function submitJoin(form) {
    const code = form.code.value.replace(/\D/g, "");
    const name = form.name.value.trim();
    const errorEl = $("#join-error");
    const fail = (msg) => {
      errorEl.textContent = msg;
      errorEl.classList.remove("hidden");
    };
    if (code.length !== 6) return fail("Mã phòng gồm 6 chữ số.");
    if (!name) return fail("Hãy nhập tên hiển thị.");
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const res = await api("POST", { action: "join", code, name, pid: read(`labluyen_live_pid_${code}`) || undefined });
      write(`labluyen_live_pid_${code}`, res.pid);
      write("labluyen_live_name", name);
      location.hash = `#/live/play/${code}`;
    } catch (e) {
      fail(e.message);
      button.disabled = false;
    }
  }

  /* =================================================================
   * Host setup
   * ================================================================= */
  const savedAiQuizzes = () => {
    try {
      return JSON.parse(localStorage.getItem(`labluyen_aiquiz_${uid()}`) || "[]");
    } catch {
      return [];
    }
  };
  const isMc = (q) => q.type === "multiple_choice" && q.options && q.correctAnswer;

  const setup = { source: "bank", subject: "Physics", grade: "all", topic: "all", count: 10, time: 20, title: "", aiId: "" };

  function setupPool() {
    if (setup.source === "ai") return (savedAiQuizzes().find((q) => q.id === setup.aiId)?.questions || []).filter(isMc);
    return questionBank.filter((q) => isMc(q) && q.subject === setup.subject && (setup.grade === "all" || String(q.grade) === setup.grade) && (setup.topic === "all" || q.topic === setup.topic));
  }

  function topicOptions() {
    const topics = [...new Set(questionBank.filter((q) => isMc(q) && q.subject === setup.subject && (setup.grade === "all" || String(q.grade) === setup.grade)).map((q) => q.topic))];
    return `<option value="all">Tất cả chuyên đề</option>${topics.map((t) => `<option value="${esc(t)}" ${t === setup.topic ? "selected" : ""}>${esc(t)}</option>`).join("")}`;
  }

  function renderHostSetup() {
    stopPolling();
    const ai = savedAiQuizzes().filter((q) => q.questions.some(isMc));
    if (setup.source === "ai" && !setup.aiId) setup.aiId = ai[0]?.id || "";
    const selectCls = "field mt-1.5";
    view.innerHTML = shell(`
      <a href="#/live" class="text-sm font-semibold text-slate-500 hover:text-indigo-600"><i class="fa-solid fa-arrow-left mr-1.5" aria-hidden="true"></i>Đấu trực tiếp</a>
      <h1 class="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">Tạo phòng đấu trắc nghiệm</h1>
      <p class="mt-1 text-slate-600">Chỉ dùng câu trắc nghiệm 4 phương án để học sinh trả lời nhanh trên điện thoại.</p>
      <form id="live-setup" class="card mt-6 grid gap-5 p-6 sm:p-8" novalidate>
        <div><label class="text-sm font-semibold text-slate-700" for="s-title">Tên trận đấu</label>
          <input id="s-title" class="field mt-1.5" maxlength="80" placeholder="Ví dụ: Kiểm tra 15 phút Động lực học" value="${esc(setup.title)}"></div>
        <fieldset><legend class="text-sm font-semibold text-slate-700">Nguồn câu hỏi</legend>
          <div class="mt-1.5 grid grid-cols-2 gap-2">
            <label class="flex cursor-pointer items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-semibold ${setup.source === "bank" ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-700"}"><input type="radio" name="source" value="bank" class="sr-only" ${setup.source === "bank" ? "checked" : ""}><i class="fa-solid fa-book-open" aria-hidden="true"></i>Ngân hàng câu hỏi</label>
            <label class="flex cursor-pointer items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-semibold ${setup.source === "ai" ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-700"} ${ai.length ? "" : "opacity-50"}"><input type="radio" name="source" value="ai" class="sr-only" ${setup.source === "ai" ? "checked" : ""} ${ai.length ? "" : "disabled"}><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>Quiz AI đã lưu${ai.length ? "" : " (chưa có)"}</label>
          </div></fieldset>
        ${setup.source === "bank"
          ? `<div class="grid gap-4 sm:grid-cols-3">
              <div><label class="text-sm font-semibold text-slate-700" for="s-subject">Môn học</label><select id="s-subject" name="subject" class="${selectCls}">${Object.entries(SUBJECTS).map(([k, s]) => `<option value="${k}" ${k === setup.subject ? "selected" : ""}>${s.label}</option>`).join("")}</select></div>
              <div><label class="text-sm font-semibold text-slate-700" for="s-grade">Lớp</label><select id="s-grade" name="grade" class="${selectCls}"><option value="all">Tất cả</option>${GRADES.map((g) => `<option value="${g}" ${String(g) === setup.grade ? "selected" : ""}>Lớp ${g}</option>`).join("")}</select></div>
              <div><label class="text-sm font-semibold text-slate-700" for="s-topic">Chuyên đề</label><select id="s-topic" name="topic" class="${selectCls}">${topicOptions()}</select></div>
            </div>`
          : `<div><label class="text-sm font-semibold text-slate-700" for="s-ai">Bộ quiz</label><select id="s-ai" name="aiId" class="${selectCls}">${ai.map((q) => `<option value="${esc(q.id)}" ${q.id === setup.aiId ? "selected" : ""}>${esc(q.title || "Quiz AI")}</option>`).join("")}</select></div>`}
        <div class="grid gap-4 sm:grid-cols-2">
          <div><label class="text-sm font-semibold text-slate-700" for="s-count">Số câu hỏi</label><select id="s-count" name="count" class="${selectCls}">${[5, 10, 15, 20, 30].map((n) => `<option value="${n}" ${n === setup.count ? "selected" : ""}>${n} câu</option>`).join("")}</select></div>
          <div><label class="text-sm font-semibold text-slate-700" for="s-time">Thời gian mỗi câu</label><select id="s-time" name="time" class="${selectCls}">${[10, 15, 20, 30, 45, 60].map((n) => `<option value="${n}" ${n === setup.time ? "selected" : ""}>${n} giây</option>`).join("")}</select></div>
        </div>
        <p id="s-summary" class="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600" aria-live="polite"></p>
        <p id="s-error" class="hidden text-sm font-semibold text-rose-600" role="alert"></p>
        <button type="submit" class="btn btn-primary btn-lg"><i class="fa-solid fa-door-open" aria-hidden="true"></i>Tạo phòng</button>
      </form>`, "max-w-3xl");
    updateSetupSummary();
  }

  function updateSetupSummary() {
    const el = $("#s-summary");
    if (!el) return;
    const n = setupPool().length;
    const use = Math.min(n, setup.count);
    el.textContent = n
      ? `Có ${n} câu phù hợp. Trận đấu sẽ dùng ${use} câu, khoảng ${Math.ceil((use * (setup.time + 8)) / 60)} phút.`
      : "Chưa có câu trắc nghiệm nào phù hợp với lựa chọn này. Hãy đổi môn, lớp hoặc chuyên đề.";
  }

  function readSetup(form) {
    setup.title = $("#s-title").value;
    setup.source = form.source.value;
    if (setup.source === "bank") {
      setup.subject = form.subject.value;
      setup.grade = form.grade.value;
      setup.topic = form.topic.value;
    } else setup.aiId = form.aiId.value;
    setup.count = Number(form.count.value);
    setup.time = Number(form.time.value);
  }

  function shuffle(list) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  async function createRoom(form) {
    readSetup(form);
    const errorEl = $("#s-error");
    const pool = setupPool();
    if (!pool.length) {
      errorEl.textContent = "Chưa có câu hỏi phù hợp để tạo phòng.";
      errorEl.classList.remove("hidden");
      return;
    }
    const title = setup.title.trim() || (setup.source === "bank" ? `${SUBJECTS[setup.subject].label}${setup.topic !== "all" ? `: ${setup.topic}` : ""}` : "Quiz AI");
    const questions = shuffle(pool).slice(0, setup.count).map((q) => ({
      text: q.questionText,
      options: { A: q.options.A, B: q.options.B, C: q.options.C, D: q.options.D },
      correct: q.correctAnswer,
      explanation: q.explanation || "",
    }));
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const res = await api("POST", { action: "create", title, subject: setup.source === "bank" ? SUBJECTS[setup.subject].label : "", timeSec: setup.time, questions });
      write(`labluyen_live_host_${res.code}`, res.hostToken);
      location.hash = `#/live/room/${res.code}`;
    } catch (e) {
      errorEl.textContent = e.message;
      errorEl.classList.remove("hidden");
      button.disabled = false;
    }
  }

  /* =================================================================
   * Polling + rendering
   * ================================================================= */
  function startRoom(mode, code) {
    stopPolling();
    Object.assign(L, { mode, code, sig: "", state: null, localChoice: null, rewarded: false, reward: null, bestStreak: 0, fails: 0 });
    L.host = mode === "host" ? read(`labluyen_live_host_${code}`) || "" : "";
    L.pid = mode === "play" ? read(`labluyen_live_pid_${code}`) || "" : "";
    if (mode === "host" && !L.host) return errorPanel("Thiết bị này không phải người tổ chức của phòng. Hãy tạo phòng mới.");
    if (mode === "play" && !L.pid) {
      location.hash = `#/live/join/${code}`;
      return;
    }
    view.innerHTML = shell(`<p class="py-24 text-center font-semibold text-slate-500"><i class="fa-solid fa-circle-notch fa-spin mr-2" aria-hidden="true"></i>Đang vào phòng ${esc(code)}…</p>`);

    const run = L.run;
    const loop = async () => {
      if (run !== L.run) return;
      let delay = document.hidden ? 5000 : 1500;
      try {
        const query = { code, ...(mode === "host" ? { host: L.host } : { pid: L.pid }) };
        const state = await api("GET", null, query);
        if (run !== L.run) return;
        L.fails = 0;
        L.offset = state.serverNow - Date.now();
        onState(state);
        if (state.phase === "finished") return;
        if (state.phase === "lobby") delay = document.hidden ? 5000 : 2500;
      } catch (e) {
        if (run !== L.run) return;
        if (e.status === 404) return errorPanel(e.message);
        L.fails++;
        if (L.fails === 3) toast("Mất kết nối, đang thử lại…", "error");
      }
      L.timer = setTimeout(loop, delay);
    };
    loop();
    L.tick = setInterval(updateTimer, 200);
  }

  function onState(state) {
    L.state = state;
    if (L.mode === "play" && !state.me) return errorPanel("Bạn chưa có trong phòng này. Hãy nhập mã và tên để tham gia lại.");
    if (state.me) L.bestStreak = Math.max(L.bestStreak, state.me.streak || 0);
    if (L.mode === "play" && state.phase === "finished" && !L.rewarded && state.me) {
      L.rewarded = true;
      L.reward = window.LabGame?.awardLive({
        code: state.code, rank: state.me.rank, players: state.playerCount, correct: state.me.correct, total: state.total, bestStreak: L.bestStreak, title: state.title,
      }) || null;
    }
    if (state.phase !== "question") L.localChoice = L.localChoice && state.phase === "reveal" ? L.localChoice : null;
    const sig = `${state.phase}|${state.qIndex}|${state.me?.answered ? 1 : 0}|${L.localChoice || ""}|${L.reward ? 1 : 0}`;
    if (sig !== L.sig) {
      L.sig = sig;
      view.innerHTML = L.mode === "host" ? hostScreen(state) : playerScreen(state);
      if (state.phase === "finished") window.scrollTo(0, 0);
    }
    patch(state);
    updateTimer();
  }

  function patch(state) {
    const names = $("#live-names");
    if (names) names.innerHTML = state.names?.length ? state.names.map((n) => `<li class="rounded-full bg-white px-3.5 py-1.5 text-sm font-bold text-slate-800 shadow-sm ring-1 ring-slate-200">${esc(n)}</li>`).join("") : `<li class="text-sm text-slate-500">Chưa có ai tham gia. Chia sẻ mã phòng để bắt đầu.</li>`;
    const count = $("#live-players");
    if (count) count.textContent = state.playerCount;
    const answered = $("#live-answered");
    if (answered) answered.textContent = `${state.answeredCount}/${state.playerCount}`;
    const start = $("#live-start");
    if (start) start.disabled = state.playerCount < 1;
  }

  function updateTimer() {
    const s = L.state;
    if (!s || s.phase !== "question") return;
    const remaining = Math.max(0, s.deadline - (Date.now() + L.offset));
    const label = $("#live-time");
    if (label) label.textContent = Math.ceil(remaining / 1000);
    const bar = $("#live-bar");
    if (bar) {
      bar.style.width = `${(remaining / (s.timeSec * 1000)) * 100}%`;
      bar.classList.toggle("bg-rose-500", remaining < 5000);
      bar.classList.toggle("bg-indigo-600", remaining >= 5000);
    }
  }

  const timerBlock = (s) => `<div class="flex items-center gap-4">
      <span class="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-slate-900 text-2xl font-extrabold text-white" aria-label="Thời gian còn lại"><span id="live-time">${s.timeSec}</span></span>
      <div class="h-3 flex-1 overflow-hidden rounded-full bg-slate-200"><div id="live-bar" class="h-full rounded-full bg-indigo-600" style="width:100%;transition:width .25s linear"></div></div>
    </div>`;

  const rankBadge = (rank) => {
    const tone = rank === 1 ? "bg-amber-400 text-amber-950" : rank === 2 ? "bg-slate-300 text-slate-800" : rank === 3 ? "bg-orange-300 text-orange-950" : "bg-slate-100 text-slate-600";
    return `<span class="flex h-8 w-8 flex-none items-center justify-center rounded-full text-sm font-extrabold ${tone}">${rank}</span>`;
  };

  const leaderboardList = (rows, withGain) =>
    `<ol class="grid gap-2">${rows
      .map((r) => `<li class="flex items-center gap-3 rounded-xl px-3.5 py-2.5 ring-1 ${r.me ? "bg-indigo-50 ring-indigo-300" : "bg-white ring-slate-200"}">${rankBadge(r.rank)}
        <span class="min-w-0 flex-1 truncate font-bold text-slate-900">${esc(r.name)}${r.me ? ' <span class="text-xs font-semibold text-indigo-600">(Bạn)</span>' : ""}</span>
        ${r.streak >= 2 ? `<span class="flex items-center gap-1 text-xs font-bold text-orange-500"><i class="fa-solid fa-fire" aria-hidden="true"></i>${r.streak}</span>` : ""}
        ${withGain && r.gained ? `<span class="text-xs font-bold text-emerald-600">+${fmt(r.gained)}</span>` : ""}
        <span class="w-16 text-right font-extrabold tabular-nums text-slate-900">${fmt(r.score)}</span></li>`)
      .join("")}</ol>`;

  const optionGrid = (s, { interactive, picked }) => {
    const q = s.question;
    const revealed = q.correct !== undefined;
    const total = revealed ? Math.max(1, Object.values(q.counts).reduce((a, b) => a + b, 0)) : 1;
    return `<div class="grid gap-3 sm:grid-cols-2">${LETTERS.map((k) => {
      const o = OPT[k];
      const isRight = revealed && q.correct === k;
      const dim = revealed && !isRight;
      const tag = interactive ? "button" : "div";
      return `<${tag} ${interactive ? `type="button" data-live="answer" data-choice="${k}"` : ""} class="relative flex min-h-[4.5rem] items-center gap-3 overflow-hidden rounded-2xl px-4 py-3 text-left text-white ${o.bg} ${dim ? "opacity-40" : ""} ${isRight ? "ring-4 ring-offset-2 " + o.ring : ""} ${picked === k ? "ring-4 ring-offset-2 ring-slate-900" : ""} ${interactive ? "transition active:scale-[.98] hover:brightness-110" : ""}">
        <span class="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-black/20 text-sm"><i class="fa-solid ${o.icon} ${o.rotate}" aria-hidden="true"></i></span>
        <span class="min-w-0 flex-1 text-base font-bold leading-snug sm:text-lg"><span class="sr-only">Đáp án ${k}: </span>${esc(q.options[k])}</span>
        ${revealed ? `<span class="flex flex-none items-center gap-2 text-sm font-extrabold">${isRight ? '<i class="fa-solid fa-circle-check text-xl" aria-hidden="true"></i>' : ""}${q.counts[k]}</span><span class="absolute inset-x-0 bottom-0 h-1.5 bg-black/20"><span class="block h-full bg-white/70" style="width:${Math.round((q.counts[k] / total) * 100)}%"></span></span>` : ""}
      </${tag}>`;
    }).join("")}</div>`;
  };

  /* ---------- Host ---------- */
  function hostScreen(s) {
    const joinUrl = `${location.origin}/#/live/join/${s.code}`;
    const head = `<div class="flex flex-wrap items-center justify-between gap-3">
      <div><p class="text-xs font-bold uppercase tracking-wide text-indigo-600">Phòng ${esc(s.code)}${s.subject ? ` · ${esc(s.subject)}` : ""}</p><h1 class="text-xl font-extrabold text-slate-900 sm:text-2xl">${esc(s.title)}</h1></div>
      ${s.phase !== "finished" ? `<button type="button" data-live="end-ask" class="btn btn-ghost btn-sm text-rose-600"><i class="fa-solid fa-flag-checkered" aria-hidden="true"></i>Kết thúc trận</button>` : ""}
    </div>`;

    if (s.phase === "lobby")
      return shell(`${head}
        <div class="card mt-6 p-6 text-center sm:p-10">
          <p class="text-sm font-semibold text-slate-500">Truy cập <strong class="text-slate-900">${esc(location.host)}</strong>, chọn Đấu trực tiếp và nhập mã</p>
          <p class="mt-2 text-6xl font-extrabold tracking-[0.25em] text-slate-900 sm:text-8xl" aria-label="Mã phòng ${s.code.split("").join(" ")}">${esc(s.code)}</p>
          <div class="mt-5 flex flex-wrap items-center justify-center gap-2">
            <button type="button" data-live="copy" data-text="${esc(joinUrl)}" class="btn btn-secondary btn-sm"><i class="fa-regular fa-copy" aria-hidden="true"></i>Sao chép liên kết tham gia</button>
          </div>
        </div>
        <div class="mt-6 flex items-center justify-between"><h2 class="text-lg font-extrabold text-slate-900"><i class="fa-solid fa-users mr-2 text-indigo-600" aria-hidden="true"></i><span id="live-players">${s.playerCount}</span> người chơi</h2>
          <button type="button" id="live-start" data-live="start" class="btn btn-primary btn-lg" ${s.playerCount < 1 ? "disabled" : ""}><i class="fa-solid fa-play" aria-hidden="true"></i>Bắt đầu (${s.total} câu)</button></div>
        <ul id="live-names" class="mt-4 flex flex-wrap gap-2" aria-live="polite"></ul>`);

    if (s.phase === "question")
      return shell(`${head}
        <div class="mt-6 grid gap-5">
          ${timerBlock(s)}
          <div class="card p-6 sm:p-8"><div class="flex items-center justify-between text-sm font-bold text-slate-500"><span>Câu ${s.qIndex + 1}/${s.total}</span><span><i class="fa-solid fa-user-check mr-1.5" aria-hidden="true"></i><span id="live-answered">0/0</span> đã trả lời</span></div>
            <p class="mt-3 text-xl font-extrabold leading-snug text-slate-900 sm:text-3xl">${esc(s.question.text)}</p></div>
          ${optionGrid(s, { interactive: false })}
          <div class="flex justify-end"><button type="button" data-live="next" class="btn btn-secondary">Hiện đáp án ngay<i class="fa-solid fa-eye" aria-hidden="true"></i></button></div>
        </div>`);

    if (s.phase === "reveal") {
      const last = s.qIndex + 1 >= s.total;
      return shell(`${head}
        <div class="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div class="grid gap-4">
            <div class="card p-6"><p class="text-sm font-bold text-slate-500">Câu ${s.qIndex + 1}/${s.total} · ${s.answeredCount}/${s.playerCount} đã trả lời</p><p class="mt-2 text-lg font-extrabold leading-snug text-slate-900 sm:text-2xl">${esc(s.question.text)}</p></div>
            ${optionGrid(s, { interactive: false })}
            ${s.question.explanation ? `<div class="rounded-2xl bg-emerald-50 p-4 text-sm leading-relaxed text-emerald-900 ring-1 ring-emerald-200"><p class="font-bold">Giải thích</p><p class="mt-1">${esc(s.question.explanation)}</p></div>` : ""}
          </div>
          <div><h2 class="mb-3 text-lg font-extrabold text-slate-900">Bảng xếp hạng</h2>${leaderboardList(s.leaderboard, true)}
            <button type="button" data-live="next" class="btn btn-primary btn-lg mt-5 w-full">${last ? "Xem kết quả cuối" : "Câu tiếp theo"}<i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></div>
        </div>`);
    }

    const [first, second, third] = s.leaderboard;
    const podium = [[second, "h-28", "bg-slate-300"], [first, "h-40", "bg-amber-400"], [third, "h-20", "bg-orange-300"]]
      .map(([p, h, tone], i) => (p ? `<div class="flex w-1/3 max-w-[11rem] flex-col items-center"><p class="max-w-full truncate text-sm font-extrabold text-slate-900 sm:text-base">${esc(p.name)}</p><p class="text-sm font-bold text-slate-500">${fmt(p.score)}</p><div class="mt-2 flex w-full items-start justify-center rounded-t-xl pt-3 text-2xl font-extrabold text-slate-900 ${h} ${tone}">${[2, 1, 3][i]}</div></div>` : `<div class="w-1/3 max-w-[11rem]"></div>`))
      .join("");
    return shell(`${head}
      <div class="card mt-6 p-6 sm:p-10"><h2 class="text-center text-2xl font-extrabold text-slate-900">Kết quả cuối cùng</h2>
        <div class="mt-8 flex items-end justify-center gap-3">${podium}</div></div>
      <div class="mt-6"><h2 class="mb-3 text-lg font-extrabold text-slate-900">Toàn bộ bảng xếp hạng</h2>${leaderboardList(s.leaderboard, false)}</div>
      <div class="mt-6 flex flex-wrap gap-3"><a href="#/live/host" class="btn btn-primary"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i>Tạo trận mới</a><a href="#/live" class="btn btn-secondary">Về trang đấu trực tiếp</a></div>`);
  }

  /* ---------- Player ---------- */
  function playerScreen(s) {
    const me = s.me;
    const head = `<div class="flex items-center justify-between gap-3 text-sm"><span class="min-w-0 truncate font-bold text-slate-900"><i class="fa-solid fa-user mr-1.5 text-indigo-600" aria-hidden="true"></i>${esc(me.name)}</span><span class="flex-none font-extrabold text-slate-900">${fmt(me.score)} điểm</span></div>`;

    if (s.phase === "lobby")
      return shell(`${head}<div class="card mt-6 p-8 text-center">
        <span class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-2xl text-indigo-600"><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i></span>
        <h1 class="mt-4 text-2xl font-extrabold text-slate-900">Bạn đã vào phòng ${esc(s.code)}</h1>
        <p class="mt-2 text-slate-600">${esc(s.title)} · ${s.total} câu · ${s.timeSec} giây mỗi câu</p>
        <p class="mt-1 text-slate-500">Đang chờ người tổ chức bắt đầu…</p>
        <p class="mt-5 text-sm font-semibold text-slate-500"><span id="live-players">${s.playerCount}</span> người chơi trong phòng</p>
        <ul id="live-names" class="mt-4 flex flex-wrap justify-center gap-2" aria-live="polite"></ul></div>`, "max-w-2xl");

    if (s.phase === "question") {
      if (me.answered || L.localChoice)
        return shell(`${head}<div class="card mt-6 p-8 text-center"><span class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600"><i class="fa-solid fa-circle-check" aria-hidden="true"></i></span>
          <h1 class="mt-4 text-2xl font-extrabold text-slate-900">Đã gửi đáp án ${esc(me.choice || L.localChoice)}</h1><p class="mt-2 text-slate-600">Chờ các bạn khác hoặc hết giờ để xem kết quả.</p>
          <p class="mt-4 text-sm font-semibold text-slate-500"><span id="live-answered">0/0</span> đã trả lời</p></div>`, "max-w-2xl");
      return shell(`${head}<div class="mt-5 grid gap-4">${timerBlock(s)}
        <div class="card p-5"><p class="text-xs font-bold uppercase tracking-wide text-slate-500">Câu ${s.qIndex + 1}/${s.total}</p><p class="mt-1.5 text-lg font-extrabold leading-snug text-slate-900">${esc(s.question.text)}</p></div>
        <div class="grid gap-3">${LETTERS.map((k) => `<button type="button" data-live="answer" data-choice="${k}" class="flex min-h-[4rem] items-center gap-3 rounded-2xl px-4 py-3 text-left text-white transition active:scale-[.98] ${OPT[k].bg}"><span class="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-black/20"><i class="fa-solid ${OPT[k].icon} ${OPT[k].rotate}" aria-hidden="true"></i></span><span class="flex-1 font-bold leading-snug"><span class="sr-only">Đáp án ${k}: </span>${esc(s.question.options[k])}</span></button>`).join("")}</div></div>`, "max-w-2xl");
    }

    if (s.phase === "reveal") {
      const ok = me.answered && me.wasCorrect;
      const q = s.question;
      return shell(`${head}<div class="mt-5 grid gap-4">
        <div class="rounded-3xl p-8 text-center text-white ${ok ? "bg-emerald-600" : "bg-rose-600"}">
          <i class="fa-solid ${ok ? "fa-circle-check" : me.answered ? "fa-circle-xmark" : "fa-clock"} text-5xl" aria-hidden="true"></i>
          <h1 class="mt-3 text-3xl font-extrabold">${ok ? "Chính xác!" : me.answered ? "Chưa đúng" : "Hết giờ"}</h1>
          ${ok ? `<p class="mt-1 text-lg font-bold">+${fmt(me.gained)} điểm${me.streak >= 2 ? ` · chuỗi ${me.streak} câu` : ""}</p>` : `<p class="mt-1 font-semibold text-white/90">Đáp án đúng: ${q.correct}. ${esc(q.options[q.correct])}</p>`}
        </div>
        <div class="grid grid-cols-2 gap-3 text-center"><div class="card p-4"><p class="text-xs font-semibold text-slate-500">Hạng hiện tại</p><p class="text-3xl font-extrabold text-slate-900">${me.rank}<span class="text-base text-slate-400">/${s.playerCount}</span></p></div><div class="card p-4"><p class="text-xs font-semibold text-slate-500">Tổng điểm</p><p class="text-3xl font-extrabold text-slate-900">${fmt(me.score)}</p></div></div>
        ${q.explanation ? `<div class="rounded-2xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-700 ring-1 ring-slate-200"><p class="font-bold text-slate-900">Giải thích</p><p class="mt-1">${esc(q.explanation)}</p></div>` : ""}
        <p class="text-center text-sm font-semibold text-slate-500"><i class="fa-solid fa-circle-notch fa-spin mr-1.5" aria-hidden="true"></i>Chờ câu tiếp theo…</p></div>`, "max-w-2xl");
    }

    const top3 = me.rank <= 3 && s.playerCount > 2;
    return shell(`<div class="card p-8 text-center">
      <span class="mx-auto flex h-20 w-20 items-center justify-center rounded-full text-3xl ${top3 ? "bg-amber-100 text-amber-600" : "bg-indigo-100 text-indigo-600"}"><i class="fa-solid ${top3 ? "fa-trophy" : "fa-flag-checkered"}" aria-hidden="true"></i></span>
      <h1 class="mt-4 text-3xl font-extrabold text-slate-900">Hạng ${me.rank}/${s.playerCount}</h1>
      <p class="mt-1 text-slate-600">${esc(s.title)}</p>
      <dl class="mx-auto mt-6 grid max-w-sm grid-cols-2 gap-3"><div class="rounded-xl bg-slate-50 p-3"><dt class="text-xs font-semibold text-slate-500">Điểm</dt><dd class="text-xl font-extrabold text-slate-900">${fmt(me.score)}</dd></div><div class="rounded-xl bg-slate-50 p-3"><dt class="text-xs font-semibold text-slate-500">Câu đúng</dt><dd class="text-xl font-extrabold text-slate-900">${me.correct}/${s.total}</dd></div></dl></div>
      ${window.LabGame?.rewardHtml(L.reward) || ""}
      <div class="mt-5"><h2 class="mb-3 text-lg font-extrabold text-slate-900">Bảng xếp hạng</h2>${leaderboardList(s.leaderboard.slice(0, 10), false)}</div>
      <div class="mt-6 flex flex-wrap gap-3"><a href="#/live" class="btn btn-primary">Chơi trận khác</a><a href="#/profile" class="btn btn-secondary">Xem thành tích</a></div>`, "max-w-2xl");
  }

  /* =================================================================
   * Actions
   * ================================================================= */
  async function hostCommand(action) {
    try {
      await api("POST", { action, code: L.code, hostToken: L.host });
      clearTimeout(L.timer);
      const run = L.run;
      const state = await api("GET", null, { code: L.code, host: L.host });
      if (run === L.run) {
        L.offset = state.serverNow - Date.now();
        onState(state);
        if (state.phase !== "finished") L.timer = setTimeout(() => startRoom("host", L.code), 1500);
      }
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function sendAnswer(choice) {
    if (L.localChoice) return;
    L.localChoice = choice;
    onState({ ...L.state });
    try {
      await api("POST", { action: "answer", code: L.code, pid: L.pid, choice });
    } catch (e) {
      toast(e.message, "error");
      if (e.status !== 409) {
        L.localChoice = null;
        L.sig = "";
        onState({ ...L.state });
      }
    }
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-live]");
    if (!el) return;
    switch (el.dataset.live) {
      case "start": hostCommand("start"); break;
      case "next": hostCommand("next"); break;
      case "answer": sendAnswer(el.dataset.choice); break;
      case "copy":
        navigator.clipboard?.writeText(el.dataset.text).then(() => toast("Đã sao chép liên kết", "success"), () => toast("Không sao chép được", "error"));
        break;
      case "end-ask":
        openModal(`<div class="p-6 sm:p-7"><h2 id="modal-title" class="text-xl font-extrabold text-slate-900">Kết thúc trận đấu?</h2><p class="mt-3 text-slate-600">Trận sẽ dừng ngay và hiển thị bảng xếp hạng hiện tại cho mọi người.</p>
          <div class="mt-6 flex justify-end gap-2.5"><button type="button" class="btn btn-ghost" data-action="close-modal" autofocus>Tiếp tục</button><button type="button" class="btn btn-danger" data-live="end">Kết thúc</button></div></div>`);
        break;
      case "end": closeModal(); hostCommand("end"); break;
    }
  });

  document.addEventListener("submit", (e) => {
    if (e.target.id === "live-join-form") {
      e.preventDefault();
      submitJoin(e.target);
    } else if (e.target.id === "live-setup") {
      e.preventDefault();
      createRoom(e.target);
    }
  });

  document.addEventListener("change", (e) => {
    const form = e.target.closest("#live-setup");
    if (!form) return;
    const sourceChanged = e.target.name === "source";
    const topicsChanged = e.target.name === "subject" || e.target.name === "grade";
    readSetup(form);
    if (sourceChanged) renderHostSetup();
    else {
      if (topicsChanged) {
        setup.topic = "all";
        $("#s-topic").innerHTML = topicOptions();
      }
      updateSetupSummary();
    }
  });

  document.addEventListener("input", (e) => {
    if (e.target.id === "join-code") e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
  });

  window.addEventListener("hashchange", () => {
    if (!/^#\/live\/(room|play)\//.test(location.hash)) stopPolling();
  });

  window.LabFeatures = Object.assign(window.LabFeatures || {}, {
    live(rest) {
      const [sub, code = ""] = rest;
      if (sub === "host") return renderHostSetup();
      if (sub === "join") return renderLanding(code.replace(/\D/g, "").slice(0, 6));
      if (sub === "room" && /^\d{6}$/.test(code)) return startRoom("host", code);
      if (sub === "play" && /^\d{6}$/.test(code)) return startRoom("play", code);
      return renderLanding();
    },
  });
  if ((location.hash || "").startsWith("#/live")) App.route();
})();
