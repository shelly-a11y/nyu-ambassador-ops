import './style.css';
import { authRedirectUrl, supabase, supabaseConfigured } from './supabase';

const app = document.querySelector('#app');

const RECORD_TYPES = {
  work: { en: 'Weekly work', zh: '每周工作', icon: '↗' },
  ugc: { en: 'UGC video', zh: 'UGC 视频', icon: '▶' },
  poster: { en: 'Poster posting', zh: '海报张贴', icon: '▤' },
  referral: { en: 'Referral', zh: '拉新奖励', icon: '✚' },
};
const VIEW_TYPE = { work: 'work', ugc: 'ugc', posters: 'poster', referrals: 'referral' };
const CATEGORIES = {
  printing: { en: 'Printing', zh: '打印费' },
  tools: { en: 'Tools & supplies', zh: '工具/物料费' },
  event: { en: 'Event budget', zh: '活动经费' },
  transport: { en: 'Transport', zh: '交通费' },
  food: { en: 'Food & drinks', zh: '餐饮费' },
  other: { en: 'Other', zh: '其他' },
};
const STATUS = {
  pending: { en: 'Pending', zh: '待审核', tone: 'pending' },
  approved: { en: 'Approved', zh: '已通过', tone: 'approved' },
  rejected: { en: 'Rejected', zh: '已驳回', tone: 'rejected' },
  posted: { en: 'Posted', zh: '已发布', tone: 'approved' },
  paid: { en: 'Paid', zh: '已打款', tone: 'paid' },
};
const ROLES = { ambassador: { en: 'Ambassador', zh: '大使' }, lead: { en: 'Lead', zh: 'Lead' }, admin: { en: 'Admin', zh: '管理员' } };

let state = {
  language: localStorage.getItem('nyu-language') || 'en',
  view: 'overview',
  filter: 'all',
  schoolScope: localStorage.getItem('nyu-school-scope') || 'all',
  phase: 'loading',
  session: null,
  profile: null,
  request: null,
  schools: [],
  profiles: [],
  records: [],
  reimbursements: [],
  allowed: [],
  requests: [],
  notice: '',
  cooldownUntil: 0,
};

