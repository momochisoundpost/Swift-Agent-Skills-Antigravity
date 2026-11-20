#!/bin/sh
# Install, update, list, or uninstall the Swift Agent Skills Antigravity plugins.
#
# Downloads modular Swift and Apple platform skill packs from
# momochisoundpost/Swift-Agent-Skills-Antigravity and installs them for
# Google Antigravity on macOS and Linux. By default, installs only swift-core
# (5 skills) to keep the active context window lean. Compatible with POSIX sh
# (including macOS /bin/sh and Ubuntu dash) with zero external dependencies.

set -eu

REPO_SLUG='momochisoundpost/Swift-Agent-Skills-Antigravity'
ASSET_NAME='swift-agent-skills-antigravity.zip'
DEFAULT_PACK='swift-core'

NL='
'
TAB="$(printf '\t')"
CR="$(printf '\r')"

PACK_TABLE='
swift-core|core|5|SwiftUI, SwiftData, Concurrency, Testing, API Guidelines (default)
swift-ui-craft|ui-craft|7|SwiftUI patterns, refactoring, perf audit, design, accessibility, UX
swift-apple-frameworks|frameworks|7|FormatStyle, App Intents, Background, Observability, Widgets, Core Data
swift-quality|quality|3|Architecture, security hardening, and codebase audit
swift-app-store|app-store|3|App Store changelogs, ASO, and App Review guidelines
swift-asc-cli|asc-cli|26|App Store Connect CLI (asc) automation (requires asc CLI)
swift-ios-simulator|ios-simulator|1|iOS Simulator automation (macOS + Xcode + Python 3.12 + idb only)
swift-extras|extras|9|Alternative Concurrency, Testing, SwiftData, Accessibility perspectives
'

tmp_root=''
run_staging_root=''
staging_base=''

cleanup() {
  if [ -n "$tmp_root" ] && [ -d "$tmp_root" ]; then
    rm -rf -- "$tmp_root" 2>/dev/null || true
  fi
  if [ -n "$run_staging_root" ] && [ -d "$run_staging_root" ]; then
    rm -rf -- "$run_staging_root" 2>/dev/null || true
  fi
  if [ -n "$staging_base" ] && [ -d "$staging_base" ]; then
    rmdir -- "$staging_base" 2>/dev/null || true
  fi
}

trap cleanup EXIT
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM

usage_error() {
  printf '%s\n' "$1" >&2
  exit 2
}

trim_ws() {
  _s="$1"
  while :; do
    case "$_s" in
      " "*|"$TAB"*|"$CR"*) _s="${_s#?}" ;;
      *" "|*"$TAB"|*"$CR") _s="${_s%?}" ;;
      *) break ;;
    esac
  done
  printf '%s' "$_s"
}

strip_trailing_slashes() {
  _p="$1"
  while [ "${#_p}" -gt 1 ]; do
    case "$_p" in
      [A-Za-z]:/|[A-Za-z]:\\) break ;;
      */) _p="${_p%/}" ;;
      *) break ;;
    esac
  done
  printf '%s\n' "$_p"
}

