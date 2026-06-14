#pragma once

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef void (*demangle_callbackref)(const char* data, size_t length, void* opaque);

#ifndef DMGL_PARAMS
#define DMGL_PARAMS (1 << 0)
#endif
#ifndef DMGL_ANSI
#define DMGL_ANSI (1 << 1)
#endif
#ifndef DMGL_TYPES
#define DMGL_TYPES (1 << 2)
#endif
#ifndef DMGL_NO_RECURSE_LIMIT
#define DMGL_NO_RECURSE_LIMIT (1 << 3)
#endif

static inline int cplus_demangle_v3_callback(
    const char* mangled,
    int options,
    demangle_callbackref callback,
    void* opaque) {
  (void)mangled;
  (void)options;
  (void)callback;
  (void)opaque;
  return 0;
}

static inline int rust_demangle_callback(
    const char* mangled,
    int options,
    demangle_callbackref callback,
    void* opaque) {
  (void)mangled;
  (void)options;
  (void)callback;
  (void)opaque;
  return 0;
}

#ifdef __cplusplus
}
#endif
