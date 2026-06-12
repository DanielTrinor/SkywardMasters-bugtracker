const SUPA_URL = 'https://jzrkmegsnxknfubhdoqf.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6cmttZWdzbnhrbmZ1Ymhkb3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NjM1MDgsImV4cCI6MjA4OTMzOTUwOH0.ZavnKQy2mIi9U9pKYVJItF_-j7nxs0kPAvH5wCKupDg';
const { createClient } = supabase;
const db = createClient(SUPA_URL, SUPA_KEY);

const SEV = { low:1, medium:2, high:3, critical:4 };
let bugs = [];
let staffProfiles = []; // all admin + developer profiles, for assignee dropdowns
let selSev = '';
let files = [];
let selected = new Set();
let openId = null;
let currentUser = null; // { id, email, display_name, role }

function assigneeName(userId) {
  if (!userId) return null;
  const p = staffProfiles.find(x => x.id === userId);
  return p ? (p.display_name || p.email) : null;
}

// ── Init ──────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    const { data: profile } = await db.from('profiles').select('*').eq('id', session.user.id).single();
    if (profile) {
      currentUser = profile;
      showDashboard();
      // If staff view isn't active, switch to it
      const staffBtn = document.getElementById('nav-staff');
      showView('staff', staffBtn);
    } else {
      await db.auth.signOut();
    }
  }
});

// ── Auth ──────────────────────────────────────────────────────────────────────

