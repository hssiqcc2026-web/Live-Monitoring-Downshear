// ================================================================
//  HSSI DOWNSHEAR MONITORING — app.js
//  ★ FORMAT BARU: DT per-kendala, Total Skid, Cut
//  ★ FIX TIMEZONE: getTimeString() + sanitizeTimeDisplay()
// ================================================================

// ── CONFIG ──────────────────────────────────────────────────────
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
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyYye3gG20qxLBaqVrEJBm0jsjQG2wCE9gUqsIlsBETr_cdVxovtHcyB7uu3x1RaKWn/exec";
const PLANING_COL     = { order:2, cc:6, spec:8, size:10, weight:12, place:5, cust:19 };
const REFRESH_INTERVAL = 15000;

// ── STATE ────────────────────────────────────────────────────────
let appData          = [];
let finishData       = [];
let remoteStatusMap  = {};
let activeMenu       = 'WAITING';
let activeLine       = 'ALL';
let searchQuery      = '';
let selectedItemId   = null;
let finishingItemId  = null;
let html5QrCode      = null;
let charts           = {};
let scannerOpen      = false;
let lastScanLock     = false;
let dtExpanded       = false;   // ★ Toggle DT columns
let productRowCounter = 0;
let autoRefreshTimer = null;
let countdownTimer   = null;
let countdownValue   = REFRESH_INTERVAL / 1000;
let toastTimer       = null;

// ================================================================
//  ★ TIME HELPERS — FIX ZONA WAKTU
// ================================================================

