/**
 * name: 天翼云云智 签到
 * cron:  15 8 * * *
 */
'use strict';

const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');

/* ============================== 配置区 ============================== */

const BASE_URL = 'https://eaichat.ctyun.cn';
// 前端源码里接口写成 /ai/portal/v1/...，但请求前会被 as() 改写为 /ai/portal/wenc/v1/...（登录态 sk 存在时），
// 实际路由只存在于 wenc 网关下（/ai/portal/v1/... 的营销接口返回 404），这里直接使用真实路径。
const API_TASK_LIST = '/ai/portal/wenc/v1/cp/mgr/api/openApi/marketing/api/userPoints/getTaskList';
const API_RECEIVE = '/ai/portal/wenc/v1/cp/mgr/api/openApi/marketing/api/userPoints/receivePointsV2';
const CHECKIN_TASK_ID = 3001; // 「每日签到」任务 ID（前端写死）
const APP_VERSION = '202060605'; // x-eai-version / YL-Main-Version
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT = 20000;

/* ============================== 工具函数 ============================== */

function log(...args) {
  console.log(`[${new Date().toLocaleString('zh-CN', { hour12: false })}]`, ...args);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function randomChars(len) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

function httpGet(urlStr, headers) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'GET',
        headers,
        timeout: REQUEST_TIMEOUT,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      }
    );
    req.on('timeout', () => req.destroy(new Error('请求超时')));
    req.on('error', reject);
    req.end();
  });
}

/* ============================== 签名逻辑（复刻前端） ============================== */

/**
 * 前端签名（chunk-common 8298 模块 F 函数）：
 *   sign = SHA256( sortedParams[&md5(data)] + "&" + sk + "&" + timestamp + "&" + random )
 * 无 sk 时不带签名头（web 端登录后 sk 缓存在 localStorage: skcache，AES-ECB 解密后的值才是 sk）。
 */
function buildSignHeaders(params, sk) {
  const paramStr = Object.entries(params || {})
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const timestamp = Date.now().toString();
  const random = randomChars(8);
  const raw = (paramStr ? paramStr + '&' : '') + sk + '&' + timestamp + '&' + random;
  return {
    'Web-Signature': crypto.createHash('sha256').update(raw).digest('hex'),
    'Web-Random': random,
    'Web-Timestamp': timestamp,
  };
}

/** sk = AES-ECB(base64解码(skcache), utf8(clientKey))，对应前端 handleSk -> Sr(sessionKey, clientKey) */
function deriveSk(skcache, clientKey) {
  const key = Buffer.from(clientKey, 'utf8');
  const algo = 'aes-' + key.length * 8 + '-ecb';
  const decipher = crypto.createDecipheriv(algo, key, null);
  decipher.setAutoPadding(true);
  return Buffer.concat([decipher.update(Buffer.from(skcache, 'base64')), decipher.final()]).toString('utf8');
}

/* ============================== 账号解析 ============================== */

