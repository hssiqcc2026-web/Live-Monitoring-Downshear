// ================================================================
//  HSSI DOWNSHEAR MONITORING — app.js (v4, 26 kolom)
//  ★ FORMAT BARU: +4 kolom baru (Actual Width MC, Total Length,
//                  Coil Set Set Lifter, Produk keluar dari mesin)
//  ★ PAUSE/RESUME shift
//  ★ FIX TIMEZONE
// ================================================================

const SHEET_CONFIG = {
    WAITING: {
        DS1: "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5oxW4v4lVSiKmn8vUwaYIuzRDOoTCOhu0jB9zk6_WDM9ar1yAiPwrIZGUFvf3zXAqWcjnCaUyRKAu/pub?gid=0&single=true&output=csv",
        DS2: "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5oxW4v4lVSiKmn8vUwaYIuzRDOoTCOhu0jB9zk6_WDM9ar1yAiPwrIZGUFvf3zXAqWcjnCaUyRKAu/pub?gid=1839583056&single=true&output=csv",
        DS3: "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5oxW4v4lVSiKmn8vUwaYIuzRDOoTCOhu0jB9zk6_WDM9ar1yAiPwrIZGUFvf3zXAqWcjnCaUyRKAu/pub?gid=2002711566&single=true&output=csv"
    },
    FINISH: {
        DS1: "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5oxW4v4lVSiKmn8vUwaYIuzRDOoTCOhu0jB9zk6_WDM9ar1yAiPwrIZGUFvf3zXAqWcjnCaUyRKAu/pub?gid=1963690094&single=true&output=csv",
        DS2: "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5oxW4v4lVSiKmn8vUwaYIuzRDOoTCOhu0jB9zk6_WDM9ar1yAiPwrIZGUFvf3zXAqWcjnCaUyRKAu/pub?gid=43797719&single=true&output=csv",
        DS3: "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5oxW4v4lVSiKmn8vUwaYIuzRDOoTCOhu0jB9zk6_WDM9ar1yAiPwrIZGUFvf3zXAqWcjnCaUyRKAu/pub?gid=923781372&single=true&output=csv"
    }
};
const PLANING_EDIT_URLS = {
    DS1: "https://docs.google.com/spreadsheets/d/1ilrNI9xBlDZTXOqjRChtov9BFG6ICA9T3IM3KVgqkg8/edit?gid=0#gid=0",
    DS2: "https://docs.google.com/spreadsheets/d/1ilrNI9xBlDZTXOqjRChtov9BFG6ICA9T3IM3KVgqkg8/edit?gid=1839583056#gid=1839583056",
    DS3: "https://docs.google.com/spreadsheets/d/1ilrNI9xBlDZTXOqjRChtov9BFG6ICA9T3IM3KVgqkg8/edit?gid=2002711566#gid=2002711566"
};
const APPS_SCRIPT_URL  = "https://script.google.com/macros/s/AKfycbz9wQBlaR73m0re0nUrG8qQYsPm8crdTTvH-qbteXi7B6XYILHsCl8Wxf3NV7CKEJBP/exec";
const PLANING_COL      = { order:2, cc:6, spec:8, size:10, weight:12, place:5, cust:19 };
const REFRESH_INTERVAL = 15000;

// ── STATE ──────────────────────────────────────────────────────
let appData          = [];
let finishData       = [];
let remoteStatusMap  = {};
let activeMenu       = 'WAITING';
let activeLine       = 'ALL';
let searchQuery      = '';
let selectedItemId   = null;
let finishingItemId  = null;
let finishMode       = 'finish'; // 'finish' | 'pause'
let html5QrCode      = null;
let charts           = {};
let scannerOpen      = false;
let lastScanLock     = false;
let dtExpanded       = false;
let productRowCounter = 0;
let autoRefreshTimer = null;
let countdownTimer   = null;
let countdownValue   = REFRESH_INTERVAL / 1000;
let toastTimer       = null;