/** Format HH:mm:ss tanpa bergantung locale browser */
function getTimeString(date) {
    const d = date || new Date();
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Bersihkan string waktu sebelum ditampilkan di UI.
 * Menangani: "Sat Dec 30 1899 01:41:28 GMT+0700 (Waktu Indochina)"
 * yang muncul karena Google Sheets auto-convert time → Date object.
 */
function sanitizeTimeDisplay(val) {
    if (!val || String(val).trim() === '' || String(val).trim() === '-') return '—';
    const s = String(val).trim();
    if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
    if (/^\d{2}\.\d{2}\.\d{2}$/.test(s)) return s.replace(/\./g, ':');
    const m = s.match(/(\d{2}:\d{2}:\d{2})/);
    if (m) return m[1];
    const md = s.match(/(\d{2})\.(\d{2})\.(\d{2})/);
    if (md) return `${md[1]}:${md[2]}:${md[3]}`;
    return s.length >= 8 ? s.slice(0, 8) : s;
}

// ================================================================
//  INIT
// ================================================================
window.onload = function () {
    safeCreateIcons();
    initCharts();
    setupDesktopInput();
    fetchAllData();
    startAutoRefresh();
    lockLandscape();
    handleOrientation();

    // PWA button init
    var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (!standalone) {
        var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
        if (ios) {
            var b = document.getElementById('btn-install-ios');
            if (b) { b.classList.remove('hidden'); b.classList.add('flex'); safeCreateIcons(); }
        } else {
            if (window.__pwaInstallEvent) {
                var b2 = document.getElementById('btn-install');
                if (b2) { b2.classList.remove('hidden'); b2.classList.add('flex'); safeCreateIcons(); }
            }
            window.addEventListener('beforeinstallprompt', function () {
                var b3 = document.getElementById('btn-install');
                if (b3) { b3.classList.remove('hidden'); b3.classList.add('flex'); safeCreateIcons(); }
            });
        }
    }
};

function safeCreateIcons() { if (typeof lucide !== 'undefined') lucide.createIcons(); }

// ================================================================
//  AUTO REFRESH + COUNTDOWN
// ================================================================
function startAutoRefresh() {
    clearAutoRefresh();
    countdownValue = REFRESH_INTERVAL / 1000;
    updateCountdownUI();
    autoRefreshTimer = setInterval(function () { fetchAllData(); countdownValue = REFRESH_INTERVAL / 1000; }, REFRESH_INTERVAL);
    countdownTimer   = setInterval(function () { countdownValue = Math.max(0, countdownValue - 1); updateCountdownUI(); }, 1000);
}
function clearAutoRefresh() {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    if (countdownTimer)   clearInterval(countdownTimer);
}
function updateCountdownUI() {
    var el = document.getElementById('sync-countdown');
    if (el) el.textContent = '(refresh ' + countdownValue + 's)';
}

// ================================================================
//  SERVER COMMUNICATION
// ================================================================
function sendStartToServer(item) {
    fetch(APPS_SCRIPT_URL, { method:'POST', mode:'no-cors', body: JSON.stringify({
        action: "START", "CC NO": item.ccNo, "LINE": item.line,
        "ORDER NO": item.orderNo||"-", "START TIME": item.startTime
    })}).catch(function(e){ console.warn("Gagal kirim START:", e); });
}

function sendClearStatusToServer(item) {
    fetch(APPS_SCRIPT_URL, { method:'POST', mode:'no-cors', body: JSON.stringify({
        action: "CLEAR_STATUS", "CC NO": item.ccNo, "LINE": item.line
    })}).catch(function(e){ console.warn("Gagal kirim CLEAR_STATUS:", e); });
}

function sendKendalaToServer(item) {
    fetch(APPS_SCRIPT_URL, { method:'POST', mode:'no-cors', body: JSON.stringify({
        action: "KENDALA", "CC NO": item.ccNo, "LINE": item.line,
        "ORDER NO": item.orderNo||"-", "KENDALA": item.kendala||"-",
        "KENDALA WAKTU": item.kendalaWaktu||"0"
    })}).catch(function(e){ console.warn("Gagal kirim KENDALA:", e); });
}

async function fetchRemoteStatus() {
    try {
        const res  = await fetch(APPS_SCRIPT_URL + "?action=GET_STATUS&t=" + Date.now());
        if (!res.ok) return;
        const json = await res.json();
        if (json && json.status === "ok" && Array.isArray(json.data)) {
            remoteStatusMap = {};
            json.data.forEach(function(row) {
                if (!row.ccNo || !row.line) return;
                const key = row.ccNo.trim() + "|" + row.line.trim().toUpperCase();
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
            Promise.all(Object.keys(SHEET_CONFIG.WAITING).map(async function(ln) {
                try { const r = await fetch(SHEET_CONFIG.WAITING[ln]+"&t="+Date.now()); return parseWaitingCSV(ln, await r.text()); } catch { return []; }
            })),
            Promise.all(Object.keys(SHEET_CONFIG.FINISH).map(async function(ln) {
                try { const r = await fetch(SHEET_CONFIG.FINISH[ln]+"&t="+Date.now()); if (!r.ok) return []; return parseFinishCSV(ln, await r.text()); } catch { return []; }
            }))
        ]);

        fetchRemoteStatus().then(function() { applyRemoteStatus(); renderTable(); updateStats(); });

        const isValidCC = function(cc) { return cc && cc.trim().length >= 3 && cc.trim() !== '-'; };
        let localFinish = [];
        try { localFinish = JSON.parse(localStorage.getItem('hssi_finish_data')||'[]').filter(function(lf){ return isValidCC(lf.ccNo); }); } catch {}

        finishData = rF.flat();
        localFinish.forEach(function(lf) {
            if (!finishData.find(function(mf){ return mf.ccNo===lf.ccNo && mf.line===lf.line; })) finishData.unshift(lf);
        });

        const newWaiting = rW.flat();
        appData = newWaiting.map(function(item) {
            const local = appData.find(function(e){ return e.ccNo===item.ccNo && e.line===item.line; });
            if (local && local.status === "ON PROCESS") {
                return Object.assign({}, item, {
                    status: "ON PROCESS",
                    startTime:    sanitizeTimeDisplay(local.startTime || ""),
                    kendala:      local.kendala      || "",
                    kendalaWaktu: local.kendalaWaktu || ""
                });
            }
            return item;
        });

        applyRemoteStatus();
        setSyncStatus('connected');
        renderTable();
        updateStats();
    } catch(err) { console.error("fetchAllData error:", err); setSyncStatus('error'); }
    finally {
        if (icon) icon.classList.remove('syncing');
        countdownValue = REFRESH_INTERVAL / 1000;
    }
}

function applyRemoteStatus() {
    appData = appData.map(function(item) {
        const key    = item.ccNo + "|" + item.line;
        const remote = remoteStatusMap[key];
        if (remote && remote.status === "ON PROCESS") {
            return Object.assign({}, item, {
                status:       "ON PROCESS",
                startTime:    remote.startTime    || item.startTime    || "",
                kendala:      remote.kendala      || item.kendala      || "",
                kendalaWaktu: remote.kendalaWaktu || item.kendalaWaktu || ""
            });
        }
        return item;
    });
}

function setSyncStatus(state) {
    const dot = document.getElementById('sync-dot'), text = document.getElementById('sync-status');
    if (!dot || !text) return;
    if (state === 'syncing') {
        dot.className = 'w-2 h-2 rounded-full bg-amber-400 pulse-dot inline-block';
        text.className = 'text-[10px] text-amber-400 font-bold uppercase tracking-[.2em]';
        text.textContent = 'SINKRONISASI...';
    } else if (state === 'connected') {
        dot.className = 'w-2 h-2 rounded-full bg-emerald-400 pulse-dot inline-block';
        text.className = 'text-[10px] text-emerald-400 font-bold uppercase tracking-[.2em]';
        text.textContent = 'TERHUBUNG KE SERVER';
    } else {
        dot.className = 'w-2 h-2 rounded-full bg-rose-400 inline-block';
        text.className = 'text-[10px] text-rose-400 font-bold uppercase tracking-[.2em]';
        text.textContent = 'GAGAL TERHUBUNG';
    }
}

// ================================================================
//  CSV PARSERS
// ================================================================
function parseCSVLine(row) {
    let arr=[], cur="", q=false;
    for (let c of row) {
        if (c==='"') q=!q;
        else if (c===',' && !q) { arr.push(cur.trim()); cur=""; }
        else cur+=c;
    }
    arr.push(cur.trim());
    return arr;
}

function parseWaitingCSV(line, text) {
    const rows = text.split(/\r?\n/).map(function(r){ return parseCSVLine(r); });
    if (rows.length < 2) return [];
    let hIdx = 0;
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
        const t = rows[i].join(' ').toUpperCase();
        if (t.includes('PACKING')||t.includes('ORDER NO')||t.includes('PROCESS ORDER')||t.includes('CC NO')) { hIdx = i; break; }
    }
    const headers = rows[hIdx].map(function(h){ return (h||'').toUpperCase().replace(/\s+/g,' ').trim(); });
    const autoOrder = headers.findIndex(function(h){ return h==='ORDER NO'||h==='ORDER'||h==='NO ORDER'||h==='PROCESS ORDER'; });
    const autoCC    = headers.findIndex(function(h){ return h.includes('CC NO')||h.includes('CCNO')||h.includes('PACKING NO')||h.includes('PACK NO'); });
    const C = {
        order: autoOrder!==-1 ? autoOrder : PLANING_COL.order,
        cc:    autoCC   !==-1 ? autoCC    : PLANING_COL.cc,
        spec:  PLANING_COL.spec, size: PLANING_COL.size, weight: PLANING_COL.weight,
        place: PLANING_COL.place, cust: PLANING_COL.cust
    };
    return rows.slice(hIdx+1).filter(function(r){ return r[C.cc] && r[C.cc].trim().length > 3; }).map(function(r, i) {
        const w = parseFloat((r[C.weight]||'0').replace(/[^\d.]/g,'')) || 0;
        return {
            id: `${line}-W-${i}-${(r[C.cc]||'').trim()}`, line,
            orderNo:  (r[C.order]||'').trim(), customer: (r[C.cust] ||'').trim(),
            ccNo:     (r[C.cc]   ||'').trim(), spec:     (r[C.spec] ||'').trim(),
            place:    (r[C.place]||'').trim(), size:     (r[C.size] ||'').trim(),
            weight: w, originalWeight: w, status: 'WAITING',
            kendala: '', kendalaWaktu: '', startTime: ''
        };
    });
}

/**
 * ★ PARSER FINISH — mendukung FORMAT LAMA (16 col) dan FORMAT BARU (22 col)
 *    Format baru: header 2 baris, DT per-kendala, Total Skid, Cut
 */
function parseFinishCSV(line, text) {
    const rows = text.split(/\r?\n/).map(function(r){ return parseCSVLine(r); });
    if (rows.length < 2) return [];

    // ── Deteksi format & cari baris header ──
    let hIdx = -1, hIdx2 = -1, isNew = false;
    for (let i = 0; i < Math.min(rows.length, 8); i++) {
        const t1 = rows[i].join(' ').toUpperCase();
        const t2 = (rows[i+1]||[]).join(' ').toUpperCase();
        // Format baru: baris i punya "CC NO", baris i+1 punya "FINISH GOOD" / "TBM"
        if ((t1.includes('CC NO')||t1.includes('PRODUCT SIZE')) &&
            (t2.includes('FINISH GOOD')||t2.includes('TBM')||t2.includes('NOT GOOD'))) {
            hIdx = i; hIdx2 = i+1; isNew = true; break;
        }
        // Format lama: satu baris dengan QTY FG / ORDER NO + DATE
        if (t1.includes('QTY FG')||t1.includes('QTYFG')||
           (t1.includes('ORDER NO')&&t1.includes('DATE'))) {
            hIdx = i; isNew = false; break;
        }
    }
    if (hIdx === -1) return [];

    // ── Gabungkan header (h2 prioritas jika tidak kosong) ──
    const h1 = rows[hIdx].map(function(h){ return (h||'').toUpperCase().replace(/\s+/g,' ').trim(); });
    const h2 = isNew ? rows[hIdx2].map(function(h){ return (h||'').toUpperCase().replace(/\s+/g,' ').trim(); }) : [];
    const headers = h1.map(function(h, i){ return (isNew && h2[i]) ? h2[i] : h; });

    const fi      = function(kws){ return headers.findIndex(function(h){ return kws.some(function(k){ return h.includes(k); }); }); };
    const fiExact = function(kws){ return headers.findIndex(function(h){ return kws.includes(h); }); };

    const mcSizeIdx = fi(['MC / SEMI', 'SEMI PRODUCT']);
    const col = {
        cc:          fi(['CC NO','CCNO','PACKING NO','PACK NO','IDENTITY']),
        cust:        fi(['CUSTOMER','PEMBELI']),
        spec:        fi(['SPEC','MUTU','GRADE']),
        size:        mcSizeIdx !== -1 ? mcSizeIdx : fiExact(['SIZE']),
        weight:      fi(['WEIGHT','BERAT']),
        productSize: fiExact(['PRODUCT SIZE']),
        qtyFG:       fi(['FINISH GOOD','QTY FG','QTYFG']),
        qtyNG:       fi(['NOT GOOD','QTY NG','QTYNG']),
        totalSkid:   fi(['TOTAL SKID']),
        cut:         fiExact(['CUT']),
        start:       fi(['START PROCESS','START','MULAI']),
        finish:      fi(['END PROCESS','FINISH','SELESAI']),
        dtTBM:       fiExact(['TBM']),
        dtPacking:   fi(['PACKING COIL BACK','PACKING COILBACK']),
        dtWaitingMC: fi(['WAITING MC','WAITING M/C']),
        dtWaitingCrane: fi(['WAITING CRANE']),
        dtWinder:    fi(['WINDER TOP/END','WINDER TOP']),
        dtCleaning:  fi(['CLEANING MACHINE','CLEANING']),
        dtProblem:   fi(['PROBLEM MACHINE']),
        dtOther:     fiExact(['OTHER']),
        downTime:    fi(['DOWN TIME','DOWNTIME']),
        remark:      fi(['REMARK','CATATAN']),
        speed:       fi(['LINE SPEED','SPEED']),
        lineCol:     fiExact(['LINE']),
        order:       fi(['ORDER NO','ORDER','NO ORDER']),
        date:        fi(['DATE','TGL'])
    };

    const dataStart = isNew ? hIdx2+1 : hIdx+1;
    const anchor    = col.cc !== -1 ? col.cc : 1;

    return rows.slice(dataStart).filter(function(r) {
        if (!r||r.length<=1) return false;
        const v = (r[anchor]||'').trim();
        return v.length >= 3 && v !== '-' && v !== '--';
    }).map(function(r, i) {
        const g  = function(c){ return c !== -1 ? (r[c]||'').trim() : ''; };
        const ccVal = g(col.cc);
        let lineVal = line;
        if (col.lineCol !== -1 && r[col.lineCol]) {
            const lv = r[col.lineCol].trim().toUpperCase().replace(/\s+/g,'');
            if (['DS1','DS2','DS3'].includes(lv)) lineVal = lv;
        }
        const dtTBM = g(col.dtTBM)||'0', dtPacking = g(col.dtPacking)||'0',
              dtWMC = g(col.dtWaitingMC)||'0', dtWCR = g(col.dtWaitingCrane)||'0',
              dtWND = g(col.dtWinder)||'0', dtCLN = g(col.dtCleaning)||'0',
              dtPBM = g(col.dtProblem)||'0', dtOTH = g(col.dtOther)||'0';
        const totalDT = isNew
            ? [dtTBM,dtPacking,dtWMC,dtWCR,dtWND,dtCLN,dtPBM,dtOTH].reduce(function(s,v){ return s+(parseFloat(v)||0); }, 0)
            : (parseFloat(g(col.downTime))||0);
        return {
            id: `${line}-F-${i}-${ccVal}`, line: lineVal,
            orderNo:     g(col.order)||'-', customer: g(col.cust),
            ccNo: ccVal, spec: g(col.spec), place: g(col.date)||'',
            size: g(col.size),
            weight:      parseFloat(g(col.weight).replace(/[^\d.]/g,''))||0,
            productWidth: g(col.productSize),
            qtyFG:       g(col.qtyFG)||'0', qtyNG: g(col.qtyNG)||'0',
            totalSkid:   g(col.totalSkid)||'0', cut: g(col.cut)||'0',
            startTime:   sanitizeTimeDisplay(g(col.start)),
            finishedAt:  sanitizeTimeDisplay(g(col.finish)),
            dtTBM, dtPacking, dtWaitingMC: dtWMC, dtWaitingCrane: dtWCR,
            dtWinder: dtWND, dtCleaning: dtCLN, dtProblem: dtPBM, dtOther: dtOTH,
            kendalaWaktu: totalDT.toString(),
            remark: g(col.remark), speed: g(col.speed)||'0', status: 'COMPLETED'
        };
    });
}

// ================================================================
//  RENDER TABLE
// ================================================================
function renderTableHeader() {
    const thead = document.getElementById('table-head');
    if (!thead) return;
    const th = 'px-3 py-5 whitespace-nowrap', thC = th+' text-center';

    if (activeMenu === 'FINISH') {
        const dtHeader = dtExpanded
            ? `<th class="${thC} bg-rose-900/80 text-rose-100 dt-th-toggle text-[9px]" onclick="toggleDTColumns()" title="Klik untuk collapse">▲ TBM</th>
               <th class="${thC} bg-rose-900/80 text-rose-100 text-[9px]">PKG</th>
               <th class="${thC} bg-rose-900/80 text-rose-100 text-[9px]">W.MC</th>
               <th class="${thC} bg-rose-900/80 text-rose-100 text-[9px]">W.CR</th>
               <th class="${thC} bg-rose-900/80 text-rose-100 text-[9px]">WND</th>
               <th class="${thC} bg-rose-900/80 text-rose-100 text-[9px]">CLN</th>
               <th class="${thC} bg-rose-900/80 text-rose-100 text-[9px]">PBM</th>
               <th class="${thC} bg-rose-900/80 text-rose-100 text-[9px]">OTH</th>`
            : `<th class="${thC} dt-th-toggle hover:bg-emerald-700 transition-all" onclick="toggleDTColumns()" title="Klik untuk lihat detail per kendala">▼ Down Time</th>`;
        thead.innerHTML = `<tr class="bg-emerald-900/90 text-[10px] font-black text-emerald-100 uppercase tracking-[.12em]">
            <th class="${thC}">Line</th><th class="${th}">CC No</th><th class="${th}">Customer</th>
            <th class="${th}">Spec</th><th class="${th}">Input Size</th><th class="${thC}">Weight</th>
            <th class="${thC}">Prod Size</th><th class="${thC}">QFG</th><th class="${thC}">QNG</th>
            <th class="${thC}">Skid</th><th class="${thC}">Cut</th>
            <th class="${thC}">Start</th><th class="${thC}">Finish</th>
            ${dtHeader}
            <th class="${th}">Remark</th></tr>`;
    } else {
        thead.innerHTML = `<tr class="bg-slate-50/50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-[.15em]">
            <th class="${thC}">Line</th><th class="${th}">Order / Customer</th><th class="${th}">Packing No</th>
            <th class="${th}">Spec</th><th class="${th}">Place</th><th class="${th}">Size</th>
            <th class="${thC}">Berat (KG)</th><th class="${thC}">Status</th><th class="${thC}">Aksi</th></tr>`;
    }
}

function renderTable() {
    renderTableHeader();
    const tbody = document.getElementById('table-body');
    if (!tbody) return;
    const isFinish = activeMenu === 'FINISH';
    let data = (isFinish ? finishData : appData).filter(function(i){ return activeLine==='ALL' || i.line===activeLine; });
    if (searchQuery) data = data.filter(function(i){ return JSON.stringify(i).toLowerCase().includes(searchQuery); });

    const emptyColspan = isFinish ? (dtExpanded ? 22 : 15) : 9;
    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="${emptyColspan}" class="py-20 text-center text-slate-400 italic font-medium">Data tidak ditemukan...</td></tr>`;
        return;
    }

    if (isFinish) {
        tbody.innerHTML = data.map(function(item) {
            const lc  = item.line==='DS1'?'bg-[#00843d]':item.line==='DS2'?'bg-sky-600':'bg-amber-600';
            const td  = 'px-3 py-3 text-[11px] text-slate-700 whitespace-nowrap';
            const tdc = td+' text-center';
            const sc  = sanitizeTimeDisplay(item.startTime);
            const fc  = sanitizeTimeDisplay(item.finishedAt);
            const dtCols = dtExpanded
                ? `<td class="${tdc}">${item.dtTBM||'0'}</td>
                   <td class="${tdc}">${item.dtPacking||'0'}</td>
                   <td class="${tdc}">${item.dtWaitingMC||'0'}</td>
                   <td class="${tdc}">${item.dtWaitingCrane||'0'}</td>
                   <td class="${tdc}">${item.dtWinder||'0'}</td>
                   <td class="${tdc}">${item.dtCleaning||'0'}</td>
                   <td class="${tdc}">${item.dtProblem||'0'}</td>
                   <td class="${tdc}">${item.dtOther||'0'}</td>`
                : `<td class="${tdc}">${parseFloat(item.kendalaWaktu)>0
                    ? `<span class="px-2 py-0.5 bg-rose-50 text-rose-600 border border-rose-100 rounded font-bold text-[9px]">${item.kendalaWaktu} mnt</span>`
                    : '<span class="text-slate-300 text-[9px]">0</span>'}</td>`;
            return `<tr class="hover:bg-emerald-50/40 transition-all border-b border-slate-50">
                <td class="${tdc}"><span class="px-2 py-1 ${lc} text-white rounded text-[9px] font-black">${item.line}</span></td>
                <td class="${td} font-mono font-bold text-xs">${item.ccNo||'—'}</td>
                <td class="${td}">${item.customer||'—'}</td>
                <td class="${td}"><span class="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded font-bold text-[9px] uppercase">${item.spec||'—'}</span></td>
                <td class="${td} text-xs max-w-[140px] truncate">${item.size||'—'}</td>
                <td class="${tdc} font-bold">${item.weight?item.weight.toLocaleString():'—'}</td>
                <td class="${tdc}">${item.productWidth||'—'}</td>
                <td class="${tdc}"><span class="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded font-bold text-[9px]">${item.qtyFG||'—'}</span></td>
                <td class="${tdc}"><span class="px-2 py-0.5 ${parseFloat(item.qtyNG)>0?'bg-rose-50 text-rose-600 border border-rose-100':'bg-slate-50 text-slate-400'} rounded font-bold text-[9px]">${item.qtyNG||'0'}</span></td>
                <td class="${tdc}">${item.totalSkid||'—'}</td>
                <td class="${tdc}">${item.cut||'—'}</td>
                <td class="${tdc} text-slate-500">${sc}</td>
                <td class="${tdc} text-slate-500">${fc}</td>
                ${dtCols}
                <td class="${td} max-w-[120px] truncate text-slate-500">${item.remark||'—'}</td>
            </tr>`;
        }).join('');
    } else {
        tbody.innerHTML = data.map(function(item) {
            const lc = item.line==='DS1'?'bg-[#00843d]':item.line==='DS2'?'bg-sky-600':'bg-amber-600';
            const sc = (item.ccNo||'').replace(/'/g,"\\'"), si = (item.id||'').replace(/'/g,"\\'");
            const onProc = item.status === 'ON PROCESS';
            const startClean = sanitizeTimeDisplay(item.startTime);
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
                    <span class="px-3 py-1 rounded-full text-[8px] font-black uppercase ${onProc?'bg-sky-100 text-sky-600 border border-sky-200 animate-pulse':item.status==='COMPLETED'?'bg-emerald-100 text-emerald-600 border border-emerald-200':'bg-slate-100 text-slate-400'}">${item.status}</span>
                    ${startClean!=='—'&&onProc?`<div class="text-[7px] text-sky-500 font-black mt-0.5">▶ Start: ${startClean}</div>`:''}
                    ${item.kendala?`<div class="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-rose-100 border border-rose-200 rounded-full"><span class="text-[7px] text-rose-600 font-black uppercase">⚠ ${item.kendala}</span>${item.kendalaWaktu?`<span class="text-[7px] text-rose-400 font-bold">${item.kendalaWaktu}mnt</span>`:''}</div>`:''}
                </td>
                <td class="px-4 py-4 text-center">
                    <div class="flex gap-1 justify-center">
                        <button onclick="processScan('${sc}')" title="${onProc?'FINISH':'START'}"
                            class="p-2 ${onProc?'bg-emerald-500 ring-2 ring-emerald-300':'bg-slate-800'} text-white rounded-lg shadow-sm hover:scale-110 active:scale-95 transition-all">
                            <i data-lucide="${onProc?'check-square':'play'}" class="w-4 h-4"></i>
                        </button>
                        <button onclick="openKendalaModal('${si}')" class="p-2 bg-rose-100 text-rose-600 rounded-lg hover:bg-rose-200 transition-all">
                            <i data-lucide="alert-circle" class="w-4 h-4"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }
    safeCreateIcons();
}

/** ★ Toggle kolom DT individual */
function toggleDTColumns() { dtExpanded = !dtExpanded; renderTable(); }

// ================================================================
//  SCAN / PROCESS
// ================================================================
function processScan(val) {
    if (!val) return;
    const raw = val.trim();
    let ccNo  = parseQRCodeToCC(raw) || raw;
    let item  = appData.find(function(i){ return i.ccNo===ccNo; });
    if (!item) item = appData.find(function(i){ return i.ccNo.toUpperCase()===ccNo.toUpperCase(); });
    if (!item) { const np=ccNo.replace(/^[Pp]/,''); item=appData.find(function(i){ return i.ccNo===np||i.ccNo==='P'+np; }); }
    if (!item) { showToast(`CC No. "${ccNo}" tidak ada di antrean!`,"error"); return; }

    if (item.status === "WAITING") {
        item.status    = "ON PROCESS";
        item.startTime = getTimeString(); // ★ FIX timezone
        sendStartToServer(item);
        remoteStatusMap[item.ccNo+"|"+item.line] = { status:"ON PROCESS", startTime:item.startTime };
        showToast(`▶ START: ${item.ccNo}`,"success");
        renderTable(); updateStats();
    } else if (item.status === "ON PROCESS") {
        openFinishModal(item.id);
    } else {
        showToast(`${item.ccNo} sudah COMPLETED`,"error");
    }
}

// ================================================================
//  FINISH MODAL  ★ FORMAT BARU
// ================================================================

/** ★ Down Time total updater */
function updateDTTotal() {
    const ids = ['dt-tbm','dt-packing','dt-waiting-mc','dt-waiting-crane','dt-winder','dt-cleaning','dt-problem','dt-other'];
    const total = ids.reduce(function(s,id){ const el=document.getElementById(id); return s+(parseFloat(el&&el.value||'0')||0); }, 0);
    const el = document.getElementById('dt-total-value');
    if (el) el.textContent = total + ' mnt';
}

/** ★ Product row: 5 fields (Lebar, QFG, QNG, Total Skid, Cut) */
function addProductRow(qtyFG, qtyNG, width, totalSkid, cut) {
    qtyFG = qtyFG||''; qtyNG = qtyNG||'0'; width = width||''; totalSkid = totalSkid||'0'; cut = cut||'0';
    productRowCounter++;
    const rowId = productRowCounter;
    const container = document.getElementById('product-rows-container');
    const isFirst   = container.children.length === 0;
    const div = document.createElement('div');
    div.id = `product-row-${rowId}`;
    div.className = 'bg-slate-50 border border-slate-100 rounded-2xl p-4';
    div.innerHTML = `
        <div class="flex items-center justify-between mb-3">
            <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Produk #${rowId}</span>
            ${!isFirst?`<button onclick="removeProductRow(${rowId})" class="p-1.5 bg-rose-100 text-rose-500 rounded-lg hover:bg-rose-200 transition-all"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>`:''}
        </div>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
                <label class="text-[9px] font-black text-slate-400 uppercase mb-1.5 block">Lebar (MM)</label>
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
            <div>
                <label class="text-[9px] font-black text-amber-600 uppercase mb-1.5 block">Cut</label>
                <input type="number" id="cut-${rowId}" value="${cut}" placeholder="0"
                    class="w-full px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-xl font-black text-amber-700 outline-none focus:ring-2 focus:ring-amber-500 transition-all text-sm">
            </div>
        </div>`;
    container.appendChild(div);
    safeCreateIcons();
}

function removeProductRow(rowId) { const el=document.getElementById(`product-row-${rowId}`); if(el)el.remove(); }

function openFinishModal(id) {
    finishingItemId = id;
    const item = appData.find(function(i){ return i.id===id; });
    if (!item) return;
    document.getElementById('finish-order-info').innerText = `${item.orderNo||'?'} | ${item.ccNo}`;
    document.getElementById('finish-speed').value  = "";
    document.getElementById('finish-remark').value = "";

    // Clear semua DT fields
    ['dt-tbm','dt-packing','dt-waiting-mc','dt-waiting-crane','dt-winder','dt-cleaning','dt-problem','dt-other']
        .forEach(function(id){ const el=document.getElementById(id); if(el) el.value=''; });

    // Pre-fill DT dari item.kendala (laporan sebelumnya via tombol Kendala)
    if (item.kendala && item.kendalaWaktu) {
        const MAP = {
            'TBM':'dt-tbm','PACKING COILBACK':'dt-packing','PACKING COIL BACK':'dt-packing',
            'WAITING M/C':'dt-waiting-mc','WAITING MC':'dt-waiting-mc',
            'WAITING CRANE':'dt-waiting-crane','WINDER TOP/END':'dt-winder',
            'CLEANING MACHINE':'dt-cleaning','PROBLEM MACHINE':'dt-problem'
        };
        const dtId = MAP[item.kendala.toUpperCase()] || 'dt-other';
        const dtEl = document.getElementById(dtId);
        if (dtEl) dtEl.value = item.kendalaWaktu;
    }
    updateDTTotal();

    productRowCounter = 0;
    document.getElementById('product-rows-container').innerHTML = '';
    addProductRow();
    showModal('modal-finish');
}

function closeFinishModal() { hideModal('modal-finish'); finishingItemId = null; }

function submitFinish() {
    if (!finishingItemId) return;
    const item = appData.find(function(i){ return i.id===finishingItemId; });
    if (!item) return;

    // ── Kumpulkan data produk ──
    const container = document.getElementById('product-rows-container');
    const products  = [];
    for (const row of container.querySelectorAll('[id^="product-row-"]')) {
        const rId = row.id.replace('product-row-','');
        const fg   = parseFloat(document.getElementById(`fg-${rId}`)?.value||'0')||0;
        const ng   = parseFloat(document.getElementById(`ng-${rId}`)?.value||'0')||0;
        const w    = (document.getElementById(`width-${rId}`)?.value||'').trim();
        const skid = parseFloat(document.getElementById(`skid-${rId}`)?.value||'0')||0;
        const cut  = parseFloat(document.getElementById(`cut-${rId}`)?.value||'0')||0;
        if (fg <= 0) { showToast(`Qty FG produk #${rId} wajib diisi!`,"error"); return; }
        products.push({ width:w, fg, ng, totalSkid:skid, cut });
    }
    if (!products.length) { showToast("Minimal 1 produk wajib diisi!","error"); return; }

    // ── Kumpulkan Down Time per kendala ──
    const gDT = function(id){ return parseFloat(document.getElementById(id)?.value||'0')||0; };
    const dtTBM = gDT('dt-tbm'), dtPacking = gDT('dt-packing'),
          dtWMC = gDT('dt-waiting-mc'), dtWCR = gDT('dt-waiting-crane'),
          dtWND = gDT('dt-winder'),    dtCLN = gDT('dt-cleaning'),
          dtPBM = gDT('dt-problem'),   dtOTH = gDT('dt-other');
    const totalDT = dtTBM+dtPacking+dtWMC+dtWCR+dtWND+dtCLN+dtPBM+dtOTH;

    const speed     = document.getElementById('finish-speed').value;
    const remark    = document.getElementById('finish-remark').value;
    const now        = new Date();
    const finishTime = getTimeString(now); // ★ FIX timezone
    const dateStr    = now.toLocaleDateString('id-ID');

    // ── Kirim ke Apps Script ──
    products.forEach(function(prod) {
        fetch(APPS_SCRIPT_URL, { method:'POST', mode:'no-cors', body: JSON.stringify({
            action:"FINISH",
            "DATE":dateStr, "ORDER NO":item.orderNo||"-", "CC NO":item.ccNo||"-",
            "CUSTOMER":item.customer||"-", "SPEC":item.spec||"-", "SIZE":item.size||"-",
            "WEIGHT":item.weight||0, "PRODUCT SIZE":prod.width||"-",
            "QTY FG":prod.fg, "QTY NG":prod.ng,
            "TOTAL SKID":prod.totalSkid||0, "CUT":prod.cut||0,
            "START":item.startTime||"-", "FINISH":finishTime,
            "DT_TBM":dtTBM, "DT_PACKING":dtPacking, "DT_WAITING_MC":dtWMC,
            "DT_WAITING_CRANE":dtWCR, "DT_WINDER":dtWND, "DT_CLEANING":dtCLN,
            "DT_PROBLEM":dtPBM, "DT_OTHER":dtOTH,
            "DOWN TIME":totalDT, // backwards compat
            "REMARK":remark||(item.kendala?`Kendala: ${item.kendala}`:"-"),
            "LINE SPEED":speed||"0", "LINE":item.line||"-"
        })});
    });

    sendClearStatusToServer(item);
    delete remoteStatusMap[item.ccNo+"|"+item.line];

    // ── Update state lokal ──
    item.status       = "COMPLETED";
    item.finishedAt   = finishTime;
    item.productWidth = products.map(function(p){ return p.width; }).filter(Boolean).join(', ');
    item.qtyFG        = products.reduce(function(s,p){ return s+p.fg; }, 0);
    item.qtyNG        = products.reduce(function(s,p){ return s+p.ng; }, 0);
    item.totalSkid    = products.reduce(function(s,p){ return s+p.totalSkid; }, 0);
    item.cut          = products.reduce(function(s,p){ return s+p.cut; }, 0);
    item.dtTBM=dtTBM; item.dtPacking=dtPacking; item.dtWaitingMC=dtWMC;
    item.dtWaitingCrane=dtWCR; item.dtWinder=dtWND; item.dtCleaning=dtCLN;
    item.dtProblem=dtPBM; item.dtOther=dtOTH;
    item.kendalaWaktu = totalDT.toString();
    item.speed        = speed;
    item.remark       = remark;
    item.place        = dateStr;

    appData    = appData.filter(function(i){ return i.id!==finishingItemId; });
    finishData = [item, ...finishData];
    try {
        const lf = JSON.parse(localStorage.getItem('hssi_finish_data')||'[]');
        lf.unshift(item);
        localStorage.setItem('hssi_finish_data', JSON.stringify(lf.slice(0,500)));
    } catch {}

    showToast(`✓ ${item.ccNo} SELESAI${products.length>1?' ('+products.length+' produk)':''}`, "success");
    closeFinishModal(); renderTable(); updateStats();
}

