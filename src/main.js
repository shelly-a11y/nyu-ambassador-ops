import './style.css';

const ambassadors = [
  { name: 'Shelly', role: 'Lead', rate: 22, initials: 'S' },
  { name: 'Ada', role: 'Regular Ambassador', rate: 18, initials: 'A' },
  { name: 'Harrison', role: 'Regular Ambassador', rate: 18, initials: 'H' },
  { name: 'Karim', role: 'Regular Ambassador', rate: 18, initials: 'K' },
  { name: 'Xinyi', role: 'Regular Ambassador', rate: 18, initials: 'X' },
  { name: 'Rhea', role: 'Regular Ambassador', rate: 18, initials: 'R' },
  { name: 'Abby', role: 'Regular Ambassador', rate: 18, initials: 'A' },
];

const copy = {
  en: {
    brand: 'NYU Ambassador Ops',
    eyebrow: 'Campus growth workspace',
    overview: 'Overview',
    work: 'Weekly Work',
    ugc: 'UGC Review',
    posters: 'Poster Posting',
    settings: 'Settings',
    week: 'Week 1 · Oct 06–12, 2026',
    addRecord: 'Add record',
    export: 'Export report',
    teamMembers: 'Team members',
    approvedHours: 'Approved hours',
    ugcPublished: 'UGC published',
    postersDone: 'Posters posted',
    fromLastWeek: 'from last week',
    pending: 'pending review',
    verified: 'verified',
    recentActivity: 'Recent activity',
    activitySub: 'Latest submissions across your ambassador team',
    teamSnapshot: 'Team snapshot',
    teamSub: 'Submission progress by ambassador',
    noRecords: 'No records yet. Add the first one to get started.',
    status: 'Status',
    name: 'Name',
    task: 'Task',
    date: 'Date',
    amount: 'Amount',
    hours: 'Hours',
    action: 'Action',
    approved: 'Approved',
    pendingStatus: 'Pending',
    rejected: 'Rejected',
    posted: 'Posted',
    review: 'Review',
    close: 'Close',
    save: 'Save record',
    type: 'Record type',
    selectType: 'Choose a record type',
    weeklyWork: 'Weekly work',
    ugcVideo: 'UGC video',
    posterRecord: 'Poster posting',
    referral: 'Referral reward',
    description: 'Description',
    link: 'Proof / link',
    platform: 'Platform',
    location: 'Location',
    count: 'Count',
    reviewStatus: 'Review status',
    verification: 'Verification',
    referralCount: 'Valid referrals',
    emptyActivity: 'No activity found for this filter.',
    all: 'All',
    approvedOnly: 'Approved',
    filters: 'Filter',
    thisWeek: 'This week',
    perHour: '/ hour',
    postersUnit: 'per poster',
    bilingual: '中文',
    language: 'Language',
    reset: 'Reset demo data',
    resetConfirm: 'Reset all local records to the starter demo data?',
    saved: 'Saved locally',
  },
  zh: {
    brand: 'NYU 校园大使工作台',
    eyebrow: '校园增长协作空间',
    overview: '总览',
    work: '每周工作',
    ugc: 'UGC 审核',
    posters: '海报张贴',
    settings: '设置',
    week: '第 1 周 · 2026 年 10 月 06–12 日',
    addRecord: '新增记录',
    export: '导出报告',
    teamMembers: '团队成员',
    approvedHours: '已核验工时',
    ugcPublished: '已发布 UGC',
    postersDone: '已张贴海报',
    fromLastWeek: '较上周',
    pending: '待审核',
    verified: '已核验',
    recentActivity: '最近动态',
    activitySub: '团队最新提交记录',
    teamSnapshot: '团队概览',
    teamSub: '每位大使的提交进度',
    noRecords: '还没有记录，先新增一条吧。',
    status: '状态',
    name: '姓名',
    task: '任务',
    date: '日期',
    amount: '金额',
    hours: '工时',
    action: '操作',
    approved: '已通过',
    pendingStatus: '待处理',
    rejected: '已驳回',
    posted: '已发布',
    review: '审核',
    close: '关闭',
    save: '保存记录',
    type: '记录类型',
    selectType: '选择记录类型',
    weeklyWork: '普通工作',
    ugcVideo: 'UGC 视频',
    posterRecord: '海报张贴',
    referral: '拉新奖励',
    description: '工作描述',
    link: '凭证 / 链接',
    platform: '发布平台',
    location: '张贴地点',
    count: '数量',
    reviewStatus: '审核状态',
    verification: '核验状态',
    referralCount: '有效拉新人数',
    emptyActivity: '当前筛选条件下没有动态。',
    all: '全部',
    approvedOnly: '已通过',
    filters: '筛选',
    thisWeek: '本周',
    perHour: '/ 小时',
    postersUnit: '每张',
    bilingual: 'EN',
    language: '语言',
    reset: '重置演示数据',
    resetConfirm: '确定要把所有本地记录重置为演示数据吗？',
    saved: '已保存到本地',
  },
};

