# Spektrafilm для ChatGPT

Рабочий локальный прототип MCP-приложения: прикреплённый камерный RAW → настоящая обработка нашим C++-движком → превью и скачивание JPEG, PNG, TIFF 16 бит.

**Подключения к аккаунту ChatGPT пока нет.** Для него потребуется постоянно доступный HTTPS-сервер и ручное подключение приложения в ChatGPT. Эта версия по умолчанию слушает только `127.0.0.1`; локально работает `noauth`. Для публичного адреса уже реализована проверка OAuth/JWT через доверенного провайдера; сам провайдер и хостинг ещё не настроены. Сетевой запуск без OAuth блокируется, кроме явно включённого локального теста контейнера. Публичное приложение в каталоге ChatGPT не опубликовано.

## Как будет пользоваться человек

1. Подключить Spektrafilm в ChatGPT через меню приложений/режим разработчика, если он доступен для аккаунта. MCP-адрес: `https://ваш-сервер/mcp`.
2. Прикрепить RAW и написать: «Прояви красиво». Если ChatGPT не принимает расширение камеры, прикрепить ZIP с одним RAW.
3. Получить фото и кнопки скачивания. Можно попросить «теплее», «чёрно-белое» или «в полном разрешении».

Автоматический режим не анализирует сюжет нейросетью и не гарантирует субъективно идеальный результат для любого кадра. Он применяет воспроизводимую плёночную обработку с балансом белого камеры и замером экспозиции существующего движка. Пиксели фотографии не генерируются заново.

| Режим | Материал | Обработка |
| --- | --- | --- |
| `natural`, по умолчанию | Kodak Portra 400 | Arctic, RMS-зерно, Layered Transport, Langmuir DIR, Noritsu LS-600 без бумаги с встроенным заводским job |
| `warm` | Kodak Gold 200 | Та же цепочка с тёплым плёночным материалом |
| `bw` | Ilford HP5 | Arctic, RMS, Layered Transport, цифровой вывод; цветной DIR и цветной тракт Noritsu обходятся |

Выход — sRGB с ICC-профилем. TIFF действительно RGB uint16; его пиксели проверяются после повторного чтения. По умолчанию длинная сторона **3072 пикселя**; `max_edge=0` запрашивает полный размер RAW, `512..6000` — заданное ограничение. Полный размер крупных кадров зависит от серверной памяти и лимита времени; уменьшенное изображение не выдаётся за полноразмерное.

## Настоящий RAW и существующий движок

`native/develop.cpp` — адаптер production-кода `native-android`: проверенный декодер `raw_decoder.cpp`, LibRaw 0.22.2 с теми же проверяемыми патчами и весь C++ film pipeline. Нет ImageDecoder, JPEG-превью из RAW или имитации фильтра через LLM. Неподдержанный RAW возвращает ошибку. Android-код и версия 9.78 не изменяются.

Заводской job Noritsu — тот же `ls600-g0t1-neutral-v1`, что в приложении. Это существующая реконструкция/порт; интерфейс не утверждает аппаратную идентичность сканера. Автоматизация использует заданный рецепт, не изменяет наши физические алгоритмы.

## Локальный запуск

Нужны Linux x86-64/ARM64 little-endian, Python 3.11+, CMake 3.22+, C/C++ compiler, Git, patch, zlib headers и полные LFS-материалы репозитория. Для обычного режима ориентир — 4 CPU / 4 GB RAM; большие полноразмерные кадры требуют большего запаса. Движок работает на CPU.

Из корня репозитория:

```bash
git lfs pull
bash chatgpt-app/build-native.sh
python3 -m venv chatgpt-app/.venv
chatgpt-app/.venv/bin/pip install -e chatgpt-app
chatgpt-app/.venv/bin/spektrafilm-chatgpt
```

`GET http://127.0.0.1:8765/health` проверяет наличие адаптера и директории материалов. MCP endpoint: `http://127.0.0.1:8765/mcp`. Для ChatGPT нужен удалённый HTTPS endpoint: адрес `localhost` из пользовательского браузера не делает сервер доступным ChatGPT.

Полный независимый вызов адаптера:

