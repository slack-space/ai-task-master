#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function isElevated() {
  if (process.platform !== "win32") return true; 
  try {
    execSync("net session", { stdio: "ignore" });
    return true;
  } catch (e) {
    return false;
  }
}

function elevate() {
  if (isElevated()) return;
  console.log("Elevating privileges...");
  // Use PowerShell to start an elevated Node process running this exact script.
  const scriptPath = __filename;
  execSync(`powershell -Command "Start-Process node -ArgumentList '\\"${scriptPath}\\"' -Verb RunAs -Wait"`);
  process.exit(0);
}

// elevate immediately if needed
elevate();

// --- paths ---
const SKILL_DIR = __dirname;
const SKILL_JS = path.join(SKILL_DIR, "skill.js");
const PROJECT_ROOT = process.cwd();

// --- config ---
const REPORT = path.join(PROJECT_ROOT, "logs", "ai-task-master", "ai-task-master-test-report.txt");
const LOG_FILE = path.join(PROJECT_ROOT, "logs", "ai-task-master", "debug-log.txt").replace(/\\/g, "/");

const TASK_ONCE = "tm-test-once";
const TASK_DAILY = "tm-test-daily";
const TASK_REPEAT = "tm-test-repeat";

let PASS = 0;
let FAIL = 0;

function run(cmd) {
  try {
    return execSync(cmd, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"] // force capture
    }).toString();
  } catch (e) {
    return (e.stdout?.toString() || "") + (e.stderr?.toString() || "");
  }
}

function recordPass(msg) {
  console.log("[PASS]", msg);
  fs.appendFileSync(REPORT, `[PASS] ${msg}\n`);
  PASS++;
}

function recordFail(msg) {
  console.log("[FAIL]", msg);
  fs.appendFileSync(REPORT, `[FAIL] ${msg}\n`);
  FAIL++;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  fs.writeFileSync(REPORT, `=== AI Task Master Test Report ===\nStart: ${new Date()}\n\n`);

  // --- cleanup (single pass) ---
  run(`node "${SKILL_JS}" --delete ${TASK_ONCE}`);
  run(`node "${SKILL_JS}" --delete ${TASK_DAILY}`);
  run(`node "${SKILL_JS}" --delete ${TASK_REPEAT}`);

  // --- compute time ---
  const now = new Date();
  now.setMinutes(now.getMinutes() + 2);
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const timeStr = `${hh}:${mm}`;

  // --- prompts ---
  const PROMPT_ONCE = `echo AI_TASK_MASTER_TEST:ONCE >> ${LOG_FILE}`;
  const PROMPT_DAILY = `echo AI_TASK_MASTER_TEST:DAILY >> ${LOG_FILE}`;
  const PROMPT_REPEAT = `echo AI_TASK_MASTER_TEST:REPEATING >> ${LOG_FILE}`;

  // --- create ---
  run(`node "${SKILL_JS}" --task ${TASK_ONCE} --prompt "${PROMPT_ONCE}" --when "2m"`);
  run(`node "${SKILL_JS}" --task ${TASK_DAILY} --prompt "${PROMPT_DAILY}" --when "daily@${timeStr}"`);
  run(`node "${SKILL_JS}" --task ${TASK_REPEAT} --prompt "${PROMPT_REPEAT}" --when "every 4h"`);

  fs.appendFileSync(REPORT, "\nTasks created\n");

  // --- list check ---
  const list1 = run(`node "${SKILL_JS}" --list`);
  console.log("RAW LIST OUTPUT:\n", list1);
  fs.appendFileSync(REPORT, `\nList Output:\n${list1}\n`);

  list1.includes(TASK_ONCE) ? recordPass("Once task listed") : recordFail("Once task missing");
  list1.includes(TASK_DAILY) ? recordPass("Daily task listed") : recordFail("Daily task missing");
  list1.includes(TASK_REPEAT) ? recordPass("Repeating task listed") : recordFail("Repeating task missing");

  // --- immediate run test (no sudo) ---
  run(`node "${SKILL_JS}" --run ${TASK_REPEAT}`);

  // --- wait ---
  console.log("Waiting 2 minutes...");
  fs.appendFileSync(REPORT, "\nWaiting 2 minutes...\n");
  await sleep(125000); // 2 minutes + 5s buffer

  // --- log validation ---
  const logExists = fs.existsSync(LOG_FILE);
  const logContent = logExists ? fs.readFileSync(LOG_FILE, "utf8") : "";

  logContent.includes("AI_TASK_MASTER_TEST:ONCE")
    ? recordPass("Once task executed")
    : recordFail("Once task did not execute");

  logContent.includes("AI_TASK_MASTER_TEST:DAILY")
    ? recordPass("Daily task executed")
    : recordFail("Daily task did not execute");

  logContent.includes("AI_TASK_MASTER_TEST:REPEATING")
    ? recordPass("Repeating task executed")
    : recordFail("Repeating task did not execute");

  // --- post execution list ---
  const list2 = run(`node "${SKILL_JS}" --list`);
  fs.appendFileSync(REPORT, `\nList After Execution:\n${list2}\n`);

  !list2.includes(TASK_ONCE)
    ? recordPass("Once task removed")
    : recordFail("Once task still present");

  // --- delete repeating ---
  run(`node "${SKILL_JS}" --delete ${TASK_REPEAT}`);
  run(`node "${SKILL_JS}" --delete ${TASK_DAILY}`);

  const list3 = run(`node "${SKILL_JS}" --list`);

  !list3.includes(TASK_REPEAT)
    ? recordPass("Repeating task deleted")
    : recordFail("Repeating task not deleted");

  !list3.includes(TASK_DAILY)
    ? recordPass("Daily task deleted")
    : recordFail("Daily task not deleted");

  // --- summary ---
  fs.appendFileSync(REPORT, `\nSummary:\nPASS: ${PASS}\nFAIL: ${FAIL}\n`);
  fs.appendFileSync(REPORT, `\nEnd: ${new Date()}\n`);

  console.log(`\nDone. Report: ${REPORT}`);
})();
