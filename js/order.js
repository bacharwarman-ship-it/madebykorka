/* Korka — заявка и отправка в Telegram */
(function () {
  "use strict";
  const CFG = window.KORKA_CONFIG || {};
  const TG = CFG.telegram || {};
  const CATALOG = (window.KORKA_CATALOG || []).filter((x) => x.cat !== "08_portfolio_orders");
  const { photo } = window.KorkaPhoto;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = (n) => (n == null ? "" : Number(n).toLocaleString("ru-RU").replace(/\u00a0/g, " ") + " ₽");
  const ruDate = (iso) => iso.split("-").reverse().join(".");

  const form = $("#orderForm");
  const steps = $$(".step", form);
  const N = steps.length;
  const prevBtn = $("#prevBtn"), nextBtn = $("#nextBtn"), sendBtn = $("#sendBtn");
  const MAX_REFS = 5;
  const startedAt = Date.now();
  let step = 1;
  let refs = [];

  const YARN = [
    ["молочный", "#efe8d8"], ["лён", "#d9ccb2"], ["песочный", "#c9a982"], ["карамель", "#a8703f"], ["шоколад", "#5a3d2b"],
    ["графит", "#4a4a48"], ["чёрный", "#232320"], ["белый", "#fbfaf6"], ["терракота", "#b4583d"], ["ягодный", "#8e2f45"],
    ["пудровый", "#e3b5b0"], ["горчичный", "#c9a23a"], ["мох", "#5f6f37"], ["шалфей", "#9fb08f"], ["мята", "#a9d3c0"],
    ["голубой", "#8fb3d3"], ["индиго", "#34487a"], ["лаванда", "#a796c4"]
  ];
  const KIND = { catalog: "Повтор из коллекции", remix: "Повтор с изменениями", custom: "Свой персонаж" };
  const CONTACT = {
    tg:    { label: "Ник в Telegram", ph: "@username", type: "text", mode: "text", name: "Telegram" },
    vk:    { label: "Ссылка или ник ВКонтакте", ph: "vk.com/username", type: "text", mode: "url", name: "ВКонтакте" },
    phone: { label: "Номер телефона", ph: "+7 900 000-00-00", type: "tel", mode: "tel", name: "Телефон" },
    email: { label: "Электронная почта", ph: "name@mail.ru", type: "email", mode: "email", name: "Почта" }
  };
  const kinds = [...(CFG.onProfile || []).map((k) => ({ ...k, off: false })), ...(CFG.offProfile || []).map((k) => ({ ...k, off: true }))];

  /* ---------- построение ---------- */
  $("#creatureKinds").innerHTML = kinds.map((k) =>
    '<label class="pill" title="' + esc(k.hint || "") + '"><input type="radio" name="creature" value="' + k.key + '"><span>' + esc(k.label) + "</span></label>").join("");
  $("#swatches").innerHTML = YARN.map(([n, c]) =>
    '<label class="sw" title="' + n + '"><input type="checkbox" name="colors" value="' + n + '" aria-label="' + n + '"><span style="--c:' + c + '"></span></label>').join("") +
    '<label class="sw sw--any"><input type="checkbox" name="colors" value="на усмотрение мастера"><span>На усмотрение мастера</span></label>';
  const dots = [12, 18, 26, 36];
  $("#sizes").innerHTML = (CFG.sizes || []).map((s, i) =>
    '<label class="size"><input type="radio" name="size" value="' + s.key + '"><span class="size__body"><span class="size__dot"><i style="width:' + dots[i % 4] + "px;height:" + dots[i % 4] + 'px"></i></span>' +
    "<b>" + esc(s.label) + "</b><small>" + esc(s.note) + "</small><em>" + fmt(s.min) + (s.max !== s.min ? " – " + fmt(s.max) : "") + "</em></span></label>").join("");
  $("#budgets").innerHTML = (CFG.budgets || []).map((b) =>
    '<label class="pill"><input type="radio" name="budget" value="' + b.key + '"><span>' + esc(b.label) + "</span></label>").join("");

  const picker = $("#picker"), search = $("#pickerSearch"), pid = $("#productId");
  function renderPicker() {
    const q = search.value.trim().toLowerCase();
    picker.innerHTML = "";
    const l = CATALOG.filter((x) => !q || (x.title + " " + x.category + " " + (x.tags || []).join(" ")).toLowerCase().includes(q));
    l.forEach((x) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pick";
      b.setAttribute("role", "option");
      b.setAttribute("aria-selected", pid.value === x.id);
      b.dataset.id = x.id;
      b.appendChild(photo(x.photos[0], "", { onFail: () => b.remove() }));
      b.insertAdjacentHTML("beforeend", "<b>" + esc(x.title) + "</b><span>" + esc(x.priceText || fmt(x.price)) + "</span>");
      b.addEventListener("click", () => selectProduct(x.id));
      picker.appendChild(b);
    });
    if (!l.length) picker.innerHTML = '<p class="picker__none">Ничего не найдено</p>';
  }
  function selectProduct(id, scroll = true) {
    pid.value = id;
    $$(".pick", picker).forEach((p) => p.setAttribute("aria-selected", p.dataset.id === id));
    const el = $('.pick[data-id="' + CSS.escape(id) + '"]', picker);
    if (el && scroll) el.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    clearErr();
    update();
  }
  search.addEventListener("input", renderPicker);
  renderPicker();

  /* ---------- состояние ---------- */
  const val = (n) => { const el = form.elements[n]; return el ? (el.value || "").trim() : ""; };
  const radio = (n) => { const el = $('input[name="' + n + '"]:checked', form); return el ? el.value : ""; };
  const product = () => CATALOG.find((x) => x.id === pid.value) || null;
  const sizeObj = () => (CFG.sizes || []).find((s) => s.key === radio("size")) || null;
  const budgetObj = () => (CFG.budgets || []).find((b) => b.key === radio("budget")) || null;
  const kindObj = () => kinds.find((k) => k.key === radio("creature")) || null;
  const colors = () => $$('input[name="colors"]:checked', form).map((i) => i.value);
  const deadlineText = () => ($("#noRush").checked ? "срок не важен" : val("deadline") ? "к " + ruDate(val("deadline")) : "");

  function estimate() {
    const k = radio("kind"), p = product(), s = sizeObj();
    if (k === "catalog" && p) return { min: p.price, max: p.price, text: p.priceText || fmt(p.price), eg: "Цена работы «" + p.title + "» из коллекции." };
    if (k === "remix" && p && !s) return { min: p.price, max: p.price, text: "от " + fmt(p.price), eg: "Основа: «" + p.title + "». Изменения могут повлиять на стоимость." };
    if (s) return { min: s.min, max: s.max, text: s.min === s.max ? fmt(s.min) : fmt(s.min) + " – " + fmt(s.max), eg: "Например: " + s.eg + "." };
    return null;
  }

  function applyReveals() {
    const k = radio("kind");
    $$(".reveal[data-show]", form).forEach((el) => el.classList.toggle("is-on", !!k && el.dataset.show.split(" ").includes(k)));
    $("#refsTitle").textContent = k === "custom" ? "Референсы, обязательно" : "Референсы";
    $("#refsHint").textContent = k === "custom" ? "до 5 изображений персонажа" : "по желанию, до 5 изображений";
    const ch = $("#chosenProduct"), p = product();
    if ((k === "catalog" || k === "remix") && p) {
      ch.hidden = false;
      ch.innerHTML = "";
      ch.appendChild(photo(p.photos[0], p.title));
      ch.insertAdjacentHTML("beforeend", "<div><b>" + esc(p.title) + "</b><small>" + esc(p.priceText || fmt(p.price)) + " · " + esc(p.lead || "") + "</small></div>");
    } else ch.hidden = true;
    const ko = kindObj(), stop = $("#softStop");
    if (k === "custom" && ko && ko.off) {
      stop.hidden = false;
      stop.innerHTML = esc(ko.message) + ' <a href="#catalog">Перейти к коллекции</a>';
    } else stop.hidden = true;
    const c = colors();
    $("#colorsPicked").textContent = c.length ? "выбрано: " + c.join(", ") : "можно выбрать несколько";
  }

  function priceUI() {
    const e = estimate();
    $("#priceValue").textContent = e ? e.text : radio("kind") === "catalog" ? "Выберите работу" : "Выберите размер";
    $("#priceEg").textContent = (e ? e.eg + " " : "") + "Точную стоимость мастер назовёт после просмотра заявки.";
    $("#wovenPrice").textContent = e ? e.text : "—";
    const w = $("#budgetWarn"), b = budgetObj();
    if (e && b && b.max < e.min) {
      w.hidden = false;
      w.textContent = "Обычно такие работы стоят от " + fmt(e.min) + ". Можно выбрать размер поменьше, или мастер предложит упрощённый вариант.";
    } else w.hidden = true;
  }

  function summary() {
    const k = radio("kind"), p = product(), ko = kindObj(), s = sizeObj(), b = budgetObj();
    const refTxt = [refs.length ? refs.length + " изобр." : "", val("refLink") ? "ссылка" : ""].filter(Boolean).join(" + ");
    const ct = CONTACT[radio("contactType")] || CONTACT.tg;
    return [
      ["Заказ", k ? KIND[k] : ""],
      [k === "custom" ? "Персонаж" : "Работа", k === "custom" ? [ko && ko.label, val("character")].filter(Boolean).join(", ") : p ? p.title : ""],
      ["Референсы", refTxt],
      ["Пряжа", colors().join(", ") || (k === "catalog" ? "как в оригинале" : "")],
      ["Размер", s ? s.label : k === "catalog" ? "как в коллекции" : ""],
      ["Бюджет", b ? b.label : ""],
      ["Срок", deadlineText()],
      ["Связь", val("contact") ? ct.name + ": " + val("contact") : ""]
    ];
  }
  let tickT;
  function renderSummary() {
    const rows = summary();
    $("#wovenList").innerHTML = rows.map(([t, v]) => '<div class="' + (v ? "" : "is-empty") + '"><dt>' + esc(t) + "</dt><dd>" + esc(v || "—") + "</dd></div>").join("");
    $("#review").innerHTML = "<dl>" + rows.filter(([, v]) => v).map(([t, v]) => "<div><dt>" + esc(t) + "</dt><dd>" + esc(v) + "</dd></div>").join("") +
      (estimate() ? "<div><dt>Ориентир</dt><dd>" + esc(estimate().text) + "</dd></div>" : "") + "</dl>";
    const w = $("#woven");
    clearTimeout(tickT);
    tickT = setTimeout(() => { w.classList.remove("is-tick"); void w.offsetWidth; w.classList.add("is-tick"); }, 150);
  }
  function update() { applyReveals(); priceUI(); renderSummary(); }

  /* ---------- прогресс ---------- */
  function progress(p) {
    $("#thread").style.setProperty("--p", p);
    $("#barFill").style.width = p * 100 + "%";
    $$("#thread li").forEach((li) => {
      const n = +li.dataset.step;
      li.classList.toggle("is-current", n === step && p < 1);
      li.classList.toggle("is-done", n < step || p >= 1);
    });
  }

  function showStep(n, scroll = true) {
    step = n;
    steps.forEach((s) => s.classList.toggle("is-active", +s.dataset.step === n));
    prevBtn.hidden = n === 1;
    nextBtn.hidden = n === N;
    sendBtn.hidden = n !== N;
    $("#stepCount").textContent = "Шаг " + n + " из " + N;
    progress((n - 1) / (N - 1) * 0.999);
    clearErr();
    if (scroll) {
      const top = form.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight * 0.5) window.scrollTo({ top: window.scrollY + top - 80, behavior: "smooth" });
    }
  }
  function err(msg, field) {
    const box = $(".step.is-active .step__err", form);
    if (box) box.textContent = msg;
    if (field) { field.classList.add("is-bad"); field.focus({ preventScroll: false }); }
    return false;
  }
  function clearErr() { $$(".step__err", form).forEach((e) => (e.textContent = "")); $$(".is-bad", form).forEach((e) => e.classList.remove("is-bad")); }

  const reTg = /^(@?[a-zA-Z][a-zA-Z0-9_]{3,31}|(https?:\/\/)?t\.me\/[a-zA-Z0-9_]{4,32}|\+?[\d\s()-]{10,18})$/;
  const reVk = /^((https?:\/\/)?(m\.)?vk\.(com|ru)\/[\w.]{2,}|@?[a-zA-Z0-9_.]{3,}|id\d+)$/;
  const reMail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function validate(n) {
    const k = radio("kind");
    if (n === 1) {
      if (!k) return err("Выберите вариант заказа.");
      if ((k === "catalog" || k === "remix") && !product()) return err("Выберите работу из коллекции.", search);
      if (k === "remix" && !val("changes")) return err("Опишите, что изменить.", form.elements.changes);
      if (k === "custom") {
        const ko = kindObj();
        if (!ko) return err("Отметьте, кто это.");
        if (ko.off) return err("Этот вариант мастер не берёт в работу.");
        if (!val("character")) return err("Укажите персонажа.", form.elements.character);
      }
    }
    if (n === 2) {
      const link = val("refLink");
      if (link && !/^https?:\/\/\S+\.\S+/.test(link)) return err("Ссылка должна начинаться с https://", form.elements.refLink);
      if (k === "custom" && !refs.length && !link) return err("Добавьте хотя бы одно изображение или ссылку на персонажа.");
    }
    if (n === 3) {
      if ((k === "remix" || k === "custom") && !sizeObj()) return err("Выберите размер.");
      if (k === "custom" && !budgetObj()) return err("Отметьте бюджет, так ответ по цене будет точнее.");
      const d = val("deadline");
      if (d && new Date(d) < new Date(new Date().toDateString())) return err("Эта дата уже прошла.", form.elements.deadline);
    }
    if (n === 4) {
      if (!val("name")) return err("Укажите имя.", form.elements.name);
      const c = val("contact"), t = radio("contactType"), digits = c.replace(/\D/g, "").length;
      if (!c) return err("Укажите контакт для ответа.", form.elements.contact);
      const ok = t === "tg" ? reTg.test(c) : t === "vk" ? reVk.test(c) : t === "email" ? reMail.test(c) : digits >= 10 && digits <= 15;
      if (!ok) return err("Проверьте контакт, похоже, в нём опечатка.", form.elements.contact);
      if (!$("#honest").checked) return err("Подтвердите, что обращаетесь по поводу заказа.");
    }
    return true;
  }

  nextBtn.addEventListener("click", () => { if (validate(step)) showStep(step + 1); });
  prevBtn.addEventListener("click", () => showStep(step - 1));
  form.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName === "INPUT" && step < N) { e.preventDefault(); nextBtn.click(); }
  });
  form.addEventListener("change", (e) => {
    const n = e.target.name;
    if (n === "kind" || n === "creature") clearErr();
    if (n === "contactType") setContact();
    if (e.target.id === "noRush" && e.target.checked) form.elements.deadline.value = "";
    if (e.target.id === "deadline" && e.target.value) $("#noRush").checked = false;
    if (n === "size" || n === "kind") { const t = $("#estimate"); t.classList.remove("is-bump"); void t.offsetWidth; t.classList.add("is-bump"); }
    update();
  });
  form.addEventListener("input", (e) => {
    if (e.target.id === "pickerSearch") return;
    e.target.classList && e.target.classList.remove("is-bad");
    renderSummary();
  });
  function setContact() {
    const c = CONTACT[radio("contactType")] || CONTACT.tg, inp = $("#contact");
    $("#contactLabel").textContent = c.label;
    inp.placeholder = c.ph;
    inp.type = c.type;
    inp.inputMode = c.mode;
  }
  $("#deadline").min = new Date().toISOString().slice(0, 10);

  /* ---------- референсы ---------- */
  const drop = $("#drop"), input = $("#refInput"), thumbs = $("#thumbs");
  function addFiles(list) {
    for (const f of Array.from(list || [])) {
      if (!/^image\//.test(f.type) && !/\.(heic|heif)$/i.test(f.name)) continue;
      if (refs.length >= MAX_REFS) { err("Можно приложить до " + MAX_REFS + " изображений."); break; }
      if (f.size > 20 * 1024 * 1024) { err("Файл «" + f.name + "» больше 20 МБ."); continue; }
      refs.push({ file: f, url: URL.createObjectURL(f) });
    }
    drawRefs();
  }
  function drawRefs() {
    thumbs.innerHTML = "";
    refs.forEach((r, i) => {
      const d = document.createElement("div");
      d.className = "thumb";
      d.innerHTML = '<img alt="Референс ' + (i + 1) + '" src="' + r.url + '"><button type="button" aria-label="Убрать"><svg><use href="#i-close"/></svg></button>';
      d.querySelector("button").addEventListener("click", () => { URL.revokeObjectURL(r.url); refs.splice(i, 1); drawRefs(); });
      thumbs.appendChild(d);
    });
    renderSummary();
  }
  input.addEventListener("change", () => { addFiles(input.files); input.value = ""; });
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("is-over"); }));
  drop.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
  document.addEventListener("paste", (e) => {
    if (step !== 2 || !$("#refsBlock").classList.contains("is-on")) return;
    const f = Array.from((e.clipboardData && e.clipboardData.files) || []);
    if (f.length) addFiles(f);
  });

  /* ---------- сообщение мастеру ---------- */
  function orderId() {
    const d = new Date();
    return "K-" + String(d.getDate()).padStart(2, "0") + String(d.getMonth() + 1).padStart(2, "0") + "-" + Math.random().toString(36).slice(2, 5).toUpperCase();
  }
  function contactLink() {
    const t = radio("contactType"), c = val("contact");
    if (t === "tg" && !/^\+?[\d\s()-]{10,18}$/.test(c)) return "https://t.me/" + c.replace(/^@/, "").replace(/^(https?:\/\/)?t\.me\//, "");
    if (t === "vk") return /vk\.(com|ru)\//.test(c) ? (c.startsWith("http") ? c : "https://" + c) : "https://vk.com/" + c.replace(/^@/, "");
    return null;
  }
  function buildMessage(id) {
    const k = radio("kind"), p = product(), ko = kindObj(), s = sizeObj(), b = budgetObj(), e = estimate();
    const L = [];
    const add = (t, v, raw) => { if (v) L.push("<b>" + t + ":</b> " + (raw ? v : esc(v))); };
    L.push("<b>НОВАЯ ЗАЯВКА</b>  <code>#" + id + "</code>", "");
    add("Заказ", KIND[k]);
    if (p) add("Работа", '<a href="' + esc(p.post) + '">' + esc(p.title) + "</a>, " + esc(p.priceText || fmt(p.price)), true);
    if (k === "remix") add("Изменить", val("changes"));
    if (k === "custom") { add("Кто это", ko && ko.label); add("Персонаж", val("character")); }
    add("Пряжа", colors().join(", "));
    add("Пожелания", val("colorNote"));
    const rp = [];
    if (refs.length) rp.push(refs.length + " изобр. (ниже)");
    if (val("refLink")) rp.push('<a href="' + esc(val("refLink")) + '">ссылка</a>');
    add("Референсы", rp.join(", "), true);
    L.push("");
    add("Размер", s ? s.label + " (" + s.note + ")" : k === "catalog" ? "как в коллекции" : "");
    add("Ориентир", e && e.text);
    if (b) add("Бюджет", b.label + (e && b.max < e.min ? "  [ниже ориентира]" : ""));
    add("Срок", deadlineText() || "не указан");
    L.push("");
    add("Имя", val("name"));
    const ct = CONTACT[radio("contactType")] || CONTACT.tg, link = contactLink();
    add("Связь", ct.name + ": " + (link ? '<a href="' + esc(link) + '">' + esc(val("contact")) + "</a>" : esc(val("contact"))), true);
    add("Город", val("city"));
    add("Комментарий", val("comment"));
    const html = L.join("\n").slice(0, 4000);
    const text = html.replace(/<a href="([^"]+)">([^<]*)<\/a>/g, "$2 ($1)").replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    return { html, text, buttons: link ? [{ text: "Написать клиенту", url: link }] : null };
  }

  /* ---------- отправка ---------- */
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
  async function tg(method, fd) {
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
    const sent = await tg("sendMessage", fd);
    if (!files.length) return;
    const caption = "Референсы к заявке #" + id;
    const reply = JSON.stringify({ message_id: sent.message_id, allow_sending_without_reply: true });
    try {
      const g = new FormData();
      g.append("chat_id", TG.chatId);
      g.append("reply_parameters", reply);
      if (files.length === 1) { g.append("photo", files[0], files[0].name); g.append("caption", caption); await tg("sendPhoto", g); }
      else {
        g.append("media", JSON.stringify(files.map((f, i) => ({ type: "photo", media: "attach://p" + i, caption: i === 0 ? caption : undefined }))));
        files.forEach((f, i) => g.append("p" + i, f, f.name));
        await tg("sendMediaGroup", g);
      }
    } catch (_) {
      for (const f of files) {
        const d = new FormData();
        d.append("chat_id", TG.chatId); d.append("reply_parameters", reply); d.append("document", f, f.name); d.append("caption", caption);
        try { await tg("sendDocument", d); } catch (_) { /* пропускаем */ }
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

  function showDone(id, text) {
    steps.forEach((s) => s.classList.remove("is-active"));
    $("#sheetNav").hidden = true;
    $("#done").hidden = false;
    $("#doneId").textContent = id ? "Заявка #" + id : "";
    $("#doneText").textContent = text;
    step = N + 1;
    progress(1);
    $("#stepCount").textContent = "Готово";
    window.scrollTo({ top: window.scrollY + form.getBoundingClientRect().top - 80, behavior: "smooth" });
  }
  const fb = $("#fallback");
  function showFallback(msg, id, failed) {
    const u = CFG.contactUsername || "";
    $("#fbText").textContent = (failed ? "Автоматическая отправка сейчас недоступна. " : "") +
      "Скопируйте заявку и отправьте её мастеру в Telegram, @" + u + "." + (refs.length ? " Изображения приложите в том же чате." : "");
    $("#fbMessage").value = msg.text;
    fb.hidden = false;
    document.documentElement.style.overflow = "hidden";
    $("#fbCopy").onclick = async () => {
      try { await navigator.clipboard.writeText(msg.text); } catch (_) { $("#fbMessage").select(); document.execCommand("copy"); }
      window.open("https://t.me/" + u, "_blank", "noopener");
      closeFb();
      showDone(id, "Текст заявки скопирован. Вставьте его в чат с @" + u + " и отправьте.");
    };
  }
  function closeFb() { fb.hidden = true; document.documentElement.style.overflow = ""; }
  fb.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeFb(); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (step < N) { nextBtn.click(); return; }
    for (let i = 1; i <= N; i++) if (!validate(i)) { if (i !== step) { showStep(i); validate(i); } return; }
    const id = orderId();
    if (form.elements.website.value || Date.now() - startedAt < 4000) { showDone(id, "Заявка отправлена."); return; }
    const last = +localStorage.getItem("korka_last_sent") || 0;
    const wait = (CFG.cooldownSeconds || 90) * 1000 - (Date.now() - last);
    if (wait > 0) return err("Заявка уже отправлена. Следующую можно отправить через " + Math.ceil(wait / 1000) + " сек.");
    const msg = buildMessage(id);
    const mode = TG.mode;
    const ready = (mode === "relay" && TG.relayUrl) || (mode === "direct" && TG.botToken && TG.chatId);
    if (!ready) { showFallback(msg, id, false); return; }
    sendBtn.disabled = true;
    sendBtn.classList.add("is-loading");
    sendBtn.querySelector("span").textContent = "Отправляем";
    try {
      const files = await Promise.all(refs.map((r) => shrink(r.file)));
      if (mode === "relay") await sendRelay(msg, files, id); else await sendDirect(msg, files, id);
      localStorage.setItem("korka_last_sent", Date.now());
      const ct = CONTACT[radio("contactType")] || CONTACT.tg;
      showDone(id, "Мастер получила заявку в Telegram и ответит вам: " + ct.name + ", " + val("contact") + ".");
    } catch (ex) {
      console.warn("Отправка не удалась:", ex);
      showFallback(msg, id, true);
    } finally {
      sendBtn.disabled = false;
      sendBtn.classList.remove("is-loading");
      sendBtn.querySelector("span").textContent = "Отправить заявку";
    }
  });

  function resetForm() {
    form.reset();
    refs.forEach((r) => URL.revokeObjectURL(r.url));
    refs = [];
    drawRefs();
    pid.value = "";
    search.value = "";
    renderPicker();
    $("#done").hidden = true;
    $("#sheetNav").hidden = false;
    setContact();
    update();
    showStep(1, false);
  }
  $("#again").addEventListener("click", resetForm);

  window.KorkaOrder = {
    preselect(id) {
      if (!$("#done").hidden) resetForm();
      const k = radio("kind");
      if (!k || k === "custom") $('input[name="kind"][value="catalog"]', form).checked = true;
      search.value = "";
      renderPicker();
      selectProduct(id, false);
      showStep(1, false);
      update();
      setTimeout(() => { const el = $('.pick[aria-selected="true"]', picker); if (el) picker.scrollTo({ left: el.offsetLeft - picker.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" }); }, 700);
    }
  };

  setContact();
  update();
  showStep(1, false);
})();