```bash
mkdir -p /tmp/my-film-output
SPK_NUM_THREADS=4 chatgpt-app/build/spektrafilm-develop \
  /path/to/photo.NEF \
  native-android/engine/spektra-core/src/main/assets/spektra \
  /tmp/my-film-output natural 3072
```

Адаптер записывает `render.json` и рабочий `result.f32` (не готовый TIFF). Сервер кодирует и проверяет конечные изображения, затем удаляет RAW и рабочие пиксели.

## Контейнер

```bash
docker build -f chatgpt-app/Dockerfile -t spektrafilm-chat .
docker run --rm -p 127.0.0.1:8765:8765 -e SPEKTRA_LOCAL_TEST=1 \
  -v spektrafilm-data:/data spektrafilm-chat
```

Контейнер собран и проверен: реальная обработка NEF и 26-МП RAF, JPEG/PNG/TIFF, непривилегированный пользователь, readonly filesystem, лимит 4 GiB RAM, MCP через официальный SDK-клиент. Пиксели обоих кадров побайтово совпали с локальным движком. `compose.yaml` и конфигурация Caddy валидированы без публичного развёртывания. Живого подключения к аккаунту ChatGPT ещё нет. Подробности: [qualification.json](qualification.json).

Перед доступом из интернета: задать `SPEKTRA_PUBLIC_URL=https://...`, поставить HTTPS reverse proxy с поддержкой долгих streaming HTTP ответов, настроить MCP OAuth/доступ и подключить приложение к аккаунту. Это отдельный этап, требующий выбранного сервера. SDK допускает личное подключение в режиме разработчика; публикация в каталоге — отдельная процедура.

Переменные: `SPEKTRA_BINARY`, `SPEKTRA_ASSETS`, `SPEKTRA_DATA`, `SPEKTRA_PUBLIC_URL`, `SPEKTRA_BIND`, `PORT`, `SPEKTRA_UPLOAD_HOSTS`, `SPEKTRA_LOCAL_TEST`, `SPEKTRA_OAUTH_ISSUER`, `SPEKTRA_OAUTH_JWKS_URL`, `SPEKTRA_ALLOWED_SUBJECTS`. В установленном wheel пути к бинарнику и материалам задаются явно; Dockerfile уже делает это. `SPEKTRA_LOCAL_TEST=1` разрешает только явно выбранный локальный тест контейнера; публикуйте его порт на `127.0.0.1`. Без этого флага сетевой listener требует OAuth.

## Защищённое подключение ChatGPT

Сервер реализует OAuth resource server через официальный MCP SDK и PyJWT. Сам вход, PKCE, выдачу/обновление токенов обеспечивает выбранный провайдер (например, Keycloak или Auth0); собственная система паролей не создаётся.

Для публичного адреса обязательны:

```dotenv
SPEKTRA_PUBLIC_URL=https://photos.example.com
SPEKTRA_OAUTH_ISSUER=https://identity.example.com/your-realm
SPEKTRA_OAUTH_JWKS_URL=https://identity.example.com/your-realm/keys
SPEKTRA_ALLOWED_SUBJECTS=your-provider-subject-id
```

Это примеры; `issuer` и JWKS URL берутся из metadata реального провайдера, без изменения завершающих `/`. Для личного экземпляра укажите свой `sub` в allowlist. Без allowlist приложение принимает всех пользователей доверенного issuer с нужной областью доступа; production Compose требует явно заполненную allowlist.

В провайдере нужны authorization code + PKCE S256 и поддерживаемый ChatGPT вариант регистрации клиента: DCR, CIMD или заранее зарегистрированный OAuth-клиент. Токен должен иметь `aud` ровно для ресурса `SPEKTRA_PUBLIC_URL/mcp` и scope `photos:develop`. Пароли и OAuth client secrets в наш сервер не передаются.

MCP SDK публикует protected-resource metadata и `WWW-Authenticate` challenge. Проверяются RS256-подпись, точный issuer, audience, срок, scope и allowlist аккаунтов. Ключи берутся только из настроенного JWKS; произвольные `jku`/`x5u` из входного токена не используются. Есть bounded cache ключей и защита от частых запросов с неизвестными key ID.

