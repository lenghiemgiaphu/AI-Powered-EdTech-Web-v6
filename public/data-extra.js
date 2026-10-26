/* Drag & drop questions + difficulty classification (loaded after data.js). */

// pairs: 5 x [prompt, correct answer]; distractors: 5 wrong answers. 10 chips in total.
const dd = (id, grade, subject, topic, questionText, pairs, distractors, explanation) => ({
  id, grade, subject, topic, type: "drag_drop", questionText,
  slots: pairs.map(([prompt, answer]) => ({ prompt, answer })),
  distractors,
  explanation,
});

questionBank.push(
  dd("phy_10_06", 10, "Physics", "Động học chất điểm",
    "Kéo mỗi đáp án vào ô mô tả hoặc công thức tương ứng.",
    [
      ["Quãng đường trong chuyển động thẳng đều", "s = v·t"],
      ["Vận tốc trong chuyển động thẳng biến đổi đều", "v = v₀ + a·t"],
      ["Quãng đường rơi tự do (v₀ = 0)", "s = ½·g·t²"],
      ["Đơn vị của gia tốc trong SI", "m/s²"],
      ["Đồ thị vận tốc – thời gian của chuyển động thẳng đều", "Đường thẳng song song trục thời gian"],
    ],
    ["s = v₀ + a·t", "v = v₀·t", "s = g·t", "m/s", "Đường parabol"],
    "Chuyển động thẳng đều: s = v·t và v không đổi nên đồ thị v–t là đường thẳng song song trục t. Chuyển động biến đổi đều: v = v₀ + a·t. Rơi tự do: s = ½gt². Gia tốc có đơn vị m/s²."),

  dd("phy_10_07", 10, "Physics", "Các định luật Newton",
    "Kéo mỗi đáp án vào nội dung tương ứng.",
    [
      ["Định luật I Newton (quán tính)", "Hợp lực bằng 0 thì vật giữ nguyên trạng thái chuyển động"],
      ["Định luật II Newton", "a = F/m"],
      ["Định luật III Newton", "Lực và phản lực cùng độ lớn, ngược chiều"],
      ["Đơn vị của lực trong SI", "Newton (N)"],
      ["Trọng lực tác dụng lên vật khối lượng m", "P = m·g"],
    ],
    ["a = F·m", "Lực và phản lực triệt tiêu nhau", "Kilôgam (kg)", "P = m/g", "Vật luôn chuyển động khi có lực tác dụng"],
    "Định luật II: a = F/m. Lực và phản lực đặt vào hai vật khác nhau nên không triệt tiêu. Lực đo bằng Newton, trọng lực P = m·g."),

  dd("che_10_05", 10, "Chemistry", "Cấu tạo nguyên tử",
    "Kéo mỗi đáp án vào ô mô tả đúng.",
    [
      ["Hạt mang điện dương trong nguyên tử", "Proton"],
      ["Hạt không mang điện", "Neutron"],
      ["Hạt mang điện âm", "Electron"],
      ["Số hiệu nguyên tử Z bằng", "Số proton"],
      ["Số khối A bằng", "Tổng số proton và neutron"],
    ],
    ["Photon", "Số neutron", "Tổng số proton và electron", "Số lớp electron", "Hiệu số neutron và proton"],
    "Proton (+), neutron (0), electron (−). Z = số proton = số electron (nguyên tử trung hòa); A = Z + N."),

  dd("che_10_06", 10, "Chemistry", "Liên kết hóa học",
    "Kéo mỗi loại liên kết vào đối tượng tương ứng.",
    [
      ["NaCl", "Liên kết ion"],
      ["H₂ (H–H)", "Liên kết cộng hóa trị không cực"],
      ["H₂O (O–H)", "Liên kết cộng hóa trị phân cực"],
      ["Kim loại đồng (Cu)", "Liên kết kim loại"],
      ["Giữa các phân tử H₂O với nhau", "Liên kết hydrogen"],
    ],
    ["Liên kết peptide", "Liên kết đôi C=C", "Lực hút trọng trường", "Liên kết cho – nhận", "Liên kết glycoside"],
    "NaCl: kim loại + phi kim điển hình tạo liên kết ion. H₂ cộng hóa trị không cực, H₂O cộng hóa trị phân cực. Kim loại có liên kết kim loại; các phân tử nước liên kết với nhau bằng liên kết hydrogen."),

  dd("bio_10_05", 10, "Biology", "Thành phần hóa học của tế bào",
    "Kéo mỗi đáp án vào ô tương ứng.",
    [
      ["Đơn phân của protein", "Amino acid"],
      ["Đơn phân của DNA", "Nucleotide"],
      ["Đơn phân của tinh bột", "Glucose"],
      ["Dự trữ năng lượng lâu dài trong cơ thể động vật", "Lipid (mỡ)"],
      ["Loại đường đôi có trong sữa", "Lactose"],
    ],
    ["Nucleic acid", "Peptide", "Sucrose", "Cellulose", "Vitamin"],
    "Protein gồm các amino acid, DNA gồm các nucleotide, tinh bột gồm các glucose. Lipid dự trữ năng lượng; lactose là đường sữa."),

  dd("bio_10_06", 10, "Biology", "Cấu trúc tế bào",
    "Kéo mỗi chức năng vào bào quan tương ứng.",
    [
      ["Ti thể", "Tổng hợp ATP (hô hấp tế bào)"],
      ["Ribosome", "Tổng hợp protein"],
      ["Lục lạp", "Quang hợp"],
      ["Lysosome", "Phân giải các chất và bào quan già"],
      ["Nhân tế bào", "Chứa vật chất di truyền DNA"],
    ],
    ["Tạo ra ánh sáng", "Dự trữ khí CO₂", "Truyền xung thần kinh", "Sản xuất hormone sinh dục ở mọi tế bào", "Cố định đạm khí quyển"],
    "Ti thể tạo ATP, ribosome tổng hợp protein, lục lạp quang hợp, lysosome phân giải chất thải, nhân chứa DNA."),

  dd("phy_11_05", 11, "Physics", "Dao động điều hòa",
    "Kéo mỗi đáp án vào đại lượng hoặc công thức tương ứng.",
    [
      ["Biên độ A", "Độ lệch cực đại so với vị trí cân bằng"],
      ["Chu kì T", "Thời gian thực hiện một dao động toàn phần"],
      ["Tần số f", "f = 1/T"],
      ["Tần số góc ω", "ω = 2π/T"],
      ["Quãng đường đi trong một chu kì", "4A"],
    ],
    ["2A", "f = T", "ω = T/2π", "Vận tốc cực đại tại biên", "Gia tốc bằng 0 tại biên"],
    "Trong một chu kì vật đi được 4A. Tại biên vận tốc bằng 0 còn gia tốc cực đại, nên hai phát biểu gây nhiễu là sai."),

  dd("phy_11_06", 11, "Physics", "Điện trường",
    "Kéo mỗi công thức hoặc đơn vị vào nội dung tương ứng.",
    [
      ["Cường độ điện trường E", "E = F/q"],
      ["Lực giữa hai điện tích điểm (Coulomb)", "F = k·|q₁q₂|/r²"],
      ["Điện trường đều giữa hai bản phẳng", "E = U/d"],
      ["Công của lực điện trong điện trường đều", "A = q·E·d"],
      ["Đơn vị của hiệu điện thế", "Vôn (V)"],
    ],
    ["E = F·q", "F = k·|q₁q₂|/r", "E = U·d", "A = q/(E·d)", "Fara (F)"],
    "E = F/q; lực Coulomb tỉ lệ nghịch với bình phương khoảng cách; E = U/d; công A = qEd (d là hình chiếu độ dời lên phương đường sức); hiệu điện thế đo bằng vôn."),

  dd("che_11_06", 11, "Chemistry", "Sự điện li",
    "Kéo mỗi đáp án vào chất hoặc dung dịch tương ứng.",
    [
      ["HCl", "Chất điện li mạnh (acid mạnh)"],
      ["CH₃COOH", "Chất điện li yếu"],
      ["NaOH", "Chất điện li mạnh (base mạnh)"],
      ["C₂H₅OH (ethanol)", "Chất không điện li"],
      ["Dung dịch có pH < 7", "Môi trường acid"],
    ],
    ["Môi trường base", "Môi trường trung tính", "Muối ít tan", "Kim loại kiềm", "Chất lưỡng tính"],
    "HCl và NaOH phân li hoàn toàn; CH₃COOH phân li một phần; ethanol không phân li thành ion; pH < 7 là môi trường acid."),

  dd("che_11_07", 11, "Chemistry", "Nitrogen – Sulfur",
    "Kéo mỗi đáp án vào mô tả tương ứng.",
    [
      ["Khí gây mưa acid, mùi hắc, sinh ra khi đốt lưu huỳnh", "SO₂"],
      ["Khí có mùi khai, tan nhiều trong nước", "NH₃"],
      ["Khí chiếm khoảng 78% thể tích không khí", "N₂"],
      ["Acid có tính háo nước mạnh, dùng làm khô chất khí", "H₂SO₄ đặc"],
      ["Khí có màu nâu đỏ", "NO₂"],
    ],
    ["CO₂", "H₂S", "O₂", "HCl loãng", "NO"],
    "SO₂ có mùi hắc và gây mưa acid; NH₃ mùi khai; N₂ chiếm ~78% không khí; H₂SO₄ đặc háo nước; NO₂ màu nâu đỏ (NO không màu)."),

  dd("bio_11_05", 11, "Biology", "Quang hợp ở thực vật",
    "Kéo mỗi đáp án vào ô tương ứng.",
    [
      ["Vị trí diễn ra pha sáng", "Màng thylakoid"],
      ["Vị trí diễn ra pha tối (chu trình Calvin)", "Chất nền (stroma)"],
      ["Sản phẩm khí của pha sáng", "O₂"],
      ["Nguyên liệu khí của pha tối", "CO₂"],
      ["Sắc tố quang hợp chính", "Diệp lục (chlorophyll)"],
    ],
    ["Ti thể", "Màng ngoài lục lạp", "N₂", "Hemoglobin", "Melanin"],
    "Pha sáng ở màng thylakoid, giải phóng O₂ từ quang phân li nước; pha tối ở stroma, cố định CO₂. Diệp lục là sắc tố chính."),

  dd("bio_11_06", 11, "Biology", "Cảm ứng ở động vật",
    "Kéo mỗi đáp án vào khái niệm tương ứng.",
    [
      ["Đơn vị cấu tạo và chức năng của hệ thần kinh", "Neuron"],
      ["Giá trị điện thế nghỉ khoảng", "−70 mV"],
      ["Nơi tiếp xúc giữa hai neuron", "Synapse"],
      ["Chất truyền tin hóa học qua synapse", "Chất dẫn truyền thần kinh"],
      ["Bơm góp phần duy trì điện thế nghỉ", "Bơm Na⁺–K⁺"],
    ],
    ["+70 mV", "Tế bào đệm", "Cơ quan thụ cảm", "Kênh nước aquaporin", "Hormone steroid"],
    "Neuron là đơn vị cơ bản; điện thế nghỉ khoảng −70 mV; xung thần kinh qua synapse nhờ chất dẫn truyền; bơm Na⁺–K⁺ duy trì chênh lệch ion."),

  dd("phy_12_05", 12, "Physics", "Khí lí tưởng",
    "Kéo mỗi hệ thức vào quá trình hoặc đại lượng tương ứng.",
    [
      ["Quá trình đẳng nhiệt (T không đổi)", "p·V = hằng số"],
      ["Quá trình đẳng tích (V không đổi)", "p/T = hằng số"],
      ["Quá trình đẳng áp (p không đổi)", "V/T = hằng số"],
      ["Phương trình trạng thái khí lí tưởng", "p·V/T = hằng số"],
      ["Nhiệt độ T (K) tính từ t (°C)", "T = t + 273"],
    ],
    ["p/V = hằng số", "p·T = hằng số", "V·T = hằng số", "p·V·T = hằng số", "T = t − 273"],
    "Boyle: pV = const (T không đổi); Charles: V/T = const (p không đổi); Gay-Lussac: p/T = const (V không đổi). Phương trình trạng thái: pV/T = const."),

  dd("phy_12_06", 12, "Physics", "Vật lí hạt nhân",
    "Kéo mỗi đáp án vào nội dung tương ứng.",
    [
      ["Số neutron của hạt nhân ᴬ_ZX", "N = A − Z"],
      ["Tia α là", "Hạt nhân ⁴₂He"],
      ["Tia β⁻ là", "Dòng electron"],
      ["Tia γ là", "Sóng điện từ có bước sóng rất ngắn"],
      ["Chu kì bán rã T", "Thời gian để số hạt nhân giảm một nửa"],
    ],
    ["N = A + Z", "Hạt nhân ¹₁H", "Dòng proton", "Sóng siêu âm", "Thời gian để số hạt nhân tăng gấp đôi"],
    "N = A − Z. Tia α là hạt nhân heli, β⁻ là electron, γ là sóng điện từ. Chu kì bán rã là thời gian để lượng chất phóng xạ giảm còn một nửa."),

  dd("che_12_05", 12, "Chemistry", "Ester – Lipid",
    "Kéo mỗi đáp án vào chất hoặc phản ứng tương ứng.",
    [
      ["CH₃COOC₂H₅", "Ethyl acetate"],
      ["HCOOCH₃", "Methyl formate"],
      ["Thủy phân ester trong dung dịch NaOH", "Xà phòng hóa"],
      ["Phản ứng giữa acid và alcohol (H₂SO₄ đặc, t°)", "Ester hóa"],
      ["Chất béo là trieste của acid béo với", "Glycerol"],
    ],
    ["Methyl acetate", "Ethyl formate", "Trùng hợp", "Ethylene glycol", "Tráng bạc"],
    "Tên ester = tên gốc alkyl của alcohol + tên gốc acid: CH₃COOC₂H₅ là ethyl acetate, HCOOCH₃ là methyl formate. Chất béo là trieste của glycerol."),

  dd("che_12_06", 12, "Chemistry", "Đại cương về kim loại",
    "Kéo mỗi kim loại vào tính chất đặc trưng tương ứng.",
    [
      ["Kim loại dẫn điện tốt nhất", "Ag"],
      ["Kim loại có nhiệt độ nóng chảy cao nhất", "W"],
      ["Kim loại ở thể lỏng ở điều kiện thường", "Hg"],
      ["Kim loại cứng nhất", "Cr"],
      ["Kim loại nhẹ nhất", "Li"],
    ],
    ["Cu", "Fe", "Na", "Al", "Au"],
    "Ag dẫn điện tốt nhất; W nóng chảy cao nhất (3422°C); Hg là chất lỏng; Cr cứng nhất; Li nhẹ nhất trong các kim loại."),

  dd("bio_12_06", 12, "Biology", "Di truyền học",
    "Kéo mỗi đáp án vào khái niệm tương ứng.",
    [
      ["Quá trình tổng hợp mRNA từ mạch khuôn DNA", "Phiên mã"],
      ["Quá trình tổng hợp protein từ mRNA", "Dịch mã"],
      ["Bộ ba mở đầu trên mRNA", "AUG"],
      ["Phân tử mang bộ ba đối mã (anticodon)", "tRNA"],
      ["Trong phiên mã, A của mạch gốc DNA liên kết với", "U của RNA"],
    ],
    ["Nhân đôi DNA", "GGA", "rRNA", "T của RNA", "Đột biến gene"],
    "Phiên mã: DNA → mRNA, dịch mã: mRNA → protein. AUG là bộ ba mở đầu, tRNA mang anticodon, và A của DNA bắt cặp với U của RNA."),

  dd("bio_12_07", 12, "Biology", "Tiến hóa",
    "Kéo mỗi nhân tố tiến hóa vào đặc điểm tương ứng.",
    [
      ["Làm phát sinh alen mới", "Đột biến"],
      ["Làm thay đổi tần số alen theo hướng xác định", "Chọn lọc tự nhiên"],
      ["Làm thay đổi tần số alen ngẫu nhiên, mạnh ở quần thể nhỏ", "Phiêu bạt di truyền"],
      ["Sự trao đổi alen giữa các quần thể", "Dòng gene (di – nhập gene)"],
      ["Làm đổi tần số kiểu gene nhưng không đổi tần số alen", "Giao phối không ngẫu nhiên (tự thụ phấn)"],
    ],
    ["Giao phối ngẫu nhiên", "Quang hợp", "Hô hấp tế bào", "Nhân đôi DNA", "Điều hòa biểu hiện gene"],
    "Đột biến tạo alen mới; chọn lọc tự nhiên có hướng; phiêu bạt di truyền ngẫu nhiên; dòng gene trao đổi alen; giao phối không ngẫu nhiên chỉ đổi tần số kiểu gene."),
);

