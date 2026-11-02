/**
 * 任务名称
 * name: WorkBuddy 签到
 * 定时规则
 * cron: 0 10,17 * * *
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');

const BILLING_BASE = 'https://www.codebuddy.cn';
const TRAVEL_BASE = 'https://www.workbuddy.cn';
const CHAT_BASE = 'https://copilot.tencent.com';
const USER_AGENT = 'CLI/2.63.2 CodeBuddy/2.63.2';
const TIMEOUT_MS = 30000;

const EXIT_OK = 0;
const EXIT_FAILED = 1;
const EXIT_CONFIG = 2;

// ---------------------------------------------------------------------------
// 参数
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const opts = { command: 'run', dryRun: false, json: false, only: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--only') {
      const v = argv[++i];
      if (v !== 'checkin' && v !== 'travel') throw new Error('--only 只接受 checkin 或 travel');
      opts.only = v;
    } else if (a === 'run' || a === 'status') opts.command = a;
    else if (a === '--help' || a === '-h') opts.command = 'help';
    else throw new Error('未知参数：' + a);
  }
  return opts;
}

// ---------------------------------------------------------------------------
// 日志：青龙直接抓 stdout，所以只往控制台写，不落文件
// ---------------------------------------------------------------------------
function makeLog() {
  const ts = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return (
      d.getFullYear() +
      '-' +
      p(d.getMonth() + 1) +
      '-' +
      p(d.getDate()) +
      ' ' +
      p(d.getHours()) +
      ':' +
      p(d.getMinutes()) +
      ':' +
      p(d.getSeconds())
    );
  };
  const emit = (tag, msg) => console.log('[' + ts() + '] ' + tag + ' ' + msg);
  return {
    info: (m) => emit('INFO', m),
    ok: (m) => emit('OK', m),
    warn: (m) => emit('WARN', m),
    error: (m) => emit('ERROR', m),
  };
}

// ---------------------------------------------------------------------------
// 失败通知
//
// 用青龙面板的 QLAPI.systemNotify（走你在面板里配好的推送渠道）。两个必须注意的点：
//
//   1. QLAPI 是青龙注入的全局，本机直接跑时不存在 —— 用 `typeof QLAPI` 判断是安全的，
//      未声明变量用 typeof 不会抛 ReferenceError；没有就降级成只打日志。
//   2. systemNotify 是异步的。脚本结尾会 process.exit()，不等它就把进程杀掉，通知会丢。
//      所以通知必须 await 完再退出。
//
// 通知只在 `run` 真跑时发，且一轮只发一条汇总 —— 失败按账号聚合，不逐条刷屏。
// 想关掉就设 WB_NOTIFY=off。
// ---------------------------------------------------------------------------
const ISSUES = { failures: [], actions: [] };

function notifyEnabled() {
  const v = String(process.env.WB_NOTIFY || '')
    .trim()
    .toLowerCase();
  return v !== 'off' && v !== 'false' && v !== '0' && v !== 'no';
}

function collectFailure(text) {
  ISSUES.failures.push(text);
}

function collectAction(text) {
  ISSUES.actions.push(text);
}

var hasNotifier = function () {
  try {
    return typeof QLAPI !== 'undefined' && QLAPI !== null && typeof QLAPI.systemNotify === 'function';
  } catch (e) {
    return false;
  }
};

function systemNotify(title, content) {
  return new Promise((resolve) => {
    if (!hasNotifier()) {
      console.log('[NOTIFY] 未检测到 QLAPI（本机运行），跳过推送。内容：' + title + ' | ' + content);
      resolve(false);
      return;
    }
    var pending;
    try {
      pending = QLAPI.systemNotify({ title: title, content: content });
    } catch (e) {
      console.log('[NOTIFY] 推送异常：' + (e && e.message ? e.message : e));
      resolve(false);
      return;
    }
    Promise.resolve(pending).then(
      () => {
        console.log('[NOTIFY] 已推送：' + title);
        resolve(true);
      },
      (e) => {
        console.log('[NOTIFY] 推送失败：' + (e && e.message ? e.message : e));
        resolve(false);
      }
    );
  });
}

// 本轮结束时按需发一条汇总
function flushNotify(finalCode, log) {
  if (!notifyEnabled()) {
    if (ISSUES.failures.length || ISSUES.actions.length) log.info('WB_NOTIFY=off，本次不推送通知');
    return Promise.resolve(false);
  }
  if (ISSUES.failures.length === 0 && ISSUES.actions.length === 0) return Promise.resolve(false);

  var title;
  var lines = [];
  if (ISSUES.failures.length > 0) {
    title = 'WorkBuddy 签到失败（' + ISSUES.failures.length + ' 项）';
    lines.push('失败：');
    ISSUES.failures.forEach((t) => lines.push('- ' + t));
  } else {
    title = 'WorkBuddy 签到需要你处理';
  }
  if (ISSUES.actions.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('需要处理：');
    ISSUES.actions.forEach((t) => lines.push('- ' + t));
  }
  lines.push('');
  lines.push('时间：' + new Date().toLocaleString('zh-CN', { hour12: false }));
  lines.push('退出码：' + finalCode);
  return systemNotify(title, lines.join('\n'));
}

// ---------------------------------------------------------------------------
// HTTP：用 https 模块而不是 fetch，兼容老 Node
// ---------------------------------------------------------------------------
function requestJson(url, options) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      reject(new Error('非法 URL: ' + url));
      return;
    }
    const body = options.body === undefined ? null : Buffer.from(options.body, 'utf8');
    const headers = Object.assign({}, options.headers);
    if (body) headers['Content-Length'] = Buffer.byteLength(body);

    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: options.method || 'GET',
        headers: headers,
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode, text: text });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error('请求超时（' + TIMEOUT_MS + 'ms):' + url));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// 凭据
// ---------------------------------------------------------------------------
function regionOfDomain(domain) {
  const d = String(domain || '')
    .trim()
    .toLowerCase();
  if (d === 'workbuddy.ai' || /\.workbuddy\.ai$/.test(d)) return 'global';
  if (d === 'codebuddy.ai' || /\.codebuddy\.ai$/.test(d)) return 'global';
  return 'cn';
}

function normalizeAccount(raw, index) {
  const name = raw.name || raw.nickname || '账号' + (index + 1);
  if (!raw.accessToken) throw new Error(name + '：缺少 accessToken');
  return {
    name: name,
    accessToken: raw.accessToken,
    refreshToken: raw.refreshToken || '',
    uid: raw.uid || '',
    domain: raw.domain || 'www.workbuddy.cn',
    expiresAt: typeof raw.expiresAt === 'number' ? raw.expiresAt : 0,
    region: regionOfDomain(raw.domain || 'www.workbuddy.cn'),
    source: raw.source || 'env',
  };
}

function accountsFromEnv() {
  const multi = process.env.WB_ACCOUNTS_JSON;
  if (multi && multi.trim() !== '') {
    let arr;
    try {
      arr = JSON.parse(multi);
    } catch (e) {
      throw new Error('WB_ACCOUNTS_JSON 不是合法 JSON：' + e.message);
    }
    if (!Array.isArray(arr) || arr.length === 0) throw new Error('WB_ACCOUNTS_JSON 需要非空数组');
    return arr.map(normalizeAccount);
  }
  const token = process.env.WB_ACCESS_TOKEN;
  if (token && token.trim() !== '') {
    return [
      normalizeAccount(
        {
          name: process.env.WB_NAME || undefined,
          accessToken: token.trim(),
          refreshToken: (process.env.WB_REFRESH_TOKEN || '').trim(),
          uid: (process.env.WB_UID || '').trim(),
          domain: (process.env.WB_DOMAIN || '').trim() || 'www.workbuddy.cn',
          source: 'env',
        },
        0
      ),
    ];
  }
  return null;
}

function accountsFromVault() {
  const home = process.env.DSH_HOME || path.join(process.env.USERPROFILE || process.env.HOME || os.homedir(), '.dsh');
  const root = path.join(home, 'workbuddy-vault');
  const out = [];
  let regions;
  try {
    regions = fs.readdirSync(root);
  } catch (e) {
    return out;
  }
  regions.forEach((region) => {
    const dir = path.join(root, region);
    let files;
    try {
      files = fs.readdirSync(dir).filter((n) => /\.json$/.test(n));
    } catch (e) {
      return;
    }
    files.forEach((f) => {
      const fp = path.join(dir, f);
      try {
        const doc = JSON.parse(fs.readFileSync(fp, 'utf8'));
        const auth = doc.auth || {};
        if (typeof auth.accessToken !== 'string' || auth.accessToken === '') return;
        const acc = doc.account || {};
        out.push(
          normalizeAccount(
            {
              name: acc.nickname || doc.accountId,
              accessToken: auth.accessToken,
              refreshToken: auth.refreshToken || '',
              uid: acc.uid || '',
              domain: auth.domain || 'www.workbuddy.cn',
              expiresAt: typeof auth.expiresAt === 'number' ? auth.expiresAt : 0,
              source: 'vault:' + fp,
            },
            out.length
          )
        );
      } catch (err) {
        /* 单个文件坏了不影响其他账号 */
      }
    });
  });
  return out;
}

