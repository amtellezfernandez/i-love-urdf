#!/usr/bin/env python3
from __future__ import annotations

import base64
import importlib
from importlib import metadata as importlib_metadata
import io
import json
import os
import re
import sys
import tempfile
from contextlib import redirect_stderr
from pathlib import Path
from typing import Iterable

PACKAGE_NAME_PATTERN = re.compile(r"<name>\s*([^<]+)\s*</name>", re.IGNORECASE)
XACRO_TEXT_SUPPORT_EXTENSIONS = (
    ".xacro",
    ".urdf",
    ".xml",
    ".yaml",
    ".yml",
    ".srdf",
    ".sdf",
    ".gazebo",
    ".trans",
)
XACRO_TEXT_FALLBACK_ENCODINGS = ("latin-1",)
DEFAULT_XACRODOC_WHEEL = Path(__file__).resolve().with_name("xacrodoc-1.3.0-py3-none-any.whl")


class XacroRuntimeError(RuntimeError):
    pass


def _emit(payload: dict[str, object]) -> None:
    sys.stdout.write(json.dumps(payload))
    sys.stdout.flush()


def _sanitize_relative_path(path: str) -> Path:
    cleaned = str(path or "").replace("\\", "/").lstrip("/")
    if not cleaned:
        raise XacroRuntimeError("Empty file path in xacro payload.")
    rel_path = Path(cleaned)
    if any(part in ("..", "") for part in rel_path.parts):
        raise XacroRuntimeError(f"Invalid file path in xacro payload: {path}")
    return rel_path


def _write_files(root: Path, files: Iterable[tuple[Path, bytes]]) -> None:
    root_resolved = root.resolve()
    for rel_path, content in files:
        dest = (root / rel_path).resolve()
        if not str(dest).startswith(str(root_resolved) + os.sep):
            raise XacroRuntimeError(f"Invalid file path in xacro payload: {rel_path}")
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(content)


def _extract_package_name(content: bytes, fallback: str) -> str:
    try:
        text = content.decode("utf-8", errors="ignore")
    except Exception:
        return fallback
    match = PACKAGE_NAME_PATTERN.search(text)
    if not match:
        return fallback
    name = match.group(1).strip()
    return name or fallback


def _is_text_xacro_support_path(rel_path: Path) -> bool:
    lowered_name = rel_path.name.lower()
    if lowered_name == "package.xml":
        return True
    return rel_path.suffix.lower() in XACRO_TEXT_SUPPORT_EXTENSIONS


def _normalize_text_support_content(rel_path: Path, content: bytes) -> bytes:
    if not _is_text_xacro_support_path(rel_path):
        return content
    try:
        content.decode("utf-8")
        return content
    except UnicodeDecodeError:
        for encoding in XACRO_TEXT_FALLBACK_ENCODINGS:
            try:
                decoded = content.decode(encoding)
                return decoded.encode("utf-8")
            except UnicodeDecodeError:
                continue
    return content


def _build_package_map(root: Path, files: Iterable[tuple[Path, bytes]]) -> dict[str, str]:
    package_map: dict[str, str] = {}
    for rel_path, content in files:
        if rel_path.name != "package.xml":
            continue
        fallback = rel_path.parent.name
        package_name = _extract_package_name(content, fallback)
        if not package_name:
            continue
        package_map.setdefault(package_name, str((root / rel_path.parent).resolve()))
    return package_map


def _resolve_wheel_path(payload: dict[str, object]) -> Path | None:
    raw = str(payload.get("wheel_path") or os.environ.get("I_LOVE_URDF_XACRODOC_WHEEL") or "").strip()
    if raw:
        candidate = Path(raw).expanduser().resolve()
        return candidate if candidate.exists() else None
    return DEFAULT_XACRODOC_WHEEL if DEFAULT_XACRODOC_WHEEL.exists() else None


def _ensure_vendored_xacro_importable(wheel_path: Path | None) -> bool:
    if wheel_path and wheel_path.exists():
        wheel = str(wheel_path)
        if wheel not in sys.path:
            sys.path.insert(0, wheel)
    try:
        importlib.import_module("xacrodoc.xacro.xacro")
        return True
    except Exception:
        return False


