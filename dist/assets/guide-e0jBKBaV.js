import{i as h,t,d as c,p as v,g as b,s as m,a as $,f as g,S as f,b as y}from"./nav-D_mGRQZI.js";import{p as w}from"./levels-2sWWwWOf.js";h();const u=1140,L=600,i=e=>String(e).replace(/[&<>"']/g,d=>`&#${d.charCodeAt(0)};`),a=e=>Number(e).toLocaleString("en-US");document.getElementById("growth-see1").innerHTML=t("growth.see1",{demo:'<span class="grow-pct demo"><span aria-hidden="true">⚙️</span>42.17%</span>'});function k(e){if(e.mode===0)return`${t("card.work",{n:a(e.growAmount)})} <small>${t("card.km",{km:(Number(e.growAmount)/u).toFixed(1)})}</small>`;if(e.mode===1)return t("card.blocks",{n:a(e.growAmount)});const d=Number(e.growAmount)*L/3600;return`${t("card.rounds",{n:a(e.growAmount)})} <small>${t("card.rest",{h:d.toFixed(0)})}</small>`}function S(e){const d=e.price===0n?t("seeds.free"):`${a(g(e.price,18))} SQK`,n=[e.level>1?t("card.level",{n:e.level}):"",e.unlockSnacks>0?t("card.unlock",{n:a(e.unlockSnacks)}):"",e.dailyLimit>0?t("card.daily",{n:e.dailyLimit}):"",e.needsFreshRun?t("card.fresh"):"",e.mode===2?t("card.wilts",{n:a(e.napWorkLimit),m:Math.round(Number(e.napWorkLimit)/u*1e3)}):""].filter(Boolean),l=t(`note.${e.name}`);return`
    <article class="seed-card" style="--seed:${f[e.name]??"#4f9d43"}">
      <div class="seed-card-art">${y(e.name,100,{})}</div>
      <div class="seed-card-body">
        <h3>${m(e.name)} ${i($(e.name))}${e.rare?` <i class="rare">${t("seeds.rare")}</i>`:""}</h3>
        <dl>
          <div><dt>${t("card.growsWith")}</dt><dd>${t(`card.mode.${e.mode}`)}</dd></div>
          <div><dt>${t("card.needs")}</dt><dd>${k(e)}</dd></div>
          <div><dt>${t("card.points")}</dt><dd><b>${a(e.basePoints)}</b> <small>${t("card.upTo",{n:a(Math.floor(e.basePoints*1.45))})}</small></dd></div>
          <div><dt>${t("card.price")}</dt><dd>${d}</dd></div>
        </dl>
        ${l===`note.${e.name}`?"":`<p class="seed-card-note">${i(l)}</p>`}
        ${n.length?`<ul class="seed-card-tags">${n.map(r=>`<li>${i(r)}</li>`).join("")}</ul>`:""}
      </div>
    </article>`}function s(e){const d=Array.from({length:10},(n,l)=>{const r=l+1,p=e.filter(o=>o.active&&Math.max(1,o.level)===r).map(o=>`${m(o.name)} ${i($(o.name))}`);return`<tr><td><b>${r}</b></td><td>${a(w(r))}</td><td>${p.join(", ")||"–"}</td></tr>`});document.getElementById("level-table").innerHTML=`<table class="level-table">
    <thead><tr><th>${t("levels.th.level")}</th><th>${t("levels.th.points")}</th><th>${t("levels.th.opens")}</th></tr></thead>
    <tbody>${d.join("")}</tbody></table>`}async function A(){const e=document.getElementById("seed-guide");if(s([]),!c){e.innerHTML=`<p class="hint">${t("card.notDeployed")}</p>`;return}try{const d=await v.readContract({address:c.garden,abi:b,functionName:"seeds"});e.innerHTML=d.filter(n=>n.active).map(S).join(""),s(d)}catch{e.innerHTML=`<p class="hint">${t("card.unreachable")}</p>`}}A();
