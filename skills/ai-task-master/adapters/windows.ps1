param(
    [string]$payloadBase64
)

# --- helpers ------------------------------------------------------------

function Decode-Payload {
    param ($b64)
    $json = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($b64))
    return $json | ConvertFrom-Json
}

function Log-Debug {
    param ($msg)
    if ($GLOBAL:LOG_FILE) {
        $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        Add-Content -Path $GLOBAL:LOG_FILE -Value "$ts [DEBUG] $msg" -ErrorAction SilentlyContinue
    }
}

function Ensure-Dir {
    param ($path)
    if (!(Test-Path $path)) {
        New-Item -ItemType Directory -Force -Path $path | Out-Null
    }
}

function Get-ScriptPath {
    param ($taskName)
    Log-Debug "Getting script path for task: $taskName"
    return Join-Path $GLOBAL:SCRIPT_DIR "$taskName.ps1"
}

function Build-TaskScript {
    param (
        $taskName,
        $exec,
        $projectRoot,
        $scriptPath,
        $isOnce,
        $envVars
    )

    Log-Debug "INSIDE Build-TaskScript exec param:"
    Log-Debug ($exec | ConvertTo-Json -Depth 5)

    $cmd = $exec.fullCommand
    if (-not $cmd) {
        throw "No command provided in execution.fullCommand"
    }
    
    # Use absolute log path. Ensure the context handles this correctly
    $logFile = [System.IO.Path]::GetFullPath($exec.appendLog)

    $envBlock = ""
    if ($envVars) {
        foreach ($prop in $envVars.psobject.properties) {
            $name = $prop.Name
            $val = $prop.Value
            $envBlock += "`$env:$name = `"$val`"`n"
        }
    }

    # --- cleanup block ONLY for once tasks ---
    $cleanup = ""
    if ($isOnce) {
        $cleanup = @"
Unregister-ScheduledTask -TaskName "$taskName" -TaskPath "\TaskMasterJobs\" -Confirm:`$false -ErrorAction SilentlyContinue
Remove-Item "$scriptPath" -Force -ErrorAction SilentlyContinue
"@
    }

    # --- build script ---
    $content = @"
$envBlock
Set-Location "$projectRoot"

try {
    `$output = Invoke-Expression "$cmd" 2>&1
    Add-Content -Path "$logFile" -Value `$output -ErrorAction SilentlyContinue
}
catch {
    Add-Content -Path "$logFile" -Value "Command Execution Failed. Error: `$(`$_.Exception.Message)" -ErrorAction SilentlyContinue
}
finally {
$cleanup
}
"@

    # --- ensure directory exists ---
    $dir = Split-Path $scriptPath
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    # --- write script ---
    Set-Content -Path $scriptPath -Value $content -Encoding UTF8 -ErrorAction Stop

    return $scriptPath
}

