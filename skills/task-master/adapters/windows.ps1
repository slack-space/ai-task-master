param(
    [string]$PayloadBase64
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ErrorActionPreference = "Stop"
# --- decode payload ---
$json = [System.Text.Encoding]::UTF8.GetString(
    [System.Convert]::FromBase64String($PayloadBase64)
)

$data = $json | ConvertFrom-Json

$taskName = $data.taskName
$projectRoot = $data.projectRoot
$exec = $data.execution

# --- fallback ---
if (-not $projectRoot) {
    $projectRoot = (Get-Location).Path
}

if ($data.action -eq "list") {
    $tasks = Get-ScheduledTask | Where-Object {
        $_.TaskPath -eq "\TaskMasterJobs\"
    }

    if (-not $tasks) {
        Write-Host "[TaskMaster] No tasks found."
        return
    }

    Write-Host "`n[TaskMaster] Scheduled Tasks:`n"

    foreach ($task in $tasks) {
        $triggerText = $task.Triggers | ForEach-Object {

            $time = if ($_.StartBoundary) {
                (Get-Date $_.StartBoundary).ToString("yyyy-MM-dd HH:mm")
            } else {
                ""
            }

            if ($_.DaysOfWeek) {
                "Weekly ($($_.DaysOfWeek -join ', ')) @ $time"
            }
            elseif ($_.DaysInterval -eq 1 -or $_.Repetition.Interval -eq "P1D") {
                "Daily @ $time"
            }
            else {
                "Once @ $time"
            }
        }

        Write-Host "Name:     $($task.TaskName)"
        Write-Host "State:    $($task.State)"
        Write-Host "Trigger:  $($triggerText -join ', ')"
        Write-Host ""
    }

    return
}
if ($data.action -eq "delete") {
    Unregister-ScheduledTask `
        -TaskName $data.taskName `
        -TaskPath "\TaskMasterJobs\" `
        -Confirm:$false

    Write-Host "Deleted task: $($data.taskName)"
    exit 0
}
if ($data.action -eq "run") {
    Start-ScheduledTask `
        -TaskName "\TaskMasterJobs\$($data.taskName)"

    Write-Host "Started task: $($data.taskName)"
    exit 0
}

# --- build env injection string ---
$envPrefix = ""

if ($data.env) {
    foreach ($key in $data.env.PSObject.Properties.Name) {
        $value = $data.env.$key.Replace("'", "''")
        $envPrefix += "`$env:$key='$value'; "
    }
}

# --- resolve command ---
if ($exec.type -eq "claude") {
    $cmdPath = (Get-Command claude -ErrorAction SilentlyContinue).Source
    if (-not $cmdPath) {
        throw "Claude CLI not found in PATH"
    }
} else {
    throw "Unsupported execution type: $($exec.type)"
}

# --- flags ---
$flags = ""
if ($exec.flags) {
    $flags = ($exec.flags -join " ")
}

# --- session (optional) ---
$sessionArg = ""
if ($exec.session) {
    $sessionArg = "--name $($exec.session)"
}

# --- prompt ---
$prompt = $exec.prompt.Replace('"','`"')

# --- build command ---
$cmd = @"
$envPrefix

& '$cmdPath' $sessionArg $flags -p "$prompt" 2>&1 |
Out-File -FilePath "$($exec.appendLog)" -Append -Encoding utf8
"@

# --- encode command ---
$bytes = [System.Text.Encoding]::Unicode.GetBytes($cmd)
$encoded = [Convert]::ToBase64String($bytes)

$arg = "-NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand $encoded"

# --- action ---
$Action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument $arg `
    -WorkingDirectory $projectRoot

# --- trigger mapping ---
$map = @{
    mon="Monday"; tue="Tuesday"; wed="Wednesday"
    thu="Thursday"; fri="Friday"; sat="Saturday"; sun="Sunday"
}

$inputTriggers = @($data.triggers)
$triggers = @()

foreach ($t in $inputTriggers) {

    if ($t.type -eq "once") {
        $time = [datetime]::Parse($t.time)

        $trigger = New-ScheduledTaskTrigger -Once -At $time

        # REQUIRED when using DeleteExpiredTaskAfter
        $trigger.EndBoundary = $time.AddMinutes(5).ToString("yyyy-MM-ddTHH:mm:ss")

        $triggers += $trigger
    }

    elseif ($t.type -eq "daily") {
        $time = (Get-Date).Date.AddHours([int]$t.hour).AddMinutes([int]$t.minute)
        $triggers += New-ScheduledTaskTrigger -Daily -At $time
    }

    elseif ($t.type -eq "weekly") {
        $day = $map[$t.day]

        if (-not $day) {
            throw "Invalid day: $($t.day)"
        }

        $time = (Get-Date).Date.AddHours([int]$t.hour).AddMinutes([int]$t.minute)

        $triggers += New-ScheduledTaskTrigger `
            -Weekly `
            -DaysOfWeek $day `
            -At $time
    }
}

# --- guard ---
if (@($triggers).Count -eq 0) {
    throw "No valid triggers were created"
}

$TriggerArray = @($triggers)

# --- settings ---
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -StartWhenAvailable

if (@($data.triggers).Count -eq 1 -and $data.triggers[0].type -eq "once") {
    $Settings.DeleteExpiredTaskAfter = "PT1M"
}

# --- principal ---
$Principal = New-ScheduledTaskPrincipal `
    -UserId $env:USERNAME `
    -LogonType Interactive `
    -RunLevel Highest

# --- register ---
Register-ScheduledTask `
    -TaskName "\TaskMasterJobs\$taskName" `
    -Action $Action `
    -Trigger $TriggerArray `
    -Principal $Principal `
    -Settings $Settings `
    -Force

Write-Host ""
Write-Host "[TaskMaster] Task Registered"
Write-Host ""
Write-Host "Name:"
Write-Host "  $($data.taskName)"
Write-Host ""
Write-Host "Schedule:"
$data.triggers | ConvertTo-Json -Depth 5 | Write-Host
Write-Host ""