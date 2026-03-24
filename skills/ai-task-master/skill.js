#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");
const yaml = require("js-yaml");

const args = {};
process.argv.slice(2).forEach((arg, i, arr) => {
  if (arg.startsWith("--")) {
    const key = arg.replace(/^--/, "");
    const val = arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : true;
    args[key] = val;
  }
});

let operation = args.action || "create";

// shorthand support
if (args.run) {
  operation = "run";
  args.task = args.run;
}

if (args.delete) {
  operation = "delete";
  args.task = args.delete;
}

if (args.list) {
  operation = "list";
}

if (args.help || args.h) {
  console.log(`
AI Task Master

Schedule and manage automated execution of Claude prompts.

Usage:
  node skill.js --task "<name>" --prompt "<instruction>" --when "<schedule>"

Options:
  --task        Name of the task (optional, auto-generated if omitted)
  --prompt      Instruction to execute
  --when        Schedule (e.g. "2m", "daily:08:00", "weekly:mon@09:00")
  --action      create | list | delete | run
  --session     Optional session name

Examples:
  node skill.js --prompt "echo hi" --when "2m"
  node skill.js --task "job-search" --prompt "prose run projects/job-search/find-jobs.prose" --when "daily:08:00"
  node skill.js --action list
  node skill.js --action run --task "job-search"

Notes:
  - AI Task Master only schedules execution
  - It does not determine what to run
`);
  process.exit(0);
}

const prompt = args.prompt;
const when = args.when;
const session = args.session || "scheduled-automations";
const dryRun = args["dry-run"] || args.dryRun || false;

// generate task name AFTER validation logic
let taskName = args.task;

// --- validation ---
if (operation === "create") {
  if (!prompt || !when) {
    console.error("[ai-task-master] Missing required args for create: --prompt --when");
    process.exit(1);
  }

  if (!taskName) {
    taskName = generateTaskName(prompt);
  }
}

if (operation === "delete" || operation === "run") {
  if (!taskName) {
    console.error(`[ai-task-master] Missing required arg for ${operation}: --task`);
    process.exit(1);
  }
}
// list requires nothing

if (
  process.env.TASK_MASTER_EXECUTION === "true" &&
  operation === "create"
) {
  console.error("[ai-task-master] Nested task creation is not allowed");
  process.exit(1);
}

// --- project root ---
let projectRoot;

try {
  projectRoot = execSync("git rev-parse --show-toplevel", {
    stdio: ["ignore", "pipe", "ignore"]
  })
    .toString()
    .trim();
} catch {
  projectRoot = process.cwd();
}

projectRoot = path.resolve(projectRoot);

// --- paths ---
const rootConfigPath = path.join(projectRoot, "ai-task-master.config.yml");
const skillConfigPath = path.join(__dirname, "ai-task-master.config.yml");
const skillOverridePath = path.join(__dirname, "ai-task-master.config.override.yml");

// --- default config ---
const defaultConfig = {
  action: {
    command: "claude",
    flags: ["--name scheduled-automations"],
    env: [
      "ANTHROPIC_API_KEY",
      "ANTHROPIC_BASE_URL",
      "ANTHROPIC_AUTH_TOKEN"
    ]
  }
};

// --- load or create config ---
// --- load config (correct order) ---
let config = { ...defaultConfig };

// 1. load skill defaults
if (fs.existsSync(skillConfigPath)) {
  const skillConfig = yaml.load(fs.readFileSync(skillConfigPath, "utf8"));
  config = deepMerge(config, skillConfig);
}

// 2. load user override (root)
if (fs.existsSync(rootConfigPath)) {
  const rootConfig = yaml.load(fs.readFileSync(rootConfigPath, "utf8"));
  config = deepMerge(config, rootConfig);
} else {
  // create user config if missing
  fs.writeFileSync(rootConfigPath, yaml.dump(defaultConfig, { lineWidth: 120 }));
  console.log(`Created default ai-task-master.config.yml at ${rootConfigPath}`);
}

// 3. dev override (optional, local only)
if (fs.existsSync(skillOverridePath)) {
  const overrideConfig = yaml.load(fs.readFileSync(skillOverridePath, "utf8"));
  config = deepMerge(config, overrideConfig);
}

