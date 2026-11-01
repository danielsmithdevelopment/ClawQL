# Python side of the celld Python Worker entrypoint.
#
# Adapted from workerd at commit da46ad950c54b19158c5ea5cb997a9727491ca17
# (v1.20260926.1): src/pyodide/internal/setup_python_search_path.py and
# `wrapper_func` in src/pyodide/internal/introspection.py. Copyright (c)
# 2017-2026 Cloudflare, Inc. (Apache-2.0). Changed for celld: one module, the
# workerd session paths set up here, and no signal or snapshot handling.
#
# The same application sees the same `sys.path` and the same argument and
# result conversions on both runtimes. The `workers` package is the
# application's vendored SDK.
import os
import sys
from inspect import isawaitable, isclass
from site import addsitedir

SESSION_PATH = "/session/metadata"
PYTHON_MODULES_PATH = "/session/metadata/python_modules"
SESSION_SITE_PACKAGES = "/session/lib/python3.13/site-packages"


def setup_python_search_path(process_pth_files):
    # workerd starts with the stdlib entries only and the root directory as
    # the working directory.
    if sys.path and sys.path[0] == "":
        del sys.path[0]
    os.chdir("/")
    sys.path.append(SESSION_PATH)
    sys.path.append(SESSION_SITE_PACKAGES)
    for index, path in enumerate(sys.path):
        if "site-packages" in path:
            sys.path.insert(index, PYTHON_MODULES_PATH)
            break
    else:
        raise ValueError("No site-packages found in sys.path")
    if process_pth_files:
        addsitedir(PYTHON_MODULES_PATH)


def default_entrypoint(main_module):
    """The `Default` WorkerEntrypoint class of the main module, or None."""
    from workers import WorkerEntrypoint

    if hasattr(main_module, "__all__"):
        names = main_module.__all__
    else:
        names = [name for name in dir(main_module) if not name.startswith("_")]
    for name in names:
        value = getattr(main_module, name)
        if (
            isclass(value)
            and issubclass(value, WorkerEntrypoint)
            and value is not WorkerEntrypoint
            and value.__name__ == "Default"
        ):
            return value
    return None


async def call_method(relaxed, instance, name, *args):
    from pyodide.code import relaxed_call
    from workers import python_from_rpc, python_to_rpc

    method = getattr(instance, name)
    py_args = [python_from_rpc(arg) for arg in args]
    result = relaxed_call(method, *py_args) if relaxed else method(*py_args)
    if isawaitable(result):
        result = await result
    return python_to_rpc(result)
