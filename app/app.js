/* ============ Morpheus API Atlas — engine ============ */
const DATA = window.ATLAS_DATA, EPS = DATA.endpoints, MISSIONS = window.MISSIONS;
document.getElementById('fcount').textContent = DATA.meta.count;
document.getElementById('gq').placeholder = `Search ${DATA.meta.count.toLocaleString()} endpoints…`;

/* ============ ENV VARIABLES ============ */
const VARS = {BASE_URL:"",TOKEN:"",GROUP_ID:"",CLOUD_ID:"",ITEM_ID:"",INSTANCE_ID:"",TYPE_ID:"",LAYOUT_ID:"",PLAN_ID:"",CLUSTER_ID:"",TASK_ID:"",SCHEDULE_ID:"",JOB_ID:"",INTEGRATION_ID:"",TENANT_ID:"",ROLE_ID:"",WORKFLOW_ID:""};
const VLABELS = {};
let maskToken = false;

function renderVars(){
  document.querySelectorAll('.vv').forEach(el=>{
    const k = el.dataset.var, v = VARS[k];
    if(v){ el.classList.remove('unset');
      el.textContent = (k==='TOKEN'&&maskToken)?'•'.repeat(Math.min(v.length,14)):v;
    } else { el.classList.add('unset'); el.textContent = '$'+k; }
  });
  document.querySelectorAll('input[data-var]').forEach(inp=>{
    if(document.activeElement!==inp) inp.value = VARS[inp.dataset.var]||'';
  });
  const ok = VARS.BASE_URL && VARS.TOKEN, chip = document.getElementById('envstat');
  chip.classList.toggle('ok', !!ok);
  document.getElementById('envtxt').textContent = ok ? 'Environment linked' : 'Set up environment';
  document.querySelectorAll('.runbtn').forEach(b=>{
    const needs = (b.dataset.needs||'').split(',').filter(Boolean);
    const missing = !ok ? ['BASE_URL/TOKEN'] : needs.filter(n=>!VARS[n]);
    b.disabled = missing.length>0;
    b.title = missing.length ? 'Needs: '+missing.map(x=>'$'+x).join(', ') : 'Execute against your appliance';
  });
  document.querySelectorAll('.vsum .vchip').forEach(c=>{
    const k=c.dataset.var, v=VARS[k];
    c.classList.toggle('set',!!v);
    c.querySelector('.val').textContent = v ? (v + (VLABELS[k]?' · '+VLABELS[k]:'')) : 'not set';
  });
}
function bindVarInputs(root){
  (root||document).querySelectorAll('input[data-var]').forEach(inp=>{
    inp.value = VARS[inp.dataset.var]||'';
    inp.oninput = ()=>{ VARS[inp.dataset.var] = inp.value.trim().replace(/\/+$/,''); renderVars(); };
  });
}
function toggleEnv(){ document.getElementById('envpanel').classList.toggle('open'); }
function toggleMask(){
  maskToken = !maskToken;
  document.getElementById('maskbtn').textContent = maskToken?'Show':'Mask';
  document.getElementById('in_TOKEN').type = maskToken?'password':'text';
  renderVars();
}
bindVarInputs(document);

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function resolve(tpl){ return tpl.replace(/\{\{(\w+)\}\}/g,(_,k)=>VARS[k]||('{{'+k+'}}')); }
function curlHTML(tpl){
  let h = esc(tpl);
  h = h.replace(/\{\{(\w+)\}\}/g, '<span class="vv" data-var="$1">$$$1</span>');
  h = h.replace(/^(#.*)$/gm, '<span class="c">$1</span>');
  return h;
}
function copyBlock(btn){
  const box = btn.closest('.term,.resp');
  let pre = box.querySelector('pre');
  box.querySelectorAll('pre').forEach(p=>{ if(p.style.display!=='none') pre=p; });
  pre = pre.cloneNode(true);
  pre.querySelectorAll('.vv').forEach(el=>{ el.textContent = VARS[el.dataset.var] || ('$'+el.dataset.var); });
  navigator.clipboard.writeText(pre.innerText).then(()=>{
    btn.textContent='Copied ✓'; setTimeout(()=>btn.textContent='Copy',1300);
  }).catch(()=>{ btn.textContent='Select & copy'; });
}

/* ============ RUNNER + DRAWER ============ */
const drawer = document.getElementById('drawer'), dTitle=document.getElementById('dTitle'),
      dMeta=document.getElementById('dMeta'), dBody=document.getElementById('dBody'),
      dFilter=document.getElementById('dFilter');
let pendingRun=null, currentPicker=null, pickerRows=[];

function openDrawer(title){ dTitle.textContent=title; dMeta.innerHTML=''; dBody.innerHTML='';
  dFilter.style.display='none'; dFilter.value=''; drawer.classList.add('open'); }
function closeDrawer(){ drawer.classList.remove('open'); pendingRun=null; currentPicker=null; }

function statusPill(st,ms){
  const cls = st>=200&&st<300?'ok':st===0?'err':'warn';
  const explain = {401:'Unauthorized — token wrong or expired',403:'Forbidden — your role lacks this permission',
    404:'Not found — check the ID / path',422:'Validation failed — a field in the payload is wrong (details in body)',
    500:'Server error on the appliance',0:'No response — network path or DNS from the Atlas container'};
  return `<span class="pill-st ${cls}">${st||'ERR'}</span><span class="pill-ms">${ms} ms</span>`+
    (explain[st]?`<span class="pill-ex">${explain[st]}</span>`:'');
}
async function relay(m, pathTpl, bodyStr){
  const res = await fetch('/run',{method:'POST',headers:{'content-type':'application/json'},
    body: JSON.stringify({ base: VARS.BASE_URL, method:m, apiPath: resolve(pathTpl),
      token: VARS.TOKEN, body: bodyStr ? resolve(bodyStr) : undefined })});
  return res.json();
}
function getPath(obj, dotted){ return dotted.split('.').reduce((o,k)=>o&&o[k], obj); }
function findList(obj){
  if(Array.isArray(obj)) return obj;
  for(const k of Object.keys(obj||{})){
    if(Array.isArray(obj[k]) && obj[k].length && typeof obj[k][0]==='object') return obj[k];
  }
  for(const k of Object.keys(obj||{})){ // one level deeper (e.g. instanceType.instanceTypeLayouts)
    if(obj[k] && typeof obj[k]==='object' && !Array.isArray(obj[k])){
      const inner = findList(obj[k]); if(inner) return inner;
    }
  }
  return null;
}
function showJSON(container, raw){
  let pretty = raw;
  try{ pretty = JSON.stringify(JSON.parse(raw),null,2); }catch{}
  container.innerHTML = `<pre class="djson">${esc(pretty).slice(0,200000)}</pre>`;
}

async function runStep(mid, i, alt){
  const m = MISSIONS.find(x=>x.id===mid), s = m.steps[i];
  const r = alt ? s.run2 : s.run;
  if(!r) return;
  const isWrite = r.m !== 'GET';
  openDrawer(`${r.m} ${resolve(r.p)}`);
  if(isWrite){
    pendingRun = {mid,i,alt};
    dBody.innerHTML = `<div class="confirm">
      <p class="cwarn">This will execute against <b>${esc(VARS.BASE_URL)}</b> and change real state.</p>
      ${r.body?`<p class="clbl">Payload (edit before executing if needed):</p>
        <textarea id="cbody" spellcheck="false">${esc(resolve(r.body))}</textarea>`:''}
      <div class="cbtns"><button class="tbtn pri" onclick="executePending()">Execute ${r.m}</button>
      <button class="tbtn sec" onclick="closeDrawer()">Cancel</button></div></div>`;
    return;
  }
  await execute(r, s.picker, mid);
}
async function executePending(){
  if(!pendingRun) return;
  const m = MISSIONS.find(x=>x.id===pendingRun.mid), s = m.steps[pendingRun.i];
  const r = pendingRun.alt ? s.run2 : s.run;
  const bodyEl = document.getElementById('cbody');
  const body = bodyEl ? bodyEl.value : r.body;
  pendingRun=null;
  await execute({...r, body, _resolvedBody:true}, null, m.id);
}
async function execute(r, picker, mid){
  dBody.innerHTML = `<div class="spin">Calling ${esc(resolve(r.p))} …</div>`;
  dMeta.innerHTML='';
  let out;
  try{
    const res = await fetch('/run',{method:'POST',headers:{'content-type':'application/json'},
      body: JSON.stringify({ base:VARS.BASE_URL, method:r.m, apiPath:resolve(r.p), token:VARS.TOKEN,
        body: r.body ? (r._resolvedBody ? r.body : resolve(r.body)) : undefined })});
    out = await res.json();
  }catch(e){ out = {status:0, ms:0, error:String(e)}; }
  dMeta.innerHTML = statusPill(out.status, out.ms||0) + (out.error?`<span class="pill-ex">${esc(out.error)}</span>`:'');
  let parsed=null; try{ parsed = JSON.parse(out.body); }catch{}
  /* run history */
  HISTORY.unshift({ts:Date.now(), m:r.m, path:resolve(r.p), status:out.status, ms:out.ms||0,
    body:(out.body||'').slice(0,100000), reqBody: r.body ? (r._resolvedBody ? r.body : resolve(r.body)) : null,
    error: out.error||null});
  if(HISTORY.length>50) HISTORY.pop();
  updateBadges();
  /* cleanup tracker: successful create -> derive DELETE path */
  if(r.m==='POST' && parsed && out.status>=200 && out.status<300){
    const obj = Object.values(parsed).find(v=>v && typeof v==='object' && !Array.isArray(v) && v.id!==undefined);
    if(obj){
      const basePath = resolve(r.p).split('?')[0];
      CREATED.unshift({ts:Date.now(), label:(obj.name||obj.username||basePath.split('/').pop())+' #'+obj.id,
        delPath: basePath.replace(/\/$/,'')+'/'+obj.id});
      updateBadges();
    }
  }
  if(out.error && !out.body){ dBody.innerHTML=`<div class="spin">No response body.</div>`; return; }
  /* auto-capture */
  if(r.cap && parsed && out.status>=200 && out.status<300){
    const v = getPath(parsed, r.cap.path);
    if(v!==undefined){ VARS[r.cap.v]=String(v); flash(`Captured $${r.cap.v} = ${v}`); renderVars(); }
  }
  /* picker mode */
  if(picker && parsed && out.status>=200 && out.status<300){
    const list = findList(parsed);
    if(list && list.length){
      currentPicker = picker; pickerRows = list;
      dFilter.style.display='block';
      renderPickerRows('');
      return;
    }
  }
  showJSON(dBody, out.body||'');
}
function renderPickerRows(q){
  const ql=q.toLowerCase();
  const rows = pickerRows.filter(it=>JSON.stringify(it).toLowerCase().includes(ql)).slice(0,300);
  dBody.innerHTML = `<p class="pickhint">Click a row to capture <b>$${currentPicker.var}</b> — ${rows.length} shown</p>`+
    rows.map((it,idx)=>{
      const label = getPath(it,currentPicker.label) ?? it.name ?? '(no name)';
      const sub = currentPicker.sub ? (getPath(it,currentPicker.sub)??'') : '';
      const sel = String(it.id)===VARS[currentPicker.var];
      return `<div class="pkrow ${sel?'sel':''}" onclick="pick(${idx})">
        <span class="pkid">#${esc(String(it.id))}</span><span class="pklabel">${esc(String(label))}</span>
        ${sub?`<span class="pksub">${esc(String(sub))}</span>`:''}${sel?'<span class="pksel">✓ captured</span>':''}</div>`;
    }).join('');
}
function pick(idx){
  const q=dFilter.value, ql=q.toLowerCase();
  const rows = pickerRows.filter(it=>JSON.stringify(it).toLowerCase().includes(ql)).slice(0,300);
  const it = rows[idx]; if(!it) return;
  VARS[currentPicker.var] = String(it.id);
  VLABELS[currentPicker.var] = String(getPath(it,currentPicker.label) ?? it.name ?? '');
  flash(`Captured $${currentPicker.var} = ${it.id} (${VLABELS[currentPicker.var]})`);
  renderVars(); renderPickerRows(q);
}
dFilter.addEventListener('input',()=>renderPickerRows(dFilter.value));
function flash(msg){
  const f=document.getElementById('flash'); f.textContent=msg; f.classList.add('show');
  setTimeout(()=>f.classList.remove('show'),2200);
}
async function runAdhoc(m,p){ /* guide + browse GETs */
  openDrawer(`${m} ${resolve(p)}`);
  await execute({m,p},null,null);
}

/* ============ RUN HISTORY & CLEANUP ============ */
const HISTORY=[], CREATED=[];
function updateBadges(){
  const h=document.getElementById('histbadge'), c=document.getElementById('cleanbadge');
  if(h) h.textContent=HISTORY.length; if(c) c.textContent=CREATED.length;
  const cb=document.getElementById('cleanbtn'); if(cb) cb.style.display = CREATED.length? 'inline-flex':'none';
}
function fmtT(ts){ const d=new Date(ts); return d.toTimeString().slice(0,8); }
function showHistory(){
  openDrawer('Run history — this session');
  if(!HISTORY.length){ dBody.innerHTML='<div class="spin">Nothing run yet. Hit ▶ Run on any step.</div>'; return; }
  dBody.innerHTML = HISTORY.map((h,i)=>`
    <div class="hrow">
      <div class="hline"><span class="pill-st ${h.status>=200&&h.status<300?'ok':h.status===0?'err':'warn'}">${h.status||'ERR'}</span>
        <span class="method m-${h.m}">${h.m}</span><code>${esc(h.path)}</code></div>
      <div class="hline2"><span>${fmtT(h.ts)} · ${h.ms} ms${h.error?' · '+esc(h.error):''}</span>
        <button class="hbtn" onclick="histView(${i})">view</button>
        <button class="hbtn" onclick="histRerun(${i})">re-run</button></div>
    </div>`).join('');
}
function histView(i){ const h=HISTORY[i]; openDrawer(`${h.m} ${h.path}`);
  dMeta.innerHTML = statusPill(h.status,h.ms); showJSON(dBody, h.body||''); }
function histRerun(i){ const h=HISTORY[i];
  if(h.m==='GET') return execute({m:h.m,p:h.path},null,null);
  openDrawer(`${h.m} ${h.path}`);
  pendingRun=null;
  dBody.innerHTML = `<div class="confirm"><p class="cwarn">Re-run will execute against <b>${esc(VARS.BASE_URL)}</b> again.</p>
    ${h.reqBody?`<p class="clbl">Payload:</p><textarea id="cbody" spellcheck="false">${esc(h.reqBody)}</textarea>`:''}
    <div class="cbtns"><button class="tbtn pri" onclick='execute({m:${JSON.stringify(h.m)},p:${JSON.stringify(h.path)},body:document.getElementById("cbody")?document.getElementById("cbody").value:null,_resolvedBody:true},null,null)'>Execute ${h.m}</button>
    <button class="tbtn sec" onclick="closeDrawer()">Cancel</button></div></div>`;
}
function showCleanup(){
  openDrawer('Created by Atlas — cleanup');
  if(!CREATED.length){ dBody.innerHTML='<div class="spin">Nothing created via Run yet.</div>'; return; }
  dBody.innerHTML = `<p class="pickhint">Everything Atlas created this session. Delete is permanent and asks to confirm.</p>`+
    CREATED.map((c,i)=>`
    <div class="hrow"><div class="hline"><span class="pklabel">${esc(c.label)}</span></div>
      <div class="hline2"><code style="font-size:11px">${esc(c.delPath)}</code>
        <button class="hbtn danger" onclick="cleanDelete(${i})">DELETE</button>
        <button class="hbtn" onclick="CREATED.splice(${i},1);updateBadges();showCleanup()">dismiss</button></div></div>`).join('');
}
function cleanDelete(i){
  const c=CREATED[i];
  openDrawer(`DELETE ${c.delPath}`);
  dBody.innerHTML = `<div class="confirm"><p class="cwarn">Permanently delete <b>${esc(c.label)}</b> on <b>${esc(VARS.BASE_URL)}</b>? No undo.</p>
    <div class="cbtns"><button class="tbtn pri" onclick='CREATED.splice(${i},1);updateBadges();execute({m:"DELETE",p:${JSON.stringify(c.delPath)}},null,null)'>Execute DELETE</button>
    <button class="tbtn sec" onclick="closeDrawer()">Cancel</button></div></div>`;
}

/* ============ ENVIRONMENT PROFILES ============ */
const LS_KEY='atlas-profiles';
function lsGet(){ try{ return JSON.parse(localStorage.getItem(LS_KEY)||'{}'); }catch{ return {}; } }
function lsSet(o){ try{ localStorage.setItem(LS_KEY, JSON.stringify(o)); }catch{} }
function refreshProfileSelect(){
  const sel=document.getElementById('profsel'); if(!sel) return;
  const names=Object.keys(lsGet());
  sel.innerHTML='<option value="">— profiles —</option>'+names.map(n=>`<option>${esc(n)}</option>`).join('');
}
function saveProfile(){
  const name=prompt('Profile name (e.g. lab, customerA):'); if(!name) return;
  const incTok=document.getElementById('inctok').checked;
  const all=lsGet(); const v={...VARS}; if(!incTok) v.TOKEN='';
  all[name]={vars:v, labels:{...VLABELS}};
  lsSet(all); refreshProfileSelect(); flash(`Saved profile "${name}"${incTok?' (with token)':''}`);
}
function loadProfile(){
  const name=document.getElementById('profsel').value; if(!name) return;
  const p=lsGet()[name]; if(!p) return;
  Object.keys(VARS).forEach(k=>VARS[k]=p.vars[k]||'');
  Object.keys(VLABELS).forEach(k=>delete VLABELS[k]); Object.assign(VLABELS,p.labels||{});
  bindVarInputs(document); renderVars(); flash(`Loaded "${name}"`);
}
function deleteProfile(){
  const name=document.getElementById('profsel').value; if(!name) return;
  const all=lsGet(); delete all[name]; lsSet(all); refreshProfileSelect(); flash(`Deleted "${name}"`);
}
function exportProfiles(){
  const blob=new Blob([JSON.stringify({profiles:lsGet(), exported:new Date().toISOString()},null,2)],{type:'application/json'});
  dl(blob,'atlas-profiles.json'); flash('Exported — keep this file out of git if it holds tokens');
}
function importProfiles(inp){
  const f=inp.files[0]; if(!f) return;
  f.text().then(t=>{ try{
    const j=JSON.parse(t); lsSet({...lsGet(), ...(j.profiles||j)});
    refreshProfileSelect(); flash('Profiles imported');
  }catch{ flash('Invalid profiles file'); } });
  inp.value='';
}
function dl(blob,name){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000); }

/* ============ CODE GENERATORS ============ */
function genCurl(r){
  let c=`curl -s -X ${r.m} '{{BASE_URL}}${r.p}' \\\n  -H 'authorization: Bearer {{TOKEN}}'`;
  if(r.body) c+=` \\\n  -H 'content-type: application/json' \\\n  -d '${r.body}'`;
  return c;
}
function genPy(r){
  let s=`import requests\n\nr = requests.${r.m.toLowerCase()}(\n    "{{BASE_URL}}${r.p}",\n    headers={"authorization": "Bearer {{TOKEN}}"},`;
  if(r.body) s+=`\n    json=${r.body},`;
  s+=`\n    verify=False,  # self-signed lab cert\n)\nprint(r.status_code)\nprint(r.json())`;
  return s;
}
function genPS(r){
  let s=`$headers = @{ authorization = "Bearer {{TOKEN}}" }\nInvoke-RestMethod -Method ${r.m} \`\n  -Uri "{{BASE_URL}}${r.p}" \`\n  -Headers $headers`;
  if(r.body) s+=` \`\n  -ContentType 'application/json' \`\n  -Body @'\n${r.body}\n'@`;
  s+=`\n# PS7+: add -SkipCertificateCheck for self-signed labs`;
  return s;
}
function genAnsible(r){
  let s=`- name: ${r.m} ${r.p}\n  ansible.builtin.uri:\n    url: "{{BASE_URL}}${r.p}"\n    method: ${r.m}\n    headers:\n      authorization: "Bearer {{TOKEN}}"\n    validate_certs: false`;
  if(r.body){ s+=`\n    body_format: json\n    body: >-\n      ${r.body.replace(/\n/g,'\n      ')}`; }
  s+=`\n    status_code: [200, 201]`;
  return s;
}
const LANGS=[['curl',null],['Python',genPy],['PowerShell',genPS],['Ansible',genAnsible]];
function langTabs(m,i,s){
  if(!s.run) return '';
  return `<div class="langtabs">`+LANGS.map(([n],li)=>
    `<button class="ltab ${li===0?'on':''}" onclick="switchLang('${m.id}-${i}',${li},this)">${n}</button>`).join('')+`</div>`;
}
function switchLang(key,li,btn){
  const step=document.getElementById('st-'+key);
  btn.parentNode.querySelectorAll('.ltab').forEach(b=>b.classList.remove('on')); btn.classList.add('on');
  step.querySelectorAll('.langpane').forEach((p,idx)=>p.style.display = idx===li?'block':'none');
  renderVars();
}

/* ============ MISSION EXPORT ============ */
function exportPostman(mid){
  const m=MISSIONS.find(x=>x.id===mid);
  const items=m.steps.filter(s=>s.run).map(s=>{
    const r=s.run, [pth,q]=r.p.split('?');
    return { name:s.title,
      request:{ method:r.m,
        header:[{key:'authorization',value:'Bearer {{TOKEN}}'},...(r.body?[{key:'content-type',value:'application/json'}]:[])],
        url:{ raw:'{{BASE_URL}}'+r.p, host:['{{BASE_URL}}'], path:pth.replace(/^\//,'').split('/'),
          query:(q||'').split('&').filter(Boolean).map(kv=>{const [k,v]=kv.split('=');return{key:k,value:v||''}}) },
        ...(r.body?{body:{mode:'raw',raw:r.body,options:{raw:{language:'json'}}}}:{}) } };
  });
  const col={ info:{ name:`Morpheus Atlas — Mission ${m.id}: ${m.title}`,
      schema:'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    item:items,
    variable:[ {key:'BASE_URL',value:VARS.BASE_URL||'https://morpheus.yourco.com'},
      {key:'TOKEN',value:''} ,
      ...Object.keys(VARS).filter(k=>!['BASE_URL','TOKEN'].includes(k)&&VARS[k]).map(k=>({key:k,value:VARS[k]}))] };
  dl(new Blob([JSON.stringify(col,null,2)],{type:'application/json'}), `atlas-mission-${m.id}.postman_collection.json`);
  flash('Postman collection exported (token left blank)');
}
function exportBash(mid){
  const m=MISSIONS.find(x=>x.id===mid);
  let out=`#!/usr/bin/env bash\n# Morpheus Atlas — Mission ${m.id}: ${m.title}\nset -euo pipefail\n\nBASE_URL="${VARS.BASE_URL||'https://morpheus.yourco.com'}"\nTOKEN="\${MORPHEUS_TOKEN:?export MORPHEUS_TOKEN first}"\n`;
  const used=new Set(); m.steps.forEach(s=>{ if(s.run) (s.run.p+(s.run.body||'')).replace(/\{\{(\w+)\}\}/g,(_,k)=>{used.add(k);return ''}); });
  used.delete('BASE_URL'); used.delete('TOKEN');
  [...used].forEach(k=>out+=`${k}="${VARS[k]||''}"\n`);
  out+='\n';
  m.steps.forEach((s,i)=>{ if(!s.run) return; const r=s.run;
    out+=`# Step ${i+1}: ${s.title}\ncurl -sk -X ${r.m} "\$BASE_URL${r.p.replace(/\{\{(\w+)\}\}/g,'$$$1')}" \\\n  -H "authorization: Bearer \$TOKEN"`;
    if(r.body) out+=` \\\n  -H 'content-type: application/json' \\\n  -d '${r.body.replace(/\{\{(\w+)\}\}/g,"'\"\$$1\"'")}'`;
    out+='\necho\n\n';
  });
  dl(new Blob([out],{type:'text/x-shellscript'}), `atlas-mission-${m.id}.sh`);
  flash('Bash script exported (reads MORPHEUS_TOKEN from env)');
}

/* ============ UI → API MAP (G2) ============ */
const UIMAP=[
["Provisioning › Instances › + Add","POST","/api/instances","02"],
["Provisioning › Instances › Actions › Stop","PUT","/api/instances/{id}/stop","08"],
["Provisioning › Instances › Actions › Start","PUT","/api/instances/{id}/start","08"],
["Provisioning › Instances › Actions › Restart","PUT","/api/instances/{id}/restart",""],
["Provisioning › Instances › Actions › Resize","PUT","/api/instances/{id}/resize","08"],
["Provisioning › Instances › Actions › Create Snapshot","PUT","/api/instances/{id}/snapshot","08"],
["Provisioning › Instances › Actions › Revert to Snapshot","PUT","/api/instances/{id}/revert-snapshot/{snapshotId}",""],
["Provisioning › Instances › Actions › Delete","DELETE","/api/instances/{id}","08"],
["Provisioning › Instances › instance › History tab","GET","/api/instances/{id}/history","10"],
["Provisioning › Apps › + Add","POST","/api/apps",""],
["Provisioning › Approvals","GET","/api/approvals","03"],
["Provisioning › Approvals › item › Approve","PUT","/api/approval-items/{id}/approve","03"],
["Provisioning › Approvals › item › Deny","PUT","/api/approval-items/{id}/deny","03"],
["Provisioning › Code › Deployments","GET","/api/deployments",""],
["Infrastructure › Groups › + Create","POST","/api/groups",""],
["Infrastructure › Groups › group › Policies › + Add","POST","/api/groups/{groupId}/policies","03"],
["Infrastructure › Clouds › + Add","POST","/api/zones",""],
["Infrastructure › Clouds › cloud › Policies › + Add","POST","/api/zones/{id}/policies",""],
["Infrastructure › Clusters › + Add Cluster","POST","/api/clusters","04"],
["Infrastructure › Clusters › cluster › Kubeconfig","GET","/api/clusters/{clusterId}/api-config","04"],
["Infrastructure › Clusters › cluster › Add Worker","PUT","/api/clusters/{clusterId}/add-server",""],
["Infrastructure › Hosts","GET","/api/servers",""],
["Infrastructure › Network › Networks","GET","/api/networks",""],
["Infrastructure › Network › IP Pools","GET","/api/networks/pools",""],
["Infrastructure › Network › Security Groups","GET","/api/security-groups",""],
["Infrastructure › Load Balancers","GET","/api/load-balancers",""],
["Library › Blueprints › Instance Types › + Add","POST","/api/library/instance-types",""],
["Library › Blueprints › Layouts","GET","/api/library/layouts",""],
["Library › Blueprints › Cluster Layouts","GET","/api/library/cluster-layouts","04"],
["Library › Blueprints › App Blueprints","GET","/api/blueprints",""],
["Library › Automation › Tasks › + Add","POST","/api/tasks","05"],
["Library › Automation › Tasks › task › Execute","POST","/api/tasks/{id}/execute","05"],
["Library › Automation › Workflows › + Add","POST","/api/task-sets","15"],
["Library › Automation › Workflows › Execute","POST","/api/task-sets/{id}/execute","15"],
["Library › Automation › Scheduling › Execute Schedules","POST","/api/execute-schedules","05"],
["Library › Jobs › + Add","POST","/api/jobs","05"],
["Library › Jobs › Job Executions","GET","/api/job-executions","05"],
["Library › Options › Option Lists","GET","/api/library/option-type-lists",""],
["Library › Virtual Images","GET","/api/virtual-images",""],
["Library › Services › Catalog Items","GET","/api/catalog-item-types",""],
["Tools › Cypher › + Add Key","POST","/api/cypher/{cypherPath}","15"],
["Tools › Wiki","GET","/api/wiki/pages",""],
["Tools › Archives","GET","/api/archives/buckets",""],
["Monitoring › Checks","GET","/api/monitoring/checks",""],
["Monitoring › Incidents","GET","/api/monitoring/incidents",""],
["Backups › Jobs","GET","/api/backups",""],
["Administration › Tenants › + Create","POST","/api/accounts","07"],
["Administration › Tenants › tenant › Users › + Add","POST","/api/accounts/{accountId}/users","07"],
["Administration › Users","GET","/api/users",""],
["Administration › Roles","GET","/api/roles","07"],
["Administration › Policies › + Add (global)","POST","/api/policies","11"],
["Administration › Integrations › + New","POST","/api/integrations","06"],
["Administration › Health","GET","/api/health","10"],
["Administration › Health › Alarms","GET","/api/health/alarms","10"],
["Administration › Health › Alarm › Acknowledge","PUT","/api/health/alarms/{id}/acknowledge","10"],
["Administration › Settings › Appliance","GET","/api/appliance-settings",""],
["Administration › Support Bundles › + New","POST","/api/support-bundles","10"],
["User menu › User Settings › API Access","GET","/api/whoami","01"],
["Operations › Billing / Usage","GET","/api/billing/account",""]
];
function renderUimap(){
  V.innerHTML = `
   <div class="mhead"><button class="back" onclick="go('#/')">← All missions</button>
   <h1 class="mt">UI click → <span class="g">API call</span></h1>
   <p class="lede">You know where it is in the Morpheus UI — this maps it to the endpoint. Type to filter.</p></div>
   <div class="idxsearch" style="max-width:860px;margin-bottom:14px"><input id="uiq" placeholder="Filter: e.g. snapshot, tenant, approve…" autocomplete="off" oninput="drawUimap(this.value)" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:11px 14px;font-family:var(--sans);font-size:14px;outline:none"></div>
   <div class="eplist" id="uimaplist"></div>`;
  drawUimap(''); setNav('uimap');
}
function drawUimap(q){
  const ql=(q||'').toLowerCase();
  const rows=UIMAP.filter(r=>(r[0]+r[1]+r[2]).toLowerCase().includes(ql));
  document.getElementById('uimaplist').innerHTML = rows.map(r=>`
    <div class="eprow"><div class="ephead" style="cursor:default">
      <span class="uipath">${esc(r[0])}</span>
      <span class="method m-${r[1]}" style="margin-left:auto">${r[1]}</span><code>${esc(r[2])}</code>
      ${r[3]?`<span class="mlink" onclick="go('#/mission/${r[3]}')">Mission ${r[3]}</span>`:''}
    </div></div>`).join('') || '<p class="rescount">No match.</p>';
}

/* ============ GROUP INTROS ============ */
const INTROS = {
 "approvals":"When a provision-approval policy catches a request, it lands here. You list approval requests, then approve or deny their items. Nothing provisions until you do.",
 "policies":"Policies are rules attached to a scope — quotas, naming standards, shutdown schedules, approval gates. Where you create one (global, group, cloud) decides what it governs.",
 "groups":"Groups are where instances live ('Production', 'Dev-APJ'). They bundle clouds plus the policies and permissions that govern provisioning into them.",
 "zones":"A cloud in Morpheus is called a zone: your vCenter, AWS account, HPE VME cluster, etc. Everything provisions into a zone through a group.",
 "instances":"Instances are the workloads Morpheus manages — VMs and app stacks. Provision, resize, stop/start, snapshot, and tear down from here.",
 "clusters":"Kubernetes (MKS/EKS/AKS/GKE) and HVM/KVM clusters. Create, scale, upgrade, and pull kubeconfig/api-config from here.",
 "servers":"Hosts and bare-metal/VM servers underneath your workloads — including managed and unmanaged (brownfield) machines.",
 "networks":"Networks, subnets, pools, proxies, domains, routers, and floating IPs across all clouds — the largest API family.",
 "library":"The provisioning catalog: instance types, layouts, node types, cluster layouts, option lists, spec templates. This is what users pick from when they provision.",
 "tasks":"Single automation actions — a bash/python script, an Ansible playbook, an HTTP call. Run ad-hoc, in workflows, or on a schedule via jobs.",
 "task-sets":"Workflows: ordered chains of tasks that run during provisioning phases or on demand.",
 "jobs":"A job binds a task or workflow to a schedule and a target — this is how you run automation on cron.",
 "execute-schedules":"Cron-style schedules. Attach them to jobs to run automation on a timer.",
 "integrations":"External systems wired into Morpheus: ServiceNow, Ansible Tower, Git, IPAM, DNS. Create one here, then reference its ID in policies or tasks.",
 "accounts":"Tenants. Each account is an isolated customer/BU with its own users, roles, groups, and visibility.",
 "roles":"RBAC role definitions — feature access, group access, cloud access. Assign to users to control what they can see and do.",
 "users":"User management within a tenant: create, update, permissions, and API access.",
 "monitoring":"Checks, incidents, alerts, and contacts — Morpheus' built-in monitoring layer.",
 "backups":"Backup jobs, results, and restores across providers.",
 "load-balancers":"LB providers, virtual servers, pools, and profiles (F5, NSX, HAProxy…).",
 "security-groups":"Firewall rule collections synced with clouds and applied at provision time.",
 "apps":"Multi-tier application deployments built from blueprints.",
 "blueprints":"App blueprints (Morpheus, Terraform, ARM, CloudFormation, Helm) that define full stacks.",
 "deployments":"Versioned artifacts (code/files) you push onto instances — Morpheus' lightweight CD.",
 "cypher":"Secret storage. Keys, passwords, and generated secrets referenced from scripts as cypher://.",
 "virtual-images":"OS images and templates synced or uploaded, used by node types for provisioning.",
 "provision-types":"The provisioning engines available (VMware, AWS, KVM, Docker…) and their capabilities.",
 "service-plans":"T-shirt sizes: CPU/RAM/disk combos users pick at provision time; also drives pricing.",
 "catalog":"Self-service catalog items — the simplified 'order this' layer on top of instance types and blueprints.",
 "whoami":"Returns your user, role, and permissions for the token you're using — the standard connectivity test.",
 "ping":"Unauthenticated liveness check. Returns appliance version and setup state.",
 "health":"Appliance health: alarms, logs, and system status.",
 "billing":"Usage and cost data per tenant/instance — the raw feed for showback and metering.",
 "support-bundles":"Generate and download appliance diagnostic bundles for HPE support — no SSH needed."
};
const introFor = g => INTROS[g] || `Endpoints for ${g.replace(/-/g,' ')}.`;

/* ============ RENDER: HOME ============ */
const V = document.getElementById('view');
const P = {};
function tagCls(t){return t==='basic'?'tg-basic':t==='adv'?'tg-adv':'tg-core'}
function tagName(t){return t==='basic'?'Basic':t==='adv'?'Advanced':'Core'}

function renderHome(){
  const cards = MISSIONS.map(m=>{
    const done=(P[m.id]||new Set()).size, tot=m.steps.length, pct=Math.round(done/tot*100);
    return `<div class="mcard" onclick="go('#/mission/${m.id}')">
      <span class="mtag ${tagCls(m.tag)}">${tagName(m.tag)} · ${m.id}</span>
      <h3>${m.title}</h3><p>${m.goal}</p>
      <div class="mmeta"><span>⏱ ${m.time}</span><span>${m.calls} calls</span><span class="go">→</span></div>
      <div class="mprog"><i style="width:${pct}%"></i></div></div>`;
  }).join('');
  V.innerHTML = `
   <div class="hero">
     <span class="eyebrow">✦ Morpheus API v9.0 · learn by doing · run from the browser</span>
     <h1 class="big">The Morpheus API,<br><span class="g">explained like you're new here.</span></h1>
     <p class="lede">Set your appliance URL and token once. Every command rewrites itself with your values — and the <b>Run</b> button executes it right here, output on screen. Deploy this container next to Morpheus and the whole API becomes a guided lab.</p>
     <div class="statrow">
       <div class="stat"><b>${DATA.meta.count.toLocaleString()}</b><span>endpoints indexed</span></div>
       <div class="stat"><b>${MISSIONS.length}</b><span>guided missions</span></div>
       <div class="stat"><b>1</b><span>patterns guide</span></div>
     </div>
   </div>
   <h2 class="sectionT">Guided missions</h2>
   <p class="sectionS">Real workflows, step by step. Read-only steps run instantly; anything that changes state asks you to confirm first.</p>
   <div class="mgrid">${cards}
     <div class="mcard guide" onclick="go('#/guide')">
       <span class="mtag" style="color:#0F172A;background:#E2E8F0">Reference</span>
       <h3>API patterns cheat-sheet</h3><p>Pagination, filtering, the {id}/{action} verb pattern, and how to decode every error code. One page that makes all ${DATA.meta.count.toLocaleString()} endpoints predictable.</p>
       <div class="mmeta"><span>📖 5 min read</span><span class="go">→</span></div></div>
     <div class="mcard guide" onclick="go('#/uimap')">
       <span class="mtag" style="color:#0F172A;background:#E2E8F0">Reference</span>
       <h3>UI click → API call map</h3><p>You know where it lives in the Morpheus UI — this table maps ~60 common clicks straight to their endpoint and mission.</p>
       <div class="mmeta"><span>🗺 lookup table</span><span class="go">→</span></div></div>
   </div>`;
  setNav('home');
}

/* ============ RENDER: MISSION ============ */
const missionEPs = {};
MISSIONS.forEach(m=>m.steps.forEach(s=>(s.eps||[]).forEach(e=>missionEPs[e[0]+' '+e[1]]=m.id)));

function varSummary(m){
  const used = new Set();
  m.steps.forEach(s=>{ (s.needs||[]).forEach(v=>used.add(v));
    if(s.capture)used.add(s.capture.v); if(s.capture2)used.add(s.capture2.v);
    if(s.picker)used.add(s.picker.var); if(s.run&&s.run.cap)used.add(s.run.cap.v); });
  if(!used.size) return '';
  return `<div class="vsum">${[...used].map(v=>`
    <span class="vchip" data-var="${v}"><b>$${v}</b><span class="val">not set</span></span>`).join('')}</div>`;
}
function stepHTML(m,s,i){
  const eps = (s.eps||[]).map(e=>`<span class="epchip"><span class="method m-${e[0]}">${e[0]}</span><code>${e[1]}</code></span>`).join('');
  const cap = c => c?`<div class="capture"><label>Capture <code style="font-family:var(--mono)">$${c.v}</code></label>
      <input data-var="${c.v}" placeholder="${c.ph}" autocomplete="off"><small>← ${c.hint}</small></div>`:'';
  const needsAttr = (s.needs||[]).join(',');
  const btns = [
    s.run?`<button class="tbtn run runbtn" data-needs="${needsAttr}" onclick="runStep('${m.id}',${i})">▶ Run</button>`:'',
    s.run2?`<button class="tbtn run runbtn" data-needs="${(s.run2.needs||[]).join(',')}" onclick="runStep('${m.id}',${i},1)">▶ ${s.run2.label||'Run 2'}</button>`:'',
    s.curl?`<button class="tbtn pri" onclick="tgStep('${m.id}-${i}','curl')">Show command</button>`:'',
    s.resp?`<button class="tbtn sec" onclick="tgStep('${m.id}-${i}','resp')">Expected response</button>`:''
  ].join('');
  return `<div class="step" id="st-${m.id}-${i}">
    <div class="stepnum">${i+1}</div>
    <div class="scard">
      <div class="staterow"><span class="stage">${s.stage}</span>
        <span class="safety ${s.safety[0]}">${s.safety[1]}</span>
        <button class="donebox" onclick="markDone('${m.id}',${i})"><span class="bx"></span>Mark done</button></div>
      <h3>${s.title}</h3><p class="plain">${s.plain}</p>
      ${eps?`<div class="chips">${eps}</div>`:''}
      ${s.showVars?varSummary(m):''}
      ${cap(s.capture)}${cap(s.capture2)}
      ${btns?`<div class="btnrow">${btns}</div>`:''}
      ${s.curl?`<div class="term">${langTabs(m,i,s)}<div class="tbar"><i class="tdot td-r"></i><i class="tdot td-y"></i><i class="tdot td-g"></i><span>terminal</span>
        <button class="copybtn" onclick="copyBlock(this)">Copy</button></div><pre class="langpane">${curlHTML(s.curl)}</pre>${s.run?LANGS.slice(1).map(([n,fn])=>`<pre class="langpane" style="display:none">${curlHTML(fn(s.run))}</pre>`).join(''):''}</div>`:''}
      ${s.resp?`<div class="resp"><div class="tbar"><i class="tdot td-g"></i><span>200 OK — what success looks like</span></div><pre>${esc(s.resp)}</pre></div>`:''}
      ${s.note?`<div class="note"><b>${s.note.h}</b>${s.note.t}</div>`:''}
    </div></div>`;
}
function renderMission(id){
  const m = MISSIONS.find(x=>x.id===id); if(!m){go('#/');return}
  const idx = MISSIONS.indexOf(m), next = MISSIONS[idx+1];
  V.innerHTML = `
   <div class="mhead">
     <button class="back" onclick="go('#/')">← All missions</button>
     <div><span class="mtag ${tagCls(m.tag)}">${tagName(m.tag)} · Mission ${m.id}</span></div>
     <h1 class="mt">${m.title.replace(/(approval|instance|kubeconfig|schedule|ServiceNow|RBAC|snapshot|alarms|guardrails|Cypher)/i,'<span class="g">$1</span>')}</h1>
     <p class="lede">${m.goal}</p>
   </div>
   <div class="progressbar"><div class="lbl"><span>Mission progress</span><b id="ptext"></b></div><div class="pb"><i id="pfill"></i></div></div>
   <div class="exportrow"><button class="tbtn sec" onclick="exportPostman('${m.id}')">⬇ Postman collection</button>
     <button class="tbtn sec" onclick="exportBash('${m.id}')">⬇ Bash script</button></div>
   <div class="steps">${m.steps.map((s,i)=>stepHTML(m,s,i)).join('')}
     <div class="step"><div class="stepnum" style="background:var(--grad);border-color:transparent;color:#fff">✓</div>
       <div class="scard"><div class="staterow"><span class="stage" style="color:var(--secondary)">Outcome</span></div>
         <h3>${m.outcome.title}</h3>
         <div class="split">
           <div class="out ok"><span class="tag">If it worked</span><p>${m.outcome.ok}</p></div>
           <div class="out no"><span class="tag">If it didn't</span><p>${m.outcome.no}</p></div>
         </div></div></div>
   </div>
   ${next?`<div class="nextcard"><div><div class="tt">Next mission: ${next.title}</div><div class="ss">${tagName(next.tag)} · ${next.time}</div></div>
     <button onclick="go('#/mission/${next.id}')">Continue →</button></div>`:''}`;
  bindVarInputs(V);
  (P[id]||new Set()).forEach(i=>{const el=document.getElementById(`st-${id}-${i}`);if(el)el.classList.add('done')});
  updateProg(m); renderVars(); setNav('home');
}
function markDone(id,i){
  P[id] = P[id]||new Set();
  P[id].has(i)?P[id].delete(i):P[id].add(i);
  document.getElementById(`st-${id}-${i}`).classList.toggle('done');
  updateProg(MISSIONS.find(x=>x.id===id));
}
function updateProg(m){
  const done=(P[m.id]||new Set()).size, tot=m.steps.length;
  const f=document.getElementById('pfill'); if(f) f.style.width=(done/tot*100)+'%';
  const t=document.getElementById('ptext'); if(t) t.textContent=`${done} / ${tot} steps`;
}
function tgStep(key,kind){ document.getElementById('st-'+key).classList.toggle('open-'+kind); }

/* ============ RENDER: GUIDE (G1) ============ */
function renderGuide(){
  V.innerHTML = `
   <div class="mhead"><button class="back" onclick="go('#/')">← All missions</button>
   <h1 class="mt">API patterns <span class="g">cheat-sheet</span></h1>
   <p class="lede">Six patterns cover the whole API. Learn these and all ${DATA.meta.count.toLocaleString()} endpoints become predictable. The Run buttons work here too.</p></div>
   <div class="guide">

   <div class="scard gsec"><h3>1 · Anatomy of every call</h3>
   <p class="plain">Base URL + <code>/api/…</code> path + <code>authorization: Bearer</code> header. Writes add <code>content-type: application/json</code> and a JSON body wrapped in a named object (<code>{"instance": {…}}</code>, <code>{"policy": {…}}</code> — the wrapper matches the resource).</p></div>

   <div class="scard gsec"><h3>2 · Pagination: max & offset</h3>
   <p class="plain">Lists default to <b>25 rows</b>. <code>?max=100</code> raises the page size, <code>?offset=100</code> skips ahead. Every list response ends with a <code>meta</code> block (<code>total</code>, <code>size</code>, <code>offset</code>) — loop until <code>offset + size ≥ total</code>. If a script "misses" resources, this is almost always why.</p>
   <div class="btnrow"><button class="tbtn run runbtn" data-needs="" onclick="runAdhoc('GET','/api/groups?max=2')">▶ Try: /api/groups?max=2</button></div></div>

   <div class="scard gsec"><h3>3 · Filtering & sorting</h3>
   <p class="plain"><code>?phrase=web</code> = fuzzy search across name-ish fields (most lists). <code>?name=web-prod-01</code> = exact match. Sort with <code>?sort=name&direction=desc</code>. Combine freely: <code>?phrase=prod&max=100&sort=name</code>.</p></div>

   <div class="scard gsec"><h3>4 · The {id}/{action} verb pattern</h3>
   <p class="plain">State changes are <code>PUT /api/&lt;resource&gt;/{id}/&lt;verb&gt;</code>: <code>stop</code>, <code>start</code>, <code>restart</code>, <code>suspend</code>, <code>backup</code>, <code>approve</code>, <code>deny</code>, <code>execute</code>, <code>acknowledge</code>… If you can click it in the UI, it's almost certainly this shape. Mission 08 drills it.</p></div>

   <div class="scard gsec"><h3>5 · Scoped creation</h3>
   <p class="plain"><b>Where you POST decides what it governs.</b> <code>/api/policies</code> = global; <code>/api/groups/{id}/policies</code> = that group; <code>/api/zones/{id}/policies</code> = that cloud; <code>/api/accounts/{id}/users</code> = inside that tenant. The URL is the scope.</p></div>

   <div class="scard gsec"><h3>6 · Decoding errors</h3>
   <p class="plain">
   <span class="errrow"><b>400</b> — malformed request: bad JSON, wrong query param.</span>
   <span class="errrow"><b>401</b> — token missing/expired. Fix the header, not the payload.</span>
   <span class="errrow"><b>403</b> — token valid, role lacks the permission. RBAC, not auth.</span>
   <span class="errrow"><b>404</b> — wrong ID or wrong path. IDs are per-resource — a group id is not a zone id.</span>
   <span class="errrow"><b>422</b> — validation failed. The body's <code>errors</code> object names the exact field. Read it before changing anything else.</span>
   <span class="errrow"><b>500</b> — appliance-side error. /api/health and the health logs are your next stop (Mission 10).</span></p></div>
   </div>`;
  renderVars(); setNav('guide');
}

/* ============ RENDER: BROWSE / GROUP / SEARCH ============ */
function groupCounts(){
  const g={}; EPS.forEach(e=>g[e.g]=(g[e.g]||0)+1);
  return Object.entries(g).sort((a,b)=>b[1]-a[1]);
}
function renderBrowse(){
  V.innerHTML = `
   <div class="mhead"><h1 class="mt">All <span class="g">${DATA.meta.count.toLocaleString()}</span> endpoints</h1>
   <p class="lede">Grouped the way the API is grouped. Every endpoint carries its real method, a ready-to-copy command using your environment — and simple GETs can Run right here.</p></div>
   <div class="ggrid">${groupCounts().map(([g,c])=>`
     <div class="gcard" onclick="go('#/group/${g}')">
       <div style="display:flex;justify-content:space-between;align-items:baseline"><span class="nm">${g}</span><span class="ct">${c}</span></div>
       <p>${introFor(g).split('.')[0]}.</p></div>`).join('')}</div>`;
  setNav('browse');
}
function epRow(e,i,ctx){
  const mk = missionEPs[e.m+' '+e.p];
  const runnable = e.m==='GET' && !e.p.includes('{');
  return `<div class="eprow" id="ep-${ctx}-${i}">
    <div class="ephead" onclick="document.getElementById('ep-${ctx}-${i}').classList.toggle('open')">
      <span class="method m-${e.m}">${e.m}</span><code>${esc(e.p)}</code>
      ${mk?`<span class="mlink" onclick="event.stopPropagation();go('#/mission/${mk}')">Mission ${mk}</span>`:''}
      ${runnable?`<button class="minirun runbtn" data-needs="" onclick="event.stopPropagation();runAdhoc('GET','${e.p}')">▶</button>`:''}
      <span class="chev">▾</span><span class="ti">${esc(e.t)}</span></div>
    <div class="epbody">
      <p class="story">${esc(e.t)}. ${esc(e.s)}</p>
      <div class="term" style="display:block;margin-top:0"><div class="tbar"><i class="tdot td-r"></i><i class="tdot td-y"></i><i class="tdot td-g"></i><span>terminal</span>
        <button class="copybtn" onclick="copyBlock(this)">Copy</button></div><pre>${curlHTML(e.c)}</pre></div>
      ${e.u?`<p class="doc" style="margin-top:10px"><a href="${e.u}" target="_blank" rel="noopener">Official reference ↗</a></p>`:''}
    </div></div>`;
}
let pageLimit = 40, LASTQ = "";
function renderGroup(g){
  const rows = EPS.filter(e=>e.g===g);
  V.innerHTML = `
   <div class="mhead"><button class="back" onclick="go('#/browse')">← All groups</button>
   <h1 class="mt"><span class="g">${g}</span></h1></div>
   <div class="gintro">${introFor(g)}</div>
   <div class="eplist">${rows.map((e,i)=>epRow(e,i,'g')).join('')}</div>`;
  renderVars(); setNav('browse');
}
function renderSearch(q){
  LASTQ = q;
  const ql = q.toLowerCase();
  const rows = EPS.filter(e=>(e.m+' '+e.p+' '+e.t+' '+e.g).toLowerCase().includes(ql));
  const shown = rows.slice(0,pageLimit);
  V.innerHTML = `
   <div class="mhead"><h1 class="mt">Search: <span class="g">${esc(q)}</span></h1></div>
   <p class="rescount">${rows.length} endpoint${rows.length===1?'':'s'} match</p>
   <div class="eplist">${shown.map((e,i)=>epRow(e,i,'s')).join('')}</div>
   ${rows.length>pageLimit?`<button class="loadmore" onclick="pageLimit+=60;renderSearch(LASTQ)">Show more (${rows.length-pageLimit} left)</button>`:''}`;
  renderVars(); setNav('browse');
}

/* ============ ROUTER ============ */
function setNav(k){
  document.getElementById('nav-home').classList.toggle('on',k==='home');
  document.getElementById('nav-browse').classList.toggle('on',k==='browse');
  document.getElementById('nav-guide').classList.toggle('on',k==='guide');
  document.getElementById('nav-uimap').classList.toggle('on',k==='uimap');
}
function go(h){ location.hash = h; }
function route(){
  pageLimit = 40;
  closeDrawer();
  const h = location.hash || '#/';
  window.scrollTo(0,0);
  if(h.startsWith('#/mission/')) return renderMission(h.split('/')[2]);
  if(h.startsWith('#/group/'))   return renderGroup(decodeURIComponent(h.split('/')[2]));
  if(h.startsWith('#/search/'))  return renderSearch(decodeURIComponent(h.slice(9)));
  if(h==='#/browse')             return renderBrowse();
  if(h==='#/guide')              return renderGuide();
  if(h==='#/uimap')              return renderUimap();
  renderHome();
}
window.addEventListener('hashchange', route);
document.getElementById('gq').addEventListener('keydown', e=>{
  if(e.key==='Enter' && e.target.value.trim()) go('#/search/'+encodeURIComponent(e.target.value.trim()));
});
route(); renderVars(); refreshProfileSelect(); updateBadges();