resolve_local_path() {
  _raw="$1"
  case "$_raw" in
    /*|[A-Za-z]:/*|[A-Za-z]:\\*) _full="$_raw" ;;
    .) _full="$PWD" ;;
    ./*) _full="${PWD%/}/${_raw#./}" ;;
    *) _full="${PWD%/}/$_raw" ;;
  esac
  strip_trailing_slashes "$_full"
}

parse_pack_line() {
  _pl="$1"
  pack_col_name="${_pl%%|*}"
  _pl="${_pl#*|}"
  pack_col_alias="${_pl%%|*}"
  _pl="${_pl#*|}"
  pack_col_skills="${_pl%%|*}"
  pack_col_summary="${_pl#*|}"
}

next_pack_row() {
  while [ -n "$_pack_iter_rest" ]; do
    case "$_pack_iter_rest" in
      *"$NL"*)
        _nl_line="${_pack_iter_rest%%"$NL"*}"
        _pack_iter_rest="${_pack_iter_rest#*"$NL"}"
        ;;
      *)
        _nl_line="$_pack_iter_rest"
        _pack_iter_rest=''
        ;;
    esac
    [ -n "$_nl_line" ] || continue
    parse_pack_line "$_nl_line"
    return 0
  done
  return 1
}

get_valid_packs_text() {
  _out=''
  _pack_iter_rest="$PACK_TABLE"
  while next_pack_row; do
    _out="${_out:+$_out, }${pack_col_name} (${pack_col_alias})"
  done
  printf '%s\n' "$_out"
}

get_all_pack_names() {
  _out=''
  _pack_iter_rest="$PACK_TABLE"
  while next_pack_row; do
    _out="${_out:+$_out }$pack_col_name"
  done
  printf '%s\n' "$_out"
}

canonicalize_pack() {
  _token="$1"
  _found=''
  _pack_iter_rest="$PACK_TABLE"
  while next_pack_row; do
    if [ "$_token" = "$pack_col_name" ] || [ "$_token" = "$pack_col_alias" ]; then
      _found="$pack_col_name"
      break
    fi
  done

  if [ -z "$_found" ]; then
    _valid_text="$(get_valid_packs_text)"
    usage_error "Unknown pack '$_token'. Valid packs: $_valid_text"
  fi
  resolved_canonical_pack="$_found"
}

show_help() {
  printf '%s\n' \
    'Usage: install.sh [OPTIONS]' \
    '' \
    'Install, update, list, or uninstall Swift Agent Skills for Google Antigravity.' \
    'By default, installs only swift-core (5 skills) to keep context lean.' \
    '' \
    'Options:' \
    '  --packs a,b       Install or update specific packs (comma-separated names or aliases)' \
    '  --all             Install all 8 packs enabled' \
    '  --all-disabled    Install all 8 packs with optional packs disabled until toggled on' \
    '  --workspace       Install into <cwd>/.agents/plugins instead of global plugins dir' \
    '  --dest DIR        Install into a custom plugins directory (overrides --workspace)' \
    '  --version vX.Y.Z  Download a specific GitHub release tag (no fallback on failure)' \
    '  --from-zip FILE   Install from a local archive file instead of downloading' \
    '  --list            Show available packs and install status without downloading' \
    '  --uninstall       Remove selected packs (or all 8 known packs when --packs omitted)' \
    '  -h, --help        Show this help message and exit' \
    '' \
    'Packs:'

  _pack_iter_rest="$PACK_TABLE"
  while next_pack_row; do
    printf '  %-23s (%-13s %2s skills)  %s\n' "$pack_col_name" "${pack_col_alias}," "$pack_col_skills" "$pack_col_summary"
  done
}

show_pack_table() {
  _dest_root="$1"
  printf '%-24s  %-14s  %6s  %-9s  %s\n' 'Name' 'Alias' 'Skills' 'Installed' 'Summary'
  printf '%-24s  %-14s  %6s  %-9s  %s\n' '------------------------' '--------------' '------' '---------' '----------------------------------------------------------------------'

  _pack_iter_rest="$PACK_TABLE"
  while next_pack_row; do
    if [ -d "$_dest_root/$pack_col_name" ]; then
      _inst='Yes'
    else
      _inst='No'
    fi
    printf '%-24s  %-14s  %6s  %-9s  %s\n' "$pack_col_name" "$pack_col_alias" "$pack_col_skills" "$_inst" "$pack_col_summary"
  done

  printf '\nDestination: %s\n' "$_dest_root"
}

resolve_selected_packs() {
  if [ "$opt_all" -eq 1 ] || [ "$opt_all_disabled" -eq 1 ]; then
    selected_packs="$(get_all_pack_names)"
    return 0
  fi

  if [ "$has_packs" -eq 1 ]; then
    selected_packs=''
    _csv="$opt_packs"
    while :; do
      case "$_csv" in
        *,*)
          _raw_tok="${_csv%%,*}"
          _csv="${_csv#*,}"
          _is_last=0
          ;;
        *)
          _raw_tok="$_csv"
          _is_last=1
          ;;
      esac

      _tok="$(trim_ws "$_raw_tok")"
      if [ -n "$_tok" ]; then
        _tok="$(printf '%s' "$_tok" | tr '[:upper:]' '[:lower:]')"
        canonicalize_pack "$_tok"
        _canon="$resolved_canonical_pack"
        case " $selected_packs " in
          *" $_canon "*) ;;
          *) selected_packs="${selected_packs:+$selected_packs }$_canon" ;;
        esac
      fi

      [ "$_is_last" -eq 1 ] && break
    done

    if [ -z "$selected_packs" ]; then
      _valid_text="$(get_valid_packs_text)"
      usage_error "No packs specified. Valid packs: $_valid_text"
    fi
    return 0
  fi

  if [ "$opt_uninstall" -eq 1 ]; then
    selected_packs="$(get_all_pack_names)"
    return 0
  fi

  selected_packs="$DEFAULT_PACK"
}

resolve_dest_root() {
  if [ "$has_dest" -eq 1 ]; then
    _trimmed_dest="$(trim_ws "$opt_dest")"
    [ -n "$_trimmed_dest" ] || usage_error 'Error: --dest cannot be empty.'
    dest_root="$(resolve_local_path "$opt_dest")"
    return 0
  fi

  if [ "$opt_workspace" -eq 1 ]; then
    dest_root="$(resolve_local_path '.agents/plugins')"
    return 0
  fi

  if [ -z "${HOME:-}" ]; then
    printf 'Error: HOME environment variable is not set. Specify --dest or --workspace.\n' >&2
    exit 1
  fi

  _home_clean="$(strip_trailing_slashes "$HOME")"
  dest_root="${_home_clean%/}/.gemini/config/plugins"
}

invoke_pack_uninstall() {
  for _pack_name in $selected_packs; do
    _target="$dest_root/$_pack_name"
    if [ -e "$_target" ] || [ -L "$_target" ]; then
      rm -rf -- "$_target"
      printf "Removed '%s' from %s\n" "$_pack_name" "$_target"
    else
      printf "Pack '%s' is not installed at %s\n" "$_pack_name" "$_target"
    fi
  done
  printf 'Done. Open Antigravity -> Customizations -> Installed to confirm.\n'
}

download_archive() {
  _dest_zip="$1"
  if ! command -v curl >/dev/null 2>&1; then
    printf 'Error: curl is required to download releases. Install curl or use --from-zip.\n' >&2
    exit 1
  fi

  if [ "$has_version" -eq 1 ]; then
    _ver="$(trim_ws "$opt_version")"
    case "$_ver" in
      v*) _tag="$_ver" ;;
      *) _tag="v$_ver" ;;
    esac
    _url="https://github.com/${REPO_SLUG}/releases/download/${_tag}/${ASSET_NAME}"
    printf 'Downloading release %s from %s...\n' "$_tag" "$_url"
    if ! curl -fsSL -o "$_dest_zip" "$_url" </dev/null; then
      rm -f -- "$_dest_zip"
      printf "Error: Failed to download release '%s' from %s. Check available releases at https://github.com/%s/releases or clone the repository and run 'agy plugin install'.\n" "$_tag" "$_url" "$REPO_SLUG" >&2
      exit 1
    fi
    return 0
  fi

  _latest_url="https://github.com/${REPO_SLUG}/releases/latest/download/${ASSET_NAME}"
  printf 'Downloading latest release from %s...\n' "$_latest_url"
  if curl -fsSL -o "$_dest_zip" "$_latest_url" </dev/null; then
    return 0
  fi

  rm -f -- "$_dest_zip"
  printf 'Warning: No GitHub release archive available yet; falling back to main branch archive.\n' >&2
  _main_url="https://github.com/${REPO_SLUG}/archive/refs/heads/main.zip"
  printf 'Downloading main branch archive from %s...\n' "$_main_url"
  if ! curl -fsSL -o "$_dest_zip" "$_main_url" </dev/null; then
    rm -f -- "$_dest_zip"
    printf 'Error: Failed to download archive from %s.\n' "$_main_url" >&2
    exit 1
  fi
}

find_plugin_source_dir() {
  _extract_root="$1"
  _pack="$2"
  found_plugin_dir=''

  if [ -f "$_extract_root/$_pack/plugin.json" ]; then
    found_plugin_dir="$_extract_root/$_pack"
    return 0
  fi

  for _top in "$_extract_root"/*; do
    if [ -d "$_top" ] && [ -f "$_top/antigravity/plugins/$_pack/plugin.json" ]; then
      found_plugin_dir="$_top/antigravity/plugins/$_pack"
      return 0
    fi
  done

  return 1
}

find_executables_file() {
  _extract_root="$1"
  found_executables_file=''

  if [ -f "$_extract_root/EXECUTABLES.txt" ]; then
    found_executables_file="$_extract_root/EXECUTABLES.txt"
    return 0
  fi

  for _top in "$_extract_root"/*; do
    if [ -d "$_top" ] && [ -f "$_top/antigravity/plugins/EXECUTABLES.txt" ]; then
      found_executables_file="$_top/antigravity/plugins/EXECUTABLES.txt"
      return 0
    fi
  done

  return 1
}

set_staged_pack_disabled() {
  _stage_pack_dir="$1"
  _manifest="$_stage_pack_dir/plugin.json"
  _tmp_manifest="$_stage_pack_dir/plugin.json.tmp.$$"

  if ! awk '
    BEGIN { has_disabled = 0; n = 0 }
    {
      sub(/\015$/, "", $0)
      lines[++n] = $0
      if ($0 ~ /"disabled"[ \t]*:/) {
        has_disabled = 1
      }
    }
    END {
      if (n == 0 || lines[1] !~ /^\{/) {
        exit 3
      }
      if (has_disabled) {
        for (i = 1; i <= n; i++) {
          print lines[i]
        }
      } else if (lines[1] ~ /^\{[ \t]*$/) {
        print "{"
        print "  \"disabled\": true,"
        for (i = 2; i <= n; i++) {
          print lines[i]
        }
      } else {
        sub(/^\{/, "{\"disabled\": true, ", lines[1])
        for (i = 1; i <= n; i++) {
          print lines[i]
        }
      }
    }
  ' "$_manifest" > "$_tmp_manifest"; then
    rm -f -- "$_tmp_manifest"
    printf 'Error: Invalid plugin.json format in %s\n' "$_manifest" >&2
    exit 1
  fi

  mv -f -- "$_tmp_manifest" "$_manifest"
}

apply_executables_chmod() {
  _exec_file="$1"
  while IFS= read -r _raw_rel || [ -n "$_raw_rel" ]; do
    _rel="$(trim_ws "$_raw_rel")"
    [ -n "$_rel" ] || continue
    case "$_rel" in
      \#*|/*) continue ;;
    esac
    case "/$_rel/" in
      */../*|*/./*) continue ;;
    esac
    case "$_rel" in
      */*) _entry_pack="${_rel%%/*}" ;;
      *) continue ;;
    esac
    case " $selected_packs " in
      *" $_entry_pack "*)
        if [ -f "$dest_root/$_rel" ]; then
          chmod +x -- "$dest_root/$_rel"
        fi
        ;;
    esac
  done < "$_exec_file"
}