function loadAccounts() {
  const fromEnv = accountsFromEnv();
  if (fromEnv) return { accounts: fromEnv, origin: 'env' };
  const fromVault = accountsFromVault();
  if (fromVault.length > 0) return { accounts: fromVault, origin: 'vault' };
  return { accounts: [], origin: null };
}

// ---------------------------------------------------------------------------
// 上游调用：统一解析 {code, msg, data}，并区分「凭据问题」与「业务拒绝」
// ---------------------------------------------------------------------------
function identityHeaders(acc) {
  const h = {
    'Authorization': 'Bearer ' + acc.accessToken,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
  };
  if (acc.uid) h['X-User-Id'] = acc.uid;
  if (acc.domain) h['X-Domain'] = acc.domain;
  return h;
}

// 网关对「凭据不行」和「业务拒绝」都可能回 403，靠措辞区分
const AUTH_HINTS = ['authorization', 'unauthorized', 'forbidden', 'token', 'login', 'sign in', 'credential', 'expired'];
function looksLikeAuth(msg) {
  const s = String(msg || '').toLowerCase();
  return AUTH_HINTS.some((k) => s.indexOf(k) !== -1);
}

function callApi(acc, url, method, body) {
  return requestJson(url, {
    method: method,
    body: body === undefined ? undefined : body,
    headers: identityHeaders(acc),
  }).then((res) => {
    let payload = null;
    try {
      payload = JSON.parse(res.text);
    } catch (e) {
      if (res.status === 401 || res.status === 403) {
        const err = new Error('凭据被网关拒绝（HTTP ' + res.status + '）');
        err.kind = 'auth';
        throw err;
      }
      throw new Error('上游返回非 JSON（HTTP ' + res.status + '）：' + res.text.slice(0, 160));
    }
    const code = typeof payload.code === 'number' ? payload.code : 0;
    const msg = typeof payload.msg === 'string' ? payload.msg : '';
    if (res.status === 401) {
      const err = new Error(msg || 'HTTP 401');
      err.kind = 'auth';
      throw err;
    }
    if (res.status === 403 && (code === 0 || looksLikeAuth(msg))) {
      const err = new Error(msg || 'HTTP 403');
      err.kind = 'auth';
      throw err;
    }
    if (res.status < 200 || res.status >= 300 || code !== 0) {
      const err = new Error(msg || 'HTTP ' + res.status);
      err.kind = 'business';
      err.code = code;
      err.status = res.status;
      throw err;
    }
    return payload.data;
  });
}