function getCookieValue(cookieStr, name) {
  if (!cookieStr) return '';
  const m = cookieStr.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

function parseAccounts() {
  const raw = process.env.EAI_COOKIE || process.env.eaichatCookie || '';
  if (!raw.trim()) {
    log('未检测到环境变量 EAI_COOKIE，请先在青龙「环境变量」里添加。');
    process.exit(0);
  }
  const entries = raw
    .split(/\r?\n|&/)
    .map((s) => s.trim())
    .filter(Boolean);
  return entries.map((entry, idx) => {
    let acc = { label: `账号${idx + 1}`, cookie: '', jwt: '', sk: '', tenantId: '' };
    if (entry.startsWith('{')) {
      try {
        const j = JSON.parse(entry);
        acc.cookie = j.cookie || '';
        acc.jwt = j.jwt || '';
        acc.sk = j.sk || '';
        acc.tenantId = j.tenantId || '';
        if (!acc.sk && j.skcache && j.clientKey) {
          try {
            acc.sk = deriveSk(j.skcache, j.clientKey);
            log(`${acc.label}: 已由 skcache+clientKey 解出签名密钥 sk`);
          } catch (e) {
            log(`${acc.label}: sk 解密失败（${e.message}），本次以无签名方式请求`);
          }
        }
      } catch (e) {
        log(`${acc.label}: JSON 解析失败，按纯 Cookie 处理`);
        acc.cookie = entry;
      }
    } else {
      acc.cookie = entry;
    }
    acc.jwt = acc.jwt || getCookieValue(acc.cookie, 'YL-Authorization');
    acc.xuid = 'pubweb_' + uuid();
    return acc;
  });
}

/* ============================== 请求头（复刻网页端） ============================== */

function buildHeaders(acc, params) {
  const headers = {
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': USER_AGENT,
    'x-user-agent': USER_AGENT,
    'Referer': BASE_URL + '/chat/',
    'Origin': BASE_URL,
    'x-client-trace-id': uuid(),
    'x-eai-xuid': acc.xuid,
    'x-eai-env': 'pubWeb',
    'x-eai-version': APP_VERSION,
    'x-eai-source': 'web-eai',
    'x-eai-mode': 'eai',
    'YL-Main-Version': APP_VERSION,
    'YL-Product-Id': '5',
  };
  if (acc.tenantId) headers['x-eai-tenant-id'] = String(acc.tenantId);
  if (acc.cookie) headers.Cookie = acc.cookie;
  // 鉴权：YL-Authorization（网关识别 JWT）。优先级：显式 jwt > Cookie 里的 YL-Authorization > Cookie 里的 YL-Token
  const token = acc.jwt || getCookieValue(acc.cookie, 'YL-Authorization') || getCookieValue(acc.cookie, 'YL-Token');
  if (token) {
    const bearer = /^Bearer\s/i.test(token) ? token : 'Bearer ' + token;
    headers['YL-Authorization'] = bearer;
    headers.Authorization = bearer;
  }
  if (acc.sk) Object.assign(headers, buildSignHeaders(params, acc.sk));
  return headers;
}

/* ============================== 业务逻辑 ============================== */

/** 两层返回码解包：{ resultCode, data: { code, data, msg } } */
function unwrap(resp) {
  if (!resp || typeof resp !== 'object') return { ok: false, msg: '接口返回为空' };
  if (resp.resultCode !== 0) return { ok: false, msg: resp.resultMsg || resp.msg || '外层 resultCode=' + resp.resultCode };
  const inner = resp.data;
  if (!inner || typeof inner !== 'object') return { ok: false, msg: '接口 data 为空' };
  if (inner.code !== 0) return { ok: false, msg: inner.msg || '内层 code=' + inner.code };
  return { ok: true, data: inner.data };
}

/** 万 Token 显示（前端 dt: value / 1e4） */
function fmtReward(task) {
  try {
    const list = task && task.pointsList;
    const hit = Array.isArray(list) ? list.find((p) => p && p.type === 600) : null;
    if (hit && typeof hit.value === 'number') return hit.value / 1e4 + ' 万Token';
  } catch (e) {
    /* ignore */
  }
  return '';
}

async function callApi(acc, path, params) {
  const qs = Object.entries(params || {})
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
    .join('&');
  const url = BASE_URL + path + (qs ? '?' + qs : '');
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await httpGet(url, buildHeaders(acc, params));
      if (res.status === 401) {
        return {
          ok: false,
          authExpired: true,
          msg: 'HTTP 401 未授权（Cookie/JWT 已失效）' + (res.body ? '：' + res.body.slice(0, 60) : ''),
        };
      }
      if (res.status !== 200) {
        lastErr = new Error('HTTP ' + res.status);
        continue;
      }
      let body;
      try {
        body = JSON.parse(res.body);
      } catch (e) {
        lastErr = new Error('返回非 JSON：' + res.body.slice(0, 120));
        continue;
      }
      return Object.assign({ ok: true }, unwrap(body), { raw: body });
    } catch (e) {
      lastErr = e;
      log(`请求 ${path} 第 ${attempt} 次失败: ${e.message}`);
      await sleep(1000 * attempt);
    }
  }
  return { ok: false, msg: '请求失败: ' + (lastErr ? lastErr.message : '未知错误') };
}

/** 领取某个任务奖励（receivePointsV2，参数与前端一致） */
async function claimTask(acc, task) {
  const res = await callApi(acc, API_RECEIVE, {
    taskDefId: task.taskDefId,
    progress: task.currentProgress,
  });
  if (!res.ok) return res;
  return { ok: true, data: res.data, msg: (res.raw && res.raw.data && res.raw.data.msg) || '' };
}