const DIFFICULTY_BY_ID = {
  phy_10_01: "easy", phy_10_02: "medium", phy_10_03: "hard", phy_10_04: "easy", phy_10_05: "medium", phy_10_06: "medium", phy_10_07: "medium",
  che_10_01: "easy", che_10_02: "easy", che_10_03: "easy", che_10_04: "medium", che_10_05: "easy", che_10_06: "medium",
  bio_10_01: "easy", bio_10_02: "easy", bio_10_03: "easy", bio_10_04: "medium", bio_10_05: "easy", bio_10_06: "medium",
  phy_11_01: "easy", phy_11_02: "easy", phy_11_03: "easy", phy_11_04: "medium", phy_11_05: "medium", phy_11_06: "hard",
  che_11_01: "medium", che_11_02: "easy", che_11_03: "medium", che_11_04: "easy", che_11_05: "hard", che_11_06: "easy", che_11_07: "medium",
  bio_11_01: "medium", bio_11_02: "easy", bio_11_03: "easy", bio_11_04: "hard", bio_11_05: "easy", bio_11_06: "medium",
  phy_12_01: "medium", phy_12_02: "easy", phy_12_03: "medium", phy_12_04: "hard", phy_12_05: "medium", phy_12_06: "hard",
  che_12_01: "easy", che_12_02: "medium", che_12_03: "easy", che_12_04: "hard", che_12_05: "hard", che_12_06: "medium",
  bio_12_01: "medium", bio_12_02: "easy", bio_12_03: "medium", bio_12_04: "medium", bio_12_05: "hard", bio_12_06: "medium", bio_12_07: "hard",
};

questionBank.forEach((q) => {
  q.difficulty = DIFFICULTY[DIFFICULTY_BY_ID[q.id]] ? DIFFICULTY_BY_ID[q.id] : "medium";
});

// Drag & drop also appears in the mixed physics mock exam as a fourth section.
mockExams.find((e) => e.examId === "exam_phy_mock_01").questions.push("phy_12_05");
