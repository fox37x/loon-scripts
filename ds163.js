/*
 * 网易大神「合作权益」每日领券 - Loon 脚本 (一个文件两种用途)
 *  1) http-request 模式: 打开小程序时自动抓取 NTES_YD_SESS 并保存, 变化时推送 TG
 *  2) cron 模式: 每天 0 点启动, 对时后等到开抢时间准点抢券, 结果推送到 Telegram
 *
 * TG 配置不写在脚本里(脚本放公开仓库), 开着 Loon 用 Safari 打开一次:
 *   https://inf.ds.163.com/v1/web/ds163-config?token=你的BotToken&chat=你的ChatID
 * 页面显示「配置已保存」即可, 之后存在 Loon 本地。
 */

// ============ 配置 ============
// 要抢的券 (brandId + couponId 固定不变)。不想要的在行首加 // 注释掉
const TARGETS = [
  { brandId: "6a5f1884bde244285e958847", couponId: "6a5f1a02f34ee33e0d7d9978", name: "霸王茶姬 5折外卖券 立减20" },
  { brandId: "6a5f1884bde244285e958847", couponId: "6a5f1a3df34ee33e0d7d9979", name: "霸王茶姬 5折外卖券 立减25" },
  { brandId: "6a5f1884bde244285e958847", couponId: "6a5f1a1d4d7fef55f1590b26", name: "霸王茶姬 外卖券 满28减10" },
  // { brandId: "69a7ce1d2ff28f708825a912", couponId: "6ab37deca8b2237f8a4d6d57", name: "滴滴 出行券包" },
];
const GRAB_AT = "00:01:00";   // 开抢时间(北京时间)。抓包显示霸王茶姬每天 00:01:00 开放
const GRAB_SECONDS = 10;      // 开抢后持续重试多少秒
const INTERVAL_MS = 300;      // 每轮请求间隔(毫秒), 别太小以免风控
// 说明: 脚本用服务器时间对时, 在 GRAB_AT 前启动会自动等到点再抢;
//       白天手动运行则直接每张券领一次。
// ==============================

const KEY = "ds163_yd_sess";
const DEV_KEY = "ds163_device_id";
const API = "https://inf.ds.163.com";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.79(0x18004f2e) NetType/WIFI Language/zh_CN miniProgram/wx53eacbe0d8a7a95a";

if (typeof $request !== "undefined") capture();
else run().catch(e => finish(["出错: " + e])).then(() => $done());

// ---------- 抓 Cookie / 保存TG配置 ----------
function capture() {
  if (($request.url || "").indexOf("/v1/web/ds163-config") >= 0) {
    const q = {};
    ($request.url.split("?")[1] || "").split("&").forEach(p => {
      const i = p.indexOf("="); if (i > 0) q[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1));
    });
    if (q.token) $persistentStore.write(q.token, "ds163_tg_token");
    if (q.chat) $persistentStore.write(q.chat, "ds163_tg_chat");
    const ok = !!($persistentStore.read("ds163_tg_token") && $persistentStore.read("ds163_tg_chat"));
    const page = body => $done({ response: { status: 200, headers: { "Content-Type": "text/html;charset=utf-8" },
      body: `<meta name="viewport" content="width=device-width"><div style="font:16px -apple-system;padding:16px">${body}</div>` } });
    if (!ok) return page("<h2>❌ 缺少 token 或 chat 参数</h2>");
    // 等 TG 发送完成再结束脚本, 并把结果显示在页面上
    return tg("✅ 网易大神领券: Telegram 配置成功").then(r => {
      let res = "";
      try { if (r.err || !r.data) throw 0; const j = JSON.parse(r.data); res = j.ok ? "✅ TG 测试消息已发送" : "❌ TG 返回错误: " + esc(j.description || r.data); }
      catch (e) { res = "❌ 连不上 Telegram: " + esc(r.err || r.data); }
      let hint = "";
      if (/chat not found/i.test(res)) hint = "<p>👉 ChatID 不对, 或者你还没在自己的机器人里点「开始/Start」</p>";
      else if (/Unauthorized|Not Found/i.test(res)) hint = "<p>👉 BotToken 不对, 重新从 @BotFather 复制</p>";
      else if (/连不上/.test(res)) hint = "<p>👉 Loon 里让 api.telegram.org 走代理节点</p>";
      page(`<h2>✅ 配置已保存</h2><p>${res}</p>${hint}`);
    });
  }
  const h = $request.headers || {};
  let ck = "";
  for (const k in h) if (k.toLowerCase() === "cookie") ck += ";" + h[k];
  const m = ck.match(/NTES_YD_SESS=([^;,\s]+)/);
  if (m && m[1] !== $persistentStore.read(KEY)) {
    $persistentStore.write(m[1], KEY);
    $notification.post("网易大神", "", "Cookie 已更新 ✅");
    tg("🍪 网易大神 Cookie 已自动更新").then(() => $done({}));
  } else $done({});
}