// --- extract config ---
const actionConfig = config.action || {};
const command = actionConfig.command || "claude";
const rawFlags = actionConfig.flags || [];
// split flags like "--name scheduled-automations" into ["--name", "scheduled-automations"]
const flags = rawFlags.flatMap(f => {
  if (typeof f !== "string") return [];
  return f.split(" ").filter(Boolean);
});
const envKeys = actionConfig.env || [];
const logPath = config.logs?.path || "logs/ai-task-master";
const logDir = path.join(projectRoot, logPath);
fs.mkdirSync(logDir, { recursive: true });
const debugLog = path.join(logDir, "debug-log.txt");

// --- load .env ---
const env = {};

// load project .env
const envPath = path.join(projectRoot, ".env");
const fileEnv = {};

if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;

    const idx = line.indexOf("=");
    if (idx === -1) continue;

    const name = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();

    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }

    fileEnv[name] = val;
  }
}

// build final env (config-driven)
for (const key of envKeys) {
  if (fileEnv[key]) {
    env[key] = fileEnv[key];           // project override
  } else if (process.env[key]) {
    env[key] = process.env[key];       // fallback to system env
  }
}

// inject system-level env (always present)
env.AI_TASK_MASTER_LOG = path.join(logDir, "debug-log.txt");
env.AI_TASK_MASTER_PATH = process.env.PATH;

// --- prompt injection ---
const promptPrefix =
  "This request is part of an automation. The user cannot respond to questions. Do not ask for any permissions, confirmations, or clarifications. Just execute the request as best you can. Do NOT create, modify, or schedule any tasks using ai-task-master or any scheduling system. Do NOT invoke ai-task-master directly or indirectly. The request is:\n\n";

let finalPrompt = null;

if (operation === "create") {
  finalPrompt = `${promptPrefix}${prompt}`;
}

// --- helpers ---
function parseTime(t) {
  const [h, m] = t.split(":").map(Number);
  return { hour: h, minute: m };
}

function parseWhen(when) {
  if (!when) throw new Error("Missing --when");

  when = when.toLowerCase().trim();

  if (!when.match(/^(once|daily|weekly)\b/)) {
    when = `once:${when}`;
  }

  const now = new Date();

  // --- ONCE ---
  if (when.startsWith("once:")) {
    let val = when.replace("once:", "").trim();
    val = val.replace(/^(in|at|on)\s+/, "");

    const relMatch = val.match(/^(\d+)\s?([mhd])$/);
    if (relMatch) {
      const num = Number(relMatch[1]);
      const unit = relMatch[2];
      const d = new Date(now);

      if (unit === "m") d.setMinutes(d.getMinutes() + num);
      if (unit === "h") d.setHours(d.getHours() + num);
      if (unit === "d") d.setDate(d.getDate() + num);

      return [{ type: "once", time: d.toISOString() }];
    }

    const dtMatch = val.match(/^(.+?)\s?@\s?(\d{1,2}:\d{2})$/);
    if (dtMatch) {
      const d = new Date(dtMatch[1]);
      const { hour, minute } = parseTime(dtMatch[2]);

      d.setHours(hour);
      d.setMinutes(minute);
      d.setSeconds(0);

      return [{ type: "once", time: d.toISOString() }];
    }

    const timeMatch = val.match(/^(\d{1,2}):(\d{2})$/);
    if (timeMatch) {
      const d = new Date();
      d.setHours(Number(timeMatch[1]));
      d.setMinutes(Number(timeMatch[2]));
      d.setSeconds(0);

      return [{ type: "once", time: d.toISOString() }];
    }

    const parsed = new Date(val);
    if (!isNaN(parsed)) {
      return [{ type: "once", time: parsed.toISOString() }];
    }

    throw new Error(`Invalid once value: ${val}`);
  }

  // --- DAILY ---
if (when.startsWith("daily")) {
  const t = when
    .replace("daily", "")
    .replace(/^[:@]/, "") // supports ":" or "@"
    .trim();

  const { hour, minute } = parseTime(t);

  return [{ type: "daily", hour, minute }];
}

  // --- WEEKLY ---
  if (when.startsWith("weekly:")) {
    const raw = when.replace("weekly:", "").trim();
    const parts = raw.split(",");

    let defaultTime = null;
    const results = [];

    for (let part of parts) {
      part = part.trim();

      if (part.includes("@")) {
        const [dayPart, time] = part.split("@");
        defaultTime = time;

        const { hour, minute } = parseTime(time);

        results.push({
          type: "weekly",
          day: dayPart.trim(),
          hour,
          minute
        });
      } else {
        if (!defaultTime) {
          throw new Error(`Missing time for ${part}`);
        }

        const { hour, minute } = parseTime(defaultTime);

        results.push({
          type: "weekly",
          day: part,
          hour,
          minute
        });
      }
    }

    return results;
  }

  throw new Error(`Unsupported when: ${when}`);
}