// ================================================================
//  TIME HELPERS
// ================================================================
function getTimeString(date) {
    const d = date || new Date();
    const p = n => String(n).padStart(2,'0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function sanitizeTimeDisplay(val) {
    if (!val || String(val).trim()==='' || String(val).trim()==='-') return '—';
    const s = String(val).trim();
    if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
    if (/^\d{2}\.\d{2}\.\d{2}$/.test(s)) return s.replace(/\./g,':');
    const m = s.match(/(\d{2}:\d{2}:\d{2})/); if (m) return m[1];
    const md= s.match(/(\d{2})\.(\d{2})\.(\d{2})/); if (md) return `${md[1]}:${md[2]}:${md[3]}`;
    return s.length>=8 ? s.slice(0,8) : s;
}

// ================================================================
//  INIT
// ================================================================
window.onload = function() {
    safeCreateIcons();
    initCharts();
    setupDesktopInput();
    fetchAllData();
    startAutoRefresh();
    lockLandscape();
    handleOrientation();

    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone===true;
    if (!standalone) {
        const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
        if (ios) {
            const b = document.getElementById('btn-install-ios');
            if (b) { b.classList.remove('hidden'); b.classList.add('flex'); safeCreateIcons(); }
        } else {
            if (window.__pwaInstallEvent) {
                const b2 = document.getElementById('btn-install');
                if (b2) { b2.classList.remove('hidden'); b2.classList.add('flex'); safeCreateIcons(); }
            }
            window.addEventListener('beforeinstallprompt', () => {
                const b3 = document.getElementById('btn-install');
                if (b3) { b3.classList.remove('hidden'); b3.classList.add('flex'); safeCreateIcons(); }
            });
        }
    }
};
function safeCreateIcons() { if (typeof lucide !== 'undefined') lucide.createIcons(); }

// ================================================================
//  AUTO REFRESH
// ================================================================
function startAutoRefresh() {
    clearAutoRefresh();
    countdownValue = REFRESH_INTERVAL / 1000;
    updateCountdownUI();
    autoRefreshTimer = setInterval(() => { fetchAllData(); countdownValue = REFRESH_INTERVAL/1000; }, REFRESH_INTERVAL);
    countdownTimer   = setInterval(() => { countdownValue = Math.max(0, countdownValue-1); updateCountdownUI(); }, 1000);
}
function clearAutoRefresh() {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    if (countdownTimer)   clearInterval(countdownTimer);
}
function updateCountdownUI() {
    const el = document.getElementById('sync-countdown');
    if (el) el.textContent = `(refresh ${countdownValue}s)`;
}

// ================================================================
//  SERVER COMMUNICATION
// ================================================================
function post(payload) {
    fetch(APPS_SCRIPT_URL, { method:'POST', mode:'no-cors', body:JSON.stringify(payload) })
        .catch(e => console.warn('POST error:', e));
}

function sendStartToServer(item) {
    post({ action:"START","CC NO":item.ccNo,"LINE":item.line,
           "ORDER NO":item.orderNo||"-","START TIME":item.startTime });
}
function sendClearStatusToServer(item) {
    post({ action:"CLEAR_STATUS","CC NO":item.ccNo,"LINE":item.line });
}
function sendKendalaToServer(item) {
    post({ action:"KENDALA","CC NO":item.ccNo,"LINE":item.line,
           "ORDER NO":item.orderNo||"-","KENDALA":item.kendala||"-",
           "KENDALA WAKTU":item.kendalaWaktu||"0" });
}
function sendResumeToServer(item) {
    post({ action:"RESUME","CC NO":item.ccNo,"LINE":item.line,
           "ORDER NO":item.orderNo||"-","START TIME":item.startTime });
}

// ★ PAUSE — kirim data shift yang dijeda (termasuk 4 kolom baru)
function sendPauseToServer(item, pauseTime, products, dtValues, speed, remark, extras) {
    products.forEach(prod => {
        post({
            action:"PAUSE",
            "DATE":new Date().toLocaleDateString('id-ID'),
            "ORDER NO":item.orderNo||"-","CC NO":item.ccNo||"-",
            "CUSTOMER":item.customer||"-","SPEC":item.spec||"-","SIZE":item.size||"-",
            "ACTUAL_WIDTH_MC":extras.actualWidthMC||"",  // ★ NEW
            "WEIGHT":item.weight||0,"PRODUCT SIZE":prod.width||"-",
            "QTY FG":prod.fg,"QTY NG":prod.ng,
            "TOTAL SKID":prod.totalSkid||0,
            "TOTAL_LENGTH":prod.totalLength||0,          // ★ NEW
            "COIL_SET_LIFTER":prod.coilSetLifter||0,     // ★ NEW
            "START":item.startTime||"-","PAUSE TIME":pauseTime,
            "PRODUK_KELUAR":extras.produkKeluar||"",     // ★ NEW
            "DT_TBM":dtValues.tbm,"DT_PACKING":dtValues.packing,
            "DT_WAITING_MC":dtValues.wmc,"DT_WAITING_CRANE":dtValues.wcr,
            "DT_WINDER":dtValues.wnd,"DT_CLEANING":dtValues.cln,
            "DT_PROBLEM":dtValues.pbm,"DT_OTHER":dtValues.oth,
            "DOWN TIME":dtValues.total,"LINE SPEED":speed||"0",
            "REMARK":remark||"-","LINE":item.line||"-"
        });
    });
}

async function fetchRemoteStatus() {
    try {
        const res  = await fetch(APPS_SCRIPT_URL+"?action=GET_STATUS&t="+Date.now());
        if (!res.ok) return;
        const json = await res.json();
        if (json && json.status==="ok" && Array.isArray(json.data)) {
            remoteStatusMap = {};
            json.data.forEach(row => {
                if (!row.ccNo || !row.line) return;
                const key = row.ccNo.trim()+"|"+row.line.trim().toUpperCase();
                remoteStatusMap[key] = {
                    status:       row.status       || "ON PROCESS",
                    startTime:    sanitizeTimeDisplay(row.startTime || ""),
                    kendala:      row.kendala      || "",
                    kendalaWaktu: row.kendalaWaktu || ""
                };
            });
        }
    } catch(e) { console.warn("GET_STATUS error:", e.message); }
}

// ================================================================
//  FETCH ALL DATA
// ================================================================
async function fetchAllData() {
    setSyncStatus('syncing');
    const icon = document.getElementById('refresh-icon');
    if (icon) icon.classList.add('syncing');
    try {
        const [rW, rF] = await Promise.all([
            Promise.all(Object.keys(SHEET_CONFIG.WAITING).map(async ln => {
                try { const r=await fetch(SHEET_CONFIG.WAITING[ln]+"&t="+Date.now()); return parseWaitingCSV(ln, await r.text()); } catch { return []; }
            })),
            Promise.all(Object.keys(SHEET_CONFIG.FINISH).map(async ln => {
                try { const r=await fetch(SHEET_CONFIG.FINISH[ln]+"&t="+Date.now()); if(!r.ok)return[]; return parseFinishCSV(ln, await r.text()); } catch { return []; }
            }))
        ]);

        fetchRemoteStatus().then(() => { applyRemoteStatus(); renderTable(); updateStats(); });

        const isValidCC = cc => cc && cc.trim().length>=3 && cc.trim()!=='-';
        let localFinish = [];
        try { localFinish = JSON.parse(localStorage.getItem('hssi_finish_data')||'[]').filter(lf=>isValidCC(lf.ccNo)); } catch {}

        finishData = rF.flat();
        localFinish.forEach(lf => {
            if (!finishData.find(mf=>mf.ccNo===lf.ccNo&&mf.line===lf.line)) finishData.unshift(lf);
        });

        appData = rW.flat().map(item => {
            const local = appData.find(e=>e.ccNo===item.ccNo&&e.line===item.line);
            if (local && (local.status==="ON PROCESS"||local.status==="PAUSED")) {
                return { ...item, status:local.status,
                    startTime:sanitizeTimeDisplay(local.startTime||""),
                    pauseTime:local.pauseTime||"", shift:local.shift||1,
                    kendala:local.kendala||"", kendalaWaktu:local.kendalaWaktu||"" };
            }
            return item;
        });

        applyRemoteStatus();
        setSyncStatus('connected');
        renderTable(); updateStats();
    } catch(err) { console.error("fetchAllData error:", err); setSyncStatus('error'); }
    finally {
        if (icon) icon.classList.remove('syncing');
        countdownValue = REFRESH_INTERVAL/1000;
    }
}

function applyRemoteStatus() {
    appData = appData.map(item => {
        const key    = item.ccNo+"|"+item.line;
        const remote = remoteStatusMap[key];
        if (!remote) return item;
        if (remote.status==="ON PROCESS") {
            return { ...item, status:"ON PROCESS",
                startTime:remote.startTime||item.startTime||"",
                kendala:remote.kendala||item.kendala||"",
                kendalaWaktu:remote.kendalaWaktu||item.kendalaWaktu||"" };
        }
        if (remote.status==="PAUSED") {
            return { ...item, status:"PAUSED", shift:(item.shift||1)+1,
                kendala:remote.kendala||item.kendala||"",
                kendalaWaktu:remote.kendalaWaktu||item.kendalaWaktu||"" };
        }
        return item;
    });
}

function setSyncStatus(state) {
    const dot=document.getElementById('sync-dot'), text=document.getElementById('sync-status');
    if (!dot||!text) return;
    const states = {
        syncing:   ['bg-amber-400', 'text-amber-400',  'SINKRONISASI...'],
        connected: ['bg-emerald-400','text-emerald-400','TERHUBUNG KE SERVER'],
        error:     ['bg-rose-400',  'text-rose-400',   'GAGAL TERHUBUNG']
    };
    const [bg,tc,label] = states[state] || states.error;
    dot.className  = `w-2 h-2 rounded-full ${bg} ${state!=='error'?'pulse-dot':''} inline-block`;
    text.className = `text-[10px] ${tc} font-bold uppercase tracking-[.2em]`;
    text.textContent = label;
}

// ================================================================
//  CSV PARSERS
// ================================================================
function parseCSVLine(row) {
    let arr=[],cur="",q=false;
    for (const c of row) {
        if(c==='"') q=!q;
        else if(c===','&&!q){arr.push(cur.trim());cur="";}
        else cur+=c;
    }
    arr.push(cur.trim()); return arr;
}

function parseWaitingCSV(line, text) {
    const rows=text.split(/\r?\n/).map(r=>parseCSVLine(r));
    if(rows.length<2)return[];
    let hIdx=0;
    for(let i=0;i<Math.min(rows.length,5);i++){
        const t=rows[i].join(' ').toUpperCase();
        if(t.includes('PACKING')||t.includes('ORDER NO')||t.includes('PROCESS ORDER')||t.includes('CC NO')){hIdx=i;break;}
    }
    const headers=rows[hIdx].map(h=>(h||'').toUpperCase().replace(/\s+/g,' ').trim());
    const autoOrder=headers.findIndex(h=>h==='ORDER NO'||h==='ORDER'||h==='NO ORDER'||h==='PROCESS ORDER');
    const autoCC=headers.findIndex(h=>h.includes('CC NO')||h.includes('CCNO')||h.includes('PACKING NO')||h.includes('PACK NO'));
    const C={
        order:autoOrder!==-1?autoOrder:PLANING_COL.order,
        cc:autoCC!==-1?autoCC:PLANING_COL.cc,
        spec:PLANING_COL.spec,size:PLANING_COL.size,weight:PLANING_COL.weight,
        place:PLANING_COL.place,cust:PLANING_COL.cust
    };
    return rows.slice(hIdx+1).filter(r=>r[C.cc]&&r[C.cc].trim().length>3).map((r,i)=>{
        const w=parseFloat((r[C.weight]||'0').replace(/[^\d.]/g,''))||0;
        return {
            id:`${line}-W-${i}-${(r[C.cc]||'').trim()}`, line,
            orderNo:(r[C.order]||'').trim(), customer:(r[C.cust]||'').trim(),
            ccNo:(r[C.cc]||'').trim(), spec:(r[C.spec]||'').trim(),
            place:(r[C.place]||'').trim(), size:(r[C.size]||'').trim(),
            weight:w, originalWeight:w, status:'WAITING',
            kendala:'', kendalaWaktu:'', startTime:'', shift:1, pauseTime:''
        };
    });
}

function parseFinishCSV(line, text) {
    const rows=text.split(/\r?\n/).map(r=>parseCSVLine(r));
    if(rows.length<2)return[];
    let hIdx=-1,hIdx2=-1,isNew=false;
    for(let i=0;i<Math.min(rows.length,8);i++){
        const t1=rows[i].join(' ').toUpperCase();
        const t2=(rows[i+1]||[]).join(' ').toUpperCase();
        if((t1.includes('CC NO')||t1.includes('PRODUCT SIZE'))&&
           (t2.includes('FINISH GOOD')||t2.includes('TBM')||t2.includes('NOT GOOD'))){
            hIdx=i;hIdx2=i+1;isNew=true;break;
        }
        if(t1.includes('QTY FG')||t1.includes('QTYFG')||(t1.includes('ORDER NO')&&t1.includes('DATE'))){
            hIdx=i;isNew=false;break;
        }
    }
    if(hIdx===-1)return[];
    const h1=rows[hIdx].map(h=>(h||'').toUpperCase().replace(/\s+/g,' ').trim());
    const h2=isNew?rows[hIdx2].map(h=>(h||'').toUpperCase().replace(/\s+/g,' ').trim()):[];
    const headers=h1.map((h,i)=>(isNew&&h2[i])?h2[i]:h);
    const fi=kws=>headers.findIndex(h=>kws.some(k=>h.includes(k)));
    const fiEx=kws=>headers.findIndex(h=>kws.includes(h));
    const mcSizeIdx=fi(['MC / SEMI','SEMI PRODUCT']);
    const col={
        cc:fi(['CC NO','CCNO','PACKING NO','PACK NO','IDENTITY']),
        cust:fi(['CUSTOMER','PEMBELI']), spec:fi(['SPEC','MUTU','GRADE']),
        size:mcSizeIdx!==-1?mcSizeIdx:fiEx(['SIZE']),
        actualWidthMC:fi(['ACTUAL WIDTH','ACTUAL WIDTH MC']),  // ★ NEW
        weight:fi(['WEIGHT','BERAT']),
        productSize:fiEx(['PRODUCT SIZE']),
        qtyFG:fi(['FINISH GOOD','QTY FG','QTYFG']),
        qtyNG:fi(['NOT GOOD','QTY NG','QTYNG']),
        totalSkid:fi(['TOTAL SKID']),
        totalLength:fi(['TOTAL LENGTH']),            // ★ NEW
        coilSetLifter:fi(['COIL SET','COIL SET SET LIFTER']), // ★ NEW
        start:fi(['START PROCESS','START','MULAI']),
        finish:fi(['END PROCESS','FINISH','SELESAI']),
        produkKeluar:fi(['PRODUK KELUAR','PRODUK KELUAR DARI']), // ★ NEW
        dtTBM:fiEx(['TBM']), dtPacking:fi(['PACKING COIL BACK','PACKING COILBACK']),
        dtWMC:fi(['WAITING MC','WAITING M/C']), dtWCR:fi(['WAITING CRANE']),
        dtWND:fi(['WINDER TOP/END','WINDER TOP']), dtCLN:fi(['CLEANING MACHINE','CLEANING']),
        dtPBM:fi(['PROBLEM MACHINE']), dtOTH:fiEx(['OTHER']),
        downTime:fi(['DOWN TIME','DOWNTIME']), remark:fi(['REMARK','CATATAN']),
        speed:fi(['LINE SPEED','SPEED']), lineCol:fiEx(['LINE']),
        order:fi(['ORDER NO','ORDER','NO ORDER']), date:fi(['DATE','TGL'])
    };
    const dataStart=isNew?hIdx2+1:hIdx+1, anchor=col.cc!==-1?col.cc:1;
    return rows.slice(dataStart).filter(r=>{
        if(!r||r.length<=1)return false;
        const v=(r[anchor]||'').trim();return v.length>=3&&v!=='-'&&v!=='--';
    }).map((r,i)=>{
        const g=c=>c!==-1?(r[c]||'').trim():'';
        const ccVal=g(col.cc);
        let lineVal=line;
        if(col.lineCol!==-1&&r[col.lineCol]){
            const lv=r[col.lineCol].trim().toUpperCase().replace(/\s+/g,'');
            if(['DS1','DS2','DS3'].includes(lv)) lineVal=lv;
        }
        const dtTBM=g(col.dtTBM)||'0',dtPkg=g(col.dtPacking)||'0',
              dtWMC=g(col.dtWMC)||'0',dtWCR=g(col.dtWCR)||'0',
              dtWND=g(col.dtWND)||'0',dtCLN=g(col.dtCLN)||'0',
              dtPBM=g(col.dtPBM)||'0',dtOTH=g(col.dtOTH)||'0';
        const totalDT=isNew
            ?[dtTBM,dtPkg,dtWMC,dtWCR,dtWND,dtCLN,dtPBM,dtOTH].reduce((s,v)=>s+(parseFloat(v)||0),0)
            :(parseFloat(g(col.downTime))||0);
        return {
            id:`${line}-F-${i}-${ccVal}`, line:lineVal,
            orderNo:g(col.order)||'-', customer:g(col.cust), ccNo:ccVal,
            spec:g(col.spec), place:g(col.date)||'', size:g(col.size),
            actualWidthMC:g(col.actualWidthMC)||'',    // ★ NEW
            weight:parseFloat(g(col.weight).replace(/[^\d.]/g,''))||0,
            productWidth:g(col.productSize),
            qtyFG:g(col.qtyFG)||'0', qtyNG:g(col.qtyNG)||'0',
            totalSkid:g(col.totalSkid)||'0',
            totalLength:g(col.totalLength)||'0',       // ★ NEW
            coilSetLifter:g(col.coilSetLifter)||'0',   // ★ NEW
            startTime:sanitizeTimeDisplay(g(col.start)),
            finishedAt:sanitizeTimeDisplay(g(col.finish)),
            produkKeluar:g(col.produkKeluar)||'',      // ★ NEW
            dtTBM,dtPacking:dtPkg,dtWaitingMC:dtWMC,dtWaitingCrane:dtWCR,
            dtWinder:dtWND,dtCleaning:dtCLN,dtProblem:dtPBM,dtOther:dtOTH,
            kendalaWaktu:totalDT.toString(),
            remark:g(col.remark), speed:g(col.speed)||'0', status:'COMPLETED'
        };
    });
}

// ================================================================
//  RENDER TABLE
// ================================================================
function renderTableHeader() {
    const thead=document.getElementById('table-head'); if(!thead)return;
    const th='px-3 py-4 whitespace-nowrap', thC=th+' text-center';
    if (activeMenu==='FINISH') {
        const dtHeader=dtExpanded
            ?`<th class="${thC} bg-rose-900/80 text-rose-100 dt-th-toggle text-[9px]" onclick="toggleDTColumns()" title="Collapse">▲ TBM</th>
              <th class="${thC} bg-rose-900/80 text-rose-100 text-[9px]">PKG</th>
              <th class="${thC} bg-rose-900/80 text-rose-100 text-[9px]">W.MC</th>
              <th class="${thC} bg-rose-900/80 text-rose-100 text-[9px]">W.CR</th>
              <th class="${thC} bg-rose-900/80 text-rose-100 text-[9px]">WND</th>
              <th class="${thC} bg-rose-900/80 text-rose-100 text-[9px]">CLN</th>
              <th class="${thC} bg-rose-900/80 text-rose-100 text-[9px]">PBM</th>
              <th class="${thC} bg-rose-900/80 text-rose-100 text-[9px]">OTH</th>`
            :`<th class="${thC} cursor-pointer hover:bg-emerald-700 transition-all" onclick="toggleDTColumns()" title="Detail DT">▼ Down Time</th>`;
        thead.innerHTML=`<tr class="bg-emerald-900/90 text-[10px] font-black text-emerald-100 uppercase tracking-[.12em]">
            <th class="${thC}">Line</th>
            <th class="${th}">CC No</th>
            <th class="${th}">Customer</th>
            <th class="${th}">Spec</th>
            <th class="${th}">Input Size</th>
            <th class="${thC}">Act.Width MC</th>
            <th class="${thC}">Weight</th>
            <th class="${thC}">Prod Size</th>
            <th class="${thC}">QFG</th>
            <th class="${thC}">QNG</th>
            <th class="${thC}">Skid</th>
            <th class="${thC}">Tot.Length</th>
            <th class="${thC}">Coil Set Lifter</th>
            <th class="${thC}">Start</th>
            <th class="${thC}">Finish</th>
            <th class="${thC}">Prod.Keluar</th>
            ${dtHeader}
            <th class="${th}">Remark</th></tr>`;
    } else {
        thead.innerHTML=`<tr class="bg-slate-50/50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-[.15em]">
            <th class="${thC}">Line</th><th class="${th}">Order / Customer</th>
            <th class="${th}">Packing No</th><th class="${th}">Spec</th>
            <th class="${th}">Place</th><th class="${th}">Size</th>
            <th class="${thC}">Berat (KG)</th><th class="${thC}">Status</th>
            <th class="${thC}">Aksi</th></tr>`;
    }
}

function renderTable() {
    renderTableHeader();
    const tbody=document.getElementById('table-body'); if(!tbody)return;
    const isFinish=activeMenu==='FINISH';
    let data=(isFinish?finishData:appData).filter(i=>activeLine==='ALL'||i.line===activeLine);
    if(searchQuery) data=data.filter(i=>JSON.stringify(i).toLowerCase().includes(searchQuery));

    if(!data.length){
        const cols=isFinish?(dtExpanded?26:19):9;
        tbody.innerHTML=`<tr><td colspan="${cols}" class="py-20 text-center text-slate-400 italic font-medium">Data tidak ditemukan...</td></tr>`;
        return;
    }

    if(isFinish){
        tbody.innerHTML=data.map(item=>{
            const lc=item.line==='DS1'?'bg-[#00843d]':item.line==='DS2'?'bg-sky-600':'bg-amber-600';
            const td='px-3 py-3 text-[11px] text-slate-700 whitespace-nowrap', tdc=td+' text-center';
            const sc=sanitizeTimeDisplay(item.startTime), fc=sanitizeTimeDisplay(item.finishedAt);
            const dtCols=dtExpanded
                ?`<td class="${tdc}">${item.dtTBM||'0'}</td>
                  <td class="${tdc}">${item.dtPacking||'0'}</td>
                  <td class="${tdc}">${item.dtWaitingMC||'0'}</td>
                  <td class="${tdc}">${item.dtWaitingCrane||'0'}</td>
                  <td class="${tdc}">${item.dtWinder||'0'}</td>
                  <td class="${tdc}">${item.dtCleaning||'0'}</td>
                  <td class="${tdc}">${item.dtProblem||'0'}</td>
                  <td class="${tdc}">${item.dtOther||'0'}</td>`
                :`<td class="${tdc}">${parseFloat(item.kendalaWaktu)>0
                    ?`<span class="px-2 py-0.5 bg-rose-50 text-rose-600 border border-rose-100 rounded font-bold text-[9px]">${item.kendalaWaktu} mnt</span>`
                    :'<span class="text-slate-300 text-[9px]">0</span>'}</td>`;
            return `<tr class="hover:bg-emerald-50/40 transition-all border-b border-slate-50">
                <td class="${tdc}"><span class="px-2 py-1 ${lc} text-white rounded text-[9px] font-black">${item.line}</span></td>
                <td class="${td} font-mono font-bold text-xs">${item.ccNo||'—'}</td>
                <td class="${td}">${item.customer||'—'}</td>
                <td class="${td}"><span class="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded font-bold text-[9px] uppercase">${item.spec||'—'}</span></td>
                <td class="${td} text-xs max-w-[120px] truncate">${item.size||'—'}</td>
                <td class="${tdc} font-bold text-indigo-600">${item.actualWidthMC||'—'}</td>
                <td class="${tdc} font-bold">${item.weight?item.weight.toLocaleString():'—'}</td>
                <td class="${tdc}">${item.productWidth||'—'}</td>
                <td class="${tdc}"><span class="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded font-bold text-[9px]">${item.qtyFG||'—'}</span></td>
                <td class="${tdc}"><span class="px-2 py-0.5 ${parseFloat(item.qtyNG)>0?'bg-rose-50 text-rose-600 border border-rose-100':'bg-slate-50 text-slate-400'} rounded font-bold text-[9px]">${item.qtyNG||'0'}</span></td>
                <td class="${tdc}">${item.totalSkid||'—'}</td>
                <td class="${tdc} text-sky-600 font-bold">${item.totalLength||'—'}</td>
                <td class="${tdc} text-purple-600 font-bold">${item.coilSetLifter||'—'}</td>
                <td class="${tdc} text-slate-500">${sc}</td>
                <td class="${tdc} text-slate-500">${fc}</td>
                <td class="${tdc} font-bold text-rose-600">${item.produkKeluar||'—'}</td>
                ${dtCols}
                <td class="${td} max-w-[120px] truncate text-slate-500">${item.remark||'—'}</td>
            </tr>`;
        }).join('');
    } else {
        tbody.innerHTML=data.map(item=>{
            const lc=item.line==='DS1'?'bg-[#00843d]':item.line==='DS2'?'bg-sky-600':'bg-amber-600';
            const safeCcNo=(item.ccNo||'').replace(/'/g,"\\'");
            const safeId=(item.id||'').replace(/'/g,"\\'");
            const isOnProcess=item.status==='ON PROCESS', isPaused=item.status==='PAUSED';
            const startClean=sanitizeTimeDisplay(item.startTime);
            const shiftNum=item.shift||1;
            const statusClass=isOnProcess?'bg-sky-100 text-sky-600 border-sky-200 animate-pulse'
                :isPaused?'bg-amber-100 text-amber-700 border-amber-200'
                :item.status==='COMPLETED'?'bg-emerald-100 text-emerald-600 border-emerald-200'
                :'bg-slate-100 text-slate-400';
            const statusText=isOnProcess?'ON PROCESS':isPaused?'⏸ PAUSED':item.status;
            const shiftBadge=(isOnProcess||isPaused)&&shiftNum>1
                ?`<span class="ml-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-600 border border-indigo-200 rounded text-[7px] font-black">SHIFT ${shiftNum}</span>`:''
            let actionBtns='';
            if(isOnProcess){
                actionBtns=`
                    <button onclick="openFinishModal('${safeId}','finish')" title="FINISH"
                        class="p-2 bg-emerald-500 ring-2 ring-emerald-300 text-white rounded-lg shadow-sm hover:scale-110 active:scale-95 transition-all">
                        <i data-lucide="check-square" class="w-4 h-4"></i></button>
                    <button onclick="openFinishModal('${safeId}','pause')" title="PAUSE — Ganti Shift"
                        class="p-2 bg-amber-500 ring-2 ring-amber-300 text-white rounded-lg shadow-sm hover:scale-110 active:scale-95 transition-all">
                        <i data-lucide="pause" class="w-4 h-4"></i></button>
                    <button onclick="openKendalaModal('${safeId}')" class="p-2 bg-rose-100 text-rose-600 rounded-lg hover:bg-rose-200 transition-all">
                        <i data-lucide="alert-circle" class="w-4 h-4"></i></button>`;
            } else if(isPaused){
                actionBtns=`
                    <button onclick="resumeProcess('${safeId}')" title="RESUME — Lanjut Shift ${shiftNum}"
                        class="p-2 bg-sky-500 ring-2 ring-sky-300 text-white rounded-lg shadow-sm hover:scale-110 active:scale-95 transition-all">
                        <i data-lucide="play-circle" class="w-4 h-4"></i></button>
                    <button onclick="openKendalaModal('${safeId}')" class="p-2 bg-rose-100 text-rose-600 rounded-lg hover:bg-rose-200 transition-all">
                        <i data-lucide="alert-circle" class="w-4 h-4"></i></button>`;
            } else {
                actionBtns=`
                    <button onclick="processScan('${safeCcNo}')" title="START"
                        class="p-2 bg-slate-800 text-white rounded-lg shadow-sm hover:scale-110 active:scale-95 transition-all">
                        <i data-lucide="play" class="w-4 h-4"></i></button>
                    <button onclick="openKendalaModal('${safeId}')" class="p-2 bg-rose-100 text-rose-600 rounded-lg hover:bg-rose-200 transition-all">
                        <i data-lucide="alert-circle" class="w-4 h-4"></i></button>`;
            }
            return `<tr class="hover:bg-slate-50 transition-all border-b border-slate-50">
                <td class="px-4 py-4 text-center"><span class="px-2 py-1 ${lc} text-white rounded text-[9px] font-black">${item.line}</span></td>
                <td class="px-4 py-4">
                    <div class="font-bold text-slate-800 leading-tight">${item.orderNo||'—'}</div>
                    ${item.customer?`<div class="text-[9px] text-slate-400 font-bold uppercase truncate max-w-[140px]">${item.customer}</div>`:''}
                </td>
                <td class="px-4 py-4 font-mono text-slate-600 font-bold">${item.ccNo||'—'}</td>
                <td class="px-4 py-4"><span class="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded font-bold text-[9px] uppercase">${item.spec||'—'}</span></td>
                <td class="px-4 py-4">${item.place?`<span class="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded font-bold text-[9px] uppercase">${item.place}</span>`:'<span class="text-slate-300 text-[9px]">—</span>'}</td>
                <td class="px-4 py-4 font-semibold text-slate-600 tracking-tight">${item.size||'—'}</td>
                <td class="px-4 py-4 text-center font-bold text-slate-700">${item.weight?item.weight.toLocaleString():'—'}</td>
                <td class="px-4 py-4 text-center">
                    <div class="flex flex-col items-center gap-1">
                        <span class="px-3 py-1 rounded-full text-[8px] font-black uppercase border ${statusClass}">${statusText}</span>
                        ${shiftBadge}
                        ${startClean!=='—'&&isOnProcess?`<div class="text-[7px] text-sky-500 font-black">▶ ${startClean}</div>`:''}
                        ${isPaused?`<div class="text-[7px] text-amber-600 font-black">⏸ Menunggu Shift ${shiftNum}</div>`:''}
                        ${item.kendala&&(isOnProcess||isPaused)?`<div class="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-100 border border-rose-200 rounded-full">
                            <span class="text-[7px] text-rose-600 font-black uppercase">⚠ ${item.kendala}</span>
                            ${item.kendalaWaktu?`<span class="text-[7px] text-rose-400 font-bold">${item.kendalaWaktu}mnt</span>`:''}</div>`:''}
                    </div>
                </td>
                <td class="px-4 py-4 text-center"><div class="flex gap-1 justify-center">${actionBtns}</div></td>
            </tr>`;
        }).join('');
    }
    safeCreateIcons();
}

function toggleDTColumns() { dtExpanded=!dtExpanded; renderTable(); }

// ================================================================
//  SCAN / PROCESS
// ================================================================
function processScan(val) {
    if(!val)return;
    const raw=val.trim(); let ccNo=parseQRCodeToCC(raw)||raw;
    let item=appData.find(i=>i.ccNo===ccNo);
    if(!item) item=appData.find(i=>i.ccNo.toUpperCase()===ccNo.toUpperCase());
    if(!item){const np=ccNo.replace(/^[Pp]/,'');item=appData.find(i=>i.ccNo===np||i.ccNo==='P'+np);}
    if(!item){showToast(`CC No. "${ccNo}" tidak ada di antrean!`,"error");return;}
    if(item.status==="WAITING"){
        item.status=  "ON PROCESS";
        item.startTime=getTimeString();
        item.shift=1;
        sendStartToServer(item);
        remoteStatusMap[item.ccNo+"|"+item.line]={status:"ON PROCESS",startTime:item.startTime};
        showToast(`▶ START Shift 1: ${item.ccNo}`,"success");
        renderTable();updateStats();
    } else if(item.status==="ON PROCESS"){
        openFinishModal(item.id,'finish');
    } else if(item.status==="PAUSED"){
        resumeProcess(item.id);
    } else {
        showToast(`${item.ccNo} sudah COMPLETED`,"error");
    }
}

function resumeProcess(id) {
    const item=appData.find(i=>i.id===id);
    if(!item||item.status!=='PAUSED')return;
    item.status=   "ON PROCESS";
    item.startTime=getTimeString();
    item.shift=   (item.shift||1)+1;
    item.kendala= '';item.kendalaWaktu='';
    sendResumeToServer(item);
    remoteStatusMap[item.ccNo+"|"+item.line]={status:"ON PROCESS",startTime:item.startTime};
    showToast(`▶ RESUME Shift ${item.shift}: ${item.ccNo}`,"success");
    renderTable();
}

// ================================================================
//  FINISH / PAUSE MODAL
// ================================================================
function updateDTTotal() {
    const ids=['dt-tbm','dt-packing','dt-waiting-mc','dt-waiting-crane','dt-winder','dt-cleaning','dt-problem','dt-other'];
    const total=ids.reduce((s,id)=>{const el=document.getElementById(id);return s+(parseFloat(el&&el.value||'0')||0);},0);
    const el=document.getElementById('dt-total-value'); if(el) el.textContent=total+' mnt';
}

// ★ addProductRow — 26-col: tambah Total Length & Coil Set Lifter
function addProductRow(qtyFG='',qtyNG='0',width='',totalSkid='0',cut='0',totalLength='0',coilSetLifter='0') {
    productRowCounter++;
    const rowId=productRowCounter;
    const container=document.getElementById('product-rows-container');
    const isFirst=container.children.length===0;
    const div=document.createElement('div');
    div.id=`product-row-${rowId}`;
    div.className='bg-slate-50 border border-slate-100 rounded-2xl p-4';
    div.innerHTML=`
        <div class="flex items-center justify-between mb-3">
            <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Produk #${rowId}</span>
            ${!isFirst?`<button onclick="removeProductRow(${rowId})" class="p-1.5 bg-rose-100 text-rose-500 rounded-lg hover:bg-rose-200 transition-all"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>`:''}
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <div>
                <label class="text-[9px] font-black text-slate-400 uppercase mb-1.5 block">Lebar / Prod Size (MM)</label>
                <input type="text" id="width-${rowId}" value="${width}" placeholder="0"
                    class="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm">
            </div>
            <div>
                <label class="text-[9px] font-black text-emerald-600 uppercase mb-1.5 block">Qty FG (KG)</label>
                <input type="number" id="fg-${rowId}" value="${qtyFG}" placeholder="0"
                    class="w-full px-3 py-2.5 bg-emerald-50 border border-emerald-100 rounded-xl font-black text-emerald-700 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm">
            </div>
            <div>
                <label class="text-[9px] font-black text-rose-500 uppercase mb-1.5 block">Qty NG (KG)</label>
                <input type="number" id="ng-${rowId}" value="${qtyNG}" placeholder="0"
                    class="w-full px-3 py-2.5 bg-rose-50 border border-rose-100 rounded-xl font-black text-rose-700 outline-none focus:ring-2 focus:ring-rose-500 transition-all text-sm">
            </div>
            <div>
                <label class="text-[9px] font-black text-indigo-600 uppercase mb-1.5 block">Total Skid</label>
                <input type="number" id="skid-${rowId}" value="${totalSkid}" placeholder="0"
                    class="w-full px-3 py-2.5 bg-indigo-50 border border-indigo-100 rounded-xl font-black text-indigo-700 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm">
            </div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
                <label class="text-[9px] font-black text-amber-600 uppercase mb-1.5 block">Cut</label>
                <input type="number" id="cut-${rowId}" value="${cut}" placeholder="0"
                    class="w-full px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-xl font-black text-amber-700 outline-none focus:ring-2 focus:ring-amber-500 transition-all text-sm">
            </div>
            <div>
                <label class="text-[9px] font-black text-sky-600 uppercase mb-1.5 block">★ Total Length (M)</label>
                <input type="number" id="totalLength-${rowId}" value="${totalLength}" placeholder="0"
                    class="w-full px-3 py-2.5 bg-sky-50 border border-sky-200 rounded-xl font-black text-sky-700 outline-none focus:ring-2 focus:ring-sky-500 transition-all text-sm">
            </div>
            <div>
                <label class="text-[9px] font-black text-purple-600 uppercase mb-1.5 block">★ Coil Set Set Lifter</label>
                <input type="number" id="coilSetLifter-${rowId}" value="${coilSetLifter}" placeholder="0"
                    class="w-full px-3 py-2.5 bg-purple-50 border border-purple-200 rounded-xl font-black text-purple-700 outline-none focus:ring-2 focus:ring-purple-500 transition-all text-sm">
            </div>
        </div>`;
    container.appendChild(div);
    safeCreateIcons();
}
function removeProductRow(rowId) { const el=document.getElementById(`product-row-${rowId}`);if(el)el.remove(); }

function openFinishModal(id, mode) {
    finishMode=mode||'finish'; finishingItemId=id;
    const item=appData.find(i=>i.id===id); if(!item)return;
    const isPauseMode=finishMode==='pause';
    const shiftNum=item.shift||1, nextShift=shiftNum+1;

    const headerEl =document.getElementById('finish-modal-header');
    const titleEl  =document.getElementById('finish-modal-title');
    const infoEl   =document.getElementById('finish-order-info');
    const btnEl    =document.getElementById('finish-submit-btn');
    const btnTextEl=document.getElementById('finish-submit-text');
    const iconEl   =document.getElementById('finish-submit-icon');
    const bannerEl =document.getElementById('finish-shift-banner');
    const bannerTxt=document.getElementById('finish-shift-info');

    if (isPauseMode) {
        if(headerEl)  headerEl.className='bg-amber-600 p-7 text-white flex justify-between items-start flex-shrink-0';
        if(titleEl)   titleEl.textContent=`JEDA PROSES — SHIFT ${shiftNum}`;
        if(infoEl)  { infoEl.innerText=`${item.orderNo||'?'} | ${item.ccNo}`; infoEl.style.color='#fef3c7'; }
        if(btnEl)     btnEl.className='w-full bg-amber-600 text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-amber-700 transition-all flex items-center justify-center gap-3';
        if(btnTextEl) btnTextEl.textContent=`Simpan Shift ${shiftNum} & Jeda`;
        if(iconEl)    iconEl.setAttribute('data-lucide','pause-circle');
        if(bannerEl)  bannerEl.classList.remove('hidden');
        if(bannerTxt) bannerTxt.textContent=`Data Shift ${shiftNum} akan disimpan ke laporan. Item TETAP ada di Waiting List untuk dilanjutkan Shift ${nextShift}.`;
    } else {
        if(headerEl)  headerEl.className='bg-[#0f172a] p-7 text-white flex justify-between items-start flex-shrink-0';
        if(titleEl)   titleEl.textContent=shiftNum>1?`FINISH PRODUKSI — SHIFT ${shiftNum}`:'FINISH PRODUKSI';
        if(infoEl)  { infoEl.innerText=`${item.orderNo||'?'} | ${item.ccNo}${shiftNum>1?' — Shift '+shiftNum:''}`; infoEl.style.color=''; }
        if(btnEl)     btnEl.className='w-full bg-[#0f172a] text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-3';
        if(btnTextEl) btnTextEl.textContent='Simpan & Selesaikan';
        if(iconEl)    iconEl.setAttribute('data-lucide','check-circle');
        if(bannerEl)  bannerEl.classList.add('hidden');
    }
    safeCreateIcons();

    // Clear all fields
    document.getElementById('finish-speed').value='';
    document.getElementById('finish-remark').value='';
    document.getElementById('finish-actual-width-mc').value='';
    document.getElementById('finish-produk-keluar').value='';
    ['dt-tbm','dt-packing','dt-waiting-mc','dt-waiting-crane','dt-winder','dt-cleaning','dt-problem','dt-other']
        .forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});

    // Pre-fill DT dari kendala
    if(item.kendala&&item.kendalaWaktu){
        const MAP={'TBM':'dt-tbm','PACKING COILBACK':'dt-packing','PACKING COIL BACK':'dt-packing',
            'WAITING M/C':'dt-waiting-mc','WAITING MC':'dt-waiting-mc',
            'WAITING CRANE':'dt-waiting-crane','WINDER TOP/END':'dt-winder',
            'CLEANING MACHINE':'dt-cleaning','PROBLEM MACHINE':'dt-problem'};
        const dtId=MAP[item.kendala.toUpperCase()]||'dt-other';
        const dtEl=document.getElementById(dtId);
        if(dtEl) dtEl.value=item.kendalaWaktu;
    }
    updateDTTotal();

    productRowCounter=0;
    document.getElementById('product-rows-container').innerHTML='';
    addProductRow();
    showModal('modal-finish');
}
function closeFinishModal(){hideModal('modal-finish');finishingItemId=null;finishMode='finish';}

function submitFinish() {
    if(!finishingItemId)return;
    const item=appData.find(i=>i.id===finishingItemId); if(!item)return;

    // ── Produk rows ──
    const container=document.getElementById('product-rows-container');
    const products=[];
    for(const row of container.querySelectorAll('[id^="product-row-"]')){
        const rId=row.id.replace('product-row-','');
        const fg=parseFloat(document.getElementById(`fg-${rId}`)?.value||'0')||0;
        if(fg<=0){showToast(`Qty FG produk #${rId} wajib diisi!`,"error");return;}
        products.push({
            width:(document.getElementById(`width-${rId}`)?.value||'').trim(),
            fg,
            ng:parseFloat(document.getElementById(`ng-${rId}`)?.value||'0')||0,
            totalSkid:parseFloat(document.getElementById(`skid-${rId}`)?.value||'0')||0,
            cut:parseFloat(document.getElementById(`cut-${rId}`)?.value||'0')||0,
            totalLength:parseFloat(document.getElementById(`totalLength-${rId}`)?.value||'0')||0,      // ★ NEW
            coilSetLifter:parseFloat(document.getElementById(`coilSetLifter-${rId}`)?.value||'0')||0   // ★ NEW
        });
    }
    if(!products.length){showToast("Minimal 1 produk wajib diisi!","error");return;}

    // ── Kolom baru header (global, bukan per produk) ──
    const actualWidthMC=(document.getElementById('finish-actual-width-mc')?.value||'').trim(); // ★ NEW
    const produkKeluar =(document.getElementById('finish-produk-keluar')?.value||'').trim();   // ★ NEW

    // ── DT values ──
    const gDT=id=>parseFloat(document.getElementById(id)?.value||'0')||0;
    const dtValues={
        tbm:gDT('dt-tbm'),packing:gDT('dt-packing'),wmc:gDT('dt-waiting-mc'),
        wcr:gDT('dt-waiting-crane'),wnd:gDT('dt-winder'),cln:gDT('dt-cleaning'),
        pbm:gDT('dt-problem'),oth:gDT('dt-other')
    };
    dtValues.total=dtValues.tbm+dtValues.packing+dtValues.wmc+dtValues.wcr+dtValues.wnd+dtValues.cln+dtValues.pbm+dtValues.oth;

    const speed    =document.getElementById('finish-speed').value;
    const remark   =document.getElementById('finish-remark').value;
    const now      =new Date();
    const actionTime=getTimeString(now);
    const dateStr  =now.toLocaleDateString('id-ID');
    const shiftNum =item.shift||1;

    // ════ PAUSE MODE ════
    if(finishMode==='pause'){
        sendPauseToServer(item, actionTime, products, dtValues, speed, remark,
            {actualWidthMC, produkKeluar});
        item.status='PAUSED'; item.pauseTime=actionTime;
        item.shift=shiftNum+1; item.kendala=''; item.kendalaWaktu='';
        remoteStatusMap[item.ccNo+"|"+item.line]={status:"PAUSED"};
        showToast(`⏸ Shift ${shiftNum} tersimpan — ${item.ccNo} menunggu Shift ${shiftNum+1}`,"success");
        closeFinishModal(); renderTable(); return;
    }

    // ════ FINISH MODE ════
    const remarkFinal=shiftNum>1?(remark?remark+' ':'')+'[Shift '+shiftNum+']':remark||'';
    products.forEach(prod=>{
        post({
            action:"FINISH",
            "DATE":dateStr,"ORDER NO":item.orderNo||"-","CC NO":item.ccNo||"-",
            "CUSTOMER":item.customer||"-","SPEC":item.spec||"-","SIZE":item.size||"-",
            "ACTUAL_WIDTH_MC":actualWidthMC||"",      // ★ NEW
            "WEIGHT":item.weight||0,"PRODUCT SIZE":prod.width||"-",
            "QTY FG":prod.fg,"QTY NG":prod.ng,
            "TOTAL SKID":prod.totalSkid||0,
            "TOTAL_LENGTH":prod.totalLength||0,       // ★ NEW
            "COIL_SET_LIFTER":prod.coilSetLifter||0,  // ★ NEW
            "START":item.startTime||"-","FINISH":actionTime,
            "PRODUK_KELUAR":produkKeluar||"",         // ★ NEW
            "DT_TBM":dtValues.tbm,"DT_PACKING":dtValues.packing,
            "DT_WAITING_MC":dtValues.wmc,"DT_WAITING_CRANE":dtValues.wcr,
            "DT_WINDER":dtValues.wnd,"DT_CLEANING":dtValues.cln,
            "DT_PROBLEM":dtValues.pbm,"DT_OTHER":dtValues.oth,
            "DOWN TIME":dtValues.total,
            "REMARK":remarkFinal||"-","LINE SPEED":speed||"0","LINE":item.line||"-"
        });
    });

    sendClearStatusToServer(item);
    delete remoteStatusMap[item.ccNo+"|"+item.line];

    item.status       ="COMPLETED";
    item.finishedAt   =actionTime;
    item.actualWidthMC=actualWidthMC;
    item.productWidth =products.map(p=>p.width).filter(Boolean).join(', ');
    item.qtyFG        =products.reduce((s,p)=>s+p.fg,0);
    item.qtyNG        =products.reduce((s,p)=>s+p.ng,0);
    item.totalSkid    =products.reduce((s,p)=>s+p.totalSkid,0);
    item.totalLength  =products.reduce((s,p)=>s+p.totalLength,0);
    item.coilSetLifter=products.reduce((s,p)=>s+p.coilSetLifter,0);
    item.produkKeluar =produkKeluar;
    item.dtTBM=dtValues.tbm;item.dtPacking=dtValues.packing;
    item.dtWaitingMC=dtValues.wmc;item.dtWaitingCrane=dtValues.wcr;
    item.dtWinder=dtValues.wnd;item.dtCleaning=dtValues.cln;
    item.dtProblem=dtValues.pbm;item.dtOther=dtValues.oth;
    item.kendalaWaktu=dtValues.total.toString();
    item.speed=speed;item.remark=remarkFinal;item.place=dateStr;

    appData=appData.filter(i=>i.id!==finishingItemId);
    finishData=[item,...finishData];
    try{
        const lf=JSON.parse(localStorage.getItem('hssi_finish_data')||'[]');
        lf.unshift(item);localStorage.setItem('hssi_finish_data',JSON.stringify(lf.slice(0,500)));
    }catch{}

    const sl=shiftNum>1?` (Shift ${shiftNum})`:'';
    showToast(`✓ ${item.ccNo} SELESAI${sl}${products.length>1?' ('+products.length+' produk)':''}` ,"success");
    closeFinishModal();renderTable();updateStats();
}

// ================================================================
//  KENDALA MODAL
// ================================================================
function openKendalaModal(id){
    selectedItemId=id;
    const item=appData.find(i=>i.id===id); if(!item)return;
    document.getElementById('modal-cc-info').innerText=`${item.orderNo||item.ccNo} | ${item.ccNo}`;
    document.getElementById('kendala-select').value='';
    document.getElementById('kendala-other-input').value='';
    document.getElementById('kendala-waktu-input').value=item.kendalaWaktu||'';
    document.getElementById('kendala-other-container').classList.add('hidden');
    showModal('modal-kendala');
}
function closeKendalaModal(){hideModal('modal-kendala');selectedItemId=null;}
function toggleOtherKendala(){
    document.getElementById('kendala-other-container').classList.toggle('hidden',
        document.getElementById('kendala-select').value!=='OTHER');
}
function saveKendala(){
    let jenis=document.getElementById('kendala-select').value;
    const waktu=document.getElementById('kendala-waktu-input').value;
    if(!jenis){showToast("Pilih jenis kendala!","error");return;}
    if(jenis==='OTHER') jenis=document.getElementById('kendala-other-input').value||"OTHER";
    const item=appData.find(i=>i.id===selectedItemId);
    if(item){
        item.kendala=jenis;item.kendalaWaktu=waktu;
        sendKendalaToServer(item);
        const key=item.ccNo+"|"+item.line;
        if(!remoteStatusMap[key]) remoteStatusMap[key]={status:item.status,startTime:item.startTime||""};
        remoteStatusMap[key].kendala=jenis;remoteStatusMap[key].kendalaWaktu=waktu;
        showToast(`⚠️ Kendala "${jenis}" dilaporkan!`);renderTable();closeKendalaModal();
    }
}

// ================================================================
//  CHARTS & STATS
// ================================================================
function initCharts(){
    [{id:'DS1',color:'#00843d'},{id:'DS2',color:'#0284c7'},{id:'DS3',color:'#d97706'}].forEach(l=>{
        const canvas=document.getElementById(`chart-${l.id.toLowerCase()}`);if(!canvas)return;
        charts[l.id]=new Chart(canvas.getContext('2d'),{
            type:'doughnut',
            data:{labels:['Antri','Selesai'],datasets:[{data:[1,0],backgroundColor:['#f1f5f9',l.color],borderWidth:0}]},
            options:{responsive:true,maintainAspectRatio:false,cutout:'75%',plugins:{legend:{display:false}}}
        });
    });
}
function updateStats(){
    ['DS1','DS2','DS3'].forEach(line=>{
        const done=finishData.filter(i=>i.line===line);
        const wait=appData.filter(i=>i.line===line);
        const ton=done.reduce((a,c)=>a+parseFloat(c.originalWeight||c.weight||0),0)/1000;
        const tEl=document.getElementById(`ton-${line.toLowerCase()}`);
        const cEl=document.getElementById(`count-${line.toLowerCase()}`);
        if(tEl)tEl.innerText=ton.toFixed(2);
        if(cEl)cEl.innerText=done.length+' Job Selesai';
        if(charts[line]){charts[line].data.datasets[0].data=[wait.length||1,done.length];charts[line].update();}
    });
}

// ================================================================
//  QR SCANNER
// ================================================================
function parseQRCodeToCC(raw){
    if(!raw||!raw.trim())return null;
    let str=raw.trim(),hasP=false;
    if(/^[Pp]/.test(str)){hasP=true;str=str.slice(1);}
    const m=str.match(/^([A-Za-z0-9\-]+)/);if(!m)return null;
    let cc=m[1].slice(0,16);if(hasP)cc='P'+cc;return cc;
}
async function toggleScanner(){
    const container=document.getElementById('scanner-container');
    if(scannerOpen){
        scannerOpen=false;container.classList.remove('open');
        if(html5QrCode){try{await html5QrCode.stop();html5QrCode.clear();}catch{}html5QrCode=null;}
        document.getElementById('last-scan-badge').classList.add('hidden');return;
    }
    scannerOpen=true;container.classList.add('open');safeCreateIcons();
    await new Promise(r=>setTimeout(r,200));
    html5QrCode=new Html5Qrcode("reader");
    try{
        await html5QrCode.start({facingMode:"environment"},{fps:15,qrbox:{width:240,height:240}},
            decodedText=>{
                if(lastScanLock)return;lastScanLock=true;setTimeout(()=>{lastScanLock=false;},1500);
                const ccNo=parseQRCodeToCC(decodedText);
                if(!ccNo){showToast("Format QR tidak dikenali!","error");return;}
                document.getElementById('last-scan-value').textContent=ccNo;
                document.getElementById('last-scan-badge').classList.remove('hidden');
                safeCreateIcons();
                if(navigator.vibrate)navigator.vibrate([100,50,100]);
                setTimeout(async()=>{await toggleScanner();processScan(ccNo);},800);
            },()=>{}
        );
    }catch(err){
        console.error("Camera error:",err);
        showToast("Gagal akses kamera. Cek izin browser!","error");
        scannerOpen=false;container.classList.remove('open');
    }
}
function submitManualMobile(){
    const val=(document.getElementById('manualInputMobile').value||'').trim();if(!val)return;
    const ccNo=parseQRCodeToCC(val)||val;
    if(ccNo.length<10){showToast("Format CC No. tidak valid!","error");return;}
    document.getElementById('manualInputMobile').value='';
    toggleScanner().then(()=>processScan(ccNo));
}
function triggerDesktopScan(){toggleScanner();}
function setupDesktopInput(){
    const input=document.getElementById('manualInput');if(!input)return;
    input.addEventListener('keydown',e=>{
        if(e.key==='Enter'){const raw=input.value.trim();if(!raw)return;const cc=parseQRCodeToCC(raw)||raw;input.value='';processScan(cc);}
    });
}

// ================================================================
//  PLANING & EXPORT PDF
// ================================================================
function openPlaningModal(){showModal('modal-planing');}
function closePlaningModal(){hideModal('modal-planing');}
function openPlaningSheet(line){
    const url=PLANING_EDIT_URLS[line];
    if(!url){showToast(`URL Planing ${line} belum dikonfigurasi!`,'error');return;}
    window.open(url,'_blank');closePlaningModal();
}
function openExportModal(){
    const l=document.getElementById('export-menu-label');
    if(l)l.textContent=activeMenu==='FINISH'?'FINISH PROCESS':'WAITING LIST';
    showModal('modal-export');
}
function closeExportModal(){hideModal('modal-export');}

function exportPDF(line){
    closeExportModal();
    const isFinish=activeMenu==='FINISH';
    const filtered=(isFinish?finishData:appData).filter(i=>line==='ALL'||i.line===line);
    if(!filtered.length){showToast(`Tidak ada data ${line} untuk di-export!`,'error');return;}
    const now=new Date();
    const dateStr=now.toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});
    const timeStr=now.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
    const lines=line==='ALL'?['DS1','DS2','DS3']:[line];
    const LC={DS1:'#00843d',DS2:'#0284c7',DS3:'#d97706'};

    const buildRows=items=>{
        if(!items.length)return`<tr><td colspan="26" style="text-align:center;color:#94a3b8;padding:24px">Tidak ada data</td></tr>`;
        if(isFinish){
            return items.map((item,idx)=>`<tr style="background:${idx%2===0?'#fff':'#f8fafc'};font-size:8px">
                <td style="padding:4px 6px;text-align:center">${idx+1}</td>
                <td style="font-family:monospace;padding:4px 6px">${item.ccNo||'—'}</td>
                <td style="padding:4px 6px">${item.customer||'—'}</td>
                <td style="padding:4px 6px">${item.spec||'—'}</td>
                <td style="padding:4px 6px;font-size:7px">${item.size||'—'}</td>
                <td style="padding:4px 6px;text-align:center;color:#4f46e5;font-weight:700">${item.actualWidthMC||'—'}</td>
                <td style="padding:4px 6px;text-align:right">${item.weight?Number(item.weight).toLocaleString('id-ID'):'—'}</td>
                <td style="padding:4px 6px;text-align:center">${item.productWidth||'—'}</td>
                <td style="padding:4px 6px;text-align:center">${item.qtyFG||'0'}</td>
                <td style="padding:4px 6px;text-align:center">${item.qtyNG||'0'}</td>
                <td style="padding:4px 6px;text-align:center">${item.totalSkid||'0'}</td>
                <td style="padding:4px 6px;text-align:center;color:#0284c7;font-weight:700">${item.totalLength||'0'}</td>
                <td style="padding:4px 6px;text-align:center;color:#7c3aed;font-weight:700">${item.coilSetLifter||'0'}</td>
                <td style="padding:4px 6px;text-align:center">${sanitizeTimeDisplay(item.startTime)}</td>
                <td style="padding:4px 6px;text-align:center">${sanitizeTimeDisplay(item.finishedAt)}</td>
                <td style="padding:4px 6px;text-align:center;color:#dc2626;font-weight:700">${item.produkKeluar||'—'}</td>
                <td style="text-align:center;background:#fff5f5;padding:4px 3px">${item.dtTBM||'0'}</td>
                <td style="text-align:center;background:#fff5f5;padding:4px 3px">${item.dtPacking||'0'}</td>
                <td style="text-align:center;background:#fff5f5;padding:4px 3px">${item.dtWaitingMC||'0'}</td>
                <td style="text-align:center;background:#fff5f5;padding:4px 3px">${item.dtWaitingCrane||'0'}</td>
                <td style="text-align:center;background:#fff5f5;padding:4px 3px">${item.dtWinder||'0'}</td>
                <td style="text-align:center;background:#fff5f5;padding:4px 3px">${item.dtCleaning||'0'}</td>
                <td style="text-align:center;background:#fff5f5;padding:4px 3px">${item.dtProblem||'0'}</td>
                <td style="text-align:center;background:#fff5f5;padding:4px 3px">${item.dtOther||'0'}</td>
                <td style="padding:4px 6px;font-size:7px">${item.remark||'—'}</td>
            </tr>`).join('');
        }else{
            return items.map((item,idx)=>`<tr style="background:${idx%2===0?'#fff':'#f8fafc'};font-size:9px">
                <td style="padding:5px 6px">${idx+1}</td>
                <td style="padding:5px 6px">${item.orderNo||'—'}</td>
                <td style="font-family:monospace;padding:5px 6px">${item.ccNo||'—'}</td>
                <td style="padding:5px 6px">${item.customer||'—'}</td>
                <td style="padding:5px 6px">${item.spec||'—'}</td>
                <td style="padding:5px 6px">${item.size||'—'}</td>
                <td style="text-align:right;padding:5px 6px">${item.weight?Number(item.weight).toLocaleString('id-ID'):'—'}</td>
                <td style="padding:5px 6px">${item.status}</td>
            </tr>`).join('');
        }
    };

    const buildSection=ln=>{
        const items=filtered.filter(i=>i.line===ln);
        const tw=items.reduce((s,i)=>s+parseFloat(i.weight||0),0);
        const color=LC[ln]||'#334155';
        const thead=isFinish
            ?`<tr style="background:#0f172a;color:white;font-size:8px;text-align:center">
               <th rowspan="2" style="padding:6px 4px">#</th>
               <th rowspan="2">CC No</th><th rowspan="2">Customer</th>
               <th rowspan="2">Spec</th><th rowspan="2">MC/Semi Size</th>
               <th rowspan="2" style="background:#312e81">Act.Width MC</th>
               <th rowspan="2">Weight</th><th rowspan="2">Prod Size</th>
               <th colspan="3" style="background:#064e3b">Qty</th>
               <th rowspan="2" style="background:#0c4a6e">Tot.Len</th>
               <th rowspan="2" style="background:#3b0764">Coil Set Lifter</th>
               <th rowspan="2">Start</th><th rowspan="2">Finish</th>
               <th rowspan="2" style="background:#7f1d1d">Prod.Keluar</th>
               <th colspan="8" style="background:#7f1d1d">Down Time (mnt)</th>
               <th rowspan="2">Remark</th>
               </tr><tr style="background:#1e293b;color:white;font-size:7px;text-align:center">
               <th>FG</th><th>NG</th><th>Skid</th>
               <th style="background:#991b1b">TBM</th><th style="background:#991b1b">PKG</th>
               <th style="background:#991b1b">W.MC</th><th style="background:#991b1b">W.CR</th>
               <th style="background:#991b1b">WND</th><th style="background:#991b1b">CLN</th>
               <th style="background:#991b1b">PBM</th><th style="background:#991b1b">OTH</th></tr>`
            :`<tr style="background:#0f172a;color:white;font-size:9px">
               <th>#</th><th>Order No</th><th>CC No</th><th>Customer</th>
               <th>Spec</th><th>Size</th><th>Weight</th><th>Status</th></tr>`;
        return`<div style="margin-bottom:28px">
            <div style="background:${color};color:white;padding:10px 16px;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;align-items:center">
                <div style="font-size:15px;font-weight:900;font-style:italic">DOWNSHEAR ${ln} <span style="font-size:9px;opacity:0.7">(${items.length} coil)</span></div>
                <div style="font-size:16px;font-weight:900">${(tw/1000).toFixed(3)} Ton</div>
            </div>
            <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;overflow:hidden">
                <table style="width:100%;border-collapse:collapse"><thead>${thead}</thead><tbody>${buildRows(items)}</tbody></table>
            </div></div>`;
    };

    const gw=filtered.reduce((s,i)=>s+parseFloat(i.weight||0),0);
    const html=`<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Report ${line}</title>
        <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;padding:16px}
        th,td{border-bottom:1px solid #f1f5f9;vertical-align:middle}
        @media print{@page{size:A3 landscape;margin:6mm}}</style></head><body>
        <div style="background:linear-gradient(135deg,#0f172a,#1e3a5f);color:white;padding:20px;border-radius:14px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center">
            <div>
                <div style="font-size:8px;opacity:0.6;letter-spacing:0.2em">PT. HSSI — PRODUCTION REPORT</div>
                <div style="font-size:20px;font-weight:900;font-style:italic">DOWNSHEAR MONITORING</div>
                <div style="color:#34d399;font-weight:700;margin-top:4px">${line==='ALL'?'ALL LINE':'LINE '+line} · ${isFinish?'FINISH PROCESS':'WAITING LIST'}</div>
            </div>
            <div style="text-align:right">
                <div style="font-size:16px;font-weight:900">${dateStr}</div>
                <div style="opacity:0.5;font-size:9px">Dicetak ${timeStr} WIB</div>
                <div style="display:flex;gap:8px;margin-top:8px;justify-content:flex-end">
                    <div style="background:rgba(255,255,255,.1);padding:5px 10px;border-radius:8px;text-align:center">
                        <div style="font-size:16px;font-weight:900">${filtered.length}</div>
                        <div style="font-size:7px;opacity:0.7">Total Coil</div></div>
                    <div style="background:rgba(52,211,153,.2);padding:5px 10px;border-radius:8px;text-align:center">
                        <div style="font-size:16px;font-weight:900">${(gw/1000).toFixed(3)}</div>
                        <div style="font-size:7px;opacity:0.7">Total Ton</div></div>
                </div>
            </div>
        </div>
        ${lines.map(buildSection).join('')}
        <div id="pb" style="display:flex;justify-content:center;gap:12px;margin-top:20px">
            <button onclick="window.print()" style="background:#0f172a;color:white;border:none;padding:10px 28px;border-radius:10px;font-weight:900;cursor:pointer">🖨️ Print / Save PDF</button>
            <button onclick="window.close()" style="background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;padding:10px 16px;border-radius:10px;font-weight:700;cursor:pointer">Tutup</button>
        </div>
        <script>window.onbeforeprint=()=>{document.getElementById('pb').style.display='none'};window.onafterprint=()=>{document.getElementById('pb').style.display='flex'};window.addEventListener('load',()=>{setTimeout(()=>window.print(),600)});<\/script>
        </body></html>`;
    const win=window.open('','_blank');
    if(!win){showToast('Popup diblokir!','error');return;}
    win.document.write(html);win.document.close();
    showToast(`Export PDF ${line} berhasil!`,'success');
}