// ---------------------------------------------------------------------------
// 具体接口
// ---------------------------------------------------------------------------
function fetchCheckinStatus(acc) {
  return callApi(acc, BILLING_BASE + '/v2/billing/meter/checkin-activity-status', 'POST', '{}').then((d) => {
    const x = d && typeof d === 'object' ? d : {};
    const num = (k) => (typeof x[k] === 'number' ? x[k] : 0);
    return {
      active: x.active === true,
      todayCheckedIn: x.today_checked_in === true,
      streakDays: num('streak_days'),
      dailyCredit: num('daily_credit'),
      todayCredit: num('today_credit'),
    };
  });
}

function claimCheckin(acc) {
  return callApi(acc, BILLING_BASE + '/v2/billing/meter/daily-checkin', 'POST', '{}').then((d) => {
    const x = d && typeof d === 'object' ? d : {};
    const num = (k) => (typeof x[k] === 'number' ? x[k] : 0);
    return { credit: num('credit'), streakDays: num('streak_days') };
  });
}

function fetchTravelStatus(acc) {
  return callApi(acc, TRAVEL_BASE + '/activity/growth/buddy/travel/status', 'GET').then((d) => {
    const x = d && typeof d === 'object' ? d : {};
    const num = (k) => (typeof x[k] === 'number' ? x[k] : 0);
    return {
      state: typeof x.state === 'string' && x.state !== '' ? x.state : null,
      dailyLimitReached: x.daily_limit_reached === true,
      recordId: num('record_id'),
      arriveAt: num('arrive_at'),
      serverNow: num('server_now'),
      rewardCredit: num('reward_credit'),
      locationName: x.location && typeof x.location === 'object' && typeof x.location.name === 'string' ? x.location.name : '',
    };
  });
}