`compose.yaml` + `Caddyfile` подготавливают HTTPS reverse proxy и сервер с отдельным хранилищем, ограничением ресурсов и непривилегированным пользователем. Они не запускают и не оплачивают VPS. После выбора сервера и настройки OAuth:

```bash
docker compose --env-file chatgpt-app/.env.production \
  -f chatgpt-app/compose.yaml up -d --build
```

В `.env.production` дополнительно нужен `SPEKTRA_DOMAIN` с реально настроенным DNS. Поля примеров не являются рабочими адресами. Публичное развёртывание и TLS с настоящим доменом ещё не проводились.

Для корпоративного HTTPS-прокси при сборке можно передать доверенный CA через BuildKit secret:

```bash
docker build -f chatgpt-app/Dockerfile \
  --secret id=build_ca,src=/path/to/trusted-ca-bundle.pem \
  -t spektrafilm-chat .
```

CA используется только в build-шагах; он не копируется в runtime image. Проверка TLS и закреплённый SHA-256 официального LibRaw не отключаются.

## Файлы, нагрузка и ограничения

- Инструмент `develop_raw` принимает именно file object ChatGPT. В `openai/fileParams` указан `file`; схема объявляет `download_url`, `file_id`, `mime_type`, `file_name`, обязательны только первые два. URL или `file_id` не выдумываются моделью.
- Допускаются HTTPS-ссылки доверенных хранилищ ChatGPT. Каждое перенаправление проверяется заново; локальные/служебные адреса запрещены. Если ChatGPT использует другой CDN, оператор добавляет его точный доверенный hostname в `SPEKTRA_UPLOAD_HOSTS`.
- Вход до 256 MiB; ZIP — один RAW, без распаковки указанных в архиве путей. Исходник находится в приватном временном каталоге и удаляется до выдачи результата.
- Один активный native worker, максимум три принятых запроса; timeout 240 секунд, дополнительный лимит address space рабочего процесса 3 GiB. Отмена останавливает worker и освобождает очередь. Качество не снижается скрытым переходом на embedded JPEG.
- Результаты хранятся до 24 часов, при переполнении квоты 2 GiB старые результаты удаляются раньше. Фоновая очистка — раз в минуту; просроченные ссылки сразу перестают работать. Ссылки подписаны HMAC и ограничены конкретным файлом.
- Оригиналы не отправляются в сторонние фоторедакторы или модели. Экспорты проверяются повторным чтением, для ссылок выдаются размер и SHA-256.
- В тестах скачивание из ChatGPT заменено локальным fixture: настоящие file URLs текущего пользователя и реальное подключение из интерфейса ChatGPT ещё не проверены.

## Проверки

```bash
SPEKTRA_TEST_RAW_FILE=/path/to/real-camera.NEF \
  chatgpt-app/.venv/bin/python -m unittest discover -s chatgpt-app/tests -v
```

Без этой переменной только интеграционный тест с реальным RAW пропускается. Проверено 19 тестов, без ошибок и пропусков при заданном настоящем NEF. Проверяются официальная файловая схема по настоящему MCP HTTP-контракту, metadata/CSP виджета, полный путь MCP → native → 16-bit TIFF/JPEG → скачивание с SHA-256, удаление исходника, ограничение размеров, ZIP, подписи/срок ссылок, квота и остановка worker по timeout. ASGI/TestClient нужны локальные сокеты; в ограниченном sandbox это может блокировать межпоточное пробуждение event loop.

OAuth-тесты дополнительно проверяют поддельную подпись, неверный issuer/audience/scope, просроченный токен, чужой аккаунт, ротацию ключей, защищённую HTTP discovery и точное сохранение issuer URL.

Официальные контракты: [OAuth](https://developers.openai.com/apps-sdk/build/auth/), [MCP server](https://developers.openai.com/apps-sdk/build/mcp-server/), [file inputs и Apps SDK reference](https://developers.openai.com/apps-sdk/reference/). Проверены 25 ноября 2026 года; canonical-раздел документации перенаправляется на `/plugins/`.

Лицензия адаптера — GPLv3. Уведомления существующих компонентов и provenance-проверки LibRaw сохранены; тестовые камерные RAW в репозиторий приложения не добавляются.
