/**
 * 自定义流量购买 - 前端注入脚本 (LiquidGlass) v1.0.42
 * ------------------------------------------------------------------
 * 使用方法：在后台 → 主题 → LiquidGlass → 「自定义页脚HTML」填
 *     <script src="/plugins/custom_traffic/custom-traffic.js?v=20260816"></script>
 *
 * 功能：
 *  1. 配置了 plan_ids 的套餐：隐藏原生周期订阅卡片 + 订单总额卡片，
 *     替换为玻璃拟态「自定义流量」滑块（选流量 → 选周期 → 本地即时算价 → 直接购买）
 *  2. 本地即时算价（无网络延迟）+ 丝滑数字过渡动画
 *  3. 购买按钮直连插件下单接口，成功后跳转订单页走核心支付流程
 *  4. 拦截 /user/order/save 作为兜底
 *
 * v3 修复：
 *  - 下单返回标准 {status:'success', data: trade_no}（后端已同步修复）
 *  - token 强制 Bearer 前缀，避免 Sanctum 鉴权失败
 *  - 主色：尊重主题 --primary-color，空值回退中性灰 #9CA3AF，按钮文字按亮度自适应黑白
 *  - 样式精修：弱化突兀渐变，对齐 glass-card 与 Naive UI 视觉语言
 *
 * v4 修复（2026-08-13）：
 *  - 修复拖动滑块时价格偶发 ¥NaN：setMoney 动画起始值误取 m[1]
 *    （正则 /[\d.]+/ 无捕获组，m[1] 恒为 undefined → from 恒为 NaN），
 *    导致每两次输入在正确价格与 ¥NaN 间交替闪烁；改用 m[0] 并加 isFinite 守卫
 *  - 订单详情兜底：拦截 /user/order/detail 响应，把 plan[period] 改写为订单真实总额、
 *    plan.transfer_enable 改写为自定义流量，浏览器即使缓存旧版主题 chunk 也显示正确
 *  - 隐藏主题「订单总额/选择付款周期」卡片增加内容匹配兜底
 *  - 配色（v4.3）：价格框/按钮/滑块进度改为纯主色（去掉渐变），文字按主色亮度自适应，
 *    修复暗色浅灰主色下白字不可见；暗色卡片加深并加主色氛围光晕
 * v4.4 新增：
 *  - 流量步进器（−/＋按钮 + 数字输入，胶囊玻璃质感，输入中即时预览、失焦 clamp 回写）
 *  - 阶梯付费限制：每月价格低于第二档价格时仅支持季付起购（默认季付），
 *    达到第二档后「月付」chip 丝滑展开显示，滑回低档时丝滑收起并自动切回季付
 *  - 所有前端行为均在本脚本内实现，不改动主题/核心项目文件（订单详情金额
 *    与流量列由响应拦截改写 plan[period]/plan.transfer_enable 兜底）
 * v4.5 修复：
 *  - 默认流量定位在第二档（80G），进入页面即显示月付选项
 *  - 修复输入框打字被打断覆盖的问题（聚焦时不再回写钳制值），聚焦自动全选
 * v4.6 修复：
 *  - 修复默认 80G 时滑块进度填充不显示：初始化从构建期移到挂载后执行
 *    （挂载前 document 查询不到 UI 元素，导致进度/步进器初始状态未同步）
 * v4.7 新增：
 *  - 续费天数规则：与上次购买流量一致 → 天数叠加；流量不同 → 天数重置重新起算
 *  - 购买页动态提示（拉取 /custom-traffic/last 对比上次购买流量）+ 规则说明文案
 * v4.8 修复：
 *  - "上次购买"数据在 SPA 内导航时不刷新：改为每次进入购买页（UI 重建）
 *    及 hash 切换到 plan 页时自动重新拉取，支付完成后返回无需强刷
 * v4.9 加固：
 *  - 增加标签页切回（visibilitychange）与窗口聚焦（focus）兜底拉取；
 *  - 控制台输出 [custom-traffic] v1.0.4 便于确认脚本版本
 * v4.10 调整：
 *  - 默认流量 80G（第二档）时默认选中的周期改为「月付」
 *    （月价已达第二档价格，月付合法；若默认流量低于门槛自动回退季付）
 * v4.11 新增：
 *  - 增加第三档阶梯（默认 120G=36元），超出第三档后按 over_price_per_gb 计费；
 *    200G=60元、120G=36元 均为整数价
 * v4.12 调整：
 *  - 计价与续费规则从滑块卡底部拆出，改为独立玻璃卡片挂载到右栏顶部
 * v4.13 修复+新增（2026-08-15）：
 *  - 续费提示三态化：/custom-traffic/last 返回 context，换套餐/过期重购时
 *    不再误显示「一致→叠加天数」（核心对换套餐本是折抵+天数重起算）
 *  - 重置包顺延制：购买页周期卡含重置包选项时提示下次自动重置倒计时，
 *    后端 order.open.after 钩子会把 next_reset_at 顺延一个月（等价预支下次重置）
 * v4.14 修正（2026-08-15）：
 *  - 换套餐文案按后台 surplus_enable 开关显示是否折抵（本站未开启折抵，
 *    不再误导用户「剩余价值自动折抵」）
 * v4.15 新增（2026-08-15）：
 *  - 计价与续费规则卡新增「流量重置规则」分区：展示本套餐自动重置规则
 *    （读 /guest/plan/fetch 的 reset_traffic_method + reset_price）、
 *    重置包价格与顺延规则（预支下一次自动重置）
 * v4.16 新增（2026-08-15）：
 *  - 自定义流量套餐支持流量重置包：购买区新增重置包入口，仅当前订阅
 *    本套餐的用户可见；价格 = 用户当前流量对应的阶梯月价（本地与后端同算法）
 * v4.17 新增（2026-08-15）：
 *  - 购买区新增「续费」按钮：仅当前订阅本套餐的用户可见；价格 = 当前流量
 *    阶梯月价 × 所选周期（周期 chips 联动），天数叠加、流量不变、
 *    重置日期不变（整月叠加保持锚点日）
 * v4.18 调整（2026-08-15）：
 *  - 规则卡文案全部写死（不再按套餐数据动态拉取）
 *  - 「续费」改为对齐按钮：点击把滑块对齐到当前订阅流量，再点「立即购买」
 *    按续费叠加天数（去掉独立续费下单，走主购买链路）
 * v4.19 修复（2026-08-15）：
 *  - 手机端续费/重置包按钮换行：文字信息区独立容器自行换行，
 *    按钮固定右侧（white-space:nowrap + flex-shrink:0），不再被挤到下一行
 * v4.20 新增（2026-08-15）：
 *  - 主按钮动态文案：同套餐订阅活跃且滑块等于当前订阅流量 → 「立即续费」
 *    （点「续费」对齐滑块后自动变），其余场景保持「立即购买」
 * v4.21 新增（2026-08-15）：
 *  - 仪表盘「我的订阅」卡：在「续费订阅」按钮旁注入「复制订阅」按钮，
 *    一键复制订阅地址（subscribe_url，读 /user/getSubscribe，复用 __ctSubCache 缓存）
 * v4.22 修复（2026-08-15）：
 *  - 订阅缓存按登录 token 区分：SPA 内切换账号后不再复用上一账号的订阅数据
 *    （此前同浏览器切换账号复制订阅会拿到上一账号的地址）
 *  - 复制订阅按钮每次点击都重新拉取（fetch cache:no-store），保证拿到当前账号最新地址
 * v4.23 新增（2026-08-15）：
 *  - 同套餐订阅用户进入购买页自动把滑块对齐到当前订阅流量（立即续费位置），
 *    省去手动点「续费」；用户手动调整过滑块则不再自动打扰
 * v4.24 调整（2026-08-15）：
 *  - 同套餐订阅用户改为永久自动对齐（每次进入都对齐到当前订阅流量，
 *    去掉手动调整守卫）；删除「续费」按钮行（对齐由进入页面自动完成）
 * v4.25 修复（2026-08-15）：
 *  - 修复进入购买页「提示已对齐但滑块仍在默认 80G」：订阅缓存命中时
 *    自动对齐先于默认值初始化执行，随后被 setTraffic(默认) 覆盖；
 *    调整为默认值先落、订阅数据后拉；删除「已对齐」toast 提示
 * v4.26 新增（2026-08-15）：
 *  - 购买区新增「永久流量包」入口行：按钮跳转 #/plan/1（固定 50G ¥45
 *    一次性不过期套餐），样式与流量重置包入口对齐，人人可见
 * v4.27 调整（2026-08-15）：
 *  - 侧边栏「购买订阅」菜单直接跳转 #/plan/9（拦截点击，跳过套餐列表页）
 *  - 「永久流量包」入口换位置（见 buildUIBlock 内的实现）
 * v4.28 修复（2026-08-15）：
 *  - 「购买订阅」拦截偶发失败（点击落在 .n-menu-item-content padding/图标上时
 *    closest 找不到 header）：改为按菜单项容器匹配标题 + hashchange 兜底——
 *    任何途径落到 #/plan 都改道 #/plan/9
 * v4.29 调整（2026-08-15）：
 *  - 页面滚动条跟随明暗主题：暗色半透明白滑块、透明轨道，替换主题写死的
 *    浅色 #eee 轨道（纯黑主题下突兀的亮灰条）
 * v4.30 调整（2026-08-15）：
 *  - 拖动滑块/输入流量时价格即时回写不再重放动画（每帧重放导致闪烁），
 *    松手/失焦时做一次平滑收尾
 *  - 价格框与购买按钮由整块实心主色改为玻璃拟态（跟随明暗主题），
 *    价格数字与按钮用主色点缀，不再在页面上形成突兀色块
 * v4.31 调整（2026-08-15）：
 *  - 价格框增强存在感：主色描边 + 主色渐变微着色 + 主色光晕，
 *    本期金额数字放大到 26px（保持玻璃质感，不回到整块实心色）
 * v4.32 调整（2026-08-15）：
 *  - 价格框回归中性玻璃（不掺主色渐变/光晕，与整体风格一致），
 *    靠大号白数字（本期 26px）突出
 *  - 购买按钮改为反色对比：暗色主题=白底深字、亮色主题=深底白字；
 *    深色用 #1A1A1A 而非全黑，避免刺眼
 * v4.33 调整（2026-08-15）：
 *  - 浅色模式文字从近黑 #1A1A1A 改为黑灰：正文 #404040、数字/标题 #333，
 *    与主题浅色模式（slate 黑灰系）观感一致；暗色模式不变
 * v4.34 调整（2026-08-15）：
 *  - 浅色模式购买按钮底从近黑 #1A1A1A 改为深灰 #404040，不再太黑；暗色不变
 * v4.35 新增（2026-08-16）：
 *  - 仪表盘捷径卡「遇到问题」改为「下载客户端」：点击弹出客户端下载弹窗
 *    （Windows 本站直链 zip / Android FlClash / macOS Clash Verge Rev /
 *    iOS Shadowrocket·Stash·Loon），拦截原工单跳转
 * v4.36 调整（2026-08-16）：
 *  - 公告横幅浅色模式反色：灰阶夜景图在 html:not(.dark) 下整条横幅
 *    filter:invert(1)，自动得到"日间"版（浅底黑字），深色模式不变
 * v4.37 调整（2026-08-16）：
 *  - 反色方案废弃（用户觉得浅色反色丑）：改成两版图——深色=无月夜景
 *    （announcement-bg.svg?v=4），浅色=白昼同构图（announcement-bg-light.svg?v=3），
 *    applyNoticeBgMode 按 html.dark 切换 background-image；浅色模式另加 CSS
 *    覆盖（白色纱罩替换 #0006、标题/时间/图标/箭头改深色，替换主题强制白字）
 * v4.38 调整（2026-08-16）：
 *  - 浅色版城市重绘：三层大气透视（远景雾化淡灰→中景中灰→近景深灰）
 *    + 退台/水箱/天线/窗带反光细节 + 底部雾色收尾，替换原整块深灰剪影
 * v4.39 调整（2026-08-16）：
 *  - 浅色版彻底换主题：去城市改云海远山——四层正弦山脊（淡灰层次）
 *    + 云海填谷 + 底部云海带 + 左上孤松剪影 + 白太阳；light 图 ?v=3
 * v4.40 修复（2026-08-16）：
 *  - 切栏目回仪表盘时公告横幅退回深色图：Vue 把背景图异步回填到
 *    inline style（属性变更不触发 childList 观察）→ observer 增加
 *    attributes+attributeFilter:['style']；applyNoticeBgMode 改为
 *    正则提取当前 URL 比较，避免格式差异导致死循环
 */