function fetchTravelConfig(acc) {
  return callApi(acc, TRAVEL_BASE + '/activity/growth/buddy/travel/config', 'GET').then((d) => {
    const list = d && Array.isArray(d.locations) ? d.locations : [];
    return list
      .filter((l) => l && typeof l.id === 'number')
      .map((l) => ({
        id: l.id,
        name: typeof l.name === 'string' ? l.name : '#' + l.id,
        sort: typeof l.sort === 'number' ? l.sort : l.id,
        rewardCreditMax: typeof l.reward_credit_max === 'number' ? l.reward_credit_max : 0,
      }))
      .sort((a, b) => b.rewardCreditMax - a.rewardCreditMax || a.sort - b.sort || a.id - b.id);
  });
}

function fetchBuddy(acc) {
  return callApi(acc, TRAVEL_BASE + '/activity/growth/buddy/info', 'GET').then((d) => {
    const b = d && d.buddy;
    if (!b || typeof b !== 'object') return null;
    return { name: typeof b.name === 'string' ? b.name : '' };
  });
}

function departTravel(acc, locationId) {
  return callApi(acc, TRAVEL_BASE + '/activity/growth/buddy/travel/depart', 'POST', JSON.stringify({ location_id: locationId })).then(
    (d) => {
      const x = d && typeof d === 'object' ? d : {};
      return { recordId: typeof x.record_id === 'number' ? x.record_id : 0, arriveAt: typeof x.arrive_at === 'number' ? x.arrive_at : 0 };
    }
  );
}

// 官方 Web 客户端就是空 body：服务端自己找那一条未领取的行程
function claimTravel(acc) {
  return callApi(acc, TRAVEL_BASE + '/activity/growth/buddy/travel/claim', 'POST', '{}').then((d) => {
    const x = d && typeof d === 'object' ? d : {};
    return { rewardCredit: typeof x.reward_credit === 'number' ? x.reward_credit : 0 };
  });
}

function refreshToken(acc) {
  return requestJson(CHAT_BASE + '/v2/plugin/auth/token/refresh', {
    method: 'POST',
    headers: {
      'X-Refresh-Token': acc.refreshToken,
      'X-Auth-Refresh-Source': 'workbuddy',
      'Accept': 'application/json',
      'Referer': BILLING_BASE + '/',
      'Origin': BILLING_BASE,
      'User-Agent': USER_AGENT,
    },
  }).then((res) => {
    let p;
    try {
      p = JSON.parse(res.text);
    } catch (e) {
      throw new Error('token 刷新返回非 JSON（HTTP ' + res.status + '）');
    }
    if (res.status < 200 || res.status >= 300 || p.code !== 0) {
      throw new Error('token 刷新被拒（HTTP ' + res.status + '）：' + String(p.msg || '').slice(0, 120));
    }
    const d = p.data || {};
    if (typeof d.accessToken !== 'string' || d.accessToken === '') throw new Error('token 刷新没返回 accessToken');
    return d;
  });
}