def _get_distribution_version(distribution_name: str) -> str | None:
    try:
        return importlib_metadata.version(distribution_name)
    except Exception:
        return None


def _collect_runtime_package_versions(runtime: str) -> dict[str, str]:
    package_versions: dict[str, str] = {}
    package_names = ("xacro", "PyYAML") if runtime == "python-xacro" else ("xacrodoc",)

    for package_name in package_names:
        version = _get_distribution_version(package_name)
        if version:
            package_versions[package_name] = version

    return package_versions


def _probe_runtime(payload: dict[str, object]) -> dict[str, object]:
    try:
        importlib.import_module("xacro")
        return {
            "ok": True,
            "available": True,
            "runtime": "python-xacro",
            "packageVersions": _collect_runtime_package_versions("python-xacro"),
        }
    except Exception:
        pass

    wheel_path = _resolve_wheel_path(payload)
    if _ensure_vendored_xacro_importable(wheel_path):
        return {
            "ok": True,
            "available": True,
            "runtime": "vendored-xacrodoc",
            "packageVersions": _collect_runtime_package_versions("vendored-xacrodoc"),
        }

    detail = "No Xacro runtime available. Install Python xacro or provide I_LOVE_URDF_XACRODOC_WHEEL."
    return {"ok": True, "available": False, "error": detail}


def _expand_with_vendored_xacro(
    target_path: Path,
    args: dict[str, str],
    package_map: dict[str, str],
    wheel_path: Path | None,
    use_inorder: bool = True,
) -> tuple[str, str | None, str]:
    if not _ensure_vendored_xacro_importable(wheel_path):
        raise XacroRuntimeError(
            "No vendored Xacro runtime available. Install Python xacro or provide I_LOVE_URDF_XACRODOC_WHEEL."
        )

    try:
        xacro_mod = importlib.import_module("xacrodoc.xacro.xacro")
        substitution_args = importlib.import_module("xacrodoc.xacro.xacro.substitution_args")
    except Exception as exc:
        raise XacroRuntimeError(f"Failed to initialize vendored xacro runtime: {exc}") from exc

    original_eval_find = getattr(substitution_args, "_eval_find", None)

    def _eval_find(pkg: str) -> str:
        found = package_map.get(pkg)
        if found:
            return found
        raise RuntimeError(f"Package '{pkg}' not found in uploaded files.")

    try:
        substitution_args._eval_find = _eval_find
        process_kwargs = {"mappings": args}
        if use_inorder:
            process_kwargs["in_order"] = True
        doc = xacro_mod.process_file(str(target_path), **process_kwargs)
        urdf = doc.toxml()
    except Exception as exc:
        raise XacroRuntimeError(str(exc).strip() or "xacro failed to expand the file.") from exc
    finally:
        if original_eval_find is not None:
            substitution_args._eval_find = original_eval_find

    urdf = (urdf or "").strip()
    if not urdf:
        raise XacroRuntimeError("xacro produced empty output.")
    return urdf, None, "vendored-xacrodoc"


