#!/usr/bin/env bash
#
# deploy-client.sh — 部署 KanataIM Windows 客户端新包，并同步站内所有下载链接
#
# 用法:
#   ./deploy-client.sh /path/to/KanataIM-v1.2.3.zip [选项]
#
# 选项:
#   --force       允许同版本或降级重跑（默认拒绝）
#   --keep-old    保留 public/downloads 下的旧版本 zip（默认删除）
#   --no-verify   跳过最后的线上实测（走 Cloudflare 拉包校验会很慢）
#   -h, --help    显示帮助
#
# 环境变量:
#   CONTAINER   容器名，默认 index-xboard-1
#   OWNER       部署文件的属主，默认 1panel:1panel
#   SITE_URL    站点地址，默认 https://neko.kanata.im
#
# 流程:
#   校验 zip → 部署到 public/downloads/ → 改两个 custom-traffic.js 里的
#   KanataIM 版本号与下载 URL（源文件和 public 副本各自原地改，互不覆盖）
#   → 插件 config.json 版本 +0.01 → 同步 v2_plugins 表 + 刷 custom_html 缓存戳
#   → 删旧包 → octane:reload → 走 Cloudflare 实测（含完整下载对比 md5）
#
# 依赖: GNU coreutils、unzip、curl、docker（宿主机执行，需 root 或能 docker exec）
#
set -euo pipefail

SITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER="${CONTAINER:-index-xboard-1}"
OWNER="${OWNER:-1panel:1panel}"
SITE_URL="${SITE_URL:-https://neko.kanata.im}"

JS_SRC="$SITE_DIR/plugins/CustomTraffic/resources/assets/custom-traffic.js"
JS_PUB="$SITE_DIR/public/plugins/custom_traffic/custom-traffic.js"
CONFIG="$SITE_DIR/plugins/CustomTraffic/config.json"
DL_DIR="$SITE_DIR/public/downloads"
BACKUP_DIR="$SITE_DIR/storage/deploy-client-backup"

FORCE=0; KEEP_OLD=0; VERIFY=1; ZIP=""

die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
info() { printf '\033[36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*"; }
step() { printf '\n\033[1m[%s] %s\033[0m\n' "$1" "$2"; }

usage() { sed -n '2,/^[^#]/p' "${BASH_SOURCE[0]}" | sed '$d' | sed 's/^# \{0,1\}//'; exit 0; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)     FORCE=1 ;;
    --keep-old)  KEEP_OLD=1 ;;
    --no-verify) VERIFY=0 ;;
    -h|--help)   usage ;;
    -*)          die "未知选项: $1（--help 看用法）" ;;
    *)           [[ -n "$ZIP" ]] && die "只能指定一个 zip"; ZIP="$1" ;;
  esac
  shift
done

[[ -n "$ZIP" ]] || { printf '\033[33m请指定要部署的 zip\033[0m\n\n'; usage; }
[[ -f "$ZIP" ]] || die "文件不存在: $ZIP"
for f in "$JS_SRC" "$JS_PUB" "$CONFIG"; do [[ -f "$f" ]] || die "缺少文件: $f"; done

PHP_TMP="$SITE_DIR/__ct_deploy_$$.php"
cleanup() { rm -f "$PHP_TMP"; }
trap cleanup EXIT

# ---------------------------------------------------------------- 1. 解析版本
step 1/8 "解析并校验新包"

BASE="$(basename "$ZIP")"
BASE="$(printf '%s' "$BASE" | sed -E 's/^[0-9]+-//')"   # 容忍附件下载时加的 "01-" 前缀
[[ "$BASE" =~ ^KanataIM-v([0-9]+\.[0-9]+\.[0-9]+)\.zip$ ]] \
  || die "文件名必须形如 KanataIM-vX.Y.Z.zip（实际: $BASE）"
VER="${BASH_REMATCH[1]}"

