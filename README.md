# AI Task Master

**Schedule AI workflows like cron jobs — no always-on agent required.**

---

## 🚀 Overview

AI Task Master lets you run AI prompts **in the future or on a schedule**, even when no agent is running.

It turns AI into a **reliable automation engine**.

* Run tasks later
* Repeat workflows automatically
* Persist results to files

**📦 Install with:**
```bash
npx skills install slack-space/ai-task-master
```

---

## 🧠 Why This Exists

Most AI agents:

* need to stay running
* accumulate messy context
* are hard to debug

AI Task Master flips that:

* runs only when needed
* uses fresh context every time
* writes outputs to files you control

👉 Think: **Cron + AI**

---

## ⚙️ How It Works

```text
Agent → Task Master Skill → OS Scheduler → Scheduled AI process -> Files
```

* 🧠 Execution: Claude (default)
* 📅 Scheduling: macOS + Windows + Linux
* 📂 Output: Filesystem

No daemon. No background service. No state drift.

---

## 🔥 Example

Run an AI powered workflow every morning:

```bash
node skill.js \
  --task "job-search" \
  --prompt "prose run projects/job-search/find-jobs.prose" \
  --when "daily:08:00"
```

---

## 🧩 Works Great With `.prose`

* `.prose` defines AI workflows
* AI Task Master schedules them

---

## 🗣️ Use It Through Your Agent

You don’t need to run commands manually.

Just say:

* “Run this every morning”
* “Schedule this for tonight”
* “Repeat this every Monday”

Your agent will handle the rest.

---

## 📦 Install

```bash
npx skills install slack-space/ai-task-master
```

---

## 🖥 Platform Support

* ✅ macOS (launchd)
* ✅ Windows (Task Scheduler)
* ✅ Linux (crontab)

---

## 📚 Documentation

👉 See the skill README for usage and commands:
`skills/ai-task-master/README.md`

---

## 🤝 Contributing

PRs welcome. Keep changes focused and well-described.

---