function Register-Task {
    param ($taskName, $scriptPath, $triggers, $projectRoot)

    Log-Debug "[Register-Task()]Registering task: $taskName with script: $scriptPath"
    
    # We use Start-Process inside the scheduled task to ensure script runs correctly
    $action = New-ScheduledTaskAction `
        -Execute "powershell.exe" `
        -Argument "-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" `
        -WorkingDirectory $projectRoot

    $triggerList = @()

    foreach ($t in $triggers) {
        if ($t.type -eq "once") {
            $time = [datetime]::Parse($t.time)
            $triggerList += New-ScheduledTaskTrigger -Once -At $time
        }
        elseif ($t.type -eq "daily") {
            # Just an example, ideally use the parse output for hour/minute
            $hour = if ($t.hour) { $t.hour } else { 0 }
            $minute = if ($t.minute) { $t.minute } else { 0 }
            # If the date is passed directly as parsed by skill.js
            $today = Get-Date -Hour $hour -Minute $minute -Second 0
            if ($today -lt (Get-Date)) {
                $today = $today.AddDays(1)
            }
            $triggerList += New-ScheduledTaskTrigger -Daily -At $today
        }
        elseif ($t.type -eq "weekly") {
            $hour = if ($t.hour) { $t.hour } else { 0 }
            $minute = if ($t.minute) { $t.minute } else { 0 }
            $today = Get-Date -Hour $hour -Minute $minute -Second 0
            if ($today -lt (Get-Date)) {
                $today = $today.AddDays(1)
            }
            
            $dayMap = @{
                "sun" = "Sunday"; "mon" = "Monday"; "tue" = "Tuesday"; "wed" = "Wednesday";
                "thu" = "Thursday"; "fri" = "Friday"; "sat" = "Saturday"
            }
            $psDay = $dayMap[$t.day]
            if ($psDay) {
                $triggerList += New-ScheduledTaskTrigger -Weekly -DaysOfWeek $psDay -At $today
            }
        }
        elseif ($t.type -eq "every") {
            $today = Get-Date
            $interval = $null
            
            if ($t.unit -eq "m") { $interval = New-TimeSpan -Minutes $t.interval }
            elseif ($t.unit -eq "h") { $interval = New-TimeSpan -Hours $t.interval }
            elseif ($t.unit -eq "d") { $interval = New-TimeSpan -Days $t.interval }
            
            if ($interval) {
                $triggerList += New-ScheduledTaskTrigger -Once -At $today -RepetitionInterval $interval
            }
        }
    }

    if ($triggerList.Count -eq 0) {
        Log-Debug "No valid triggers found!"
        throw "Failed to create triggers"
    }

    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType S4U -RunLevel Highest
    $description = "AI Task Master: $scriptPath"

    Register-ScheduledTask `
        -TaskName $taskName `
        -TaskPath "\TaskMasterJobs\" `
        -Action $action `
        -Trigger $triggerList `
        -Settings $settings `
        -Principal $principal `
        -Description $description `
        -Force | Out-Null

    Log-Debug "Task Registered: $taskName"
}

function Delete-Task {
    param ($taskName)

    Unregister-ScheduledTask `
        -TaskName $taskName `
        -TaskPath "\TaskMasterJobs\" `
        -Confirm:$false `
        -ErrorAction SilentlyContinue

    Log-Debug "Deleted task: $taskName"

    $scriptPath = Get-ScriptPath $taskName
    if (Test-Path $scriptPath) {
        Remove-Item $scriptPath -Force -ErrorAction SilentlyContinue
        Log-Debug "Deleted script: $scriptPath"
    }
}

function List-Tasks {
    $tasks = Get-ScheduledTask -TaskPath "\TaskMasterJobs\" -ErrorAction SilentlyContinue
    if (-not $tasks) { return }

    foreach ($task in $tasks) {
        Write-Output $task.TaskName
    }
}

function Run-Task {
    param ($taskName)
    Start-ScheduledTask -TaskName $taskName -TaskPath "\TaskMasterJobs\" -ErrorAction SilentlyContinue
    Log-Debug "Started task: $taskName"
}

# --- init ------------------------------------------------------------

$data = Decode-Payload $payloadBase64

# Only attempt folder/log setup if execution object exists
if ($data.execution -and $data.execution.appendLog) {
    # Resolve against the project root if it's relative, otherwise default string interpretation
    $GLOBAL:LOG_FILE = [System.IO.Path]::GetFullPath($data.execution.appendLog)
    Ensure-Dir (Split-Path $GLOBAL:LOG_FILE)
}

$GLOBAL:SCRIPT_DIR = Join-Path $HOME ".ai-task-master\scripts"
Ensure-Dir $GLOBAL:SCRIPT_DIR

Log-Debug "WINDOWS ADAPTER V2 LOADED"
Log-Debug "ACTION: $($data.action)"
Log-Debug "TASK: $($data.taskName)"

# --- routing ------------------------------------------------------------

if ($data.action -eq "list") {
    List-Tasks
    return
}
elseif ($data.action -eq "delete") {
    Delete-Task $data.taskName
    return
}
elseif ($data.action -eq "run") {
    Run-Task $data.taskName
    return
}
elseif ($data.action -eq "create") {
    Log-Debug "Created task: $($data.taskName)"
    $isOnce = ($data.triggers[0].type -eq "once")
    
    try {
        $targetScriptPath = Get-ScriptPath $data.taskName
        $scriptPath = Build-TaskScript `
            -taskName $data.taskName `
            -exec $data.execution `
            -projectRoot $data.projectRoot `
            -scriptPath $targetScriptPath `
            -isOnce $isOnce `
            -envVars $data.env
            
        Log-Debug "Built scriptPath: $scriptPath"
    }
    catch {
        Log-Debug "BUILD SCRIPT FAILED: $($_.Exception.Message)"
        return
    }

    try {
        Register-Task `
            -taskName $data.taskName `
            -scriptPath $scriptPath `
            -triggers $data.triggers `
            -projectRoot $data.projectRoot
    }
    catch {
        Log-Debug "REGISTER TASK FAILED: $($_.Exception.Message)"
    }
    return
}

Log-Debug "Unknown action: $($data.action)"
