#!/bin/zsh
set -euo pipefail

project_dir="/Users/kidyvonne/Documents/Codex/2026-10-29/1-ddl-2-zotero-ppt-ppt/work/research-workbench"
runtime_dir="${project_dir}/.sites-runtime"
log_file="${runtime_dir}/local-workbench.log"
pid_file="${runtime_dir}/local-workbench.pid"
url="http://127.0.0.1:8788/"

mkdir -p "${runtime_dir}"

if /usr/sbin/lsof -nP -iTCP:8788 -sTCP:LISTEN >/dev/null 2>&1; then
  /usr/bin/open "${url}"
  exit 0
fi

node_bin="/Users/kidyvonne/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
if [[ ! -x "${node_bin}" ]]; then
  node_bin="$(command -v node || true)"
fi
if [[ -z "${node_bin}" || ! -x "${node_bin}" ]]; then
  echo "未找到 Node.js。请先打开桌面版 Codex，让它完成工作区运行时初始化。"
  read -r "?按回车键关闭窗口。"
  exit 1
fi

cd "${project_dir}"
ulimit -n 4096
nohup "${node_bin}" \
  --import ./scripts/sites-env.mjs \
  ./node_modules/wrangler/bin/wrangler.js dev \
  --config dist/server/wrangler.json \
  --local \
  --persist-to .wrangler/state \
  --ip 127.0.0.1 \
  --port 8788 \
  --inspector-port 0 \
  >"${log_file}" 2>&1 &

server_pid=$!
echo "${server_pid}" >"${pid_file}"

for attempt in {1..40}; do
  if /usr/bin/curl --silent --fail --output /dev/null "${url}"; then
    /usr/bin/open "${url}"
    exit 0
  fi
  if ! kill -0 "${server_pid}" 2>/dev/null; then
    echo "科研工作台启动失败。日志位置：${log_file}"
    /usr/bin/tail -n 30 "${log_file}"
    read -r "?按回车键关闭窗口。"
    exit 1
  fi
  sleep 0.25
done

echo "科研工作台启动超时。日志位置：${log_file}"
read -r "?按回车键关闭窗口。"
exit 1
