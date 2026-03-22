# Task Master (skills/task-master)

**Schedule AI workflows like cron jobs — no always-on agent required.**

## 🚀 Overview

Task Master lets you run AI prompts **in the future or on a schedule** (even if the agent isn't running at the time), creating reliable, repeatable AI automation.

Task Master turns Claude Code into a **scheduled AI automation engine**.

* Run AI workflows later
* Repeat AI tasks reliably

It works by combining:

* 🧠 **Execution** Claude Code _(default)_
* 📅 **Timing** OS scheduler _(Mac and Windows11)_
* 📂 **Durable state and outputs** - Filesystem / Agent Workspace

No daemon. No long-running agent. No complex infrastructure.

## 🧑🏻‍💻 Install:

### 
```bash
  npx skills install slack-space/task-master
```

---

## 🗣️ Use It Through Your Agent (No Commands Required)

You don’t need to run commands manually (but you could, you do you).

Just ask your agent:

* “Run my job search routine every morning”
* “Schedule this workflow for tonight”
* “Repeat this task every Monday at 9”

👉 The agent will automatically use this skill to create and manage scheduled tasks for you.

---

## ✨ Key Features

* ⏱ **Schedule prompts**
  * Run once, later, or on recurring intervals

* 🔁 **Automate workflows**
  * Daily, weekly, or custom schedules

* 📂 **File-based outputs**
  * Deterministic, inspectable results

* 🔌 **Config-driven execution**
  * Flags + environment controlled via config

* 🧩 **Composable with other tools**
  * Especially powerful with `.prose` workflows

* ⚡ **Stateless execution**
  * Clean runs every time (no context drift)

---

## 🧠 Benifits

Traditional AI agents:
* Require always-on processes
* Accumulate messy context
* Are harder to debug

Task Master tasks:
* Runs only when needed
* Uses fresh context every time
* Can stores results in files you control

👉 Think: **Cron + AI**

---

## 🔥 Example

Run a job search workflow every morning:

```bash id="ckxxsj"
node skill.js \
  --task "job-search" \
  --prompt "prose run projects/job-search/find-jobs.prose" \
  --when "daily:08:00"
```

---

## 🧩 Works Great With `.prose`

Task Master shines when paired with structured workflows:

* `.prose` defines multi-step logic
* Task Master schedules execution

```text
Scheduler → Workflow → Files + Reports
```

👉 A simple scheduled prompt can trigger complex, multi-step automation.

---

## ⚙️ Configuration

### `task-master.config.yml`

```yaml
action:
  command: claude

  flags:
    - "--name scheduled-automations"
    # Non-default flags:
    #- "--dangerously-skip-permissions" # Enable only for trusted payloads.
    #- "--model coder" # for ollama override, specify your model

  env: # Ensure these are in your environment variables or a .env file:
    - ANTHROPIC_API_KEY
    # Non-default env (ollama override):
    #- ANTHROPIC_BASE_URL
    #- ANTHROPIC_AUTH_TOKEN

logs:
  path: logs/task-master
```

---

## 🔌 Environment Overrides (Ollama, etc.)

Environment variables are loaded from `.env` and selectively injected.

This enables:

* Local model usage (e.g., Ollama)
* API endpoint overrides
* Custom authentication setups

Example:

```ini
# **** TASK MASTER CONFIGURATION ****
# ANTHROPIC_API_KEY is required. (If not already persistent in your environment.)
ANTHROPIC_API_KEY='sk-ant-ollama-12345'
#   - FOR OLLAMA: Set ANTHROPIC_API_KEY to any value. It will not be used, but must be present to satisfy claude's login check. 

# FOR OLLAMA: override ClaudeCode's base URL and provide a dummy auth token to point to your Ollama instance
ANTHROPIC_BASE_URL='http://localhost:11434'
ANTHROPIC_AUTH_TOKEN='ollama'

# FOR OLLAMA: Also set model in task-master.config.yml to the name of your local model as listed in `ollama list`
```

---

## 🧪 Usage (Optional)

You can run commands manually if desired:

### Create a task

```bash
node skill.js --task "test" --prompt "Append 'hello' to ./test.txt" --when "2m"
```

---

### List tasks

```bash
node skill.js --action list
```

---

### Run a named task immediately

```bash id="zkh4a7"
node skill.js --action run --task "test-task-name"
```

---

### Delete a task

```bash id="ujco0x"
node skill.js --action delete --task "test-task-name"
```

---

## 📅 Scheduling Syntax

* `2m`, `3h`, `1d`
* `14:30`
* `2026-03-21@09:00`
* `daily:09:00`
* `weekly:mon,wed,fri@15:30`

Defaults to `once` if no prefix is provided.

---

## 🖥 Platform Notes

### Windows

* Requires **Windows 11 `sudo`** to be enabled
* Task creation/deletion requires **UAC approval**
* Tasks run via Task Scheduler under `TaskMasterJobs`

### macOS

* 🚧 Adapter coming soon
* Planned support via `launchd`

---

## 🧱 Architecture

```text
Claude → Task Master → OS Scheduler → Filesystem
```

* No persistent agent
* No background process
* Files = source of truth

---

## 🤝 Contributing

Contributions are welcome!

* Fork the repo
* Create a feature branch
* Submit a PR

Please follow standard practices:

* Clear commit messages
* Focused changes
* No breaking behavior without discussion

---

## 📦 Installation

```bash
npx skills add slack-space/task-master
```

---
