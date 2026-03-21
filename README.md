# Task Master

**Schedule AI workflows like cron jobs — no always-on agent required.**

---

## 🚀 Overview

Task Master lets you run Claude Code prompts **in the future or on a schedule** (even if clause isn't running at the time), turning one-off interactions into reliable, repeatable automation.

It works by combining:

* 🧠 Claude Code (execution)
* 📅 OS scheduler (timing)
* 📂 Filesystem (state + outputs)

No daemon. No long-running agent. No complex infrastructure.

---

## 🗣️ Use It Through Your Agent (No Commands Required)

You don’t need to run commands manually (but you could).

Just ask your agent:

* “Run this every morning”
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

Task Master:
* Runs only when needed
* Uses fresh context every time
* Stores results in files you control

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

```text id="r5onvp"
Scheduler → Workflow → Files → Reports
```

👉 A simple scheduled prompt can trigger complex, multi-step automation.

---

## ⚙️ Configuration

### `task-master.config.yml`

```yaml id="py4var"
action:
  command: claude

  flags:
    - "--name scheduled-automations"
    # - "--dangerously-skip-permissions"  # Enable only for trusted payloads
    - "--model coder"

  env:
    - ANTHROPIC_API_KEY
    - ANTHROPIC_BASE_URL
    - ANTHROPIC_AUTH_TOKEN
```

---

## 🔌 Environment Overrides (Ollama, etc.)

Environment variables are loaded from `.env` and selectively injected.

This enables:

* Local model usage (e.g., Ollama)
* API endpoint overrides
* Custom authentication setups

Example:

```env id="ze1o2g"
ANTHROPIC_BASE_URL=http://localhost:11434
ANTHROPIC_AUTH_TOKEN=ollama
ANTHROPIC_API_KEY=sk-ant-ollama-12345
```

---

## 🧪 Usage (Optional)

You can run commands manually if desired:

### Create a task

```bash id="tsc3ce"
node skill.js --task "test" --prompt "Append 'hello' to ./test.txt" --when "2m"
```

---

### List tasks

```bash id="oaod39"
node skill.js --action list
```

---

### Run a named task immediately

```bash id="zkh4a7"
node skill.js --action run --task "test"
```

---

### Delete a task

```bash id="ujco0x"
node skill.js --action delete --task "test"
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

```text id="k52ma0"
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

```bash id="adq7mc"
npx skills add <your-username>/task-master
```

---

## ⚡ Summary

Task Master turns Claude Code into a **scheduled automation engine**.

* Run workflows later
* Repeat tasks reliably
* Keep everything simple, visible, and file-based

👉 Build once. Run forever.
