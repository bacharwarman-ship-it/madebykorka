/* Korka — коллекция, карточка работы, навигация */
(function () {
  "use strict";
  const CFG = window.KORKA_CONFIG || {};
  const CATALOG = window.KORKA_CATALOG || [];
  const CATS = window.KORKA_CATEGORIES || {};
  const PORTFOLIO = "08_portfolio_orders";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => (n == null ? "" : Number(n).toLocaleString("ru-RU").replace(/\u00a0/g, " ") + " ₽");
  const mobile = () => window.matchMedia("(max-width: 760px)").matches;

  /* Фото: локальный файл → копия в Telegram → элемент убирается (никаких заглушек) */
  function photo(p, alt, opts = {}) {
    const img = new Image();
    img.alt = alt || "";
    img.decoding = "async";
    if (!opts.eager) img.loading = "lazy";
    if (opts.className) img.className = opts.className;
    let triedCdn = false;
    img.onerror = () => {
      if (!triedCdn && CFG.useTelegramCdnFallback !== false && p && p.cdn) { triedCdn = true; img.src = p.cdn; return; }
      if (opts.onFail) opts.onFail(img); else img.remove();
    };
    if (p) img.src = p.path; else img.onerror();
    return img;
  }
  window.KorkaPhoto = { photo };

  const shop = CATALOG.filter((x) => x.cat !== PORTFOLIO);
  const inStock = (x) => /^в наличии/i.test(x.status || "");

  /* ---------- hero ---------- */
  const heroItem = shop.find((x) => x.photos.some((p) => /ktulhucat_green_purple_01/.test(p.file)));
  if (heroItem) {
    $("#heroName").textContent = heroItem.title.replace(/\s*\(.*\)\s*/, "");
    $("#heroMeta").textContent = heroItem.priceText || fmt(heroItem.price);
    $("#heroFeature").addEventListener("click", () => openItem(heroItem));
    $("#heroFeature").style.cursor = "pointer";
  }
  const stat = (k, v) => { const el = $('[data-stat="' + k + '"]'); if (el) el.textContent = v; };
  stat("count", shop.length);
  const min = Math.min(...shop.map((x) => x.price).filter(Boolean));
  if (isFinite(min)) stat("min", fmt(min));

  /* ---------- коллекция ---------- */
  const state = { cat: "all", stock: false, sort: "new", shown: 0 };
  const PAGE = () => (mobile() ? 8 : 12);
  const tabs = $("#tabs"), grid = $("#grid"), more = $("#moreBtn");
  const counts = shop.reduce((a, x) => ((a[x.cat] = (a[x.cat] || 0) + 1), a), {});
  ["all", ...Object.keys(CATS).filter((k) => k !== PORTFOLIO && counts[k])].forEach((k) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tab";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", k === "all");
    b.innerHTML = esc(k === "all" ? "Все работы" : CATS[k]) + "<sup>" + (k === "all" ? shop.length : counts[k]) + "</sup>";
    b.addEventListener("click", () => {
      state.cat = k;
      $$(".tab", tabs).forEach((t) => t.setAttribute("aria-selected", t === b));
      b.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
      render(true);
    });
    tabs.appendChild(b);
  });
  $("#onlyStock").addEventListener("change", (e) => { state.stock = e.target.checked; render(true); });
  $("#sortBy").addEventListener("change", (e) => { state.sort = e.target.value; render(true); });

  function list() {
    const l = shop.filter((x) => (state.cat === "all" || x.cat === state.cat) && (!state.stock || inStock(x)));
    if (state.sort === "cheap") l.sort((a, b) => a.price - b.price);
    else if (state.sort === "expensive") l.sort((a, b) => b.price - a.price);
    else l.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return l;
  }
  function card(it) {
    const a = document.createElement("article");
    a.className = "item";
    const media = document.createElement("a");
    media.className = "item__media";
    media.href = "#catalog";
    media.setAttribute("aria-label", it.title);
    media.appendChild(photo(it.photos[0], it.title, { onFail: () => a.remove() }));
    if (it.photos[1] && window.matchMedia("(hover: hover)").matches) {
      a.addEventListener("mouseenter", () => {
        if (a.dataset.alt) return;
        a.dataset.alt = 1;
        const alt = photo(it.photos[1], "", { className: "item__alt", eager: true });
        alt.addEventListener("load", () => alt.classList.add("is-ready"));
        media.appendChild(alt);
      }, { once: true });
    }
    if (inStock(it)) media.insertAdjacentHTML("beforeend", '<span class="item__badge">В наличии</span>');
    a.appendChild(media);
    a.insertAdjacentHTML("beforeend",
      '<button type="button" class="item__add" aria-label="Заказать такую" data-want="' + esc(it.id) + '"><svg><use href="#i-plus"/></svg></button>' +
      '<div class="item__info"><p class="item__cat">' + esc(CATS[it.cat] || it.category) + '</p><h3 class="item__title">' + esc(it.title) + '</h3><p class="item__price">' + esc(it.priceText || fmt(it.price)) + "</p></div>");
    a.addEventListener("click", (e) => {
      e.preventDefault();
      if (e.target.closest("[data-want]")) { wantThis(it.id); return; }
      openItem(it);
    });
    return a;
  }
  function render(reset) {
    const l = list();
    if (reset) { grid.innerHTML = ""; state.shown = 0; }
    const next = l.slice(state.shown, state.shown + PAGE());
    const frag = document.createDocumentFragment();
    next.forEach((it) => frag.appendChild(card(it)));
    grid.appendChild(frag);
    state.shown += next.length;
    $("#empty").hidden = l.length > 0;
    const left = l.length - state.shown;
    more.hidden = left <= 0;
    more.textContent = "Показать ещё " + left;
  }
  more.addEventListener("click", () => render(false));
  render(true);

  /* ---------- работы на заказ ---------- */
  const rail = $("#rail");
  const port = CATALOG.find((x) => x.cat === PORTFOLIO);
  if (port) {
    port.photos.forEach((p, i) => {
      const f = document.createElement("figure");
      const fr = document.createElement("div");
      fr.className = "frame";
      fr.appendChild(photo(p, "Работа на заказ " + (i + 1), { onFail: () => f.remove() }));
      f.appendChild(fr);
      f.insertAdjacentHTML("beforeend", "<figcaption><span>Заказ " + String(i + 1).padStart(2, "0") + "</span><span>ручная работа</span></figcaption>");
      f.addEventListener("click", () => openItem(port, i));
      rail.appendChild(f);
    });
  }
  $$("[data-rail]").forEach((b) => b.addEventListener("click", () => {
    const step = (rail.firstElementChild ? rail.firstElementChild.getBoundingClientRect().width + 20 : 300) * 2;
    rail.scrollBy({ left: step * +b.dataset.rail, behavior: "smooth" });
  }));

  /* ---------- вяжет / не берёт ---------- */
  const li = (o, icon) => '<li><svg><use href="#' + icon + '"/></svg><b>' + esc(o.label) + "</b><small>" + esc(o.hint || "") + "</small></li>";
  $("#fitYes").innerHTML = (CFG.onProfile || []).map((o) => li(o, "i-check")).join("") + li({ label: "Большие работы до метра", hint: "Несси, Чупакабрик и другие" }, "i-check");
  $("#fitNo").innerHTML = (CFG.offProfile || []).map((o) => li(o, "i-minus")).join("");

  /* ---------- карточка работы ---------- */
  const modal = $("#modal"), track = $("#pmTrack"), count = $("#pmCount");
  let lastFocus = null;
  function openItem(it, start = 0) {
    lastFocus = document.activeElement;
    const isPort = it.cat === PORTFOLIO;
    $("#pmCat").textContent = CATS[it.cat] || it.category || "";
    $("#pmTitle").textContent = isPort ? "Работы на заказ" : it.title;
    $("#pmPrice").textContent = isPort ? "от 1 500 ₽" : it.priceText || fmt(it.price);
    const specs = isPort ? [["Срок", it.lead]] : [["Наличие", it.status], ["Срок", it.lead], ["Материалы", it.materials], ["Цвета", (it.colors || []).join(", ")], ["Размер", it.dims]];
    $("#pmSpecs").innerHTML = specs.filter(([, v]) => v).map(([k, v]) => "<div><dt>" + esc(k) + "</dt><dd>" + esc(v) + "</dd></div>").join("");
    $("#pmDesc").textContent = it.desc || "";
    const upd = () => { const n = track.children.length; const i = Math.round(track.scrollLeft / (track.clientWidth || 1)); count.textContent = n > 1 ? (Math.min(i, n - 1) + 1) + " / " + n : ""; count.hidden = n < 2; };
    track.innerHTML = "";
    it.photos.forEach((p, i) => track.appendChild(photo(p, it.title + ", фото " + (i + 1), { eager: i === start, onFail: (img) => { img.remove(); upd(); } })));
    track.onscroll = () => requestAnimationFrame(upd);
    $("#pmPost").href = it.post || CFG.channelUrl;
    const ob = $("#pmOrder");
    ob.innerHTML = (isPort ? "Заказать похожую" : "Заказать такую") + ' <svg><use href="#i-arrow"/></svg>';
    ob.onclick = () => { close(); isPort ? goOrder() : wantThis(it.id); };
    modal.hidden = false;
    document.documentElement.style.overflow = "hidden";
    requestAnimationFrame(() => { track.scrollLeft = track.clientWidth * start; upd(); });
    $(".pm__close", modal).focus({ preventScroll: true });
  }
  function close() {
    modal.hidden = true;
    document.documentElement.style.overflow = "";
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }
  modal.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) close(); });
  document.addEventListener("keydown", (e) => {
    if (modal.hidden) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowRight") track.scrollBy({ left: track.clientWidth, behavior: "smooth" });
    if (e.key === "ArrowLeft") track.scrollBy({ left: -track.clientWidth, behavior: "smooth" });
  });

  function goOrder() { document.getElementById("order").scrollIntoView({ behavior: "smooth" }); }
  function wantThis(id) { if (window.KorkaOrder) window.KorkaOrder.preselect(id); goOrder(); }

  /* ---------- шапка, меню, кнопка «Заказать» ---------- */
  const hdr = $("#hdr"), menuBtn = $("#menuBtn"), fab = $("#fab");
  const hero = $(".hero"), order = $("#order");
  const vis = { hero: true, order: false };
  const sync = () => { hdr.classList.toggle("is-solid", !vis.hero); fab.classList.toggle("is-on", !vis.hero && !vis.order); };
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => { vis.hero = e.isIntersecting; sync(); }, { rootMargin: "-72px 0px 0px 0px" }).observe(hero);
    new IntersectionObserver(([e]) => { vis.order = e.isIntersecting; sync(); }).observe(order);
  } else hdr.classList.add("is-solid");
  menuBtn.addEventListener("click", () => {
    const open = !hdr.classList.contains("is-open");
    hdr.classList.toggle("is-open", open);
    menuBtn.setAttribute("aria-expanded", open);
    document.documentElement.style.overflow = open ? "hidden" : "";
  });
  $$("#nav a").forEach((a) => a.addEventListener("click", () => {
    hdr.classList.remove("is-open");
    menuBtn.setAttribute("aria-expanded", false);
    document.documentElement.style.overflow = "";
  }));

  /* ---------- плавное появление ---------- */
  if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const els = $$(".sec__head, .values article, .steps li, .band blockquote, .fit > div");
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
    els.forEach((el) => { el.classList.add("rv"); io.observe(el); });
  }

  if (CFG.channelUrl) $("#channelLink").href = CFG.channelUrl;
  if (CFG.contactUsername) $("#dmLink").href = "https://t.me/" + CFG.contactUsername;
  $("#year").textContent = new Date().getFullYear();
})();
