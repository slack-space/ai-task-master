# AI Task Master

Schedule AI tasks like cron jobs — no always-on agent required.

---

## 🚀 Quick Start

Install the skill:

```bash
npx skills install slack-space/ai-task-master
```

Create a task that runs in 2 minutes:

```bash
node skill.js \
  --task "test" \
  --prompt "Append 'hello world' to ./test.txt" \
  --when "2m"
```

That’s it. The task will run even if your agent is not active.

---

## 🧠 How It Works

AI Task Master separates:

* **WHAT to run** → your prompt / workflow
* **WHEN to run** → schedule

It uses your OS scheduler (macOS / Windows) to execute tasks later.

---

## ⚙️ Configuration

Create `ai-task-master.config.yml` in your project root:

```yaml
action:
  command: claude

  flags:
    - "--name scheduled-automations"

  env:
    - ANTHROPIC_API_KEY

logs:
  path: logs/ai-task-master
```

---

## 🔌 Environment

Values are resolved in this order:

1. `.env` file (project override)
2. system environment

Example:

```ini
ANTHROPIC_API_KEY=your_key_here
```

---

## 📅 Scheduling

Examples:

```bash
--when "2m"                 # in 2 minutes
--when "14:30"              # today at 14:30
--when "daily:09:00"        # every day at 9am
--when "weekly:mon@08:00"   # every Monday at 8am
```

---

## 🧪 Common Commands

### Create a task

```bash
node skill.js --prompt "<instruction>" --when "<schedule>"
```

---

### List tasks

```bash
node skill.js --list
```

---

### Run immediately

```bash
node skill.js --run <task>
```

---

### Delete a task

```bash
node skill.js --delete <task>
```

---

## 🧩 Example (Real Use)

Run a workflow every morning:

```bash
node skill.js \
  --task "job-search" \
  --prompt "prose run projects/job-search/find-jobs.prose" \
  --when "daily:08:00"
```

---

## ⚠️ Prompt Rules

Tasks run without interaction.

Good:

```text
"Append a tip to ~/lifetips.md"
```

Bad:

```text
"Help me research something"
```

👉 Always write outputs to files.

---

## 🖥 Platform Support

* ✅ macOS (launchd)
* ✅ Windows (Task Scheduler)

---

## 🧱 Mental Model

```
Scheduler → Prompt → Files
```

---

## 🧠 Tip

If you can run it manually, you can schedule it.

---
