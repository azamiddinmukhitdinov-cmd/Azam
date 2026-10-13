# Azam — Письмо для Лианночки ♡

Интерактивное приглашение на свидание 18 октября 2026 года: конверт, дата знакомства, выбор кухни, пожелания и сохранение даты в календарь. Гостю не нужен аккаунт GitHub или ChatGPT. Выбранный ответ автоматически отправляется владельцу и сохраняется в Cloudflare D1.

Приглашение и сервер ответов: https://liannochka-secret-date.creamy-bream-2918.chatgpt.site

Адрес после включения GitHub Pages: https://azamiddinmukhitdinov-cmd.github.io/Azam/

## GitHub Pages

Публичная страница подготовлена в `docs/index.html`. В репозитории открой **Settings → Pages → Build and deployment**, выбери **Deploy from a branch**, ветку **main**, папку **/docs** и нажми **Save**. После завершения публикации GitHub покажет ссылку на сайт.

Чтобы обновить статическую страницу после изменения приглашения:

```sh
node scripts/build-public-invitation.mjs
```

Сохрани изменения `docs/index.html` и `docs/.nojekyll` в `main`. Pages обслуживает страницу, а ответы отправляются в API существующего Sites. Изменения серверного кода в GitHub требуют отдельной публикации в Sites.

## Локальный запуск

Нужны Node.js 24 и pnpm 11.25.0.

```sh
git clone https://github.com/azamiddinmukhitdinov-cmd/Azam.git
cd Azam
pnpm install --frozen-lockfile
pnpm dev
```

Адрес локального сервера: http://localhost:5173.

```sh
# Проверка сохранения ответов, доступа владельца и валидации
node --test --test-isolation=none tests/*.test.mjs

# Сборка серверной версии
pnpm build
```

## Где менять приглашение

- `app/invitation.html` — оформление, текст, дата и взаимодействия.
- `app/responses.html` — страница ответов владельца.
- `lib/date-preferences.ts` — сохранение и проверка ответов.
- `scripts/build-public-invitation.mjs` — подготовка версии для Pages.
- `drizzle/` — миграции базы данных.

## Ответы и сервер

Гостевые ответы сохраняются без входа через `/api/public/preferences`. Случайный токен в браузере позволяет получить и изменить собственный ответ. Страница владельца https://liannochka-secret-date.creamy-bream-2918.chatgpt.site/responses требует входа в ChatGPT и проверки `OWNER_EMAIL`; пример переменной есть в `.env.example`.

Сервер работает в Sites на Cloudflare Workers с D1 и привязкой `DB`. Локально для сохранения нужна настроенная D1, а для страницы владельца — доверенная идентификация Sites. `.openai/hosting.json` сохраняет связь с существующим Sites-проектом. Подробности сборки, локальных миграций и окружения: [docs/sites-runtime.md](docs/sites-runtime.md).
