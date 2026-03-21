---
name: task-master
description: "Schedule and run AI workflows with cron-style automation."
---

# Task Master

## Purpose

Schedule and manage autonomous task execution.

Use this to run prompts later or repeatedly without user interaction.
Task Master does not determine what to run — it only schedules it to run.

---

## Use When

* Task must run **later** or **on a schedule**
* Task should run **without user input**
* Task is **repeatable or automated**

---

## Do NOT Use When

* Immediate execution (run directly or with associated tools instead)
* Tasks requiring user interaction
* Unclear or incomplete instructions

---

## Command

```
node skill.js --task "<name>" --prompt "<instruction>" --when "<schedule>"
```

Optional:

```
--action <create|list|delete|run>
--session "<name>"
```

---

## Actions

* `create` (default) → schedule task
* `list` → show tasks
* `delete` → remove task
* `run` → execute now

---

## Schedule Syntax (`--when`)

### Relative

* `2m`, `3h`, `1d`
* `in 2h`

### Time (today)

* `14:30`
* `at 14:30`

### Date + time

* `2026-03-21@09:00`
* `on 2026-03-21@09:00`

### Daily

* `daily:09:00`

### Weekly

* `weekly:mon@08:00`
* `weekly:mon,wed,fri@15:30`

### Default

* No prefix → treated as `once`

---

## Prompt Rules

* Must be **self-contained**
* Must be **non-interactive**
* Must not require clarification

Good:

* `Append 'hello' to ./file.txt`

Bad:

* `Check something and let me know`

---

## 🧩 Workflow Integration (Required Behavior)

When scheduling tasks:

- If the request refers to a workflow, you MUST convert it into an explicit command before scheduling.
- Use the appropriate tool (e.g., `.prose`) to run workflows.

### Example

User:
> Run the job search every morning at 8

#### Correct

Command:
```bash
node skill.js --task "job-search" \
  --prompt "prose run projects/job-search/find-jobs.prose" \
  --when "daily:08:00"
```

#### Incorrect
```bash
node skill.js --task "job-search" \
  --prompt "run job search" \
  --when "daily:08:00"
```

### Rule
Never pass vague instructions like "run X"
Always convert workflows into executable commands before scheduling

---

## Behavior

* Runs **without user present**
* No confirmations or questions allowed
* Uses `.env` and `task-master.config.yml` automatically
* One-time tasks auto-delete after execution

---

## Heuristics

* If user says **"later" / "remind" / "every" / "schedule"** → use this skill
* If task repeats → use this skill
* If task runs once in future → use this skill
* Otherwise → do NOT use

---

## Output Strategy

* Prefer deterministic file writes or logs
* Avoid vague or conversational outputs
* Ensure results are persisted (files, logs, etc.)

---

## Summary

Schedules reliable, non-interactive execution of tasks in the future or on a recurring basis.