def _expand_with_python_xacro(
    target_path: Path,
    args: dict[str, str],
    package_map: dict[str, str],
    use_inorder: bool = True,
) -> tuple[str, str | None, str]:
    try:
        xacro_mod = importlib.import_module("xacro")
        substitution_args = importlib.import_module("xacro.substitution_args")
    except Exception as exc:
        raise XacroRuntimeError(
            "No Python xacro runtime available. Install xacro or provide I_LOVE_URDF_XACRODOC_WHEEL."
        ) from exc

    original_eval_find = getattr(substitution_args, "_eval_find", None)

    def _eval_find(pkg: str) -> str:
        found = package_map.get(pkg)
        if found:
            return found
        if original_eval_find is not None:
            try:
                return original_eval_find(pkg)
            except Exception as exc:
                raise RuntimeError(f"Package '{pkg}' not found in uploaded files.") from exc
        raise RuntimeError(f"Package '{pkg}' not found in uploaded files.")

    stderr_buffer = io.StringIO()
    try:
        substitution_args._eval_find = _eval_find
        process_kwargs = {"mappings": args}
        if use_inorder:
            process_kwargs["in_order"] = True
        with redirect_stderr(stderr_buffer):
            doc = xacro_mod.process_file(str(target_path), **process_kwargs)
        urdf = doc.toxml()
    except Exception as exc:
        detail = str(exc).strip() or "xacro failed to expand the file."
        raise XacroRuntimeError(detail) from exc
    finally:
        if original_eval_find is not None:
            substitution_args._eval_find = original_eval_find

    urdf = (urdf or "").strip()
    if not urdf:
        raise XacroRuntimeError("xacro produced empty output.")

    stderr = stderr_buffer.getvalue().strip()
    return urdf, stderr or None, "python-xacro"


def _read_payload() -> dict[str, object]:
    raw = sys.stdin.read()
    if not raw.strip():
        raise XacroRuntimeError("Missing JSON payload.")
    try:
        payload = json.loads(raw)
    except Exception as exc:
        raise XacroRuntimeError(f"Failed to parse JSON payload: {exc}") from exc
    if not isinstance(payload, dict):
        raise XacroRuntimeError("JSON payload must be an object.")
    return payload


def main() -> int:
    try:
        payload = _read_payload()
        if payload.get("probe"):
            _emit(_probe_runtime(payload))
            return 0

        target_path_raw = str(payload.get("target_path") or "").strip()
        if not target_path_raw:
            raise XacroRuntimeError("Missing target_path for xacro expansion.")

        request_files = payload.get("files")
        if not isinstance(request_files, list):
            raise XacroRuntimeError("Invalid xacro payload: files must be an array.")

        args = payload.get("args") if isinstance(payload.get("args"), dict) else {}
        use_inorder = bool(payload.get("use_inorder", True))
        wheel_path = _resolve_wheel_path(payload)

        files: list[tuple[Path, bytes]] = []
        for file in request_files:
            if not isinstance(file, dict):
                raise XacroRuntimeError("Invalid xacro payload: file entry must be an object.")
            rel_path = _sanitize_relative_path(str(file.get("path") or ""))
            try:
                content = base64.b64decode(file.get("content_base64") or "")
            except Exception as exc:
                raise XacroRuntimeError(f"Failed to decode xacro file {rel_path}: {exc}") from exc
            files.append((rel_path, _normalize_text_support_content(rel_path, content)))

        with tempfile.TemporaryDirectory(prefix="i-love-urdf-xacro-") as tmp_dir:
            root = Path(tmp_dir)
            _write_files(root, files)

            target_rel = _sanitize_relative_path(target_path_raw)
            target_path = (root / target_rel).resolve()
            if not target_path.exists():
                raise XacroRuntimeError(f"Target xacro file not found: {target_path_raw}")

            package_map = _build_package_map(root, files)

            try:
                urdf, stderr, runtime = _expand_with_python_xacro(
                    target_path=target_path,
                    args={str(key): str(value) for key, value in args.items()},
                    package_map=package_map,
                    use_inorder=use_inorder,
                )
            except XacroRuntimeError as primary_exc:
                try:
                    urdf, stderr, runtime = _expand_with_vendored_xacro(
                        target_path=target_path,
                        args={str(key): str(value) for key, value in args.items()},
                        package_map=package_map,
                        wheel_path=wheel_path,
                        use_inorder=use_inorder,
                    )
                except XacroRuntimeError:
                    raise primary_exc

        _emit(
            {
                "ok": True,
                "urdf": urdf,
                "stderr": stderr,
                "runtime": runtime,
            }
        )
        return 0
    except XacroRuntimeError as exc:
        _emit({"ok": False, "error": str(exc)})
        return 1
    except Exception as exc:
        _emit({"ok": False, "error": str(exc) or "Unknown xacro runtime failure."})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