// ---------------------------------------------------------------------------
// 凭据被拒时刷新一次，并把新 token 打出来（青龙是环境变量，得人工回填）
// ---------------------------------------------------------------------------
function withCredential(acc, operation, log) {
  return operation().catch((err) => {
    if (!err || err.kind !== 'auth') throw err;
    if (!acc.refreshToken) throw new Error('凭据失效且没有 refreshToken —— 请重新登录取新 token：' + err.message);
    log.info(acc.name + '：凭据被拒，尝试刷新一次');
    return refreshToken(acc).then((d) => {
      acc.accessToken = d.accessToken;
      const rotatedRefresh = typeof d.refreshToken === 'string' && d.refreshToken !== '';
      if (rotatedRefresh) acc.refreshToken = d.refreshToken;
      // 刷新会轮换 token：旧 refresh token 立刻作废，不更新环境变量下次就会登不上
      log.warn(acc.name + '：token 已刷新，请把下面两行更新到青龙环境变量（旧的已失效）');
      console.log('  WB_ACCESS_TOKEN=' + d.accessToken);
      if (rotatedRefresh) console.log('  WB_REFRESH_TOKEN=' + d.refreshToken);
      // 脚本改不了青龙的环境变量，这是一件必须人工做的事，随汇总通知一起推出去
      collectAction(
        acc.name + '：token 已自动刷新，但旧 refresh token 已失效，' + '请把日志里的 WB_ACCESS_TOKEN / WB_REFRESH_TOKEN 更新到青龙环境变量'
      );
      return operation();
    });
  });
}

// ---------------------------------------------------------------------------
// 两个动作
// ---------------------------------------------------------------------------
const ALREADY_CHECKED_IN = ['今天已签到', '已签到', 'already'];

function isEnterprise(acc) {
  return !!acc.enterpriseId;
}

function doCheckin(acc, opts, log) {
  const base = { account: acc.name };
  if (isEnterprise(acc)) {
    return Promise.resolve(Object.assign(base, { status: 'skipped', message: '企业席位没有个人签到' }));
  }
  return withCredential(acc, () => fetchCheckinStatus(acc), log)
    .then((st) => {
      if (!st.active) return Object.assign(base, { status: 'inactive', message: '签到活动未开启' });
      if (st.todayCheckedIn) return Object.assign(base, { status: 'already', streakDays: st.streakDays, credit: st.todayCredit });
      if (opts.dryRun) return Object.assign(base, { status: 'would-claim', credit: st.dailyCredit, streakDays: st.streakDays });
      return claimCheckin(acc)
        .then((c) =>
          Object.assign(base, { status: 'claimed', credit: c.credit || st.dailyCredit, streakDays: c.streakDays || st.streakDays })
        )
        .catch((err) => {
          // 并发时另一端先领了：这是成功，不是失败
          const m = String(err.message || '');
          if (ALREADY_CHECKED_IN.some((k) => m.indexOf(k) !== -1)) {
            return Object.assign(base, { status: 'already', streakDays: st.streakDays });
          }
          throw err;
        });
    })
    .catch((err) => Object.assign(base, { status: 'failed', message: err.message }));
}