unzip -t "$ZIP" >/dev/null 2>&1 || die "zip 损坏，unzip -t 未通过"
unzip -l "$ZIP" | grep -q 'KanataIM/KanataIM\.exe' || die "包内没有 KanataIM/KanataIM.exe，确认是客户端包？"
SRC_MD5="$(md5sum "$ZIP" | awk '{print $1}')"
SRC_SIZE="$(stat -c %s "$ZIP")"
info "版本 v$VER，$SRC_SIZE 字节，md5 $SRC_MD5"

# 与线上版本比较（以 public 副本里 Windows 项的文案为准，那是实际生效的）
CUR_VER="$(sed -n "s/.*desc: 'KanataIM v\([0-9.]*\).*/\1/p" "$JS_PUB" | head -1)"
if [[ -n "$CUR_VER" ]]; then
  if [[ "$VER" == "$CUR_VER" && $FORCE -eq 0 ]]; then
    die "线上已是 v$CUR_VER，无需部署（要重跑加 --force）"
  fi
  if [[ "$(printf '%s\n%s\n' "$VER" "$CUR_VER" | sort -V | tail -1)" != "$VER" && $FORCE -eq 0 ]]; then
    die "新包 v$VER 比线上 v$CUR_VER 旧，拒绝降级（要降级加 --force）"
  fi
  info "线上当前 v$CUR_VER → 部署 v$VER"
else
  warn "没在 public 副本里找到现有 Windows 下载项，跳过版本比较"
fi

# ---------------------------------------------------------------- 2. 备份
step 2/8 "备份将被修改的插件文件"

mkdir -p "$BACKUP_DIR"
# 两处 JS 同名，必须分开命名，否则 cp 会撞车
cp -p "$JS_SRC" "$BACKUP_DIR/custom-traffic.src.js"
cp -p "$JS_PUB" "$BACKUP_DIR/custom-traffic.pub.js"
cp -p "$CONFIG" "$BACKUP_DIR/config.json"
{
  printf 'deploy time : %s\n' "$(date '+%F %T %z')"
  printf 'client ver  : %s\n' "$VER"
  printf 'zip         : %s\n' "$BASE"
  printf 'zip md5     : %s\n' "$SRC_MD5"
  printf 'zip size    : %s\n' "$SRC_SIZE"
  printf 'replaced    : %s\n' "${CUR_VER:-unknown}"
} > "$BACKUP_DIR/last-deploy.txt"
ok "已备份到 storage/deploy-client-backup/（每次部署覆盖，含 last-deploy.txt）"

# ---------------------------------------------------------------- 3. 部署 zip
step 3/8 "部署客户端包"

mkdir -p "$DL_DIR"
TARGET="$DL_DIR/KanataIM-v$VER.zip"
[[ -f "$TARGET" ]] && warn "目标文件已存在，将覆盖"
cp -f "$ZIP" "$TARGET"
chmod 644 "$TARGET"
if [[ "$(id -u)" -eq 0 ]]; then chown "$OWNER" "$TARGET"; fi

[[ "$(md5sum "$TARGET" | awk '{print $1}')" == "$SRC_MD5" ]] || die "复制后 md5 不一致"
ok "public/downloads/KanataIM-v$VER.zip（$SRC_SIZE 字节，md5 已核对）"

# ---------------------------------------------------------------- 4. 改插件 JS
step 4/8 "同步插件 JS 里的下载链接"

# 同一份 JS 维护在两个位置，历史上有过"只改了一边"导致回退的事故，
# 所以两边各自原地替换，不做互相覆盖。
for f in "$JS_SRC" "$JS_PUB"; do
  before="$(md5sum "$f" | awk '{print $1}')"
  sed -i -E \
    -e "s|KanataIM v[0-9]+\.[0-9]+\.[0-9]+|KanataIM v${VER}|g" \
    -e "s|/downloads/KanataIM-v[0-9]+\.[0-9]+\.[0-9]+\.zip|/downloads/KanataIM-v${VER}.zip|g" \
    "$f"
  after="$(md5sum "$f" | awk '{print $1}')"
  rel="${f#"$SITE_DIR"/}"
  if [[ "$before" == "$after" ]]; then
    warn "$rel 无改动（可能本来就是 v$VER）"
  else
    ok "$rel 已更新"
  fi
