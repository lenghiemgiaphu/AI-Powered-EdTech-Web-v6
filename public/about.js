/* Introduction page (#/about): what LabLuyen is, who it is for, how each feature helps. Loaded after app.js. */
(() => {
  const App = window.LabApp;
  if (!App) return;
  const { view } = App;

  const FEATURES = [
    { icon: "fa-layer-group", tone: "bg-indigo-100 text-indigo-700", name: "Ngân hàng câu hỏi và đề thi thử", role: "Kho câu hỏi Lý, Hóa, Sinh lớp 10 đến 12 chia theo chuyên đề, mức độ và dạng câu; đề thi có đồng hồ đếm ngược như đề giấy.", effect: "Học sinh ôn đúng phần còn yếu, làm quen áp lực thời gian và cấu trúc đề trước kỳ thi thật." },
    { icon: "fa-wand-magic-sparkles", tone: "bg-violet-100 text-violet-700", name: "Quiz AI và gia sư AI", role: "Tạo bộ câu hỏi từ tệp, bài báo, video hoặc văn bản; giải thích từng bước khi học sinh chưa hiểu lời giải.", effect: "Giáo viên tiết kiệm thời gian soạn đề, học sinh có người giải đáp ngay khi cần thay vì bỏ dở câu khó." },
    { icon: "fa-chart-column", tone: "bg-rose-100 text-rose-700", name: "Thống kê chủ đề hay sai", role: "Tổng hợp kết quả theo chương, theo câu và theo học sinh bằng biểu đồ trực quan.", effect: "Giáo viên biết chính xác nội dung cần giảng lại; học sinh biết nên ôn gì trước." },
    { icon: "fa-fire", tone: "bg-orange-100 text-orange-600", name: "Chuỗi ngày học, XP, cấp độ và huy hiệu", role: "Ghi nhận mỗi ngày học, mỗi câu đúng bằng điểm kinh nghiệm, cấp độ và các huy hiệu cần mở khóa.", effect: "Biến việc ôn tập thành thói quen đều đặn: học ít mỗi ngày hiệu quả hơn dồn vào sát ngày thi." },
    { icon: "fa-gamepad", tone: "bg-rose-100 text-rose-700", name: "Đấu trắc nghiệm trực tiếp", role: "Giáo viên mở phòng, học sinh nhập mã trên điện thoại, trả lời cùng lúc với bảng xếp hạng cập nhật theo thời gian thực.", effect: "Kiểm tra nhanh tại lớp, tạo không khí thi đua lành mạnh và cho giáo viên thấy ngay tỉ lệ chọn từng đáp án." },
  ];

  const ROLES = [
    { icon: "fa-user-graduate", tone: "bg-sky-100 text-sky-700", title: "Học sinh", points: ["Luyện theo chuyên đề, xem lời giải và hỏi gia sư AI", "Thi thử có bấm giờ, biết điểm thang 10 và phần cần củng cố", "Giữ chuỗi ngày học, nhận XP và tham gia đấu cùng bạn bè"] },
    { icon: "fa-chalkboard-user", tone: "bg-amber-100 text-amber-700", title: "Giáo viên", points: ["Tạo quiz từ tài liệu giảng dạy chỉ trong vài phút", "Tổ chức kiểm tra trực tiếp tại lớp với bảng xếp hạng", "Xem thống kê để điều chỉnh bài giảng theo chỗ học sinh hay sai"] },
    { icon: "fa-people-roof", tone: "bg-emerald-100 text-emerald-700", title: "Phụ huynh và nhóm tự học", points: ["Theo dõi tiến bộ qua lịch sử làm bài và chuỗi ngày học", "Lập nhóm bạn học, mở phòng đấu để ôn tập cùng nhau", "Hoàn toàn miễn phí, không giới hạn số lần luyện"] },
  ];

  const WHY = [
    ["fa-rotate", "Nhớ lâu hơn nhờ tự kiểm tra", "Việc tự trả lời câu hỏi giúp ghi nhớ tốt hơn đọc lại tài liệu. Mỗi bài luyện tập đều bắt đầu từ việc bạn tự làm trước, xem đáp án sau."],
    ["fa-bolt", "Phản hồi ngay lập tức", "Biết đúng sai và hiểu vì sao ngay sau mỗi câu giúp sửa sai kịp thời, không để lỗi sai lặp lại."],
    ["fa-bullseye", "Ôn đúng chỗ còn yếu", "Thống kê theo chuyên đề giúp dồn thời gian vào phần kiến thức hay sai thay vì ôn dàn trải."],
    ["fa-calendar-check", "Thói quen học mỗi ngày", "Chuỗi ngày học và huy hiệu tạo động lực nhỏ nhưng đều, giúp việc ôn tập không bị gián đoạn."],
    ["fa-users", "Học cùng nhau", "Đấu trực tiếp biến giờ kiểm tra thành trò chơi, tăng hứng thú và sự tập trung của cả lớp."],
  ];

  const FAQ = [
    ["Tôi có cần đăng ký tài khoản không?", "Không bắt buộc. Bạn có thể luyện tập, thi thử và tham gia đấu trực tiếp ngay. Đăng nhập giúp tách riêng lịch sử và thành tích cho từng tài khoản trên trình duyệt."],
    ["XP, chuỗi ngày học và huy hiệu được lưu ở đâu?", "Tiến độ này lưu trên trình duyệt đang dùng, theo từng tài khoản đăng nhập. Phòng đấu trực tiếp được lưu tạm thời trên máy chủ và tự xóa sau vài giờ."],
    ["Mất bao lâu để giữ được chuỗi ngày học?", "Chỉ cần hoàn thành một bài luyện tập, đề thi hoặc trận đấu trong ngày. Bỏ lỡ một ngày, chuỗi sẽ bắt đầu lại từ đầu."],
    ["Một phòng đấu trực tiếp chứa được bao nhiêu người?", "Tối đa 200 người chơi, phù hợp cho một lớp học hoặc nhiều lớp cùng tham gia."],
    ["Kết quả AI có luôn chính xác không?", "AI hỗ trợ soạn câu hỏi và giải thích nhưng có thể sai sót. Giáo viên nên xem lại bộ quiz trước khi dùng chính thức."],
  ];

  function renderAbout() {
    view.innerHTML = `
    <section class="hero-bg">
      <div class="mx-auto max-w-6xl px-4 pb-14 pt-14">
        <p class="text-sm font-bold uppercase tracking-wide text-indigo-600">Giới thiệu LabLuyen</p>
        <h1 class="mt-3 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl">Nền tảng ôn thi Lý, Hóa, Sinh giúp học đều, hiểu sâu và thấy rõ tiến bộ</h1>
        <p class="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">LabLuyen kết hợp ngân hàng câu hỏi theo chương trình THPT, đề thi bấm giờ, trợ lý AI và yếu tố trò chơi hóa để học sinh luyện tập mỗi ngày, còn giáo viên nắm được lớp mình đang vướng ở đâu.</p>
        <div class="mt-7 flex flex-wrap gap-3"><a href="#/bank" class="btn btn-primary btn-lg">Bắt đầu luyện tập</a><a href="#/live" class="btn btn-secondary btn-lg"><i class="fa-solid fa-gamepad" aria-hidden="true"></i>Thử đấu trực tiếp</a></div>
      </div>
    </section>

    <section class="mx-auto max-w-6xl px-4 pt-14" aria-labelledby="roles-title">
      <h2 id="roles-title" class="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Dành cho ai</h2>
      <div class="mt-6 grid gap-5 md:grid-cols-3">
        ${ROLES.map((r) => `<article class="card p-6"><span class="flex h-12 w-12 items-center justify-center rounded-2xl text-xl ${r.tone}"><i class="fa-solid ${r.icon}" aria-hidden="true"></i></span><h3 class="mt-4 text-lg font-extrabold text-slate-900">${r.title}</h3>
          <ul class="mt-3 grid gap-2.5 text-sm text-slate-700">${r.points.map((p) => `<li class="flex gap-2.5"><i class="fa-solid fa-circle-check mt-0.5 text-emerald-500" aria-hidden="true"></i>${p}</li>`).join("")}</ul></article>`).join("")}
      </div>
    </section>

    <section class="mx-auto max-w-6xl px-4 pt-16" aria-labelledby="feat-title">
      <h2 id="feat-title" class="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Từng tính năng làm được gì</h2>
      <div class="mt-6 grid gap-4">
        ${FEATURES.map((f) => `<article class="card grid gap-4 p-5 sm:grid-cols-[auto_1fr_1fr] sm:items-start sm:p-6">
          <span class="flex h-12 w-12 items-center justify-center rounded-2xl text-xl ${f.tone}"><i class="fa-solid ${f.icon}" aria-hidden="true"></i></span>
          <div><h3 class="font-extrabold text-slate-900">${f.name}</h3><p class="mt-1 text-sm leading-relaxed text-slate-600"><strong class="text-slate-800">Vai trò:</strong> ${f.role}</p></div>
          <p class="text-sm leading-relaxed text-slate-600 sm:pt-7"><strong class="text-slate-800">Tác dụng:</strong> ${f.effect}</p></article>`).join("")}
      </div>
    </section>

    <section class="mx-auto max-w-6xl px-4 pt-16" aria-labelledby="why-title">
      <h2 id="why-title" class="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Vì sao cách học này hiệu quả</h2>
      <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        ${WHY.map(([icon, t, d]) => `<article class="card p-5"><i class="fa-solid ${icon} text-xl text-indigo-600" aria-hidden="true"></i><h3 class="mt-3 font-bold text-slate-900">${t}</h3><p class="mt-1.5 text-sm leading-relaxed text-slate-600">${d}</p></article>`).join("")}
      </div>
    </section>

    <section class="mx-auto max-w-3xl px-4 pt-16" aria-labelledby="faq-title">
      <h2 id="faq-title" class="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Câu hỏi thường gặp</h2>
      <div class="mt-6 grid gap-3">
        ${FAQ.map(([q, a]) => `<details class="card group p-5"><summary class="flex cursor-pointer list-none items-center justify-between gap-4 font-bold text-slate-900">${q}<i class="fa-solid fa-chevron-down text-xs text-slate-400 transition group-open:rotate-180" aria-hidden="true"></i></summary><p class="mt-3 text-sm leading-relaxed text-slate-600">${a}</p></details>`).join("")}
      </div>
    </section>`;
  }

  window.LabFeatures = Object.assign(window.LabFeatures || {}, { about: renderAbout });
  if ((location.hash || "").startsWith("#/about")) App.route();
})();
