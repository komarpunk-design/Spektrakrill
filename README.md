# Spektrafilm Lab · Spektrakrill

Android-фоторедактор на React / Capacitor с нативным спектральным движком. Текущая экспериментальная версия: **9.53 / 123**, ARM64, Android 7.0 и выше.

[Скачать APK 9.53](https://github.com/komarpunk-design/Spektrakrill/releases/download/v9.53-build123/SpektrafilmLab-9.53-arm64.apk)

Сохранено рабочее пространство версии 9.47. Spektrafilm, Fotufilm (Outputs / Lab Scan / Layered Transport) и Negs разделены. Кнопка «Поиск» ведёт к инструменту или конкретному параметру; нажатие на значение ползунка открывает точный ввод и заводской сброс, когда значение известно. Подробные параметры доступны без отдельного режима.

## Разработка и проверка

Нужны Node.js, Java и Android SDK/NDK. Настройки Java/SDK берутся из окружения; сборку выполняет `bash scripts/build-apk.sh`. Подробности платформы и интеграций находятся в `docs/`.

Для проверки интерфейса в браузере: `npx vite --config vite.config.apk.ts --host 0.0.0.0 --port 8089`, затем `node scripts/test-ux-control-system.mjs` (нужны Playwright и Chromium; адрес можно изменить через `TEST_URL`).

Контракт исходных контролов: `node scripts/check-ux-ranges.mjs`. Типы: `npm run typecheck`. Профильные тесты: `npm run test:transport`, `npm run test:outputs`, `npm run test:negs`, `npm run test:experimental`.

## Проектирование UX и ограничения

- [Матрица функций](docs/ux/FUNCTION_MATRIX.md), [три архитектурные концепции](docs/ux/DESIGN.md).
- [Сценарии, исправления и фактические результаты проверок](docs/ux/REVIEW.md).
- [Layered Transport](docs/LAYERED_TRANSPORT.md), [Outputs](docs/OUTPUT_MODELS.md), [Push / Pull](docs/PUSH_PULL_DEVELOPMENT.md).

Браузерный предпросмотр не заменяет проверку нативной обработки на устройстве. Физическое Android-тестирование и пользовательское исследование не проведены; холодное восстановление исходного RAW после уничтожения процесса не добавлено. Общий `npm test` содержит ошибки прежнего веб-шаблона — точные результаты перечислены в отчёте.
