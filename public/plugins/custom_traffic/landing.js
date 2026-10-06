export function mountRegistration(document, config, options = {}) {
  var api='/api/v1/custom-traffic', planId=config.plan_id, min=config.min_gb, max=config.max_gb, tier1Gb=config.tier1_gb, tier1Price=config.tier1_price, tier2Gb=config.tier2_gb, tier2Price=config.tier2_price, tier3Gb=config.tier3_gb, tier3Price=config.tier3_price, overPrice=config.over_price_per_gb, periodMultipliers=config.period_multipliers;
  var slider=document.getElementById('__ct-slider'), num=document.getElementById('__ct-num'), monthly=document.getElementById('__ct-monthly'), total=document.getElementById('__ct-total'), priceBox=document.getElementById('__ct-price-box'), periodName=document.getElementById('__ct-period-name'), msg=document.getElementById('__ct-msg'), buy=document.getElementById('__ct-buy-btn'), payment=document.getElementById('__ct-payment'), methodSelect=document.getElementById('__ct-method'), payBtn=document.getElementById('__ct-pay-btn'), email=document.getElementById('__ct-email'), password=document.getElementById('__ct-password'), invite=document.getElementById('__ct-invite'), period=config.default_period||'quarterly', dragging=false, quoteTimer, requestNo=0, activeRequest=null, lastQuote=null, authToken='', tradeNo='', pollTimer=null, disposed=false;
  var navigate=options.navigate||function(path){window.location.assign(path);};
  var requests=new AbortController();
  var inviteCode=(options.params||new URLSearchParams(window.location.search)).get('code');
  function fetch(url, init) {
    return window.fetch(url, Object.assign({signal:requests.signal}, init));
  }
  if (inviteCode && inviteCode.trim()) {
    invite.value=inviteCode.trim();
    invite.disabled=true;
    invite.title='邀请码来自邀请链接，不能修改';
  }
  var labels={monthly:'月付',quarterly:'季付',half_yearly:'半年付',yearly:'年付',two_yearly:'两年付',three_yearly:'三年付'};
  var THEME_STORAGE_KEY='vueuse-color-scheme', themeMedia=window.matchMedia('(prefers-color-scheme: dark)');
  function getStoredTheme(){var stored='auto';try{stored=localStorage.getItem(THEME_STORAGE_KEY)||'auto';}catch(e){}return stored==='light'||stored==='dark'?stored:'auto';}
  function isDark(){
    if(options.theme)return options.theme.isDark();
    var stored=getStoredTheme();
    if(stored==='dark')return true;
    if(stored==='light')return false;
    return themeMedia.matches;
  }
  function syncTheme(){
    var dark=isDark(), root=window.document.documentElement;
    if(!options.theme){
      root.classList.toggle('dark',dark);
      root.classList.toggle('light',!dark);
      root.style.colorScheme=dark?'dark':'light';
    }
    if(document.host){
      // The main theme's transition reset does not cross the shadow boundary.
      var reset=window.document.createElement('style');
      reset.textContent=':host,*,*::before,*::after{transition:none!important}';
      document.appendChild(reset);
      document.host.classList.toggle('dark',dark);
      document.host.classList.toggle('light',!dark);
      document.host.style.colorScheme=dark?'dark':'light';
      window.getComputedStyle(document.querySelector('.ct-register-body')).backgroundColor;
      reset.remove();
    }
    var toggle=document.getElementById('__ct-theme-toggle');
    if(toggle){
      toggle.setAttribute('aria-pressed',dark?'true':'false');
      toggle.setAttribute('aria-label',dark?'切换到浅色模式':'切换到深色模式');
    }
  }
  function toggleTheme(){
    if(options.theme){options.theme.toggle();syncTheme();return;}
    var next=isDark()?'light':'dark';
    try{localStorage.setItem(THEME_STORAGE_KEY,next);}catch(e){}
    syncTheme();
  }
  function onSystemThemeChange(){if(getStoredTheme()==='auto')syncTheme();}
  function onStorage(event){if(event.key===THEME_STORAGE_KEY)syncTheme();}
  var stopTheme;
  if(options.theme){
    stopTheme=options.theme.subscribe(syncTheme);
  }else{
    if(themeMedia.addEventListener)themeMedia.addEventListener('change',onSystemThemeChange);else if(themeMedia.addListener)themeMedia.addListener(onSystemThemeChange);
    window.addEventListener('storage',onStorage);
  }
  syncTheme();
  var themeToggle=document.getElementById('__ct-theme-toggle');
  if(themeToggle)themeToggle.addEventListener('click',toggleTheme);
  function show(text,type){msg.textContent=text||'';msg.className=type||'';msg.style.opacity=text?'1':'0';}
  function bump(el){if(!el)return;el.classList.remove('__ct-bump');void el.offsetWidth;el.classList.add('__ct-bump');}
  function pop(){priceBox.classList.remove('__ct-pop');void priceBox.offsetWidth;priceBox.classList.add('__ct-pop');}
  function pulsePrice(){priceBox.classList.remove('ct-price-pulse');void priceBox.offsetWidth;priceBox.classList.add('ct-price-pulse');}
  function swapText(el,text){if(!el||el.textContent===text)return;el.classList.remove('ct-text-swap');void el.offsetWidth;el.textContent=text;el.classList.add('ct-text-swap');}
  function setMoney(el,cents,animate){cents=parseInt(cents,10)||0;if(!animate){el.textContent='¥'+(cents/100).toFixed(2);return;}var match=(el.textContent||'').match(/[\d.]+/),from=match?Math.round(parseFloat(match[0])*100):null;if(from===null||from===cents){el.textContent='¥'+(cents/100).toFixed(2);return;}if(el.__ctAnim)cancelAnimationFrame(el.__ctAnim);var start=null;function step(ts){if(start===null)start=ts;var p=Math.min((ts-start)/190,1),ease=1-Math.pow(1-p,3);el.textContent='¥'+((from+(cents-from)*ease)/100).toFixed(2);if(p<1)el.__ctAnim=requestAnimationFrame(step);else el.__ctAnim=null;}el.__ctAnim=requestAnimationFrame(step);}
  function localMonthly(gb){if(gb<=tier1Gb)return tier1Price;if(gb<=tier2Gb)return Math.round(tier1Price+(gb-tier1Gb)*(tier2Price-tier1Price)/(tier2Gb-tier1Gb));if(gb<=tier3Gb)return Math.round(tier2Price+(gb-tier2Gb)*(tier3Price-tier2Price)/(tier3Gb-tier2Gb));return tier3Price+(gb-tier3Gb)*overPrice;}
  function multiplier(key){return config.period_multiplier ? (periodMultipliers[key]||1) : 1;}
  function animateChipReflow(mutator){
    var chips=Array.prototype.slice.call(document.querySelectorAll('.__ct-chip')), before=[];
    chips.forEach(function(chip){var rect=chip.getBoundingClientRect();before.push({chip:chip,left:rect.left,top:rect.top,width:rect.width,height:rect.height});});
    mutator();
    var container=document.getElementById('__ct-period-chips');
    if(container)container.offsetWidth;
    before.forEach(function(item){
      if(!item.width&&!item.height)return;
      var rect=item.chip.getBoundingClientRect(), dx=item.left-rect.left, dy=item.top-rect.top;
      if(!rect.width&&!rect.height)return;
      if(Math.abs(dx)<0.5&&Math.abs(dy)<0.5)return;
      item.chip.style.transition='none';
      item.chip.style.transform='translate3d('+dx+'px,'+dy+'px,0)';
      requestAnimationFrame(function(){
        item.chip.style.transition='transform .34s cubic-bezier(.22,.8,.24,1)';
        item.chip.style.transform='translate3d(0,0,0)';
        setTimeout(function(){item.chip.style.transition='';item.chip.style.transform='';},360);
      });
    });
  }
  function setChipVisibility(chip,hidden){
    var isHidden=chip.classList.contains('hidden');
    if(hidden&&(isHidden||chip.classList.contains('ct-chip-exit')))return;
    clearTimeout(chip.__ctVisibilityTimer);
    if(hidden){
      chip.classList.remove('ct-chip-enter');
      chip.classList.add('ct-chip-exit');
      chip.__ctVisibilityTimer=setTimeout(function(){
        animateChipReflow(function(){chip.classList.add('hidden');chip.classList.remove('ct-chip-exit');});
      },210);
      return;
    }
    if(!isHidden){
      chip.classList.remove('ct-chip-exit');
      return;
    }
    animateChipReflow(function(){
      chip.classList.remove('hidden','ct-chip-exit');
      chip.classList.add('ct-chip-enter');
    });
    chip.__ctVisibilityTimer=setTimeout(function(){chip.classList.remove('ct-chip-enter');},330);
  }
  function syncPeriods(monthlyCents){var can=Number(monthlyCents)>=tier2Price;document.querySelectorAll('.__ct-chip').forEach(function(chip){var hidden=chip.dataset.period==='monthly'&&!can,active=chip.dataset.period===period&&!hidden;if(hidden&&period==='monthly'){period='quarterly';active=false;}setChipVisibility(chip,hidden);active=chip.dataset.period===period&&!hidden;chip.classList.toggle('active',active);chip.setAttribute('aria-pressed',active?'true':'false');});}
  function setTraffic(v){v=Math.round(Number(v)||min);v=Math.max(min,Math.min(max,v));slider.value=v;if(document.activeElement!==num)num.value=v;var pct=max===min?0:((v-min)/(max-min))*100;slider.style.background='linear-gradient(90deg,rgb(var(--ct-primary-rgb)) '+pct+'%,rgba(var(--ct-primary-rgb),.15) '+pct+'%)';document.getElementById('__ct-step-minus').disabled=v<=min;document.getElementById('__ct-step-plus').disabled=v>=max;bump(num);}
  function renderLocal(animate){var gb=Number(slider.value),m=localMonthly(gb);syncPeriods(m);var t=m*multiplier(period),motion=!!animate||dragging;lastQuote={traffic_gb:gb,period:period,monthly_price:m,total_amount:t};setMoney(monthly,m,motion);setMoney(total,t,motion);swapText(periodName,'本期('+labels[period]+')');if(motion)pulsePrice();else if(animate)pop();}
  function shownCents(el){var match=(el.textContent||'').match(/[\d.]+/);return match?Math.round(parseFloat(match[0])*100):null;}
  function quote(final){clearTimeout(quoteTimer);if(activeRequest)activeRequest.abort();var current=++requestNo;quoteTimer=setTimeout(function(){activeRequest=new AbortController();var gb=Number(slider.value),selectedPeriod=period;fetch(api+'/public/quote',{method:'POST',headers:{'Content-Type':'application/json'},signal:activeRequest.signal,body:JSON.stringify({traffic_gb:gb,period:selectedPeriod})}).then(function(r){return r.json();}).then(function(j){if(current!==requestNo||j.status!=='success')throw Error(j.message||'无法获取价格');var d=j.data||{};if(Number(d.traffic_gb)!==Number(slider.value)||d.period!==period)return;var monthlyChanged=shownCents(monthly)!==Number(d.monthly_price),totalChanged=shownCents(total)!==Number(d.total_amount);if(monthlyChanged)setMoney(monthly,d.monthly_price,true);if(totalChanged)setMoney(total,d.total_amount,true);swapText(periodName,'本期('+((labels[d.period]||labels[period]))+')');syncPeriods(d.monthly_price);lastQuote=d;show('','');if(monthlyChanged||totalChanged)pulsePrice();if(final&&(monthlyChanged||totalChanged))pop();}).catch(function(e){if(e.name!=='AbortError'&&current===requestNo)show(e.message||'无法获取价格','err');}).finally(function(){if(current===requestNo)activeRequest=null;});},final?0:120);}
  function update(){renderLocal(true);quote(false);}
  function finishSliderDrag(){if(!dragging)return;dragging=false;renderLocal(false);quote(true);}
  slider.addEventListener('input',function(){dragging=true;setTraffic(slider.value);renderLocal(false);quote(false);clearTimeout(slider.__dragTimer);slider.__dragTimer=setTimeout(finishSliderDrag,120);});
  slider.addEventListener('change',function(){clearTimeout(slider.__dragTimer);setTraffic(slider.value);finishSliderDrag();});
  num.addEventListener('focus',function(){num.select();});num.addEventListener('input',function(){dragging=true;num.value=num.value.replace(/[^\d]/g,'');if(num.value)setTraffic(num.value);renderLocal(false);quote(false);});num.addEventListener('change',function(){dragging=false;setTraffic(num.value);num.value=slider.value;renderLocal(true);quote(true);});
  document.getElementById('__ct-step-minus').onclick=function(){setTraffic(Number(slider.value)-5);dragging=false;renderLocal(true);quote(true);};document.getElementById('__ct-step-plus').onclick=function(){setTraffic(Number(slider.value)+5);dragging=false;renderLocal(true);quote(true);};
  document.querySelectorAll('.__ct-chip').forEach(function(chip){chip.onclick=function(){if(chip.classList.contains('hidden'))return;period=chip.dataset.period;dragging=false;renderLocal(true);quote(true);};});
  function authHeaders(){return {'Content-Type':'application/json','Authorization':authToken};}
  function loadPaymentMethods(){return fetch('/api/v1/user/order/getPaymentMethod',{headers:{'Authorization':authToken}}).then(function(r){return r.json();}).then(function(j){var methods=j.data||[];if(!methods.length)throw Error('暂无可用支付方式，请联系管理员');methodSelect.innerHTML='';methods.forEach(function(item){var option=window.document.createElement('option');option.value=item.id;option.textContent=item.name||item.payment;methodSelect.appendChild(option);});payment.style.display='block';show('账号已创建，请选择支付方式','ok');});}
  function rememberAccount(){
    try { localStorage.setItem('ACCESS_TOKEN',JSON.stringify({value:authToken,time:Date.now(),expire:null})); } catch(e) {}
  }
  function checkout(){payBtn.disabled=true;payBtn.textContent='正在跳转支付…';fetch('/api/v1/user/order/checkout',{method:'POST',headers:authHeaders(),body:JSON.stringify({trade_no:tradeNo,method:Number(methodSelect.value)})}).then(function(r){return r.json();}).then(function(j){var type=j.type,data=j.data;if(data===true){rememberAccount();navigate('/#/dashboard');return;}if(type===1&&typeof data==='string'){rememberAccount();location.href=data;return;}if(type===0&&data){show('请在支付页面完成付款后返回此页','ok');pollOrder();return;}throw Error(j.message||'支付请求失败');}).catch(function(e){if(disposed)return;show(e.message||'支付请求失败，请重试','err');payBtn.disabled=false;payBtn.textContent='前往支付';});}
  function pollOrder(){var count=0;clearInterval(pollTimer);pollTimer=setInterval(function(){if(++count>120){clearInterval(pollTimer);return;}fetch('/api/v1/user/order/check?trade_no='+encodeURIComponent(tradeNo),{headers:{'Authorization':authToken}}).then(function(r){return r.json();}).then(function(j){if(Number(j.data)>=3){clearInterval(pollTimer);rememberAccount();show('支付成功，正在进入仪表盘…','ok');setTimeout(function(){if(!disposed)navigate('/#/dashboard');},500);}}).catch(function(){});},1500);}
  payBtn.onclick=checkout;
  buy.onclick=function(){var value=Number(slider.value),mail=(email.value||'').trim(),pass=password.value||'',inviteValue=(invite.value||'').trim();if(!mail||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)){show('请输入正确的注册邮箱','err');email.focus();return;}if(pass.length<8){show('密码至少需要 8 位','err');password.focus();return;}if(!inviteValue){show('请输入邀请码','err');invite.focus();return;}if(!value){show('请先选择流量与周期','err');return;}buy.disabled=true;buy.textContent='正在注册并创建订单…';show('','');fetch(api+'/hold',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan_id:planId,traffic_gb:value,period:period})}).then(function(r){return r.json();}).then(function(j){if(j.status!=='success')throw Error(j.message||'暂存选择失败');return fetch(api+'/register-order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:mail,password:pass,invite_code:inviteValue,plan_token:j.data.token,ct_direct_register:true})});}).then(function(r){return r.json();}).then(function(j){if(j.status!=='success')throw Error(j.message||'注册失败');tradeNo=j.data.trade_no;authToken=(j.data.auth_data||{}).auth_data||'';if(!authToken)throw Error('注册成功但登录凭证获取失败');buy.textContent='账号已创建';return loadPaymentMethods();}).then(function(){buy.disabled=true;}).catch(function(e){show(e.message||'注册或下单失败，请重试','err');buy.disabled=false;buy.textContent='注册并购买';});};
  setTraffic(config.default_gb);renderLocal(false);quote(true);
  return function () {
    disposed=true;
    clearTimeout(quoteTimer);
    clearTimeout(slider.__dragTimer);
    clearInterval(pollTimer);
    if(activeRequest)activeRequest.abort();
    requests.abort();
    if(stopTheme)stopTheme();
    if(!options.theme){
      if(themeMedia.removeEventListener)themeMedia.removeEventListener('change',onSystemThemeChange);else if(themeMedia.removeListener)themeMedia.removeListener(onSystemThemeChange);
      window.removeEventListener('storage',onStorage);
    }
    if(themeToggle)themeToggle.removeEventListener('click',toggleTheme);
    document.querySelectorAll('.__ct-chip').forEach(function(chip){clearTimeout(chip.__ctVisibilityTimer);});
    [monthly,total].forEach(function(el){if(el.__ctAnim)cancelAnimationFrame(el.__ctAnim);});
  };
}
