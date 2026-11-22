#!/usr/bin/env sh
set -eu
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
sh "$SCRIPT_DIR/scripts/manage-plugin.sh" install
printf '[English]\n%s\n[中文]\n%s\n' \
    'Footer capsule: start Antigravity with --remote-debugging-port=0. See the installation guide for your platform: https://github.com/Lumidarin/agy-capsule/blob/main/README.en.md#installation' \
    '底栏胶囊：用 --remote-debugging-port=0 启动 Antigravity。各平台的启动项设置见 https://github.com/Lumidarin/agy-capsule#安装'
