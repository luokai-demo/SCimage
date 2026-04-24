#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SERVER_SCRIPT="${APP_ROOT}/webapp/server.py"
STATE_DIR="${APP_ROOT}/.local"
PID_FILE="${STATE_DIR}/webapp.pid"
PORT=8765
URL="http://127.0.0.1:${PORT}"
SERVER_PID=""

mkdir -p "${STATE_DIR}"

read_pid_file() {
  if [[ -f "${PID_FILE}" ]]; then
    tr -d '[:space:]' < "${PID_FILE}"
  fi
}

is_pid_running() {
  local pid="${1:-}"
  [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null
}

is_project_server() {
  local pid="${1:-}"
  [[ -n "${pid}" ]] || return 1
  local command
  command="$(ps -p "${pid}" -o command= 2>/dev/null || true)"
  [[ -n "${command}" ]] && [[ "${command}" == *"${SERVER_SCRIPT}"* ]]
}

find_listening_pids() {
  lsof -n -P -iTCP:${PORT} -sTCP:LISTEN -t 2>/dev/null | sort -u
}

collect_project_server_pids() {
  local pids=()
  local pid_from_file
  pid_from_file="$(read_pid_file || true)"
  if is_pid_running "${pid_from_file}" && is_project_server "${pid_from_file}"; then
    pids+=("${pid_from_file}")
  fi

  local listener_pid
  while IFS= read -r listener_pid; do
    [[ -n "${listener_pid}" ]] || continue
    if is_project_server "${listener_pid}"; then
      pids+=("${listener_pid}")
    fi
  done < <(find_listening_pids)

  if (( ${#pids[@]} > 0 )); then
    printf '%s\n' "${pids[@]}" | sort -u
  fi
}

cleanup_pid_file_if_stale() {
  local pid_from_file
  pid_from_file="$(read_pid_file || true)"
  if [[ -n "${pid_from_file}" ]] && (! is_pid_running "${pid_from_file}" || ! is_project_server "${pid_from_file}"); then
    rm -f "${PID_FILE}"
  fi
}

print_status() {
  cleanup_pid_file_if_stale

  local managed_pids=()
  local pid
  while IFS= read -r pid; do
    [[ -n "${pid}" ]] || continue
    managed_pids+=("${pid}")
  done < <(collect_project_server_pids || true)

  if (( ${#managed_pids[@]} == 0 )); then
    echo "未发现当前项目的运行中服务。"
  else
    echo "当前项目服务正在运行："
    for pid in "${managed_pids[@]}"; do
      echo "  PID ${pid}  $(ps -p "${pid}" -o command=)"
    done
    echo "访问地址：${URL}"
  fi

  local other_listener
  while IFS= read -r other_listener; do
    [[ -n "${other_listener}" ]] || continue
    if ! is_project_server "${other_listener}"; then
      echo "端口 ${PORT} 还被其他进程占用：PID ${other_listener}"
      echo "  $(ps -p "${other_listener}" -o command=)"
    fi
  done < <(find_listening_pids)
}

stop_pid() {
  local pid="${1}"
  if ! is_pid_running "${pid}"; then
    return
  fi

  kill "${pid}" 2>/dev/null || true
  local attempt
  for attempt in {1..20}; do
    if ! is_pid_running "${pid}"; then
      return
    fi
    sleep 0.25
  done

  kill -9 "${pid}" 2>/dev/null || true
}

stop_project_servers() {
  local pids=()
  local pid
  while IFS= read -r pid; do
    [[ -n "${pid}" ]] || continue
    pids+=("${pid}")
  done < <(collect_project_server_pids || true)

  if (( ${#pids[@]} == 0 )); then
    cleanup_pid_file_if_stale
    echo "没有需要停止的旧服务。"
    return
  fi

  echo "正在停止旧服务：${pids[*]}"
  for pid in "${pids[@]}"; do
    stop_pid "${pid}"
  done
  rm -f "${PID_FILE}"
}

ensure_port_available() {
  local other_listener
  while IFS= read -r other_listener; do
    [[ -n "${other_listener}" ]] || continue
    if ! is_project_server "${other_listener}"; then
      echo "端口 ${PORT} 被其他进程占用，无法启动当前项目："
      echo "  PID ${other_listener}  $(ps -p "${other_listener}" -o command=)"
      return 1
    fi
  done < <(find_listening_pids)
}

cleanup_on_exit() {
  local exit_code=$?
  if is_pid_running "${SERVER_PID}"; then
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
  rm -f "${PID_FILE}"
  exit "${exit_code}"
}

run_server_foreground() {
  stop_project_servers
  ensure_port_available

  echo "启动图像工作台：${URL}"
  echo "按 Ctrl+C 可停止服务。"

  python3 "${SERVER_SCRIPT}" &
  SERVER_PID=$!
  echo "${SERVER_PID}" > "${PID_FILE}"
  trap cleanup_on_exit EXIT INT TERM
  wait "${SERVER_PID}"
}

show_usage() {
  cat <<EOF
用法:
  ./启动网页.command [start|stop|restart|status]

说明:
  start   停掉当前项目旧进程后，前台启动服务
  stop    停掉当前项目服务
  restart 停掉旧服务后重新启动
  status  查看当前项目服务状态
EOF
}

COMMAND="${1:-start}"

case "${COMMAND}" in
  start)
    run_server_foreground
    ;;
  stop)
    stop_project_servers
    ;;
  restart)
    stop_project_servers
    run_server_foreground
    ;;
  status)
    print_status
    ;;
  *)
    show_usage
    exit 1
    ;;
esac
