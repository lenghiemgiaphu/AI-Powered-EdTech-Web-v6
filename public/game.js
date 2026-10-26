/* Gamification: streak, XP, level and badges (#/profile). Loaded after app.js. */
(() => {
  const App = window.LabApp;
  if (!App) return;
  const { $, view, esc, toast, bankById } = App;

  const uid = () => (typeof Auth !== "undefined" && Auth.user ? Auth.user.uid : "guest");
  const KEY = () => `labluyen_game_${uid()}`;

  const LEVEL_BASE = 60;
  const levelFloor = (level) => LEVEL_BASE * (level - 1) ** 2;
  const levelOf = (xp) => Math.floor(Math.sqrt(Math.max(0, xp) / LEVEL_BASE)) + 1;
  const LEVEL_TITLES = [
    "Tân binh phòng thí nghiệm", "Thực tập sinh", "Trợ lý nghiên cứu", "Nhà thực nghiệm", "Nhà khoa học trẻ",
    "Chuyên gia", "Giáo sư", "Viện sĩ", "Nhà tiên phong", "Huyền thoại khoa học",
  ];
  const titleOf = (level) => LEVEL_TITLES[Math.min(Math.floor((level - 1) / 2), LEVEL_TITLES.length - 1)];

  const dayKey = (d = new Date()) => {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const shiftDay = (key, delta) => {
    const [y, m, d] = key.split("-").map(Number);
    return dayKey(new Date(y, m - 1, d + delta));
  };

  const blank = () => ({
    xp: 0,
    streak: { current: 0, best: 0, lastDay: null },
    days: [],
    badges: {},
    stats: { attempts: 0, exams: 0, questions: 0, correct: 0, perfect: 0, ai: 0, liveGames: 0, liveWins: 0, livePodium: 0, bestLiveStreak: 0, subjects: [], night: 0, early: 0 },
    log: [],
    liveAwarded: [],
  });

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY()) || "null");
      if (!raw) return blank();
      const base = blank();
      return { ...base, ...raw, streak: { ...base.streak, ...raw.streak }, stats: { ...base.stats, ...raw.stats } };
    } catch {
      return blank();
    }
  }
  const save = (state) => {
    try {
      localStorage.setItem(KEY(), JSON.stringify(state));
    } catch {
      /* storage full: progress simply is not persisted */
    }
  };

  const BADGES = [
    { id: "first-step", name: "Bước đầu tiên", icon: "fa-seedling", tone: "emerald", desc: "Hoàn thành bài luyện tập hoặc bài thi đầu tiên.", check: (s) => s.stats.attempts >= 1 },
    { id: "streak-3", name: "Khởi động", icon: "fa-fire", tone: "amber", desc: "Duy trì chuỗi học 3 ngày liên tiếp.", check: (s) => s.streak.best >= 3, progress: (s) => [s.streak.best, 3] },
    { id: "streak-7", name: "Một tuần bền bỉ", icon: "fa-fire-flame-curved", tone: "orange", desc: "Duy trì chuỗi học 7 ngày liên tiếp.", check: (s) => s.streak.best >= 7, progress: (s) => [s.streak.best, 7] },
    { id: "streak-30", name: "Thói quen thép", icon: "fa-medal", tone: "rose", desc: "Duy trì chuỗi học 30 ngày liên tiếp.", check: (s) => s.streak.best >= 30, progress: (s) => [s.streak.best, 30] },
    { id: "correct-50", name: "Chính xác 50", icon: "fa-bullseye", tone: "sky", desc: "Trả lời đúng 50 câu hỏi.", check: (s) => s.stats.correct >= 50, progress: (s) => [s.stats.correct, 50] },
    { id: "correct-300", name: "Cỗ máy kiến thức", icon: "fa-brain", tone: "indigo", desc: "Trả lời đúng 300 câu hỏi.", check: (s) => s.stats.correct >= 300, progress: (s) => [s.stats.correct, 300] },
    { id: "perfect", name: "Điểm tuyệt đối", icon: "fa-star", tone: "amber", desc: "Đạt 10/10 trong một bài có từ 5 câu trở lên.", check: (s) => s.stats.perfect >= 1 },
    { id: "exam-3", name: "Chiến binh phòng thi", icon: "fa-file-pen", tone: "violet", desc: "Hoàn thành 3 đề thi thử.", check: (s) => s.stats.exams >= 3, progress: (s) => [s.stats.exams, 3] },
    { id: "all-subjects", name: "Tam giác khoa học", icon: "fa-atom", tone: "teal", desc: "Luyện tập cả Vật lí, Hóa học và Sinh học.", check: (s) => ["Physics", "Chemistry", "Biology"].every((x) => s.stats.subjects.includes(x)), progress: (s) => [["Physics", "Chemistry", "Biology"].filter((x) => s.stats.subjects.includes(x)).length, 3] },
    { id: "ai-quiz", name: "Bạn của AI", icon: "fa-wand-magic-sparkles", tone: "violet", desc: "Hoàn thành một bộ quiz do AI tạo.", check: (s) => s.stats.ai >= 1 },
    { id: "level-5", name: "Nhà khoa học trẻ", icon: "fa-flask-vial", tone: "sky", desc: "Đạt cấp độ 5.", check: (s) => levelOf(s.xp) >= 5, progress: (s) => [levelOf(s.xp), 5] },
    { id: "level-10", name: "Bậc thầy", icon: "fa-crown", tone: "amber", desc: "Đạt cấp độ 10.", check: (s) => levelOf(s.xp) >= 10, progress: (s) => [levelOf(s.xp), 10] },
    { id: "live-player", name: "Lên sàn đấu", icon: "fa-gamepad", tone: "rose", desc: "Tham gia một trận đấu trắc nghiệm trực tiếp.", check: (s) => s.stats.liveGames >= 1 },
    { id: "live-podium", name: "Đứng trên bục", icon: "fa-trophy", tone: "orange", desc: "Vào top 3 của một trận đấu trực tiếp.", check: (s) => s.stats.livePodium >= 1 },
    { id: "live-champion", name: "Quán quân", icon: "fa-chess-king", tone: "amber", desc: "Giành hạng nhất trong một trận đấu trực tiếp.", check: (s) => s.stats.liveWins >= 1 },
    { id: "live-streak", name: "Chuỗi bất bại", icon: "fa-bolt", tone: "indigo", desc: "Trả lời đúng liên tiếp 5 câu trong trận đấu trực tiếp.", check: (s) => s.stats.bestLiveStreak >= 5, progress: (s) => [s.stats.bestLiveStreak, 5] },
    { id: "night-owl", name: "Cú đêm", icon: "fa-moon", tone: "indigo", desc: "Hoàn thành bài sau 22 giờ.", check: (s) => s.stats.night >= 1 },
    { id: "early-bird", name: "Chim sớm", icon: "fa-sun", tone: "amber", desc: "Hoàn thành bài trước 7 giờ sáng.", check: (s) => s.stats.early >= 1 },
  ];
  const TONES = {
    emerald: "bg-emerald-100 text-emerald-700", amber: "bg-amber-100 text-amber-700", orange: "bg-orange-100 text-orange-700",
    rose: "bg-rose-100 text-rose-700", sky: "bg-sky-100 text-sky-700", indigo: "bg-indigo-100 text-indigo-700",
    violet: "bg-violet-100 text-violet-700", teal: "bg-teal-100 text-teal-700",
  };

  function touchStreak(state) {
    const today = dayKey();
    const { streak } = state;
    if (streak.lastDay === today) return false;
    streak.current = streak.lastDay === shiftDay(today, -1) ? streak.current + 1 : 1;
    streak.best = Math.max(streak.best, streak.current);
    streak.lastDay = today;
    state.days = [...new Set([...state.days, today])].slice(-60);
    return true;
  }

  function currentStreak(state) {
    const today = dayKey();
    const { lastDay, current } = state.streak;
    if (lastDay === today || lastDay === shiftDay(today, -1)) return current;
    return 0;
  }

  function finalize(state, items, label) {
    const before = levelOf(state.xp);
    const earned = items.reduce((sum, i) => sum + i.xp, 0);
    state.xp += earned;
    const after = levelOf(state.xp);

    const newBadges = [];
    BADGES.forEach((b) => {
      if (!state.badges[b.id] && b.check(state)) {
        state.badges[b.id] = Date.now();
        newBadges.push(b);
      }
    });
    state.log = [{ at: Date.now(), label, xp: earned }, ...state.log].slice(0, 20);
    save(state);
    renderChip();

    if (after > before) toast(`Lên cấp ${after}: ${titleOf(after)}`, "success");
    newBadges.forEach((b) => toast(`Huy hiệu mới: ${b.name}`, "success"));
    return {
      xp: earned,
      items,
      level: { from: before, to: after, title: titleOf(after) },
      badges: newBadges.map((b) => ({ id: b.id, name: b.name, icon: b.icon, tone: b.tone })),
      streak: currentStreak(state),
      totalXp: state.xp,
    };
  }

  function award(attempt) {
    const answered = Object.keys(attempt.answers || {}).length;
    if (!answered || !attempt.total) return null;
    const state = load();
    const items = [{ label: attempt.type === "exam" ? "Hoàn thành đề thi" : "Hoàn thành bài luyện tập", xp: attempt.type === "exam" ? 40 : 10 }];

    if (attempt.correct) items.push({ label: `${attempt.correct} câu đúng hoàn toàn`, xp: Math.min(attempt.correct, 40) * 5 });
    const meaningful = attempt.total >= 5;
    if (meaningful && attempt.accuracy >= 80) items.push({ label: "Độ chính xác từ 80%", xp: 20 });
    if (meaningful && attempt.accuracy >= 99.9) items.push({ label: "Điểm tuyệt đối", xp: 40 });

    const extended = touchStreak(state);
    if (extended) items.push({ label: `Chuỗi ${state.streak.current} ngày`, xp: 10 + Math.min(state.streak.current, 7) * 5 });

    const s = state.stats;
    s.attempts += 1;
    if (attempt.type === "exam") s.exams += 1;
    s.questions += attempt.total;
    s.correct += attempt.correct;
    if (meaningful && attempt.accuracy >= 99.9) s.perfect += 1;
    if (attempt.practice?.aiQuiz) s.ai += 1;

    const subjects = new Set(s.subjects);
    (attempt.questionIds || []).forEach((id) => {
      const subject = bankById.get(id)?.subject;
      if (subject) subjects.add(subject);
    });
    s.subjects = [...subjects];
    const hour = new Date().getHours();
    if (hour >= 22) s.night += 1;
    if (hour < 7) s.early += 1;

    return finalize(state, items, attempt.title);
  }

  function awardLive({ code, rank, players, correct, total, bestStreak, title }) {
    const state = load();
    if (state.liveAwarded.includes(code)) return null;
    state.liveAwarded = [code, ...state.liveAwarded].slice(0, 30);

    const items = [{ label: "Tham gia trận đấu trực tiếp", xp: 30 }];
    if (correct) items.push({ label: `${correct}/${total} câu đúng`, xp: correct * 8 });
    if (rank === 1 && players > 1) items.push({ label: "Hạng nhất", xp: 80 });
    else if (rank <= 3 && players > 2) items.push({ label: `Hạng ${rank}`, xp: 40 });
    if (touchStreak(state)) items.push({ label: `Chuỗi ${state.streak.current} ngày`, xp: 10 + Math.min(state.streak.current, 7) * 5 });

    const s = state.stats;
    s.liveGames += 1;
    s.questions += total;
    s.correct += correct;
    if (rank === 1 && players > 1) s.liveWins += 1;
    if (rank <= 3 && players > 2) s.livePodium += 1;
    s.bestLiveStreak = Math.max(s.bestLiveStreak, bestStreak || 0);
    return finalize(state, items, `Đấu trực tiếp: ${title}`);
  }

  /* ---------- Navbar chip ---------- */
  function renderChip() {
    const host = $("#game-chip");
    if (!host) return;
    const state = load();
    const level = levelOf(state.xp);
    const streak = currentStreak(state);
    host.innerHTML = `<a href="#/profile" class="flex items-center gap-1 rounded-full border border-slate-200 bg-white py-1 pl-2.5 pr-1 text-sm font-bold text-slate-700 hover:border-indigo-300" aria-label="Chuỗi ${streak} ngày, cấp ${level}. Mở trang thành tích">
      <span class="flex items-center gap-1 ${streak ? "text-orange-500" : "text-slate-400"}"><i class="fa-solid fa-fire" aria-hidden="true"></i>${streak}</span>
      <span class="ml-1 rounded-full bg-indigo-600 px-2 py-0.5 text-xs text-white">Lv ${level}</span>
    </a>`;
  }

  /* ---------- Profile page ---------- */
  const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

  function renderProfile() {
    const state = load();
    const level = levelOf(state.xp);
    const floor = levelFloor(level);
    const next = levelFloor(level + 1);
    const pct = Math.round(((state.xp - floor) / (next - floor)) * 100);
    const streak = currentStreak(state);
    const today = dayKey();
    const doneToday = state.streak.lastDay === today;
    const earnedCount = Object.keys(state.badges).length;
    const accuracy = state.stats.questions ? Math.round((state.stats.correct / state.stats.questions) * 100) : 0;
    const C = 2 * Math.PI * 54;

    const week = Array.from({ length: 7 }, (_, i) => {
      const key = shiftDay(today, i - 6);
      const [y, m, d] = key.split("-").map(Number);
      return { key, label: WEEKDAYS[new Date(y, m - 1, d).getDay()], active: state.days.includes(key), today: key === today };
    });

    const badgeCards = BADGES.map((b) => {
      const got = state.badges[b.id];
      const prog = !got && b.progress ? b.progress(state) : null;
      return `<li class="card flex gap-3 p-4 ${got ? "" : "bg-slate-50/70"}">
        <span class="flex h-12 w-12 flex-none items-center justify-center rounded-2xl text-xl ${got ? TONES[b.tone] : "bg-slate-200 text-slate-400"}"><i class="fa-solid ${got ? b.icon : "fa-lock"}" aria-hidden="true"></i></span>
        <div class="min-w-0">
          <p class="font-bold ${got ? "text-slate-900" : "text-slate-500"}">${esc(b.name)}</p>
          <p class="mt-0.5 text-sm leading-snug text-slate-500">${esc(b.desc)}</p>
          ${got ? `<p class="mt-1.5 text-xs font-semibold text-emerald-600">Đã đạt ${new Date(got).toLocaleDateString("vi-VN")}</p>` : ""}
          ${prog ? `<div class="mt-2 flex items-center gap-2"><div class="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200"><div class="h-full rounded-full bg-indigo-500" style="width:${Math.min(100, Math.round((prog[0] / prog[1]) * 100))}%"></div></div><span class="text-xs font-semibold text-slate-500">${Math.min(prog[0], prog[1])}/${prog[1]}</span></div>` : ""}
        </div>
      </li>`;
    }).join("");

    const log = state.log.length
      ? state.log.map((l) => `<li class="flex items-center justify-between gap-3 py-2.5 text-sm"><span class="min-w-0 truncate text-slate-700">${esc(l.label)}</span><span class="flex-none font-bold text-indigo-600">+${l.xp} XP</span></li>`).join("")
      : `<li class="py-6 text-center text-sm text-slate-500">Chưa có hoạt động nào. Làm một bài luyện tập để nhận XP đầu tiên.</li>`;

    const xpGuide = [
      ["fa-list-check", "Hoàn thành bài luyện tập", "+10 XP"],
      ["fa-file-pen", "Hoàn thành đề thi thử", "+40 XP"],
      ["fa-check", "Mỗi câu đúng hoàn toàn", "+5 XP"],
      ["fa-bullseye", "Độ chính xác từ 80% / 100%", "+20 / +40 XP"],
      ["fa-fire", "Học ngày đầu tiên của chuỗi", "+15 đến +45 XP"],
      ["fa-gamepad", "Tham gia trận đấu trực tiếp", "+30 XP và thêm theo hạng"],
    ]
      .map(([icon, text, xp]) => `<li class="flex items-center gap-3 py-2.5 text-sm"><i class="fa-solid ${icon} w-5 text-center text-indigo-500" aria-hidden="true"></i><span class="flex-1 text-slate-700">${text}</span><span class="font-bold text-slate-900">${xp}</span></li>`)
      .join("");

    view.innerHTML = `
    <section class="mx-auto max-w-6xl px-4 pt-10">
      <p class="text-sm font-bold uppercase tracking-wide text-indigo-600">Thành tích</p>
      <h1 class="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Hành trình học tập của bạn</h1>
      <p class="mt-2 max-w-2xl text-slate-600">Mỗi ngày học, mỗi câu đúng đều được ghi nhận. Giữ chuỗi, tích lũy XP và mở khóa huy hiệu để duy trì thói quen ôn luyện.</p>

      <div class="mt-8 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div class="card flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
          <div class="relative mx-auto h-36 w-36 flex-none">
            <svg viewBox="0 0 120 120" class="h-full w-full -rotate-90" role="img" aria-label="Tiến độ lên cấp ${pct}%">
              <circle cx="60" cy="60" r="54" fill="none" stroke-width="10" stroke="#e2e8f0"></circle>
              <circle cx="60" cy="60" r="54" fill="none" stroke-width="10" stroke-linecap="round" stroke="#4f46e5" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct / 100)}"></circle>
            </svg>
            <div class="absolute inset-0 flex flex-col items-center justify-center"><span class="text-xs font-bold uppercase tracking-wide text-slate-500">Cấp</span><span class="text-4xl font-extrabold text-slate-900">${level}</span></div>
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-xl font-extrabold text-slate-900">${esc(titleOf(level))}</p>
            <p class="mt-1 text-sm text-slate-500">${state.xp.toLocaleString("vi-VN")} XP tích lũy</p>
            <div class="mt-4 h-3 overflow-hidden rounded-full bg-slate-100"><div class="h-full rounded-full bg-indigo-600" style="width:${pct}%"></div></div>
            <p class="mt-2 text-sm text-slate-600">Còn <strong>${(next - state.xp).toLocaleString("vi-VN")} XP</strong> để lên cấp ${level + 1}.</p>
          </div>
        </div>

        <div class="card p-6 sm:p-8">
          <div class="flex items-center gap-4">
            <span class="flex h-14 w-14 flex-none items-center justify-center rounded-2xl text-2xl ${streak ? "bg-orange-100 text-orange-500" : "bg-slate-100 text-slate-400"}"><i class="fa-solid fa-fire" aria-hidden="true"></i></span>
            <div>
              <p class="text-3xl font-extrabold text-slate-900">${streak} <span class="text-base font-bold text-slate-500">ngày liên tiếp</span></p>
              <p class="text-sm text-slate-500">Kỷ lục: ${state.streak.best} ngày</p>
            </div>
          </div>
          <ol class="mt-5 grid grid-cols-7 gap-1.5" aria-label="Hoạt động 7 ngày gần nhất">
            ${week.map((d) => `<li class="flex flex-col items-center gap-1.5"><span class="text-xs font-semibold ${d.today ? "text-indigo-600" : "text-slate-500"}">${d.label}</span><span class="flex h-9 w-9 items-center justify-center rounded-full text-sm ${d.active ? "bg-orange-500 text-white" : d.today ? "border-2 border-dashed border-indigo-300 text-indigo-300" : "bg-slate-100 text-slate-300"}"><i class="fa-solid ${d.active ? "fa-check" : "fa-fire"}" aria-hidden="true"></i><span class="sr-only">${d.active ? "Đã học" : "Chưa học"}</span></span></li>`).join("")}
          </ol>
          <p class="mt-4 text-sm ${doneToday ? "text-emerald-600" : "text-slate-600"}">${doneToday ? "Hôm nay bạn đã giữ chuỗi. Hẹn gặp lại ngày mai." : streak ? "Hoàn thành một bài hôm nay để giữ chuỗi." : "Bắt đầu một bài luyện tập để khởi động chuỗi mới."}</p>
          ${doneToday ? "" : `<a href="#/bank" class="btn btn-primary btn-sm mt-3"><i class="fa-solid fa-play" aria-hidden="true"></i>Luyện tập ngay</a>`}
        </div>
      </div>

      <dl class="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        ${[["Bài đã làm", state.stats.attempts], ["Câu đã trả lời", state.stats.questions], ["Độ chính xác", `${accuracy}%`], ["Trận đấu trực tiếp", state.stats.liveGames]]
          .map(([k, v]) => `<div class="card p-4"><dt class="text-xs font-semibold uppercase tracking-wide text-slate-500">${k}</dt><dd class="mt-1 text-2xl font-extrabold text-slate-900">${v}</dd></div>`)
          .join("")}
      </dl>
    </section>

    <section class="mx-auto max-w-6xl px-4 pt-12" aria-labelledby="badge-title">
      <div class="flex flex-wrap items-end justify-between gap-2"><h2 id="badge-title" class="text-2xl font-extrabold tracking-tight text-slate-900">Huy hiệu</h2><p class="text-sm font-semibold text-slate-500">${earnedCount}/${BADGES.length} đã mở khóa</p></div>
      <ul class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${badgeCards}</ul>
    </section>

    <section class="mx-auto grid max-w-6xl gap-5 px-4 pt-12 lg:grid-cols-2">
      <div class="card p-6"><h2 class="text-lg font-extrabold text-slate-900">Cách nhận XP</h2><ul class="mt-2 divide-y divide-slate-100">${xpGuide}</ul></div>
      <div class="card p-6"><h2 class="text-lg font-extrabold text-slate-900">Hoạt động gần đây</h2><ul class="mt-2 divide-y divide-slate-100">${log}</ul></div>
    </section>
    <p class="mx-auto max-w-6xl px-4 pt-6 text-xs text-slate-500">Tiến độ được lưu trên trình duyệt này, theo từng tài khoản đăng nhập.</p>`;
  }

  /* ---------- Reward panel shown on the result page ---------- */
  function rewardHtml(reward) {
    if (!reward) return "";
    return `<section class="card mt-5 overflow-hidden" aria-label="Phần thưởng">
      <div class="flex flex-wrap items-center justify-between gap-3 bg-indigo-600 px-5 py-3 text-white">
        <p class="flex items-center gap-2 font-extrabold"><i class="fa-solid fa-bolt" aria-hidden="true"></i>+${reward.xp} XP</p>
        <p class="text-sm font-semibold text-indigo-100">${reward.streak ? `<i class="fa-solid fa-fire mr-1 text-orange-300" aria-hidden="true"></i>Chuỗi ${reward.streak} ngày · ` : ""}Cấp ${reward.level.to} · ${esc(reward.level.title)}</p>
      </div>
      <div class="grid gap-4 p-5 sm:grid-cols-2">
        <ul class="divide-y divide-slate-100 text-sm">${reward.items.map((i) => `<li class="flex justify-between gap-3 py-2"><span class="text-slate-700">${esc(i.label)}</span><span class="font-bold text-indigo-600">+${i.xp}</span></li>`).join("")}</ul>
        <div>
          ${reward.level.to > reward.level.from ? `<p class="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700"><i class="fa-solid fa-arrow-up mr-1.5" aria-hidden="true"></i>Bạn đã lên cấp ${reward.level.to}!</p>` : ""}
          ${reward.badges.length ? `<p class="mt-3 text-sm font-bold text-slate-900">Huy hiệu mới</p><ul class="mt-2 flex flex-wrap gap-2">${reward.badges.map((b) => `<li class="inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-bold ${TONES[b.tone]}"><i class="fa-solid ${b.icon}" aria-hidden="true"></i>${esc(b.name)}</li>`).join("")}</ul>` : `<p class="text-sm text-slate-500">Tiếp tục luyện tập để mở khóa thêm huy hiệu.</p>`}
          <a href="#/profile" class="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-indigo-600 hover:underline">Xem thành tích<i class="fa-solid fa-arrow-right text-xs" aria-hidden="true"></i></a>
        </div>
      </div>
    </section>`;
  }

  window.LabGame = { award, awardLive, rewardHtml, renderChip, levelOf, titleOf };
  window.LabFeatures = Object.assign(window.LabFeatures || {}, { profile: renderProfile });

  renderChip();
  if (typeof Auth !== "undefined") Auth.onChange(renderChip);
  window.addEventListener("hashchange", renderChip);
  if ((location.hash || "").startsWith("#/profile")) renderProfile();
})();