async function runAccount(acc, index, total, claimTasks) {
  log(`==================== ${acc.label}（${index}/${total}）====================`);
  const lines = [];
  const summary = { label: acc.label, ok: true, detail: [] };

  // 1. 获取任务列表
  const list = await callApi(acc, API_TASK_LIST, { displayTypes: 5 });
  if (!list.ok) {
    if (list.authExpired) log(`${acc.label}: 登录已失效，请重新抓取 Cookie 更新环境变量`);
    else log(`${acc.label}: 获取任务列表失败 - ${list.msg}`);
    summary.ok = false;
    summary.detail.push('获取任务列表失败：' + list.msg);
    return summary;
  }
  const tasks = Array.isArray(list.data) ? list.data : [];
  const checkin = tasks.find((t) => t && t.taskDefId === CHECKIN_TASK_ID) || null;

  // 2. 每日签到（taskDefId=3001）
  if (!checkin) {
    log(`${acc.label}: 任务列表中未找到「每日签到」任务（可能活动已下线或账号不满足条件）`);
    summary.detail.push('未找到每日签到任务');
  } else if (checkin.status === 3) {
    log(`${acc.label}: 签到已失效（本期活动结束）`);
    summary.detail.push('签到已失效');
  } else if (checkin.status === 2) {
    log(`${acc.label}: 本期签到已完成`);
    summary.detail.push('本期签到已完成');
  } else if (checkin.canReceive === true) {
    const reward = fmtReward(checkin);
    const r = await claimTask(acc, checkin);
    if (r.ok) {
      log(`${acc.label}: 签到成功${reward ? '，获得 ' + reward : ''}${r.msg ? '（' + r.msg + '）' : ''}，奖励预计一分钟内到账`);
      summary.detail.push('签到成功' + (reward ? ' +' + reward : ''));
    } else {
      log(`${acc.label}: 签到失败 - ${r.msg}`);
      summary.ok = false;
      summary.detail.push('签到失败：' + r.msg);
    }
    await sleep(800 + Math.random() * 1200);
  } else {
    const why = checkin.isSatisfiedCondition === false ? '任务未完成，暂不可签到' : '今日已签到';
    log(`${acc.label}: ${why}`);
    summary.detail.push(why);
  }

  // 3. 顺手领取其它可领取的任务奖励
  if (claimTasks) {
    const others = tasks.filter((t) => t && t.taskDefId !== CHECKIN_TASK_ID && t.canReceive === true);
    for (const t of others) {
      const reward = fmtReward(t);
      const r = await claimTask(acc, t);
      if (r.ok) {
        log(`${acc.label}: 领取任务「${t.taskDefName || t.taskDefId}」成功${reward ? '，获得 ' + reward : ''}`);
        summary.detail.push(`领取「${t.taskDefName || t.taskDefId}」成功` + (reward ? ' +' + reward : ''));
      } else {
        log(`${acc.label}: 领取任务「${t.taskDefName || t.taskDefId}」失败 - ${r.msg}`);
      }
      await sleep(800 + Math.random() * 1200);
    }
    if (others.length === 0) log(`${acc.label}: 没有其它可领取的任务奖励`);
  }

  // 4. 顺带展示签到进度
  if (checkin && checkin.receiveProgressMap) {
    const done = Object.values(checkin.receiveProgressMap).filter((v) => v === 1).length;
    const totalDays = checkin.totalProgress || 7;
    log(`${acc.label}: 本期签到进度 ${done}/${totalDays} 天`);
  }
  return summary;
}

/* ============================== 通知 ============================== */

function loadNotify() {
  const candidates = ['./sendNotify', '../sendNotify', '/ql/data/scripts/sendNotify', '/ql/data/config/sendNotify'];
  for (const p of candidates) {
    try {
      const mod = require(p);
      return typeof mod === 'function' ? mod : mod.sendNotify || null;
    } catch (e) {
      /* 未安装则跳过 */
    }
  }
  return null;
}

/* ============================== 主流程 ============================== */

(async () => {
  const claimTasks = String(process.env.EAI_CLAIM_TASKS || 'true').toLowerCase() !== 'false';
  const accounts = parseAccounts();
  log(`共检测到 ${accounts.length} 个账号，任务奖励顺手领取：${claimTasks ? '开' : '关'}`);

  const results = [];
  for (let i = 0; i < accounts.length; i++) {
    results.push(await runAccount(accounts[i], i + 1, accounts.length, claimTasks));
    if (i < accounts.length - 1) await sleep(1500 + Math.random() * 2000);
  }

  log('==================== 执行完毕 ====================');
  const content = results.map((r) => `${r.label}: ${r.ok ? '✅' : '❌'} ${r.detail.join('；')}`).join('\n');
  console.log(content);

  const notify = loadNotify();
  if (notify) {
    try {
      await notify('天翼云云智助手签到', content);
      log('已发送通知');
    } catch (e) {
      log('通知发送失败: ' + e.message);
    }
  }
})().catch((e) => {
  log('脚本运行异常: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
