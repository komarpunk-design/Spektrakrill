# Spektrafilm Lab · Spektrakrill

Android-фоторедактор на React / Capacitor с нативным спектральным движком. Текущая экспериментальная версия: **9.54 / 124**, ARM64, Android 7.0 и выше.

[Скачать APK 9.54](https://github.com/komarpunk-design/Spektrakrill/releases/download/v9.54-build124/SpektrafilmLab-9.54-arm64.apk)

Интерфейс адаптирован из приложения, которое собирается в [Zalupa](https://github.com/komarpunk-design/Zalupa): круглые действия сверху, фотография, панель страниц и нижние группы инструментов, лента фотокарточек плёнок. Математика обработки, набор плёнок и экспорт прежние. Negs и Fotufilm находятся в своих группах.

[Источник UI, границы переноса и проверки](docs/ZALUPA_UI.md).

## Разработка и проверка

Нужны Node.js, Java и Android SDK/NDK. Настройки Java/SDK берутся из окружения; сборку выполняет `bash scripts/build-apk.sh`. Подробности платформы и интеграций находятся в `docs/`.

Для проверки интерфейса в браузере: `npm run build:apk-web`, затем `python3 -m http.server 8091 --directory dist-apk` и `node scripts/test-zalupa-ui.mjs` (нужны Playwright и Chromium; адрес можно изменить через `TEST_URL`).

Граница UI/движок: `node scripts/check-zalupa-engine.mjs`. Контракт исходных контролов: `node scripts/check-ux-ranges.mjs`. Типы: `npm run typecheck`. Профильные тесты: `npm run test:transport`, `npm run test:outputs`, `npm run test:negs`, `npm run test:experimental`.

## Документация и ограничения

- [UI из Zalupa: источник, границы переноса и проверки](docs/ZALUPA_UI.md).
- Архив исследования 9.53: [матрица функций](docs/ux/FUNCTION_MATRIX.md), [три концепции](docs/ux/DESIGN.md).
- Архив проверки 9.53: [сценарии и ограничения](docs/ux/REVIEW.md).
- [Layered Transport](docs/LAYERED_TRANSPORT.md), [Outputs](docs/OUTPUT_MODELS.md), [Push / Pull](docs/PUSH_PULL_DEVELOPMENT.md).

Браузерный предпросмотр не заменяет проверку нативной обработки на устройстве. Физическое Android-тестирование и пользовательское исследование не проведены; холодное восстановление исходного RAW после уничтожения процесса не добавлено. Общий `npm test` содержит ошибки прежнего веб-шаблона — точные результаты перечислены в отчёте.