// ---------- 领券 ----------
async function run() {
  const sess = $persistentStore.read(KEY);
  if (!sess) return finish(["还没有 Cookie: 请先开着 Loon 打开一次小程序的权益页"]);
  let dev = $persistentStore.read(DEV_KEY);
  if (!dev) { dev = uuid(); $persistentStore.write(dev, DEV_KEY); }
  const xsrf = uuid();
  const ctx = { cookie: `NTES_YD_SESS=${sess}; GL-XSRF-TOKEN=${xsrf}; LINK_LOGIN_CHANNEL=MINI_TO_H5; LINK_LOGIN_PRODUCT=godlike_wyds_xcx`, xsrf, dev, uid: "" };

  const lg = await post(ctx, "/v1/web/base/login", {});
  if (lg.code !== 200)
    return finish([`❌ Cookie 已失效 (${lg.errmsg || lg.code})`, "👉 开着 Loon 打开一次「网易大神」小程序的权益页, 会自动更新"]);
  ctx.uid = lg.result.user.uid;
  const lines = [`账号: ${lg.result.user.nick}`];

  // 用服务器时间对时
  const t0 = Date.now();
  const info = await post(ctx, "/v1/web/exp-vip/external/super-coupon/info", {});
  const offset = (info.result && info.result.serverTime ? info.result.serverTime : Date.now()) - (t0 + Date.now()) / 2;
  const now = () => Date.now() + offset;

  // 计算北京时间的开抢时刻
  const DAY = 86400000, BJ = 8 * 3600000;
  const [hh, mm, ss] = GRAB_AT.split(":").map(Number);
  let target = Math.floor((now() + BJ) / DAY) * DAY - BJ + ((hh * 60 + mm) * 60 + ss) * 1000;
  if (target + GRAB_SECONDS * 1000 < now() && target + DAY - now() < 10 * 60000) target += DAY; // 23:5x 启动 → 等明天
  const grabMode = target + GRAB_SECONDS * 1000 >= now() && target - now() < 10 * 60000;

  // 跳过已领过的
  let pending = TARGETS.slice();
  try {
    const st = await post(ctx, "/v1/web/exp-vip/external/super-coupon/grant-status", { superCouponIds: TARGETS.map(t => t.couponId) });
    const done = {};
    st.result.grantItems.forEach(g => { if (g.status !== "NOT_GRANTED") done[g.superCouponId] = 1; });
    pending = TARGETS.filter(t => { if (done[t.couponId]) lines.push(`${t.name}: 已领过`); return !done[t.couponId]; });
  } catch (e) {}

  const grant = t => post(ctx, "/v1/web/exp-vip/external/super-coupon/grant",
    { brandId: t.brandId, superCouponId: t.couponId, phoneBizType: "VIP" }).catch(e => ({ code: -1, errmsg: String(e) }));
  const last = {}, tries = {};
  const isFinal = r => r.code === 200 || /已领|领过|已经|上限|次数/.test(r.errmsg || "");

  if (grabMode && pending.length) {
    const wait = target - now() - 80; // 提前约 80ms 发出, 抵消网络延迟
    if (wait > 0) await sleep(wait);
    const end = target + GRAB_SECONDS * 1000;
    while (pending.length && now() < end) {
      const rs = await Promise.all(pending.map(grant));
      pending = pending.filter((t, i) => {
        last[t.couponId] = rs[i]; tries[t.couponId] = (tries[t.couponId] || 0) + 1;
        return !isFinal(rs[i]);
      });
      if (pending.length) await sleep(INTERVAL_MS);
    }
  } else {
    for (const t of pending) { last[t.couponId] = await grant(t); tries[t.couponId] = 1; await sleep(1000); }
  }

  for (const t of TARGETS) {
    const r = last[t.couponId];
    if (r) lines.push(`${t.name}: ${r.code === 200 ? "✅ 抢到了" : "❌ " + r.errmsg} (${tries[t.couponId]}次)`);
  }
  if (grabMode) lines.push(`开抢时间 ${GRAB_AT}, 对时偏差 ${Math.round(offset)}ms`);
  return finish(lines);
}

