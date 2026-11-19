/* Shared deterministic rules: used unchanged by the browser and simulation tools. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GolfEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const CONFIG = [
    {name:'오프닝 데이',event:'일반 영업 · OUT 12타임',count:26,interval:3.4,duration:100,target:330,patience:12,closeStart:38,step:5,courses:1,priceFactor:1,risk:.35,vipPrice:60},
    {name:'비 예보일',event:'전 고객 가격 −30% · 예약금 없는 고객 노쇼 50%',count:27,interval:3.3,duration:100,target:270,patience:11,closeStart:38,step:5,courses:1,priceFactor:.7,risk:.5,vipPrice:65},
    {name:'기업 행사일',event:'단체만 입장 · 연속 2~3타임 확보',count:25,interval:3.5,duration:100,target:270,patience:12,closeStart:40,step:5,courses:1,priceFactor:1,risk:.35,vipPrice:70},
    {name:'IN 코스 개방',event:'OUT + IN 동시 운영 · 24타임',count:42,interval:2.2,duration:110,target:710,patience:10,closeStart:48,step:5,courses:2,priceFactor:1,risk:.35,vipPrice:75},
    {name:'대회 예선일',event:'예선 단체는 6연속 타임 요구 · OUT + IN',count:43,interval:2.2,duration:110,target:720,patience:10,closeStart:50,step:5,courses:2,priceFactor:1,risk:.35,vipPrice:80}
  ];
  const UPGRADE = {
    queue:{name:'대기실 +1칸',cost:90},hold:{name:'홀드 +1칸',cost:100},promo:{name:'판촉 +1회',cost:80},extension:{name:'코스당 티타임 +1칸',cost:140}
  };
  const names=['김민수','이서연','박준호','최지우','정하늘','강도윤','윤서진','장유진','한지훈','오수빈','임현우','송다은','신우진','배지호','조은서','문태영','백수아','유정민'];
  function rng(seed){let a=seed>>>0;return ()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
  const fixedSeed=day=>[181101,181102][day];
  function normalizeUpgrades(v={}){if(!v||typeof v!=='object')v={};return Object.fromEntries(Object.keys(UPGRADE).map(k=>[k,v[k]===1?1:0]));}
  function makeDeck(day,seed){
    const cfg=CONFIG[day],random=rng(seed),out=[];
    const vipIndices=(cfg.courses===1?[4,12,21]:[5,14,24,34]).map(i=>day>=2?i+Math.floor(random()*5)-2:i);
    for(let i=0;i<cfg.count;i++){
      let type=day===2?'group':vipIndices.includes(i)?'vip':day>=2?(random()<.3?'group':random()<.35?'risk':'normal'):i%5===2?'group':i%5===3?'risk':'normal';
      if(i===0&&day===0)type='normal';
      const special=day===4&&i===8;
      if(special)type='group';
      const size=type==='group'?(special?6:(day>=2?random()<.45:i%2===0)?3:2):1;
      const price=type==='vip'?cfg.vipPrice:type==='group'?(size===6?180:size===3?80:50):type==='risk'?45+Math.floor(random()*4)*5:[24,28,32,36][Math.floor(random()*4)];
      // Random choices become available only on arrival. The seed fixes replay and no-show draws.
      const arrival=i*cfg.interval+(day>=2&&i>0?(random()-.5)*.6:0);
      let from=0,to=11;
      if(type==='vip') {from=Math.min(9,Math.max(0,Math.floor(arrival/cfg.duration*10)-1));if(cfg.courses===1&&i===vipIndices[0])from=1;to=from+2;}
      else if(i!==0&&type!=='group') {const window=Math.floor(random()*3);if(window===1)to=5;else if(window===2)from=6;}
      if(type==='group'&&!special&&random()<.4){from=arrival>45?5:0;to=arrival>45?11:8;}
      const patience=type==='vip'?7:cfg.patience;
      const noShow=type==='risk'&&random()<cfg.risk;
      out.push({id:i,name:names[(i+Math.floor(random()*names.length))%names.length],type,vip:type==='vip',size,people:type==='group'?size*4:4,price:Math.round(price*cfg.priceFactor),from,to,arrival,patience,left:patience,risk:type==='risk'?cfg.risk:0,noShow,special,heldOnce:false});
    }
    return out.sort((a,b)=>a.arrival-b.arrival);
  }
  function create(day=0,seed,upgrades={}){
    if(!Number.isInteger(day)||!CONFIG[day])throw Error('Invalid day');
    seed=day<2?fixedSeed(day):Number(seed)>>>0;
    const cfg={...CONFIG[day]},up=normalizeUpgrades(upgrades),perCourse=12+up.extension;
    const s={day,seed,cfg,upgrades:up,perCourse,deck:makeDeck(day,seed),spawned:0,elapsed:0,queue:[],holds:[],slots:[],bookings:[],money:0,pending:0,score:0,combo:0,strikes:0,lost:0,declined:0,autoRetired:0,promoLeft:3+up.promo,promoUsed:0,rejectUntil:0,done:false,paused:false,tutorial:day===0,endReason:'',stars:0,revision:0,events:[],diagnostics:{blockedVip:[],fragmented:0},settled:false};
    for(let course=0;course<cfg.courses;course++)for(let t=0;t<perCourse;t++)s.slots.push({course,t,deadline:Math.min(cfg.duration,cfg.closeStart+t*cfg.step),bookingId:null,promoted:false});
    spawnDue(s);return s;
  }
  function emit(s,text){s.events.push(text);if(s.events.length>5)s.events.shift();s.revision++;}
  const timeLabel=t=>{const m=480+t*10;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');};
  const slotLabel=(s,index)=>(s.slots[index].course?'IN ':'OUT ')+timeLabel(s.slots[index].t);
  const multiplier=slot=>slot.t>=3&&slot.t<=7?1.2:.9;
  function indicesFor(s,card,start){
    if(!Number.isInteger(start)||start<0||start>=s.slots.length)return [];
    const first=s.slots[start],last=s.slots[start+card.size-1];
    if(!last||first.course!==last.course||last.t!==first.t+card.size-1)return [];
    return Array.from({length:card.size},(_,i)=>start+i);
  }
  function fits(s,card,start){
    const indices=indicesFor(s,card,start);if(!indices.length)return false;
    return indices.every(i=>{const slot=s.slots[i];return slot.bookingId===null&&s.elapsed<slot.deadline&&slot.t>=card.from&&slot.t<=card.to+(s.upgrades.extension&&card.to===11?1:0);});
  }
  function starts(s,card){return s.slots.map((_,i)=>i).filter(i=>fits(s,card,i));}
  function quote(s,card,start){const indices=indicesFor(s,card,start);if(!indices.length)return 0;return Math.round(indices.reduce((sum,i)=>sum+card.price/card.size*multiplier(s.slots[i])*(s.slots[i].promoted?.7:1),0));}
  function recordBlocked(s,card){
    if(card.type==='vip'){
      const blocked=s.slots.filter(slot=>slot.t>=card.from&&slot.t<=card.to&&slot.bookingId!==null).map(slot=>s.bookings[slot.bookingId]);
      const normal=blocked.find(b=>b.card.type==='normal');
      if(normal)s.diagnostics.blockedVip.push({vip:card.name,normal:normal.card.name,slot:slotLabel(s,normal.indices[0])});
    }
    if(card.type==='group'){
      const empty=s.slots.filter(slot=>slot.bookingId===null&&slot.deadline>s.elapsed&&slot.t>=card.from&&slot.t<=card.to).length;
      if(empty>=card.size)s.diagnostics.fragmented++;
    }
  }
  function miss(s,n,reason){s.lost+=n;s.strikes+=n;s.combo=0;s.score=Math.max(0,s.score-80*n);emit(s,reason+' · 경고 '+Math.min(3,s.strikes)+'/3');}
  function spawnDue(s){
    while(s.spawned<s.deck.length&&s.deck[s.spawned].arrival<=s.elapsed+1e-8&&!s.done){
      const c={...s.deck[s.spawned++]};
      if(!starts(s,c).length){recordBlocked(s,c);s.autoRetired++;s.revision++;continue;}
      if(s.queue.length>=4+s.upgrades.queue)miss(s,1,'전화가 밀려 고객 이탈');
      else {s.queue.push(c);emit(s,c.type==='vip'?'★ VIP 도착 · 7초 안에 결정!':c.special?'예선 단체 도착 · 6연속 타임 필요':c.type==='group'?'단체 문의 · 연속 '+c.size+'타임 필요':'새 예약 문의 도착');}
      checkEnd(s);
    }
  }
  function findCard(s,id){return s.queue.find(c=>c.id===id)||s.holds.find(h=>h.card.id===id)?.card;}
  function active(s){return !s.done&&!s.paused;}
  function book(s,id,start){
    if(!active(s))return {ok:false,reason:'영업이 멈춰 있어요.'};
    const c=findCard(s,id);if(!c||!fits(s,c,start))return {ok:false,reason:'조건에 맞는 연속된 빈 타임이 필요해요.'};
    const indices=indicesFor(s,c,start),amount=quote(s,c,start),bookingId=s.bookings.length;
    s.bookings.push({card:{...c},indices,quote:amount,noShow:false});indices.forEach(i=>s.slots[i].bookingId=bookingId);
    s.queue=s.queue.filter(x=>x.id!==id);s.holds=s.holds.filter(h=>h.card.id!==id);
    if(c.type==='risk')s.pending+=amount;else s.money+=amount;
    s.combo++;s.strikes=0;s.score+=100+amount*2+Math.min(100,(s.combo-1)*20)+(c.left>c.patience*.6?50:0);s.tutorial=false;
    emit(s,(c.type==='vip'?'★ VIP 계약':c.type==='group'?'단체 '+c.size+'타임 계약':'예약 완료')+' · '+amount+'만원'+(c.type==='risk'?' (노쇼 시 0원)':''));
    checkEnd(s);return {ok:true,amount};
  }
  function reject(s,id){
    if(!active(s)||s.tutorial)return {ok:false,reason:'첫 예약을 먼저 배치하세요.'};
    if(s.elapsed<s.rejectUntil)return {ok:false,reason:'거절 응대 중 · 2초 쿨다운'};
    const card=s.queue.find(c=>c.id===id);if(!card)return {ok:false,reason:'대기 중인 문의만 보낼 수 있어요.'};
    s.queue=s.queue.filter(c=>c.id!==id);s.rejectUntil=s.elapsed+2;s.declined++;s.combo=0;s.score=Math.max(0,s.score-20);emit(s,'문의를 보냈어요 · 다음 거절은 2초 후');checkEnd(s);return {ok:true};
  }
  function hold(s,id){
    if(!active(s)||s.tutorial)return {ok:false,reason:'첫 예약을 먼저 배치하세요.'};
    const c=s.queue.find(c=>c.id===id);if(!c)return {ok:false,reason:'대기 중인 문의를 선택하세요.'};
    if(c.heldOnce)return {ok:false,reason:'같은 문의는 한 번만 홀드할 수 있어요.'};
    if(s.holds.length>=1+s.upgrades.hold)return {ok:false,reason:'홀드 공간이 가득 찼어요.'};
    c.heldOnce=true;s.queue=s.queue.filter(x=>x.id!==id);s.holds.push({card:c,left:8});emit(s,'8초 홀드 · 고객 대기시간만 멈춥니다');return {ok:true};
  }
  function release(s,id){
    if(!active(s))return {ok:false};const h=s.holds.find(h=>h.card.id===id);if(!h)return {ok:false};
    if(s.queue.length>=4+s.upgrades.queue)return {ok:false,reason:'대기실이 가득 찼어요. 홀드에서 바로 예약하세요.'};
    s.holds=s.holds.filter(x=>x!==h);s.queue.push(h.card);emit(s,'홀드 해제 · 대기시간 재개');return {ok:true};
  }
  function promote(s,index){
    if(!active(s)||s.tutorial)return {ok:false,reason:'첫 예약을 먼저 배치하세요.'};const slot=s.slots[index];
    if(!slot||slot.bookingId!==null||s.elapsed>=slot.deadline||slot.promoted||s.promoLeft<=0)return {ok:false,reason:'아직 열린 빈 타임에 한 번만 판촉할 수 있어요.'};
    if(slot.deadline>=s.cfg.duration)return {ok:false,reason:'영업 종료 이후로는 미룰 수 없어요.'};
    slot.deadline=Math.min(s.cfg.duration,slot.deadline+10);slot.promoted=true;s.promoLeft--;s.promoUsed++;emit(s,slotLabel(s,index)+' 마감 +10초 · 해당 타임 가격 −30%');return {ok:true};
  }
  function finalize(s,reason){
    if(s.done)return;s.done=true;s.endReason=reason;s.settled=true;
    for(const b of s.bookings)if(b.card.type==='risk'){b.noShow=b.card.noShow;if(!b.noShow)s.money+=b.quote;}
    s.pending=0;const ratio=s.money/s.cfg.target;s.stars=s.strikes>=3?0:ratio>=1.2?3:ratio>=1.1?2:ratio>=1?1:0;s.revision++;
  }
  function checkEnd(s){
    if(s.done)return;
    if(s.strikes>=3)return finalize(s,'고객 3팀 연속 이탈로 영업 종료');
    if(s.elapsed>=s.cfg.duration-1e-8)return finalize(s,'오늘의 영업시간 종료');
    if(s.slots.every(slot=>slot.bookingId!==null||s.elapsed>=slot.deadline))return finalize(s,'판매 가능한 티타임 소진');
    if(s.spawned===s.deck.length&&!s.queue.length&&!s.holds.length)return finalize(s,'모든 문의 처리 완료');
  }
  function advance(s,dt){
    if(!active(s)||s.tutorial||!Number.isFinite(dt)||dt<=0)return;
    // Small steps preserve event ordering even after a slow browser frame.
    for(let left=Math.min(dt,s.cfg.duration);left>1e-8&&!s.done;){
      const step=Math.min(.05,left);left-=step;s.elapsed=Math.min(s.cfg.duration,s.elapsed+step);
      const before=s.queue.length;
      s.queue=s.queue.filter(c=>{if(starts(s,c).length)return true;recordBlocked(s,c);s.autoRetired++;return false;});
      if(before!==s.queue.length)s.revision++;
      for(const c of s.queue)c.left-=step;
      const expired=s.queue.filter(c=>c.left<=1e-8);if(expired.length){s.queue=s.queue.filter(c=>c.left>1e-8);miss(s,expired.length,'대기시간 초과');}
      for(const h of [...s.holds]){
        h.left-=step;
        if(!starts(s,h.card).length){s.holds=s.holds.filter(x=>x!==h);recordBlocked(s,h.card);s.autoRetired++;s.revision++;}
        else if(h.left<=1e-8){s.holds=s.holds.filter(x=>x!==h);if(s.queue.length>=4+s.upgrades.queue)miss(s,1,'홀드 만료 · 대기실 초과');else{s.queue.push(h.card);emit(s,'홀드 8초 만료 · 대기시간 재개');}}
      }
      checkEnd(s);if(s.done)break;spawnDue(s);
      // Render revision also tracks newly closed time slots.
      if(s.slots.some(slot=>slot.bookingId===null&&slot.deadline>s.elapsed-step&&slot.deadline<=s.elapsed))s.revision++;
      checkEnd(s);
    }
  }
  // The only future information exposed to a policy is the advertised VIP forecast.
  function publicCard(c){const {noShow,...visible}=c;return {...visible};}
  function view(s,forecastCount=2){return {day:s.day,seed:s.seed,elapsed:s.elapsed,cfg:{...s.cfg},perCourse:s.perCourse,upgrades:{...s.upgrades},queue:s.queue.map(publicCard),holds:s.holds.map(h=>({left:h.left,card:publicCard(h.card)})),slots:s.slots.map(x=>({...x})),money:s.money,pending:s.pending,strikes:s.strikes,promoLeft:s.promoLeft,rejectUntil:s.rejectUntil,tutorial:s.tutorial,done:s.done,forecast:s.deck.slice(s.spawned).filter(c=>c.type==='vip').slice(0,forecastCount).map(c=>({type:'vip',size:1,price:c.price,from:c.from,to:c.to,arrival:c.arrival,name:c.name}))};}
  return {CONFIG,UPGRADE,rng,fixedSeed,normalizeUpgrades,create,makeDeck,timeLabel,slotLabel,multiplier,indicesFor,fits,starts,quote,book,reject,hold,release,promote,advance,finalize,findCard,view};
});
