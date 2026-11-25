FROM python:3.12-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates cmake ninja-build g++ git patch zlib1g-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY chatgpt-app/native /app/chatgpt-app/native
COPY chatgpt-app/build-native.sh /app/chatgpt-app/build-native.sh
COPY native-android/engine/spektra-core/src/main /app/native-android/engine/spektra-core/src/main
COPY native-android/lib/libraw /app/native-android/lib/libraw
COPY native-android/tools/compliance /app/native-android/tools/compliance
RUN --mount=type=secret,id=build_ca \
    if [ -s /run/secrets/build_ca ]; then \
      bash chatgpt-app/build-native.sh -G Ninja -DCMAKE_TLS_CAINFO=/run/secrets/build_ca; \
    else bash chatgpt-app/build-native.sh -G Ninja; fi
COPY chatgpt-app/pyproject.toml /app/chatgpt-app/pyproject.toml
COPY chatgpt-app/src /app/chatgpt-app/src
RUN --mount=type=secret,id=build_ca \
    if [ -s /run/secrets/build_ca ]; then export PIP_CERT=/run/secrets/build_ca; fi; \
    python -m pip wheel --wheel-dir /wheels ./chatgpt-app

FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libstdc++6 zlib1g && rm -rf /var/lib/apt/lists/* && useradd --system --uid 10001 --create-home --home-dir /data spektrafilm
COPY --from=builder /wheels /wheels
RUN python -m pip install --no-index --find-links=/wheels spektrafilm-chatgpt && rm -rf /wheels
COPY --from=builder /app/chatgpt-app/build /opt/spektra-native
COPY --from=builder /app/native-android/engine/spektra-core/src/main/assets/spektra /opt/spektra-assets
COPY LICENSE THIRD_PARTY_NOTICES.md /usr/share/doc/spektrafilm/
RUN chmod -R a+rX /opt/spektra-native /opt/spektra-assets /usr/share/doc/spektrafilm /usr/local/lib/python3.12/site-packages/spektrafilm_chat
ENV SPEKTRA_BIND=0.0.0.0 PORT=8765 SPEKTRA_DATA=/data SPEKTRA_BINARY=/opt/spektra-native/spektrafilm-develop SPEKTRA_ASSETS=/opt/spektra-assets LD_LIBRARY_PATH=/opt/spektra-native OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=4 SPK_NUM_THREADS=4
USER 10001
EXPOSE 8765
CMD ["spektrafilm-chatgpt"]