done

grep -q "desc: 'KanataIM v$VER" "$JS_PUB" || die "public 副本替换失败，请检查第 1612 行附近的 CLIENT_LINKS"
grep -q "'/downloads/KanataIM-v$VER.zip'" "$JS_PUB" || die "public 副本 URL 替换失败"
STALE="$(grep -oE "KanataIM v[0-9]+\.[0-9]+\.[0-9]+" "$JS_PUB" | grep -v "v$VER" | sort -u || true)"
[[ -z "$STALE" ]] || warn "JS 里还残留其他版本引用: $STALE"
ok "两个 JS 文件均已指向 v$VER（源文件与 public 副本现在内容一致: $(cmp -s "$JS_SRC" "$JS_PUB" && echo yes || echo no)）"

# ---------------------------------------------------------------- 5. 插件版本
step 5/8 "升插件版本并刷缓存戳"

PLUGIN_VER="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([0-9.]*\)".*/\1/p' "$CONFIG" | head -1)"
[[ -n "$PLUGIN_VER" ]] || die "读不到 config.json 的 version"
NEW_PLUGIN_VER="$(awk -F. '{w=length($3); p=$3+0; m=$2+0; M=$1+0; p++; if (p>=10^w) {p=0; m++} if (m>99) {m=0; M++} printf "%d.%d.%0*d", M, m, w, p}' <<< "$PLUGIN_VER")"
sed -i -E "s|(\"version\"[[:space:]]*:[[:space:]]*\")${PLUGIN_VER//./\\.}(\")|\1$NEW_PLUGIN_VER\2|" "$CONFIG"
grep -q "\"version\": \"$NEW_PLUGIN_VER\"" "$CONFIG" || die "config.json 版本号替换失败"
ok "插件版本 $PLUGIN_VER → $NEW_PLUGIN_VER"

STAMP="$(date +%Y%m%d)-client-v$VER"

cat > "$PHP_TMP" <<'PHP'
<?php
use App\Support\Setting;

\DB::table('v2_plugins')->where('code', 'custom_traffic')
    ->update(['version' => getenv('CT_PLUGIN_VER'), 'updated_at' => now()]);

$setting = app(Setting::class);
$theme = $setting->get('theme_liquidglass');
$theme = is_array($theme) ? $theme : json_decode((string) $theme, true);
$theme['custom_html'] = '<script src="/plugins/custom_traffic/custom-traffic.js?v=' . getenv('CT_STAMP') . '"></script>';
$setting->set('theme_liquidglass', $theme);

echo 'v2_plugins.version = ' . \DB::table('v2_plugins')->where('code', 'custom_traffic')->value('version') . PHP_EOL;
$raw = \DB::table('v2_settings')->where('name', 'theme_liquidglass')->value('value');
echo 'custom_html        = ' . (json_decode($raw, true)['custom_html'] ?? '(none)') . PHP_EOL;
PHP

docker exec -e CT_PLUGIN_VER="$NEW_PLUGIN_VER" -e CT_STAMP="$STAMP" \
  "$CONTAINER" php artisan tinker "/www/$(basename "$PHP_TMP")" \
  || die "容器内更新失败（容器名 $CONTAINER 对吗？）"
ok "缓存戳 ?v=$STAMP"

# ---------------------------------------------------------------- 6. 清旧包
step 6/8 "清理旧版本包"