opt_packs=''
has_packs=0
opt_all=0
opt_all_disabled=0
opt_workspace=0
opt_dest=''
has_dest=0
opt_version=''
has_version=0
opt_from_zip=''
has_from_zip=0
opt_list=0
opt_uninstall=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help)
      show_help
      exit 0
      ;;
    --all)
      opt_all=1
      shift
      ;;
    --all-disabled)
      opt_all_disabled=1
      shift
      ;;
    --workspace)
      opt_workspace=1
      shift
      ;;
    --list)
      opt_list=1
      shift
      ;;
    --uninstall)
      opt_uninstall=1
      shift
      ;;
    --packs)
      [ "$#" -ge 2 ] || usage_error 'Error: --packs requires a value.'
      has_packs=1
      opt_packs="${opt_packs:+$opt_packs,}$2"
      shift 2
      ;;
    --packs=*)
      has_packs=1
      _val="${1#--packs=}"
      if [ -z "$(trim_ws "$_val")" ]; then
        usage_error "No packs specified. Valid packs: $(get_valid_packs_text)"
      fi
      opt_packs="${opt_packs:+$opt_packs,}$_val"
      shift
      ;;
    --dest)
      [ "$#" -ge 2 ] || usage_error 'Error: --dest requires a directory path.'
      has_dest=1
      opt_dest="$2"
      shift 2
      ;;
    --dest=*)
      has_dest=1
      opt_dest="${1#--dest=}"
      shift
      ;;
    --version)
      [ "$#" -ge 2 ] || usage_error 'Error: --version requires a tag (e.g. v1.0.0).'
      has_version=1
      opt_version="$2"
      shift 2
      ;;
    --version=*)
      has_version=1
      opt_version="${1#--version=}"
      shift
      ;;
    --from-zip)
      [ "$#" -ge 2 ] || usage_error 'Error: --from-zip requires a file path.'
      has_from_zip=1
      opt_from_zip="$2"
      shift 2
      ;;
    --from-zip=*)
      has_from_zip=1
      opt_from_zip="${1#--from-zip=}"
      shift
      ;;
    --)
      shift
      if [ "$#" -gt 0 ]; then
        usage_error "Error: Unexpected argument '$1'. Run with --help for usage."
      fi
      ;;
    -*)
      usage_error "Error: Unknown option '$1'. Run with --help for usage."
      ;;
    *)
      usage_error "Error: Unexpected argument '$1'. Run with --help for usage."
      ;;
  esac