async function doLogin() {
  const email = document.getElementById('l-email').value.trim();
  const pass  = document.getElementById('l-pass').value;
  const errEl = document.getElementById('login-err');
  const btn   = document.getElementById('login-btn');
  errEl.style.display = 'none';

  if (!email || !pass) {
    errEl.textContent = 'Enter your email and password.';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true; btn.textContent = 'Logging in...';

  const { data, error } = await db.auth.signInWithPassword({ email, password: pass });

  btn.disabled = false; btn.textContent = 'Log in';

  if (error) {
    errEl.textContent = 'Incorrect email or password.';
    errEl.style.display = 'block';
    return;
  }

  const { data: profile, error: pe } = await db.from('profiles').select('*').eq('id', data.user.id).single();
  if (!profile) {
    errEl.textContent = 'Account not approved yet. Ask an admin to assign your role.';
    errEl.style.display = 'block';
    await db.auth.signOut();
    return;
  }

  currentUser = profile;
  showDashboard();
}

async function doLogout() {
  await db.auth.signOut();
  currentUser = null;
  bugs = []; selected.clear();
  document.getElementById('login-wrap').style.display = 'block';
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('l-email').value = '';
  document.getElementById('l-pass').value = '';
  document.getElementById('login-err').style.display = 'none';
  document.getElementById('nav-staff').textContent = 'Staff login';
  closePanel();
  hideUserMgmt();
}

function showDashboard() {
  document.getElementById('login-wrap').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('nav-staff').textContent = 'Dashboard';

  // Dashboard title by role
  document.getElementById('dash-title').textContent =
    currentUser.role === 'tester' ? 'My bug reports' : 'All bug reports';

  // User info bar
  const adminBtn = currentUser.role === 'admin'
    ? `<button class="icon-btn" onclick="showUserMgmt()">Manage users</button>`
    : '';
  document.getElementById('dash-user').innerHTML = `
    <span class="role-badge role-${currentUser.role}">${currentUser.role}</span>
    <span style="font-size:12px;color:var(--text2)">${currentUser.display_name || currentUser.email}</span>
    ${adminBtn}
    <button class="logout-btn" onclick="doLogout()">Log out</button>
  `;

  fetchAndRender();
}

// ── Views ─────────────────────────────────────────────────────────────────────

function showView(v, btn) {
  document.querySelectorAll('.view').forEach(el => el.classList.remove('visible'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('view-' + v).classList.add('visible');
  if (btn) btn.classList.add('active');
  closePanel();
}

// ── Submit form ───────────────────────────────────────────────────────────────

function pickSev(btn) {
  document.querySelectorAll('.sev-btn').forEach(b => b.className = 'sev-btn');
  btn.classList.add('sel-' + btn.dataset.s);
  selSev = btn.dataset.s;
}

function addFiles(input) {
  for (const f of input.files) if (!files.includes(f.name)) files.push(f.name);
  renderPills();
}

function renderPills() {
  document.getElementById('pills').innerHTML = files.map((f,i) =>
    `<div class="pill">${f}<span class="pill-x" onclick="removeFile(${i})">×</span></div>`
  ).join('');
}

function removeFile(i) { files.splice(i,1); renderPills(); }

async function submitBug() {
  const title = document.getElementById('f-title').value.trim();
  const name  = document.getElementById('f-name').value.trim() || 'Anonymous';
  if (!title) { document.getElementById('f-title').focus(); return; }

  const btn = document.getElementById('submit-btn');
  btn.disabled = true; btn.textContent = 'Submitting...';

  const { error } = await db.from('bugreports').insert({
    title,
    name,
    category: document.getElementById('f-cat').value || 'Other',
    severity: selSev || 'medium',
    status: 'open',
    repro: document.getElementById('f-repro').value.trim(),
    expected: document.getElementById('f-expected').value.trim(),
    files: files.join(','),
    merged_into: null,
    date: Date.now(),
    user_id: currentUser?.id || null
  });

  btn.disabled = false; btn.textContent = 'Submit bug report';

  if (error) { toast('Failed to submit. Try again.', true); return; }

  document.getElementById('submit-form').style.display = 'none';
  document.getElementById('success').classList.add('show');
}

function resetForm() {
  document.getElementById('submit-form').style.display = 'block';
  document.getElementById('success').classList.remove('show');
  ['f-name','f-title','f-repro','f-expected'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-cat').value = '';
  document.querySelectorAll('.sev-btn').forEach(b => b.className = 'sev-btn');
  selSev = ''; files = []; renderPills();
}

// ── Dashboard data ────────────────────────────────────────────────────────────

async function loadBugs() {
  let query = db.from('bugreports').select('*').order('date', { ascending: false });
  if (currentUser.role === 'tester') {
    query = query.eq('user_id', currentUser.id);
  }
  const { data, error } = await query;
  if (error) { toast('Failed to load reports', true); return; }
  bugs = data || [];
}

async function loadStaffProfiles() {
  const { data } = await db.from('profiles')
    .select('id, display_name, email, role')
    .in('role', ['admin', 'developer'])
    .order('display_name');
  staffProfiles = data || [];

  // Rebuild the assignee filter dropdown with real names
  const fa = document.getElementById('fa');
  if (!fa) return;
  const current = fa.value;
  fa.innerHTML = `
    <option value="">All assignees</option>
    <option value="mine">Assigned to me</option>
    <option value="unassigned">Unassigned</option>
    ${staffProfiles.map(p => `<option value="${p.id}">${p.display_name || p.email}</option>`).join('')}
  `;
  fa.value = current; // restore selection if still valid
}

async function fetchAndRender() {
  document.getElementById('loading').style.display = 'block';
  document.getElementById('list').innerHTML = '';
  document.getElementById('empty').style.display = 'none';
  await Promise.all([loadBugs(), loadStaffProfiles()]);
  document.getElementById('loading').style.display = 'none';
  renderStats(); renderList();
}

function renderStats() {
  const open = bugs.filter(b => b.status === 'open').length;
  const inp  = bugs.filter(b => b.status === 'in-progress').length;
  const res  = bugs.filter(b => b.status === 'resolved').length;
  const crit = bugs.filter(b => b.severity === 'critical' && b.status !== 'resolved' && b.status !== 'merged').length;
  document.getElementById('stats').innerHTML = `
    <div class="stat"><div class="stat-label">Open</div><div class="stat-val">${open}</div></div>
    <div class="stat"><div class="stat-label">In progress</div><div class="stat-val">${inp}</div></div>
    <div class="stat"><div class="stat-label">Resolved</div><div class="stat-val">${res}</div></div>
    <div class="stat"><div class="stat-label">Critical</div><div class="stat-val red">${crit}</div></div>
  `;
}

function getFiltered() {
  const q    = document.getElementById('search').value.toLowerCase();
  const fs   = document.getElementById('fs').value;
  const fst  = document.getElementById('fst').value;
  const fc   = document.getElementById('fc').value;
  const fa   = document.getElementById('fa').value;
  const sort = document.getElementById('sort').value;

  let list = bugs.filter(b => {
    if (fs  && b.severity !== fs)  return false;
    if (fst && b.status   !== fst) return false;
    if (fc  && b.category !== fc)  return false;
    if (fa === 'mine'       && b.assigned_to !== currentUser?.id) return false;
    if (fa === 'unassigned' && b.assigned_to)                     return false;
    if (fa && fa !== 'mine' && fa !== 'unassigned' && b.assigned_to !== fa) return false;
    if (q && !b.title.toLowerCase().includes(q) && !(b.name||'').toLowerCase().includes(q)) return false;
    return true;
  });

  list.sort((a,b) => {
    if (sort==='date-desc') return b.date - a.date;
    if (sort==='date-asc')  return a.date - b.date;
    if (sort==='sev-desc')  return (SEV[b.severity]||0)-(SEV[a.severity]||0);
    if (sort==='sev-asc')   return (SEV[a.severity]||0)-(SEV[b.severity]||0);
    return 0;
  });
  return list;
}

function renderList() {
  const list  = getFiltered();
  const el    = document.getElementById('list');
  const empty = document.getElementById('empty');
  if (!list.length) { el.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';

  const isAdmin = currentUser?.role === 'admin';

  el.innerHTML = list.map(b => {
    const ts  = new Date(b.date).toLocaleDateString('en-GB', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
    const sel = selected.has(b.id) ? 'sel' : '';
    const mclass = b.status==='merged' ? 'merged' : '';
    const fc  = (b.files||'').split(',').filter(Boolean).length;

    const checkbox = isAdmin
      ? `<input type="checkbox" ${sel?'checked':''} onclick="toggleSel(event,${b.id})" style="cursor:pointer;margin-top:3px;flex-shrink:0">`
      : '';

    const delBtn = isAdmin
      ? `<button class="icon-btn del" onclick="event.stopPropagation();deleteBug(${b.id})">Remove</button>`
      : '';

    return `<div class="bug-card ${sel} ${mclass}" id="card-${b.id}" onclick="openPanel(${b.id})">
      <div class="bug-row">
        ${checkbox}
        <div class="bug-body">
          <div class="bug-title">${b.title}</div>
          <div class="bug-meta">
            <span>${b.name||'Anonymous'}</span>
            <span>${b.category||''}</span>
            <span>${ts}</span>
            ${fc ? `<span>${fc} file${fc>1?'s':''}</span>` : ''}
            ${b.assigned_to ? `<span style="color:var(--blue)">→ ${assigneeName(b.assigned_to) || 'Unknown'}</span>` : ''}
          </div>
        </div>
        <div class="bug-right" onclick="event.stopPropagation()">
          <span class="badge b-${b.severity}">${b.severity}</span>
          <span class="badge b-${(b.status||'open').replace(' ','-')}">${b.status||'open'}</span>
          ${delBtn}
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── Selection & merge (admin only) ───────────────────────────────────────────

function toggleSel(e, id) {
  e.stopPropagation();
  selected.has(id) ? selected.delete(id) : selected.add(id);
  updateMergeBar(); renderList();
}

function clearSel() { selected.clear(); updateMergeBar(); renderList(); }

function updateMergeBar() {
  if (currentUser?.role !== 'admin') return;
  const bar = document.getElementById('merge-bar');
  if (selected.size >= 2) {
    bar.classList.add('show');
    document.getElementById('merge-count').textContent = selected.size + ' selected';
  } else {
    bar.classList.remove('show');
  }
}

async function doMerge() {
  if (currentUser?.role !== 'admin') return;
  const ids     = [...selected];
  const primary = ids[0];
  const rest    = ids.slice(1);
  for (const id of rest) {
    await db.from('bugreports').update({ status: 'merged', merged_into: primary }).eq('id', id);
  }
  toast('Merged ' + rest.length + ' report' + (rest.length>1?'s':'') + ' into #' + primary);
  clearSel(); await fetchAndRender();
  if (openId && rest.includes(openId)) openPanel(primary);
}

// ── Delete (admin only) ───────────────────────────────────────────────────────

async function deleteBug(id) {
  if (currentUser?.role !== 'admin') return;
  await db.from('bugreports').delete().eq('id', id);
  bugs = bugs.filter(b => b.id !== id);
  selected.delete(id); updateMergeBar();
  renderStats(); renderList();
  if (openId === id) closePanel();
  toast('Report removed');
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function openPanel(id) {
  const b = bugs.find(x => x.id === id);
  if (!b) return;
  openId = id;

  const isAdmin = currentUser?.role === 'admin';
  const canEdit = currentUser?.role === 'admin' || currentUser?.role === 'developer';

  const ts       = new Date(b.date).toLocaleString('en-GB');
  const statuses = ['open','in-progress','resolved','merged'];
  const opts     = statuses.map(s => `<option value="${s}" ${b.status===s?'selected':''}>${s}</option>`).join('');
  const fc       = (b.files||'').split(',').filter(Boolean);

  const statusField = canEdit
    ? `<select style="width:auto;margin-top:4px" onchange="changeStatus(${b.id}, this.value)">${opts}</select>`
    : `<div class="field-val">${b.status||'open'}</div>`;

  const assigneeOpts = staffProfiles
    .map(p => `<option value="${p.id}" ${b.assigned_to===p.id?'selected':''}>${p.display_name||p.email}</option>`)
    .join('');
  const assigneeField = canEdit
    ? `<select style="width:auto;margin-top:4px" onchange="changeAssignee(${b.id}, this.value)">
         <option value="" ${!b.assigned_to?'selected':''}>Unassigned</option>
         ${assigneeOpts}
       </select>`
    : `<div class="field-val">${assigneeName(b.assigned_to) || 'Unassigned'}</div>`;

  const deleteBtn = isAdmin
    ? `<div class="divider"></div>
       <button class="icon-btn del" style="width:100%;justify-content:center;padding:8px" onclick="deleteBug(${b.id})">Remove this report</button>`
    : '';

  document.getElementById('panel-content').innerHTML = `
    <div class="panel-title">${b.title}</div>
    <div class="panel-badges">
      <span class="badge b-${b.severity}">${b.severity}</span>
      <span class="badge b-${(b.status||'open').replace(' ','-')}">${b.status}</span>
      <span class="badge b-open">${b.category||''}</span>
    </div>
    <div class="divider"></div>
    <div style="margin-bottom:12px"><div class="field-label">Reporter</div><div class="field-val">${b.name||'Anonymous'}</div></div>
    <div style="margin-bottom:12px"><div class="field-label">Submitted</div><div class="field-val">${ts}</div></div>
    <div style="margin-bottom:12px">
      <div class="field-label">Status</div>
      ${statusField}
    </div>
    <div style="margin-bottom:12px">
      <div class="field-label">Assigned to</div>
      ${assigneeField}
    </div>
    <div class="divider"></div>
    <div style="margin-bottom:12px"><div class="field-label">How to reproduce</div><div class="field-val">${b.repro||'—'}</div></div>
    <div style="margin-bottom:12px"><div class="field-label">Expected vs actual</div><div class="field-val">${b.expected||'—'}</div></div>
    ${fc.length ? `<div style="margin-bottom:12px"><div class="field-label">Attachments</div><div class="file-pills" style="margin-top:6px">${fc.map(f=>`<div class="pill">${f}</div>`).join('')}</div></div>` : ''}
    ${b.merged_into ? `<div style="font-size:12px;color:var(--text3);margin-bottom:12px">Merged into report #${b.merged_into}</div>` : ''}
    ${deleteBtn}
  `;
  document.getElementById('panel').classList.add('open');
}

async function changeStatus(id, val) {
  if (currentUser?.role !== 'admin' && currentUser?.role !== 'developer') return;
  await db.from('bugreports').update({ status: val }).eq('id', id);
  const b = bugs.find(x => x.id === id);
  if (b) b.status = val;
  renderStats(); renderList(); openPanel(id);
  toast('Status updated to ' + val);
}

async function changeAssignee(id, userId) {
  if (currentUser?.role !== 'admin' && currentUser?.role !== 'developer') return;
  const val = userId || null;
  await db.from('bugreports').update({ assigned_to: val }).eq('id', id);
  const b = bugs.find(x => x.id === id);
  if (b) b.assigned_to = val;
  renderList(); openPanel(id);
  const name = val ? assigneeName(val) : 'nobody';
  toast('Assigned to ' + name);
}

function closePanel() {
  document.getElementById('panel').classList.remove('open');
  openId = null;
}

// ── User management (admin only) ──────────────────────────────────────────────

async function showUserMgmt() {
  if (currentUser?.role !== 'admin') return;
  document.getElementById('user-modal').classList.add('show');
  await loadAndRenderUsers();
}

function hideUserMgmt() {
  document.getElementById('user-modal').classList.remove('show');
  document.getElementById('create-panel').classList.remove('show');
}

function handleModalClick(e) {
  if (e.target === document.getElementById('user-modal')) hideUserMgmt();
}

function toggleCreatePanel() {
  document.getElementById('create-panel').classList.toggle('show');
}

async function loadAndRenderUsers() {
  const el = document.getElementById('user-list');
  el.innerHTML = '<div class="loading dot-loader">Loading</div>';

  const { data, error } = await db.from('profiles').select('*').order('created_at');
  if (error || !data) {
    el.innerHTML = '<div class="empty">Failed to load users.</div>';
    return;
  }
  if (!data.length) {
    el.innerHTML = '<div class="empty">No users found.</div>';
    return;
  }

  el.innerHTML = data.map(u => {
    const isSelf = u.id === currentUser.id;
    const roleSelect = `
      <select onchange="updateUserRole('${u.id}', this.value)" style="width:auto" ${isSelf ? 'disabled title="Cannot change your own role"' : ''}>
        <option value="tester"    ${u.role==='tester'    ?'selected':''}>Tester</option>
        <option value="developer" ${u.role==='developer' ?'selected':''}>Developer</option>
        <option value="admin"     ${u.role==='admin'     ?'selected':''}>Admin</option>
      </select>
    `;
    const removeBtn = isSelf
      ? `<span style="font-size:11px;color:var(--text3)">(you)</span>`
      : `<button class="icon-btn del" onclick="removeUser('${u.id}', '${(u.display_name||u.email).replace(/'/g,"\\'")}')">Remove</button>`;

    return `<div class="user-row" id="user-row-${u.id}">
      <div class="user-info">
        <div class="user-display-name">${u.display_name || '—'}</div>
        <div class="user-email">${u.email}</div>
      </div>
      <span class="role-badge role-${u.role}" id="rbadge-${u.id}">${u.role}</span>
      ${roleSelect}
      ${removeBtn}
    </div>`;
  }).join('');
}

async function createUser() {
  const name  = document.getElementById('u-name').value.trim();
  const email = document.getElementById('u-email').value.trim();
  const pass  = document.getElementById('u-pass').value;
  const role  = document.getElementById('u-role').value;

  if (!email || !pass) { toast('Email and password are required', true); return; }
  if (pass.length < 6) { toast('Password must be at least 6 characters', true); return; }

  const btn = document.getElementById('create-user-btn');
  btn.disabled = true; btn.textContent = 'Creating...';

  // Use a non-persistent client so the admin session is not replaced
  const tmp = createClient(SUPA_URL, SUPA_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  const { data, error } = await tmp.auth.signUp({ email, password: pass });

  btn.disabled = false; btn.textContent = 'Create user';

  if (error) { toast(error.message, true); return; }

  const userId = data.user?.id;
  if (!userId) { toast('Failed to create auth user', true); return; }

  const { error: pe } = await db.from('profiles').insert({
    id: userId,
    email,
    display_name: name || null,
    role
  });

  if (pe) { toast('Auth user created but profile failed: ' + pe.message, true); return; }

  ['u-name','u-email','u-pass'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('create-panel').classList.remove('show');

  toast(`${name || email} added as ${role}`);
  await loadAndRenderUsers();
}

async function updateUserRole(id, role) {
  const { error } = await db.from('profiles').update({ role }).eq('id', id);
  if (error) { toast('Failed to update role', true); await loadAndRenderUsers(); return; }

  const badge = document.getElementById('rbadge-' + id);
  if (badge) { badge.className = `role-badge role-${role}`; badge.textContent = role; }
  toast('Role updated');
}

async function removeUser(id, label) {
  if (!confirm(`Remove ${label}? They will lose dashboard access immediately.`)) return;
  const { error } = await db.from('profiles').delete().eq('id', id);
  if (error) { toast('Failed to remove user', true); return; }
  toast(`${label} removed`);
  await loadAndRenderUsers();
}

// ── Toast ─────────────────────────────────────────────────────────────────────

let toastTimer;
function toast(msg, err=false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.className = 'toast', 3000);
}
