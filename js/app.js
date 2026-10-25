/* made by korka — каталог, галерея, навигация */
(function () {
  "use strict";
  const CFG = window.KORKA_CONFIG || {};
  const CATALOG = window.KORKA_CATALOG || [];
  const CATS = window.KORKA_CATEGORIES || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const PORTFOLIO = "08_portfolio_orders";

  const fmt = (n) => n == null ? "" : n.toLocaleString("ru-RU").replace(/\u00a0/g, " ") + " ₽";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- Фото: локальный файл → CDN Telegram → вязаная заглушка ---------- */
  function placeholder(file, path) {
    const d = document.createElement("div");
    d.className = "ph";
    d.title = path || file || "";
    d.innerHTML = '<svg viewBox="0 0 64 64"><use href="#i-yarn"/></svg><small>сюда фото</small><code>' + esc(file || "photo.jpg") + "</code>";
    return d;
  }
  function photo(p, alt, opts = {}) {
    if (!p) return placeholder("", "");
    const img = new Image();
    img.alt = alt || "";
    img.loading = opts.eager ? "eager" : "lazy";
    img.decoding = "async";
    let triedCdn = false;
    img.onerror = () => {
      if (!triedCdn && CFG.useTelegramCdnFallback && p.cdn) { triedCdn = true; img.src = p.cdn; return; }
      img.replaceWith(placeholder(p.file, p.path));
    };
    img.src = p.path;
    return img;
  }
  window.KorkaPhoto = { photo, placeholder };

  const findByPath = (path) => {
    for (const it of CATALOG) for (const ph of it.photos) if (ph.path === path) return ph;
    return { path, file: path.split("/").pop() };
  };

  /* ---------- hero: полароиды ---------- */
  $$(".polaroid[data-photo]").forEach((fig) => {
    const p = findByPath(fig.dataset.photo);
    fig.prepend(photo(p, fig.textContent.trim(), { eager: true }));
  });

  const shop = CATALOG.filter((x) => x.cat !== PORTFOLIO);
  const statCount = $('[data-stat="count"]');
  if (statCount) statCount.textContent = shop.length;
  const minPrice = Math.min(...shop.map((x) => x.price).filter(Boolean));
  const statMin = $('[data-stat="min"]');
  if (statMin && isFinite(minPrice)) statMin.textContent = fmt(minPrice);

  /* ---------- фильтры-катушки ---------- */
  const spoolColors = {
    all: "#8aa65a", "01_ktulhucats": "#6a9b7e", "02_avatar_fandom": "#6a9bc4", "03_pokemon": "#e2b257",
    "04_games_and_cartoons": "#9a7bc4", "05_mythical_creatures": "#c46a5a", "06_plush_giants_1_meter": "#4f6b33", "07_animals_and_custom": "#d4a373"
  };
  const state = { cat: "all", stock: false, sort: "new" };
  const spools = $("#spools");
  const counts = shop.reduce((a, x) => ((a[x.cat] = (a[x.cat] || 0) + 1), a), {});
  const catKeys = ["all", ...Object.keys(CATS).filter((k) => k !== PORTFOLIO && counts[k])];
  catKeys.forEach((k) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "spool";
    b.style.setProperty("--c", spoolColors[k] || "#8aa65a");
    b.setAttribute("aria-pressed", k === "all");
    b.dataset.cat = k;
    b.innerHTML = '<span class="spool__ico"></span>' + (k === "all" ? "Все" : esc(CATS[k])) + " <small>" + (k === "all" ? shop.length : counts[k]) + "</small>";
    b.addEventListener("click", () => {
      state.cat = k;
      $$(".spool", spools).forEach((s) => s.setAttribute("aria-pressed", s === b));
      render();
    });
    spools.appendChild(b);
  });
  $("#onlyStock").addEventListener("change", (e) => { state.stock = e.target.checked; render(); });
  $("#sortBy").addEventListener("change", (e) => { state.sort = e.target.value; render(); });

  /* ---------- карточки ---------- */
  const grid = $("#grid");
  function card(it, i) {
    const a = document.createElement("article");
    a.className = "card";
    a.style.animationDelay = Math.min(i * 40, 500) + "ms";
    a.tabIndex = 0;
    a.setAttribute("aria-label", it.title);
    const inStock = /наличи/i.test(it.status);
    const ph = document.createElement("div");
    ph.className = "card__photo";
    ph.appendChild(photo(it.photos[0], it.title));
    ph.insertAdjacentHTML("beforeend",
      '<span class="badge ' + (inStock ? "" : "badge--order") + '">' + (inStock ? "в наличии" : "под заказ") + "</span>" +
      (it.photos.length > 1 ? '<span class="card__count">📷 ' + it.photos.length + "</span>" : ""));
    a.appendChild(ph);
    a.insertAdjacentHTML("beforeend",
      '<div class="card__body">' +
        '<span class="card__cat">' + esc(CATS[it.cat] || it.category) + "</span>" +
        '<h3 class="card__title">' + esc(it.title) + "</h3>" +
        '<span class="card__meta">⏳ ' + esc(it.lead || "") + "</span>" +
        '<div class="card__foot"><span class="price-tag">' + esc(it.priceText || fmt(it.price)) + "</span>" +
        '<button type="button" class="want" data-want="' + esc(it.id) + '">Хочу такого</button></div>' +
      "</div>");
    a.addEventListener("click", (e) => {
      if (e.target.closest("[data-want]")) return;
      openModal(it);
    });
    a.addEventListener("keydown", (e) => { if (e.key === "Enter") openModal(it); });
    return a;
  }
  function render() {
    let list = shop.filter((x) => (state.cat === "all" || x.cat === state.cat) && (!state.stock || /наличи/i.test(x.status)));
    if (state.sort === "cheap") list.sort((a, b) => a.price - b.price);
    else if (state.sort === "expensive") list.sort((a, b) => b.price - a.price);
    else list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    grid.innerHTML = "";
    list.forEach((it, i) => grid.appendChild(card(it, i)));
    $("#empty").hidden = list.length > 0;
  }
  render();

  grid.addEventListener("click", (e) => {
    const b = e.target.closest("[data-want]");
    if (b) wantThis(b.dataset.want);
  });

  /* ---------- портфолио ---------- */
  const board = $("#corkboard");
  const port = CATALOG.find((x) => x.cat === PORTFOLIO);
  if (port && board) {
    port.photos.forEach((p, i) => {
      const f = document.createElement("figure");
      f.className = "polaroid";
      f.style.animationDelay = -i * 0.7 + "s";
      f.appendChild(photo(p, "Выполненный заказ " + (i + 1)));
      f.insertAdjacentHTML("beforeend", "<figcaption>заказ №" + (i + 1) + "</figcaption>");
      f.addEventListener("click", () => openModal(port, i));
      board.appendChild(f);
    });
  }

  /* ---------- что вяжу / не вяжу ---------- */
  const yes = $("#fitYes"), no = $("#fitNo");
  (CFG.onProfile || []).forEach((o) => yes.insertAdjacentHTML("beforeend", "<li>" + esc(o.label) + "<small>" + esc(o.hint || "") + "</small></li>"));
  yes.insertAdjacentHTML("beforeend", "<li>Метровые гиганты<small>Несси, Чупакабрик и другие обнимашки</small></li>");
  (CFG.offProfile || []).forEach((o) => no.insertAdjacentHTML("beforeend", "<li>" + esc(o.label) + "<small>" + esc(o.hint || "") + "</small></li>"));

  /* ---------- модалка ---------- */
  const modal = $("#modal");
  let lastFocus = null, current = null;
  function openModal(it, startIdx = 0) {
    current = it;
    lastFocus = document.activeElement;
    $("#modalCat").textContent = CATS[it.cat] || it.category || "";
    $("#modalTitle").textContent = it.title;
    $("#modalDesc").textContent = it.desc || "";
    const specs = [
      ["Цена", it.priceText || fmt(it.price)], ["Статус", it.status], ["Срок", it.lead],
      ["Материалы", it.materials], ["Цвета", (it.colors || []).join(", ")], ["Размер", it.dims]
    ].filter(([, v]) => v);
    $("#modalSpecs").innerHTML = specs.map(([k, v]) => "<dt>" + esc(k) + "</dt><dd>" + esc(v) + "</dd>").join("");
    const main = $("#modalMain"), thumbs = $("#modalThumbs");
    thumbs.innerHTML = "";
    const show = (i) => {
      main.innerHTML = "";
      main.appendChild(photo(it.photos[i], it.title + " — фото " + (i + 1), { eager: true }));
      $$("button", thumbs).forEach((b, j) => b.setAttribute("aria-current", i === j));
    };
    it.photos.forEach((p, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", "Фото " + (i + 1));
      b.appendChild(photo(p, ""));
      b.addEventListener("click", () => show(i));
      thumbs.appendChild(b);
    });
    show(startIdx);
    const post = $("#modalPost");
    post.href = it.post || CFG.channelUrl;
    const orderBtn = $("#modalOrder");
    orderBtn.hidden = it.cat === PORTFOLIO;
    orderBtn.onclick = () => { closeModal(); wantThis(it.id); };
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    $(".modal__close", modal).focus();
  }
  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = "";
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }
  modal.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeModal(); });
  document.addEventListener("keydown", (e) => {
    if (modal.hidden) return;
    if (e.key === "Escape") closeModal();
    if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && current) {
      const btns = $$("#modalThumbs button");
      const i = btns.findIndex((b) => b.getAttribute("aria-current") === "true");
      const n = (i + (e.key === "ArrowRight" ? 1 : -1) + btns.length) % btns.length;
      btns[n] && btns[n].click();
    }
  });

  /* ---------- «Хочу такого» → форма ---------- */
  function wantThis(id) {
    if (window.KorkaOrder) window.KorkaOrder.preselect(id);
    document.getElementById("order").scrollIntoView({ behavior: "smooth" });
  }

  /* ---------- меню ---------- */
  const burger = $("#burger"), nav = $("#nav");
  burger.addEventListener("click", () => {
    const open = !nav.classList.contains("is-open");
    nav.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", open);
  });
  $$("a", nav).forEach((a) => a.addEventListener("click", () => { nav.classList.remove("is-open"); burger.setAttribute("aria-expanded", false); }));

  /* ---------- ссылки из конфига ---------- */
  if (CFG.channelUrl) $("#channelLink").href = CFG.channelUrl;
  if (CFG.contactUsername) $("#dmLink").href = "https://t.me/" + CFG.contactUsername;
  $("#year").textContent = new Date().getFullYear();
})();
