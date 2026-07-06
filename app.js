// ═══════════════════════════════════════════════════════════════════════
// Pseudoscience QBANK — Frontend (vanilla JS, بدون build step)
// ═══════════════════════════════════════════════════════════════════════
const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const INIT_DATA = tg?.initData || "";
const view = document.getElementById("view");

let IS_ADMIN = false;
let currentCategoryId = null; // null = الجذر

// ── طبقة API ─────────────────────────────────────────────────────────
const API_BASE = window.API_BASE || "";

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Init-Data": INIT_DATA,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "خطأ غير معروف" }));
    throw new Error(err.detail || "خطأ في الطلب");
  }
  return res.json();
}

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

function icons() { lucide.createIcons(); }

// ── الراوتر ──────────────────────────────────────────────────────────
const Router = {
  go(name, params = {}) {
    if (name === "browse") renderBrowse(params.categoryId ?? null);
    if (name === "quiz") renderQuiz(params.categoryId);
    if (name === "admin") renderAdminHome();
  },
};
window.Router = Router;

// ── إقلاع ────────────────────────────────────────────────────────────
(async function init() {
  try {
    const me = await api("/api/me");
    IS_ADMIN = me.is_admin;
    document.getElementById("adminToggle").style.display = IS_ADMIN ? "block" : "none";
  } catch (e) {
    // initData غير متاحة (مثلاً فتح الرابط من متصفح عادي) — نعرض رسالة توضيحية
    view.innerHTML = `<div class="empty">افتح هذا التطبيق من داخل بوت تيليجرام لعرض بنك الأسئلة.</div>`;
    return;
  }
  renderBrowse(null);
})();

