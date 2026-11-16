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

/** 解析浏览器 Copy as cURL 整段命令，提取 Cookie / JWT / UA / tenantId（含 HttpOnly Cookie，最可靠） */
function parseCurlEntry(entry) {
  const s = entry.replace(/[\^\\`]\s*\r?\n/g, ' '); // 拼接 bash \ / cmd ^ / PowerShell ` 续行
  const out = { cookie: '', jwt: '', tenantId: '', ua: '' };
  const argRe = /(?:^|\s)(-H|--header|-b|--cookie|-A|--user-agent)\s+(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|([^\s]+))/g;
  let m;
  while ((m = argRe.exec(s))) {
    let val = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4];
    val = val.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    const flag = m[1];
    if (flag === '-b' || flag === '--cookie') { out.cookie = val; continue; }
    if (flag === '-A' || flag === '--user-agent') { out.ua = val; continue; }
    const i = val.indexOf(':');
    if (i < 0) continue;
    const name = val.slice(0, i).trim().toLowerCase();
    const v = val.slice(i + 1).trim();
    if (name === 'cookie') out.cookie = v;
    else if (name === 'yl-authorization' || name === 'authorization') out.jwt = v;
    else if (name === 'x-eai-tenant-id') out.tenantId = v;
    else if (name === 'user-agent') out.ua = out.ua || v;
  }
  return out;
}

function parseAccounts() {
  const raw = process.env.EAI_COOKIE || process.env.eaichatCookie || '';
  if (!raw.trim()) {
    log('未检测到环境变量 EAI_COOKIE，请先在青龙「环境变量」里添加。');
    process.exit(0);
  }

  // ① 整段就是一个 JSON（支持多行 + 尾随逗号）：单账号对象 或 多账号数组
  try {
    const j = JSON.parse(raw.replace(/,\s*([}\]])/g, '$1')); // 去掉 JS 风格尾随逗号
    const items = Array.isArray(j) ? j : [j];
    if (items.length && items.every((o) => o && typeof o === 'object' && (o.cookie || o.skcache || o.sk))) {
      return items.map((o, idx) => {
        const acc = { label: `账号${idx + 1}`, cookie: o.cookie || '', jwt: o.jwt || '', sk: o.sk || '', tenantId: o.tenantId || '', ua: o.ua || '' };
        if (!acc.sk && o.skcache && o.clientKey) {
          try {
            acc.sk = deriveSk(o.skcache, o.clientKey);
            log(`${acc.label}: 已由 skcache+clientKey 解出签名密钥 sk`);
          } catch (e) {
            log(`${acc.label}: sk 解密失败（${e.message}），本次以无签名方式请求`);
          }
        }
        acc.jwt = acc.jwt || getCookieValue(acc.cookie, 'YL-Authorization');
        acc.xuid = 'pubweb_' + uuid();
        return acc;
      });
    }
  } catch (e) { /* 非整体 JSON，继续下面的兼容解析 */ }

  // ② 兼容 cURL / 按行 / 纯 Cookie 串
  // 先拼接 cURL 续行；识别规则：
  //   以 curl 开头 → 新账号（整段 cURL，不按 & 拆分）
  //   以 -H/--url 等参数开头 → 并回上一条 cURL（粘贴时续行被拆散的情况）
  //   以 { 开头且上一条是 cURL → 作为该账号的 JSON 补充（skcache/clientKey 等）
  //   其余 → 普通 Cookie 行，支持用 & 分隔多账号
  const joined = raw.replace(/[\^\\`]\s*\r?\n/g, ' ');
  const entries = [];
  for (const line of joined.split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    const prev = entries[entries.length - 1];
    if (/^curl[\s"']/.test(s)) {
      entries.push(s);
    } else if (/^-{1,2}[A-Za-z]/.test(s)) {
      if (prev && /^curl[\s"']/.test(prev)) entries[entries.length - 1] = prev + ' ' + s;
      else log('忽略无法识别的行（疑似 cURL 参数但找不到命令头）：' + s.slice(0, 50));
    } else if (s.startsWith('{') && prev && /^curl[\s"']/.test(prev)) {
      entries[entries.length - 1] = prev + '\n' + s;
    } else {
      entries.push(...s.split('&').map((x) => x.trim()).filter(Boolean));
    }
  }
  return entries.map((entry, idx) => {
    let acc = { label: `账号${idx + 1}`, cookie: '', jwt: '', sk: '', tenantId: '', ua: '' };
    // 拆出 cURL 后面附带的 JSON 补充行
    let main = entry;
    let jsonExtra = '';
    const nl = entry.indexOf('\n{');
    if (nl > -1) {
      main = entry.slice(0, nl);
      jsonExtra = entry.slice(nl + 1);
    }
    if (/^curl\s/.test(main)) {
      const c = parseCurlEntry(main);
      acc.cookie = c.cookie;
      acc.jwt = c.jwt;
      acc.tenantId = c.tenantId;
      acc.ua = c.ua;
      if (!acc.cookie && !acc.jwt) log(`${acc.label}: cURL 里未解析出 Cookie/JWT，请确认复制的是 /ai/portal/ 请求的 Copy as cURL`);
    } else if (main.startsWith('{')) {
      jsonExtra = main;
      main = '';
    } else {
      acc.cookie = main;
    }
    if (jsonExtra) {
      try {
        const j = JSON.parse(jsonExtra);
        acc.cookie = acc.cookie || j.cookie || '';
        acc.jwt = acc.jwt || j.jwt || '';
        acc.sk = acc.sk || j.sk || '';
        acc.tenantId = acc.tenantId || j.tenantId || '';
        if (!acc.sk && j.skcache && j.clientKey) {
          try {
            acc.sk = deriveSk(j.skcache, j.clientKey);
            log(`${acc.label}: 已由 skcache+clientKey 解出签名密钥 sk`);
          } catch (e) {
            log(`${acc.label}: sk 解密失败（${e.message}），本次以无签名方式请求`);
          }
        }
      } catch (e) {
        log(`${acc.label}: JSON 补充行解析失败：${e.message}`);
      }
    }
    acc.jwt = acc.jwt || getCookieValue(acc.cookie, 'YL-Authorization');
    acc.xuid = 'pubweb_' + uuid();
    return acc;
  });
}

/* ============================== 请求头（复刻网页端） ============================== */

function buildHeaders(acc, params) {
  const ua = acc.ua || USER_AGENT;
  const headers = {
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': ua,
    'x-user-agent': ua,
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
    if (list.authExpired) log(`${acc.label}: 鉴权失败 - ${list.msg}（多为缺少 sk 签名或 Cookie 失效）`);
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

/** 青龙系统推送 */
function systemNotify(title, content) {
  try {
    console.log(title);
    if (typeof QLAPI !== 'undefined' && QLAPI && typeof QLAPI.systemNotify === 'function') {
      QLAPI.systemNotify({ title, content });
    } else {
      log('当前环境没有 QLAPI.systemNotify（非青龙运行？），跳过通知推送');
    }
  } catch (e) {
    log('通知推送失败: ' + e.message);
  }
}

/* ============================== 主流程 ============================== */

(async () => {
  const claimTasks = String(process.env.EAI_CLAIM_TASKS || 'true').toLowerCase() !== 'false';
  const accounts = parseAccounts();
  log(`共检测到 ${accounts.length} 个账号，任务奖励顺手领取：${claimTasks ? '开' : '关'}`);
  const noSk = accounts.filter((a) => !a.sk).length;
  if (noSk) {
    log(`⚠️ 有 ${noSk} 个账号未配置 sk（skcache+clientKey）：wenc 网关强制校验 web-signature，缺 sk 会 401，请用 JSON 写法补充`);
  }

  const results = [];
  for (let i = 0; i < accounts.length; i++) {
    results.push(await runAccount(accounts[i], i + 1, accounts.length, claimTasks));
    if (i < accounts.length - 1) await sleep(1500 + Math.random() * 2000);
  }

  log('==================== 执行完毕 ====================');
  const content = results.map((r) => `${r.label}: ${r.ok ? '✅' : '❌'} ${r.detail.join('；')}`).join('\n');
  console.log(content);

  systemNotify('天翼云云智签到', content);
})().catch((e) => {
  log('脚本运行异常: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