done

if [ "$opt_all" -eq 1 ] && [ "$opt_all_disabled" -eq 1 ]; then
  usage_error 'Error: --all and --all-disabled cannot be used together.'
fi
if [ "$opt_all" -eq 1 ] && [ "$has_packs" -eq 1 ]; then
  usage_error 'Error: --all and --packs cannot be used together.'
fi
if [ "$opt_all_disabled" -eq 1 ] && [ "$has_packs" -eq 1 ]; then
  usage_error 'Error: --all-disabled and --packs cannot be used together.'
fi
if [ "$opt_list" -eq 1 ] && [ "$opt_uninstall" -eq 1 ]; then
  usage_error 'Error: --list and --uninstall cannot be used together.'
fi
if [ "$opt_uninstall" -eq 1 ] && [ "$opt_all_disabled" -eq 1 ]; then
  usage_error 'Error: --uninstall and --all-disabled cannot be used together.'
fi
if [ "$has_version" -eq 1 ] && [ -z "$(trim_ws "$opt_version")" ]; then
  usage_error 'Error: --version cannot be empty.'
fi
if [ "$has_from_zip" -eq 1 ] && [ -z "$(trim_ws "$opt_from_zip")" ]; then
  usage_error 'Error: --from-zip cannot be empty.'
fi