// ═══════════════════════════════════════════════════════════════════════
//  تصفح الفئات
// ═══════════════════════════════════════════════════════════════════════
async function renderBrowse(categoryId) {
  currentCategoryId = categoryId;
  view.innerHTML = `<div id="crumb" class="breadcrumb"></div><div id="grid" class="grid"></div>`;
  const crumbEl = document.getElementById("crumb");
  const gridEl = document.getElementById("grid");

  crumbEl.innerHTML = `<span onclick="Router.go('browse')">🏠 الرئيسية</span>`;
  if (categoryId) {
    const path = await api(`/api/categories/${categoryId}/breadcrumb`);
    path.forEach((p) => {
      crumbEl.innerHTML += `<span class="sep">/</span><span onclick="Router.go('browse',{categoryId:${p.id}})">${p.name}</span>`;
    });
  }

  const items = await api(`/api/categories?${categoryId ? "parent_id=" + categoryId : ""}`);
  const questions = categoryId ? await api(`/api/questions?category_id=${categoryId}`) : [];

  if (items.length === 0 && questions.length === 0) {
    gridEl.outerHTML = `<div class="empty">لا يوجد محتوى هنا بعد.</div>`;
    return;
  }

  gridEl.innerHTML = items
    .map(
      (c, i) => `
    <div class="card" style="animation-delay:${i * 0.03}s" onclick="Router.go('browse',{categoryId:${c.id}})">
      <div class="name">${c.name}</div>
      <div class="meta">
        ${c.child_count ? `<span>📁 <b>${c.child_count}</b></span>` : ""}
        ${c.question_count ? `<span>❓ <b>${c.question_count}</b></span>` : ""}
      </div>
    </div>`
    )
    .join("");

  if (questions.length > 0) {
    gridEl.innerHTML += `
      <div class="card" style="grid-column:1/-1;background:linear-gradient(120deg,var(--crimson),#4a1420)"
           onclick="Router.go('quiz',{categoryId:${categoryId}})">
        <div class="name">▶ ابدأ الاختبار (${questions.length} سؤال)</div>
      </div>`;
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  الكويز
// ═══════════════════════════════════════════════════════════════════════
let quizState = null;

async function renderQuiz(categoryId) {
  const questions = await api(`/api/questions?category_id=${categoryId}`);
  if (questions.length === 0) {
    toast("لا توجد أسئلة في هذا القسم");
    return Router.go("browse", { categoryId });
  }
  quizState = { categoryId, questions, index: 0, correct: 0, wrong: 0, review: [], answered: false };
  renderQuestion();
}

function renderQuestion() {
  const { questions, index } = quizState;
  const q = questions[index];
  const pct = Math.round((index / questions.length) * 100);

  view.innerHTML = `
    <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
    <div class="q-box">
      <div class="q-text">${q.question_text}</div>
      ${q.image_url ? `<img src="${q.image_url}" />` : ""}
    </div>
    <div class="options" id="opts"></div>
    <button class="footer-btn" id="nextBtn" disabled>التالي</button>
  `;

  const optsEl = document.getElementById("opts");
  q.options.forEach((opt, i) => {
    const div = document.createElement("div");
    div.className = "option";
    div.textContent = opt;
    div.onclick = () => selectAnswer(i);
    optsEl.appendChild(div);
  });

  document.getElementById("nextBtn").onclick = nextQuestion;
}

function selectAnswer(i) {
  if (quizState.answered) return;
  quizState.answered = true;
  const q = quizState.questions[quizState.index];
  const opts = document.querySelectorAll("#opts .option");
  const isCorrect = i === q.correct_index;

  opts.forEach((el, idx) => {
    if (idx === q.correct_index) el.classList.add("correct");
    else if (idx === i) el.classList.add("wrong");
  });

  if (isCorrect) quizState.correct++;
  else quizState.wrong++;

  quizState.review.push({ q, chosen: i, correct: isCorrect });

  if (q.explanation) {
    const exp = document.createElement("div");
    exp.className = "explanation";
    exp.textContent = "💡 " + q.explanation;
    document.getElementById("opts").after(exp);
  }
  document.getElementById("nextBtn").disabled = false;
  tg?.HapticFeedback?.notificationOccurred(isCorrect ? "success" : "error");
}

function nextQuestion() {
  quizState.index++;
  quizState.answered = false;
  if (quizState.index >= quizState.questions.length) {
    renderResult();
  } else {
    renderQuestion();
  }
}

async function renderResult() {
  const { correct, wrong, questions, categoryId, review } = quizState;
  const total = questions.length;
  const pct = Math.round((correct / total) * 100);

  try {
    await api("/api/attempts", { method: "POST", body: { category_id: categoryId, score: correct, total } });
  } catch (_) {}

  view.innerHTML = `
    <div style="text-align:center">
      <div class="result-ring" style="--pct:${pct}">
        <div class="inner"><div class="pct">${pct}%</div><div class="lbl">نسبة النجاح</div></div>
      </div>
      <div class="stat-row">
        <div class="stat-pill">✅ صحيح: <b style="color:var(--green)">${correct}</b></div>
        <div class="stat-pill">❌ خطأ: <b style="color:var(--red)">${wrong}</b></div>
        <div class="stat-pill">📋 الإجمالي: ${total}</div>
      </div>
      <div id="reviewList" style="text-align:right"></div>
      <button class="footer-btn" onclick="Router.go('browse',{categoryId:${categoryId}})">العودة للأقسام</button>
    </div>
  `;

  const list = document.getElementById("reviewList");
  list.innerHTML = review
    .map(
      (r, i) => `
    <div class="q-box">
      <div class="q-text" style="font-size:14px">${i + 1}. ${r.q.question_text}</div>
      <div style="margin-top:8px;font-size:13px;color:${r.correct ? "var(--green)" : "var(--red)"}">
        إجابتك: ${r.q.options[r.chosen]}
      </div>
      ${!r.correct ? `<div style="font-size:13px;color:var(--gold);margin-top:4px">الصحيحة: ${r.q.options[r.q.correct_index]}</div>` : ""}
      ${r.q.explanation ? `<div class="explanation">💡 ${r.q.explanation}</div>` : ""}
    </div>`
    )
    .join("");
}

// ═══════════════════════════════════════════════════════════════════════
//  لوحة الأدمن
// ═══════════════════════════════════════════════════════════════════════
let adminTab = "categories";
let adminCategoryId = null; // الفئة المختارة لإدارة الأسئلة/الاستخراج

function renderAdminHome() {
  view.innerHTML = `
    <div class="tab-bar">
      <div class="tab ${adminTab === "categories" ? "active" : ""}" onclick="setAdminTab('categories')">📁 الأقسام</div>
      <div class="tab ${adminTab === "questions" ? "active" : ""}" onclick="setAdminTab('questions')">❓ الأسئلة</div>
      <div class="tab ${adminTab === "extract" ? "active" : ""}" onclick="setAdminTab('extract')">📥 استخراج</div>
    </div>
    <div id="adminBody"></div>
    <button class="btn" style="width:100%;margin-top:14px" onclick="Router.go('browse')">🔙 خروج من وضع الأدمن</button>
  `;
  if (adminTab === "categories") renderAdminCategories();
  if (adminTab === "questions") renderAdminQuestions();
  if (adminTab === "extract") renderAdminExtract();
}
window.setAdminTab = (t) => { adminTab = t; renderAdminHome(); };

// ── إدارة الأقسام ────────────────────────────────────────────────────
let adminBrowseParent = null;

async function renderAdminCategories() {
  const body = document.getElementById("adminBody");
  const path = adminBrowseParent ? await api(`/api/categories/${adminBrowseParent}/breadcrumb`) : [];
  const items = await api(`/api/categories?${adminBrowseParent ? "parent_id=" + adminBrowseParent : ""}`);

  body.innerHTML = `
    <div class="breadcrumb">
      <span onclick="adminBrowseParent=null;renderAdminCategories()">🏠</span>
      ${path.map((p) => `<span class="sep">/</span><span onclick="adminBrowseParent=${p.id};renderAdminCategories()">${p.name}</span>`).join("")}
    </div>
    <div class="form-group row">
      <input type="text" id="newCatName" placeholder="اسم القسم الجديد" />
      <button class="btn primary" onclick="createCategory()">إضافة</button>
    </div>
    <div id="catList"></div>
  `;
  document.getElementById("catList").innerHTML = items
    .map(
      (c) => `
    <div class="list-item">
      <div onclick="adminBrowseParent=${c.id};renderAdminCategories()" style="flex:1;cursor:pointer">
        ${c.name} <span style="color:var(--muted);font-size:12px">(${c.child_count} فرعي، ${c.question_count} سؤال)</span>
      </div>
      <div class="actions">
        <button class="icon-btn" onclick="renameCategory(${c.id}, '${c.name.replace(/'/g, "\\'")}')"><i data-lucide="pencil"></i></button>
        <button class="icon-btn" onclick="deleteCategory(${c.id})"><i data-lucide="trash-2"></i></button>
      </div>
    </div>`
    )
    .join("");
  icons();
}
window.renderAdminCategories = renderAdminCategories;

window.createCategory = async () => {
  const input = document.getElementById("newCatName");
  const name = input.value.trim();
  if (!name) return;
  await api("/api/admin/categories", { method: "POST", body: { parent_id: adminBrowseParent, name } });
  input.value = "";
  toast("تمت الإضافة");
  renderAdminCategories();
};

window.renameCategory = async (id, oldName) => {
  const name = prompt("الاسم الجديد:", oldName);
  if (!name) return;
  await api(`/api/admin/categories/${id}`, { method: "PUT", body: { name } });
  renderAdminCategories();
};

window.deleteCategory = async (id) => {
  if (!confirm("سيتم حذف هذا القسم وكل ما بداخله (أقسام فرعية وأسئلة). متابعة؟")) return;
  await api(`/api/admin/categories/${id}`, { method: "DELETE" });
  toast("تم الحذف");
  renderAdminCategories();
};

// ── إدارة الأسئلة ────────────────────────────────────────────────────
async function renderAdminQuestions() {
  const body = document.getElementById("adminBody");
  const cats = await api(`/api/categories?${adminCategoryId ? "" : ""}`); // اختيار سريع من الجذر (بسّط لاحقاً بشجرة كاملة)
  body.innerHTML = `
    <div class="form-group">
      <label>اختر القسم (استخدم تبويب "الأقسام" للتنقل، ثم عد هنا)</label>
      <select id="catSelect"></select>
    </div>
    <div id="qFormWrap"></div>
    <div id="qList"></div>
  `;
  await populateCategorySelect();
  document.getElementById("catSelect").onchange = (e) => {
    adminCategoryId = parseInt(e.target.value) || null;
    loadAdminQuestionsList();
  };
  renderQuestionForm();
  loadAdminQuestionsList();
}

async function populateCategorySelect() {
  // نبني قائمة مسطّحة من كل الفئات عبر تجميع بسيط (بحث عمق أول ابتداءً من الجذر)
  const sel = document.getElementById("catSelect");
  const all = [];
  async function walk(parentId, depth) {
    const kids = await api(`/api/categories?${parentId ? "parent_id=" + parentId : ""}`);
    for (const k of kids) {
      all.push({ id: k.id, label: "— ".repeat(depth) + k.name });
      await walk(k.id, depth + 1);
    }
  }
  await walk(null, 0);
  sel.innerHTML = `<option value="">اختر قسماً...</option>` + all.map((c) => `<option value="${c.id}" ${c.id === adminCategoryId ? "selected" : ""}>${c.label}</option>`).join("");
}

function renderQuestionForm() {
  const wrap = document.getElementById("qFormWrap");
  wrap.innerHTML = `
    <div class="form-group"><label>نص السؤال</label><textarea id="qText"></textarea></div>
    <div class="form-group"><label>الخيارات (كل خيار بسطر)</label><textarea id="qOpts" placeholder="خيار 1\nخيار 2\nخيار 3"></textarea></div>
    <div class="form-group"><label>رقم الخيار الصحيح (0 = الأول)</label><input type="text" id="qCorrect" value="0" /></div>
    <div class="form-group"><label>الشرح (اختياري)</label><textarea id="qExpl"></textarea></div>
    <div class="form-group"><label>رابط صورة (اختياري)</label><input type="text" id="qImg" /></div>
    <button class="btn primary" style="width:100%" onclick="saveQuestion()">💾 حفظ السؤال</button>
  `;
}

window.saveQuestion = async () => {
  if (!adminCategoryId) return toast("اختر قسماً أولاً");
  const question_text = document.getElementById("qText").value.trim();
  const options = document.getElementById("qOpts").value.split("\n").map((s) => s.trim()).filter(Boolean);
  const correct_index = parseInt(document.getElementById("qCorrect").value) || 0;
  const explanation = document.getElementById("qExpl").value.trim() || null;
  const image_url = document.getElementById("qImg").value.trim() || null;
  if (!question_text || options.length < 2) return toast("أكمل نص السؤال وخيارين على الأقل");

  await api("/api/admin/questions", {
    method: "POST",
    body: { category_id: adminCategoryId, question_text, options, correct_index, explanation, image_url },
  });
  toast("تم حفظ السؤال");
  ["qText", "qOpts", "qExpl", "qImg"].forEach((id) => (document.getElementById(id).value = ""));
  document.getElementById("qCorrect").value = "0";
  loadAdminQuestionsList();
};

async function loadAdminQuestionsList() {
  const listEl = document.getElementById("qList");
  if (!adminCategoryId) { listEl.innerHTML = ""; return; }
  const qs = await api(`/api/questions?category_id=${adminCategoryId}`);
  listEl.innerHTML = qs
    .map(
      (q) => `
    <div class="list-item">
      <div style="flex:1">${q.question_text.slice(0, 60)}${q.question_text.length > 60 ? "…" : ""}</div>
      <div class="actions">
        <button class="icon-btn" onclick="deleteQuestion(${q.id})"><i data-lucide="trash-2"></i></button>
      </div>
    </div>`
    )
    .join("");
  icons();
}

window.deleteQuestion = async (id) => {
  if (!confirm("حذف هذا السؤال؟")) return;
  await api(`/api/admin/questions/${id}`, { method: "DELETE" });
  loadAdminQuestionsList();
};

// ── الاستخراج ────────────────────────────────────────────────────────
let extractedQuestions = [];

async function renderAdminExtract() {
  const body = document.getElementById("adminBody");
  body.innerHTML = `
    <div class="form-group">
      <label>القسم الهدف</label>
      <select id="extCatSelect"></select>
    </div>
    <div class="form-group">
      <label>الصق النص هنا</label>
      <textarea id="extText" style="min-height:160px"></textarea>
    </div>
    <div class="form-group">
      <label>أو ارفع ملف (txt / docx / pdf)</label>
      <input type="file" id="extFile" accept=".txt,.docx,.pdf" />
    </div>
    <div class="row">
      <button class="btn primary" onclick="runExtract()">🔍 استخرج</button>
      <button class="btn" onclick="saveExtracted()">💾 حفظ الكل في القسم</button>
    </div>
    <div id="extPreview"></div>
  `;
  const sel = document.getElementById("extCatSelect");
  const all = [];
  async function walk(parentId, depth) {
    const kids = await api(`/api/categories?${parentId ? "parent_id=" + parentId : ""}`);
    for (const k of kids) { all.push({ id: k.id, label: "— ".repeat(depth) + k.name }); await walk(k.id, depth + 1); }
  }
  await walk(null, 0);
  sel.innerHTML = `<option value="">اختر قسماً...</option>` + all.map((c) => `<option value="${c.id}">${c.label}</option>`).join("");
}

window.runExtract = async () => {
  const file = document.getElementById("extFile").files[0];
  let result;
  if (file) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(API_BASE + "/api/admin/extract-file", { method: "POST", headers: { "X-Init-Data": INIT_DATA }, body: fd });
    result = await res.json();
  } else {
    const raw_text = document.getElementById("extText").value;
    result = await api("/api/admin/extract", { method: "POST", body: { raw_text } });
  }
  extractedQuestions = result.questions;
  document.getElementById("extPreview").innerHTML =
    `<p style="color:var(--gold)">تم استخراج ${result.count} سؤال — راجعها ثم اضغط "حفظ الكل"</p>` +
    result.questions
      .slice(0, 30)
      .map((q, i) => `<div class="q-box"><div class="q-text" style="font-size:13.5px">${i + 1}. ${q.question}</div></div>`)
      .join("");
};

window.saveExtracted = async () => {
  const catId = parseInt(document.getElementById("extCatSelect").value);
  if (!catId) return toast("اختر القسم الهدف");
  if (extractedQuestions.length === 0) return toast("لا توجد أسئلة مستخرجة");
  const res = await api("/api/admin/questions/bulk", { method: "POST", body: { category_id: catId, questions: extractedQuestions } });
  toast(`تم حفظ ${res.saved} سؤال`);
  extractedQuestions = [];
};

icons();