function doTravel(acc, opts, log) {
  const base = { account: acc.name };
  const steps = [];
  let credit = 0;

  return withCredential(acc, () => fetchTravelStatus(acc), log)
    .then((before) => {
      if (before.state === null) {
        throw new Error('旅行状态没有 state 字段，拒绝猜测（缺字段不等于 idle）');
      }
      // ---- 第一步：有已到达的行程就先领 ----
      const claimPhase =
        before.state === 'arrived'
          ? opts.dryRun
            ? Promise.resolve(
                steps.push({ step: 'claim', status: 'would-claim', credit: before.rewardCredit, location: before.locationName })
              )
            : claimTravel(acc)
                .then((c) => {
                  credit = c.rewardCredit || before.rewardCredit;
                  steps.push({ step: 'claim', status: 'claimed', credit: credit, location: before.locationName });
                })
                .catch((err) => {
                  const m = String(err.message || '');
                  if (m.indexOf('no unclaimed travel') !== -1) steps.push({ step: 'claim', status: 'already', credit: 0 });
                  else throw err;
                })
          : Promise.resolve();

      return claimPhase.then(() => {
        // ---- 第二步：配额没花、也没人在路上，才派 ----
        const needRefresh = steps.length > 0 && !opts.dryRun;
        return (needRefresh ? fetchTravelStatus(acc) : Promise.resolve(before)).then((now) => {
          if (now.state === 'arrived') {
            steps.push({ step: 'depart', status: 'skipped', reason: '还有一趟没领，先不派' });
            return;
          }
          if (now.state === 'traveling') {
            const left = now.arriveAt > 0 && now.serverNow > 0 ? Math.max(0, now.arriveAt - now.serverNow) : 0;
            steps.push({ step: 'depart', status: 'skipped', reason: 'already traveling', remainingSec: left });
            return;
          }
          if (now.dailyLimitReached) {
            steps.push({ step: 'depart', status: 'skipped', reason: 'daily limit reached' });
            return;
          }
          if (now.state !== 'idle') {
            steps.push({ step: 'depart', status: 'skipped', reason: '未知状态 ' + now.state });
            return;
          }
          return fetchBuddy(acc).then((buddy) => {
            if (!buddy) {
              steps.push({ step: 'depart', status: 'skipped', reason: 'no-buddy（还没领养喵喵）' });
              return;
            }
            return fetchTravelConfig(acc).then((locs) => {
              if (locs.length === 0) {
                steps.push({ step: 'depart', status: 'skipped', reason: 'config 没有可用地点' });
                return;
              }
              const target = locs[0]; // 已按收益上限降序排好
              if (opts.dryRun) {
                steps.push({ step: 'depart', status: 'would-depart', location: target.name, locationId: target.id });
                return;
              }
              return departTravel(acc, target.id).then((r) => {
                steps.push({ step: 'depart', status: 'departed', location: target.name, locationId: target.id, arriveAt: r.arriveAt });
              });
            });
          });
        });
      });
    })
    .then(() => {
      const settled = steps.some((s) => s.step === 'claim' && (s.status === 'claimed' || s.status === 'already'));
      const departed = steps.some((s) => s.step === 'depart' && s.status === 'departed');
      const traveling = steps.some((s) => s.step === 'depart' && s.reason === 'already traveling');
      const noBuddy = steps.some((s) => s.step === 'depart' && String(s.reason || '').indexOf('no-buddy') === 0);
      let status;
      if (settled && departed) status = 'claimed+departed';
      else if (settled) status = 'claimed';
      else if (departed) status = 'departed';
      else if (traveling) status = 'traveling';
      else if (noBuddy) status = 'no-buddy';
      else status = 'idle-limit';
      return Object.assign(base, { status: status, credit: credit, steps: steps });
    })
    .catch((err) => Object.assign(base, { status: 'failed', message: err.message, steps: steps }));
}

