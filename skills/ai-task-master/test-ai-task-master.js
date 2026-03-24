#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// --- paths ---
const SKILL_DIR = __dirname;
const SKILL_JS = path.join(SKILL_DIR, "skill.js");

// assume project root = cwd where user runs test
const PROJECT_ROOT = process.cwd();

// --- cli args ---
const userPrompt = process.argv.slice(2).join(" ").trim();

// --- config ---
const REPORT = path.join(PROJECT_ROOT, "logs", "ai-task-master", "ai-task-master-test-report.txt");
const TASK_ONCE = "tm-test-once";
const TASK_DAILY = "tm-test-daily";
const LOG_FILE = path.join(PROJECT_ROOT, "logs", "ai-task-master", "debug-log.txt");

// default prompt if none provided
const DEFAULT_PROMPT = `echo AI_TASK_MASTER_TEST >> ${LOG_FILE}`;
const TEST_PROMPT = userPrompt || DEFAULT_PROMPT;

let PASS = 0;
let FAIL = 0;

function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch (e) {
    return e.stdout?.toString() || "";
  }
}

function recordPass(msg) {
  console.log("[PASS]", msg);
  fs.appendFileSync(REPORT, `[PASS] ${msg}\n`);
  fs.appendFileSync(LOG_FILE, `[PASS] ${msg}\n`);
  PASS++;
}

function recordFail(msg) {
  console.log("[FAIL]", msg);
  fs.appendFileSync(REPORT, `[FAIL] ${msg}\n`);
  fs.appendFileSync(LOG_FILE, `[FAIL] ${msg}\n`);
  FAIL++;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  fs.writeFileSync(REPORT, `=== AI Task Master Test Report ===\nStart: ${new Date()}\n\n`);
  fs.appendFileSync(LOG_FILE, `=== AI Task Master Test ===\nStart: ${new Date()}\n\n`);

  // cleanup
  run(`node "${SKILL_JS}" --delete ${TASK_ONCE}`);
  run(`node "${SKILL_JS}" --delete ${TASK_DAILY}`);

  // compute time +2 minutes
  const now = new Date();
  now.setMinutes(now.getMinutes() + 2);
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const timeStr = `${hh}:${mm}`;

  // create tasks
  run(`node "${SKILL_JS}" --task ${TASK_ONCE} --prompt "${TEST_PROMPT}" --when "2m"`);
  run(`node "${SKILL_JS}" --task ${TASK_DAILY} --prompt "${TEST_PROMPT}" --when "daily@${timeStr}"`);

  fs.appendFileSync(REPORT, "\nTasks created\n");

  // list check
  const list1 = run(`node "${SKILL_JS}" --list`);
  fs.appendFileSync(REPORT, `\nList Output:\n${list1}\n`);

  list1.includes(TASK_ONCE) ? recordPass("Once task listed") : recordFail("Once task missing");
  list1.includes(TASK_DAILY) ? recordPass("Daily task listed") : recordFail("Daily task missing");

  // wait 3 minutes
  const waitMsg = "\nWaiting 3 minutes...\n";
  console.log(waitMsg.trim());
  fs.appendFileSync(REPORT, waitMsg);
  fs.appendFileSync(LOG_FILE, waitMsg);
  await sleep(180000);

  // check logs
  const logExists = fs.existsSync(LOG_FILE);
  const logContent = logExists ? fs.readFileSync(LOG_FILE, "utf8") : "";

  logContent.includes("AI_TASK_MASTER_TEST")
    ? recordPass("Tasks executed")
    : recordFail("Tasks did not execute");

  // verify once removed
  const list2 = run(`node "${SKILL_JS}" --list`);
  fs.appendFileSync(REPORT, `\nList After Execution:\n${list2}\n`);

  !list2.includes(TASK_ONCE)
    ? recordPass("Once task removed")
    : recordFail("Once task still present");

  // delete daily
  run(`node "${SKILL_JS}" --delete ${TASK_DAILY}`);

  const list3 = run(`node "${SKILL_JS}" --list`);

  !list3.includes(TASK_DAILY)
    ? recordPass("Daily task deleted")
    : recordFail("Daily task not deleted");

  // summary
  fs.appendFileSync(REPORT, `\nSummary:\nPASS: ${PASS}\nFAIL: ${FAIL}\n`);
  fs.appendFileSync(REPORT, `\nEnd: ${new Date()}\n`);

  console.log(`\nDone. Report: ${REPORT}`);
})();