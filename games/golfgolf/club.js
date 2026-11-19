(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./engine.js'):root.GolfEngine);if(typeof module==='object'&&module.exports)module.exports=api;else root.GolfClub=api;})(typeof globalThis!=='undefined'?globalThis:this,function(E){
  'use strict';
  function fresh(){return {season:1,unlocked:1,best:Array(5).fill(0),credited:Array(5).fill(0),cleared:Array(5).fill(false),wallet:0,finishes:[],records:[],upgrades:E.normalizeUpgrades()};}
  function normalize(v){
    const p=fresh();if(!v||typeof v!=='object')return p;
    const integer=(x,max=1e9)=>Math.max(0,Math.min(max,Math.floor(Number(x)||0)));
    p.season=Math.max(1,integer(v.season));p.unlocked=Math.max(1,integer(v.unlocked,5));p.wallet=integer(v.wallet);
    p.upgrades=E.normalizeUpgrades(v.upgrades);
    for(let i=0;i<5;i++){p.best[i]=integer(v.best?.[i]);p.credited[i]=integer(v.credited?.[i]);p.cleared[i]=v.cleared?.[i]===true;}
    // Existing v3 saves keep their progress; completion records require a new DAY 5 finish.
    const validSnapshot=x=>x&&Number.isInteger(x.season)&&x.season>0&&Array.isArray(x.dailyRevenue)&&x.dailyRevenue.length===5&&x.dailyRevenue.every(n=>Number.isSafeInteger(n)&&n>=0&&n<=1e9)&&Number.isFinite(Date.parse(x.completedAt));
    const snapshot=x=>({season:x.season,dailyRevenue:x.dailyRevenue.slice(),total:x.dailyRevenue.reduce((a,b)=>a+b,0),completedAt:new Date(x.completedAt).toISOString()});
    const finishes=new Map();
    for(const x of Array.isArray(v.finishes)?v.finishes:[])if(validSnapshot(x)){const n=snapshot(x);if(!finishes.has(n.season)||finishes.get(n.season).total<n.total)finishes.set(n.season,n);}
    p.finishes=[...finishes.values()];
    const records=new Map();
    for(const x of Array.isArray(v.records)?v.records:[])if(validSnapshot(x)&&typeof x.name==='string'&&cleanName(x.name)&&Number.isFinite(Date.parse(x.registeredAt))){
      const n={...snapshot(x),name:cleanName(x.name),registeredAt:new Date(x.registeredAt).toISOString()};
      if(!records.has(n.season)||records.get(n.season).total<n.total)records.set(n.season,n);
    }
    p.records=[...records.values()];
    return p;
  }
  function settle(p,s){
    if(!s.done)return 0;
    p.best[s.day]=Math.max(p.best[s.day],s.score);
    // Replay pays only improvement over this season's previously credited revenue.
    const credit=Math.max(0,s.money-p.credited[s.day]);p.wallet+=credit;p.credited[s.day]=Math.max(p.credited[s.day],s.money);
    if(s.stars>0){p.cleared[s.day]=true;p.unlocked=Math.max(p.unlocked,Math.min(5,s.day+2));}
    if(s.day===4&&s.stars>0&&p.cleared.every(Boolean)){
      const finish={season:p.season,dailyRevenue:p.credited.slice(),total:p.credited.reduce((a,b)=>a+b,0),completedAt:new Date().toISOString()};
      const previous=p.finishes.find(x=>x.season===p.season);
      if(!previous)p.finishes.push(finish);
      else if(finish.total>previous.total)Object.assign(previous,finish);
    }
    return credit;
  }
  function buy(p,key){const item=E.UPGRADE[key];if(!item||p.upgrades[key]||p.wallet<item.cost)return false;p.wallet-=item.cost;p.upgrades[key]=1;return true;}
  function nextSeason(p){if(!p.cleared.every(Boolean))return false;p.season++;p.unlocked=1;p.credited=Array(5).fill(0);p.cleared=Array(5).fill(false);return true;}
  function restartFromDayOne(p){
    // Use a new season identity so a fresh run never overwrites a previous ranked run.
    const season=p.season+1,finishes=p.finishes,records=p.records,best=p.best.slice();
    Object.assign(p,fresh(),{season,finishes,records,best});
    return true;
  }
  function cleanName(name){return Array.from(String(name??'').replace(/[\u0000-\u001f\u007f]/g,'').trim()).slice(0,16).join('');}
  function registration(p){
    return p.finishes.filter(f=>{const record=p.records.find(r=>r.season===f.season);return !record||f.total>record.total;}).sort((a,b)=>b.season-a.season)[0]||null;
  }
  function register(p,name){
    const finish=registration(p),nickname=cleanName(name);
    if(!finish)return {ok:false,reason:'DAY 1~5를 모두 달성하고 DAY 5를 마쳐야 등록할 수 있어요.'};
    if(!nickname)return {ok:false,reason:'기록에 남길 이름을 입력하세요. (최대 16자)'};
    const record={...finish,dailyRevenue:finish.dailyRevenue.slice(),name:nickname,registeredAt:new Date().toISOString()};
    const index=p.records.findIndex(r=>r.season===finish.season);
    if(index<0)p.records.push(record);else p.records[index]=record;
    return {ok:true,record};
  }
  function rankings(p){
    const sorted=p.records.slice().sort((a,b)=>b.total-a.total||a.registeredAt.localeCompare(b.registeredAt)||a.season-b.season);
    return sorted.map((r,i)=>({...r,rank:i>0&&r.total===sorted[i-1].total?sorted.findIndex(x=>x.total===r.total)+1:i+1}));
  }
  return {fresh,normalize,settle,buy,nextSeason,restartFromDayOne,cleanName,registration,register,rankings};
});