// ================================================================
//  KENDALA MODAL
// ================================================================
function openKendalaModal(id) {
    selectedItemId = id;
    const item = appData.find(function(i){ return i.id===id; });
    if (!item) return;
    document.getElementById('modal-cc-info').innerText = `${item.orderNo||item.ccNo} | ${item.ccNo}`;
    document.getElementById('kendala-select').value      = "";
    document.getElementById('kendala-other-input').value = "";
    document.getElementById('kendala-waktu-input').value = item.kendalaWaktu||"";
    document.getElementById('kendala-other-container').classList.add('hidden');
    showModal('modal-kendala');
}
function closeKendalaModal() { hideModal('modal-kendala'); selectedItemId=null; }
function toggleOtherKendala() {
    document.getElementById('kendala-other-container').classList.toggle('hidden',
        document.getElementById('kendala-select').value !== 'OTHER');
}
function saveKendala() {
    let jenis = document.getElementById('kendala-select').value;
    const waktu = document.getElementById('kendala-waktu-input').value;
    if (!jenis) { showToast("Pilih jenis kendala!","error"); return; }
    if (jenis==='OTHER') jenis = document.getElementById('kendala-other-input').value || "OTHER";
    const item = appData.find(function(i){ return i.id===selectedItemId; });
    if (item) {
        item.kendala=jenis; item.kendalaWaktu=waktu;
        sendKendalaToServer(item);
        const key = item.ccNo+"|"+item.line;
        if (!remoteStatusMap[key]) remoteStatusMap[key]={ status:item.status, startTime:item.startTime||"" };
        remoteStatusMap[key].kendala=jenis; remoteStatusMap[key].kendalaWaktu=waktu;
        showToast(`⚠️ Kendala "${jenis}" dilaporkan!`); renderTable(); closeKendalaModal();
    }
}