mapfile -t OLDS < <(find "$DL_DIR" -maxdepth 1 -name 'KanataIM-v*.zip' ! -name "KanataIM-v$VER.zip" -printf '%f\n' | sort)
if [[ ${#OLDS[@]} -eq 0 ]]; then
  info "没有旧包需要清理"
elif [[ $KEEP_OLD -eq 1 ]]; then
  warn "--keep-old：保留 ${OLDS[*]}"
else
  for o in "${OLDS[@]}"; do
    rm -f "$DL_DIR/$o"
    ok "已删除 $o"
  done
  warn "旧包已删除，本机不再有副本；需要回滚得重新上传旧包"
fi

# ---------------------------------------------------------------- 7. reload
step 7/8 "重载 Octane（否则 worker 内存里的设置不刷新）"
docker exec -u www "$CONTAINER" php artisan octane:reload || die "octane:reload 失败"
ok "workers 已重载"

# ---------------------------------------------------------------- 8. 实测
step 8/8 "线上实测（$SITE_URL）"

if [[ $VERIFY -eq 0 ]]; then
  warn "--no-verify：跳过线上实测"
  printf '\n\033[32m部署完成: v%s\033[0m\n' "$VER"
  exit 0
fi

FAIL=0
chk() { # chk <描述> <0=通过>
  if [[ "$2" -eq 0 ]]; then ok "$1"; else warn "未通过: $1"; FAIL=$((FAIL+1)); fi
}

HDR="$(curl -sI --max-time 30 "$SITE_URL/downloads/KanataIM-v$VER.zip" || true)"
CODE="$(printf '%s' "$HDR" | head -1 | awk '{print $2}')"
CLEN="$(printf '%s' "$HDR" | tr -d '\r' | awk 'tolower($1)=="content-length:"{print $2}')"
RANGES="$(printf '%s' "$HDR" | tr -d '\r' | awk 'tolower($1)=="accept-ranges:"{print $2}')"
chk "新包直链 HTTP 200（实际 $CODE）" "$([[ "$CODE" == "200" ]] && echo 0 || echo 1)"
chk "content-length $CLEN == 本地 $SRC_SIZE" "$([[ "$CLEN" == "$SRC_SIZE" ]] && echo 0 || echo 1)"
chk "支持断点续传 accept-ranges: $RANGES" "$([[ "$RANGES" == "bytes" ]] && echo 0 || echo 1)"

for o in "${OLDS[@]:-}"; do
  [[ -n "$o" ]] || continue
  ov="${o#KanataIM-v}"; ov="${ov%.zip}"
  oc="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$SITE_URL/downloads/KanataIM-v$ov.zip" || true)"
  chk "旧链接 v$ov 已 404（实际 $oc）" "$([[ "$oc" == "404" ]] && echo 0 || echo 1)"
done

curl -s --max-time 30 "$SITE_URL/plugins/custom_traffic/custom-traffic.js?v=$STAMP" | grep -q "'/downloads/KanataIM-v$VER.zip'" \
  && chk "线上 JS 指向 v$VER" 0 || chk "线上 JS 指向 v$VER" 1
curl -s --max-time 30 "$SITE_URL/" | grep -q "custom-traffic\.js?v=$STAMP" \
  && chk "首页注入缓存戳 $STAMP" 0 || chk "首页注入缓存戳 $STAMP（可能是 Cloudflare 首页缓存，刷新一次再确认）" 1

TMP_DL="$(mktemp)"
if curl -s --max-time 600 "$SITE_URL/downloads/KanataIM-v$VER.zip" -o "$TMP_DL"; then
  DL_MD5="$(md5sum "$TMP_DL" | awk '{print $1}')"
  chk "完整下载后 md5 一致（$DL_MD5）" "$([[ "$DL_MD5" == "$SRC_MD5" ]] && echo 0 || echo 1)"
  unzip -t "$TMP_DL" >/dev/null 2>&1 && chk "下载所得 zip 可解压" 0 || chk "下载所得 zip 可解压" 1
else
  chk "完整下载" 1
fi
rm -f "$TMP_DL"

printf '\n'
if [[ $FAIL -eq 0 ]]; then
  printf '\033[32m✓ 部署完成: KanataIM v%s（插件 %s，缓存戳 %s），全部检查通过\033[0m\n' \
    "$VER" "$NEW_PLUGIN_VER" "$STAMP"
else
  printf '\033[33m! 部署完成: KanataIM v%s，但有 %s 项检查未通过，见上面列表\033[0m\n' "$VER" "$FAIL"
  exit 1
fi