// ---------------------------------------------------------------------------
// 输出
// ---------------------------------------------------------------------------
function fmtTime(epochSec) {
  if (!epochSec) return '';
  const d = new Date(epochSec * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function describeCheckin(row) {
  if (row.status === 'claimed') return '签到成功 +' + (row.credit || 0) + '（连续 ' + (row.streakDays || 0) + ' 天）';
  if (row.status === 'already') return '今日已签到（连续 ' + (row.streakDays || 0) + ' 天），跳过';
  if (row.status === 'would-claim') return '[演练] 今天还没签到，可领 +' + (row.credit || 0);
  if (row.status === 'inactive') return '签到活动未开启';
  if (row.status === 'skipped') return '跳过：' + row.message;
  return '失败：' + row.message;
}

function describeTravel(row) {
  const claim = (row.steps || []).filter((s) => s.step === 'claim')[0];
  const depart = (row.steps || []).filter((s) => s.step === 'depart')[0];
  const parts = [];
  if (claim) {
    if (claim.status === 'claimed') parts.push('领取 +' + claim.credit + (claim.location ? '（' + claim.location + '）' : ''));
    else if (claim.status === 'would-claim')
      parts.push('[演练] 可领取 +' + claim.credit + (claim.location ? '（' + claim.location + '）' : ''));
    else if (claim.status === 'already') parts.push('奖励已被领过');
  }
  if (depart) {
    if (depart.status === 'departed')
      parts.push('已派出（' + depart.location + (depart.arriveAt ? '，预计 ' + fmtTime(depart.arriveAt) + ' 归来' : '') + '）');
    else if (depart.status === 'would-depart') parts.push('[演练] 可派出（' + depart.location + '）');
    else if (depart.reason === 'already traveling')
      parts.push('喵喵还在路上' + (depart.remainingSec > 0 ? '（约 ' + Math.ceil(depart.remainingSec / 60) + ' 分钟）' : ''));
    else parts.push('未派出：' + depart.reason);
  }
  if (row.status === 'failed') parts.push('失败：' + row.message);
  if (parts.length === 0) parts.push('无操作');
  return parts.join('；');
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
function main() {
  const log = makeLog();
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    log.error(e.message);
    log.info('用法：node workbuddy-daily.js [run|status] [--dry-run] [--json] [--only checkin|travel]');
    return EXIT_CONFIG;
  }
  if (opts.command === 'help') {
    log.info('用法：node workbuddy-daily.js [run|status] [--dry-run] [--json] [--only checkin|travel]');
    log.info('凭据：WB_ACCESS_TOKEN（+ WB_REFRESH_TOKEN 更稳），或 WB_ACCOUNTS_JSON 多账号，或本机 vault');
    return EXIT_OK;
  }

  // 凭据加载失败是「配置问题」，不是崩溃：给出可读的一行，别把堆栈倒进青龙日志
  let loaded;
  try {
    loaded = loadAccounts();
  } catch (e) {
    log.info('WB_ACCOUNTS_JSON 应该是数组，例如：[{"name":"号 1","accessToken":"...","refreshToken":"..."}]');
    return configFailure('凭据配置有误：' + e.message, log);
  }
  if (loaded.accounts.length === 0) {
    return configFailure('没有找到任何凭据。青龙里请设置环境变量 WB_ACCESS_TOKEN（可选 WB_REFRESH_TOKEN / WB_UID / WB_DOMAIN）。', log);
  }
  log.info('凭据来源：' + (loaded.origin === 'env' ? '环境变量' : '本机 vault') + '，共 ' + loaded.accounts.length + ' 个账号');

  // 国际版没有签到也没有成长中心
  const eligible = loaded.accounts.filter((a) => a.region === 'cn');
  loaded.accounts
    .filter((a) => a.region !== 'cn')
    .forEach((a) => {
      log.warn(a.name + '：国际版没有签到/喵喵旅行，跳过');
    });
  if (eligible.length === 0) {
    return configFailure('没有国内区账号可操作（签到与喵喵旅行只在 cn 区）。', log);
  }

  if (opts.command === 'status') {
    return runStatus(eligible, opts, log);
  }
  return runRun(eligible, opts, log);
}

/**
 * 配置类问题的统一出口：打日志 + 推送通知 + 返回 exit 2。
 * 这类失败（环境变量没配、token 全过期）青龙只会标红，人不会主动去看，
 * 所以更需要推一条出来。
 */
function configFailure(message, log) {
  log.error(message);
  if (!notifyEnabled()) {
    log.info('WB_NOTIFY=off，本次不推送通知');
    return Promise.resolve(EXIT_CONFIG);
  }
  return systemNotify('WorkBuddy 签到需要处理配置', message + '\n\n时间：' + new Date().toLocaleString('zh-CN', { hour12: false })).then(
    () => EXIT_CONFIG
  );
}

function runStatus(eligible, opts, log) {
  let failed = false;
  const rows = [];
  let pending = eligible.length;
  return new Promise((resolve) => {
    eligible.forEach((acc) => {
      const row = { account: acc.name };
      fetchCheckinStatus(acc)
        .then((c) => {
          row.checkin = c;
        })
        .catch((e) => {
          row.checkinError = e.message;
          failed = true;
        })
        .then(() =>
          fetchTravelStatus(acc)
            .then((t) => {
              row.travel = t;
            })
            .catch((e) => {
              row.travelError = e.message;
              failed = true;
            })
        )
        .then(() => {
          rows.push(row);
          pending -= 1;
          if (pending > 0) return;
          if (opts.json) {
            console.log(JSON.stringify({ command: 'status', accounts: rows }, null, 2));
          } else {
            rows.forEach((r) => {
              if (r.checkin) {
                log.info(
                  r.account +
                    '：' +
                    (r.checkin.todayCheckedIn ? '今日已签到' : '今日未签到') +
                    '（连续 ' +
                    r.checkin.streakDays +
                    ' 天，每日 +' +
                    r.checkin.dailyCredit +
                    '）'
                );
              } else {
                log.error(r.account + '：签到状态读不到 —— ' + r.checkinError);
              }
              if (r.travel) {
                const t = r.travel;
                let line = '  喵喵：state=' + t.state;
                if (t.locationName) line += ' @' + t.locationName;
                if (t.state === 'traveling' && t.arriveAt) line += '，预计 ' + fmtTime(t.arriveAt) + ' 归来';
                if (t.state === 'arrived') line += '，待领取 +' + t.rewardCredit;
                line += t.dailyLimitReached ? '，今日配额已用' : '，今日可派';
                log.info(line);
              } else if (r.travelError) {
                log.info('  喵喵：读不到 —— ' + r.travelError);
              }
            });
          }
          resolve(failed ? EXIT_FAILED : EXIT_OK);
        });
    });
  });
}

function runRun(eligible, opts, log) {
  log.info((opts.dryRun ? '演练（不发任何写请求）' : '开始') + '：共 ' + eligible.length + ' 个国内账号');
  const results = [];
  let totalCredit = 0;
  let failed = false;

  const chain = eligible.reduce((p, acc) => {
    return p.then(() => {
      const entry = { account: acc.name };
      const task =
        opts.only === 'travel'
          ? Promise.resolve()
          : doCheckin(acc, opts, log).then((row) => {
              entry.checkin = row;
              const text = describeCheckin(row);
              if (row.status === 'failed') {
                failed = true;
                log.error(acc.name + ' 签到 ' + text);
                collectFailure(acc.name + ' 签到' + text);
              } else if (row.status === 'claimed') {
                totalCredit += row.credit || 0;
                log.ok(acc.name + ' 签到 ' + text);
              } else {
                log.info(acc.name + ' 签到 ' + text);
              }
            });
      return task
        .then(() => {
          if (opts.only === 'checkin') return;
          return doTravel(acc, opts, log).then((row) => {
            entry.travel = row;
            const text = describeTravel(row);
            if (row.status === 'failed') {
              failed = true;
              log.error(acc.name + ' 喵喵 ' + text);
              collectFailure(acc.name + ' 喵喵' + text);
            } else if (row.credit > 0) {
              totalCredit += row.credit;
              log.ok(acc.name + ' 喵喵 ' + text);
            } else {
              log.info(acc.name + ' 喵喵 ' + text);
            }
          });
        })
        .then(() => {
          results.push(entry);
        });
    });
  }, Promise.resolve());

  return chain.then(() => {
    if (opts.json) console.log(JSON.stringify({ command: 'run', dryRun: opts.dryRun, accounts: results }, null, 2));
    log.info('结束：' + (failed ? '有失败' : '全部完成') + (totalCredit > 0 ? '，本轮共 +' + totalCredit + ' 积分' : ''));
    const code = failed ? EXIT_FAILED : EXIT_OK;
    // 演练不推送：它本来就没有真实失败可言
    return opts.dryRun ? code : flushNotify(code, log).then(() => code);
  });
}

// 青龙里直接 process.exit 更干脆，避免句柄没关掉把任务挂住
let code = EXIT_FAILED;
try {
  code = main();
} catch (e) {
  console.log('[FATAL] ' + (e && e.stack ? e.stack : e));
  code = EXIT_FAILED;
}
Promise.resolve(code).then(
  (c) => process.exit(c),
  (e) => {
    console.log('[FATAL] ' + (e && e.stack ? e.stack : e));
    process.exit(EXIT_FAILED);
  }
);