// ================================================================
//  CHARTS & STATS
// ================================================================
function initCharts() {
    [{id:'DS1',color:'#00843d'},{id:'DS2',color:'#0284c7'},{id:'DS3',color:'#d97706'}].forEach(function(l) {
        const canvas = document.getElementById(`chart-${l.id.toLowerCase()}`); if(!canvas) return;
        charts[l.id] = new Chart(canvas.getContext('2d'), {
            type:'doughnut',
            data:{ labels:['Antri','Selesai'], datasets:[{ data:[1,0], backgroundColor:['#f1f5f9',l.color], borderWidth:0 }] },
            options:{ responsive:true, maintainAspectRatio:false, cutout:'75%', plugins:{ legend:{ display:false } } }
        });
    });
}
function updateStats() {
    ['DS1','DS2','DS3'].forEach(function(line) {
        const done = finishData.filter(function(i){ return i.line===line; });
        const wait = appData.filter(function(i){ return i.line===line; });
        const ton  = done.reduce(function(a,c){ return a+parseFloat(c.originalWeight||c.weight||0); }, 0) / 1000;
        const tEl  = document.getElementById(`ton-${line.toLowerCase()}`);
        const cEl  = document.getElementById(`count-${line.toLowerCase()}`);
        if (tEl) tEl.innerText = ton.toFixed(2);
        if (cEl) cEl.innerText = done.length + ' Job Selesai';
        if (charts[line]) { charts[line].data.datasets[0].data=[wait.length||1,done.length]; charts[line].update(); }
    });
}

