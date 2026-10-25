# Korka — сайт вязаного ателье

Статический сайт для GitHub Pages: каталог, портфолио, «как заказать», FAQ и форма-«схема заказа», которая отправляет заявку боту в личку мастеру в Telegram.

```
index.html               страница
css/style.css            оформление (палитра мха, Cormorant Garamond + Manrope)
assets/img/              фото мха и вязки (Unsplash, бесплатная лицензия), фактура зерна
js/config.js             ⚙️ НАСТРОЙКИ: бот, ники, цены-ориентиры, «не моя специфика»
js/catalog-data.js       каталог для сайта (собран из data/catalog.json)
js/app.js                каталог, фильтры, галерея
js/order.js              форма заявки и отправка в Telegram
worker/telegram-relay.js пересыльщик заявок для Cloudflare (прячет токен бота)
photos_by_category/      фото; README.md внутри: каких файлов не хватает
data/                    исходные catalog.json / catalog.csv
```

Посмотреть локально: просто открой `index.html` в браузере.

Фото мха и вязаного полотна взяты с Unsplash (лицензия Unsplash разрешает коммерческое использование без указания автора): photo-1658819543328, photo-1682018673550, photo-1515748058232, photo-1643313260651, photo-1602706294170.

---

## 1. Залить на GitHub и включить Pages

1. GitHub → **New repository** → имя, например `madebykorka` → **Public** → Create.
2. **Add file → Upload files** → перетащи **содержимое** папки сайта (не саму папку) → Commit.
3. **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main`, папка `/ (root)` → Save.
4. Через 1–2 минуты сайт откроется по адресу `https://<ник>.github.io/madebykorka/`.

## 2. Свой домен

1. **Settings → Pages → Custom domain** → впиши домен (например `korka.ru`) → Save. GitHub сам создаст файл `CNAME`.
2. У регистратора домена добавь DNS-записи:
   - для `korka.ru` четыре записи **A**: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - для `www.korka.ru` запись **CNAME** → `<ник>.github.io`
3. Когда GitHub выпустит сертификат, поставь галочку **Enforce HTTPS**.

## 3. Бот для заявок

1. В Telegram открой **@BotFather** → `/newbot` → получи **токен**.
2. **Мастер должна сама написать боту `/start`**, иначе бот не сможет ей писать.
3. Узнай её `chat_id`: после `/start` открой в браузере
   `https://api.telegram.org/bot<ТОКЕН>/getUpdates` и найди `"chat":{"id": 123456789 ...}`.

Дальше выбери способ отправки в `js/config.js`:

### Вариант А. Через Cloudflare Worker (рекомендую)
Токен не виден на сайте.
1. dash.cloudflare.com → **Workers & Pages → Create → Worker** → Deploy → **Edit code** → вставь `worker/telegram-relay.js` → Deploy.
2. **Settings → Variables and Secrets**:
   - `BOT_TOKEN` (Secret): токен бота
   - `CHAT_ID`: chat_id мастера
   - `ALLOWED_ORIGINS`: `https://korka.ru,https://www.korka.ru` (адреса твоего сайта)
3. В `js/config.js`: `mode: "relay"`, `relayUrl: "https://…workers.dev"`.

> У части российских провайдеров адреса `*.workers.dev` открываются плохо. Если домен подключён к Cloudflare, привяжи воркер к поддомену (Worker → Settings → Domains & Routes → Custom domain, например `api.korka.ru`) и укажи его в `relayUrl`.

### Вариант Б. Напрямую из браузера (проще, но менее безопасно)
В `js/config.js`: `mode: "direct"`, `botToken`, `chatId`.
⚠️ Токен будет виден любому в коде сайта. Худшее, что может случиться: кто-то начнёт спамить через бота. Тогда сделай `/revoke` в @BotFather и переходи на вариант А.

### Пока бота нет
По умолчанию стоит `mode: "off"`: форма собирает заявку, клиент копирует её одной кнопкой, и открывается чат с мастером.

## 4. Что приходит мастеру

Одно сообщение с номером заявки `#K-ДДММ-XXX`: что вяжем, игрушка из каталога (ссылкой на пост), персонаж, цвета, размер, **ориентир по цене**, бюджет клиента (с пометкой ⚠️, если он ниже ориентира), срок, имя, контакт и кнопка «Написать клиенту». Референсы прилетают следом альбомом, ответом на это сообщение.

## 5. Что где менять

- Ники, канал, цены-ориентиры по размерам, список «не моя специфика»: `js/config.js`
- Игрушки, цены, статусы: `js/catalog-data.js`
- Фото: `photos_by_category/README.md`