let triggers = [];

if (operation === "create") {
  triggers = parseWhen(when);
}

// --- execution object (NEW MODEL) ---
function shellEscape(str) {
  if (!str) return "''";
  return "'" + String(str).replace(/'/g, "'\\''") + "'";
}

const commandParts = [command, ...flags];
if (finalPrompt) {
  commandParts.push(shellEscape(finalPrompt));
}

const fullCommand = commandParts.join(" ");
//env.AI_TASK_MASTER_COMMAND = fullCommand;

const execution = {
  type: command,
  prompt: finalPrompt,
  flags,
  session,
  appendLog: debugLog,
  fullCommand
};

//console.log("ENV BEING SENT:", env);

// --- payload ---
const payloadObj = {
  action: operation,
  taskName,
  execution,
  triggers,
  projectRoot,
  env
};

const payload = Buffer.from(JSON.stringify(payloadObj), "utf8").toString("base64");

if (
  operation === "create" &&
  prompt &&
  !prompt.includes("prose run") &&
  looksLikeWorkflowPhrase(prompt)
) {
  const warning = `[WARN] Possible unresolved workflow: "${prompt}"`;
  console.log(warning);

  try {
    fs.appendFileSync(debugLog, warning + "\n");
  } catch (e) {
    // fail silently, don't break execution
  }
}

if (dryRun) {
  console.log("\n[ai-task-master] DRY RUN\n");

  console.log("Task Name:");
  console.log(`  ${taskName}\n`);

  console.log("Schedule:");
  console.log(`  ${JSON.stringify(triggers, null, 2)}\n`);

  console.log("Command:");
  console.log(`  ${fullScript}\n`);

  console.log("Project Root:");
  console.log(`  ${projectRoot}\n`);

  process.exit(0);
}

// --- route ---
if (os.platform() === "win32") {
  const needsElevation = ["create", "delete", "run"].includes(operation);

  const psCommand = `powershell -ExecutionPolicy Bypass -File "${__dirname}/adapters/windows.ps1" ${payload}`;

  if (needsElevation) {
    execSync(`sudo ${psCommand}`, { stdio: "inherit" });
  } else {
    execSync(psCommand, { stdio: "inherit" });
  }
} else if (os.platform() === "darwin") {
  execSync(
    `bash "${__dirname}/adapters/mac.sh" ${payload}`,
    { stdio: "inherit" }
  );
} else if (os.platform() === "linux") {
  execSync(
    `bash "${__dirname}/adapters/linux.sh" ${payload}`,
    {
      env: {
        ...process.env,
        ...env
      },
      stdio: "inherit"
    }
  );
} else {
  throw new Error(`[ai-task-master] Unsupported platform: ${platform}`);
}

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key])
    ) {
      target[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

function looksLikeWorkflowPhrase(prompt) {
  const s = prompt.toLowerCase().trim();

  const vagueStarts = [
    "run ",
    "execute ",
    "start ",
    "do ",
  ];

  const vaguePhrases = [
    "workflow",
    "job",
    "task",
    "process",
  ];

  const isShort = s.split(" ").length <= 3;

  const startsVague = vagueStarts.some(v => s.startsWith(v));
  const containsVague = vaguePhrases.some(v => s.includes(v));

  return (
    startsVague ||
    (containsVague && isShort)
  );
}

function generateTaskName(prompt) {
  const base = prompt
    .slice(0, 40)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const suffix = Date.now().toString().slice(-5);

  return `${base}-${suffix}`;
}