function sleep(ms) { return new Promise(ok => setTimeout(ok, ms)); }

function finish(lines) {
  const msg = lines.join("\n");
  console.log(msg);
  $notification.post("网易大神领券", "", msg);
  return tg("🎟 网易大神领券\n" + msg);
}

function post(ctx, path, data) {
  const body = JSON.stringify(data);
  const headers = {
    "User-Agent": UA, "Content-Type": "application/json;charset=UTF-8",
    "Accept": "application/json, text/plain, */*", "Origin": "https://vip.ds.163.com",
    "Referer": "https://vip.ds.163.com/", "GL-ClientType": "60", "GL-DeviceId": ctx.dev,
    "GL-X-XSRF-TOKEN": ctx.xsrf, "GL-CheckSum": sha1(body + ctx.xsrf), "Cookie": ctx.cookie,
  };
  if (ctx.uid) headers["GL-Uid"] = ctx.uid;
  return new Promise((ok, no) => $httpClient.post({ url: API + path, headers, body }, (err, resp, d) => {
    if (err) return no(err);
    // 登录后服务端下发 GOD_UUID / JSESSIONID, 带上
    const sc = Object.keys(resp.headers || {}).filter(k => k.toLowerCase() === "set-cookie").map(k => resp.headers[k]).join(",");
    const re = /(GOD_UUID|JSESSIONID)=([^;,\s"]+)/g; let m;
    while ((m = re.exec(sc))) ctx.cookie = ctx.cookie.replace(new RegExp(`;? ?${m[1]}=[^;]*`), "") + `; ${m[1]}=${m[2]}`;
    try { ok(JSON.parse(d)); } catch (e) { no("返回不是JSON: " + String(d).slice(0, 100)); }
  }));
}

function tg(text) {
  const token = $persistentStore.read("ds163_tg_token"), chat = $persistentStore.read("ds163_tg_chat");
  if (!token || !chat) return Promise.resolve({ err: "未配置TG" });
  return new Promise(ok => {
    const timer = setTimeout(() => ok({ err: "请求超时" }), 9000);
    $httpClient.post({
      url: `https://api.telegram.org/bot${token.trim()}/sendMessage`,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat.trim(), text }),
      timeout: 8000,
    }, (err, resp, data) => { clearTimeout(timer); ok({ err, data }); });
  });
}

function esc(s) { return String(s).replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c])); }

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16);
  });
}

function sha1(str) {
  const s = unescape(encodeURIComponent(str)), l = s.length, w = [];
  for (let i = 0; i < l; i++) w[i >> 2] |= s.charCodeAt(i) << (24 - (i % 4) * 8);
  w[l >> 2] |= 0x80 << (24 - (l % 4) * 8);
  w[(((l + 8) >> 6) << 4) + 15] = l * 8;
  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476, e = 0xc3d2e1f0;
  const rol = (n, k) => (n << k) | (n >>> (32 - k)), x = [];
  for (let i = 0; i < w.length; i += 16) {
    const [oa, ob, oc, od, oe] = [a, b, c, d, e];
    for (let j = 0; j < 80; j++) {
      x[j] = j < 16 ? (w[i + j] | 0) : rol(x[j - 3] ^ x[j - 8] ^ x[j - 14] ^ x[j - 16], 1);
      const f = j < 20 ? (b & c) | (~b & d) : j < 40 ? b ^ c ^ d : j < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
      const k = j < 20 ? 0x5a827999 : j < 40 ? 0x6ed9eba1 : j < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const t = (rol(a, 5) + f + e + k + x[j]) | 0;
      e = d; d = c; c = rol(b, 30); b = a; a = t;
    }
    a = (a + oa) | 0; b = (b + ob) | 0; c = (c + oc) | 0; d = (d + od) | 0; e = (e + oe) | 0;
  }
  return [a, b, c, d, e].map(v => (v >>> 0).toString(16).padStart(8, "0")).join("");
}
