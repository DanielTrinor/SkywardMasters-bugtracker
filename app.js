document.getElementById('version-label').textContent =
  new Date(document.lastModified).toLocaleString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });

const supabaseUrl = 'https://jzrkmegsnxknfubhdoqf.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6cmttZWdzbnhrbmZ1Ymhkb3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NjM1MDgsImV4cCI6MjA4OTMzOTUwOH0.ZavnKQy2mIi9U9pKYVJItF_-j7nxs0kPAvH5wCKupDg'
const { createClient } = supabase;
const db = createClient(supabaseUrl, supabaseKey);

const SEV = { low:1, medium:2, high:3, critical:4 };
let bugs = [];
let staffProfiles = []; // all admin + developer profiles, for assignee dropdowns
let selSev = '';
let files = [];
let selected = new Set();
let openId = null;
let currentUser = null; // { id, email, display_name, role }
let notifications = []; // unread notification rows for the logged-in user

function assigneeName(userId) {
  if (!userId) return null;
  const p = staffProfiles.find(x => x.id === userId);
  return p ? (p.display_name || p.email) : null;
}

// ── Init ──────────────────────────────────────────────────────────────────────

db.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY' && !currentUser?.must_reset_password) {
    showView('reset', null);
  }
});

window.addEventListener('DOMContentLoaded', async () => {
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  if (hashParams.get('type') === 'recovery') return; // onAuthStateChange handles this

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

  if (profile.must_reset_password) {
    document.getElementById('reset-title').textContent = 'Welcome! Set your password';
    document.getElementById('reset-subtitle').textContent = 'Before you continue, please create your own password.';
    showView('reset', null);
    return;
  }

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
    <span id="notif-badge"></span>
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

function addFiles(source) {
  const fileList = source instanceof FileList ? source : source.files;
  const allowed = ['image/png', 'image/jpeg', 'text/plain'];
  for (const f of fileList) {
    if (!allowed.includes(f.type)) { toast(`"${f.name}" is not allowed — only PNG, JPG, and TXT/log files.`, true); continue; }
    if (!files.find(x => x.name === f.name)) files.push(f);
  }
  renderPills();
}

let pillObjectURLs = [];

function renderPills() {
  pillObjectURLs.forEach(url => URL.revokeObjectURL(url));
  pillObjectURLs = [];

  document.getElementById('pills').innerHTML = files.map((f, i) => {
    if (f.type.startsWith('image/')) {
      const url = URL.createObjectURL(f);
      pillObjectURLs.push(url);
      return `<div class="pill-img"><img src="${url}" alt="${f.name}" title="${f.name}"><span class="pill-x" onclick="removeFile(${i})">×</span></div>`;
    }
    return `<div class="pill">${f.name}<span class="pill-x" onclick="removeFile(${i})">×</span></div>`;
  }).join('');
}

function removeFile(i) { files.splice(i,1); renderPills(); }

function renderAttachments(urls) {
  if (!urls.length) return '';
  const items = urls.map(url => {
    const isImg = /\.(jpe?g|png|gif|webp|bmp|svg)(\?|$)/i.test(url);
    if (isImg) return `<a href="${url}" target="_blank" rel="noopener"><img src="${url}" style="max-width:100%;border-radius:6px;border:1px solid var(--border);display:block" /></a>`;
    const name = url.split('/').pop().replace(/^\d+_/, '');
    return `<a href="${url}" target="_blank" rel="noopener" class="pill" style="text-decoration:none;word-break:break-all">${name}</a>`;
  }).join('');
  return `<div style="margin-bottom:12px"><div class="field-label">Attachments</div><div style="margin-top:8px;display:flex;flex-direction:column;gap:8px">${items}</div></div>`;
}

async function submitBug() {
  const title = document.getElementById('f-title').value.trim();
  const name  = document.getElementById('f-name').value.trim() || 'Anonymous';
  if (!title) { document.getElementById('f-title').focus(); return; }

  const btn = document.getElementById('submit-btn');
  btn.disabled = true; btn.textContent = 'Uploading...';

  if (files.length > 0) {
    const { data: { session } } = await db.auth.getSession();
    if (!session) {
      const { error: anonErr } = await db.auth.signInAnonymously();
      if (anonErr) { toast('Could not start upload session: ' + anonErr.message, true); btn.disabled = false; btn.textContent = 'Submit bug report'; return; }
    }
  }

  const urls = [];
  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${Date.now()}_${safeName}`;
    const { error: upErr } = await db.storage.from('bug-attachments').upload(path, file);
    if (upErr) { toast('File upload failed: ' + upErr.message, true); btn.disabled = false; btn.textContent = 'Submit bug report'; return; }
    const { data: { publicUrl } } = db.storage.from('bug-attachments').getPublicUrl(path);
    urls.push(publicUrl);
  }

  btn.textContent = 'Submitting...';

  const { error } = await db.from('bugreports').insert({
    title,
    name,
    category: document.getElementById('f-cat').value || 'Other',
    severity: selSev || 'medium',
    status: 'open',
    repro: document.getElementById('f-repro').value.trim(),
    expected: document.getElementById('f-expected').value.trim(),
    files: urls.join(','),
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

async function refreshDashboard() {
  const btn = document.getElementById('refresh-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinning">↻</span> Refreshing...';
  await Promise.all([loadBugs(), loadNotifications()]);
  renderStats(); renderList(); renderNotifBadge();
  btn.disabled = false;
  btn.innerHTML = '↻ Refresh';
  toast('Reports refreshed');
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
  await Promise.all([loadBugs(), loadStaffProfiles(), loadNotifications()]);
  document.getElementById('loading').style.display = 'none';
  renderStats(); renderList(); renderNotifBadge();
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
    if (q) {
      const inTitle = b.title.toLowerCase().includes(q);
      const inName  = (b.name||'').toLowerCase().includes(q);
      const inRepro = (b.repro||'').toLowerCase().includes(q);
      const inExp   = (b.expected||'').toLowerCase().includes(q);
      if (!inTitle && !inName && !inRepro && !inExp) return false;
      b._searchRank = inTitle ? 0 : 1;
    } else {
      b._searchRank = 0;
    }
    return true;
  });

  list.sort((a,b) => {
    if (q && a._searchRank !== b._searchRank) return a._searchRank - b._searchRank;
    if (sort==='date-desc') return b.date - a.date;
    if (sort==='date-asc')  return a.date - b.date;
    if (sort==='sev-desc')  return (SEV[b.severity]||0)-(SEV[a.severity]||0);
    if (sort==='sev-asc')   return (SEV[a.severity]||0)-(SEV[b.severity]||0);
    return 0;
  });
  return list;
}

// Groups shown on the dashboard, top to bottom. Anything with an unknown
// status falls into "open".
const GROUPS = [
  { key:'in-progress', label:'In progress', color:'var(--blue)'   },
  { key:'open',        label:'Open',        color:'var(--text2)'  },
  { key:'resolved',    label:'Resolved',    color:'var(--accent)' },
  { key:'merged',      label:'Merged',      color:'var(--text3)'  },
];

let collapsedGroups = {};
try { collapsedGroups = JSON.parse(localStorage.getItem('bt-collapsed') || '{}'); } catch(e) { collapsedGroups = {}; }

function groupOf(b) {
  const s = b.status || 'open';
  return GROUPS.some(g => g.key === s) ? s : 'open';
}

function toggleGroup(key) {
  collapsedGroups[key] = !collapsedGroups[key];
  try { localStorage.setItem('bt-collapsed', JSON.stringify(collapsedGroups)); } catch(e) {}
  renderList();
}

function bugCard(b, isAdmin) {
  const ts  = new Date(b.date).toLocaleDateString('en-GB', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  const sel = selected.has(b.id) ? 'sel' : '';
  const mclass = b.status==='merged' ? 'merged' : '';
  const stclass = 'st-' + groupOf(b);
  const nUnread = unreadCountFor(b.id);
  const fc  = (b.files||'').split(',').filter(Boolean).length;

  const checkbox = isAdmin
    ? `<input type="checkbox" ${sel?'checked':''} onclick="toggleSel(event,${b.id})" style="cursor:pointer;margin-top:3px;flex-shrink:0">`
    : '';

  const delBtn = isAdmin
    ? `<button class="icon-btn del" onclick="event.stopPropagation();deleteBug(${b.id})">Remove</button>`
    : '';

  return `<div class="bug-card ${stclass} ${sel} ${mclass} ${nUnread?'unread':''}" id="card-${b.id}" onclick="openPanel(${b.id})">
    <div class="bug-row">
      ${checkbox}
      <div class="bug-body">
        <div class="bug-title">${nUnread ? '<span class="unread-dot" title="New comment"></span>' : ''}${b.title}</div>
        <div class="bug-meta">
          <span>${b.name||'Anonymous'}</span>
          <span>${b.category||''}</span>
          <span>${ts}</span>
          ${fc ? `<span>${fc} file${fc>1?'s':''}</span>` : ''}
          ${b.assigned_to ? `<span style="color:var(--blue)">&rarr; ${assigneeName(b.assigned_to) || 'Unknown'}</span>` : ''}
        </div>
      </div>
      <div class="bug-right" onclick="event.stopPropagation()">
        <span class="badge b-${b.severity}">${b.severity}</span>
        <span class="badge b-${(b.status||'open').replace(' ','-')}">${b.status||'open'}</span>
        ${delBtn}
      </div>
    </div>
  </div>`;
}

function renderList() {
  const list  = getFiltered();
  const el    = document.getElementById('list');
  const empty = document.getElementById('empty');
  if (!list.length) { el.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';

  const isAdmin = currentUser?.role === 'admin';

  el.innerHTML = GROUPS.map(g => {
    const items = list.filter(b => groupOf(b) === g.key);
    if (!items.length) return '';
    const isCollapsed = !!collapsedGroups[g.key];
    return `<div class="group ${isCollapsed?'collapsed':''}">
      <div class="group-head" onclick="toggleGroup('${g.key}')">
        <span class="group-chevron">&#9662;</span>
        <span class="group-dot" style="background:${g.color}"></span>
        <span class="group-title">${g.label}</span>
        <span class="group-count">${items.length}</span>
      </div>
      <div class="group-body">${items.map(b => bugCard(b, isAdmin)).join('')}</div>
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
  const primaryBug = bugs.find(x => x.id === primary);
  const primaryLabel = primaryBug ? `"${primaryBug.title}" (#${primary})` : `#${primary}`;
  for (const id of rest) {
    await db.from('bugreports').update({ status: 'merged', merged_into: primary }).eq('id', id);
    await logActivity(id, `Merged into report ${primaryLabel}`);
    await logActivity(primary, `Report #${id} was merged into this report`);
  }
  toast('Merged ' + rest.length + ' report' + (rest.length>1?'s':'') + ' into #' + primary);
  clearSel(); await fetchAndRender();
  if (openId && rest.includes(openId)) openPanel(primary);
}

// ── Delete (admin only) ───────────────────────────────────────────────────────

async function deleteBug(id) {
  if (currentUser?.role !== 'admin') return;
  const bug = bugs.find(b => b.id === id);
  const fileUrls = (bug?.files || '').split(',').filter(Boolean);
  if (fileUrls.length) {
    const paths = fileUrls.map(url => url.split('/bug-attachments/')[1]).filter(Boolean);
    if (paths.length) {
      const { data: removed, error: storageErr } = await db.storage.from('bug-attachments').remove(paths);
      if (storageErr || !removed?.length) { toast('Could not delete attachments from storage', true); return; }
    }
  }
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
  markBugRead(id);

  const isAdmin = currentUser?.role === 'admin';
  const canEdit = currentUser?.role === 'admin' || currentUser?.role === 'developer';

  const ts       = new Date(b.date).toLocaleString('en-GB');
  const statuses = ['open','in-progress','resolved','merged'];
  const opts     = statuses.map(s => `<option value="${s}" ${b.status===s?'selected':''}>${s}</option>`).join('');
  const fc       = (b.files||'').split(',').filter(Boolean);

  const statusField = canEdit
    ? `<select style="width:auto;margin-top:4px" onchange="changeStatus(${b.id}, this.value)">${opts}</select>`
    : `<div class="field-val">${b.status||'open'}</div>`;

  const severities  = ['low','medium','high','critical'];
  const sevOpts     = severities.map(s => `<option value="${s}" ${b.severity===s?'selected':''}>${s}</option>`).join('');
  const severityField = canEdit
    ? `<select style="width:auto;margin-top:4px" onchange="changeSeverity(${b.id}, this.value)">${sevOpts}</select>`
    : `<div class="field-val">${b.severity||'medium'}</div>`;

  const categories  = ['Gameplay','Networking / multiplayer','UI / HUD','Audio','Performance / crashes','Visuals / rendering','Bug reporting tool','Other'];
  const catOpts     = categories.map(c => `<option value="${c}" ${b.category===c?'selected':''}>${c}</option>`).join('');
  const categoryField = canEdit
    ? `<select style="width:auto;margin-top:4px" onchange="changeCategory(${b.id}, this.value)">${catOpts}</select>`
    : `<div class="field-val">${b.category||'—'}</div>`;

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
      <div class="field-label">Severity</div>
      ${severityField}
    </div>
    <div style="margin-bottom:12px">
      <div class="field-label">Category</div>
      ${categoryField}
    </div>
    <div style="margin-bottom:12px">
      <div class="field-label">Assigned to</div>
      ${assigneeField}
    </div>
    <div class="divider"></div>
    <div style="margin-bottom:12px"><div class="field-label">How to reproduce</div><div class="field-val">${b.repro||'—'}</div></div>
    <div style="margin-bottom:12px"><div class="field-label">Expected vs actual</div><div class="field-val">${b.expected||'—'}</div></div>
    ${renderAttachments(fc)}
    ${b.merged_into ? `<div style="font-size:12px;color:var(--text3);margin-bottom:12px">Merged into report #${b.merged_into}</div>` : ''}
    ${deleteBtn}
    <div class="divider"></div>
    <div class="comments-section">
      <div class="field-label" style="margin-bottom:10px">Activity &amp; comments</div>
      <div class="comment-list" id="comment-list"><div class="comment-empty">Loading…</div></div>
      ${currentUser ? `
      <div class="comment-input-wrap">
        <textarea id="comment-input" placeholder="Leave a comment…"></textarea>
        <button class="btn-primary" style="margin-top:0" onclick="postComment(${b.id})">Post comment</button>
      </div>` : ''}
    </div>
  `;
  document.getElementById('panel').classList.add('open');
  loadComments(b.id);
}

// ── Notifications ─────────────────────────────────────────────────────────────
// A notification is created when someone comments on a report they did not
// submit. Recipients are the report's author and its assignee, minus the
// commenter. Unread ones highlight the report on the dashboard until opened.

async function loadNotifications() {
  if (!currentUser) return;
  const { data, error } = await db
    .from('notifications')
    .select('*')
    .eq('user_id', currentUser.id)
    .is('read_at', null)
    .order('created_at', { ascending: false });
  if (error) {
    // Missing table (PGRST205) means notifications.sql has not been run yet.
    // Never break the dashboard over it, but say so loudly in the console.
    notifications = [];
    console.warn('Notifications unavailable:', error.message,
      '- run supabase/notifications.sql in the Supabase SQL editor.');
    return;
  }
  notifications = data || [];
}

function unreadCountFor(bugId) {
  return notifications.filter(n => n.bug_id === bugId).length;
}

// Only count what the user can actually click through to clear.
function visibleUnread() {
  return notifications.filter(n => bugs.some(b => b.id === n.bug_id));
}

function renderNotifBadge() {
  const el = document.getElementById('notif-badge');
  if (!el) return;
  const n = visibleUnread().length;
  el.innerHTML = n
    ? `<button class="notif-badge" onclick="markAllRead()" title="Mark all as read">${n} new</button>`
    : '';
}

// Notify the report's author and assignee, skipping whoever is commenting.
async function notifyWatchers(bugId, body, commentId) {
  const b = bugs.find(x => x.id === bugId);
  if (!b) return;

  const recipients = [...new Set([b.user_id, b.assigned_to])]
    .filter(uid => uid && uid !== currentUser.id);
  if (!recipients.length) return;

  const preview = body.length > 140 ? body.slice(0, 140) + '…' : body;
  const { error } = await db.from('notifications').insert(
    recipients.map(uid => ({
      user_id: uid,
      bug_id: bugId,
      comment_id: commentId ?? null,
      actor_name: currentUser.display_name || currentUser.email,
      body: preview,
      read_at: null,
      created_at: Date.now()
    }))
  );
  // A failed notification must never lose the comment that triggered it, but
  // the commenter should know their colleague was not actually told.
  if (error) {
    console.warn('Could not create notification:', error.message,
      '- has supabase/notifications.sql been run?');
    toast('Comment posted, but the reporter could not be notified', true);
  }
}

async function markBugRead(bugId) {
  const mine = notifications.filter(n => n.bug_id === bugId);
  if (!mine.length) return;

  notifications = notifications.filter(n => n.bug_id !== bugId);
  renderNotifBadge();
  document.getElementById('card-' + bugId)?.classList.remove('unread');

  await db.from('notifications')
    .update({ read_at: Date.now() })
    .eq('user_id', currentUser.id)
    .eq('bug_id', bugId)
    .is('read_at', null);
}

async function markAllRead() {
  if (!notifications.length) return;
  notifications = [];
  renderNotifBadge(); renderList();

  await db.from('notifications')
    .update({ read_at: Date.now() })
    .eq('user_id', currentUser.id)
    .is('read_at', null);
  toast('All caught up');
}

// ── Comments ──────────────────────────────────────────────────────────────────

async function loadComments(bugId) {
  const listEl = document.getElementById('comment-list');
  if (!listEl) return;

  const { data, error } = await db
    .from('comments')
    .select('*')
    .eq('bug_id', bugId)
    .order('created_at', { ascending: true });

  if (error || !data) { listEl.innerHTML = '<div class="comment-empty">Could not load comments.</div>'; return; }
  if (data.length === 0) { listEl.innerHTML = '<div class="comment-empty">No comments yet.</div>'; return; }

  listEl.innerHTML = data.map(c => {
    const time = new Date(c.created_at).toLocaleString('en-GB');
    return `<div class="comment ${c.is_activity ? 'activity' : ''}">
      <div class="comment-meta">
        <span class="comment-author">${c.display_name || 'Unknown'}</span>
        <span class="comment-time">${time}</span>
      </div>
      <div class="comment-body">${c.body}</div>
    </div>`;
  }).join('');
}

async function postComment(bugId) {
  const input = document.getElementById('comment-input');
  const body = input?.value.trim();
  if (!body) return;

  const btn = document.querySelector('#panel .btn-primary');
  btn.disabled = true; btn.textContent = 'Posting…';

  const { data, error } = await db.from('comments').insert({
    bug_id: bugId,
    user_id: currentUser.id,
    display_name: currentUser.display_name || currentUser.email,
    body,
    is_activity: false,
    created_at: Date.now()
  }).select('id').single();

  btn.disabled = false; btn.textContent = 'Post comment';

  if (error) { toast('Failed to post comment', true); return; }
  input.value = '';
  await notifyWatchers(bugId, body, data?.id);
  await loadComments(bugId);
}

async function logActivity(bugId, message) {
  await db.from('comments').insert({
    bug_id: bugId,
    user_id: currentUser.id,
    display_name: currentUser.display_name || currentUser.email,
    body: message,
    is_activity: true,
    created_at: Date.now()
  });
}

async function changeStatus(id, val) {
  if (currentUser?.role !== 'admin' && currentUser?.role !== 'developer') return;
  const b = bugs.find(x => x.id === id);
  const prev = b?.status || 'open';
  await db.from('bugreports').update({ status: val }).eq('id', id);
  if (b) b.status = val;
  await logActivity(id, `Changed status from "${prev}" to "${val}"`);
  renderStats(); renderList(); openPanel(id);
  toast('Status updated to ' + val);
}

async function changeAssignee(id, userId) {
  if (currentUser?.role !== 'admin' && currentUser?.role !== 'developer') return;
  const val = userId || null;
  const b = bugs.find(x => x.id === id);
  const prevName = assigneeName(b?.assigned_to) || 'nobody';
  await db.from('bugreports').update({ assigned_to: val }).eq('id', id);
  if (b) b.assigned_to = val;
  const newName = val ? assigneeName(val) : 'nobody';
  await logActivity(id, `Changed assignee from "${prevName}" to "${newName}"`);
  renderList(); openPanel(id);
  toast('Assigned to ' + newName);
}

async function changeCategory(id, val) {
  if (currentUser?.role !== 'admin' && currentUser?.role !== 'developer') return;
  const b = bugs.find(x => x.id === id);
  const prev = b?.category || 'Other';
  if (prev === val) return;
  await db.from('bugreports').update({ category: val }).eq('id', id);
  if (b) b.category = val;
  await logActivity(id, `Changed category from "${prev}" to "${val}"`);
  renderList(); openPanel(id);
  toast('Category updated to ' + val);
}

async function changeSeverity(id, val) {
  if (currentUser?.role !== 'admin' && currentUser?.role !== 'developer') return;
  const b = bugs.find(x => x.id === id);
  const prev = b?.severity || 'medium';
  if (prev === val) return;
  await db.from('bugreports').update({ severity: val }).eq('id', id);
  if (b) b.severity = val;
  await logActivity(id, `Changed severity from "${prev}" to "${val}"`);
  renderStats(); renderList(); openPanel(id);
  toast('Severity updated to ' + val);
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
    const resetPwdBtn = `<button class="icon-btn" onclick="sendPasswordReset('${u.email}', '${(u.display_name||u.email).replace(/'/g,"\\'")}')">Reset pwd</button>`;
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
      ${resetPwdBtn}
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
  const tmp = createClient(supabaseUrl, supabaseKey, {
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
    role,
    must_reset_password: true
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
  const { error: profileErr } = await db.from('profiles').delete().eq('id', id);
  if (profileErr) { toast('Failed to remove user', true); return; }
  const { error: authErr } = await db.rpc('delete_auth_user', { user_id: id });
  if (authErr) { toast(`Profile removed but auth user could not be deleted: ${authErr.message}`, true); }
  else { toast(`${label} removed`); }
  await loadAndRenderUsers();
}

async function doResetPassword() {
  const pass  = document.getElementById('r-pass').value;
  const pass2 = document.getElementById('r-pass2').value;
  const errEl = document.getElementById('reset-err');
  const btn   = document.getElementById('reset-btn');
  errEl.style.display = 'none';

  if (pass.length < 6) {
    errEl.textContent = 'Password must be at least 6 characters.';
    errEl.style.display = 'block'; return;
  }
  if (pass !== pass2) {
    errEl.textContent = 'Passwords do not match.';
    errEl.style.display = 'block'; return;
  }

  btn.disabled = true; btn.textContent = 'Saving...';
  const { error } = await db.auth.updateUser({ password: pass });
  btn.disabled = false; btn.textContent = 'Set password';

  if (error) {
    errEl.textContent = error.message;
    errEl.style.display = 'block'; return;
  }

  document.getElementById('r-pass').value = '';
  document.getElementById('r-pass2').value = '';

  // First-login flow: clear the flag and go straight to the dashboard
  if (currentUser?.must_reset_password) {
    await db.from('profiles').update({ must_reset_password: false }).eq('id', currentUser.id);
    currentUser.must_reset_password = false;
    document.getElementById('reset-title').textContent = 'Set new password';
    document.getElementById('reset-subtitle').textContent = 'Enter your new password below.';
    toast('Password set. Welcome!');
    showView('staff', document.getElementById('nav-staff'));
    showDashboard();
    return;
  }

  await db.auth.signOut();
  toast('Password updated. Please log in.');
  showView('staff', document.getElementById('nav-staff'));
}

async function sendPasswordReset(email, label) {
  if (!confirm(`Send a password reset email to ${label} (${email})?`)) return;
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname
  });
  if (error) { toast('Failed to send reset email: ' + error.message, true); return; }
  toast(`Password reset email sent to ${email}`);
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