// ================================================================
//  QR SCANNER
// ================================================================
function parseQRCodeToCC(raw) {
    if (!raw||!raw.trim()) return null;
    let str=raw.trim(), hasP=false;
    if (/^[Pp]/.test(str)) { hasP=true; str=str.slice(1); }
    const m = str.match(/^([A-Za-z0-9\-]+)/);
    if (!m) return null;
    let cc = m[1].slice(0,16); if(hasP) cc='P'+cc; return cc;
}
async function toggleScanner() {
    const container = document.getElementById('scanner-container');
    if (scannerOpen) {
        scannerOpen=false; container.classList.remove('open');
        if (html5QrCode) { try{ await html5QrCode.stop(); html5QrCode.clear(); }catch{} html5QrCode=null; }
        document.getElementById('last-scan-badge').classList.add('hidden'); return;
    }
    scannerOpen=true; container.classList.add('open'); safeCreateIcons();
    await new Promise(function(r){ setTimeout(r,200); });
    html5QrCode = new Html5Qrcode("reader");
    try {
        await html5QrCode.start({ facingMode:"environment" }, { fps:15, qrbox:{width:240,height:240} },
            function(decodedText) {
                if (lastScanLock) return; lastScanLock=true; setTimeout(function(){ lastScanLock=false; },1500);
                const ccNo = parseQRCodeToCC(decodedText);
                if (!ccNo) { showToast("Format QR tidak dikenali!","error"); return; }
                document.getElementById('last-scan-value').textContent=ccNo;
                document.getElementById('last-scan-badge').classList.remove('hidden');
                safeCreateIcons();
                if (navigator.vibrate) navigator.vibrate([100,50,100]);
                setTimeout(async function(){ await toggleScanner(); processScan(ccNo); },800);
            }, function(){}
        );
    } catch(err) {
        console.error("Camera error:",err);
        showToast("Gagal akses kamera. Cek izin browser!","error");
        scannerOpen=false; container.classList.remove('open');
    }
}
function submitManualMobile() {
    const val=(document.getElementById('manualInputMobile').value||'').trim(); if(!val)return;
    const ccNo=parseQRCodeToCC(val)||val;
    if(ccNo.length<10){showToast("Format CC No. tidak valid!","error");return;}
    document.getElementById('manualInputMobile').value='';
    toggleScanner().then(function(){ processScan(ccNo); });
}
function triggerDesktopScan() { toggleScanner(); }
function setupDesktopInput() {
    const input = document.getElementById('manualInput'); if(!input)return;
    input.addEventListener('keydown', function(e) {
        if (e.key==='Enter') { const raw=input.value.trim(); if(!raw)return; const cc=parseQRCodeToCC(raw)||raw; input.value=''; processScan(cc); }
    });
}