const starterData = { works: [], ugc: [], posters: [], referrals: [] };

let state = {
  language: localStorage.getItem('nyu-language') || 'en',
  activeView: 'overview',
  filter: 'All',
  data: JSON.parse(localStorage.getItem('nyu-ambassador-data-v2') || 'null') || starterData,
};

const app = document.querySelector('#app');
const t = (key) => copy[state.language][key] || key;
const dateLabel = (value) => new Date(`${value}T12:00:00`).toLocaleDateString(state.language === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' });

function persist() {
  localStorage.setItem('nyu-ambassador-data-v2', JSON.stringify(state.data));
  localStorage.setItem('nyu-language', state.language);
}

function totals() {
  const approvedWork = state.data.works.filter((item) => item.status === 'Approved');
  const approvedUgc = state.data.ugc.filter((item) => ['Approved', 'Officially Posted'].includes(item.status));
  const approvedPosters = state.data.posters.filter((item) => item.status === 'Approved');
  return {
    workHours: approvedWork.reduce((sum, item) => sum + Number(item.hours || 0), 0),
    ugcHours: approvedUgc.reduce((sum, item) => sum + Number(item.hours || 0), 0),
    ugcPublished: state.data.ugc.filter((item) => item.status === 'Officially Posted').length,
    posters: approvedPosters.reduce((sum, item) => sum + Number(item.count || 0), 0),
    pending: [...state.data.works, ...state.data.ugc, ...state.data.posters].filter((item) => item.status.includes('Pending')).length,
  };
}

function statusClass(status) {
  if (status === 'Approved' || status === 'Officially Posted') return 'status approved';
  if (status === 'Rejected') return 'status rejected';
  return 'status pending';
}

function localizedStatus(status) {
  const map = { Approved: 'approved', 'Officially Posted': 'posted', Rejected: 'rejected', 'Pending Verification': 'pendingStatus', 'Pending Review': 'pendingStatus' };
  return t(map[status] || 'pendingStatus');
}

function navItem(view, icon, label) {
  return `<button class="nav-item ${state.activeView === view ? 'active' : ''}" data-view="${view}"><span class="nav-icon">${icon}</span><span>${label}</span></button>`;
}

function renderShell(content) {
  const total = totals();
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-mark">N</span><div><strong>${t('brand')}</strong><small>${t('eyebrow')}</small></div></div>
        <div class="workspace-switch"><span class="workspace-dot"></span><span>NYU Campus Team</span><span class="chevron">⌄</span></div>
        <nav class="nav-group">
          <div class="nav-label">${t('overview')}</div>
          ${navItem('overview', '◒', t('overview'))}
          <div class="nav-label section-label">${t('work')}</div>
          ${navItem('work', '↗', t('work'))}
          ${navItem('ugc', '▶', t('ugc'))}
          ${navItem('posters', '▤', t('posters'))}
        </nav>
        <div class="sidebar-bottom">
          <div class="language-note"><span class="globe">◎</span><span>${t('language')}</span><button class="language-mini" data-language="${state.language === 'en' ? 'zh' : 'en'}">${t('bilingual')}</button></div>
          <button class="nav-item"><span class="nav-icon">⚙</span><span>${t('settings')}</span></button>
          <div class="profile"><span class="avatar">S</span><div><strong>Shelly</strong><small>Lead · NYU</small></div><span class="more">•••</span></div>
        </div>
      </aside>
      <main class="main-content">
        <header class="topbar"><div class="mobile-brand"><span class="brand-mark">N</span><strong>${t('brand')}</strong></div><div class="top-actions"><span class="save-state">● ${t('saved')}</span><button class="icon-button" title="Notifications">♢<span class="notification-dot"></span></button><button class="language-toggle" data-language="${state.language === 'en' ? 'zh' : 'en'}">${state.language === 'en' ? '中文' : 'English'}</button></div></header>
        <section class="page-wrap">${content}</section>
      </main>
      <div class="toast" id="toast"></div>
      <div id="modal-root"></div>
    </div>`;
  bindShellEvents();
}

function overviewView() {
  const total = totals();
  const recent = [
    ...state.data.works.map((item) => ({ ...item, kind: 'work', label: item.task, detail: `${item.hours}h` })),
    ...state.data.ugc.map((item) => ({ ...item, kind: 'ugc', label: item.topic, detail: item.platform })),
    ...state.data.posters.map((item) => ({ ...item, kind: 'poster', label: item.location, detail: `${item.count} posters` })),
  ].sort((a, b) => b.id - a.id).slice(0, 6);
  return `<div class="page-head"><div><p class="kicker">${t('thisWeek')} / 2026</p><h1>${t('overview')}</h1></div><div class="head-actions"><button class="button secondary" data-export>${t('export')} <span>↗</span></button><button class="button primary" data-add>${t('addRecord')} <span>＋</span></button></div></div>
    <div class="week-bar"><div><span class="calendar-icon">□</span><strong>${t('week')}</strong></div><span class="week-status"><i></i>${total.pending} ${t('pending')}</span></div>
    <div class="metrics-grid">
      ${metricCard('approvedHours', `${total.workHours + total.ugcHours}h`, '+0h', '◷', 'lilac')}
      ${metricCard('ugcPublished', total.ugcPublished, `${state.data.ugc.length} total`, '▶', 'peach')}
      ${metricCard('postersDone', total.posters, `${state.data.posters.length} records`, '▤', 'blue')}
      ${metricCard('teamMembers', ambassadors.length, 'NYU', '◎', 'mint')}
    </div>
    <div class="dashboard-grid"><section class="panel activity-panel"><div class="panel-head"><div><h2>${t('recentActivity')}</h2><p>${t('activitySub')}</p></div><button class="text-button" data-view="work">${t('review')} <span>→</span></button></div><div class="activity-list">${recent.map(activityRow).join('') || emptyState()}</div></section><section class="panel team-panel"><div class="panel-head"><div><h2>${t('teamSnapshot')}</h2><p>${t('teamSub')}</p></div></div><div class="team-list">${ambassadors.map(teamRow).join('')}</div></section></div>`;
}

function metricCard(label, value, trend, icon, tone) {
  return `<div class="metric-card ${tone}"><div class="metric-top"><span>${t(label)}</span><span class="metric-icon">${icon}</span></div><strong>${value}</strong><div class="metric-trend"><span>${trend}</span> ${t('fromLastWeek')}</div></div>`;
}

function activityRow(item) {
  const icon = item.kind === 'ugc' ? '▶' : item.kind === 'poster' ? '▤' : '↗';
  return `<div class="activity-row"><span class="activity-icon ${item.kind}">${icon}</span><div class="activity-main"><strong>${item.name}</strong><span>${item.label}</span></div><div class="activity-meta"><span>${item.detail}</span><span>${dateLabel(item.date)}</span></div><span class="${statusClass(item.status)}">${localizedStatus(item.status)}</span></div>`;
}

function teamRow(person) {
  const work = state.data.works.filter((item) => item.name === person.name && item.status === 'Approved').reduce((sum, item) => sum + item.hours, 0);
  const ugc = state.data.ugc.filter((item) => item.name === person.name && ['Approved', 'Officially Posted'].includes(item.status)).reduce((sum, item) => sum + item.hours, 0);
  const submissions = state.data.works.filter((item) => item.name === person.name).length + state.data.ugc.filter((item) => item.name === person.name).length + state.data.posters.filter((item) => item.name === person.name).length;
  return `<div class="team-row"><span class="avatar small">${person.initials}</span><div class="team-name"><strong>${person.name}</strong><span>${person.role === 'Lead' ? 'Lead' : 'Ambassador'}</span></div><div class="team-progress"><div><span style="width:${Math.min(100, submissions * 18)}%"></span></div><small>${work + ugc}h verified</small></div><strong class="team-count">${submissions}</strong></div>`;
}

function tableView(view) {
  const config = {
    work: { title: t('work'), subtitle: state.language === 'en' ? 'Log verified campus execution work.' : '记录可核验的校园执行工作。', data: state.data.works, columns: ['name', 'task', 'date', 'hours', 'status'] },
    ugc: { title: t('ugc'), subtitle: state.language === 'en' ? 'Review drafts before anything goes live.' : '所有视频公开发布前必须完成审核。', data: state.data.ugc, columns: ['name', 'topic', 'platform', 'date', 'status'] },
    posters: { title: t('posters'), subtitle: state.language === 'en' ? 'Track poster counts with photo proof.' : '记录张贴数量并附现场照片凭证。', data: state.data.posters, columns: ['name', 'location', 'count', 'date', 'status'] },
  }[view];
  const filtered = config.data.filter((item) => state.filter === 'All' || item.status === state.filter || (state.filter === 'Approved' && item.status === 'Officially Posted'));
  return `<div class="page-head"><div><p class="kicker">${t('thisWeek')} / 2026</p><h1>${config.title}</h1><p class="subhead">${config.subtitle}</p></div><div class="head-actions"><button class="button secondary" data-export>${t('export')} <span>↗</span></button><button class="button primary" data-add>${t('addRecord')} <span>＋</span></button></div></div>
    <div class="filter-bar"><div class="filter-title">${t('filters')}</div><div class="filter-pills">${['All', 'Approved', 'Pending Verification', 'Pending Review', 'Rejected'].map((item) => `<button class="filter-pill ${state.filter === item ? 'selected' : ''}" data-filter="${item}">${item === 'All' ? t('all') : item.includes('Pending') ? t('pendingStatus') : item === 'Approved' ? t('approvedOnly') : t('rejected')}</button>`).join('')}</div></div>
    <section class="panel table-panel"><div class="table-wrap"><table><thead><tr>${config.columns.map((column) => `<th>${tableHeading(column)}</th>`).join('')}</tr></thead><tbody>${filtered.length ? filtered.map((item) => tableRow(item, view)).join('') : `<tr><td colspan="${config.columns.length}">${emptyState()}</td></tr>`}</tbody></table></div></section>`;
}

function tableHeading(column) {
  return { name: t('name'), task: t('task'), topic: state.language === 'en' ? 'Video topic' : '视频主题', platform: t('platform'), location: t('location'), count: t('count'), date: t('date'), hours: t('hours'), amount: t('amount'), role: state.language === 'en' ? 'Role' : '角色', status: t('status') }[column];
}

function tableRow(item, view) {
  const detail = view === 'work' ? item.task : view === 'ugc' ? item.topic : item.location;
  return `<tr><td><div class="cell-person"><span class="avatar tiny">${item.name[0]}</span><strong>${item.name}</strong></div></td><td>${detail}</td>${view === 'ugc' ? `<td>${item.platform}</td>` : view === 'posters' ? `<td>${item.count}</td>` : ''}<td>${dateLabel(item.date)}</td>${view === 'work' ? `<td>${item.hours}h</td>` : ''}<td><span class="${statusClass(item.status)}">${localizedStatus(item.status)}</span></td></tr>`;
}

function emptyState() { return `<div class="empty-state"><span>✦</span><p>${t('noRecords')}</p></div>`; }

function openModal() {
  document.querySelector('#modal-root').innerHTML = `<div class="modal-backdrop" data-close-modal><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><div><p class="kicker">${t('thisWeek')}</p><h2 id="modal-title">${t('addRecord')}</h2></div><button class="icon-button" data-close-modal>×</button></div><form id="record-form"><label>${t('type')}<select name="type" id="record-type" required><option value="">${t('selectType')}</option><option value="work">${t('weeklyWork')}</option><option value="ugc">${t('ugcVideo')}</option><option value="posters">${t('posterRecord')}</option><option value="referral">${t('referral')}</option></select></label><div id="dynamic-fields"></div><button class="button primary full" type="submit">${t('save')} <span>→</span></button></form></section></div>`;
  document.querySelector('[name="type"]').addEventListener('change', renderDynamicFields);
  document.querySelector('#record-form').addEventListener('submit', saveRecord);
  document.querySelectorAll('[data-close-modal]').forEach((element) => element.addEventListener('click', (event) => { if (event.target === element || element.closest('button')) closeModal(); }));
}

function renderDynamicFields() {
  const type = document.querySelector('#record-type').value;
  const root = document.querySelector('#dynamic-fields');
  if (!type) { root.innerHTML = ''; return; }
  root.innerHTML = `<label>${t('name')}<select name="name" required>${ambassadors.map((person) => `<option>${person.name}</option>`).join('')}</select></label><div class="form-grid">${type === 'work' ? `<label>${t('task')}<select name="task"><option>Ground Promotion</option><option>Community Operations</option><option>Internal Coordination</option><option>Other Execution</option></select></label><label>${t('hours')}<input name="hours" type="number" min="0" step="0.25" value="1" required /></label><label class="span-2">${t('description')}<input name="description" required /></label><label class="span-2">${t('link')}<input name="link" type="url" placeholder="https://..." /></label><label>${t('verification')}<select name="status"><option>Pending Verification</option><option>Approved</option><option>Rejected</option></select></label>` : type === 'ugc' ? `<label>${t('platform')}<select name="platform"><option>TikTok</option><option>Instagram Reels</option></select></label><label>${t('hours')}<input name="hours" type="number" min="0" step="0.25" value="1.5" required /></label><label class="span-2">${state.language === 'en' ? 'Video topic' : '视频主题'}<input name="topic" required /></label><label class="span-2">${t('link')}<input name="link" type="url" placeholder="https://..." /></label><label class="span-2">${t('reviewStatus')}<select name="status"><option>Pending Review</option><option>Approved</option><option>Rejected</option><option>Officially Posted</option></select></label>` : type === 'posters' ? `<label>${t('location')}<input name="location" required /></label><label>${t('count')}<input name="count" type="number" min="1" step="1" value="2" required /></label><label class="span-2">${t('link')}<input name="link" type="url" placeholder="https://..." /></label><label class="span-2">${t('verification')}<select name="status"><option>Pending Verification</option><option>Approved</option><option>Rejected</option></select></label>` : `<label>${t('referralCount')}<input name="count" type="number" min="1" step="1" value="1" required /></label><label>${t('verification')}<select name="status"><option>Approved</option><option>Pending Verification</option><option>Rejected</option></select></label>`}</div><input type="hidden" name="date" value="2026-10-10" />`;
}

function saveRecord(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target).entries());
  const item = { id: Date.now(), ...data };
  if (data.type === 'work') state.data.works.push({ ...item, hours: Number(data.hours) });
  if (data.type === 'ugc') state.data.ugc.push({ ...item, hours: Number(data.hours) });
  if (data.type === 'posters') state.data.posters.push({ ...item, count: Number(data.count) });
  if (data.type === 'referral') state.data.referrals.push({ ...item, count: Number(data.count) });
  persist(); closeModal(); render(); showToast(t('saved'));
}

function closeModal() { document.querySelector('#modal-root').innerHTML = ''; }
function showToast(message) { const toast = document.querySelector('#toast'); if (!toast) return; toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2200); }

function exportReport() {
  const rows = [
    ...state.data.works.map((item) => `${item.name},Weekly Work,${item.task},${item.date},${item.status}`),
    ...state.data.ugc.map((item) => `${item.name},UGC Video,${item.topic},${item.date},${item.status}`),
    ...state.data.posters.map((item) => `${item.name},Poster Posting,${item.location},${item.date},${item.status}`),
  ];
  const csv = ['Name,Record Type,Description,Date,Status', ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'nyu-ambassador-work-report.csv'; link.click(); URL.revokeObjectURL(url); showToast(state.language === 'en' ? 'Report exported' : '报告已导出');
}

function bindShellEvents() {
  document.querySelectorAll('[data-view]').forEach((element) => element.addEventListener('click', () => { state.activeView = element.dataset.view; state.filter = 'All'; render(); }));
  document.querySelectorAll('[data-language]').forEach((element) => element.addEventListener('click', () => { state.language = element.dataset.language; persist(); render(); }));
  document.querySelectorAll('[data-add]').forEach((element) => element.addEventListener('click', openModal));
  document.querySelectorAll('[data-export]').forEach((element) => element.addEventListener('click', exportReport));
  document.querySelectorAll('[data-filter]').forEach((element) => element.addEventListener('click', () => { state.filter = element.dataset.filter; render(); }));
}

function render() { renderShell(state.activeView === 'overview' ? overviewView() : tableView(state.activeView)); }

render();
