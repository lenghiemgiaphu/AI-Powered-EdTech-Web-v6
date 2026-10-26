const AITutor = (() => {
  const isConfigured = () =>
    typeof config !== "undefined" && !!config.GEMINI_API_KEY && !/YOUR_KEY_HERE/.test(config.GEMINI_API_KEY);

  function systemPrompt(ctx) {
    return [
      "Bạn là gia sư Vật lí, Hóa học, Sinh học THPT thân thiện, trả lời bằng tiếng Việt, ngắn gọn và dễ hiểu.",
      "Hãy giải thích từng bước, nêu rõ kiến thức/công thức liên quan, và chỉ ra lỗi sai thường gặp khi phù hợp.",
      "Không bịa đặt dữ kiện. Nếu chưa chắc chắn, hãy nói rõ.",
      "",
      "BỐI CẢNH CÂU HỎI:",
      `Môn: ${ctx.subjectLabel} - Lớp ${ctx.grade} - Chuyên đề: ${ctx.topic}`,
      `Câu hỏi: ${ctx.questionText}`,
      ctx.optionsText ? `Các lựa chọn:\n${ctx.optionsText}` : "",
      `Đáp án đúng: ${ctx.correctAnswerText}`,
      `Học sinh đã trả lời: ${ctx.userAnswerText}`,
      `Giải thích có sẵn: ${ctx.explanation}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function ask(ctx, history) {
    if (!isConfigured()) {
      const err = new Error("missing-key");
      err.code = "ai/missing-key";
      throw err;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.GEMINI_MODEL || "gemini-2.5-flash"}:generateContent`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": config.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt(ctx) }] },
        contents: history.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
        generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
      }),
    });

    if (!response.ok) {
      const err = new Error(`gemini-${response.status}`);
      err.code = `ai/http-${response.status}`;
      throw err;
    }

    const data = await response.json();
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
    if (!text) {
      const err = new Error("empty");
      err.code = "ai/empty";
      throw err;
    }
    return text;
  }

  function errorMessage(error) {
    switch (error && error.code) {
      case "ai/missing-key":
        return "Chưa cấu hình GEMINI_API_KEY. Hãy mở file config.js và thay YOUR_KEY_HERE bằng API key của bạn để bật Gia sư AI.";
      case "ai/http-400":
      case "ai/http-403":
        return "API key không hợp lệ hoặc không có quyền truy cập. Hãy kiểm tra lại GEMINI_API_KEY trong config.js.";
      case "ai/http-429":
        return "Đã vượt quá giới hạn yêu cầu. Vui lòng thử lại sau ít phút.";
      case "ai/empty":
        return "AI không trả về nội dung. Hãy thử đặt câu hỏi theo cách khác.";
      default:
        return "Không thể kết nối tới AI. Vui lòng kiểm tra mạng và thử lại.";
    }
  }

  return { ask, isConfigured, errorMessage };
})();