// ================================================================
//  PLANING & EXPORT PDF
// ================================================================
function openPlaningModal()  { showModal('modal-planing'); }
function closePlaningModal() { hideModal('modal-planing'); }
function openPlaningSheet(line) {
    const url=PLANING_EDIT_URLS[line];
    if(!url){showToast(`URL Planing ${line} belum dikonfigurasi!`,'error');return;}
    window.open(url,'_blank'); closePlaningModal();
}
function openExportModal() {
    const l=document.getElementById('export-menu-label');
    if(l) l.textContent=activeMenu==='FINISH'?'FINISH PROCESS':'WAITING LIST';
    showModal('modal-export');
}
function closeExportModal() { hideModal('modal-export'); }

function exportPDF(line) {
    closeExportModal();
    const isFinish   = activeMenu === 'FINISH';
    const filtered   = (isFinish?finishData:appData).filter(function(i){ return line==='ALL'||i.line===line; });
    if (!filtered.length) { showToast(`Tidak ada data ${line} untuk di-export!`,'error'); return; }

    const now      = new Date();
    const dateStr  = now.toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});
    const timeStr  = now.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
    const lines    = line==='ALL'?['DS1','DS2','DS3']:[line];
    const LC       = { DS1:'#00843d', DS2:'#0284c7', DS3:'#d97706' };

    const buildRows = function(items) {
        if (!items.length) return `<tr><td colspan="22" style="text-align:center;color:#94a3b8;padding:24px">Tidak ada data</td></tr>`;
        if (isFinish) {
            return items.map(function(item,idx) {
                const bg = idx%2===0?'#fff':'#f8fafc';
                return `<tr style="background:${bg};font-size:9px">
                    <td style="text-align:center;padding:5px 8px">${idx+1}</td>
                    <td style="font-family:monospace;padding:5px 8px">${item.ccNo||'—'}</td>
                    <td style="padding:5px 8px">${item.customer||'—'}</td>
                    <td style="padding:5px 8px">${item.spec||'—'}</td>
                    <td style="padding:5px 8px;font-size:8px">${item.size||'—'}</td>
                    <td style="text-align:right;padding:5px 8px">${item.weight?Number(item.weight).toLocaleString('id-ID'):'—'}</td>
                    <td style="text-align:center;padding:5px 8px">${item.productWidth||'—'}</td>
                    <td style="text-align:center;padding:5px 8px">${item.qtyFG||'0'}</td>
                    <td style="text-align:center;padding:5px 8px">${item.qtyNG||'0'}</td>
                    <td style="text-align:center;padding:5px 8px">${item.totalSkid||'0'}</td>
                    <td style="text-align:center;padding:5px 8px">${item.cut||'0'}</td>
                    <td style="text-align:center;padding:5px 8px">${sanitizeTimeDisplay(item.startTime)}</td>
                    <td style="text-align:center;padding:5px 8px">${sanitizeTimeDisplay(item.finishedAt)}</td>
                    <td style="text-align:center;background:#fff5f5;padding:5px 6px">${item.dtTBM||'0'}</td>
                    <td style="text-align:center;background:#fff5f5;padding:5px 6px">${item.dtPacking||'0'}</td>
                    <td style="text-align:center;background:#fff5f5;padding:5px 6px">${item.dtWaitingMC||'0'}</td>
                    <td style="text-align:center;background:#fff5f5;padding:5px 6px">${item.dtWaitingCrane||'0'}</td>
                    <td style="text-align:center;background:#fff5f5;padding:5px 6px">${item.dtWinder||'0'}</td>
                    <td style="text-align:center;background:#fff5f5;padding:5px 6px">${item.dtCleaning||'0'}</td>
                    <td style="text-align:center;background:#fff5f5;padding:5px 6px">${item.dtProblem||'0'}</td>
                    <td style="text-align:center;background:#fff5f5;padding:5px 6px">${item.dtOther||'0'}</td>
                    <td style="padding:5px 8px;font-size:8px">${item.remark||'—'}</td>
                </tr>`;
            }).join('');
        } else {
            return items.map(function(item,idx) {
                return `<tr style="background:${idx%2===0?'#fff':'#f8fafc'};font-size:9px">
                    <td style="padding:5px 8px">${idx+1}</td>
                    <td style="padding:5px 8px">${item.orderNo||'—'}</td>
                    <td style="font-family:monospace;padding:5px 8px">${item.ccNo||'—'}</td>
                    <td style="padding:5px 8px">${item.customer||'—'}</td>
                    <td style="padding:5px 8px">${item.spec||'—'}</td>
                    <td style="padding:5px 8px">${item.size||'—'}</td>
                    <td style="text-align:right;padding:5px 8px">${item.weight?Number(item.weight).toLocaleString('id-ID'):'—'}</td>
                    <td style="padding:5px 8px">${item.status}</td>
                </tr>`;
            }).join('');
        }
    };

    const buildSection = function(ln) {
        const items = filtered.filter(function(i){ return i.line===ln; });
        const tw    = items.reduce(function(s,i){ return s+parseFloat(i.weight||0); }, 0);
        const color = LC[ln]||'#334155';
        const thead = isFinish
            ? `<tr style="background:#0f172a;color:white;font-size:9px;text-align:center">
                   <th rowspan="2" style="padding:8px 6px">#</th>
                   <th rowspan="2" style="padding:8px 6px">CC No</th>
                   <th rowspan="2" style="padding:8px 6px">Customer</th>
                   <th rowspan="2" style="padding:8px 6px">Spec</th>
                   <th rowspan="2" style="padding:8px 6px">MC/Semi Prod Size</th>
                   <th rowspan="2" style="padding:8px 6px">Weight(KG)</th>
                   <th rowspan="2" style="padding:8px 6px">Prod Size</th>
                   <th colspan="3" style="padding:8px 6px;background:#064e3b">Qty</th>
                   <th rowspan="2" style="padding:8px 6px">Cut</th>
                   <th rowspan="2" style="padding:8px 6px">Start</th>
                   <th rowspan="2" style="padding:8px 6px">End</th>
                   <th colspan="8" style="padding:8px 6px;background:#7f1d1d">Down Time (mnt)</th>
                   <th rowspan="2" style="padding:8px 6px">Remark</th>
               </tr>
               <tr style="background:#1e293b;color:white;font-size:8px;text-align:center">
                   <th style="padding:6px">FG</th><th style="padding:6px">NG</th><th style="padding:6px">Skid</th>
                   <th style="padding:6px;background:#991b1b">TBM</th>
                   <th style="padding:6px;background:#991b1b">PKG</th>
                   <th style="padding:6px;background:#991b1b">W.MC</th>
                   <th style="padding:6px;background:#991b1b">W.CR</th>
                   <th style="padding:6px;background:#991b1b">WND</th>
                   <th style="padding:6px;background:#991b1b">CLN</th>
                   <th style="padding:6px;background:#991b1b">PBM</th>
                   <th style="padding:6px;background:#991b1b">OTH</th>
               </tr>`
            : `<tr style="background:#0f172a;color:white;font-size:9px">
                   <th style="padding:8px">#</th><th>Order No</th><th>CC No</th><th>Customer</th>
                   <th>Spec</th><th>Size</th><th>Weight</th><th>Status</th>
               </tr>`;
        return `<div style="margin-bottom:36px">
            <div style="background:${color};color:white;padding:12px 18px;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;align-items:center">
                <div style="font-size:16px;font-weight:900;font-style:italic">DOWNSHEAR ${ln} <span style="font-size:10px;opacity:0.7">(${items.length} coil)</span></div>
                <div style="font-size:18px;font-weight:900">${(tw/1000).toFixed(3)} Ton</div>
            </div>
            <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;overflow:hidden">
                <table style="width:100%;border-collapse:collapse">
                    <thead>${thead}</thead>
                    <tbody>${buildRows(items)}</tbody>
                </table>
            </div></div>`;
    };

    const gw  = filtered.reduce(function(s,i){ return s+parseFloat(i.weight||0); }, 0);
    const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Report ${line}</title>
        <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;padding:20px}
        th,td{border-bottom:1px solid #f1f5f9;vertical-align:middle}
        @media print{@page{size:A4 landscape;margin:8mm}}</style></head><body>
        <div style="background:linear-gradient(135deg,#0f172a,#1e3a5f);color:white;padding:24px;border-radius:14px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:center">
            <div>
                <div style="font-size:9px;opacity:0.6;letter-spacing:0.2em">PT. HSSI — PRODUCTION REPORT</div>
                <div style="font-size:24px;font-weight:900;font-style:italic">DOWNSHEAR MONITORING</div>
                <div style="color:#34d399;font-weight:700;margin-top:4px">${line==='ALL'?'ALL LINE':'LINE '+line} · ${isFinish?'FINISH PROCESS':'WAITING LIST'}</div>
            </div>
            <div style="text-align:right">
                <div style="font-size:20px;font-weight:900">${dateStr}</div>
                <div style="opacity:0.5;font-size:11px">Dicetak ${timeStr} WIB</div>
                <div style="display:flex;gap:10px;margin-top:10px;justify-content:flex-end">
                    <div style="background:rgba(255,255,255,.1);padding:6px 14px;border-radius:8px;text-align:center">
                        <div style="font-size:18px;font-weight:900">${filtered.length}</div>
                        <div style="font-size:8px;opacity:0.7">Total Coil</div>
                    </div>
                    <div style="background:rgba(52,211,153,.2);padding:6px 14px;border-radius:8px;text-align:center">
                        <div style="font-size:18px;font-weight:900">${(gw/1000).toFixed(3)}</div>
                        <div style="font-size:8px;opacity:0.7">Total Ton</div>
                    </div>
                </div>
            </div>
        </div>
        ${lines.map(buildSection).join('')}
        <div id="pb" style="display:flex;justify-content:center;gap:12px;margin-top:24px">
            <button onclick="window.print()" style="background:#0f172a;color:white;border:none;padding:12px 36px;border-radius:10px;font-weight:900;cursor:pointer">🖨️ Print / Save PDF</button>
            <button onclick="window.close()" style="background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;padding:12px 20px;border-radius:10px;font-weight:700;cursor:pointer">Tutup</button>
        </div>
        <script>window.onbeforeprint=function(){document.getElementById('pb').style.display='none'};window.onafterprint=function(){document.getElementById('pb').style.display='flex'};window.addEventListener('load',function(){setTimeout(function(){window.print()},600)});<\/script>
        </body></html>`;

    const win = window.open('','_blank');
    if (!win) { showToast('Popup diblokir! Izinkan popup browser.','error'); return; }
    win.document.write(html); win.document.close();
    showToast(`Export PDF ${line} berhasil!`,'success');
}

// ================================================================
//  MODAL HELPERS
// ================================================================
function showModal(id) { const el=document.getElementById(id); if(!el)return; el.classList.remove('hidden'); el.classList.add('flex'); safeCreateIcons(); }
function hideModal(id) { const el=document.getElementById(id); if(!el)return; el.classList.remove('flex'); el.classList.add('hidden'); }
function handleModalOverlayClick(event,modalId) { if(event.target.id===modalId){ hideModal(modalId); if(modalId==='modal-kendala')selectedItemId=null; } }

// ================================================================
//  MISC HELPERS
// ================================================================
function handleSearch() { searchQuery=document.getElementById('searchInput').value.toLowerCase(); renderTable(); }
function setMainMenu(menu) {
    activeMenu = menu;
    const ac = "menu-nav px-8 md:px-16 py-4 rounded-3xl text-[11px] md:text-xs font-black uppercase tracking-widest transition-all bg-[#0f172a] text-white shadow-md";
    const ic = "menu-nav px-8 md:px-16 py-4 rounded-3xl text-[11px] md:text-xs font-black uppercase tracking-widest transition-all text-slate-400 hover:text-slate-700";
    document.getElementById('btn-menu-WAITING').className = menu==='WAITING'?ac:ic;
    document.getElementById('btn-menu-FINISH').className  = menu==='FINISH' ?ac:ic;
    renderTable();
}
function setLine(line) {
    activeLine = line;
    document.querySelectorAll('.line-nav').forEach(function(b){ b.classList.remove('line-active','text-white'); b.classList.add('text-slate-400'); });
    const btn = document.getElementById(`btn-${line}`); if(btn){ btn.classList.remove('text-slate-400'); btn.classList.add('line-active'); }
    renderTable();
}
function showToast(msg, type) {
    type = type||'success';
    if (toastTimer) clearTimeout(toastTimer);
    const t = document.getElementById('toast');
    t.className = `fixed bottom-8 left-1/2 -translate-x-1/2 px-8 py-4 rounded-2xl font-black text-[11px] text-white shadow-2xl z-[150] flex items-center gap-3 uppercase tracking-widest animate-slide-up ${type==='success'?'bg-emerald-600':'bg-rose-600'}`;
    document.getElementById('toast-message').innerText = msg;
    t.classList.remove('hidden');
    toastTimer = setTimeout(function(){ t.classList.add('hidden'); }, 3000);
    safeCreateIcons();
}

// ================================================================
//  ORIENTATION LOCK (PWA)
// ================================================================
function handleOrientation() {
    var overlay = document.getElementById('rotate-overlay'); if(!overlay)return;
    var standalone = window.navigator.standalone===true || window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches;
    if (!standalone) { overlay.classList.remove('show'); return; }
    window.innerHeight > window.innerWidth ? overlay.classList.add('show') : overlay.classList.remove('show');
}
function lockLandscape() {
    try { if(screen.orientation&&screen.orientation.lock) screen.orientation.lock('landscape').catch(function(){}); } catch(e){}
}
window.addEventListener('resize', handleOrientation);
if (screen.orientation) screen.orientation.addEventListener('change', handleOrientation);

// ================================================================
//  PWA INSTALL
// ================================================================
function hideInstallBtn() {
    ['btn-install','btn-install-ios'].forEach(function(id){ var el=document.getElementById(id); if(el){el.classList.add('hidden');el.classList.remove('flex');} });
}
function triggerInstall() {
    var evt = window.__pwaInstallEvent;
    if (!evt) { showToast('Buka di Chrome Android & tunggu beberapa detik, lalu coba lagi.','error'); return; }
    evt.prompt();
    evt.userChoice.then(function(r){ if(r.outcome==='accepted'){showToast('✅ Aplikasi berhasil diinstall!','success');hideInstallBtn();}  window.__pwaInstallEvent=null; });
}
function openIosGuide()  { showModal('modal-ios-guide'); }
function closeIosGuide() { hideModal('modal-ios-guide'); }
window.addEventListener('appinstalled', function() { hideInstallBtn(); window.__pwaInstallEvent=null; showToast('✅ Aplikasi berhasil diinstall!','success'); });

// Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
        .then(function(r){ console.log('[SW] registered:', r.scope); })
        .catch(function(e){ console.warn('[SW] failed:', e); });
}