resolve_selected_packs
resolve_dest_root

if [ "$opt_list" -eq 1 ]; then
  show_pack_table "$dest_root"
  exit 0
fi

if [ "$opt_uninstall" -eq 1 ]; then
  invoke_pack_uninstall
  exit 0
fi

resolved_from_zip=''
if [ "$has_from_zip" -eq 1 ]; then
  resolved_from_zip="$(resolve_local_path "$opt_from_zip")"
  if [ ! -f "$resolved_from_zip" ]; then
    printf 'Error: Archive file not found: %s\n' "$resolved_from_zip" >&2
    exit 1
  fi
fi

if ! command -v unzip >/dev/null 2>&1; then
  printf 'Error: unzip is required to extract plugin archives.\n' >&2
  exit 1
fi
if ! command -v mktemp >/dev/null 2>&1; then
  printf 'Error: mktemp is required.\n' >&2
  exit 1
fi
if ! command -v awk >/dev/null 2>&1; then
  printf 'Error: awk is required.\n' >&2
  exit 1
fi

tmp_base="${TMPDIR:-/tmp}"
tmp_base="$(strip_trailing_slashes "$tmp_base")"
tmp_root="$(mktemp -d "${tmp_base%/}/swift-agent-skills.XXXXXX")"
extract_dir="$tmp_root/extracted"
mkdir -p -- "$extract_dir"

if [ -n "$resolved_from_zip" ]; then
  zip_path="$resolved_from_zip"
  printf 'Installing from local archive %s...\n' "$zip_path"
else
  zip_path="$tmp_root/$ASSET_NAME"
  download_archive "$zip_path"
fi

if ! unzip -q -o "$zip_path" -d "$extract_dir" </dev/null; then
  printf 'Error: Failed to extract archive: %s\n' "$zip_path" >&2
  exit 1
fi

# Fail closed before touching destination or staging if any requested pack is missing.
for _pack_name in $selected_packs; do
  if ! find_plugin_source_dir "$extract_dir" "$_pack_name"; then
    printf "Error: Archive does not contain pack '%s'.\n" "$_pack_name" >&2
    exit 1
  fi
done

dest_parent="$(dirname -- "$dest_root")"
dest_parent="$(strip_trailing_slashes "$dest_parent")"
staging_base="${dest_parent%/}/.swift-agent-skills-staging"

mkdir -p -- "$dest_root" "$staging_base"
run_staging_root="$(mktemp -d "${staging_base}/run.XXXXXX")"

installed_csv=''
for _pack_name in $selected_packs; do
  find_plugin_source_dir "$extract_dir" "$_pack_name"
  _src_dir="$found_plugin_dir"
  _stage_dir="$run_staging_root/$_pack_name"

  cp -R -- "$_src_dir" "$_stage_dir"

  if [ "$opt_all_disabled" -eq 1 ] && [ "$_pack_name" != "$DEFAULT_PACK" ]; then
    set_staged_pack_disabled "$_stage_dir"
  fi

  _dst_dir="$dest_root/$_pack_name"
  rm -rf -- "$_dst_dir"
  mv -- "$_stage_dir" "$_dst_dir"

  installed_csv="${installed_csv:+$installed_csv, }$_pack_name"
  printf "Installed '%s' -> %s\n" "$_pack_name" "$_dst_dir"
done

if find_executables_file "$extract_dir"; then
  apply_executables_chmod "$found_executables_file"
fi

printf '\n'
printf 'Installed: %s\n' "$installed_csv"
printf 'Destination: %s\n' "$dest_root"
if [ "$opt_all_disabled" -eq 1 ]; then
  printf 'Note: Optional packs were installed disabled; enable them in Customizations when needed.\n'
fi
printf 'Open Antigravity -> Customizations -> Installed (no restart needed).\n'
