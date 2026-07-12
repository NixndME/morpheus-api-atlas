/* ===== Missions data (Tier 1) — schema:
   step: {stage, safety:[cls,label], title, plain, eps:[[M,path]], curl, resp?, note?,
          capture?/capture2?:{v,ph,hint}, run?:{m,p,body?,cap?:{v,path}},
          picker?:{var,label,sub?}, needs?:[vars], showVars?:bool}          */
const gl=(w,d)=>`<span class="gl" data-def="${d}">${w}</span>`;

window.MISSIONS=[
{ id:"01", tag:"basic", time:"5 min", calls:2,
  title:"Connect & authenticate — your first API call",
  goal:"Prove your token works and learn the anatomy of every Morpheus API request. Two read-only calls, nothing can break.",
  steps:[
   {stage:"Setup", safety:["sf-safe","no api call"], title:"Get your token from the Morpheus UI",
    plain:`Log into Morpheus → avatar → <b>User Settings → API Access</b> → copy the <b>Access Token</b>. Paste it into the environment panel up top with your appliance URL. Tokens inherit <i>your</i> permissions — the API can do exactly what you can do in the UI, no more.`,
    eps:[], note:{h:"Self-signed cert?", t:"The built-in <b>Run</b> button already skips TLS verification (the Atlas container relays the call). For your own terminal, add <code>-k</code> to curl in labs."}},
   {stage:"Verify", safety:["sf-safe","read-only"], title:"Ask Morpheus who you are",
    plain:`<code>/api/whoami</code> is the standard connectivity test. If this returns your username, your URL, token, and network path are all correct. Hit <b>Run</b> — the output appears right here.`,
    eps:[["GET","/api/whoami"]], run:{m:"GET",p:"/api/whoami"},
    curl:`curl -s {{BASE_URL}}/api/whoami \\
  -H 'authorization: Bearer {{TOKEN}}'`,
    resp:`{ "user": { "id": 1, "username": "aswath", "permissions": { ... } } }`},
   {stage:"Verify", safety:["sf-safe","read-only"], title:"Ping the appliance",
    plain:`<code>/api/ping</code> works even without a token and returns the appliance version — useful for scripting "is Morpheus up".`,
    eps:[["GET","/api/ping"]], run:{m:"GET",p:"/api/ping"},
    curl:`curl -s {{BASE_URL}}/api/ping`,
    resp:`{ "success": true, "buildVersion": "9.0.1", "setupNeeded": false }`}],
  outcome:{title:"You're connected", ok:"whoami returned your user → every mission below will work with this exact URL + token pair.", no:"401 → token wrong/expired. Timeout/0 → URL or network path wrong (is the Atlas container on a network that can reach Morpheus?)."}},

{ id:"02", tag:"basic", time:"15 min", calls:7,
  title:"Provision your first instance",
  goal:"Walk the full provisioning chain the way the UI does it: group → cloud → type → layout → plan → provision. Each pick feeds the next.",
  steps:[
   {stage:"Look up", safety:["sf-safe","read-only"], title:"Pick a group",
    plain:`Everything provisions <b>into a ${gl("group","A group is a container for provisioning. It bundles clouds plus the policies and permissions that govern what happens inside it.")}</b>. Hit <b>Run</b>, then click a group in the panel — its ID is captured for you.`,
    eps:[["GET","/api/groups"]], run:{m:"GET",p:"/api/groups?max=200"},
    picker:{var:"GROUP_ID",label:"name"},
    curl:`curl -s {{BASE_URL}}/api/groups \\
  -H 'authorization: Bearer {{TOKEN}}'`,
    capture:{v:"GROUP_ID",ph:"or type it",hint:"click a row in the Run panel, or paste manually"}},
   {stage:"Look up", safety:["sf-safe","read-only"], title:"Pick a cloud in that group",
    plain:`A ${gl("cloud","Morpheus calls clouds 'zones' in the API: your vCenter, AWS account, HPE VME cluster, etc.")} is called a <b>zone</b> in the API. Filtered by your group so you only see valid targets.`,
    eps:[["GET","/api/zones"]], needs:["GROUP_ID"],
    run:{m:"GET",p:"/api/zones?groupId={{GROUP_ID}}&max=200"}, picker:{var:"CLOUD_ID",label:"name",sub:"zoneType.name"},
    curl:`curl -s '{{BASE_URL}}/api/zones?groupId={{GROUP_ID}}' \\
  -H 'authorization: Bearer {{TOKEN}}'`,
    capture:{v:"CLOUD_ID",ph:"or type it",hint:"the zone id"}},
   {stage:"Look up", safety:["sf-safe","read-only"], title:"Pick an instance type",
    plain:`An ${gl("instance type","What users see in the catalog: 'Ubuntu', 'MySQL', 'Nginx'. Each has layouts — concrete recipes for building it on a given cloud.")} is the catalog entry. Run and pick one (Ubuntu is a good first).`,
    eps:[["GET","/api/library/instance-types"]],
    run:{m:"GET",p:"/api/library/instance-types?max=200"}, picker:{var:"TYPE_ID",label:"name"},
    curl:`curl -s '{{BASE_URL}}/api/library/instance-types?max=200' \\
  -H 'authorization: Bearer {{TOKEN}}'`,
    capture:{v:"TYPE_ID",ph:"or type it",hint:"catalog entry id"}},
   {stage:"Look up", safety:["sf-safe","read-only"], title:"Pick a layout of that type",
    plain:`A <b>layout</b> is the recipe: single VM vs cluster, which cloud tech. Fetching the type returns its layouts — pick one that matches your cloud (e.g. VMware VM for vCenter).`,
    eps:[["GET","/api/library/instance-types/{instanceTypeId}"]], needs:["TYPE_ID"],
    run:{m:"GET",p:"/api/library/instance-types/{{TYPE_ID}}"}, picker:{var:"LAYOUT_ID",label:"name",sub:"provisionType.name"},
    curl:`curl -s {{BASE_URL}}/api/library/instance-types/{{TYPE_ID}} \\
  -H 'authorization: Bearer {{TOKEN}}'`,
    capture:{v:"LAYOUT_ID",ph:"or type it",hint:"from instanceTypeLayouts[]"}},
   {stage:"Look up", safety:["sf-safe","read-only"], title:"Pick a size (service plan)",
    plain:`${gl("Service plans","T-shirt sizes: CPU/RAM/disk combos. Filtering by zone + layout returns only plans valid for that combination.")} are the sizes. Pick the smallest for a first run.`,
    eps:[["GET","/api/service-plans"]], needs:["CLOUD_ID","LAYOUT_ID"],
    run:{m:"GET",p:"/api/service-plans?zoneId={{CLOUD_ID}}&layoutId={{LAYOUT_ID}}"}, picker:{var:"PLAN_ID",label:"name"},
    curl:`curl -s '{{BASE_URL}}/api/service-plans?zoneId={{CLOUD_ID}}&layoutId={{LAYOUT_ID}}' \\
  -H 'authorization: Bearer {{TOKEN}}'`,
    capture:{v:"PLAN_ID",ph:"or type it",hint:"smallest plan"}},
   {stage:"Create", safety:["sf-create","creates a VM"], title:"Provision it",
    plain:`Every pick slots into one payload — check the summary below, then Run. This <b>creates a real VM</b> in your cloud. You'll be asked to confirm.`,
    eps:[["POST","/api/instances"]], needs:["GROUP_ID","CLOUD_ID","TYPE_ID","LAYOUT_ID","PLAN_ID"], showVars:true,
    run:{m:"POST",p:"/api/instances",cap:{v:"INSTANCE_ID",path:"instance.id"},
     body:`{
  "zoneId": {{CLOUD_ID}},
  "instance": {
    "name": "atlas-first-vm",
    "site":  { "id": {{GROUP_ID}} },
    "instanceType": { "id": {{TYPE_ID}} },
    "layout": { "id": {{LAYOUT_ID}} },
    "plan":   { "id": {{PLAN_ID}} }
  }
}`},
    curl:`curl -s -X POST {{BASE_URL}}/api/instances \\
  -H 'authorization: Bearer {{TOKEN}}' \\
  -H 'content-type: application/json' \\
  -d '{
  "zoneId": {{CLOUD_ID}},
  "instance": {
    "name": "atlas-first-vm",
    "site":  { "id": {{GROUP_ID}} },
    "instanceType": { "id": {{TYPE_ID}} },
    "layout": { "id": {{LAYOUT_ID}} },
    "plan":   { "id": {{PLAN_ID}} }
  }
}'`,
    resp:`{ "instance": { "id": 451, "name": "atlas-first-vm", "status": "provisioning" } }`,
    note:{h:"Auto-capture", t:"On success, Atlas captures <code>$INSTANCE_ID</code> from the response automatically."}},
   {stage:"Watch", safety:["sf-safe","read-only"], title:"Poll until it's running",
    plain:`Provisioning is async. Run this a few times and watch <code>status</code> flip from <b>provisioning</b> to <b>running</b> — the same state machine the UI shows.`,
    eps:[["GET","/api/instances/{id}"]], needs:["INSTANCE_ID"],
    run:{m:"GET",p:"/api/instances/{{INSTANCE_ID}}"},
    curl:`curl -s {{BASE_URL}}/api/instances/{{INSTANCE_ID}} \\
  -H 'authorization: Bearer {{TOKEN}}'`}],
  outcome:{title:"Instance is live", ok:"status: running → you just did, via API, exactly what the provisioning wizard does.", no:"status: failed → Mission 10 shows how to read /history for the failing step."}},

{ id:"03", tag:"core", time:"10 min", calls:5,
  title:"Require approval before anything provisions in a group",
  goal:"Nobody can provision into the group until someone approves it. One policy, attached to the group, catches everything.",
  steps:[
   {stage:"Look up", safety:["sf-safe","read-only"], title:'Find the "approval" policy type',
    plain:`Morpheus has ~20 ${gl("policy","A policy is a rule attached to a scope: quotas, naming standards, shutdown schedules, or — here — a mandatory approval gate.")} types. You want the one coded <code>provisionApproval</code>. Run it and scan the output.`,
    eps:[["GET","/api/policy-types"]], run:{m:"GET",p:"/api/policy-types"},
    curl:`curl -s {{BASE_URL}}/api/policy-types \\
  -H 'authorization: Bearer {{TOKEN}}'`,
    resp:`{ "policyTypes": [ { "id": 12, "code": "provisionApproval", "name": "Provision Approval" }, ... ] }`},
   {stage:"Look up", safety:["sf-safe","read-only"], title:"Pick the group to protect",
    plain:`Run and click your target group — the id is captured for the next step.`,
    eps:[["GET","/api/groups"]], run:{m:"GET",p:"/api/groups?max=200"}, picker:{var:"GROUP_ID",label:"name"},
    curl:`curl -s {{BASE_URL}}/api/groups \\
  -H 'authorization: Bearer {{TOKEN}}'`,
    capture:{v:"GROUP_ID",ph:"or type it",hint:"steps 3–4 use it"}},
   {stage:"Create", safety:["sf-create","creates a policy"], title:"Attach the approval policy to the group",
    plain:`<b>Where you create a policy = what it governs.</b> POST under the group → group-scoped. Same body under <code>/api/zones/{id}/policies</code> → cloud-scoped. Under <code>/api/policies</code> → global.`,
    eps:[["POST","/api/groups/{groupId}/policies"]], needs:["GROUP_ID"],
    run:{m:"POST",p:"/api/groups/{{GROUP_ID}}/policies",
     body:`{
  "policy": {
    "name": "Prod requires approval",
    "policyType": { "code": "provisionApproval" },
    "config": { "accountIntegrationId": null },
    "enabled": true
  }
}`},
    curl:`curl -s -X POST {{BASE_URL}}/api/groups/{{GROUP_ID}}/policies \\
  -H 'authorization: Bearer {{TOKEN}}' \\
  -H 'content-type: application/json' \\
  -d '{ "policy": { "name": "Prod requires approval",
      "policyType": { "code": "provisionApproval" },
      "config": { "accountIntegrationId": null }, "enabled": true } }'`,
    note:{h:"Decode", t:'<code>"accountIntegrationId": null</code> = approvals handled <b>inside Morpheus</b>. Point it at a ServiceNow integration id instead — that\'s Mission 06.'}},
   {stage:"Trigger", safety:["sf-safe","read-only check"], title:"Provision into the group — watch it freeze",
    plain:`Provision anything into the group (Mission 02). Instead of building, the instance holds at <b>Pending Approval</b> — Morpheus silently created an ${gl("approval request","An approval request wraps one or more approval items. Each item is one thing awaiting a decision. You approve/deny items, not the request.")}.`,
    eps:[["GET","/api/instances/{id}"]], needs:["INSTANCE_ID"],
    run:{m:"GET",p:"/api/instances/{{INSTANCE_ID}}"},
    curl:`curl -s {{BASE_URL}}/api/instances/{{INSTANCE_ID}} \\
  -H 'authorization: Bearer {{TOKEN}}'`,
    resp:`{ "instance": { "id": 451, "status": "pending approval" } }`},
   {stage:"Decide", safety:["sf-mutate","mutates state"], title:"List pending approvals, then approve",
    plain:`Run the list — each approval shows its <b>items</b> in the output; note an item id and capture it. Then the approve call fires <code>PUT …/{item}/approve</code>. <code>{action}</code> is literally <code>approve</code> or <code>deny</code>.`,
    eps:[["GET","/api/approvals"],["PUT","/api/approval-items/{id}/{action}"]],
    run:{m:"GET",p:"/api/approvals"},
    capture:{v:"ITEM_ID",ph:"e.g. 88",hint:"an approvalItems[].id from the output"},
    curl:`# 1. what's waiting on me?
curl -s {{BASE_URL}}/api/approvals \\
  -H 'authorization: Bearer {{TOKEN}}'

# 2. approve it
curl -s -X PUT {{BASE_URL}}/api/approval-items/{{ITEM_ID}}/approve \\
  -H 'authorization: Bearer {{TOKEN}}'`,
    run2:{label:"Run approve",m:"PUT",p:"/api/approval-items/{{ITEM_ID}}/approve",needs:["ITEM_ID"]}}],
  outcome:{title:"Morpheus takes it from here", ok:"Approved → provisioning resumes automatically: pending → provisioning → running.", no:"Denied → request cancelled. The instance is never built."}},

{ id:"04", tag:"core", time:"20 min", calls:5,
  title:"Create an MKS cluster & get a kubeconfig",
  goal:"Stand up a Morpheus Kubernetes Service cluster via API and pull working credentials for kubectl.",
  steps:[
   {stage:"Look up", safety:["sf-safe","read-only"], title:"Pick a cluster recipe (layout)",
    plain:`${gl("Cluster layouts","The recipe for a cluster: masters/workers count, K8s version, cloud tech. MKS layouts build Morpheus-managed Kubernetes.")} define masters/workers/version. Pick an MKS one matching your cloud.`,
    eps:[["GET","/api/library/cluster-layouts"]],
    run:{m:"GET",p:"/api/library/cluster-layouts?phrase=kubernetes&max=100"}, picker:{var:"LAYOUT_ID",label:"name"},
    curl:`curl -s '{{BASE_URL}}/api/library/cluster-layouts?phrase=kubernetes' \\
  -H 'authorization: Bearer {{TOKEN}}'`,
    capture:{v:"LAYOUT_ID",ph:"or type it",hint:"an MKS layout for your cloud"}},
   {stage:"Create", safety:["sf-create","creates VMs"], title:"Create the cluster",
    plain:`One POST builds masters + workers. Reuses <code>$GROUP_ID</code>, <code>$CLOUD_ID</code>, <code>$PLAN_ID</code> from Mission 02.`,
    eps:[["POST","/api/clusters"]], needs:["GROUP_ID","CLOUD_ID","LAYOUT_ID","PLAN_ID"], showVars:true,
    run:{m:"POST",p:"/api/clusters",cap:{v:"CLUSTER_ID",path:"cluster.id"},
     body:`{
  "cluster": {
    "name": "atlas-mks-01",
    "type": "kubernetes-cluster",
    "group": { "id": {{GROUP_ID}} },
    "cloud": { "id": {{CLOUD_ID}} },
    "layout": { "id": {{LAYOUT_ID}} },
    "server": { "plan": { "id": {{PLAN_ID}} } }
  }
}`},
    curl:`curl -s -X POST {{BASE_URL}}/api/clusters \\
  -H 'authorization: Bearer {{TOKEN}}' \\
  -H 'content-type: application/json' \\
  -d '{ "cluster": { "name": "atlas-mks-01", "type": "kubernetes-cluster",
      "group": { "id": {{GROUP_ID}} }, "cloud": { "id": {{CLOUD_ID}} },
      "layout": { "id": {{LAYOUT_ID}} }, "server": { "plan": { "id": {{PLAN_ID}} } } } }'`,
    resp:`{ "cluster": { "id": 12, "name": "atlas-mks-01", "status": "provisioning" } }`},
   {stage:"Watch", safety:["sf-safe","read-only"], title:"Poll until the cluster is ready",
    plain:`Cluster builds take a while — masters first, then workers join. Re-run until <code>status: ok</code>.`,
    eps:[["GET","/api/clusters/{clusterId}"]], needs:["CLUSTER_ID"],
    run:{m:"GET",p:"/api/clusters/{{CLUSTER_ID}}"},
    curl:`curl -s {{BASE_URL}}/api/clusters/{{CLUSTER_ID}} \\
  -H 'authorization: Bearer {{TOKEN}}'`},
   {stage:"Fetch", safety:["sf-safe","read-only"], title:"Pull the kubeconfig",
    plain:`<code>api-config</code> returns the service URL + token Morpheus holds for the cluster — everything kubectl needs.`,
    eps:[["GET","/api/clusters/{clusterId}/api-config"]], needs:["CLUSTER_ID"],
    run:{m:"GET",p:"/api/clusters/{{CLUSTER_ID}}/api-config"},
    curl:`curl -s {{BASE_URL}}/api/clusters/{{CLUSTER_ID}}/api-config \\
  -H 'authorization: Bearer {{TOKEN}}'`,
    note:{h:"Security note", t:"This default credential is effectively <b>cluster-admin</b>. Never hand it to tenant users — namespace isolation means nothing with an admin kubeconfig. Scoped ServiceAccounts per tenant are the fix (see Mission 15 for the post-provision automation pattern)."}},
   {stage:"Verify", safety:["sf-safe","read-only"], title:"Point kubectl at it",
    plain:`Wire the URL + token into kubectl and list nodes. This one runs in your terminal, not the browser.`,
    eps:[],
    curl:`kubectl --server=https://10.30.21.15:6443 \\
  --token=eyJhbGciOiJSUzI1NiIs... \\
  --insecure-skip-tls-verify get nodes`}],
  outcome:{title:"Cluster online", ok:"kubectl returns masters + workers → the cluster is fully API-managed (scale, upgrade — all under /api/clusters).", no:"Provisioning failed → GET /api/clusters/{id} shows per-server status; the failing server's history has the real error."}},

{ id:"05", tag:"core", time:"15 min", calls:5,
  title:"Run a task on a schedule (automation)",
  goal:"Create a script task, prove it runs, then bind it to a cron schedule with a job — Morpheus as your ops cron with an audit trail.",
  steps:[
   {stage:"Create", safety:["sf-create","creates a task"], title:"Create a script task",
    plain:`A ${gl("task","A single automation action: bash/python script, Ansible playbook, HTTP call. Tasks run ad-hoc, in workflows, or on schedules via jobs.")} holds your script. <code>executeTarget: local</code> runs it on the appliance.`,
    eps:[["POST","/api/tasks"]],
    run:{m:"POST",p:"/api/tasks",cap:{v:"TASK_ID",path:"task.id"},
     body:`{
  "task": {
    "name": "disk-report",
    "taskType": { "code": "script" },
    "executeTarget": "local",
    "file": { "sourceType": "local", "content": "df -h" }
  }
}`},
    curl:`curl -s -X POST {{BASE_URL}}/api/tasks \\
  -H 'authorization: Bearer {{TOKEN}}' \\
  -H 'content-type: application/json' \\
  -d '{ "task": { "name": "disk-report", "taskType": { "code": "script" },
      "executeTarget": "local", "file": { "sourceType": "local", "content": "df -h" } } }'`},
   {stage:"Trigger", safety:["sf-mutate","runs the script"], title:"Test-run it once",
    plain:`Execute ad-hoc before scheduling — same endpoint your future job calls under the hood.`,
    eps:[["POST","/api/tasks/{id}/execute"]], needs:["TASK_ID"],
    run:{m:"POST",p:"/api/tasks/{{TASK_ID}}/execute",body:`{"job":{}}`},
    curl:`curl -s -X POST {{BASE_URL}}/api/tasks/{{TASK_ID}}/execute \\
  -H 'authorization: Bearer {{TOKEN}}' \\
  -H 'content-type: application/json' -d '{"job":{}}'`},
   {stage:"Create", safety:["sf-create","creates a schedule"], title:"Create a cron schedule",
    plain:`${gl("Execute schedules","Reusable cron definitions. One schedule can drive many jobs.")} are plain cron — this one fires daily at 02:00.`,
    eps:[["POST","/api/execute-schedules"]],
    run:{m:"POST",p:"/api/execute-schedules",cap:{v:"SCHEDULE_ID",path:"schedule.id"},
     body:`{
  "schedule": {
    "name": "daily-2am",
    "scheduleType": "execute",
    "cron": "0 2 * * *",
    "enabled": true
  }
}`},
    curl:`curl -s -X POST {{BASE_URL}}/api/execute-schedules \\
  -H 'authorization: Bearer {{TOKEN}}' \\
  -H 'content-type: application/json' \\
  -d '{ "schedule": { "name": "daily-2am", "scheduleType": "execute",
      "cron": "0 2 * * *", "enabled": true } }'`},
   {stage:"Create", safety:["sf-create","creates a job"], title:"Bind task + schedule into a job",
    plain:`A ${gl("job","The binding object: which task/workflow, which schedule, which target. Jobs are what actually fire on the timer.")} is the thing that actually fires.`,
    eps:[["POST","/api/jobs"]], needs:["TASK_ID","SCHEDULE_ID"], showVars:true,
    run:{m:"POST",p:"/api/jobs",
     body:`{
  "job": {
    "name": "nightly-disk-report",
    "task": { "id": {{TASK_ID}} },
    "scheduleMode": {{SCHEDULE_ID}},
    "targetType": "appliance",
    "enabled": true
  }
}`},
    curl:`curl -s -X POST {{BASE_URL}}/api/jobs \\
  -H 'authorization: Bearer {{TOKEN}}' \\
  -H 'content-type: application/json' \\
  -d '{ "job": { "name": "nightly-disk-report", "task": { "id": {{TASK_ID}} },
      "scheduleMode": {{SCHEDULE_ID}}, "targetType": "appliance", "enabled": true } }'`,
    note:{h:"Version note", t:"<code>scheduleMode</code> shapes vary slightly across 9.x builds — if 422, check the error detail; some builds want the schedule id as a string."}},
   {stage:"Watch", safety:["sf-safe","read-only"], title:"Read the run history",
    plain:`Every run lands in <code>job-executions</code> with status, duration, and full stdout — your audit trail.`,
    eps:[["GET","/api/job-executions"]],
    run:{m:"GET",p:"/api/job-executions?max=5"},
    curl:`curl -s '{{BASE_URL}}/api/job-executions?max=5' \\
  -H 'authorization: Bearer {{TOKEN}}'`}],
  outcome:{title:"Automation live", ok:"Job fires at 02:00 daily; executions accumulate with full output history.", no:"Run failed → the execution record's output field contains stderr from your script."}},

{ id:"06", tag:"adv", time:"15 min", calls:3,
  title:"Wire ServiceNow as the approval source",
  goal:"Same approval gate as Mission 03, but decisions happen in ServiceNow — Morpheus raises the request there and polls for the verdict.",
  steps:[
   {stage:"Create", safety:["sf-create","creates an integration"], title:"Register the ServiceNow integration",
    plain:`An ${gl("integration","An external system wired into Morpheus: ITSM, Ansible, Git, DNS, IPAM. Create once, reference its id everywhere.")} holds the SNOW URL + service account.`,
    eps:[["POST","/api/integrations"]],
    run:{m:"POST",p:"/api/integrations",cap:{v:"INTEGRATION_ID",path:"integration.id"},
     body:`{
  "integration": {
    "name": "SNOW-prod",
    "type": "serviceNow",
    "serviceUrl": "https://yourco.service-now.com",
    "serviceUsername": "morpheus.svc",
    "servicePassword": "********"
  }
}`},
    curl:`curl -s -X POST {{BASE_URL}}/api/integrations \\
  -H 'authorization: Bearer {{TOKEN}}' \\
  -H 'content-type: application/json' \\
  -d '{ "integration": { "name": "SNOW-prod", "type": "serviceNow",
      "serviceUrl": "https://yourco.service-now.com",
      "serviceUsername": "morpheus.svc", "servicePassword": "********" } }'`,
    note:{h:"Before running", t:"Edit the payload in the confirm screen with your real SNOW URL and credentials."}},
   {stage:"Create", safety:["sf-create","creates a policy"], title:"Point the approval policy at ServiceNow",
    plain:`Identical to Mission 03 — the only change: <code>accountIntegrationId</code> now references the integration instead of <code>null</code>.`,
    eps:[["POST","/api/groups/{groupId}/policies"]], needs:["GROUP_ID","INTEGRATION_ID"], showVars:true,
    run:{m:"POST",p:"/api/groups/{{GROUP_ID}}/policies",
     body:`{
  "policy": {
    "name": "Prod approval via SNOW",
    "policyType": { "code": "provisionApproval" },
    "config": { "accountIntegrationId": {{INTEGRATION_ID}} },
    "enabled": true
  }
}`},
    curl:`curl -s -X POST {{BASE_URL}}/api/groups/{{GROUP_ID}}/policies \\
  -H 'authorization: Bearer {{TOKEN}}' \\
  -H 'content-type: application/json' \\
  -d '{ "policy": { "name": "Prod approval via SNOW",
      "policyType": { "code": "provisionApproval" },
      "config": { "accountIntegrationId": {{INTEGRATION_ID}} }, "enabled": true } }'`},
   {stage:"Watch", safety:["sf-safe","read-only"], title:"Provision → watch the SNOW round-trip",
    plain:`Provision into the group. Morpheus opens a requested item in ServiceNow; the record here shows <code>external</code> status. Approve in SNOW → Morpheus polls → provisioning resumes. You never call an approve API on the Morpheus side.`,
    eps:[["GET","/api/approvals"]],
    run:{m:"GET",p:"/api/approvals"},
    curl:`curl -s {{BASE_URL}}/api/approvals \\
  -H 'authorization: Bearer {{TOKEN}}'`,
    note:{h:"Who decides where", t:"Internal source → decisions via /api/approval-items (Mission 03). SNOW source → decisions in SNOW only; the Morpheus record is a read-only mirror."}}],
  outcome:{title:"ITSM-gated provisioning", ok:"Approved in ServiceNow → instance builds; the SNOW ticket holds the audit trail.", no:"Rejected in ServiceNow → Morpheus cancels the request automatically."}},

{ id:"07", tag:"adv", time:"20 min", calls:4,
  title:"Tenant isolation & scoped RBAC",
  goal:"Carve out an isolated tenant with its own admin — the multi-tenancy foundation for service-provider or BU-per-tenant setups.",
  steps:[
   {stage:"Look up", safety:["sf-safe","read-only"], title:"Pick a tenant base role",
    plain:`A tenant needs a base ${gl("role","RBAC definition: feature access, group access, cloud access. roleType 'account' roles seed tenants.")}. Run and pick one with account scope (e.g. the built-in Account Admin).`,
    eps:[["GET","/api/roles"]],
    run:{m:"GET",p:"/api/roles?max=100"}, picker:{var:"ROLE_ID",label:"authority",sub:"roleType"},
    curl:`curl -s {{BASE_URL}}/api/roles \\
  -H 'authorization: Bearer {{TOKEN}}'`,
    capture:{v:"ROLE_ID",ph:"or type it",hint:"an account-type role"}},
   {stage:"Create", safety:["sf-create","creates a tenant"], title:"Create the tenant",
    plain:`An ${gl("account","Accounts are tenants: isolated customers or BUs with their own users, roles, groups, and visibility walls.")} is a tenant. From this moment it has its own walls — its users can't see yours.`,
    eps:[["POST","/api/accounts"]], needs:["ROLE_ID"],
    run:{m:"POST",p:"/api/accounts",cap:{v:"TENANT_ID",path:"account.id"},
     body:`{
  "account": {
    "name": "acme-bu",
    "description": "ACME business unit tenant",
    "role": { "id": {{ROLE_ID}} },
    "active": true
  }
}`},
    curl:`curl -s -X POST {{BASE_URL}}/api/accounts \\
  -H 'authorization: Bearer {{TOKEN}}' \\
  -H 'content-type: application/json' \\
  -d '{ "account": { "name": "acme-bu", "role": { "id": {{ROLE_ID}} }, "active": true } }'`},
   {stage:"Create", safety:["sf-create","creates a user"], title:"Create the tenant's admin",
    plain:`Note the URL shape: <code>/api/accounts/{id}/users</code> — you're creating the user <b>inside</b> the tenant. Same scoping pattern as group policies in Mission 03.`,
    eps:[["POST","/api/accounts/{accountId}/users"]], needs:["TENANT_ID","ROLE_ID"], showVars:true,
    run:{m:"POST",p:"/api/accounts/{{TENANT_ID}}/users",
     body:`{
  "user": {
    "username": "acme.admin",
    "email": "admin@acme.example",
    "password": "ChangeMe!2026",
    "roles": [ { "id": {{ROLE_ID}} } ]
  }
}`},
    curl:`curl -s -X POST {{BASE_URL}}/api/accounts/{{TENANT_ID}}/users \\
  -H 'authorization: Bearer {{TOKEN}}' \\
  -H 'content-type: application/json' \\
  -d '{ "user": { "username": "acme.admin", "email": "admin@acme.example",
      "password": "ChangeMe!2026", "roles": [ { "id": {{ROLE_ID}} } ] } }'`},
   {stage:"Verify", safety:["sf-safe","read-only"], title:"Prove the isolation",
    plain:`Get a token as <code>acme.admin</code> and call <code>/api/groups</code> with it — the master tenant's groups are invisible. That's the wall working.`,
    eps:[["GET","/api/accounts/{accountId}/groups"]],
    curl:`# as the tenant admin's token:
curl -s {{BASE_URL}}/api/groups \\
  -H 'authorization: Bearer <ACME_ADMIN_TOKEN>'`,
    note:{h:"Least privilege", t:"For real deployments: clone a role, strip features the tenant shouldn't touch (clouds, integrations), and use that instead of full Account Admin."}}],
  outcome:{title:"Tenant stands alone", ok:"Tenant admin sees only their own world; master tenant retains visibility across all.", no:"Tenant sees master resources → the role has 'global' group/cloud access set; scope it down."}},

{ id:"08", tag:"core", time:"15 min", calls:6,
  title:"Instance lifecycle: stop, resize, snapshot, delete",
  goal:"Day-2 operations — the calls you'll actually run daily. All follow one pattern: PUT /api/instances/{id}/{action}.",
  steps:[
   {stage:"Look up", safety:["sf-safe","read-only"], title:"Pick a victim instance",
    plain:`Run and click an instance — <b>use a lab VM</b>, later steps stop and eventually delete it.`,
    eps:[["GET","/api/instances"]],
    run:{m:"GET",p:"/api/instances?max=100"}, picker:{var:"INSTANCE_ID",label:"name",sub:"status"},
    curl:`curl -s '{{BASE_URL}}/api/instances?max=100' \\
  -H 'authorization: Bearer {{TOKEN}}'`,
    capture:{v:"INSTANCE_ID",ph:"or type it",hint:"a lab instance"}},
   {stage:"Act", safety:["sf-mutate","powers off"], title:"Stop it",
    plain:`<code>/{id}/stop</code> powers off but keeps everything provisioned. This <b>{action} verb pattern</b> repeats across the whole API: stop, start, restart, suspend, eject, backup…`,
    eps:[["PUT","/api/instances/{id}/stop"]], needs:["INSTANCE_ID"],
    run:{m:"PUT",p:"/api/instances/{{INSTANCE_ID}}/stop"},
    curl:`curl -s -X PUT {{BASE_URL}}/api/instances/{{INSTANCE_ID}}/stop \\
  -H 'authorization: Bearer {{TOKEN}}'`},
   {stage:"Act", safety:["sf-mutate","powers on"], title:"Start it again",
    plain:`Same shape, different verb. Re-run step 1's list (or Mission 02 step 7) to watch status flip.`,
    eps:[["PUT","/api/instances/{id}/start"]], needs:["INSTANCE_ID"],
    run:{m:"PUT",p:"/api/instances/{{INSTANCE_ID}}/start"},
    curl:`curl -s -X PUT {{BASE_URL}}/api/instances/{{INSTANCE_ID}}/start \\
  -H 'authorization: Bearer {{TOKEN}}'`},
   {stage:"Act", safety:["sf-mutate","resizes"], title:"Resize to a different plan",
    plain:`Resize = point the instance at a new ${gl("service plan","T-shirt sizes: CPU/RAM/disk combos.")}. Needs <code>$PLAN_ID</code> (pick one in Mission 02 step 5). Some clouds restart the VM to apply.`,
    eps:[["PUT","/api/instances/{id}/resize"]], needs:["INSTANCE_ID","PLAN_ID"],
    run:{m:"PUT",p:"/api/instances/{{INSTANCE_ID}}/resize",
     body:`{ "instance": { "plan": { "id": {{PLAN_ID}} } } }`},
    curl:`curl -s -X PUT {{BASE_URL}}/api/instances/{{INSTANCE_ID}}/resize \\
  -H 'authorization: Bearer {{TOKEN}}' \\
  -H 'content-type: application/json' \\
  -d '{ "instance": { "plan": { "id": {{PLAN_ID}} } } }'`},
   {stage:"Act", safety:["sf-mutate","creates snapshot"], title:"Snapshot before anything risky",
    plain:`The habit that saves careers. Revert later with <code>PUT /{id}/revert-snapshot/{snapshotId}</code>.`,
    eps:[["PUT","/api/instances/{id}/snapshot"]], needs:["INSTANCE_ID"],
    run:{m:"PUT",p:"/api/instances/{{INSTANCE_ID}}/snapshot",
     body:`{ "snapshot": { "name": "pre-change", "description": "atlas mission 08" } }`},
    curl:`curl -s -X PUT {{BASE_URL}}/api/instances/{{INSTANCE_ID}}/snapshot \\
  -H 'authorization: Bearer {{TOKEN}}' \\
  -H 'content-type: application/json' \\
  -d '{ "snapshot": { "name": "pre-change" } }'`},
   {stage:"Destroy", safety:["sf-danger","permanent delete"], title:"Delete it",
    plain:`<code>DELETE</code> tears the VM down permanently. <code>preserveVolumes=on</code> keeps disks; <code>force=on</code> pushes past a stuck state. <b>There is no undo.</b>`,
    eps:[["DELETE","/api/instances/{id}"]], needs:["INSTANCE_ID"],
    run:{m:"DELETE",p:"/api/instances/{{INSTANCE_ID}}?preserveVolumes=off"},
    curl:`curl -s -X DELETE '{{BASE_URL}}/api/instances/{{INSTANCE_ID}}?preserveVolumes=off' \\
  -H 'authorization: Bearer {{TOKEN}}'`}],
  outcome:{title:"Day-2 fluency", ok:"You now know the {id}/{action} pattern — it covers 80% of daily operations across instances, clusters, and servers.", no:"409/422 on an action → the instance is in a state that blocks it (e.g. resize while stopped on some clouds); the error detail names it."}},

{ id:"10", tag:"core", time:"10 min", calls:4,
  title:"Troubleshoot via API: history, health, alarms, bundles",
  goal:"What you actually do during an escalation — read the same data the UI shows, but scriptable and greppable.",
  steps:[
   {stage:"Look up", safety:["sf-safe","read-only"], title:"Pick the problem instance",
    plain:`Same picker as Mission 08 — choose the instance you're diagnosing.`,
    eps:[["GET","/api/instances"]],
    run:{m:"GET",p:"/api/instances?max=100"}, picker:{var:"INSTANCE_ID",label:"name",sub:"status"},
    curl:`curl -s '{{BASE_URL}}/api/instances?max=100' \\
  -H 'authorization: Bearer {{TOKEN}}'`},
   {stage:"Read", safety:["sf-safe","read-only"], title:"Read its provisioning history",
    plain:`<code>/history</code> is the first place to look when provisioning fails: every process step with status, duration, and <b>output</b> — the actual error text lives here.`,
    eps:[["GET","/api/instances/{id}/history"]], needs:["INSTANCE_ID"],
    run:{m:"GET",p:"/api/instances/{{INSTANCE_ID}}/history"},
    curl:`curl -s {{BASE_URL}}/api/instances/{{INSTANCE_ID}}/history \\
  -H 'authorization: Bearer {{TOKEN}}'`},
   {stage:"Read", safety:["sf-safe","read-only"], title:"Check appliance health",
    plain:`<code>/api/health</code> is the appliance's own vitals: queues, elastic, database, disk. Your first call when "Morpheus feels slow".`,
    eps:[["GET","/api/health"],["GET","/api/health/alarms"]],
    run:{m:"GET",p:"/api/health"},
    curl:`curl -s {{BASE_URL}}/api/health \\
  -H 'authorization: Bearer {{TOKEN}}'

# active alarms:
curl -s {{BASE_URL}}/api/health/alarms \\
  -H 'authorization: Bearer {{TOKEN}}'`,
    note:{h:"Acknowledge", t:"Seen an alarm? <code>PUT /api/health/alarms/{id}/acknowledge</code> clears it from the active list — auditable, unlike ignoring the UI banner."}},
   {stage:"Collect", safety:["sf-create","creates a bundle"], title:"Cut a support bundle",
    plain:`When it goes to HPE support: one POST generates the diagnostic bundle, then <code>GET /{id}/download</code> fetches it. No SSH to the appliance needed.`,
    eps:[["POST","/api/support-bundles"],["GET","/api/support-bundles/{id}/download"]],
    run:{m:"POST",p:"/api/support-bundles"},
    curl:`curl -s -X POST {{BASE_URL}}/api/support-bundles \\
  -H 'authorization: Bearer {{TOKEN}}'

# then list & download:
curl -s {{BASE_URL}}/api/support-bundles \\
  -H 'authorization: Bearer {{TOKEN}}'`}],
  outcome:{title:"Escalation toolkit", ok:"History → error text; health → appliance vitals; bundle → what support asks for first. All scriptable.", no:"History empty → the failure happened before Morpheus took over (cloud-side); check the zone's own logs."}},

{ id:"11", tag:"core", time:"10 min", calls:3,
  title:"Quotas & guardrails: cap what a group can consume",
  goal:"Same policy engine as Mission 03, different rule: hard caps on VMs and memory for a group. One pattern, twenty policy types.",
  steps:[
   {stage:"Look up", safety:["sf-safe","read-only"], title:"See the quota policy types",
    plain:`Run and scan for <code>maxVms</code>, <code>maxCores</code>, <code>maxMemory</code>, <code>maxStorage</code> — plus <code>naming</code>, <code>shutdown</code>, <code>expiration</code>. Every one attaches exactly like the approval policy did.`,
    eps:[["GET","/api/policy-types"]],
    run:{m:"GET",p:"/api/policy-types"},
    curl:`curl -s {{BASE_URL}}/api/policy-types \\
  -H 'authorization: Bearer {{TOKEN}}'`},
   {stage:"Create", safety:["sf-create","creates a policy"], title:"Cap the group at 10 VMs",
    plain:`Same POST as Mission 03 step 3 — only <code>policyType.code</code> and <code>config</code> change. That's the whole policy engine: one shape, many rules.`,
    eps:[["POST","/api/groups/{groupId}/policies"]], needs:["GROUP_ID"],
    run:{m:"POST",p:"/api/groups/{{GROUP_ID}}/policies",
     body:`{
  "policy": {
    "name": "Max 10 VMs",
    "policyType": { "code": "maxVms" },
    "config": { "maxVms": 10 },
    "enabled": true
  }
}`},
    curl:`curl -s -X POST {{BASE_URL}}/api/groups/{{GROUP_ID}}/policies \\
  -H 'authorization: Bearer {{TOKEN}}' \\
  -H 'content-type: application/json' \\
  -d '{ "policy": { "name": "Max 10 VMs", "policyType": { "code": "maxVms" },
      "config": { "maxVms": 10 }, "enabled": true } }'`},
   {stage:"Verify", safety:["sf-safe","read-only"], title:"List what now governs the group",
    plain:`One group can carry many policies — approval + quotas + naming stack together. The 11th VM attempt returns <code>422</code> with the quota named in the error.`,
    eps:[["GET","/api/groups/{groupId}/policies"]], needs:["GROUP_ID"],
    run:{m:"GET",p:"/api/groups/{{GROUP_ID}}/policies"},
    curl:`curl -s {{BASE_URL}}/api/groups/{{GROUP_ID}}/policies \\
  -H 'authorization: Bearer {{TOKEN}}'`}],
  outcome:{title:"Guardrails up", ok:"Provisioning inside limits works untouched; the request that would breach the cap is rejected with a named reason.", no:"Quota not enforced → policy created at the wrong scope, or 'enabled' false. List the group's policies to confirm."}},

{ id:"15", tag:"adv", time:"15 min", calls:4,
  title:"Workflows & Cypher: automation that fires on provision",
  goal:"Chain tasks into a workflow, run it on demand, and pull secrets from Cypher instead of hardcoding them — the pattern behind post-provision hardening.",
  steps:[
   {stage:"Create", safety:["sf-create","creates a workflow"], title:"Chain your task into a workflow",
    plain:`A ${gl("workflow","A task-set: ordered tasks bound to provisioning phases (preProvision, postProvision, teardown) or run on demand.")} (task-set) wraps tasks with a <b>phase</b>. <code>postProvision</code> = fires right after every VM built with it. Needs <code>$TASK_ID</code> from Mission 05.`,
    eps:[["POST","/api/task-sets"]], needs:["TASK_ID"],
    run:{m:"POST",p:"/api/task-sets",cap:{v:"WORKFLOW_ID",path:"taskSet.id"},
     body:`{
  "taskSet": {
    "name": "post-provision-hardening",
    "type": "provision",
    "tasks": [ { "taskId": {{TASK_ID}}, "taskPhase": "postProvision" } ]
  }
}`},
    curl:`curl -s -X POST {{BASE_URL}}/api/task-sets \\
  -H 'authorization: Bearer {{TOKEN}}' \\
  -H 'content-type: application/json' \\
  -d '{ "taskSet": { "name": "post-provision-hardening", "type": "provision",
      "tasks": [ { "taskId": {{TASK_ID}}, "taskPhase": "postProvision" } ] } }'`},
   {stage:"Trigger", safety:["sf-mutate","runs the workflow"], title:"Run it on demand",
    plain:`Workflows also run ad-hoc against a target — same execute pattern as tasks.`,
    eps:[["POST","/api/task-sets/{id}/execute"]], needs:["WORKFLOW_ID"],
    run:{m:"POST",p:"/api/task-sets/{{WORKFLOW_ID}}/execute",body:`{"job":{}}`},
    curl:`curl -s -X POST {{BASE_URL}}/api/task-sets/{{WORKFLOW_ID}}/execute \\
  -H 'authorization: Bearer {{TOKEN}}' \\
  -H 'content-type: application/json' -d '{"job":{}}'`},
   {stage:"Create", safety:["sf-create","stores a secret"], title:"Store a secret in Cypher",
    plain:`${gl("Cypher","Morpheus' built-in secret store. Scripts reference secrets as cypher:// URIs so credentials never live in task code.")} keeps credentials out of your scripts. POST writes; the path becomes the reference.`,
    eps:[["POST","/api/cypher/{cypherPath}"]],
    run:{m:"POST",p:"/api/cypher/secret/atlas/demo?type=string",body:`{ "value": "s3cret-value" }`},
    curl:`curl -s -X POST '{{BASE_URL}}/api/cypher/secret/atlas/demo?type=string' \\
  -H 'authorization: Bearer {{TOKEN}}' \\
  -H 'content-type: application/json' \\
  -d '{ "value": "s3cret-value" }'`},
   {stage:"Read", safety:["sf-safe","read-only"], title:"Read it back — and use it in tasks",
    plain:`GET retrieves it; inside task scripts you'd write <code>&lt;%=cypher.read('secret/atlas/demo')%&gt;</code> instead of a hardcoded password. This trio — task + workflow + cypher — is exactly how you'd auto-create scoped K8s ServiceAccounts after MKS provisioning (Mission 04's security note).`,
    eps:[["GET","/api/cypher/{cypherPath}"]],
    run:{m:"GET",p:"/api/cypher/secret/atlas/demo"},
    curl:`curl -s {{BASE_URL}}/api/cypher/secret/atlas/demo \\
  -H 'authorization: Bearer {{TOKEN}}'`}],
  outcome:{title:"Provision-time automation", ok:"Attach the workflow to a layout (or pick it at provision time) and every new VM gets hardened automatically, secrets pulled from Cypher.", no:"Workflow didn't fire on provision → it must be attached to the layout or selected in the provision wizard/API payload (config.taskSetId)."}}
];
