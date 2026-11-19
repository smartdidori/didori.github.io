(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./engine.js'):root.GolfEngine);if(typeof module==='object'&&module.exports)module.exports=api;else root.GolfBot=api;})(typeof globalThis!=='undefined'?globalThis:this,function(E){
  'use strict';
  // No state.deck / private outcome access: callers pass only E.view(state, 1).
  function choose(v,mode='myopic'){
    const cards=[...v.queue,...v.holds.map(h=>h.card)];
    if(v.tutorial&&v.queue.length)return {type:'book',id:v.queue[0].id,index:E.starts(v,v.queue[0])[0]};
    const candidates=[];
    for(const c of cards){
      if(mode==='vipOnly'&&c.type!=='vip')continue;
      for(const index of E.starts(v,c)){
        const indices=E.indicesFor(v,c,index),amount=E.quote(v,c,index)*(1-c.risk);
        let penalty=0;
        for(const f of v.forecast){
          const wait=f.arrival-v.elapsed;if(wait<0||wait>15||c.type==='vip')continue;
          const alternatives=E.starts(v,f).filter(i=>v.slots[i].deadline>f.arrival+.8);
          const occupied=alternatives.filter(i=>indices.includes(i)).length;
          if(occupied)penalty+=f.price*occupied/Math.max(1,alternatives.length)*(alternatives.length<=indices.length?1:.5);
        }
        // Preserve blocks, preferring an edge when the price is comparable.
        const first=v.slots[index],last=v.slots[indices[indices.length-1]];
        const before=index>0?v.slots[index-1]:null,after=v.slots[index+c.size];
        const open=x=>x&&x.course===first.course&&x.bookingId===null&&x.deadline>v.elapsed;
        const fragmentation=open(before)&&open(after)?6:0;
        const urgent=c.left<2.5?8:0;
        const closing=Math.min(...indices.map(i=>v.slots[i].deadline-v.elapsed));
        const benefit=amount/c.size-penalty-fragmentation+urgent+(closing<6?8:0);
        candidates.push({c,index,benefit,amount,closing});
      }
    }
    candidates.sort((a,b)=>b.benefit-a.benefit||a.c.left-b.c.left||a.index-b.index);
    const best=candidates[0];
    if(best){
      if(mode==='vipOnly'||best.benefit>=18||v.elapsed>65||v.strikes>=2){
        // A closing prime time can be extended, but never at the expense of an urgent customer.
        return {type:'book',id:best.c.id,index:best.index};
      }
      if(!best.c.heldOnce&&v.holds.length<1+v.upgrades.hold&&v.forecast.some(f=>f.arrival-v.elapsed<7)&&v.queue.some(c=>c.id===best.c.id))return {type:'hold',id:best.c.id};
    }
    const rejectable=v.queue.filter(c=>!best||c.id===best.c.id||mode==='vipOnly'&&c.type!=='vip').sort((a,b)=>a.left-b.left);
    if(rejectable.length&&v.elapsed>=v.rejectUntil)return {type:'reject',id:rejectable[0].id};
    // Use promotion only to keep a usable block open while waiting for an advertised VIP.
    if(v.promoLeft){for(const f of v.forecast){for(let i=0;i<v.slots.length;i++){
      const slot=v.slots[i];if(slot.bookingId===null&&!slot.promoted&&slot.t>=f.from&&slot.t<=f.to&&slot.deadline>v.elapsed&&slot.deadline-v.elapsed<2&&f.arrival>slot.deadline&&f.arrival<slot.deadline+9)return {type:'promote',index:i};
    }}}
    return {type:'wait'};
  }
  function apply(s,a){return a.type==='book'?E.book(s,a.id,a.index):a.type==='reject'?E.reject(s,a.id):a.type==='hold'?E.hold(s,a.id):a.type==='promote'?E.promote(s,a.index):{ok:true};}
  function simulate(day,seed,mode='myopic',upgrades={}){
    const s=E.create(day,seed,upgrades);let next=0,actions=0;
    for(let i=0;i<3000&&!s.done;i++){
      if(s.elapsed+1e-8>=next){apply(s,choose(E.view(s,1),mode));next=s.elapsed+.8;actions++;}
      E.advance(s,.1);
    }
    if(!s.done)E.finalize(s,'시뮬레이션 종료');
    return {money:s.money,target:s.cfg.target,ratio:s.money/s.cfg.target,stars:s.stars,lost:s.lost,reason:s.endReason,actions,bookings:s.bookings.length,noShows:s.bookings.filter(b=>b.noShow).length,state:s};
  }
  function coach(s){
    const baseline=simulate(s.day,s.seed,'myopic',s.upgrades),notes=[];
    const noShows=s.bookings.filter(b=>b.noShow),loss=noShows.reduce((n,b)=>n+b.quote,0);
    if(noShows.length)notes.push(`예약금 없는 ${noShows.length}건에서 ${loss}만원이 노쇼로 사라졌어요. 확정 고객과 기대값을 비교해보세요.`);
    const blocker=s.diagnostics.blockedVip[0];
    if(blocker)notes.push(`${blocker.slot}의 ${blocker.normal} 팀 예약이 ${blocker.vip} VIP의 가능한 자리를 막았어요.`);
    if(s.diagnostics.fragmented)notes.push(`빈칸은 남았지만 연속 블록이 없어 단체 문의 ${s.diagnostics.fragmented}건을 놓쳤어요.`);
    if(s.strikes>=3)notes.push('거절은 2초에 한 번만 가능합니다. 홀드로 대기실을 비우거나 예약으로 경고를 초기화하세요.');
    if(s.promoUsed===0&&s.slots.some(x=>x.bookingId===null))notes.push('빈 타임이 마감됐어요. 판촉은 가격을 30% 낮추는 대신 10초를 벌어줍니다.');
    if(!notes.length)notes.push('단체를 가장자리부터 배치하면 다음 단체의 연속 블록을 지키기 쉽습니다.');
    return {reference:baseline.money,notes:notes.slice(0,3),label:'같은 시드 · 근시안 봇 참고 매출 (최적해 아님)'};
  }
  return {choose,apply,simulate,coach};
});
