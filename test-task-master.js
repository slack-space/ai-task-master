#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const REPORT = "taskmaster-test-report.txt";
const TASK_ONCE = "tm-test-once";
const TASK_DAILY = "tm-test-daily";
const LOG_FILE = path.join("logs", "ai-task-master", "debug-log.txt");

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
  fs.writeFileSync(REPORT, `=== TaskMaster Test Report ===\nStart: ${new Date()}\n\n`);

  // cleanup
  run(`node skills/ai-task-master/skill.js --delete ${TASK_ONCE}`);
  run(`node skills/ai-task-master/skill.js --delete ${TASK_DAILY}`);

  // compute time +2 minutes
  const now = new Date();
  now.setMinutes(now.getMinutes() + 2);
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const timeStr = `${hh}:${mm}`;

  // create tasks
  run(`node skills/ai-task-master/skill.js --task ${TASK_ONCE} --prompt "echo ONCE_TASK_RAN >> ${LOG_FILE}" --when "2m"`);
  run(`node skills/ai-task-master/skill.js --task ${TASK_DAILY} --prompt "echo DAILY_TASK_RAN >> ${LOG_FILE}" --when "daily@${timeStr}"`);

  fs.appendFileSync(REPORT, "\nTasks created\n");

  // list check
  const list1 = run(`node skills/ai-task-master/skill.js --list`);
  fs.appendFileSync(REPORT, `\nList Output:\n${list1}\n`);

  list1.includes(TASK_ONCE) ? recordPass("Once task listed") : recordFail("Once task missing");
  list1.includes(TASK_DAILY) ? recordPass("Daily task listed") : recordFail("Daily task missing");

  // wait 3 minutes
  const waitMsg = "\nWaiting 3 minutes...\n";
  console.log(waitMsg.trim());
  fs.appendFileSync(REPORT, waitMsg);
  await sleep(180000);

  // check logs
  const logExists = fs.existsSync(LOG_FILE);
  const logContent = logExists ? fs.readFileSync(LOG_FILE, "utf8") : "";

  logContent.includes("ONCE_TASK_RAN")
    ? recordPass("Once task executed")
    : recordFail("Once task did not execute");

  logContent.includes("DAILY_TASK_RAN")
    ? recordPass("Daily task executed")
    : recordFail("Daily task did not execute");

  // verify once removed
  const list2 = run(`node skills/ai-task-master/skill.js --list`);
  fs.appendFileSync(REPORT, `\nList After Execution:\n${list2}\n`);

  !list2.includes(TASK_ONCE)
    ? recordPass("Once task removed")
    : recordFail("Once task still present");

  // delete daily
  run(`node skills/ai-task-master/skill.js --delete ${TASK_DAILY}`);

  const list3 = run(`node skills/ai-task-master/skill.js --list`);

  !list3.includes(TASK_DAILY)
    ? recordPass("Daily task deleted")
    : recordFail("Daily task not deleted");

  // summary
  fs.appendFileSync(REPORT, `\nSummary:\nPASS: ${PASS}\nFAIL: ${FAIL}\n`);
  fs.appendFileSync(REPORT, `\nEnd: ${new Date()}\n`);

  console.log(`\nDone. Report: ${REPORT}`);
})();