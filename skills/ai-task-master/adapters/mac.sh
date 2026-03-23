#!/bin/bash

set -e

PAYLOAD_BASE64="$1"
PAYLOAD=$(echo "$PAYLOAD_BASE64" | base64 --decode)

# --- deps ---
if ! command -v jq &> /dev/null; then
  echo "[ai-task-master] jq is required but not installed."
  exit 1
fi

# --- parse payload ---
ACTION=$(echo "$PAYLOAD" | jq -r '.action')
TASK_NAME=$(echo "$PAYLOAD" | jq -r '.taskName')
PROJECT_ROOT=$(echo "$PAYLOAD" | jq -r '.projectRoot')

if [[ "$TASK_NAME" == com.ai-task-master.* ]]; then
  LABEL="$TASK_NAME"
  TASK_NAME="${TASK_NAME#com.ai-task-master.}"
else
  LABEL="com.ai-task-master.$TASK_NAME"
fi

LAUNCH_DIR="$HOME/Library/LaunchAgents"
SCRIPT_DIR="$HOME/.ai-task-master/scripts"

PLIST_PATH="$LAUNCH_DIR/$LABEL.plist"
SCRIPT_PATH="$SCRIPT_DIR/$TASK_NAME.sh"

mkdir -p "$LAUNCH_DIR"
mkdir -p "$SCRIPT_DIR"

# --- helpers ---
weekday_to_int() {
  case "$1" in
    sun) echo 1 ;;
    mon) echo 2 ;;
    tue) echo 3 ;;
    wed) echo 4 ;;
    thu) echo 5 ;;
    fri) echo 6 ;;
    sat) echo 7 ;;
    *) echo 0 ;;
  esac
}

build_calendar_interval() {
  echo "$PAYLOAD" | jq -c '.triggers[]' | while read -r trig; do
    TYPE=$(echo "$trig" | jq -r '.type')

    if [ "$TYPE" = "daily" ]; then
      H=$(echo "$trig" | jq -r '.hour')
      MIN=$(echo "$trig" | jq -r '.minute')

      cat <<EOF
    <dict>
      <key>Hour</key><integer>$H</integer>
      <key>Minute</key><integer>$MIN</integer>
    </dict>
EOF

    elif [ "$TYPE" = "weekly" ]; then
      DAY=$(echo "$trig" | jq -r '.day')
      H=$(echo "$trig" | jq -r '.hour')
      MIN=$(echo "$trig" | jq -r '.minute')

      WD=$(weekday_to_int "$DAY")

      cat <<EOF
    <dict>
      <key>Weekday</key><integer>$WD</integer>
      <key>Hour</key><integer>$H</integer>
      <key>Minute</key><integer>$MIN</integer>
    </dict>
EOF
    fi
  done
}

# --- build script ---
build_script() {
  echo "[ai-task-master] Creating script: $SCRIPT_PATH"

  EXEC=$(echo "$PAYLOAD" | jq -r '.execution.type')
  EXEC_PATH=$(command -v "$EXEC")

  if [ -z "$EXEC_PATH" ]; then
    echo "[ai-task-master] Command not found: $EXEC"
    exit 1
  fi
  CURRENT_PATH="$PATH"
  PROMPT=$(echo "$PAYLOAD" | jq -r '.execution.prompt')
  FLAGS=$(echo "$PAYLOAD" | jq -r '.execution.flags[]?' | tr '\n' ' ')
  LOG_FILE=$(echo "$PAYLOAD" | jq -r '.execution.appendLog')
  ENV_EXPORTS=$(echo "$PAYLOAD" | jq -r '.env | to_entries[] | "export \(.key)=\(.value|@sh)"')

  cat > "$SCRIPT_PATH" <<EOF
#!/bin/bash

cd "$PROJECT_ROOT"

export TASK_MASTER_EXECUTION=true
export PATH="$CURRENT_PATH"
LABEL="$LABEL"
PLIST_PATH="$PLIST_PATH"

# --- env injection ---
$ENV_EXPORTS

# --- execution ---
PROMPT_FILE="$SCRIPT_PATH.prompt.txt"

mkdir -p "\$(dirname "$LOG_FILE")"

printf "%s\n" "$PROMPT" > "\$PROMPT_FILE"

$EXEC_PATH $FLAGS < "\$PROMPT_FILE" >> "$LOG_FILE" 2>&1

# --- self delete (run once only) ---
launchctl bootout gui/\$(id -u)/$LABEL 2>/dev/null || true
rm -f "$PLIST_PATH"
rm -f "$0"
EOF

  chmod +x "$SCRIPT_PATH"
}

# --- build plist ---
build_plist() {
  echo "[ai-task-master] Creating plist: $PLIST_PATH"

  TYPE=$(echo "$PAYLOAD" | jq -r '.triggers[0].type')

if [ "$TYPE" = "once" ]; then

  # force a simple delay (launchd reliability)
  DELAY=60

  cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN">
<plist version="1.0">
<dict>

  <key>Label</key>
  <string>$LABEL</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$SCRIPT_PATH</string>
  </array>

  <key>StartInterval</key>
  <integer>$DELAY</integer>

</dict>
</plist>
EOF

  else
    CAL=$(build_calendar_interval)

    cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN">
<plist version="1.0">
<dict>

  <key>Label</key>
  <string>$LABEL</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$SCRIPT_PATH</string>
  </array>

  <key>StartCalendarInterval</key>
  <array>
$CAL
  </array>

</dict>
</plist>
EOF
  fi
}

# --- actions ---

if [ "$ACTION" = "create" ]; then
  launchctl bootout gui/$(id -u) "$PLIST_PATH" 2>/dev/null || true

  build_script
  build_plist

  launchctl bootstrap gui/$(id -u) "$PLIST_PATH"

  echo "[ai-task-master] Created task: $TASK_NAME"

elif [ "$ACTION" = "delete" ]; then
  launchctl bootout gui/$(id -u) "$PLIST_PATH" 2>/dev/null || true

  rm -f "$PLIST_PATH"
  rm -f "$SCRIPT_PATH"

  echo "[ai-task-master] Deleted task: $TASK_NAME"

elif [ "$ACTION" = "run" ]; then
  launchctl kickstart -k gui/$(id -u)/$LABEL

elif [ "$ACTION" = "list" ]; then
  launchctl list | grep ai-task-master | while read -r line; do
    NAME=$(echo "$line" | awk '{print $3}')
    CLEAN=${NAME#com.ai-task-master.}
    echo "$CLEAN"
  done || true

else
  echo "[ai-task-master] Unknown action: $ACTION"
  exit 1
fi