// ================================================================
//  MODAL HELPERS
// ================================================================
function showModal(id){const el=document.getElementById(id);if(!el)return;el.classList.remove('hidden');el.classList.add('flex');safeCreateIcons();}
function hideModal(id){const el=document.getElementById(id);if(!el)return;el.classList.remove('flex');el.classList.add('hidden');}
function handleModalOverlayClick(event,modalId){if(event.target.id===modalId){hideModal(modalId);if(modalId==='modal-kendala')selectedItemId=null;}}
function handleSearch(){searchQuery=document.getElementById('searchInput').value.toLowerCase();renderTable();}
function setMainMenu(menu){
    activeMenu=menu;
    const ac="menu-nav px-8 md:px-16 py-4 rounded-3xl text-[11px] md:text-xs font-black uppercase tracking-widest transition-all bg-[#0f172a] text-white shadow-md";
    const ic="menu-nav px-8 md:px-16 py-4 rounded-3xl text-[11px] md:text-xs font-black uppercase tracking-widest transition-all text-slate-400 hover:text-slate-700";
    document.getElementById('btn-menu-WAITING').className=menu==='WAITING'?ac:ic;
    document.getElementById('btn-menu-FINISH').className=menu==='FINISH'?ac:ic;
    renderTable();
}
function setLine(line){
    activeLine=line;
    document.querySelectorAll('.line-nav').forEach(b=>{b.classList.remove('line-active','text-white');b.classList.add('text-slate-400');});
    const btn=document.getElementById(`btn-${line}`);if(btn){btn.classList.remove('text-slate-400');btn.classList.add('line-active');}
    renderTable();
}
function showToast(msg,type='success'){
    if(toastTimer)clearTimeout(toastTimer);
    const t=document.getElementById('toast');
    t.className=`fixed bottom-8 left-1/2 -translate-x-1/2 px-8 py-4 rounded-2xl font-black text-[11px] text-white shadow-2xl z-[150] flex items-center gap-3 uppercase tracking-widest animate-slide-up ${type==='success'?'bg-emerald-600':'bg-rose-600'}`;
    document.getElementById('toast-message').innerText=msg;
    t.classList.remove('hidden');
    toastTimer=setTimeout(()=>t.classList.add('hidden'),3000);
    safeCreateIcons();
}

