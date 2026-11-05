cmake_minimum_required(VERSION 3.18.1)
project(spektra_raw)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

file(GLOB_RECURSE LIBRAW_SRC
  ${CMAKE_CURRENT_SOURCE_DIR}/libraw/src/*.cpp
)
list(FILTER LIBRAW_SRC EXCLUDE REGEX ".*/[^/]+_ph\\.cpp$")

add_library(spektra_raw SHARED
  spektra_raw.cpp
  jni_spektra_raw.cpp
  ${LIBRAW_SRC}
)

target_include_directories(spektra_raw PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}
  ${CMAKE_CURRENT_SOURCE_DIR}/libraw
)

target_compile_definitions(spektra_raw PRIVATE
  LIBRAW_NODLL
  LIBRAW_NOTHREADS
  USE_ZLIB
  _FILE_OFFSET_BITS=64
  _LARGEFILE_SOURCE
)

target_compile_options(spektra_raw PRIVATE
  -O3
  -fexceptions
  -frtti
  -w
  -fvisibility=hidden
)

find_library(log-lib log)
find_library(z-lib z)

target_link_libraries(spektra_raw
  ${log-lib}
  ${z-lib}
)