(function () {
  'use strict';

  if (window.__customTrafficInjected) return;
  window.__customTrafficInjected = true;

  window.__ctTrafficGb = null;
  // 默认月付：默认流量定位在第二档（80G，月价=第二档价格），此时月付可选；
  // 若默认流量低于月付门槛，refreshChips 会自动切回季付兜底
  window.__ctPeriod = 'monthly';
  window.__ctPeriodCardHidden = false;
  // 拖动/输入中：价格直接回写不做过渡动画（拖动时每帧重放动画会闪），松手后动画收尾
  window.__ctDragging = false;

  var CFG = {
    enable: false,
    plan_ids: [],
    min_gb: 25,
    max_gb: 500,
    tier1_gb: 25,
    tier1_price: 1000,
    tier2_gb: 80,
    tier2_price: 2500,
    tier3_gb: 120,
    tier3_price: 3600,
    over_price_per_gb: 30,
    period_multiplier: true,
    reset_shift_enable: true,
    surplus_enable: false
  };

  var PERIOD_OPTIONS = [
    { key: 'monthly', label: '月付', mult: 1 },
    { key: 'quarterly', label: '季付', mult: 3 },
    { key: 'half_yearly', label: '半年付', mult: 6 },
    { key: 'yearly', label: '年付', mult: 12 }
  ];

  var PERIOD_LABEL_MAP = {};
  var PERIOD_MULT_MAP = {
    monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12,
    two_yearly: 24, three_yearly: 36, onetime: 1
  };
  PERIOD_OPTIONS.forEach(function (p) {
    PERIOD_LABEL_MAP[p.key] = p.label;
    PERIOD_MULT_MAP[p.key] = p.mult;
  });

  var apiBase = (function () {
    var base = window.routerBase || '/';
    base = String(base).replace(/\/+$/, '');
    return base + '/api/v1';
  })();

  /* ---------- 主题主色解析 ---------- */

  function normHex(h) {
    if (!h) return '';
    h = String(h).trim();
    // #RGB → #RRGGBB
    if (/^#[a-f\d]{3}$/i.test(h)) {
      h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    }
    return h;
  }

  function hexToRgb(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normHex(hex) || '');
    return m ? parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) : null;
  }

  // 按主色亮度计算按钮文字色（亮底用深字、暗底用白字）
  function getTextOn(rgb) {
    var p = String(rgb || '').split(',');
    if (p.length < 3) return '#fff';
    var lum = (0.299 * +p[0] + 0.587 * +p[1] + 0.114 * +p[2]) / 255;
    return lum > 0.62 ? '#1A1A1A' : '#fff';
  }

  function getPrimaryRgb() {
    var hex = '';
    try { hex = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim(); } catch (e) { /* ignore */ }
    var rgb = hexToRgb(hex);
    // 主题未配置主色时，回退中性灰 #9CA3AF（避免蓝色）
    if (!rgb) return '156,163,175';
    return rgb;
  }

  window.__ctPrimaryRgb = getPrimaryRgb();
  document.documentElement.style.setProperty('--ct-primary-rgb', window.__ctPrimaryRgb);
  document.documentElement.style.setProperty('--ct-btn-text', getTextOn(window.__ctPrimaryRgb));

  var PERIOD_KEY_MAP = {
    '月付': 'monthly',
    '季付': 'quarterly',
    '半年付': 'half_yearly',
    '年付': 'yearly',
    '两年付': 'two_yearly',
    '三年付': 'three_yearly',
    '一次性': 'onetime',
    '流量重置包': 'reset_traffic',
    '重置流量': 'reset_traffic'
  };

  var UI_BLOCK_ID = '__ct-ui-block';
  var SLIDER_ID = '__ct-slider';
  var TIP_BLOCK_ID = '__ct-tip-card';

  /* ------------------------- 0. 读取登录 token ------------------------- */

  // 强制返回 "Bearer xxx"，兼容 Sanctum 鉴权
  function getToken() {
    var t = '';
    try {
      var raw = localStorage.getItem('ACCESS_TOKEN');
      if (raw) {
        var obj = JSON.parse(raw);
        if (obj && obj.value) t = obj.value;
      }
    } catch (e) { /* ignore */ }
    if (!t) t = localStorage.getItem('authorization') || '';
    if (t && /^Bearer\s+/i.test(t)) return t.trim();
    if (t) return 'Bearer ' + String(t).trim();
    return '';
  }

  /* ------------------------- 1. 加载插件配置 ------------------------- */

  function loadConfig() {
    return fetch(apiBase + '/guest/comm/config')
      .then(function (r) { return r.json(); })
      .then(function (json) {
        var ok = json && (json.code === 200 || json.status === 'success');
        if (ok && json.data && json.data.custom_traffic && json.data.custom_traffic.enable) {
          var c = json.data.custom_traffic;
          CFG.enable = true;
          CFG.plan_ids = Array.isArray(c.plan_ids) ? c.plan_ids : [];
          CFG.min_gb = Number(c.min_gb) || 25;
          CFG.max_gb = Number(c.max_gb) || 500;
          CFG.tier1_gb = Number(c.tier1_gb) || 25;
          CFG.tier1_price = Number(c.tier1_price) || 1000;
          CFG.tier2_gb = Number(c.tier2_gb) || 80;
          CFG.tier2_price = Number(c.tier2_price) || 2500;
          CFG.tier3_gb = Number(c.tier3_gb) || 120;
          CFG.tier3_price = Number(c.tier3_price) || 3600;
          CFG.over_price_per_gb = Number(c.over_price_per_gb) || 30;
          CFG.period_multiplier = c.period_multiplier !== false;
          CFG.reset_shift_enable = c.reset_shift_enable !== false;
          CFG.surplus_enable = c.surplus_enable === true;
        }
        return CFG.enable;
      })
      .catch(function () { return false; });
  }

  /* ------------------------- 2. 页面识别与卡片控制 ------------------------- */

  function getPlanIdFromHash() {
    var m = (location.hash || '').match(/#\/plan\/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }

  function isOnPlanDetailPage() {
    if (getPlanIdFromHash() === null) return false;
    return !!document.querySelector('[data-v-21a6dca5] .n-card.glass-card, [data-v-21a6dca5] .period-item');
  }

  function isPlanEnabled(planId) {
    if (!CFG.plan_ids || !CFG.plan_ids.length) return true;
    return CFG.plan_ids.indexOf(planId) !== -1;
  }

  function findCardByTitle(keyword) {
    var headers = document.querySelectorAll('.n-card-header__main');
    for (var i = 0; i < headers.length; i++) {
      var text = (headers[i].textContent || '').trim();
      if (text.indexOf(keyword) !== -1) {
        var card = headers[i].closest('.n-card');
        if (card) return card;
      }
    }
    return null;
  }

  // 按卡片内任意文本匹配（主题结构变化时的兜底，仅限 plan 页作用域）
  function findCardContaining(keyword) {
    var cards = document.querySelectorAll('[data-v-21a6dca5] .n-card');
    for (var i = 0; i < cards.length; i++) {
      var text = (cards[i].textContent || '').trim();
      if (text.indexOf(keyword) !== -1 && text.length < 400) return cards[i];
    }
    return null;
  }

  function findSummaryCard() {
    return findCardByTitle('订单总额') || findCardContaining('总计') || null;
  }

  function hidePeriodCard() {
    var card = findCardByTitle('选择付款周期') || findCardContaining('选择付款周期');
    if (card) {
      card.style.display = 'none';
      window.__ctPeriodCardHidden = true;
      return card;
    }
    return null;
  }

  function hideOrderCard() {
    var card = findSummaryCard();
    if (card) { card.style.display = 'none'; return card; }
    var sticky = document.querySelector('.sticky.space-y-6');
    if (sticky) { sticky.style.display = 'none'; return sticky; }
    return null;
  }

  function restoreCards() {
    window.__ctPeriodCardHidden = false;
    var pc = findCardByTitle('选择付款周期') || findCardContaining('选择付款周期');
    if (pc) pc.style.display = '';
    var oc = findSummaryCard();
    if (oc) oc.style.display = '';
    var sticky = document.querySelector('.sticky.space-y-6');
    if (sticky) sticky.style.display = '';
  }

  function getCurrentPeriodKey() {
    if (!window.__ctPeriodCardHidden) {
      var active = document.querySelector('[data-v-21a6dca5] .period-item.active .period-name');
      if (active) {
        var text = (active.textContent || '').trim();
        var key = PERIOD_KEY_MAP[text];
        if (key) return key;
      }
    }
    return window.__ctPeriod || 'monthly';
  }

  /* ------------------------- 3. 本地算价（与后端算法一致） ------------------------- */

  // 全程 Number() 转换，杜绝字符串拼接导致的 NaN
  function calcMonthlyPrice(gb) {
    gb = Number(gb) || 0;
    var t1g = Number(CFG.tier1_gb), t1p = Number(CFG.tier1_price);
    var t2g = Number(CFG.tier2_gb), t2p = Number(CFG.tier2_price);
    var t3g = Number(CFG.tier3_gb), t3p = Number(CFG.tier3_price);
    var over = Number(CFG.over_price_per_gb);
    if (gb <= t1g) return Math.round(t1p);
    if (gb <= t2g) {
      return Math.round(t1p + (gb - t1g) * (t2p - t1p) / (t2g - t1g));
    }
    if (gb <= t3g) {
      return Math.round(t2p + (gb - t2g) * (t3p - t2p) / (t3g - t2g));
    }
    return Math.round(t3p + (gb - t3g) * over);
  }

  function calcTotal(gb, periodKey) {
    var mult = CFG.period_multiplier ? (PERIOD_MULT_MAP[periodKey] || 1) : 1;
    return calcMonthlyPrice(gb) * Number(mult);
  }

  function fmtMoney(cents) {
    var v = parseInt(cents, 10);
    if (isNaN(v)) v = 0;
    return (v / 100).toFixed(2);
  }

  /* ------------------------- 4. 样式 ------------------------- */

  function injectStyles() {
    if (document.getElementById('__ct-style')) return;
    var style = document.createElement('style');
    style.id = '__ct-style';
    style.textContent =
      // 与主题 glass-card 同款玻璃拟态（亮/暗双模式）
      '#__ct-ui-block{' +
      'margin-top:14px;padding:1.5rem 1.75rem;border-radius:24px;' +
      'background:rgba(255,255,255,0.88);' +
      'backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);' +
      'border:1px solid rgba(232,232,232,0.65);' +
      'box-shadow:0 8px 45px rgba(0,0,0,0.08),inset 0 1px 0 rgba(255,255,255,0.9);' +
      'color:#404040;transition:all .3s ease;' +
      '}' +
      '.dark #__ct-ui-block{' +
      'background:rgba(26,26,26,0.82);border-color:rgba(64,64,64,0.9);color:#F5F5F5;' +
      'box-shadow:0 8px 45px rgba(0,0,0,0.35),0 0 40px rgba(var(--ct-primary-rgb),0.08),' +
      'inset 0 1px 0 rgba(255,255,255,0.06);' +
      '}' +
      '#__ct-ui-block:hover{box-shadow:0 15px 25px rgba(0,0,0,0.12);}' +
      '.dark #__ct-ui-block:hover{box-shadow:0 15px 35px rgba(0,0,0,0.45),0 0 48px rgba(var(--ct-primary-rgb),0.12);}' +
      '#__ct-ui-block *{box-sizing:border-box;}' +
      '#__ct-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;}' +
      '#__ct-head .t{font-size:1.05rem;font-weight:700;letter-spacing:.5px;}' +
      '#__ct-head .range{font-size:12px;font-weight:400;opacity:.7;padding:3px 12px;border-radius:999px;' +
      'background:rgba(var(--ct-primary-rgb),0.12);color:rgb(var(--ct-primary-rgb));}' +
      '#__ct-slider-row{display:flex;align-items:center;gap:14px;}' +
      '#__ct-slider{-webkit-appearance:none;appearance:none;flex:1;height:8px;border-radius:999px;outline:none;' +
      'background:rgba(var(--ct-primary-rgb),0.18);cursor:pointer;}' +
      '#__ct-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:22px;height:22px;' +
      'border-radius:50%;background:#fff;border:3px solid rgb(var(--ct-primary-rgb));' +
      'box-shadow:0 2px 10px rgba(0,0,0,0.28);cursor:pointer;transition:transform .15s;}' +
      '#__ct-slider::-webkit-slider-thumb:hover{transform:scale(1.12);}' +
      '#__ct-slider::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:#fff;' +
      'border:3px solid rgb(var(--ct-primary-rgb));box-shadow:0 2px 10px rgba(0,0,0,0.28);cursor:pointer;}' +
      // 流量数值步进器：胶囊玻璃底，−/＋按钮 + 数字输入，GB 单位内嵌
      '#__ct-stepper{display:flex;align-items:center;gap:2px;border-radius:999px;height:38px;padding:0 4px;' +
      'border:1px solid rgba(var(--ct-primary-rgb),0.28);background:rgba(255,255,255,0.6);' +
      'transition:all .2s;flex-shrink:0;}' +
      '#__ct-stepper:focus-within{border-color:rgb(var(--ct-primary-rgb));background:rgba(255,255,255,0.85);' +
      'box-shadow:0 0 0 3px rgba(var(--ct-primary-rgb),0.15);}' +
      '.dark #__ct-stepper{background:rgba(38,38,38,0.55);border-color:rgba(var(--ct-primary-rgb),0.32);}' +
      '.dark #__ct-stepper:focus-within{background:rgba(38,38,38,0.8);}' +
      '.__ct-step{width:28px;height:28px;border:none;border-radius:50%;background:transparent;' +
      'color:rgb(var(--ct-primary-rgb));font-size:16px;font-weight:700;line-height:1;cursor:pointer;' +
      'display:flex;align-items:center;justify-content:center;transition:all .15s;padding:0;font-family:inherit;}' +
      '.__ct-step:hover{background:rgba(var(--ct-primary-rgb),0.12);}' +
      '.__ct-step:active{transform:scale(0.9);}' +
      '.__ct-step:disabled{opacity:.35;cursor:not-allowed;background:transparent;}' +
      '#__ct-num{width:44px;border:none;background:transparent;outline:none;color:#333;font-size:14px;' +
      'font-weight:800;text-align:center;font-variant-numeric:tabular-nums;padding:0;font-family:inherit;}' +
      '.dark #__ct-num{color:#F5F5F5;}' +
      '#__ct-unit{font-size:12px;font-weight:600;opacity:.55;margin-left:1px;}' +
      '#__ct-period-row{display:flex;align-items:center;gap:8px;margin-top:14px;flex-wrap:wrap;}' +
      '#__ct-period-row .hint{font-size:12px;opacity:.65;}' +
      '#__ct-period-chips{display:flex;gap:6px;flex-wrap:wrap;}' +
      '.__ct-chip{padding:4px 14px;border-radius:999px;border:1px solid rgba(var(--ct-primary-rgb),0.4);' +
      'background:transparent;color:rgb(var(--ct-primary-rgb));font-size:12px;cursor:pointer;' +
      'max-width:140px;overflow:hidden;white-space:nowrap;transition:all .22s ease;font-family:inherit;}' +
      '.__ct-chip:hover{background:rgba(var(--ct-primary-rgb),0.1);}' +
      '.__ct-chip.active{background:rgb(var(--ct-primary-rgb));color:var(--ct-btn-text,#fff);' +
      'border-color:rgb(var(--ct-primary-rgb));}' +
      // 月付 chip 不可用时的丝滑收起动画（宽度+透明度过渡）
      '.__ct-chip.__ct-hidden{max-width:0;opacity:0;margin-right:-6px;padding-left:0;padding-right:0;' +
      'border-left-width:0;border-right-width:0;pointer-events:none;}' +
      // 价格框：中性玻璃（与卡片同质感，不掺主色渐变/光晕），靠大号数字突出
      '#__ct-price-box{margin-top:16px;padding:16px 18px;border-radius:16px;' +
      'color:#404040;' +
      'display:flex;justify-content:space-between;align-items:center;' +
      'background:rgba(255,255,255,0.72);' +
      'border:1px solid rgba(232,232,232,0.65);' +
      'box-shadow:0 8px 35px rgba(0,0,0,0.06);' +
      'transition:transform .18s ease;transform-origin:top center;}' +
      '.dark #__ct-price-box{' +
      'background:rgba(26,26,26,0.82);' +
      'border-color:rgba(64,64,64,0.9);' +
      'color:#F5F5F5;' +
      'box-shadow:0 8px 35px rgba(0,0,0,0.3);}' +
      '#__ct-price-box .lbl{font-size:12px;opacity:.65;letter-spacing:.3px;}' +
      '#__ct-price-box .num{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;' +
      'color:#333;}' +
      '.dark #__ct-price-box .num{color:#F5F5F5;}' +
      '#__ct-price-box .num#__ct-total{font-size:26px;}' +
      '#__ct-price-box .right{text-align:right;}' +
      // 购买按钮：反色对比（暗色主题=白底深字，亮色主题=深灰底白字）；
      // 亮色用 #404040 而非近黑 #1A1A1A，避免太黑刺眼
      '#__ct-buy-btn{margin-top:16px;width:100%;padding:13px;border:none;border-radius:12px;' +
      'background:#404040;color:#FAFAFA;font-size:15px;font-weight:700;letter-spacing:2px;' +
      'cursor:pointer;transition:opacity .2s;font-family:inherit;}' +
      '.dark #__ct-buy-btn{background:#FAFAFA;color:#1A1A1A;}' +
      '#__ct-buy-btn:hover{opacity:.88;}' +
      '#__ct-buy-btn:active{opacity:.75;}' +
      '#__ct-buy-btn:disabled{opacity:.45;cursor:not-allowed;}' +
      '#__ct-msg{margin-top:10px;font-size:12px;line-height:1.5;display:none;}' +
      '#__ct-msg.err{color:#f87171;}' +
      '#__ct-msg.ok{color:rgb(var(--ct-primary-rgb));}' +
      '#__ct-renew-hint{margin-top:10px;font-size:12px;line-height:1.5;border-radius:10px;padding:8px 12px;display:none;}' +
      '#__ct-renew-hint.ok{background:rgba(24,160,88,0.1);color:#18a058;}' +
      '.dark #__ct-renew-hint.ok{background:rgba(67,233,123,0.1);color:#43e97b;}' +
      '#__ct-renew-hint.warn{background:rgba(240,160,32,0.12);color:#c97c10;}' +
      '.dark #__ct-renew-hint.warn{background:rgba(255,209,102,0.12);color:#ffd166;}' +
      '#__ct-reset-hint{margin-top:10px;font-size:12px;line-height:1.5;border-radius:10px;padding:8px 12px;' +
      'background:rgba(240,160,32,0.12);color:#c97c10;}' +
      '.dark #__ct-reset-hint{background:rgba(255,209,102,0.12);color:#ffd166;}' +
      // 续费 / 流量重置包入口行（自定义流量套餐购买区，共享样式）
      '.__ct-sub-row{display:none;margin-top:14px;padding-top:12px;align-items:center;' +
      'justify-content:space-between;gap:10px;border-top:1px dashed rgba(var(--ct-primary-rgb),0.25);}' +
      // 文字信息区独立换行，按钮固定在右侧不换行
      '.__ct-sub-info{display:flex;flex-wrap:wrap;align-items:center;gap:2px 8px;flex:1;min-width:0;}' +
      '.__ct-sub-row .lbl{font-size:13px;font-weight:700;flex-shrink:0;}' +
      '.__ct-sub-row .desc{font-size:12px;opacity:.65;min-width:0;}' +
      '.__ct-sub-row .price{font-size:15px;font-weight:800;color:rgb(var(--ct-primary-rgb));' +
      'font-variant-numeric:tabular-nums;white-space:nowrap;}' +
      '.__ct-sub-buy{border:1px solid rgba(var(--ct-primary-rgb),0.5);background:rgba(var(--ct-primary-rgb),0.08);' +
      'color:rgb(var(--ct-primary-rgb));border-radius:999px;padding:6px 16px;font-size:13px;font-weight:700;' +
      'cursor:pointer;transition:all .15s;font-family:inherit;white-space:nowrap;flex-shrink:0;}' +
      '.__ct-sub-buy:hover{background:rgba(var(--ct-primary-rgb),0.16);}' +
      '.__ct-sub-buy:disabled{opacity:.5;cursor:not-allowed;}' +
      '#__ct-tip{margin-top:10px;font-size:12px;opacity:.6;line-height:1.6;}' +
      // 计价与续费规则卡：独立玻璃容器，挂载在右栏顶部
      '#__ct-tip-card{padding:1rem 1.25rem;border-radius:18px;' +
      'background:rgba(255,255,255,0.85);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);' +
      'border:1px solid rgba(232,232,232,0.6);box-shadow:0 8px 35px rgba(0,0,0,0.06);' +
      'color:#404040;font-size:12px;line-height:1.7;}' +
      '.dark #__ct-tip-card{background:rgba(26,26,26,0.75);border-color:rgba(64,64,64,0.8);color:#D4D4D4;' +
      'box-shadow:0 8px 35px rgba(0,0,0,0.3);}' +
      '#__ct-tip-card .t{font-size:13px;font-weight:700;color:#333;margin-bottom:8px;letter-spacing:.4px;}' +
      '.dark #__ct-tip-card .t{color:#F5F5F5;}' +
      '#__ct-tip-card .t.sub{margin-top:10px;font-size:12px;opacity:.92;}' +
      '#__ct-tip-card ul{margin:0;padding-left:14px;}' +
      '#__ct-tip-card li{margin:3px 0;opacity:.85;}' +
      // 规则卡底部「永久流量包」入口链接
      '#__ct-tip-card .ct-permanent-link{display:flex;align-items:center;flex-wrap:wrap;gap:2px 8px;' +
      'margin-top:12px;padding-top:10px;border-top:1px dashed rgba(156,163,175,0.4);' +
      'text-decoration:none;color:inherit;}' +
      '#__ct-tip-card .ct-permanent-link .l{font-weight:700;color:rgb(var(--ct-primary-rgb));}' +
      '#__ct-tip-card .ct-permanent-link .d{opacity:.75;flex:1;min-width:0;}' +
      '#__ct-tip-card .ct-permanent-link .arrow{color:rgb(var(--ct-primary-rgb));font-weight:700;' +
      'transition:transform .15s;}' +
      '#__ct-tip-card .ct-permanent-link:hover .arrow{transform:translateX(3px);}' +
      '#__ct-tip-card .ct-permanent-link:hover .l{text-decoration:underline;}' +
      // 页面（html）滚动条：覆盖主题写死的浅色样式（#eee 轨道），跟随明暗主题，
      // 暗色下为半透明白色细滑块，不再突兀（特异性 html::-webkit-scrollbar 高于主题全局规则）
      'html::-webkit-scrollbar{width:8px;height:8px;background-color:transparent;}' +
      'html::-webkit-scrollbar-track{background:transparent;}' +
      'html::-webkit-scrollbar-thumb{background-color:rgba(0,0,0,0.2);border-radius:4px;}' +
      'html::-webkit-scrollbar-thumb:hover{background-color:rgba(0,0,0,0.35);}' +
      'html.dark::-webkit-scrollbar-thumb{background-color:rgba(255,255,255,0.16);}' +
      'html.dark::-webkit-scrollbar-thumb:hover{background-color:rgba(255,255,255,0.28);}' +
      'html{scrollbar-color:rgba(0,0,0,0.2) transparent;}' +
      'html.dark{scrollbar-color:rgba(255,255,255,0.16) transparent;}' +
      // 公告横幅浅色模式：浅色版背景图 + 白色纱罩 + 深色文字（覆盖主题 has-bg-image 强制白字）
      'html:not(.dark) .announcement-banner.has-bg-image:before{background-color:rgba(255,255,255,0.35);}' +
      'html:not(.dark) .announcement-banner.has-bg-image .announcement-title{color:#333;}' +
      'html:not(.dark) .announcement-banner.has-bg-image .announcement-timestamp{color:#555;}' +
      'html:not(.dark) .announcement-banner.has-bg-image .announcement-icon-wrapper{color:#333;background-color:rgba(0,0,0,0.06);}' +
      'html:not(.dark) .announcement-banner.has-bg-image .announcement-action{color:#333;}' +
      // 客户端下载弹窗（玻璃卡片，跟随明暗主题）
      '#__ct-dl-mask{position:fixed;inset:0;background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);' +
      '-webkit-backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;}' +
      '#__ct-dl-card{width:100%;max-width:420px;max-height:80vh;overflow:auto;border-radius:20px;' +
      'padding:1.25rem 1.5rem;background:rgba(255,255,255,0.95);border:1px solid rgba(232,232,232,0.65);' +
      'color:#404040;box-shadow:0 20px 60px rgba(0,0,0,0.25);font-family:inherit;}' +
      '.dark #__ct-dl-card{background:rgba(26,26,26,0.96);border-color:rgba(64,64,64,0.9);color:#D4D4D4;' +
      'box-shadow:0 20px 60px rgba(0,0,0,0.5);}' +
      '#__ct-dl-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;}' +
      '#__ct-dl-head .t{font-size:15px;font-weight:700;color:#333;}' +
      '.dark #__ct-dl-head .t{color:#F5F5F5;}' +
      '#__ct-dl-close{border:none;background:transparent;font-size:16px;cursor:pointer;opacity:.6;' +
      'color:inherit;padding:4px 8px;border-radius:8px;transition:opacity .15s;font-family:inherit;}' +
      '#__ct-dl-close:hover{opacity:1;}' +
      '#__ct-dl-note{font-size:11px;opacity:.6;margin-bottom:4px;}' +
      '.__ct-dl-item{display:flex;align-items:center;gap:10px;padding:10px 0;' +
      'border-top:1px dashed rgba(156,163,175,0.3);}' +
      '.__ct-dl-item .info{flex:1;min-width:0;}' +
      '.__ct-dl-item .n{font-size:13px;font-weight:700;color:#333;}' +
      '.dark .__ct-dl-item .n{color:#F5F5F5;}' +
      '.__ct-dl-item .d{font-size:11px;opacity:.65;}' +
      '.__ct-dl-item a{flex-shrink:0;padding:5px 14px;border-radius:999px;font-size:12px;font-weight:700;' +
      'text-decoration:none;border:1px solid rgba(128,128,128,0.45);color:inherit;transition:background .15s;}' +
      '.__ct-dl-item a:hover{background:rgba(128,128,128,0.12);}' +
      '@keyframes __ct-bump{0%{transform:scale(1)}40%{transform:scale(1.16)}100%{transform:scale(1)}}' +
      '.__ct-bump{display:inline-block;animation:__ct-bump .22s ease;}' +
      '@keyframes __ct-pop{0%{transform:scale(0.94);opacity:.6}100%{transform:scale(1);opacity:1}}' +
      '.__ct-pop{animation:__ct-pop .18s ease;}';
    document.head.appendChild(style);
  }

  /* ------------------------- 5. 构建滑块 UI ------------------------- */

  function bump(el) {
    if (!el) return;
    el.classList.remove('__ct-bump');
    void el.offsetWidth;
    el.classList.add('__ct-bump');
  }

  // 默认流量：定位在第二档（tier2_gb），clamp 到 [min,max]
  function getDefaultGb() {
    var min = Number(CFG.min_gb), max = Number(CFG.max_gb);
    var gb = Number(CFG.tier2_gb);
    if (!isFinite(gb)) gb = min;
    return Math.min(Math.max(gb, min), max);
  }

  // 每月价格是否达到第二档（≥ tier2_price 才允许月付）
  function canPayMonthly() {
    return calcMonthlyPrice(window.__ctTrafficGb || getDefaultGb()) >= Number(CFG.tier2_price);
  }

  // 更新周期 chips 的选中态与月付 chip 的显隐（收起/展开由 CSS 过渡完成）
  function refreshChips() {
    var can = canPayMonthly();
    if (!can && window.__ctPeriod === 'monthly') window.__ctPeriod = 'quarterly';
    var all = document.querySelectorAll('.__ct-chip');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      el.className = '__ct-chip' +
        (el.dataset.period === window.__ctPeriod ? ' active' : '') +
        (el.dataset.period === 'monthly' && !can ? ' __ct-hidden' : '');
    }
  }

  // 更新滑块进度填充
  function updateSliderFill() {
    var slider = document.getElementById(SLIDER_ID);
    if (!slider) return;
    var gb = window.__ctTrafficGb || getDefaultGb();
    var pct = ((gb - Number(CFG.min_gb)) / (Number(CFG.max_gb) - Number(CFG.min_gb))) * 100;
    if (!isFinite(pct)) pct = 0;
    slider.style.background =
      'linear-gradient(90deg, rgb(var(--ct-primary-rgb)) ' + pct + '%, ' +
      'rgba(var(--ct-primary-rgb),0.15) ' + pct + '%)';
  }

  // 统一入口：clamp 后同步 滑块/步进器/进度/周期chips/价格
  function setTraffic(gb) {
    gb = Math.round(Number(gb));
    if (!isFinite(gb)) gb = getDefaultGb();
    gb = Math.min(Math.max(gb, Number(CFG.min_gb)), Number(CFG.max_gb));
    window.__ctTrafficGb = gb;
    var slider = document.getElementById(SLIDER_ID);
    var num = document.getElementById('__ct-num');
    if (slider) slider.value = gb;
    if (num && String(num.value) !== String(gb)) num.value = gb;
    updateSliderFill();
    updateStepper();
    if (num) bump(num);
    refreshChips();
    updateRenewHint();
    popPrice();
    refreshPrice();
  }

  // 同步步进器：−/＋ 按钮在边界时禁用；数字回显（输入框聚焦时不回写，避免打断输入）
  function updateStepper() {
    var gb = window.__ctTrafficGb || getDefaultGb();
    var num = document.getElementById('__ct-num');
    var minus = document.getElementById('__ct-step-minus');
    var plus = document.getElementById('__ct-step-plus');
    if (num && document.activeElement !== num && String(num.value) !== String(gb)) num.value = gb;
    if (minus) minus.disabled = gb <= Number(CFG.min_gb);
    if (plus) plus.disabled = gb >= Number(CFG.max_gb);
  }

  // 主按钮动态文案：同套餐且订阅活跃 + 滑块等于当前订阅流量 → 「立即续费」
  function updateBuyBtnLabel() {
    var btn = document.getElementById('__ct-buy-btn');
    if (!btn) return;
    var isRenew = window.__ctLastContext === 'renew' &&
      window.__ctTrafficGb && window.__ctSubGb &&
      Number(window.__ctTrafficGb) === Number(window.__ctSubGb);
    btn.textContent = isRenew ? '立即续费' : '立即购买';
  }

  // 进入购买页永久自动对齐：同套餐续费场景（context=renew）下，等订阅流量
  // 数据就绪后把滑块直接落在当前订阅流量（立即续费位置），每次进入都对齐
  function maybeAutoAlignToRenew() {
    if (window.__ctAutoAligned) return;
    if (!document.getElementById(UI_BLOCK_ID)) return;
    if (window.__ctLastContext !== 'renew' || !window.__ctSubGb) return;
    window.__ctAutoAligned = true;
    setTraffic(window.__ctSubGb);
  }

  // 续费天数提示（三态，context 由 /custom-traffic/last 返回）：
  //  renew：与上次购买流量一致 → 叠加；不同 → 重置
  //  plan_change：当前订阅其他套餐 → 换套餐（折抵+天数重起算），与流量无关
  //  expired：订阅已过期 → 从购买时重新起算
  function updateRenewHint() {
    updateBuyBtnLabel();
    maybeAutoAlignToRenew();
    // 数据缺失或超过 60 秒自动重拉，自愈任何残留旧数据（如支付完成后返回购买页）
    if (!isFreshCache(window.__ctLastCache, getToken())) {
      loadLastPurchase();
      return;
    }
    window.__ctLastContext = window.__ctLastCache.data.context;
    window.__ctLastGb = window.__ctLastCache.data.gb;
    var el = document.getElementById('__ct-renew-hint');
    if (!el) return;
    var ctx = window.__ctLastContext;
    if (ctx === 'plan_change') {
      el.className = 'warn';
      // 折抵与否跟随后台「更换订阅折抵」开关（surplus_enable），与核心 setOrderType 一致
      el.textContent = CFG.surplus_enable
        ? '你当前订阅的是其他套餐，本次购买将更换套餐：剩余价值自动折抵，时长从购买时重新起算，不叠加天数'
        : '你当前订阅的是其他套餐，本次购买将更换套餐：时长从购买时重新起算，不叠加天数';
      el.style.display = 'block';
      return;
    }
    if (ctx === 'expired') {
      el.className = 'warn';
      el.textContent = '当前订阅已过期，本次购买时长从购买时重新起算';
      el.style.display = 'block';
      return;
    }
    var gb = window.__ctTrafficGb;
    var last = window.__ctLastGb;
    if (!gb || last === null || last === undefined) {
      el.style.display = 'none';
      return;
    }
    if (Number(gb) === Number(last)) {
      el.className = 'ok';
      el.textContent = '与上次购买的流量一致（' + last + 'G），续费将叠加天数';
    } else {
      el.className = 'warn';
      el.textContent = '与上次购买的流量不同（上次 ' + last + 'G），续费将重置天数，从本次购买日起重新计算';
    }
    el.style.display = 'block';
  }

  // 拉取最近一次已完成的购买（续费提示用），带上当前浏览的套餐 id 供后端判断场景
  function loadLastPurchase() {
    var token = getToken();
    if (!token) return;
    var url = apiBase + '/custom-traffic/last';
    var planId = getPlanIdFromHash();
    if (planId !== null) url += '?plan_id=' + planId;
    fetch(url, { cache: 'no-store', headers: { 'Authorization': token } })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        var d = json && json.data;
        var ctx = (d && d.context) || null;
        var gb = (d && typeof d.traffic_gb !== 'undefined' && d.traffic_gb !== null)
          ? Number(d.traffic_gb) : null;
        window.__ctLastCache = { token: token, at: Date.now(), data: { context: ctx, gb: gb } };
        updateRenewHint();
      })
      .catch(function () {
        window.__ctLastCache = { token: token, at: Date.now(), data: { context: null, gb: null } };
        updateRenewHint();
      });
  }

  /* ---------------- 5.5 重置包顺延提示（普通套餐购买页） ---------------- */

  var RESET_HINT_ID = '__ct-reset-hint';
  var RESET_KEYWORDS = ['流量重置包', '重置流量'];

  // 订阅缓存按登录 token 区分：同一浏览器 SPA 内切换账号后绝不复用上一账号数据
  function isFreshCache(cache, token) {
    return cache && cache.token === token && Date.now() - cache.at < 60000;
  }

  // 在「选择付款周期」卡片里找重置包选项（关键词与 PERIOD_KEY_MAP 保持一致）
  function findResetPeriodItem() {
    var card = findCardByTitle('选择付款周期') || findCardContaining('选择付款周期');
    if (!card) return null;
    var items = card.querySelectorAll('.period-item');
    for (var i = 0; i < items.length; i++) {
      var text = (items[i].textContent || '').trim();
      for (var j = 0; j < RESET_KEYWORDS.length; j++) {
        if (text.indexOf(RESET_KEYWORDS[j]) !== -1) return items[i];
      }
    }
    return null;
  }

  // 顺延规则文案；有下次重置时间时追加个人化倒计时
  function resetRuleText(nextResetAt) {
    var base = '购买重置包将立即重置流量，并将下次自动重置顺延一个月';
    var ts = Number(nextResetAt);
    if (!isFinite(ts) || ts <= 0) return base;
    if (ts > 1e12) ts = Math.round(ts / 1000); // 兼容毫秒时间戳
    var days = Math.max(0, Math.ceil((ts * 1000 - Date.now()) / 86400000));
    var dt = new Date(ts * 1000);
    return '下次自动重置：' + (dt.getMonth() + 1) + '月' + dt.getDate() + '日（还有 ' + days + ' 天）。' + base;
  }

  // 拉取订阅信息（60s 缓存，按 token 区分）回填提示文案；未登录时保持通用规则文案
  function loadResetInfo() {
    var el = document.getElementById(RESET_HINT_ID);
    if (!el) return;
    var token = getToken();
    if (!token) return;
    var cache = window.__ctResetCache;
    if (isFreshCache(cache, token)) {
      el.textContent = resetRuleText(cache.next);
      return;
    }
    fetch(apiBase + '/user/getSubscribe', { cache: 'no-store', headers: { 'Authorization': token } })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        var d = json && json.data;
        window.__ctResetCache = { token: token, at: Date.now(), next: d ? d.next_reset_at : null };
        var el2 = document.getElementById(RESET_HINT_ID);
        if (el2) el2.textContent = resetRuleText(d ? d.next_reset_at : null);
      })
      .catch(function () { /* 保持通用文案 */ });
  }

  // 普通套餐购买页：周期卡含重置包选项时注入顺延规则提示
  // （自定义流量套餐的周期卡被隐藏、插件下单也不支持重置包，跳过）
  function ensureResetPackHint(customActive) {
    var existing = document.getElementById(RESET_HINT_ID);
    var planId = getPlanIdFromHash();
    var item = (CFG.enable && !customActive && CFG.reset_shift_enable &&
      planId !== null && isOnPlanDetailPage()) ? findResetPeriodItem() : null;
    if (!item) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;
    var hint = document.createElement('div');
    hint.id = RESET_HINT_ID;
    hint.textContent = resetRuleText(null);
    var card = item.closest('.n-card') || item.parentElement;
    (card || document.body).appendChild(hint);
    loadResetInfo();
  }

  /* ---------------- 5.7 自定义套餐的流量重置包入口 ---------------- */

  // 当前订阅本套餐的用户才显示入口；重置包价格随当前流量
  function applyResetPackInfo(d, planId) {
    var resetRow = document.getElementById('__ct-reset-row');
    if (!resetRow) return;
    var samePlan = d && d.plan_id && Number(d.plan_id) === Number(planId);
    var gb = samePlan ? Math.floor((Number(d.transfer_enable) || 0) / 1073741824) : 0;
    window.__ctSubGb = gb >= 1 ? gb : null;
    var visible = gb >= 1;
    resetRow.style.display = visible ? 'flex' : 'none';
    if (!visible) return;
    var price = calcMonthlyPrice(gb);
    var priceEl = document.getElementById('__ct-reset-price');
    if (priceEl) priceEl.textContent = '¥' + fmtMoney(price);
    updateBuyBtnLabel();
    maybeAutoAlignToRenew();
  }

  // 拉取当前订阅（60s 缓存，按 token 区分）回填重置包入口；未登录/非本套餐用户保持隐藏
  function loadResetPackInfo() {
    var planId = getPlanIdFromHash();
    var row = document.getElementById('__ct-reset-row');
    if (!row || planId === null) return;
    var token = getToken();
    if (!token) return;
    var cache = window.__ctSubCache;
    if (isFreshCache(cache, token)) {
      applyResetPackInfo(cache.data, planId);
      return;
    }
    fetch(apiBase + '/user/getSubscribe', { cache: 'no-store', headers: { 'Authorization': token } })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        var d = json && json.data;
        window.__ctSubCache = { token: token, at: Date.now(), data: d };
        applyResetPackInfo(d, planId);
      })
      .catch(function () { /* 保持隐藏 */ });
  }

  function buildUIBlock() {
    var block = document.createElement('div');
    block.id = UI_BLOCK_ID;
    // 每次重建 UI 时重置守卫：进入购买页自动对齐一次（每次进入都对齐）
    window.__ctAutoAligned = false;

    var head = document.createElement('div');
    head.id = '__ct-head';
    head.innerHTML = '<span class="t">自定义流量</span><span class="range">' +
      CFG.min_gb + '~' + CFG.max_gb + ' GB</span>';
    block.appendChild(head);

    var sliderRow = document.createElement('div');
    sliderRow.id = '__ct-slider-row';

    var initialGb = getDefaultGb();

    var slider = document.createElement('input');
    slider.type = 'range';
    slider.id = SLIDER_ID;
    slider.min = CFG.min_gb;
    slider.max = CFG.max_gb;
    slider.step = 1;
    slider.value = initialGb;

    var stepper = document.createElement('div');
    stepper.id = '__ct-stepper';
    var stepMinus = document.createElement('button');
    stepMinus.type = 'button';
    stepMinus.id = '__ct-step-minus';
    stepMinus.className = '__ct-step';
    stepMinus.textContent = '−';
    stepMinus.setAttribute('aria-label', '减少流量');
    var numInput = document.createElement('input');
    numInput.type = 'text';
    numInput.id = '__ct-num';
    numInput.inputMode = 'numeric';
    numInput.value = initialGb;
    numInput.maxLength = 4;
    numInput.setAttribute('aria-label', '流量数值');
    var unit = document.createElement('span');
    unit.id = '__ct-unit';
    unit.textContent = 'GB';
    var stepPlus = document.createElement('button');
    stepPlus.type = 'button';
    stepPlus.id = '__ct-step-plus';
    stepPlus.className = '__ct-step';
    stepPlus.textContent = '+';
    stepPlus.setAttribute('aria-label', '增加流量');
    stepper.appendChild(stepMinus);
    stepper.appendChild(numInput);
    stepper.appendChild(unit);
    stepper.appendChild(stepPlus);

    sliderRow.appendChild(slider);
    sliderRow.appendChild(stepper);
    block.appendChild(sliderRow);

    var periodRow = document.createElement('div');
    periodRow.id = '__ct-period-row';
    periodRow.innerHTML = '<span class="hint">购买周期</span>';
    var periodChips = document.createElement('div');
    periodChips.id = '__ct-period-chips';
    PERIOD_OPTIONS.forEach(function (p) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = '__ct-chip' + (p.key === window.__ctPeriod ? ' active' : '');
      chip.dataset.period = p.key;
      chip.textContent = p.label;
      chip.addEventListener('click', function () {
        window.__ctPeriod = p.key;
        refreshChips();
        popPrice();
        refreshPrice();
      });
      periodChips.appendChild(chip);
    });
    periodRow.appendChild(periodChips);
    block.appendChild(periodRow);

    var priceBox = document.createElement('div');
    priceBox.id = '__ct-price-box';
    priceBox.innerHTML =
      '<div><div class="lbl">每月</div><div class="num" id="__ct-monthly">¥' + fmtMoney(CFG.tier1_price) +
      '</div></div>' +
      '<div class="right"><div class="lbl" id="__ct-period-name">本期</div><div class="num" id="__ct-total">¥' +
      fmtMoney(CFG.tier1_price) + '</div></div>';
    block.appendChild(priceBox);

    var buyBtn = document.createElement('button');
    buyBtn.type = 'button';
    buyBtn.id = '__ct-buy-btn';
    buyBtn.textContent = '立即购买';
    buyBtn.addEventListener('click', placeOrder);
    block.appendChild(buyBtn);

    // 流量重置包入口：仅当前订阅本套餐的用户显示，价格=当前流量的阶梯月价（loadResetPackInfo 回填）
    var resetRow = document.createElement('div');
    resetRow.id = '__ct-reset-row';
    resetRow.className = '__ct-sub-row';
    resetRow.innerHTML = '<div class="__ct-sub-info">' +
      '<div class="lbl">流量重置包</div>' +
      '<div class="desc">立即重置流量，下次自动重置顺延一个月</div>' +
      '<div class="price" id="__ct-reset-price">¥--</div>' +
      '</div>';
    var resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.id = '__ct-reset-buy';
    resetBtn.className = '__ct-sub-buy';
    resetBtn.textContent = '购买';
    resetBtn.addEventListener('click', placeResetOrder);
    resetRow.appendChild(resetBtn);
    block.appendChild(resetRow);

    var renewHint = document.createElement('div');
    renewHint.id = '__ct-renew-hint';
    block.appendChild(renewHint);

    var msg = document.createElement('div');
    msg.id = '__ct-msg';
    block.appendChild(msg);

    slider.addEventListener('input', function () {
      window.__ctDragging = true; // 拖动中价格即时回写，不做动画
      // 保险：change 未触发时（拖动中页面失焦等）150ms 无输入自动复位
      clearTimeout(window.__ctDragTimer);
      window.__ctDragTimer = setTimeout(function () { window.__ctDragging = false; }, 150);
      setTraffic(slider.value);
    });
    slider.addEventListener('change', function () {
      // 松手：做一次平滑收尾动画
      window.__ctDragging = false;
      popPrice();
      refreshPrice();
    });

    // 步进器：±5GB 微调；数字输入中即时预览（不打断打字），失焦/回车 clamp 回写
    stepMinus.addEventListener('click', function () {
      setTraffic((window.__ctTrafficGb || getDefaultGb()) - 5);
    });
    stepPlus.addEventListener('click', function () {
      setTraffic((window.__ctTrafficGb || getDefaultGb()) + 5);
    });
    numInput.addEventListener('focus', function () {
      // 聚焦自动全选：直接打字即可整体替换，无需手动删除
      numInput.select();
    });
    numInput.addEventListener('input', function () {
      window.__ctDragging = true; // 输入中即时回写，不做动画
      var v = numInput.value.replace(/[^\d]/g, '');
      if (v !== numInput.value) numInput.value = v;
      if (v === '') return;
      var gb = parseInt(v, 10);
      if (!isFinite(gb)) return;
      var clamped = Math.min(Math.max(gb, Number(CFG.min_gb)), Number(CFG.max_gb));
      window.__ctTrafficGb = clamped;
      if (slider.value !== String(clamped)) slider.value = clamped;
      updateSliderFill();
      updateStepper();
      refreshChips();
      updateRenewHint();
      popPrice();
      refreshPrice();
    });
    numInput.addEventListener('change', function () {
      window.__ctDragging = false; // 失焦/回车：平滑收尾
      setTraffic(numInput.value || getDefaultGb());
    });

    return block;
  }

  // 计价与续费规则卡（独立容器，挂载到右栏顶部）——文案写死，不随配置动态生成
  function buildTipCard() {
    var card = document.createElement('div');
    card.id = TIP_BLOCK_ID;
    card.innerHTML =
      '<div class="t">计价与续费规则</div><ul>' +
      '<li>阶梯价：25G ¥10 → 80G ¥25 → 120G ¥36，超出 ¥0.3/G</li>' +
      '<li>周期倍数：月付×1、季付×3、半年付×6、年付×12</li>' +
      '<li>月价低于 ¥25 仅季付起购</li>' +
      '<li>续费：流量与上次一致叠加天数，不同则重置天数</li>' +
      '<li>换套餐或过期重购：时长重新起算</li>' +
      '</ul>' +
      '<div class="t sub">流量重置规则</div><ul>' +
      '<li>每月自动重置（重置日 = 订阅生效日）</li>' +
      '<li>重置包：按当前流量月价，立即重置 + 下次重置顺延一个月</li>' +
      '</ul>' +
      // 永久流量包入口：真实超链接跳转 #/plan/1（固定 50G ¥45 一次性不过期套餐）
      '<a class="ct-permanent-link" href="#/plan/1">' +
      '<span class="l">永久流量包</span>' +
      '<span class="d">50G ¥45 · 一次性 · 不过期</span>' +
      '<span class="arrow">→</span>' +
      '</a>';
    return card;
  }

  // 将规则卡挂到右栏顶部；右栏不存在时回退到滑块卡下方
  function mountTipCard(block) {
    var tipCard = document.getElementById(TIP_BLOCK_ID);
    if (tipCard) return tipCard;
    tipCard = buildTipCard();
    var rightCol = document.querySelector('[data-v-21a6dca5] .lg\\:col-span-2');
    if (rightCol) {
      rightCol.insertBefore(tipCard, rightCol.firstChild);
    } else if (block && block.parentElement) {
      tipCard.style.marginTop = '14px';
      block.parentElement.insertBefore(tipCard, block.nextSibling);
    }
    return tipCard;
  }

  function popPrice() {
    if (window.__ctDragging) return; // 拖动中不重放弹跳动画，避免闪烁
    var box = document.getElementById('__ct-price-box');
    if (!box) return;
    box.classList.remove('__ct-pop');
    void box.offsetWidth;
    box.classList.add('__ct-pop');
  }

  // 金额数字丝滑过渡；cents 非数字时安全回退，绝不显示 ¥NaN
  function setMoney(id, cents) {
    var el = document.getElementById(id);
    if (!el) return;
    cents = parseInt(cents, 10);
    if (isNaN(cents)) cents = 0;
    var m = (el.textContent || '').match(/[\d.]+/);
    var from = (m && isFinite(parseFloat(m[0]))) ? Math.round(parseFloat(m[0]) * 100) : null;
    // 拖动中直接回写目标值（取消未完成动画），松手后再走一次平滑过渡
    if (window.__ctDragging || from === null || from === cents) {
      if (el.__ctAnim) { cancelAnimationFrame(el.__ctAnim); el.__ctAnim = null; }
      el.textContent = '¥' + fmtMoney(cents);
      return;
    }
    if (el.__ctAnim) cancelAnimationFrame(el.__ctAnim);
    var start = null;
    var dur = 220;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = '¥' + ((from + (cents - from) * eased) / 100).toFixed(2);
      if (p < 1) el.__ctAnim = requestAnimationFrame(step);
      else el.__ctAnim = null;
    }
    el.__ctAnim = requestAnimationFrame(step);
  }

  function showMsg(text, type) {
    var el = document.getElementById('__ct-msg');
    if (!el) return;
    el.textContent = text;
    el.className = type || '';
    el.style.display = 'block';
    clearTimeout(showMsg._t);
    showMsg._t = setTimeout(function () { el.style.display = 'none'; }, 4000);
  }

  /* ------------------------- 6. 立即购买 ------------------------- */

  function placeOrder() {
    var btn = document.getElementById('__ct-buy-btn');
    var gb = window.__ctTrafficGb;
    var planId = getPlanIdFromHash();
    var period = getCurrentPeriodKey() || 'monthly';
    if (!gb || !planId) {
      showMsg('请先选择流量与周期', 'err');
      return;
    }
    // 兜底校验：每月低于第二档价格不允许月付（正常路径下月付 chip 已隐藏）
    if (period === 'monthly' && !canPayMonthly()) {
      showMsg('每月低于 ¥' + fmtMoney(CFG.tier2_price) + ' 仅支持季付起购', 'err');
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = '创建订单中…'; }
    var token = getToken();
    fetch(apiBase + '/custom-traffic/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': token },
      body: JSON.stringify({ plan_id: planId, period: period, traffic_gb: gb })
    })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (!json || (json.code !== 200 && json.status !== 'success')) {
          throw new Error((json && json.message) || '下单失败');
        }
        // 兼容 data 为字符串(trade_no) 或对象 {trade_no}
        var tradeNo = json.data && (json.data.trade_no || json.data);
        if (!tradeNo) throw new Error('下单响应异常');
        location.hash = '#/order/' + tradeNo;
      })
      .catch(function (err) {
        showMsg((err && err.message) ? err.message : '下单失败，请重试', 'err');
        if (btn) { btn.disabled = false; updateBuyBtnLabel(); }
      });
  }

  // 流量重置包下单：period=reset_traffic，价格由后端按用户当前流量月价计算
  function placeResetOrder() {
    var btn = document.getElementById('__ct-reset-buy');
    var planId = getPlanIdFromHash();
    if (!planId) {
      showMsg('请先选择套餐', 'err');
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = '创建订单中…'; }
    var token = getToken();
    fetch(apiBase + '/custom-traffic/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': token },
      body: JSON.stringify({ plan_id: planId, period: 'reset_traffic' })
    })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (!json || (json.code !== 200 && json.status !== 'success')) {
          throw new Error((json && json.message) || '下单失败');
        }
        var tradeNo = json.data && (json.data.trade_no || json.data);
        if (!tradeNo) throw new Error('下单响应异常');
        location.hash = '#/order/' + tradeNo;
      })
      .catch(function (err) {
        showMsg((err && err.message) ? err.message : '下单失败，请重试', 'err');
        if (btn) { btn.disabled = false; btn.textContent = '购买'; }
      });
  }

  /* ------------------------- 7. 实时算价（本地） ------------------------- */

  function refreshPrice() {
    var gb = window.__ctTrafficGb;
    if (!gb) return;
    var period = getCurrentPeriodKey() || 'monthly';
    var monthly = calcMonthlyPrice(gb);
    var total = calcTotal(gb, period);
    if (isNaN(monthly) || isNaN(total)) return; // 异常时保持原值，避免 NaN 写入
    setMoney('__ct-monthly', monthly);
    setMoney('__ct-total', total);
    var periodEl = document.getElementById('__ct-period-name');
    if (periodEl) {
      var name = PERIOD_LABEL_MAP[period] || '';
      periodEl.textContent = name ? ('本期(' + name + ')') : '本期';
    }
  }

  /* ------------------------- 8. 注入与联动 ------------------------- */

  function ensureUI() {
    var planId = getPlanIdFromHash();
    var isDetail = isOnPlanDetailPage();
    var enabled = CFG.enable && isDetail && planId !== null && isPlanEnabled(planId);

    // 普通套餐购买页的重置包顺延提示（自定义流量套餐周期卡已隐藏则跳过）
    try { ensureResetPackHint(enabled); } catch (e) { /* ignore */ }

    if (!enabled) {
      restoreCards();
      var old = document.getElementById(UI_BLOCK_ID);
      if (old) { window.__ctTrafficGb = null; old.remove(); }
      var oldTip = document.getElementById(TIP_BLOCK_ID);
      if (oldTip) oldTip.remove();
      return;
    }

    hidePeriodCard();
    hideOrderCard();
    if (document.getElementById(UI_BLOCK_ID)) return;

    var block = buildUIBlock();
    var periodCard = findCardByTitle('选择付款周期');
    var mounted = false;

    if (periodCard && periodCard.parentElement) {
      periodCard.parentElement.insertBefore(block, periodCard);
      mounted = true;
    } else {
      var leftCol = document.querySelector('.lg\\:col-span-3.space-y-6');
      if (leftCol) { leftCol.appendChild(block); mounted = true; }
    }

    if (!mounted) { block.remove(); return; }

    // 规则卡挂到右栏顶部（右栏不存在时回退到滑块卡下方）
    mountTipCard(block);

    // 挂载到文档后再统一初始化（挂载前 document 查询不到 UI 元素，
    // 滑块进度/步进器/chips/价格等首次状态在这里同步）
    // 必须先落默认值，再拉订阅数据——否则缓存命中时自动对齐会被默认值覆盖
    setTraffic(getDefaultGb());

    // 自定义套餐的重置包入口：仅当前订阅本套餐的用户显示（价格=当前流量月价）
    try { loadResetPackInfo(); } catch (e) { /* ignore */ }
    // 每次进入购买页都拉取最新"上次购买"记录（SPA 内导航不刷新页面，
    // 支付完成后返回购买页需重新拉取，否则提示停留在旧数据）
    loadLastPurchase();
  }

  /* ------------------------- 9. 拦截下单请求（兜底） ------------------------- */

  var REGISTER_TOKEN_KEY = 'plan_token';

  function getPendingRegisterToken() {
    try {
      return new URLSearchParams((location.hash || '').split('?')[1] || '').get(REGISTER_TOKEN_KEY) || '';
    } catch (e) { return ''; }
  }

  function patchXHR() {
    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;
    var origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    var origResponseTextGetter = null;
    try {
      origResponseTextGetter = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseText').get;
    } catch (e) { /* ignore */ }

    // 订单详情响应改写：把 plan[period] 改写为订单真实总额（total+balance+surplus-refund+discount），
    // 并把 plan.transfer_enable 改写为自定义流量。这样即使浏览器仍缓存旧版主题 chunk
    // （旧 chunk 读 plan[period] 算价），结账页金额也能显示正确。
    function patchDetailResponse(xhr, url) {
      if (!origResponseTextGetter || !url || url.indexOf('/user/order/detail') === -1) return;
      if (xhr.__ctDetailPatched) return;
      xhr.__ctDetailPatched = true;
      var cached = null;
      try {
        Object.defineProperty(xhr, 'responseText', {
          configurable: true,
          get: function () {
            if (this.readyState !== 4) return origResponseTextGetter.call(this);
            if (cached !== null) return cached;
            var raw = origResponseTextGetter.call(this);
            cached = raw;
            try {
              var json = JSON.parse(raw);
              var d = json && json.data;
              if (d && typeof d.total_amount !== 'undefined' && d.plan && d.period) {
                var gross = (Number(d.total_amount) || 0) + (Number(d.balance_amount) || 0) +
                  (Number(d.surplus_amount) || 0) - (Number(d.refund_amount) || 0) +
                  (Number(d.discount_amount) || 0);
                d.plan[d.period] = gross;
                if (d.custom_traffic_gb) d.plan.transfer_enable = d.custom_traffic_gb;
                cached = JSON.stringify(json);
              }
            } catch (e2) { /* 保持原响应 */ }
            return cached;
          }
        });
      } catch (e3) { /* ignore */ }
    }

    XMLHttpRequest.prototype.open = function (method, url) {
      this.__ctMeta = { method: method, url: url };
      patchDetailResponse(this, url);
      return origOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
      (this.__ctHeaders = this.__ctHeaders || {})[k] = v;
      return origSetHeader.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
      var meta = this.__ctMeta || {};
      var url = meta.url || '';
      var gb = window.__ctTrafficGb;
      var pendingToken = getPendingRegisterToken();

      // 注册页把独立购买选择透传给核心注册接口；订单由 user.register.after 钩子创建。
      if (pendingToken && url.indexOf('/passport/auth/register') !== -1) {
        try {
          var registerPayload = body ? JSON.parse(body) : {};
          registerPayload.plan_token = pendingToken;
          body = JSON.stringify(registerPayload);
          this.addEventListener('load', function () {
            try {
              var response = JSON.parse(this.responseText || '{}');
              if (response.status !== 'success' || !response.data || !response.data.auth_data) return;
              fetch('/api/v1/custom-traffic/auto-order', { headers: { Authorization: response.data.auth_data } })
                .then(function (r) { return r.json(); })
                .then(function (result) {
                  if (result.status === 'success' && result.data) {
                    location.hash = '#/order/' + encodeURIComponent(result.data);
                  }
                });
            } catch (e) { /* 注册成功但订单查询失败时保留主题默认跳转 */ }
          });
        } catch (e) { /* 保留原始注册请求 */ }
      }

      if (gb && url.indexOf('/user/order/save') !== -1) {
        try {
          var payload = {};
          if (body) payload = JSON.parse(body);
          payload.traffic_gb = gb;
          if (!payload.period) payload.period = window.__ctPeriod || 'monthly';
          var newUrl = url.replace('/user/order/save', '/custom-traffic/order');
          origOpen.call(this, meta.method || 'POST', newUrl, true);
          if (this.__ctHeaders) {
            Object.keys(this.__ctHeaders).forEach(function (k) {
              origSetHeader.call(this, k, this.__ctHeaders[k]);
            }.bind(this));
          }
          body = JSON.stringify(payload);
        } catch (e) { /* 走原始下单 */ }
      }
      return origSend.call(this, body);
    };
  }

  /* ------------------------- 10.5 站点 Logo（跟随主题主色） ------------------------- */

  var SITE_LOGO_SVG =
    '<svg viewBox="0 0 256 256" width="30" height="30" fill="none">' +
    '<rect width="256" height="256" fill="none"></rect>' +
    '<line x1="208" y1="128" x2="128" y2="208" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"></line>' +
    '<line x1="192" y1="40" x2="40" y2="192" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"></line>' +
    '</svg>';

  function injectSiteLogo() {
    try {
      var titles = document.querySelectorAll('h2.title-text');
      for (var i = 0; i < titles.length; i++) {
        var title = titles[i];
        var prev = title.previousElementSibling;
        if (prev && prev.getAttribute && prev.getAttribute('data-ct-logo')) continue;
        var holder = document.createElement('span');
        holder.innerHTML = SITE_LOGO_SVG;
        var svg = holder.firstElementChild;
        if (!svg) continue;
        svg.setAttribute('data-ct-logo', '1');
        svg.setAttribute('class', 'color-primary flex-shrink-0');
        // 绝对定位到左侧菜单列（与下方菜单项 padding-left 1rem 对齐），标题保持居中
        svg.style.position = 'absolute';
        svg.style.left = '1rem';
        svg.style.top = '50%';
        svg.style.transform = 'translateY(-50%)';
        svg.style.display = 'flex';
        svg.style.alignItems = 'center';
        title.parentNode.insertBefore(svg, title);
        // 标题紧贴 Logo 左侧菜单列（16px 边距 + 30px Logo + 8px 间距）
        title.style.position = 'absolute';
        title.style.left = 'calc(1rem + 38px)';
        title.style.top = '50%';
        title.style.transform = 'translateY(-50%)';
        title.style.margin = '0';
      }
    } catch (e) { /* ignore */ }
  }

  /* ------------------------- 10.6 仪表盘「复制订阅」按钮 ------------------------- */

  var COPY_SUB_BTN_ID = '__ct-copy-sub-btn';
  var COPY_SUB_LABEL = '复制订阅';
  var COPY_SUB_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>' +
    '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
  // 主题各语言下「续费订阅」按钮文案（与 i18n 值精确匹配，避免误匹配其他按钮）
  var RENEW_KEYWORDS = ['续费订阅', '續訂', 'Renew Subscription', 'サブスクリプションを更新',
    '구독 갱신', 'Gia hạn đăng ký', 'تمدید اشتراک'];

  function isDashboardRoute() {
    var h = location.hash || '';
    return h === '' || h === '#' || h === '#/' || /^#\/dashboard(\?|$)/.test(h);
  }

  // 在「我的订阅」卡片按钮行里找续费按钮（多个匹配时取最后一个，即 outline 变体）
  function findDashboardRenewBtn() {
    var btns = document.querySelectorAll('button');
    var match = null;
    for (var i = 0; i < btns.length; i++) {
      var text = (btns[i].textContent || '').replace(/\s+/g, ' ').trim();
      for (var j = 0; j < RENEW_KEYWORDS.length; j++) {
        if (text === RENEW_KEYWORDS[j]) { match = btns[i]; break; }
      }
    }
    return match;
  }

  // 复制文本：优先 Clipboard API，失败回退 execCommand
  function copyText(text, cb) {
    var fallback = function () {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        cb(!!ok);
      } catch (e) { cb(false); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { cb(true); }, fallback);
    } else {
      fallback();
    }
  }

  // 复制订阅地址：每次点击都按当前登录用户重新拉取（绝不复用缓存，避免 SPA 内
  // 切换账号后复制到上一账号的地址）；顺手更新按 token 区分的共享缓存供其他功能复用
  function copySubscribe(btn) {
    var setLabel = function (text) {
      var content = btn && btn.querySelector('.n-button__content');
      if (!content || !document.body.contains(content)) return;
      content.textContent = text;
      clearTimeout(copySubscribe._t);
      copySubscribe._t = setTimeout(function () {
        if (content.textContent === '已复制' || content.textContent === '复制失败') {
          content.textContent = COPY_SUB_LABEL;
        }
      }, 1600);
    };
    var token = getToken();
    if (!token) { setLabel('复制失败'); return; }
    fetch(apiBase + '/user/getSubscribe', { cache: 'no-store', headers: { 'Authorization': token } })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        var d = json && json.data;
        window.__ctSubCache = { token: token, at: Date.now(), data: d };
        var u = d && d.subscribe_url;
        if (!u) { setLabel('复制失败'); return; }
        copyText(u, function (ok) { setLabel(ok ? '已复制' : '复制失败'); });
      })
      .catch(function () { setLabel('复制失败'); });
  }

  // 在续费订阅按钮旁注入「复制订阅」按钮（克隆其 class，视觉与主题 Naive UI 按钮一致）
  function ensureCopySubBtn() {
    var existing = document.getElementById(COPY_SUB_BTN_ID);
    if (!isDashboardRoute()) {
      if (existing) existing.remove();
      return;
    }
    var renewBtn = findDashboardRenewBtn();
    if (!renewBtn) {
      if (existing) existing.remove();
      return;
    }
    // SPA 局部更新后按钮仍在续费按钮正后方则跳过，否则重建
    if (existing && existing.parentElement === renewBtn.parentElement &&
      existing.previousElementSibling === renewBtn) return;
    if (existing) existing.remove();

    var btn = renewBtn.cloneNode(false); // 只克隆属性（class 含 flex-1），不克隆子节点/事件
    btn.id = COPY_SUB_BTN_ID;
    btn.type = 'button';
    btn.setAttribute('data-ct-copy-sub', '1');
    btn.setAttribute('aria-label', COPY_SUB_LABEL);
    btn.innerHTML = '<span class="n-button__icon">' + COPY_SUB_ICON + '</span>' +
      '<span class="n-button__content">' + COPY_SUB_LABEL + '</span>';
    btn.addEventListener('click', function () { copySubscribe(btn); });
    renewBtn.parentElement.insertBefore(btn, renewBtn.nextSibling);
  }

  /* ------------------------- 10.7 侧边栏「购买订阅」直跳 #/plan/9 ------------------------- */

  var BUY_MENU_LABEL = '购买订阅';

  // 取点击所在菜单项的标题：先查最近的 header，再回退到菜单项容器的直接子级 header，
  // 覆盖点击落在 .n-menu-item-content padding/图标区域时 closest 找不到 header 的情况
  function getMenuHeaderText(target) {
    var el = target && target.closest ? target.closest('.n-menu-item-content-header') : null;
    if (!el) {
      var item = target && target.closest ? target.closest('.n-menu-item-content') : null;
      if (item) {
        var kids = item.children;
        for (var i = 0; i < kids.length; i++) {
          if (kids[i].classList && kids[i].classList.contains('n-menu-item-content-header')) {
            el = kids[i];
            break;
          }
        }
      }
    }
    return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '';
  }

  // 拦截侧边栏菜单点击：capture 阶段 stopPropagation，Vue 菜单自身的路由跳转不会触发，
  // 「购买订阅」直接进入自定义流量套餐页（#/plan/9），跳过套餐列表页
  function patchMenuClick(e) {
    try {
      if (getMenuHeaderText(e.target) !== BUY_MENU_LABEL) return;
      e.preventDefault();
      e.stopPropagation();
      if ((location.hash || '') !== '#/plan/9') location.hash = '#/plan/9';
    } catch (err) { /* ignore */ }
  }

  // 兜底：任何途径落到套餐列表页 #/plan 都改道 #/plan/9（拦截漏网时保证不出现列表页）
  function redirectPlanListHash() {
    try {
      if ((location.hash || '') === '#/plan') location.hash = '#/plan/9';
    } catch (err) { /* ignore */ }
  }

  document.addEventListener('click', patchMenuClick, true);
  window.addEventListener('hashchange', redirectPlanListHash);

  /* ------------------------- 10.8 仪表盘捷径「下载客户端」 ------------------------- */

  // 各平台客户端下载入口（Windows 走本站直链，其余走官方 GitHub/官网/App Store）
  var CLIENT_LINKS = [
    { name: 'Windows', desc: 'KanataIM v1.2.1 · 本站直链', url: '/downloads/KanataIM-v1.2.1.zip', external: false },
    { name: 'Android', desc: 'FlClash · GitHub 官方', url: 'https://github.com/chen08209/FlClash/releases', external: true },
    { name: 'macOS', desc: 'Clash Verge Rev · GitHub 官方', url: 'https://github.com/clash-verge-rev/clash-verge-rev/releases', external: true },
    { name: 'iOS', desc: 'Shadowrocket · App Store', url: 'https://apps.apple.com/app/shadowrocket/id932747118', external: true },
    { name: 'iOS', desc: 'Stash · 官网', url: 'https://stash.wiki/', external: true },
    { name: 'iOS', desc: 'Loon · 官网', url: 'https://nsloon.app/', external: true }
  ];
  var PROBLEM_SHORTCUT_TITLE = '遇到问题';

  // 打开客户端下载弹窗（玻璃卡片，跟随明暗主题）
  function openClientDownload() {
    var mask = document.getElementById('__ct-dl-mask');
    if (mask) mask.remove();

    mask = document.createElement('div');
    mask.id = '__ct-dl-mask';
    mask.innerHTML =
      '<div id="__ct-dl-card" role="dialog" aria-label="客户端下载">' +
      '<div id="__ct-dl-head"><span class="t">客户端下载</span>' +
      '<button type="button" id="__ct-dl-close" aria-label="关闭">✕</button></div>' +
      '<div id="__ct-dl-note">iOS 客户端需海外 Apple ID 在 App Store 购买下载</div>' +
      '<div id="__ct-dl-list"></div></div>';

    var list = mask.querySelector('#__ct-dl-list');
    CLIENT_LINKS.forEach(function (c) {
      var item = document.createElement('div');
      item.className = '__ct-dl-item';
      item.innerHTML = '<div class="info"><div class="n">' + c.name + '</div>' +
        '<div class="d">' + c.desc + '</div></div>';
      var a = document.createElement('a');
      a.href = c.url;
      a.textContent = c.external ? '前往' : '下载';
      if (c.external) { a.target = '_blank'; a.rel = 'noopener'; }
      else { a.setAttribute('download', ''); }
      item.appendChild(a);
      list.appendChild(item);
    });

    mask.addEventListener('click', function (e) {
      if (e.target === mask || e.target.id === '__ct-dl-close') mask.remove();
    });
    document.body.appendChild(mask);
  }

  function onDlEsc(e) {
    if (e.key !== 'Escape') return;
    var mask = document.getElementById('__ct-dl-mask');
    if (mask) mask.remove();
    document.removeEventListener('keydown', onDlEsc);
  }

  // 把捷径卡里的「遇到问题」改成「下载客户端」（Vue 重渲染后会还原，靠 Observer 反复打补丁）
  function patchClientShortcut() {
    var items = document.querySelectorAll('.n-list-item');
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item.getAttribute('data-ct-client-dl')) continue;
      if ((item.textContent || '').replace(/\s+/g, ' ').trim().indexOf(PROBLEM_SHORTCUT_TITLE) === -1) continue;
      var els = item.querySelectorAll('div');
      var titleEl = null;
      for (var j = 0; j < els.length; j++) {
        if (els[j].childElementCount === 0 && (els[j].textContent || '').trim() === PROBLEM_SHORTCUT_TITLE) {
          titleEl = els[j];
          break;
        }
      }
      if (!titleEl) continue;
      titleEl.textContent = '下载客户端';
      var descEl = titleEl.nextElementSibling;
      if (descEl && descEl.tagName === 'DIV') descEl.textContent = 'Windows · Android · macOS · iOS';
      item.setAttribute('data-ct-client-dl', '1');
    }
  }

  // 拦截捷径点击：capture 阶段阻断 Vue 的工单跳转，改为打开下载弹窗
  function patchClientShortcutClick(e) {
    var item = e.target && e.target.closest ? e.target.closest('.n-list-item[data-ct-client-dl]') : null;
    if (!item) return;
    e.preventDefault();
    e.stopPropagation();
    document.addEventListener('keydown', onDlEsc);
    openClientDownload();
  }

  document.addEventListener('click', patchClientShortcutClick, true);

  /* ------------------------- 10.9 公告横幅双模式背景 ------------------------- */

  var NOTICE_BG_DARK = 'https://neko.kanata.im/notice/announcement-bg.svg?v=4';
  var NOTICE_BG_LIGHT = 'https://neko.kanata.im/notice/announcement-bg-light.svg?v=3';

  // 深浅模式各用一版图：深色=无月夜景，浅色=白昼同构图；Vue 重渲染会重置
  // inline style，靠 MutationObserver 反复应用
  function applyNoticeBgMode() {
    var isDark = document.documentElement.classList.contains('dark');
    var url = isDark ? NOTICE_BG_DARK : NOTICE_BG_LIGHT;
    var banners = document.querySelectorAll('.announcement-banner.has-bg-image');
    for (var i = 0; i < banners.length; i++) {
      // 从当前 inline style 提取 URL 再比较：Vue 回填的背景图格式可能带引号差异，
      // 避免比较永远不相等导致 observer 死循环
      var cur = banners[i].style.backgroundImage || '';
      var m = /url\(["']?([^"')]+)["']?\)/.exec(cur);
      if (!m || m[1] !== url) {
        banners[i].style.backgroundImage = 'url("' + url + '")';
      }
    }
  }

  /* ------------------------- 10. 监听与启动 ------------------------- */

  document.addEventListener('click', function (e) {
    var item = e.target && e.target.closest ? e.target.closest('[data-v-21a6dca5] .period-item') : null;
    if (item) setTimeout(refreshPrice, 150);
  }, true);

  var observer = new MutationObserver(function () {
    try { ensureUI(); } catch (e) { /* ignore */ }
    try { injectSiteLogo(); } catch (e) { /* ignore */ }
    try { ensureCopySubBtn(); } catch (e) { /* ignore */ }
    try { patchClientShortcut(); } catch (e) { /* ignore */ }
    try { applyNoticeBgMode(); } catch (e) { /* ignore */ }
  });
  // 额外监听 style 属性变更：公告横幅的背景图由 Vue 异步回填到 inline style
  // （属性变更不会触发 childList），漏掉会导致浅色模式回退成深色图
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });

  window.addEventListener('hashchange', function () {
    try { ensureUI(); } catch (e) { /* ignore */ }
    try { injectSiteLogo(); } catch (e) { /* ignore */ }
    try { ensureCopySubBtn(); } catch (e) { /* ignore */ }
    try { patchClientShortcut(); } catch (e) { /* ignore */ }
    try { applyNoticeBgMode(); } catch (e) { /* ignore */ }
    // 切换到购买页时刷新"上次购买"数据（支付后返回可能未触发 UI 重建）
    try {
      if (/(^|#\/)plan\//.test(location.hash || '')) loadLastPurchase();
    } catch (e) { /* ignore */ }
  });

  // 切回标签页/窗口重新聚焦时刷新（用户可能在别的页面完成支付后切回）
  window.addEventListener('visibilitychange', function () {
    try {
      if (document.visibilityState === 'visible' && /(^|#\/)plan\//.test(location.hash || '')) loadLastPurchase();
    } catch (e) { /* ignore */ }
  });
  window.addEventListener('focus', function () {
    try {
      if (/(^|#\/)plan\//.test(location.hash || '')) loadLastPurchase();
    } catch (e) { /* ignore */ }
  });

  var themeObs = new MutationObserver(function () {
    var rgb = getPrimaryRgb();
    if (rgb !== window.__ctPrimaryRgb) {
      window.__ctPrimaryRgb = rgb;
      document.documentElement.style.setProperty('--ct-primary-rgb', rgb);
      document.documentElement.style.setProperty('--ct-btn-text', getTextOn(rgb));
    }
    // 深浅模式切换时同步公告横幅背景图
    try { applyNoticeBgMode(); } catch (e) { /* ignore */ }
  });
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });

  injectStyles();
  injectSiteLogo();
  ensureCopySubBtn();
  patchClientShortcut();
  applyNoticeBgMode();
  console.log('[custom-traffic] v1.0.40 loaded');
  loadConfig().then(function (ok) {
    if (!ok) return;
    patchXHR();
    ensureUI();
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      ensureUI();
      if (document.getElementById(UI_BLOCK_ID) || tries > 20) clearInterval(timer);
    }, 500);
  });
})();
