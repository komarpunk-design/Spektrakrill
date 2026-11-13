# Spektrafilm Lab · Spektrakrill

Текущая нативная версия: **9.61 / 131**, ARM64, Android 7.0 и выше.

[Скачать APK 9.61](https://github.com/komarpunk-design/Spektrakrill/releases/download/v9.61.0/Spektrafilm-v9.61.0.apk) · [Расположение инструментов](docs/NATIVE_WORKSPACE_956.md).

Основное приложение находится в `native-android/`. Оно построено на полном исходном коде
[Spektrafilm for Android v1.0.0](https://github.com/thetechgeekko/Spektrafilm-android/tree/v1.0.0):
Compose UI, движок C++, LibRaw, просмотр, маски, библиотека и экспорт. В эту основу
перенесены дополнительные материалы и модели Spektrafilm Lab.

[RAW больше 24 МиПикселей: память предпросмотра 9.61](docs/RAW_PREVIEW_MEMORY.md).

[Камерные RAW: определение формата и диагностика 9.60](docs/RAW_CAMERA_IMPORT.md).

[Импорт JSON и каталог рецептов 9.59](docs/PRESET_IMPORT_CATALOG.md).

[Текущая навигация: порядок 9.56 в нативном UI](docs/NATIVE_WORKSPACE_956.md).
[История перехода на нативную основу 9.57](docs/NATIVE_UPSTREAM_MIGRATION.md).
[Происхождение файлов](docs/upstream/native-v1/source-manifest.json).
Лицензия — GPLv3; оригинальные авторские уведомления сохранены.

## Сборка

Нужны полный JDK 21, Android SDK 37, build-tools 36.0.0, NDK 28.2.13676358 и CMake 3.22.1.
Gradle wrapper закреплён на 9.6.1 с проверкой SHA-256.
Установите `JAVA_HOME`, `ANDROID_HOME`, затем запустите `bash scripts/build-apk.sh`.
APK копируется в `artifacts/SpektrafilmLab.apk`.

Для подписи задайте локальный `native-android/keystore.properties` с `storeFile`,
`storePassword`, `keyAlias`, `keyPassword`. Файл и приватный ключ не коммитятся.
Без него release APK будет неподписанным. Публичный debug-ключ оригинального приложения
сохранён отдельно и не используется для подписи нашего релиза.

Проверки: из `native-android/` запустите `./gradlew :app:testDebugUnitTest :app:assembleRelease`.
Нативные тесты: CMake-проект `tests/native-upstream/`, затем
`python3 scripts/test-native-upstream.py --build-dir /path/to/host-build`.

Предыдущая версия React/Capacitor сохранена в корне (`src/`, `android/`) как legacy.
Её сборка: `bash scripts/build-legacy-apk.sh`. Старые документы 9.4x–9.56 относятся к ней.
