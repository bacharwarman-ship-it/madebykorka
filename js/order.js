/* made by korka — схема заказа и отправка в Telegram */
(function () {
  "use strict";
  const CFG = window.KORKA_CONFIG || {};
  const TG = CFG.telegram || {};
  const CATALOG = (window.KORKA_CATALOG || []).filter((x) => x.cat !== "08_portfolio_orders");
  const { photo } = window.KorkaPhoto;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ruDate = (iso) => iso.split("-").reverse().join(".");
  const fmt = (n) => (n == null ? "" : Number(n).toLocaleString("ru-RU").replace(/\u00a0/g, " ") + " ₽");

  const form = $("#orderForm");
  const rows = $$(".row", form);
  const prevBtn = $("#prevBtn"), nextBtn = $("#nextBtn"), sendBtn = $("#sendBtn");
  const MAX_REFS = 5;
  const startedAt = Date.now();
  let step = 1;
  let refs = []; // {file, url}

  const PALETTE = [
    ["молочный", "#f3ead7"], ["белый", "#ffffff"], ["серый", "#a9a9a4"], ["чёрный", "#2b2b2b"], ["коричневый", "#8a5a3b"],
    ["бежевый", "#d9bf98"], ["красный", "#b8433a"], ["розовый", "#e8a3b0"], ["оранжевый", "#e08a3c"], ["жёлтый", "#efcf5a"],
    ["зелёный", "#6a8a43"], ["мятный", "#a8d5c2"], ["голубой", "#7fb0d9"], ["синий", "#3b5a8c"], ["фиолетовый", "#8a6bb5"]
  ];
  const KIND_LABEL = { catalog: "Повтор из каталога", remix: "Как в каталоге, но с изменениями", custom: "Свой персонаж по референсу" };
  const CONTACT = {
    tg:    { label: "Ник в Telegram", ph: "@username", type: "text", mode: "text", name: "Telegram" },
    vk:    { label: "Ссылка или ник ВКонтакте", ph: "vk.com/username", type: "text", mode: "url", name: "ВКонтакте" },
    phone: { label: "Номер телефона", ph: "+7 900 000-00-00", type: "tel", mode: "tel", name: "Телефон" },
    email: { label: "Электронная почта", ph: "name@mail.ru", type: "email", mode: "email", name: "Почта" }
  };
  const allKinds = [...(CFG.onProfile || []).map((k) => ({ ...k, off: false })), ...(CFG.offProfile || []).map((k) => ({ ...k, off: true }))];

  /* ================= построение элементов ================= */
  // палитра
  const palette = $("#palette");
  PALETTE.forEach(([name, c]) => palette.insertAdjacentHTML("beforeend",
    '<label class="yarn" title="' + name + '"><input type="checkbox" name="colors" value="' + name + '"><span style="--c:' + c + '"></span><em>' + name + "</em></label>"));
  palette.insertAdjacentHTML("beforeend", '<label class="yarn yarn--any" title="на твой вкус"><input type="checkbox" name="colors" value="на вкус мастера"><span></span><em>на твой вкус</em></label>');

  // кто это
  const kindsBox = $("#creatureKinds");
  allKinds.forEach((k) => kindsBox.insertAdjacentHTML("beforeend",
    '<label class="kind' + (k.off ? " kind--off" : "") + '"><input type="radio" name="creature" value="' + k.key + '"><span>' + esc(k.label) + "<small>" + esc(k.hint || "") + "</small></span></label>"));

  // размеры
  const sizesBox = $("#sizes");
  const ballPx = [26, 36, 48, 62];
  (CFG.sizes || []).forEach((s, i) => sizesBox.insertAdjacentHTML("beforeend",
    '<label class="size"><input type="radio" name="size" value="' + s.key + '"><span class="size__body">' +
    '<svg class="size__ball" width="' + ballPx[i % 4] + '" height="' + ballPx[i % 4] + '" viewBox="0 0 64 64"><use href="#i-yarn"/></svg>' +
    "<b>" + esc(s.label) + "</b><small>" + esc(s.note) + "</small><small><b>" + fmt(s.min) + (s.max !== s.min ? " – " + fmt(s.max) : "") + "</b></small></span></label>"));

  // бюджет
  const budgetsBox = $("#budgets");
  (CFG.budgets || []).forEach((b) => budgetsBox.insertAdjacentHTML("beforeend",
    '<label class="chip"><input type="radio" name="budget" value="' + b.key + '"><span>' + esc(b.label) + "</span></label>"));

  // выбор игрушки
  const picker = $("#picker"), pickerSearch = $("#pickerSearch"), productInput = $("#productId");
  function renderPicker() {
    const q = pickerSearch.value.trim().toLowerCase();
    picker.innerHTML = "";
    CATALOG.filter((x) => !q || (x.title + " " + x.category + " " + (x.tags || []).join(" ")).toLowerCase().includes(q))
      .forEach((x) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "pick";
        b.setAttribute("role", "option");
        b.setAttribute("aria-selected", productInput.value === x.id);
        b.dataset.id = x.id;
        b.appendChild(photo(x.photos[0], x.title));
        b.insertAdjacentHTML("beforeend", "<b>" + esc(x.title) + "</b><span>" + esc(x.priceText || fmt(x.price)) + "</span>");
        b.addEventListener("click", () => selectProduct(x.id));
        picker.appendChild(b);
      });
    if (!picker.children.length) picker.innerHTML = '<p class="field__label">Ничего не нашлось 🍂</p>';
  }
  function selectProduct(id, scroll = true) {
    productInput.value = id;
    $$(".pick", picker).forEach((p) => p.setAttribute("aria-selected", p.dataset.id === id));
    const el = $('.pick[data-id="' + CSS.escape(id) + '"]', picker);
    if (el && scroll) el.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    clearErr();
    update();
  }
  pickerSearch.addEventListener("input", renderPicker);
  renderPicker();

  /* ================= состояние ================= */
  const val = (name) => { const el = form.elements[name]; return el ? (el.value || "").trim() : ""; };
  const radio = (name) => { const el = $('input[name="' + name + '"]:checked', form); return el ? el.value : ""; };
  const product = () => CATALOG.find((x) => x.id === productInput.value) || null;
  const sizeObj = () => (CFG.sizes || []).find((s) => s.key === radio("size")) || null;
  const budgetObj = () => (CFG.budgets || []).find((b) => b.key === radio("budget")) || null;
  const kindObj = () => allKinds.find((k) => k.key === radio("creature")) || null;
  const colors = () => $$('input[name="colors"]:checked', form).map((i) => i.value);

  function estimate() {
    const kind = radio("kind"), p = product(), s = sizeObj();
    if (kind === "catalog" && p) return { min: p.price, max: p.price, text: p.priceText || fmt(p.price), eg: "цена из каталога: «" + p.title + "»" };
    if (kind === "remix" && p && !s) return { min: p.price, max: p.price, text: "≈ " + fmt(p.price), eg: "основа: «" + p.title + "». Изменения могут повлиять на цену" };
    if (s) return { min: s.min, max: s.max, text: s.min === s.max ? fmt(s.min) : fmt(s.min) + " – " + fmt(s.max), eg: "например: " + s.eg + (kind === "remix" && p ? ". Основа: «" + p.title + "» — " + fmt(p.price) : "") };
    return null;
  }

  /* ================= показ / скрытие ================= */
  function applyReveals() {
    const kind = radio("kind");
    $$(".reveal[data-show]", form).forEach((el) => el.classList.toggle("is-on", !!kind && el.dataset.show.split(" ").includes(kind)));
    const custom = kind === "custom";
    $("#refsTitle").textContent = custom ? "Референсы *" : "Референсы";
    $("#refsHint").textContent = custom ? "обязательно: картинки персонажа, до 5 штук" : "по желанию, до 5 штук";
    // выбранная игрушка в ряду 2
    const chosen = $("#chosenProduct"), p = product();
    if ((kind === "catalog" || kind === "remix") && p) {
      chosen.hidden = false;
      chosen.innerHTML = "";
      chosen.appendChild(photo(p.photos[0], p.title));
      chosen.insertAdjacentHTML("beforeend", "<div><b>" + esc(p.title) + "</b><small>" + esc(p.priceText || fmt(p.price)) + " · " + esc(p.lead || "") + "</small></div>");
    } else chosen.hidden = true;
    // мягкий стоп
    const k = kindObj(), stop = $("#softStop");
    if (custom && k && k.off) {
      stop.hidden = false;
      stop.innerHTML = '<svg viewBox="0 0 64 64"><use href="#i-mushroom"/></svg><div>' + esc(k.message) + ' <a href="#catalog">Открыть каталог →</a></div>';
    } else stop.hidden = true;
  }

  function priceTag() {
    const e = estimate();
    $("#priceValue").textContent = e ? e.text : (radio("kind") === "catalog" ? "выбери игрушку" : "выбери размер");
    $("#priceEg").textContent = e ? e.eg + ". Точную цену мастер назовёт после просмотра заявки" : "цены взяты из каталога; точную стоимость мастер назовёт после просмотра";
    $("#tagPrice").textContent = e ? e.text : "—";
    const warn = $("#budgetWarn"), b = budgetObj();
    if (e && b && b.max < e.min) {
      warn.hidden = false;
      warn.textContent = "Обычно такие игрушки стоят от " + fmt(e.min) + ". Можно выбрать размер поменьше, или мастер предложит упрощённый вариант.";
    } else warn.hidden = true;
  }

  /* ================= бирка заказа ================= */
  let swingT;
  function updateTag() {
    const kind = radio("kind"), p = product(), k = kindObj(), s = sizeObj(), b = budgetObj();
    const cs = colors();
    const refTxt = [refs.length ? refs.length + " фото" : "", val("refLink") ? "ссылка" : ""].filter(Boolean).join(" + ");
    const when = $("#noRush").checked ? "не спешу" : (val("deadline") ? "к " + ruDate(val("deadline")) : "");
    const ct = CONTACT[radio("contactType")] || CONTACT.tg;
    const items = [
      ["Что вяжем", kind ? KIND_LABEL[kind] : ""],
      [kind === "custom" ? "Персонаж" : "Игрушка", kind === "custom" ? [k && k.label, val("character")].filter(Boolean).join(" · ") : (p ? p.title : "")],
      ["Референсы", refTxt],
      ["Цвета", cs.join(", ") || (kind === "catalog" ? "как в оригинале" : "")],
      ["Размер", s ? s.label : (kind === "catalog" ? "как в каталоге" : "")],
      ["Бюджет", b ? b.label : ""],
      ["Срок", when],
      ["Связь", val("contact") ? ct.name + ": " + val("contact") : ""]
    ];
    $("#tagList").innerHTML = items.map(([t, v]) => '<div class="' + (v ? "" : "is-empty") + '"><dt>' + esc(t) + "</dt><dd>" + esc(v || "…") + "</dd></div>").join("");
    const tag = $("#labelTag");
    clearTimeout(swingT);
    swingT = setTimeout(() => { tag.classList.remove("is-swing"); void tag.offsetWidth; tag.classList.add("is-swing"); }, 120);
  }

  function update() { applyReveals(); priceTag(); updateTag(); }

  /* ================= прогресс: клубок → шарф ================= */
  const knit = $("#loomKnit"), ball = $("#loomBall");
  function sizeScarf() { knit.style.setProperty("--scarf-w", knit.parentElement.clientWidth + "px"); }
  function progress(p) {
    knit.style.setProperty("--p", p * 100 + "%");
    ball.style.transform = "scale(" + (1 - 0.38 * p) + ") rotate(" + p * 900 + "deg)";
    $$(".loom__labels li").forEach((li) => {
      const n = +li.dataset.for;
      li.classList.toggle("is-current", n === step && p < 1);
      li.classList.toggle("is-done", n < step || p >= 1);
    });
  }
  window.addEventListener("resize", sizeScarf);
  sizeScarf();

  /* ================= шаги ================= */
  function showStep(n, focus = true) {
    step = n;
    rows.forEach((r) => r.classList.toggle("is-active", +r.dataset.step === n));
    prevBtn.hidden = n === 1;
    nextBtn.hidden = n === rows.length;
    sendBtn.hidden = n !== rows.length;
    progress((n - 1) / rows.length);
    clearErr();
    if (focus) {
      const top = form.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight * 0.6) form.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  function err(msg, field) {
    const box = $(".row.is-active .row__err", form);
    if (box) box.textContent = msg;
    if (field) { field.classList.remove("is-bad"); void field.offsetWidth; field.classList.add("is-bad"); field.focus({ preventScroll: false }); }
    return false;
  }
  function clearErr() { $$(".row__err", form).forEach((e) => (e.textContent = "")); $$(".is-bad", form).forEach((e) => e.classList.remove("is-bad")); }

  const reTg = /^(@?[a-zA-Z][a-zA-Z0-9_]{3,31}|(https?:\/\/)?t\.me\/[a-zA-Z0-9_]{4,32}|\+?[\d\s()-]{10,18})$/;
  const reVk = /^((https?:\/\/)?(m\.)?vk\.(com|ru)\/[\w.]{2,}|@?[a-zA-Z0-9_.]{3,}|id\d+)$/;
  const reEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function validate(n) {
    const kind = radio("kind");
    if (n === 1) {
      if (!kind) return err("Выбери, что вяжем 🧶");
      if ((kind === "catalog" || kind === "remix") && !product()) return err("Выбери игрушку из каталога: просто нажми на неё", pickerSearch);
      if (kind === "remix" && !val("changes")) return err("Напиши, что поменять", form.elements.changes);
      if (kind === "custom") {
        const k = kindObj();
        if (!k) return err("Отметь, кто это: зверушка, существо или персонаж");
        if (k.off) return err("Этот вариант не ко мне, извини 🌿");
        if (!val("character")) return err("Напиши, кто это или как зовут персонажа", form.elements.character);
      }
    }
    if (n === 2) {
      const link = val("refLink");
      if (link && !/^https?:\/\/\S+\.\S+/.test(link)) return err("Ссылка должна начинаться с https://", form.elements.refLink);
      if (kind === "custom" && !refs.length && !link) return err("Добавь хотя бы одну картинку или ссылку. Без референса сложно понять, что вязать 🙏");
    }
    if (n === 3) {
      if ((kind === "remix" || kind === "custom") && !sizeObj()) return err("Выбери размер");
      if (kind === "custom" && !budgetObj()) return err("Отметь бюджет: так ответ по цене будет быстрее");
      const d = val("deadline");
      if (d && new Date(d) < new Date(new Date().toDateString())) return err("Эта дата уже прошла 🙂", form.elements.deadline);
    }
    if (n === 4) {
      if (!val("name")) return err("Как к тебе обращаться?", form.elements.name);
      const c = val("contact"), t = radio("contactType");
      const ok = t === "tg" ? reTg.test(c) : t === "vk" ? reVk.test(c) : t === "email" ? reEmail.test(c) : (c.replace(/\D/g, "").length >= 10 && c.replace(/\D/g, "").length <= 15);
      if (!c) return err("Оставь контакт, куда ответить", form.elements.contact);
      if (!ok) return err("Проверь контакт: похоже, в нём опечатка", form.elements.contact);
      if (!$("#honest").checked) return err("Поставь крестик, что пишешь по поводу игрушки 🙂");
    }
    return true;
  }

  nextBtn.addEventListener("click", () => { if (validate(step)) showStep(step + 1); });
  prevBtn.addEventListener("click", () => showStep(step - 1));
  form.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName === "INPUT" && step < rows.length) { e.preventDefault(); nextBtn.click(); }
  });

  form.addEventListener("change", (e) => {
    if (e.target.name === "kind" || e.target.name === "creature") clearErr();
    if (e.target.name === "contactType") setContactType();
    if (e.target.id === "noRush" && e.target.checked) form.elements.deadline.value = "";
    if (e.target.id === "deadline" && e.target.value) $("#noRush").checked = false;
    if (e.target.name === "size" || e.target.name === "kind") { const t = $("#pricetag"); t.classList.remove("is-bump"); void t.offsetWidth; t.classList.add("is-bump"); }
    update();
  });
  form.addEventListener("input", (e) => { if (e.target.id !== "pickerSearch") updateTag(); });

  function setContactType() {
    const c = CONTACT[radio("contactType")] || CONTACT.tg, inp = $("#contact");
    $("#contactLabel").textContent = c.label;
    inp.placeholder = c.ph;
    inp.type = c.type;
    inp.inputMode = c.mode;
  }
  const minDate = new Date(); $("#deadline").min = minDate.toISOString().slice(0, 10);

  /* ================= референсы: корзинка ================= */
  const basket = $("#basket"), refInput = $("#refInput"), line = $("#clothesline");
  function addFiles(list) {
    const files = Array.from(list || []).filter((f) => /^image\//.test(f.type) || /\.(heic|heif)$/i.test(f.name));
    for (const f of files) {
      if (refs.length >= MAX_REFS) { err("Хватит " + MAX_REFS + " картинок 🙂"); break; }
      if (f.size > 20 * 1024 * 1024) { err("Файл «" + f.name + "» слишком большой (больше 20 МБ)"); continue; }
      refs.push({ file: f, url: URL.createObjectURL(f) });
    }
    drawRefs();
  }
  function drawRefs() {
    line.innerHTML = "";
    refs.forEach((r, i) => {
      const h = document.createElement("div");
      h.className = "hang";
      h.style.setProperty("--r", (i % 2 ? 4 : -4) + "deg");
      h.innerHTML = '<img alt="Референс ' + (i + 1) + '" src="' + r.url + '"><button type="button" aria-label="Убрать">×</button>';
      h.querySelector("img").onerror = function () { this.replaceWith(Object.assign(document.createElement("div"), { className: "ph", innerHTML: "<code>" + esc(r.file.name) + "</code>" })); };
      h.querySelector("button").addEventListener("click", () => { URL.revokeObjectURL(r.url); refs.splice(i, 1); drawRefs(); });
      line.appendChild(h);
    });
    updateTag();
  }
  refInput.addEventListener("change", () => { addFiles(refInput.files); refInput.value = ""; });
  basket.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); refInput.click(); } });
  ["dragenter", "dragover"].forEach((t) => basket.addEventListener(t, (e) => { e.preventDefault(); basket.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach((t) => basket.addEventListener(t, (e) => { e.preventDefault(); basket.classList.remove("is-over"); }));
  basket.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
  document.addEventListener("paste", (e) => {
    if (step !== 2 || !$(".reveal.is-on#refsBlock")) return;
    const files = Array.from(e.clipboardData?.files || []);
    if (files.length) addFiles(files);
  });

  /* ================= сообщение ================= */
  function orderId() {
    const d = new Date();
    return "K-" + String(d.getDate()).padStart(2, "0") + String(d.getMonth() + 1).padStart(2, "0") + "-" + Math.random().toString(36).slice(2, 5).toUpperCase();
  }
  function contactLink() {
    const t = radio("contactType"), c = val("contact");
    if (t === "tg") {
      if (/^\+?[\d\s()-]{10,18}$/.test(c)) return null;
      const u = c.replace(/^@/, "").replace(/^(https?:\/\/)?t\.me\//, "");
      return "https://t.me/" + u;
    }
    if (t === "vk") {
      if (/vk\.(com|ru)\//.test(c)) return c.startsWith("http") ? c : "https://" + c;
      return "https://vk.com/" + c.replace(/^@/, "");
    }
    return null;
  }
  function buildMessage(id) {
    const kind = radio("kind"), p = product(), k = kindObj(), s = sizeObj(), b = budgetObj(), e = estimate();
    const L = [];
    const line = (icon, title, value, raw) => { if (value) L.push((icon ? icon + " " : "") + "<b>" + title + ":</b> " + (raw ? value : esc(value))); };
    L.push("🧶 <b>Новая заявка с сайта</b> · <code>#" + id + "</code>");
    L.push("");
    line("", "Что вяжем", KIND_LABEL[kind]);
    if (p) line("", "Игрушка", '<a href="' + esc(p.post) + '">' + esc(p.title) + "</a> — " + esc(p.priceText || fmt(p.price)), true);
    line("", "Изменить", kind === "remix" ? val("changes") : "");
    if (kind === "custom") { line("", "Кто это", k && k.label); line("", "Персонаж", val("character")); }
    line("", "Цвета", colors().join(", "));
    line("", "Пожелания", val("colorNote"));
    const refParts = [];
    if (refs.length) refParts.push(refs.length + " фото (ниже)");
    if (val("refLink")) refParts.push('<a href="' + esc(val("refLink")) + '">ссылка</a>');
    line("", "Референсы", refParts.join(" · "), true);
    L.push("");
    line("📏", "Размер", s ? s.label + " (" + s.note + ")" : (kind === "catalog" ? "как в каталоге" : ""));
    line("💰", "Ориентир", e && e.text);
    if (b) line("💳", "Бюджет", b.label + (e && b.max < e.min ? "  ⚠️ ниже ориентира" : ""));
    line("📅", "Срок", $("#noRush").checked ? "не спешит" : (val("deadline") ? "к " + ruDate(val("deadline")) : "не указан"));
    L.push("");
    line("👤", "Имя", val("name"));
    const ct = CONTACT[radio("contactType")] || CONTACT.tg;
    const link = contactLink();
    line("📬", "Связь", ct.name + ": " + (link ? '<a href="' + esc(link) + '">' + esc(val("contact")) + "</a>" : esc(val("contact"))), true);
    line("🏙", "Город", val("city"));
    line("💬", "Комментарий", val("comment"));
    const html = L.join("\n").slice(0, 4000);
    const text = html.replace(/<a href="([^"]+)">([^<]*)<\/a>/g, "$2 ($1)").replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    const buttons = link ? [{ text: "✉️ Написать клиенту", url: link }] : null;
    return { html, text, buttons };
  }

  /* ================= отправка ================= */
  async function shrink(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      if (k === 1 && file.size < 1.5e6) return file;
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.86));
      return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
    } catch (_) { return file; }
  }

  async function tgCall(method, fd) {
    const r = await fetch("https://api.telegram.org/bot" + TG.botToken + "/" + method, { method: "POST", body: fd });
    const j = await r.json().catch(() => ({ ok: false, description: "HTTP " + r.status }));
    if (!j.ok) throw new Error(j.description || "Telegram error");
    return j.result;
  }
  async function sendDirect(msg, files, id) {
    const fd = new FormData();
    fd.append("chat_id", TG.chatId);
    fd.append("text", msg.html);
    fd.append("parse_mode", "HTML");
    fd.append("disable_web_page_preview", "true");
    if (msg.buttons) fd.append("reply_markup", JSON.stringify({ inline_keyboard: [msg.buttons] }));
    const sent = await tgCall("sendMessage", fd);
    if (!files.length) return;
    const caption = "📎 Референсы к заявке #" + id;
    try {
      const g = new FormData();
      g.append("chat_id", TG.chatId);
      g.append("reply_parameters", JSON.stringify({ message_id: sent.message_id, allow_sending_without_reply: true }));
      if (files.length === 1) {
        g.append("photo", files[0], files[0].name);
        g.append("caption", caption);
        await tgCall("sendPhoto", g);
      } else {
        g.append("media", JSON.stringify(files.map((f, i) => ({ type: "photo", media: "attach://p" + i, caption: i === 0 ? caption : undefined }))));
        files.forEach((f, i) => g.append("p" + i, f, f.name));
        await tgCall("sendMediaGroup", g);
      }
    } catch (_) {
      for (const f of files) { // запасной вариант: файлами
        const d = new FormData();
        d.append("chat_id", TG.chatId);
        d.append("reply_parameters", JSON.stringify({ message_id: sent.message_id, allow_sending_without_reply: true }));
        d.append("document", f, f.name);
        d.append("caption", caption);
        try { await tgCall("sendDocument", d); } catch (_) { /* ничего */ }
      }
    }
  }
  async function sendRelay(msg, files, id) {
    const fd = new FormData();
    fd.append("orderId", id);
    fd.append("message", msg.html);
    if (msg.buttons) fd.append("buttons", JSON.stringify(msg.buttons));
    files.forEach((f, i) => fd.append("p" + i, f, f.name));
    const r = await fetch(TG.relayUrl, { method: "POST", body: fd });
    const j = await r.json().catch(() => ({ ok: false }));
    if (!r.ok || !j.ok) throw new Error(j.error || "HTTP " + r.status);
  }

  function showDone(text) {
    rows.forEach((r) => r.classList.remove("is-active"));
    $("#patternNav").hidden = true;
    $("#done").hidden = false;
    $("#doneText").textContent = text;
    progress(1);
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function showFallback(msg, reason) {
    const m = $("#fallback");
    $("#fbText").textContent = (reason ? "Не получилось отправить автоматически. " : "") +
      "Скопируй заявку и отправь мастеру в Telegram (@" + (CFG.contactUsername || "") + ")." + (refs.length ? " Фото-референсы прикрепи прямо в чате." : "");
    $("#fbMessage").value = msg.text;
    m.hidden = false;
    $("#fbCopy").onclick = async () => {
      try { await navigator.clipboard.writeText(msg.text); } catch (_) { $("#fbMessage").select(); document.execCommand("copy"); }
      window.open("https://t.me/" + (CFG.contactUsername || ""), "_blank", "noopener");
      m.hidden = true;
      showDone("Заявка скопирована. Вставь её в чат с @" + (CFG.contactUsername || "") + " и отправь 🧶");
    };
  }
  $("#fallback").addEventListener("click", (e) => { if (e.target.closest("[data-close]")) $("#fallback").hidden = true; });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (step < rows.length) { nextBtn.click(); return; }
    for (let i = 1; i <= rows.length; i++) if (!validate(i)) { if (i !== step) { showStep(i); validate(i); } return; }

    const id = orderId();
    // антиспам: ловушка для ботов и слишком быстрая отправка
    if (form.elements.website.value || Date.now() - startedAt < 4000) { showDone("Заявка отправлена!"); return; }
    const last = +localStorage.getItem("korka_last_sent") || 0;
    const wait = (CFG.cooldownSeconds || 90) * 1000 - (Date.now() - last);
    if (wait > 0) return err("Заявка уже улетела 🙂 Следующую можно отправить через " + Math.ceil(wait / 1000) + " сек.");

    const msg = buildMessage(id);
    const mode = TG.mode;
    const ready = (mode === "relay" && TG.relayUrl) || (mode === "direct" && TG.botToken && TG.chatId);
    if (!ready) { showFallback(msg, false); return; }

    sendBtn.disabled = true;
    sendBtn.classList.add("is-loading");
    sendBtn.querySelector("span").textContent = "Вяжу узелок…";
    try {
      const files = await Promise.all(refs.map((r) => shrink(r.file)));
      if (mode === "relay") await sendRelay(msg, files, id);
      else await sendDirect(msg, files, id);
      localStorage.setItem("korka_last_sent", Date.now());
      const ct = CONTACT[radio("contactType")] || CONTACT.tg;
      showDone("Заявка #" + id + " улетела мастеру в Telegram. Ответ придёт сюда: " + ct.name + " " + val("contact") + ".");
    } catch (ex) {
      console.warn("Отправка не удалась:", ex);
      showFallback(msg, true);
    } finally {
      sendBtn.disabled = false;
      sendBtn.classList.remove("is-loading");
      sendBtn.querySelector("span").textContent = "Завязать узелок и отправить";
    }
  });

  $("#again").addEventListener("click", () => {
    form.reset();
    refs.forEach((r) => URL.revokeObjectURL(r.url));
    refs = [];
    drawRefs();
    productInput.value = "";
    pickerSearch.value = "";
    renderPicker();
    $("#done").hidden = true;
    $("#patternNav").hidden = false;
    setContactType();
    update();
    showStep(1);
  });

  /* ================= API для каталога ================= */
  window.KorkaOrder = {
    preselect(id) {
      if (!$("#done").hidden) $("#again").click();
      const r = $('input[name="kind"][value="catalog"]', form);
      if (!radio("kind") || radio("kind") === "custom") r.checked = true;
      pickerSearch.value = "";
      renderPicker();
      selectProduct(id, false);
      showStep(1, false);
      update();
      setTimeout(() => { const el = $('.pick[aria-selected="true"]', picker); el && el.scrollIntoView({ block: "nearest", inline: "center" }); }, 600);
    }
  };

  setContactType();
  update();
  showStep(1, false);
})();
