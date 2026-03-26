#!/bin/bash

set -e

PAYLOAD_BASE64="$1"
PAYLOAD=$(echo "$PAYLOAD_BASE64" | base64 --decode)

LOG_FILE="${AI_TASK_MASTER_LOG:-$HOME/.ai-task-master/fallback.log}"
mkdir -p "$(dirname "$LOG_FILE")"

if ! command -v jq >/dev/null 2>&1; then
  MSG="[ai-task-master] jq is required but not installed.

Install it using your system package manager:

Ubuntu/Debian: sudo apt install -y jq
macOS (Homebrew): brew install jq"

  echo "$MSG"
  echo "$MSG" >> "$LOG_FILE"

  exit 1
fi

# --- parse payload ---
ACTION=$(echo "$PAYLOAD" | jq -r '.action')
TASK_NAME=$(echo "$PAYLOAD" | jq -r '.taskName')
PROJECT_ROOT=$(echo "$PAYLOAD" | jq -r '.projectRoot')

SCRIPT_DIR="$HOME/.ai-task-master/scripts"
SCRIPT_PATH="$SCRIPT_DIR/$TASK_NAME.sh"
mkdir -p "$SCRIPT_DIR"
FULL_COMMAND=$(echo "$PAYLOAD" | jq -r '.execution.fullCommand')

# --- build script ---
build_script() {
  echo "[ai-task-master] Creating script: $SCRIPT_PATH"

  ENV_EXPORTS=$(echo "$PAYLOAD" | jq -r '.env | to_entries[] | "export \(.key)=\(.value|@sh)"')
  TYPE=$(echo "$PAYLOAD" | jq -r '.triggers[0].type')

  SELF_DELETE=""
  if [ "$TYPE" = "once" ]; then
    SELF_DELETE="
# --- self delete (for one-time jobs) ---
crontab -l | grep -v \"$SCRIPT_PATH\" | crontab -
rm -f \"$SCRIPT_PATH\""
  fi

  cat > "$SCRIPT_PATH" <<EOF
#!/bin/bash

# --- env injection ---
$ENV_EXPORTS

export PATH="\$AI_TASK_MASTER_PATH:\$PATH"
export TASK_MASTER_EXECUTION=true

cd "$PROJECT_ROOT"

# --- execution ---
eval "$FULL_COMMAND" >> "$LOG_FILE" 2>&1
$SELF_DELETE
EOF

  chmod +x "$SCRIPT_PATH"
}

# --- cron helpers ---
add_cron() {
  local CRON_EXPR="$1"

  (crontab -l 2>/dev/null; echo "$CRON_EXPR $SCRIPT_PATH") | crontab -
}

remove_cron() {
  crontab -l 2>/dev/null | grep -v "$SCRIPT_PATH" | crontab -
}

list_cron() {
  crontab -l 2>/dev/null | grep ai-task-master | while read -r line; do
    NAME=$(echo "$line" | grep -o "$SCRIPT_DIR/[^ ]*" | xargs basename | sed 's/.sh//')
    echo "$NAME"
  done || true
}

# --- trigger parsing ---
build_cron_expression() {
  TYPE=$(echo "$PAYLOAD" | jq -r '.triggers[0].type')

  if [ "$TYPE" = "once" ]; then
    # run in ~1 minute (cron limitation)
    MINUTE=$(date +%M)
    HOUR=$(date +%H)

    MINUTE=$((10#$MINUTE + 1))
    if [ "$MINUTE" -ge 60 ]; then
      MINUTE=0
      HOUR=$((10#$HOUR + 1))
    fi

    echo "$MINUTE $HOUR * * *"

  elif [ "$TYPE" = "daily" ]; then
    H=$(echo "$PAYLOAD" | jq -r '.triggers[0].hour')
    M=$(echo "$PAYLOAD" | jq -r '.triggers[0].minute')

    echo "$M $H * * *"

  elif [ "$TYPE" = "weekly" ]; then
    DAY=$(echo "$PAYLOAD" | jq -r '.triggers[0].day')
    H=$(echo "$PAYLOAD" | jq -r '.triggers[0].hour')
    M=$(echo "$PAYLOAD" | jq -r '.triggers[0].minute')

    case "$DAY" in
      sun) D=0 ;;
      mon) D=1 ;;
      tue) D=2 ;;
      wed) D=3 ;;
      thu) D=4 ;;
      fri) D=5 ;;
      sat) D=6 ;;
    esac

    echo "$M $H * * $D"

  elif [ "$TYPE" = "every" ]; then
    NUM=$(echo "$PAYLOAD" | jq -r '.triggers[0].interval')
    UNIT=$(echo "$PAYLOAD" | jq -r '.triggers[0].unit')

    if [ "$UNIT" = "m" ]; then
      echo "*/$NUM * * * *"
    elif [ "$UNIT" = "h" ]; then
      echo "0 */$NUM * * *"
    elif [ "$UNIT" = "d" ]; then
      echo "0 0 */$NUM * *"
    fi
  fi
}

# --- actions ---

if [ "$ACTION" = "create" ]; then
  remove_cron
  build_script

  CRON_EXPR=$(build_cron_expression)
  add_cron "$CRON_EXPR"

  echo "[ai-task-master] Created task: $TASK_NAME"

elif [ "$ACTION" = "delete" ]; then
  remove_cron
  rm -f "$SCRIPT_PATH"

  echo "[ai-task-master] Deleted task: $TASK_NAME"

elif [ "$ACTION" = "run" ]; then
  bash "$SCRIPT_PATH"

elif [ "$ACTION" = "list" ]; then
  list_cron

else
  echo "[ai-task-master] Unknown action: $ACTION"
  exit 1
fi