const tr = (en, zh) => (state.language === 'zh' ? zh : en);
const label = (entry) => (entry ? entry[state.language] || entry.en : '');
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const today = () => new Date().toLocaleDateString('en-CA');
const money = (value) => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (value) => (value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString(state.language === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' }) : '—');
const safeUrl = (value) => (/^https?:\/\//i.test(value || '') ? value : '');
const schoolName = (id) => state.schools.find((school) => school.id === id)?.name || id;
const isAdmin = () => state.profile?.role === 'admin';
const canManage = (schoolId) => isAdmin() || (state.profile?.role === 'lead' && state.profile.school_id === schoolId);
const scope = () => (isAdmin() ? state.schoolScope : state.profile?.school_id);
const inScope = (row) => scope() === 'all' || row.school_id === scope();
const statusBadge = (status) => `<span class="status ${STATUS[status]?.tone || 'pending'}">${label(STATUS[status])}</span>`;

function weekLabel() {
  const now = new Date();
  const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const fmt = (date) => date.toLocaleDateString(state.language === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' });
  return `${tr('This week', '本周')} · ${fmt(monday)} – ${fmt(sunday)}`;
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function friendlyError(error) {
  const message = error?.message || String(error);
  if (/rate limit/i.test(message)) return tr('Too many sign-in emails were requested. Please wait a few minutes and try again.', '登录邮件请求太频繁，请等几分钟后再试。');
  if (/row-level security|permission denied/i.test(message)) return tr('You do not have permission for this action.', '你没有执行该操作的权限。');
  if (/function .* does not exist|relation .* does not exist|schema cache/i.test(message)) return tr('Database upgrade is not installed yet. Ask the admin to run the latest migration.', '数据库升级脚本还没有运行，请管理员先运行最新的迁移 SQL。');
  return message;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

let bootToken = 0;

async function boot(session) {
  const token = ++bootToken;
  state.session = session;
  if (!session) {
    Object.assign(state, { phase: 'signed-out', profile: null, request: null });
    return render();
  }
  try {
    const { data: schools } = await supabase.from('schools').select('id, name').order('name');
    state.schools = schools || [];
    const { data: profile, error } = await supabase.rpc('claim_profile');
    if (error) throw error;
    if (token !== bootToken) return;
    if (!profile?.id) {
      const { data: request } = await supabase.from('access_requests').select('*').eq('user_id', session.user.id).maybeSingle();
      Object.assign(state, { phase: 'request', profile: null, request });
      return render();
    }
    state.profile = profile;
    await loadData();
    if (token !== bootToken) return;
    state.phase = 'app';
  } catch (error) {
    console.error(error);
    state.phase = 'error';
    state.notice = friendlyError(error);
  }
  render();
}

async function loadData() {
  const queries = [
    supabase.from('profiles').select('id, display_name, school_id, role, email, created_at').order('display_name'),
    supabase.from('records').select('*').order('created_at', { ascending: false }),
    supabase.from('reimbursements').select('*').order('created_at', { ascending: false }),
  ];
  if (isAdmin()) {
    queries.push(supabase.from('allowed_emails').select('*').order('created_at', { ascending: false }));
    queries.push(supabase.from('access_requests').select('*').eq('status', 'pending').order('created_at'));
  }
  const results = await Promise.all(queries);
  const failed = results.find((result) => result.error);
  if (failed) throw failed.error;
  const [profiles, records, reimbursements, allowed, requests] = results.map((result) => result.data || []);
  Object.assign(state, { profiles, records, reimbursements, allowed: allowed || [], requests: requests || [] });
}

async function refresh() {
  try { await loadData(); } catch (error) { showToast(friendlyError(error)); }
  render();
}

async function run(promise, successMessage) {
  const { error } = await promise;
  if (error) { showToast(friendlyError(error)); return false; }
  if (successMessage) showToast(successMessage);
  await refresh();
  return true;
}

// ---------------------------------------------------------------------------
// Screens before the app: sign in, request access
// ---------------------------------------------------------------------------

function authCard(body) {
  return `<div class="auth-page"><section class="auth-card"><div class="brand"><span class="brand-mark">N</span><div><strong>${tr('Campus Ambassador Ops', '校园大使工作台')}</strong><small>${tr('Campus growth workspace', '校园增长协作空间')}</small></div></div>${body}<div class="auth-footer"><button class="text-button" data-action="language">${state.language === 'en' ? '中文' : 'English'}</button>${state.session ? `<button class="text-button" data-action="sign-out">${tr('Sign out', '退出登录')}</button>` : ''}</div></section><div class="toast" id="toast"></div></div>`;
}

function signedOutScreen() {
  const waiting = Math.max(0, Math.ceil((state.cooldownUntil - Date.now()) / 1000));
  return authCard(`<h1>${tr('Sign in with your email', '使用邮箱登录')}</h1><p class="subhead">${tr('We will email you a one-time sign-in link. New members are approved by the admin.', '我们会发送一封登录链接到你的邮箱。新成员需要管理员审批后才能使用。')}</p>
    ${state.notice ? `<div class="local-only-notice">${esc(state.notice)}</div>` : ''}
    <form data-form="sign-in" class="auth-form"><label>${tr('Email', '邮箱')}<input name="email" type="email" required autocomplete="email" placeholder="name@school.edu" /></label><button class="button primary full" type="submit" ${waiting ? 'disabled' : ''}>${waiting ? tr(`Resend in ${waiting}s`, `${waiting} 秒后可重发`) : tr('Send sign-in link', '发送登录链接')}</button></form>
    <p class="hint">${tr('Only open the newest email. Links expire after one use.', '只点击最新的一封邮件，链接只能使用一次。')}</p>`);
}

function requestScreen() {
  const request = state.request;
  const email = esc(state.session.user.email);
  if (request?.status === 'pending') {
    return authCard(`<h1>${tr('Waiting for approval', '等待审批')}</h1><p class="subhead">${tr(`Your request for <b>${email}</b> has been sent. You will get access once the admin approves it.`, `<b>${email}</b> 的申请已提交，管理员审批后即可使用。`)}</p><div class="request-summary"><span>${esc(request.display_name)}</span><span>${esc(schoolName(request.school_id))}</span></div><button class="button primary full" data-action="recheck">${tr('Check again', '重新检查')}</button>`);
  }
  const rejected = request?.status === 'rejected' ? `<div class="local-only-notice">${tr('Your previous request was declined. Contact your lead or submit again.', '你之前的申请未通过，可联系 Lead 或重新提交。')}</div>` : '';
  return authCard(`<h1>${tr('Request access', '申请加入')}</h1><p class="subhead">${tr(`Signed in as <b>${email}</b>. Tell us who you are.`, `当前登录邮箱：<b>${email}</b>，请填写你的信息。`)}</p>${rejected}
    <form data-form="request" class="auth-form"><label>${tr('Your name', '姓名')}<input name="display_name" required value="${esc(request?.display_name || '')}" /></label><label>${tr('School', '学校')}<select name="school_id" required>${state.schools.map((school) => `<option value="${school.id}" ${request?.school_id === school.id ? 'selected' : ''}>${esc(school.name)}</option>`).join('')}</select></label><label>${tr('Note (optional)', '备注（可选）')}<input name="note" value="${esc(request?.note || '')}" /></label><button class="button primary full" type="submit">${tr('Submit request', '提交申请')}</button></form>`);
}

// ---------------------------------------------------------------------------
// App shell
// ---------------------------------------------------------------------------

function navItem(view, icon, text, badge = '') {
  return `<button class="nav-item ${state.view === view ? 'active' : ''}" data-action="view" data-view="${view}"><span class="nav-icon">${icon}</span><span>${text}</span>${badge ? `<span class="nav-badge">${badge}</span>` : ''}</button>`;
}

function shell(content) {
  const profile = state.profile;
  const schoolControl = isAdmin()
    ? `<select class="school-select" data-change="scope" aria-label="School"><option value="all" ${state.schoolScope === 'all' ? 'selected' : ''}>${tr('All schools', '全部学校')}</option>${state.schools.map((school) => `<option value="${school.id}" ${state.schoolScope === school.id ? 'selected' : ''}>${esc(school.name)}</option>`).join('')}</select><span class="chevron">⌄</span>`
    : `<span class="school-fixed">${esc(schoolName(profile.school_id))}</span>`;
  const pendingReimb = state.reimbursements.filter((row) => row.status === 'pending' && inScope(row) && canManage(row.school_id)).length;
  return `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-mark">N</span><div><strong>${tr('Campus Ambassador Ops', '校园大使工作台')}</strong><small>${tr('Campus growth workspace', '校园增长协作空间')}</small></div></div>
        <div class="workspace-switch"><span class="workspace-dot"></span>${schoolControl}</div>
        <nav class="nav-group">
          <div class="nav-label">${tr('Overview', '总览')}</div>
          ${navItem('overview', '◒', tr('Overview', '总览'))}
          <div class="nav-label section-label">${tr('Work', '工作')}</div>
          ${navItem('work', '↗', tr('Weekly Work', '每周工作'))}
          ${navItem('ugc', '▶', tr('UGC Review', 'UGC 审核'))}
          ${navItem('posters', '▤', tr('Poster Posting', '海报张贴'))}
          ${navItem('referrals', '✚', tr('Referrals', '拉新奖励'))}
          <div class="nav-label section-label">${tr('Finance', '财务')}</div>
          ${navItem('reimbursements', '$', tr('Reimbursements', '报销'), pendingReimb || '')}
          ${isAdmin() ? `<div class="nav-label section-label">${tr('Admin', '管理')}</div>${navItem('admin', '⚙', tr('Members & approvals', '成员与审批'), state.requests.length || '')}` : ''}
        </nav>
        <div class="sidebar-bottom">
          <div class="profile"><span class="avatar">${esc(profile.display_name[0] || '?')}</span><div><strong>${esc(profile.display_name)}</strong><small>${label(ROLES[profile.role])} · ${esc(schoolName(profile.school_id))}</small></div></div>
        </div>
      </aside>
      <main class="main-content">
        <header class="topbar"><div class="mobile-brand"><span class="brand-mark">N</span><select class="mobile-nav" data-change="view">${['overview', 'work', 'ugc', 'posters', 'referrals', 'reimbursements', ...(isAdmin() ? ['admin'] : [])].map((view) => `<option value="${view}" ${state.view === view ? 'selected' : ''}>${viewTitle(view)}</option>`).join('')}</select></div><div class="top-actions"><span class="save-state">● ${tr('Synced', '已同步')}</span><button class="button secondary" data-action="refresh">↻</button><button class="button secondary" data-action="sign-out">${tr('Sign out', '退出登录')}</button><button class="language-toggle" data-action="language">${state.language === 'en' ? '中文' : 'English'}</button></div></header>
        <section class="page-wrap">${content}</section>
      </main>
      <div class="toast" id="toast"></div>
      <div id="modal-root"></div>
    </div>`;
}

function viewTitle(view) {
  return {
    overview: tr('Overview', '总览'), work: tr('Weekly Work', '每周工作'), ugc: tr('UGC Review', 'UGC 审核'), posters: tr('Poster Posting', '海报张贴'),
    referrals: tr('Referrals', '拉新奖励'), reimbursements: tr('Reimbursements', '报销'), admin: tr('Members & approvals', '成员与审批'),
  }[view];
}

function pageHead(title, subtitle, actions) {
  return `<div class="page-head"><div><p class="kicker">${weekLabel()}</p><h1>${title}</h1>${subtitle ? `<p class="subhead">${subtitle}</p>` : ''}</div><div class="head-actions">${actions}</div></div>`;
}

function metricCard(text, value, trend, icon, tone) {
  return `<div class="metric-card ${tone}"><div class="metric-top"><span>${text}</span><span class="metric-icon">${icon}</span></div><strong>${value}</strong><div class="metric-trend">${trend}</div></div>`;
}

function emptyState(text = tr('No records yet. Add the first one to get started.', '还没有记录，先新增一条吧。')) {
  return `<div class="empty-state"><span>✦</span><p>${text}</p></div>`;
}

// ---------------------------------------------------------------------------
// Overview + record tables
// ---------------------------------------------------------------------------

const scopedRecords = () => state.records.filter(inScope);
const recordName = (record) => record.payload?.name || state.profiles.find((p) => p.id === record.submitted_by)?.display_name || '—';
const recordDetail = (record) => {
  const p = record.payload || {};
  return { work: p.task, ugc: p.topic, poster: p.location, referral: p.description || tr('Referral', '拉新') }[record.record_type] || '';
};

function overviewView() {
  const records = scopedRecords();
  const approved = records.filter((r) => ['approved', 'posted'].includes(r.status));
  const hours = approved.filter((r) => ['work', 'ugc'].includes(r.record_type)).reduce((sum, r) => sum + Number(r.payload?.hours || 0), 0);
  const posters = approved.filter((r) => r.record_type === 'poster').reduce((sum, r) => sum + Number(r.payload?.count || 0), 0);
  const ugcPosted = records.filter((r) => r.record_type === 'ugc' && r.status === 'posted').length;
  const reimbPending = state.reimbursements.filter((r) => inScope(r) && r.status === 'pending');
  const pendingCount = records.filter((r) => r.status === 'pending').length;
  const team = state.profiles.filter(inScope);
  return `${pageHead(tr('Overview', '总览'), '', `<button class="button secondary" data-action="export-records">${tr('Export CSV', '导出表格')} ↗</button><button class="button primary" data-action="add-record">${tr('Add record', '新增记录')} ＋</button>`)}
    <div class="week-bar"><div><span class="calendar-icon">□</span><strong>${weekLabel()}</strong></div><span class="week-status"><i></i>${pendingCount} ${tr('pending review', '条待审核')}</span></div>
    <div class="metrics-grid">
      ${metricCard(tr('Approved hours', '已核验工时'), `${hours}h`, tr('work + UGC', '工作 + UGC'), '◷', 'lilac')}
      ${metricCard(tr('UGC published', '已发布 UGC'), ugcPosted, `${records.filter((r) => r.record_type === 'ugc').length} ${tr('total', '条')}`, '▶', 'peach')}
      ${metricCard(tr('Posters posted', '已张贴海报'), posters, tr('approved', '已核验'), '▤', 'blue')}
      ${metricCard(tr('Pending reimbursements', '待审报销'), money(reimbPending.reduce((s, r) => s + Number(r.amount), 0)), `${reimbPending.length} ${tr('requests', '笔')}`, '$', 'mint')}
    </div>
    <div class="dashboard-grid">
      <section class="panel"><div class="panel-head"><div><h2>${tr('Recent activity', '最近动态')}</h2><p>${tr('Latest submissions', '最新提交记录')}</p></div></div><div class="activity-list">${records.slice(0, 8).map(activityRow).join('') || emptyState()}</div></section>
      <section class="panel"><div class="panel-head"><div><h2>${tr('Team snapshot', '团队概览')}</h2><p>${team.length} ${tr('members', '位成员')}</p></div></div><div class="team-list">${team.map((person) => teamRow(person, records)).join('') || emptyState(tr('No approved members yet.', '还没有已审批成员。'))}</div></section>
    </div>`;
}

function activityRow(record) {
  const type = RECORD_TYPES[record.record_type];
  return `<div class="activity-row"><span class="activity-icon ${record.record_type}">${type.icon}</span><div class="activity-main"><strong>${esc(recordName(record))}</strong><span>${label(type)} · ${esc(recordDetail(record))}</span></div><div class="activity-meta"><span>${scope() === 'all' ? esc(schoolName(record.school_id)) : ''}</span><span>${dateLabel(record.payload?.date || record.created_at)}</span></div>${statusBadge(record.status)}</div>`;
}

function teamRow(person, records) {
  const mine = records.filter((r) => r.submitted_by === person.id);
  const hours = mine.filter((r) => ['approved', 'posted'].includes(r.status)).reduce((sum, r) => sum + Number(r.payload?.hours || 0), 0);
  return `<div class="team-row"><span class="avatar small">${esc(person.display_name[0])}</span><div class="team-name"><strong>${esc(person.display_name)}</strong><span>${label(ROLES[person.role])}</span></div><div class="team-progress"><div><span style="width:${Math.min(100, mine.length * 12)}%"></span></div><small>${hours}h ${tr('verified', '已核验')}</small></div><strong class="team-count">${mine.length}</strong></div>`;
}

function recordColumns(type) {
  const p = (key) => (r) => esc(r.payload?.[key]);
  const linkCell = (r) => (safeUrl(r.payload?.link) ? `<a href="${esc(r.payload.link)}" target="_blank" rel="noopener">${tr('Open', '查看')}</a>` : '—');
  return {
    work: [[tr('Task', '任务'), p('task')], [tr('Description', '描述'), p('description')], [tr('Hours', '工时'), (r) => `${esc(r.payload?.hours)}h`], [tr('Proof', '凭证'), linkCell]],
    ugc: [[tr('Video topic', '视频主题'), p('topic')], [tr('Platform', '平台'), p('platform')], [tr('Hours', '工时'), (r) => `${esc(r.payload?.hours)}h`], [tr('Link', '链接'), linkCell]],
    poster: [[tr('Location', '地点'), p('location')], [tr('Count', '数量'), p('count')], [tr('Photo', '照片'), linkCell]],
    referral: [[tr('Valid referrals', '有效拉新'), p('count')], [tr('Note', '备注'), p('description')], [tr('Proof', '凭证'), linkCell]],
  }[type];
}

function statusControl(row, kind, options) {
  if (!canManage(row.school_id)) return statusBadge(row.status);
  return `<select class="status-select ${STATUS[row.status]?.tone}" data-change="${kind}-status" data-id="${row.id}">${options.map((status) => `<option value="${status}" ${row.status === status ? 'selected' : ''}>${label(STATUS[status])}</option>`).join('')}</select>`;
}

function filterBar(options) {
  return `<div class="filter-bar"><div class="filter-title">${tr('Filter', '筛选')}</div><div class="filter-pills">${['all', ...options].map((status) => `<button class="filter-pill ${state.filter === status ? 'selected' : ''}" data-action="filter" data-filter="${status}">${status === 'all' ? tr('All', '全部') : label(STATUS[status])}</button>`).join('')}</div></div>`;
}

function recordTableView(view) {
  const type = VIEW_TYPE[view];
  const statuses = type === 'ugc' ? ['pending', 'approved', 'rejected', 'posted'] : ['pending', 'approved', 'rejected'];
  const rows = scopedRecords().filter((r) => r.record_type === type && (state.filter === 'all' || r.status === state.filter));
  const columns = recordColumns(type);
  const showSchool = scope() === 'all';
  const head = [tr('Name', '姓名'), ...(showSchool ? [tr('School', '学校')] : []), ...columns.map(([heading]) => heading), tr('Date', '日期'), tr('Status', '状态'), ''];
  const subtitle = {
    work: tr('Log verified campus execution work.', '记录可核验的校园执行工作。'), ugc: tr('Review drafts before anything goes live.', '所有视频公开发布前必须完成审核。'),
    poster: tr('Track poster counts with photo proof.', '记录张贴数量并附现场照片凭证。'), referral: tr('Track valid referrals.', '记录有效拉新人数。'),
  }[type];
  const body = rows.map((r) => `<tr><td><div class="cell-person"><span class="avatar tiny">${esc(recordName(r)[0])}</span><strong>${esc(recordName(r))}</strong></div></td>${showSchool ? `<td>${esc(schoolName(r.school_id))}</td>` : ''}${columns.map(([, cell]) => `<td>${cell(r)}</td>`).join('')}<td>${dateLabel(r.payload?.date || r.created_at)}</td><td>${statusControl(r, 'record', statuses)}</td><td>${r.submitted_by === state.session.user.id || canManage(r.school_id) ? `<button class="delete-button table-delete" data-action="delete-record" data-id="${r.id}">${tr('Delete', '删除')}</button>` : ''}</td></tr>`).join('');
  return `${pageHead(viewTitle(view), subtitle, `<button class="button secondary" data-action="export-records">${tr('Export CSV', '导出表格')} ↗</button><button class="button primary" data-action="add-record" data-type="${type}">${tr('Add record', '新增记录')} ＋</button>`)}
    ${filterBar(statuses)}
    <section class="panel"><div class="table-wrap"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body || `<tr><td colspan="${head.length}">${emptyState()}</td></tr>`}</tbody></table></div></section>`;
}

function recordFields(type) {
  const linkField = `<label class="span-2">${tr('Proof / link', '凭证 / 链接')}<input name="link" type="url" placeholder="https://..." /></label>`;
  return {
    work: `<label>${tr('Task', '任务')}<select name="task"><option>Ground Promotion</option><option>Community Operations</option><option>Internal Coordination</option><option>Other Execution</option></select></label><label>${tr('Hours', '工时')}<input name="hours" type="number" min="0.25" step="0.25" value="1" required /></label><label class="span-2">${tr('Description', '工作描述')}<input name="description" required /></label>${linkField}`,
    ugc: `<label>${tr('Platform', '平台')}<select name="platform"><option>TikTok</option><option>Instagram Reels</option><option>Xiaohongshu</option></select></label><label>${tr('Hours', '工时')}<input name="hours" type="number" min="0.25" step="0.25" value="1.5" required /></label><label class="span-2">${tr('Video topic', '视频主题')}<input name="topic" required /></label>${linkField}`,
    poster: `<label>${tr('Location', '张贴地点')}<input name="location" required /></label><label>${tr('Count', '数量')}<input name="count" type="number" min="1" step="1" value="2" required /></label>${linkField}`,
    referral: `<label>${tr('Valid referrals', '有效拉新人数')}<input name="count" type="number" min="1" step="1" value="1" required /></label><label>${tr('Note', '备注')}<input name="description" /></label>${linkField}`,
  }[type];
}

function openRecordModal(type = 'work') {
  openModal(tr('Add record', '新增记录'), `<form data-form="record"><label>${tr('Record type', '记录类型')}<select name="type" data-change="record-type">${Object.entries(RECORD_TYPES).map(([key, entry]) => `<option value="${key}" ${key === type ? 'selected' : ''}>${label(entry)}</option>`).join('')}</select></label><div class="form-grid"><label>${tr('Date', '日期')}<input name="date" type="date" value="${today()}" required /></label><label>${tr('Name', '姓名')}<input value="${esc(state.profile.display_name)}" disabled /></label></div><div class="form-grid" id="dynamic-fields">${recordFields(type)}</div><button class="button primary full" type="submit">${tr('Save record', '保存记录')} →</button></form>`);
}

async function saveRecord(form) {
  const { type, ...fields } = Object.fromEntries(new FormData(form).entries());
  const payload = { ...fields, name: state.profile.display_name };
  if (payload.hours) payload.hours = Number(payload.hours);
  if (payload.count) payload.count = Number(payload.count);
  const ok = await run(supabase.from('records').insert({ school_id: state.profile.school_id, submitted_by: state.session.user.id, record_type: type, status: 'pending', payload }), tr('Saved', '已保存'));
  if (ok) closeModal();
}

// ---------------------------------------------------------------------------
// Reimbursements
// ---------------------------------------------------------------------------

function reimbursementsView() {
  const rows = state.reimbursements.filter(inScope);
  const filtered = rows.filter((r) => state.filter === 'all' || r.status === state.filter);
  const sum = (list) => money(list.reduce((s, r) => s + Number(r.amount), 0));
  const byStatus = (status) => rows.filter((r) => r.status === status);
  const showSchool = scope() === 'all';
  const managing = rows.some((r) => canManage(r.school_id)) || canManage(scope());
  const categoryTotals = Object.entries(CATEGORIES).map(([key, entry]) => {
    const list = rows.filter((r) => r.category === key && r.status !== 'rejected');
    return list.length ? `<div class="category-chip"><span>${label(entry)}</span><strong>${sum(list)}</strong></div>` : '';
  }).join('');
  const head = [tr('Date', '日期'), tr('Name', '姓名'), ...(showSchool ? [tr('School', '学校')] : []), tr('Category', '类别'), tr('Description', '说明'), tr('Amount', '金额'), tr('Receipt', '票据'), tr('Status', '状态'), tr('Review note', '审核备注'), ''];
  const body = filtered.map((r) => {
    const receipt = r.receipt_path ? `<button class="text-button" data-action="receipt" data-path="${esc(r.receipt_path)}">${tr('View', '查看')}</button>` : safeUrl(r.receipt_url) ? `<a href="${esc(r.receipt_url)}" target="_blank" rel="noopener">${tr('Open', '打开')}</a>` : '—';
    const note = canManage(r.school_id) ? `<input class="note-input" data-change="reimb-note" data-id="${r.id}" value="${esc(r.reviewer_note || '')}" placeholder="${tr('Add note', '添加备注')}" />` : esc(r.reviewer_note || '—');
    const canDelete = canManage(r.school_id) || (r.submitted_by === state.session.user.id && r.status === 'pending');
    return `<tr><td>${dateLabel(r.expense_date)}</td><td><div class="cell-person"><span class="avatar tiny">${esc(r.submitter_name[0])}</span><strong>${esc(r.submitter_name)}</strong></div></td>${showSchool ? `<td>${esc(schoolName(r.school_id))}</td>` : ''}<td>${label(CATEGORIES[r.category])}</td><td>${esc(r.description)}</td><td class="amount">${money(r.amount)}</td><td>${receipt}</td><td>${statusControl(r, 'reimb', ['pending', 'approved', 'rejected', 'paid'])}</td><td>${note}</td><td>${canDelete ? `<button class="delete-button table-delete" data-action="delete-reimb" data-id="${r.id}">${tr('Delete', '删除')}</button>` : ''}</td></tr>`;
  }).join('');
  return `${pageHead(tr('Reimbursements', '报销'), managing ? tr('Review, approve and mark reimbursements as paid.', '审核报销、批准并标记打款。') : tr('Submit expenses with a receipt. You can see your own requests.', '上传票据提交报销，你可以看到自己的申请。'), `<button class="button secondary" data-action="export-reimb">${tr('Export CSV', '导出表格')} ↗</button><button class="button primary" data-action="add-reimb">${tr('New reimbursement', '新增报销')} ＋</button>`)}
    <div class="metrics-grid">
      ${metricCard(tr('Pending review', '待审核'), sum(byStatus('pending')), `${byStatus('pending').length} ${tr('requests', '笔')}`, '◷', 'peach')}
      ${metricCard(tr('Approved, unpaid', '已批准待打款'), sum(byStatus('approved')), `${byStatus('approved').length} ${tr('requests', '笔')}`, '✓', 'lilac')}
      ${metricCard(tr('Paid', '已打款'), sum(byStatus('paid')), `${byStatus('paid').length} ${tr('requests', '笔')}`, '$', 'mint')}
      ${metricCard(tr('Rejected', '已驳回'), sum(byStatus('rejected')), `${byStatus('rejected').length} ${tr('requests', '笔')}`, '×', 'blue')}
    </div>
    ${categoryTotals ? `<div class="category-row">${categoryTotals}</div>` : ''}
    ${filterBar(['pending', 'approved', 'paid', 'rejected'])}
    <section class="panel"><div class="table-wrap"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body || `<tr><td colspan="${head.length}">${emptyState(tr('No reimbursements yet.', '还没有报销记录。'))}</td></tr>`}</tbody></table></div></section>`;
}

function openReimbModal() {
  openModal(tr('New reimbursement', '新增报销'), `<form data-form="reimb"><div class="form-grid"><label>${tr('Category', '类别')}<select name="category" required>${Object.entries(CATEGORIES).map(([key, entry]) => `<option value="${key}">${label(entry)}</option>`).join('')}</select></label><label>${tr('Amount (USD)', '金额（美元）')}<input name="amount" type="number" min="0.01" step="0.01" required /></label><label>${tr('Expense date', '消费日期')}<input name="expense_date" type="date" value="${today()}" required /></label><label>${tr('Name', '姓名')}<input value="${esc(state.profile.display_name)}" disabled /></label><label class="span-2">${tr('What was it for?', '用途说明')}<input name="description" required placeholder="${tr('e.g. 200 flyers for club fair', '例如：社团招新 200 张传单')}" /></label><label class="span-2">${tr('Receipt photo / PDF', '票据照片 / PDF')}<input name="receipt" type="file" accept="image/*,application/pdf" /></label><label class="span-2">${tr('…or receipt link', '…或票据链接')}<input name="receipt_url" type="url" placeholder="https://..." /></label></div><button class="button primary full" type="submit">${tr('Submit', '提交报销')} →</button></form>`);
}

async function saveReimb(form) {
  const data = new FormData(form);
  const file = data.get('receipt');
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  let receiptPath = null;
  if (file && file.size) {
    if (file.size > 10 * 1024 * 1024) { showToast(tr('Receipt must be under 10 MB.', '票据文件需小于 10 MB。')); button.disabled = false; return; }
    receiptPath = `${state.session.user.id}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`;
    const { error } = await supabase.storage.from('receipts').upload(receiptPath, file);
    if (error) { showToast(friendlyError(error)); button.disabled = false; return; }
  }
  const ok = await run(supabase.from('reimbursements').insert({
    school_id: state.profile.school_id,
    submitted_by: state.session.user.id,
    submitter_name: state.profile.display_name,
    category: data.get('category'),
    amount: Number(data.get('amount')),
    expense_date: data.get('expense_date'),
    description: data.get('description'),
    receipt_url: data.get('receipt_url') || null,
    receipt_path: receiptPath,
  }), tr('Reimbursement submitted', '报销已提交'));
  if (ok) closeModal(); else button.disabled = false;
}

async function openReceipt(path) {
  const tab = window.open('', '_blank');
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 600);
  if (error) { tab?.close(); showToast(friendlyError(error)); return; }
  if (tab) tab.location = data.signedUrl; else window.location.href = data.signedUrl;
}

// ---------------------------------------------------------------------------
// Admin: approvals and members
// ---------------------------------------------------------------------------

const schoolOptions = (selected) => state.schools.map((school) => `<option value="${school.id}" ${school.id === selected ? 'selected' : ''}>${esc(school.name)}</option>`).join('');
const roleOptions = (selected) => Object.entries(ROLES).map(([key, entry]) => `<option value="${key}" ${key === selected ? 'selected' : ''}>${label(entry)}</option>`).join('');

function adminView() {
  const signedInEmails = new Set(state.profiles.map((p) => (p.email || '').toLowerCase()));
  const invites = state.allowed.filter((row) => !signedInEmails.has(row.email));
  const members = state.profiles.filter(inScope);
  const requests = state.requests.map((r) => `<tr data-row="${r.user_id}"><td>${esc(r.email)}</td><td><input name="display_name" value="${esc(r.display_name)}" /></td><td><select name="school_id">${schoolOptions(r.school_id)}</select></td><td><select name="role">${roleOptions('ambassador')}</select></td><td>${esc(r.note || '—')}</td><td>${dateLabel(r.created_at)}</td><td class="row-actions"><button class="button primary small" data-action="approve" data-email="${esc(r.email)}">${tr('Approve', '批准')}</button><button class="button secondary small" data-action="reject" data-id="${r.user_id}">${tr('Reject', '拒绝')}</button></td></tr>`).join('');
  const memberRows = members.map((p) => `<tr data-row="${p.id}"><td>${esc(p.email || '—')}</td><td><input name="display_name" value="${esc(p.display_name)}" /></td><td><select name="school_id">${schoolOptions(p.school_id)}</select></td><td><select name="role">${roleOptions(p.role)}</select></td><td class="row-actions">${p.email ? `<button class="button secondary small" data-action="approve" data-email="${esc(p.email)}">${tr('Save', '保存')}</button>${p.id !== state.session.user.id ? `<button class="delete-button table-delete" data-action="revoke" data-email="${esc(p.email)}">${tr('Remove', '移除')}</button>` : ''}` : tr('Signs in to update', '登录后可编辑')}</td></tr>`).join('');
  const inviteRows = invites.map((row) => `<tr><td>${esc(row.email)}</td><td>${esc(row.display_name)}</td><td>${esc(schoolName(row.school_id))}</td><td>${label(ROLES[row.role])}</td><td><button class="delete-button table-delete" data-action="revoke" data-email="${esc(row.email)}">${tr('Remove', '移除')}</button></td></tr>`).join('');
  return `${pageHead(tr('Members & approvals', '成员与审批'), tr('Only approved emails can submit and see school data.', '只有审批通过的邮箱才能提交和查看学校数据。'), '')}
    <section class="panel admin-section"><div class="panel-head"><div><h2>${tr('Pending requests', '待审批申请')}</h2><p>${tr('People who signed in and asked for access', '已登录并申请加入的成员')}</p></div></div><div class="table-wrap"><table><thead><tr><th>${tr('Email', '邮箱')}</th><th>${tr('Name', '姓名')}</th><th>${tr('School', '学校')}</th><th>${tr('Role', '角色')}</th><th>${tr('Note', '备注')}</th><th>${tr('Requested', '申请时间')}</th><th></th></tr></thead><tbody>${requests || `<tr><td colspan="7">${emptyState(tr('No pending requests.', '没有待审批的申请。'))}</td></tr>`}</tbody></table></div></section>
    <section class="panel admin-section"><div class="panel-head"><div><h2>${tr('Pre-approve an email', '提前批准邮箱')}</h2><p>${tr('They can sign in directly without waiting.', '对方登录后直接进入，无需等待审批。')}</p></div></div><form data-form="invite" class="invite-form"><input name="email" type="email" required placeholder="name@school.edu" /><input name="display_name" required placeholder="${tr('Name', '姓名')}" /><select name="school_id">${schoolOptions(scope() === 'all' ? 'nyu' : scope())}</select><select name="role">${roleOptions('ambassador')}</select><button class="button primary" type="submit">${tr('Approve', '批准')}</button></form>${inviteRows ? `<div class="table-wrap"><table><thead><tr><th>${tr('Approved, not signed in yet', '已批准、尚未登录')}</th><th>${tr('Name', '姓名')}</th><th>${tr('School', '学校')}</th><th>${tr('Role', '角色')}</th><th></th></tr></thead><tbody>${inviteRows}</tbody></table></div>` : ''}</section>
    <section class="panel admin-section"><div class="panel-head"><div><h2>${tr('Members', '成员')}</h2><p>${members.length} ${tr('members', '位成员')}</p></div></div><div class="table-wrap"><table><thead><tr><th>${tr('Email', '邮箱')}</th><th>${tr('Name', '姓名')}</th><th>${tr('School', '学校')}</th><th>${tr('Role', '角色')}</th><th></th></tr></thead><tbody>${memberRows || `<tr><td colspan="5">${emptyState(tr('No members yet.', '还没有成员。'))}</td></tr>`}</tbody></table></div></section>`;
}

function approveFromRow(button) {
  const row = button.closest('tr');
  const value = (name) => row.querySelector(`[name="${name}"]`).value;
  return run(supabase.rpc('approve_member', { p_email: button.dataset.email, p_display_name: value('display_name'), p_school_id: value('school_id'), p_role: value('role') }), tr('Saved', '已保存'));
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function downloadCsv(filename, header, rows) {
  const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + [header, ...rows].map((row) => row.map(cell).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  URL.revokeObjectURL(url);
  showToast(tr('Exported', '已导出'));
}

function exportRecords() {
  const type = VIEW_TYPE[state.view];
  const rows = scopedRecords().filter((r) => !type || r.record_type === type).map((r) => {
    const p = r.payload || {};
    return [p.date || r.created_at.slice(0, 10), schoolName(r.school_id), recordName(r), label(RECORD_TYPES[r.record_type]), recordDetail(r), p.description || '', p.hours || '', p.count || '', p.platform || '', p.link || '', label(STATUS[r.status])];
  });
  downloadCsv(`ambassador-records-${today()}.csv`, ['Date', 'School', 'Name', 'Type', 'Item', 'Description', 'Hours', 'Count', 'Platform', 'Link', 'Status'], rows);
}

function exportReimbursements() {
  const rows = state.reimbursements.filter(inScope).map((r) => [r.expense_date, schoolName(r.school_id), r.submitter_name, label(CATEGORIES[r.category]), r.description, r.amount, r.currency, label(STATUS[r.status]), r.reviewer_note || '', r.receipt_url || (r.receipt_path ? 'uploaded' : '')]);
  downloadCsv(`reimbursements-${today()}.csv`, ['Expense date', 'School', 'Name', 'Category', 'Description', 'Amount', 'Currency', 'Status', 'Review note', 'Receipt'], rows);
}

// ---------------------------------------------------------------------------
// Modal, render, events
// ---------------------------------------------------------------------------

function openModal(title, body) {
  document.querySelector('#modal-root').innerHTML = `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h2>${title}</h2><button class="icon-button" data-action="close-modal">×</button></div>${body}</section></div>`;
}

function closeModal() { const root = document.querySelector('#modal-root'); if (root) root.innerHTML = ''; }

function render() {
  localStorage.setItem('nyu-language', state.language);
  if (!supabaseConfigured) { app.innerHTML = authCard(`<h1>${tr('Not configured', '尚未配置')}</h1><p class="subhead">${tr('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to use the app.', '需要配置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY。')}</p>`); return; }
  if (state.phase === 'loading') { app.innerHTML = `<div class="loading-screen">${tr('Loading…', '加载中…')}</div>`; return; }
  if (state.phase === 'signed-out') { app.innerHTML = signedOutScreen(); return; }
  if (state.phase === 'request') { app.innerHTML = requestScreen(); return; }
  if (state.phase === 'error') { app.innerHTML = authCard(`<h1>${tr('Something went wrong', '出错了')}</h1><div class="local-only-notice">${esc(state.notice)}</div><button class="button primary full" data-action="recheck">${tr('Try again', '重试')}</button>`); return; }
  if (state.view === 'admin' && !isAdmin()) state.view = 'overview';
  const content = state.view === 'overview' ? overviewView() : state.view === 'reimbursements' ? reimbursementsView() : state.view === 'admin' ? adminView() : recordTableView(state.view);
  app.innerHTML = shell(content);
}

const actions = {
  'language': () => { state.language = state.language === 'en' ? 'zh' : 'en'; render(); },
  'sign-out': async () => { await supabase.auth.signOut(); },
  'recheck': () => { state.phase = 'loading'; render(); boot(state.session); },
  'refresh': () => refresh().then(() => showToast(tr('Synced', '已同步'))),
  'view': (el) => { state.view = el.dataset.view; state.filter = 'all'; render(); },
  'filter': (el) => { state.filter = el.dataset.filter; render(); },
  'add-record': (el) => openRecordModal(el.dataset.type),
  'add-reimb': openReimbModal,
  'close-modal': (el, event) => { if (event.target === el || el.tagName === 'BUTTON') closeModal(); },
  'export-records': exportRecords,
  'export-reimb': exportReimbursements,
  'receipt': (el) => openReceipt(el.dataset.path),
  'delete-record': (el) => { if (confirm(tr('Delete this record? This cannot be undone.', '确定删除这条记录吗？删除后无法恢复。'))) run(supabase.from('records').delete().eq('id', el.dataset.id), tr('Deleted', '已删除')); },
  'delete-reimb': (el) => {
    if (!confirm(tr('Delete this reimbursement?', '确定删除这笔报销吗？'))) return;
    const row = state.reimbursements.find((r) => r.id === el.dataset.id);
    if (row?.receipt_path && row.submitted_by === state.session.user.id) supabase.storage.from('receipts').remove([row.receipt_path]);
    run(supabase.from('reimbursements').delete().eq('id', el.dataset.id), tr('Deleted', '已删除'));
  },
  'approve': approveFromRow,
  'reject': (el) => run(supabase.rpc('reject_request', { p_user_id: el.dataset.id }), tr('Rejected', '已拒绝')),
  'revoke': (el) => { if (confirm(tr(`Remove access for ${el.dataset.email}?`, `确定移除 ${el.dataset.email} 的访问权限吗？`))) run(supabase.rpc('revoke_member', { p_email: el.dataset.email }), tr('Removed', '已移除')); },
};

const changes = {
  'scope': (el) => { state.schoolScope = el.value; localStorage.setItem('nyu-school-scope', el.value); render(); },
  'view': (el) => { state.view = el.value; state.filter = 'all'; render(); },
  'record-type': (el) => { document.querySelector('#dynamic-fields').innerHTML = recordFields(el.value); },
  'record-status': (el) => run(supabase.from('records').update({ status: el.value }).eq('id', el.dataset.id), tr('Status updated', '状态已更新')),
  'reimb-status': (el) => run(supabase.from('reimbursements').update({ status: el.value, reviewed_by: state.session.user.id, reviewed_at: new Date().toISOString() }).eq('id', el.dataset.id), tr('Status updated', '状态已更新')),
  'reimb-note': (el) => run(supabase.from('reimbursements').update({ reviewer_note: el.value }).eq('id', el.dataset.id), tr('Note saved', '备注已保存')),
};

const forms = {
  'sign-in': async (form) => {
    const email = new FormData(form).get('email').trim();
    form.querySelector('button').disabled = true;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: authRedirectUrl } });
    if (error) { state.notice = friendlyError(error); } else {
      state.notice = tr(`Sign-in link sent to ${email}. Check your inbox (and spam).`, `登录链接已发送到 ${email}，请查收邮箱（包括垃圾邮件）。`);
      state.cooldownUntil = Date.now() + 60000;
      const tick = setInterval(() => { if (state.phase !== 'signed-out' || Date.now() > state.cooldownUntil) clearInterval(tick); if (state.phase === 'signed-out') render(); }, 1000);
    }
    render();
  },
  'request': async (form) => {
    const data = Object.fromEntries(new FormData(form).entries());
    const { data: request, error } = await supabase.rpc('request_access', { p_display_name: data.display_name, p_school_id: data.school_id, p_note: data.note || null });
    if (error) { showToast(friendlyError(error)); return; }
    state.request = request;
    render();
  },
  'record': saveRecord,
  'reimb': saveReimb,
  'invite': async (form) => {
    const data = Object.fromEntries(new FormData(form).entries());
    await run(supabase.rpc('approve_member', { p_email: data.email, p_display_name: data.display_name, p_school_id: data.school_id, p_role: data.role }), tr('Email approved', '邮箱已批准'));
  },
};

app.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el, event);
});
app.addEventListener('change', (event) => {
  const el = event.target.closest('[data-change]');
  if (el && changes[el.dataset.change]) changes[el.dataset.change](el);
});
app.addEventListener('submit', (event) => {
  const form = event.target.closest('[data-form]');
  if (!form || !forms[form.dataset.form]) return;
  event.preventDefault();
  forms[form.dataset.form](form);
});

function readAuthError() {
  const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search.slice(1));
  const description = params.get('error_description');
  if (!description) return;
  state.notice = params.get('error_code') === 'otp_expired'
    ? tr('That sign-in link has expired or was already used. Request a new one below.', '这个登录链接已过期或已被使用，请在下方重新获取。')
    : description.replace(/\+/g, ' ');
  history.replaceState(null, '', window.location.pathname);
}

if (supabaseConfigured) {
  readAuthError();
  render();
  // Defer work out of the auth callback; awaiting Supabase calls inside it can deadlock.
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED' && state.phase === 'app') { state.session = session; return; }
    setTimeout(() => boot(session), 0);
  });
} else {
  render();
}