// ================================================================
//  ORIENTATION & PWA
// ================================================================
function handleOrientation(){
    const overlay=document.getElementById('rotate-overlay');if(!overlay)return;
    const standalone=window.navigator.standalone===true||window.matchMedia('(display-mode: standalone)').matches||window.matchMedia('(display-mode: fullscreen)').matches;
    if(!standalone){overlay.classList.remove('show');return;}
    window.innerHeight>window.innerWidth?overlay.classList.add('show'):overlay.classList.remove('show');
}
function lockLandscape(){try{if(screen.orientation&&screen.orientation.lock)screen.orientation.lock('landscape').catch(()=>{});}catch(e){}}
window.addEventListener('resize',handleOrientation);
if(screen.orientation)screen.orientation.addEventListener('change',handleOrientation);

function hideInstallBtn(){['btn-install','btn-install-ios'].forEach(id=>{const el=document.getElementById(id);if(el){el.classList.add('hidden');el.classList.remove('flex');}});}
function triggerInstall(){
    const evt=window.__pwaInstallEvent;
    if(!evt){showToast('Buka di Chrome Android & coba lagi.','error');return;}
    evt.prompt();
    evt.userChoice.then(r=>{if(r.outcome==='accepted'){showToast('✅ Aplikasi berhasil diinstall!','success');hideInstallBtn();}window.__pwaInstallEvent=null;});
}
function openIosGuide(){showModal('modal-ios-guide');}
function closeIosGuide(){hideModal('modal-ios-guide');}
window.addEventListener('appinstalled',()=>{hideInstallBtn();window.__pwaInstallEvent=null;showToast('✅ Aplikasi berhasil diinstall!','success');});
if('serviceWorker'in navigator){
    navigator.serviceWorker.register('./sw.js').then(r=>console.log('[SW] registered:',r.scope)).catch(e=>console.warn('[SW] failed:',e));
}
