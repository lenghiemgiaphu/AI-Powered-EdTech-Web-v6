/* Export exam papers (PDF via print dialog, Word .doc) for printing on paper. */
(() => {
  "use strict";

  const App = window.LabApp;
  const { $, esc, openModal, closeModal, toast } = App;

  const PART_INFO = {
    multiple_choice: "Câu trắc nghiệm nhiều phương án lựa chọn. Mỗi câu chỉ chọn một phương án.",
    true_false: "Câu trắc nghiệm đúng sai. Trong mỗi ý a), b), c), d) của mỗi câu, chọn Đúng hoặc Sai.",
    short_answer: "Câu trắc nghiệm trả lời ngắn. Ghi đáp án cuối cùng vào chỗ trống.",
    drag_drop: "Câu hỏi ghép đôi. Ghi chữ cái của đáp án phù hợp vào ô trống ở mỗi ý.",
  };
  const ROMAN = ["I", "II", "III", "IV"];

  /* ------------------------------------------------------------------ helpers */
  const hash = (s) => {
    let h = 2166136261;
    for (const c of String(s)) {
      h ^= c.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  const seeded = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const shuffle = (arr, rand = Math.random) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const slug = (s) =>
    String(s)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/gi, "d")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "de-thi";
  const text = (s) => esc(s).replace(/\n/g, "<br>");
  const letter = (i) => String.fromCharCode(65 + i);
  const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

  const ddChips = (q) => shuffle([...q.slots.map((s) => s.answer), ...(q.distractors || [])], seeded(hash(q.id)));

  /* ------------------------------------------------------------------ build paper */
  function arrange(pool, { count, shuffleOrder }) {
    let list = [...pool];
    if (count < list.length) {
      const keep = new Set(shuffle(list).slice(0, count));
      list = list.filter((q) => keep.has(q));
    }
    if (shuffleOrder) list = shuffle(list);
    const order = Object.keys(QUESTION_TYPES).sort((a, b) => QUESTION_TYPES[a].order - QUESTION_TYPES[b].order);
    return order.map((type) => ({ type, items: list.filter((q) => q.type === type) })).filter((g) => g.items.length);
  }

  function renderQuestion(q, n) {
    const head = `<p class="q"><b>Câu ${n}.</b> ${text(q.questionText)}</p>`;
    if (q.type === "multiple_choice") {
      const entries = Object.entries(q.options);
      const longest = Math.max(...entries.map(([, v]) => String(v).length));
      const cols = longest <= 18 ? 4 : longest <= 42 ? 2 : 1;
      const rows = chunk(entries, cols)
        .map((row) => `<tr>${row.map(([k, v]) => `<td style="width:${100 / cols}%"><b>${k}.</b> ${text(v)}</td>`).join("")}</tr>`)
        .join("");
      return `<div class="qw">${head}<table class="opts">${rows}</table></div>`;
    }
    if (q.type === "true_false") {
      const rows = q.statements
        .map((s, i) => `<tr><td>${"abcd"[i]}) ${text(s.text)}</td><td class="c">&nbsp;</td><td class="c">&nbsp;</td></tr>`)
        .join("");
      return `<div class="qw">${head}<table class="tf"><tr><th></th><th class="c">Đúng</th><th class="c">Sai</th></tr>${rows}</table></div>`;
    }
    if (q.type === "short_answer") {
      return `<div class="qw">${head}<p class="ans">Đáp án: ……………………………………………</p></div>`;
    }
    const chips = ddChips(q);
    const slots = q.slots
      .map((s, i) => `<tr><td class="n">${i + 1}.</td><td>${text(s.prompt)}</td><td class="box">&nbsp;</td></tr>`)
      .join("");
    const bank = chunk(chips.map((c, i) => `<b>${letter(i)}.</b> ${text(c)}`), 2)
      .map((row) => `<tr>${row.map((c) => `<td style="width:50%">${c}</td>`).join("")}</tr>`)
      .join("");
    return `<div class="qw">${head}<table class="dd">${slots}</table><p class="bankhd"><i>Danh sách đáp án:</i></p><table class="opts">${bank}</table></div>`;
  }

  const answerOf = (q) => {
    if (q.type === "multiple_choice") return q.correctAnswer;
    if (q.type === "true_false") return q.statements.map((s, i) => `${"abcd"[i]}-${s.isTrue ? "Đ" : "S"}`).join(", ");
    if (q.type === "short_answer") return q.correctAnswer;
    const chips = ddChips(q);
    return q.slots.map((s, i) => `${i + 1}-${letter(chips.indexOf(s.answer))}`).join(", ");
  };

  const CSS = `
    body{font-family:"Times New Roman",Times,"Liberation Serif","Noto Serif","DejaVu Serif",serif;font-size:13pt;line-height:1.4;color:#000;margin:0}
    p{margin:0}
    .hd{text-align:center;margin-bottom:10pt}
    .hd .school{font-weight:bold}
    .hd .title{font-weight:bold;font-size:16pt;margin:6pt 0 2pt}
    .who{margin:10pt 0 4pt;text-align:left}
    hr{border:0;border-top:1px solid #000;margin:8pt 0}
    .part{font-weight:bold;margin:14pt 0 1pt;page-break-after:avoid}
    .partnote{font-style:italic;margin:0 0 6pt;page-break-after:avoid}
    .qw{page-break-inside:avoid;margin:7pt 0}
    .q{margin:0 0 3pt}
    table{border-collapse:collapse;width:100%}
    .opts td{vertical-align:top;padding:1pt 8pt 1pt 0}
    .tf th,.tf td{border:1px solid #000;padding:3pt 6pt;vertical-align:top;text-align:left}
    .tf th.c,.tf td.c{width:52pt;text-align:center}
    .dd td{padding:3pt 4pt;vertical-align:top}
    .dd td.n{width:22pt}
    .dd td.box{width:56pt;border:1px solid #000}
    .bankhd{margin:5pt 0 2pt}
    .ans{margin:4pt 0 0}
    .end{text-align:center;font-weight:bold;margin-top:16pt}
    h2.pb{page-break-before:always;text-align:center;font-size:15pt;margin:0 0 8pt}
    .key td{padding:2pt 6pt 2pt 0;vertical-align:top}
    .sol{margin:4pt 0}
    .sol i{color:#333}
    @page{size:A4;margin:2cm}
  `;

  function buildHtml(o, groups, { word }) {
    let n = 0;
    const body = groups
      .map((g, gi) => {
        const qs = g.items.map((q) => renderQuestion(q, ++n)).join("");
        return `<p class="part">PHẦN ${ROMAN[gi]}.</p><p class="partnote">${esc(PART_INFO[g.type])}</p>${qs}`;
      })
      .join("");

    const header = `<div class="hd">
      ${o.school ? `<p class="school">${esc(o.school).toUpperCase()}</p>` : ""}
      <p class="title">${esc(o.title).toUpperCase()}</p>
      ${o.meta ? `<p>${esc(o.meta)}</p>` : ""}
      <p><i>Thời gian làm bài: ${o.minutes} phút (không kể thời gian phát đề)</i></p>
    </div>
    ${o.nameLine ? `<p class="who">Họ và tên: …………………………………………… Lớp: …………… Số báo danh: …………</p><hr>` : ""}`;

    let key = "";
    if (o.answers) {
      let k = 0;
      const parts = groups
        .map((g, gi) => {
          const items = g.items.map((q) => ({ n: ++k, q, ans: answerOf(q) }));
          let inner;
          if (o.explain) {
            inner = items
              .map((it) => `<div class="sol"><b>Câu ${it.n}.</b> ${esc(it.ans)}${it.q.explanation ? `<br><i>${text(it.q.explanation)}</i>` : ""}</div>`)
              .join("");
          } else {
            const cols = g.type === "multiple_choice" || g.type === "short_answer" ? 5 : 2;
            inner = `<table class="key">${chunk(items, cols)
              .map((row) => `<tr>${row.map((it) => `<td style="width:${100 / cols}%"><b>${it.n}.</b> ${esc(it.ans)}</td>`).join("")}</tr>`)
              .join("")}</table>`;
          }
          return `<p class="part">PHẦN ${ROMAN[gi]}.</p>${inner}`;
        })
        .join("");
      key = `<h2 class="pb">ĐÁP ÁN${o.explain ? " VÀ LỜI GIẢI" : ""}</h2><p style="text-align:center"><i>${esc(o.title)}</i></p>${parts}`;
    }

    const wordHead = word
      ? `<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
         <style>@page WordSection1{size:21.0cm 29.7cm;margin:2cm}div.WordSection1{page:WordSection1}</style>`
      : "";
    const ns = word ? ' xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"' : "";
    return `<!DOCTYPE html><html lang="vi"${ns}><head><meta charset="utf-8"><title>${esc(o.title)}</title>${wordHead}<style>${CSS}</style></head>
      <body><div class="WordSection1">${header}${body}<p class="end">— HẾT —</p>${key}</div></body></html>`;
  }

  /* ------------------------------------------------------------------ output */
  function downloadWord(html, name) {
    const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.doc`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function printPdf(html) {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(frame);
    frame.onload = () => {
      setTimeout(() => {
        try {
          frame.contentWindow.focus();
          frame.contentWindow.print();
        } catch {
          const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
          window.open(url, "_blank");
          toast("Đã mở đề ở thẻ mới. Nhấn Ctrl/Cmd + P để in hoặc lưu PDF.", "info");
        }
        setTimeout(() => frame.remove(), 60000);
      }, 300);
    };
    frame.srcdoc = html;
  }

  /* ------------------------------------------------------------------ dialog */
  let session = null;

  function describe(questions) {
    const subjects = [...new Set(questions.map((q) => q.subject).filter(Boolean))];
    const grades = [...new Set(questions.map((q) => q.grade).filter(Boolean))];
    const subjectLabel = subjects.length === 1 ? SUBJECTS[subjects[0]]?.label || subjects[0] : "Tổng hợp";
    return `Môn: ${subjectLabel}${grades.length === 1 ? ` – Lớp ${grades[0]}` : ""}`;
  }

  const toggle = (id, label, checked) => `<label class="check-chip">
      <input class="sr-only" type="checkbox" id="${id}" ${checked ? "checked" : ""}>
      <span>${label}</span>
    </label>`;

  function readOptions() {
    const total = session.pool.length;
    const count = Math.min(total, Math.max(1, Number($("#ex-count").value) || total));
    return {
      title: $("#ex-title").value.trim() || session.title,
      school: $("#ex-school").value.trim(),
      minutes: Math.max(1, Number($("#ex-minutes").value) || session.minutes),
      count,
      shuffleOrder: $("#ex-shuffle").checked,
      nameLine: $("#ex-name").checked,
      answers: $("#ex-answers").checked,
      explain: $("#ex-explain").checked,
      meta: session.meta,
    };
  }

  function updateSummary() {
    const o = readOptions();
    const counts = Object.entries(
      session.pool.reduce((acc, q) => ((acc[q.type] = (acc[q.type] || 0) + 1), acc), {})
    );
    const share = o.count / session.pool.length;
    $("#ex-summary").innerHTML =
      o.count === session.pool.length
        ? `Đề gồm <strong class="text-slate-900">${o.count} câu</strong>: ${counts.map(([t, c]) => `${QUESTION_TYPES[t].label} ${c}`).join(" · ")}.`
        : `Chọn ngẫu nhiên <strong class="text-slate-900">${o.count}/${session.pool.length} câu</strong> (${Math.round(share * 100)}% ngân hàng).`;
    $("#ex-explain").disabled = !o.answers;
    $("#ex-explain").closest("label").classList.toggle("is-disabled", !o.answers);
  }

  function open({ title, questions, minutes, school = "" }) {
    const pool = (questions || []).filter(Boolean);
    if (!pool.length) return toast("Không có câu hỏi nào để xuất.", "error");
    const defaultMinutes = minutes || Math.max(15, Math.ceil((pool.length * 1.5) / 5) * 5);
    session = { pool, title, minutes: defaultMinutes, meta: describe(pool) };

    openModal(
      `<div class="p-6 sm:p-7">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 id="modal-title" class="text-xl font-extrabold tracking-tight text-slate-900">Xuất đề để in</h2>
            <p class="mt-1 text-sm text-slate-500">${esc(session.meta)} · ${pool.length} câu có sẵn</p>
          </div>
          <button type="button" data-action="close-modal" class="-mr-2 -mt-2 flex h-9 w-9 flex-none items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Đóng"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        </div>
        <div class="mt-5 grid gap-3.5">
          <div><label for="ex-title" class="mb-1.5 block text-sm font-semibold text-slate-700">Tên đề thi</label>
            <input id="ex-title" class="field" value="${esc(title)}" autocomplete="off"></div>
          <div><label for="ex-school" class="mb-1.5 block text-sm font-semibold text-slate-700">Trường / đơn vị <span class="font-normal text-slate-400">(tùy chọn)</span></label>
            <input id="ex-school" class="field" value="${esc(school)}" placeholder="VD: Trường THPT Nguyễn Huệ" autocomplete="off"></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label for="ex-minutes" class="mb-1.5 block text-sm font-semibold text-slate-700">Thời gian (phút)</label>
              <input id="ex-minutes" type="number" min="1" max="300" class="field" value="${defaultMinutes}"></div>
            <div><label for="ex-count" class="mb-1.5 block text-sm font-semibold text-slate-700">Số câu</label>
              <input id="ex-count" type="number" min="1" max="${pool.length}" class="field" value="${pool.length}"></div>
          </div>
          <fieldset><legend class="sr-only">Tùy chọn trình bày</legend>
            <div class="flex flex-wrap gap-2">
              ${toggle("ex-shuffle", "Xáo trộn thứ tự câu", false)}
              ${toggle("ex-name", "Dòng Họ tên / Lớp / SBD", true)}
              ${toggle("ex-answers", "Kèm đáp án (trang cuối)", true)}
              ${toggle("ex-explain", "Kèm lời giải", false)}
            </div>
          </fieldset>
        </div>
        <p id="ex-summary" class="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600" aria-live="polite"></p>
        <div class="mt-5 flex flex-wrap justify-end gap-2.5">
          <button type="button" class="btn btn-secondary" data-export-do="word"><i class="fa-regular fa-file-word" aria-hidden="true"></i>Tải file Word</button>
          <button type="button" class="btn btn-primary" data-export-do="pdf"><i class="fa-regular fa-file-pdf" aria-hidden="true"></i>Xuất PDF / In</button>
        </div>
        <p class="mt-3 text-xs leading-relaxed text-slate-500">PDF: hộp thoại in sẽ mở, chọn “Lưu dưới dạng PDF” hoặc máy in. Word: tệp .doc mở được bằng Word, Google Docs và LibreOffice để bạn chỉnh sửa tiếp.</p>
      </div>`,
      { size: "lg" }
    );
    updateSummary();
  }

  function run(kind) {
    const o = readOptions();
    const groups = arrange(session.pool, o);
    const html = buildHtml(o, groups, { word: kind === "word" });
    if (kind === "word") {
      downloadWord(html, slug(o.title));
      toast("Đã tải file Word.", "success");
    } else {
      printPdf(html);
    }
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-export-do]");
    if (btn && session) run(btn.dataset.exportDo);
  });
  document.addEventListener("input", (e) => {
    if (session && e.target.closest("#modal-root") && e.target.id?.startsWith("ex-")) updateSummary();
  });
  document.addEventListener("change", (e) => {
    if (session && e.target.id?.startsWith("ex-")) updateSummary();
  });

  window.LabExport = { open, closeModal };
})();
