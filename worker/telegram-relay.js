/**
 * made by korka — пересыльщик заявок в Telegram (Cloudflare Worker)
 * Токен бота хранится здесь, в секретах воркера, и не виден на сайте.
 *
 * Переменные окружения (Settings → Variables and Secrets):
 *   BOT_TOKEN        — токен от @BotFather            (Secret)
 *   CHAT_ID          — id чата Корки (число)          (Secret или Text)
 *   ALLOWED_ORIGINS  — адреса сайта через запятую, напр.
 *                      https://korka.ru,https://www.korka.ru,https://USERNAME.github.io
 */
const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const okOrigin = !allowed.length || allowed.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": okOrigin ? origin || "*" : allowed[0] || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return json({ ok: false, error: "method" }, 405);
    if (!okOrigin) return json({ ok: false, error: "origin" }, 403);
    if (!env.BOT_TOKEN || !env.CHAT_ID) return json({ ok: false, error: "not configured" }, 500);

    let form;
    try { form = await request.formData(); } catch { return json({ ok: false, error: "bad form" }, 400); }
    if (form.get("website")) return json({ ok: true }); // ловушка для ботов

    const id = String(form.get("orderId") || "").slice(0, 20);
    const message = String(form.get("message") || "").slice(0, 4000);
    if (message.length < 20) return json({ ok: false, error: "empty" }, 400);

    let buttons = null;
    try {
      const b = JSON.parse(form.get("buttons") || "null");
      if (Array.isArray(b)) buttons = b.filter((x) => x && /^https:\/\/(t\.me|vk\.com|vk\.ru)\//.test(x.url)).slice(0, 2);
    } catch {}

    const api = (method, body) =>
      fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, { method: "POST", body }).then((r) => r.json());

    const fd = new FormData();
    fd.append("chat_id", env.CHAT_ID);
    fd.append("text", message);
    fd.append("parse_mode", "HTML");
    fd.append("disable_web_page_preview", "true");
    if (buttons && buttons.length) fd.append("reply_markup", JSON.stringify({ inline_keyboard: [buttons] }));
    let sent = await api("sendMessage", fd);
    if (!sent.ok) {
      // если HTML сломался — отправим простым текстом
      const plain = new FormData();
      plain.append("chat_id", env.CHAT_ID);
      plain.append("text", message.replace(/<[^>]+>/g, ""));
      sent = await api("sendMessage", plain);
      if (!sent.ok) return json({ ok: false, error: sent.description || "telegram" }, 502);
    }

    const files = [];
    for (const [key, v] of form.entries()) {
      if (/^p\d$/.test(key) && typeof v === "object" && v.size && v.size <= MAX_FILE_BYTES) files.push(v);
      if (files.length >= MAX_FILES) break;
    }
    if (files.length) {
      const caption = `📎 Референсы к заявке #${id}`;
      const reply = JSON.stringify({ message_id: sent.result.message_id, allow_sending_without_reply: true });
      const g = new FormData();
      g.append("chat_id", env.CHAT_ID);
      g.append("reply_parameters", reply);
      let res;
      if (files.length === 1) {
        g.append("photo", files[0], files[0].name || "ref.jpg");
        g.append("caption", caption);
        res = await api("sendPhoto", g);
      } else {
        g.append("media", JSON.stringify(files.map((f, i) => ({ type: "photo", media: `attach://p${i}`, ...(i === 0 ? { caption } : {}) }))));
        files.forEach((f, i) => g.append(`p${i}`, f, f.name || `ref${i}.jpg`));
        res = await api("sendMediaGroup", g);
      }
      if (!res.ok) {
        for (const f of files) {
          const d = new FormData();
          d.append("chat_id", env.CHAT_ID);
          d.append("reply_parameters", reply);
          d.append("document", f, f.name || "ref.jpg");
          d.append("caption", caption);
          await api("sendDocument", d);
        }
      }
    }
    return json({ ok: true });
  },
};
