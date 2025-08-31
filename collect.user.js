// ==UserScript==
// @name         CN Advisor
// @author       Ari / Mochi
// @version      1.5b
// @description  Warns you on a bad collect & some other neat things.
// @match        https://www.cybernations.net/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://github.com/oh-ari/cn-collect/raw/refs/heads/main/collect.user.js
// @downloadURL  https://github.com/oh-ari/cn-collect/raw/refs/heads/main/collect.user.js
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_PREFIX = 'cn:stats:';
  const LAST_NATION_KEY = 'cn:lastNationId';

  function parseFirstNumber(text) {
    const m = text && String(text).replace(/[^0-9.,()\-\s]/g, ' ').match(/([0-9][0-9,]*\.?[0-9]*)/);
    const n = m && Number(m[1].replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  function findNationIdFromSidebar() {
    const a = document.querySelector('a[href*="nation_drill_display.asp"][href*="Nation_ID="]');
    if (!a) return null;
    try { return new URL(a.href, location.origin).searchParams.get('Nation_ID'); } catch {}
    const m = (a.getAttribute('href') || '').match(/Nation_ID=(\d+)/i);
    return m ? m[1] : null;
  }

  function findNationIdFromPage() {
    try {
      const url = new URL(location.href);
      const id = url.searchParams.get('Nation_ID');
      if (id) return id;
    } catch {}
    const input = document.querySelector('input[name="Nation_ID"]');
    if (input && input.value) return input.value.trim();
    return findNationIdFromSidebar();
  }

  function getNationIdFromAny() {
    return findNationIdFromPage() || (localStorage.getItem(LAST_NATION_KEY) || findNationIdFromSidebar());
  }

  function getRowSecondCellByAnchor(hrefContains) {
    const a = document.querySelector(`a[href*="${hrefContains}"]`);
    const tds = a && a.closest('tr')?.querySelectorAll('td');
    return tds && tds.length > 1 ? tds[1] : null;
  }

  function getValueTdForLabel(labelMatcher) {
    for (const td of document.querySelectorAll('td')) {
      const txt = td.textContent?.trim().replace(/\s+/g, ' ') || '';
      if (labelMatcher(txt, td)) {
        const cells = td.closest('tr')?.querySelectorAll('td');
        if (cells?.length > 1) return cells[1];
      }
    }
    return null;
  }

  function getImprovementsFlags() {
    const a = document.querySelector('a[href*="about_topics.asp#Improvements"]');
    if (!a) return { hasGuerrillaCamps: false, hasLaborCamps: false, hasFactories: false, factoriesCount: 0, improvementsText: '' };
    const td = a.closest('tr')?.querySelectorAll('td')[1] || a.closest('td');
    const text = (td?.querySelector('table td:nth-child(2)')?.textContent || td?.textContent || '')
      .replace(/\s+/g, ' ').trim();
    const fx = (() => {
      const m1 = text.match(/(\d+)\s*Factories/i);
      const m2 = text.match(/Factories[^\d]*(\d+)/i);
      const n = m1 ? Number(m1[1]) : (m2 ? Number(m2[1]) : 0);
      return Number.isFinite(n) ? n : 0;
    })();
    return {
      hasGuerrillaCamps: /Guerrilla\s+Camps/i.test(text),
      hasLaborCamps: /Labor\s+Camps/i.test(text),
      hasFactories: /Factories/i.test(text) && fx > 0,
      factoriesCount: fx,
      improvementsText: text,
    };
  }

  function parseResourceNameFromTitle(title) {
    if (!title) return null;
    const cleaned = String(title).trim();
    const name = (cleaned.split(' - ')[0] || cleaned).trim();
    return name || null;
  }

  function toTitleCaseWords(s) {
    return s.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function parseResourceNameFromImage(img) {
    const title = img.getAttribute('title');
    const alt = img.getAttribute('alt');
    let name = parseResourceNameFromTitle(title) || parseResourceNameFromTitle(alt);
    if (!name) {
      const src = img.getAttribute('src') || '';
      const m = src.match(/resources\/(.+?)\.(?:gif|png|jpg)$/i);
      if (m) name = toTitleCaseWords(m[1]);
    }
    return name || null;
  }

  function extractResourcesFromValueCell(valueCell) {
    const names = [];
    if (!valueCell) return names;
    const imgs = valueCell.querySelectorAll('img[src*="/resources/" i], img[src*="images/resources/" i]');
    for (const img of imgs) {
      const nm = parseResourceNameFromImage(img);
      if (nm && !names.includes(nm)) names.push(nm);
    }
    return names;
  }

  function getResourcesInfo() {
    const selectByLabel = (labelRegex) => {
      for (const td of document.querySelectorAll('td')) {
        const t = (td.textContent || '').replace(/\s+/g, ' ').trim();
        if (labelRegex.test(t)) {
          const row = td.closest('tr');
          const cells = row ? row.querySelectorAll('td') : null;
          if (cells && cells.length > 1) return cells[1];
        }
      }
      return null;
    };
    let connectedCell = selectByLabel(/Connected\s+Resources/i);
    let bonusCell = selectByLabel(/Bonus\s+Resources/i);
    if (!connectedCell || !bonusCell) {
      const anchors = Array.from(document.querySelectorAll('a[href*="about_topics.asp#Resources_"]'));
      for (const a of anchors) {
        const label = (a.textContent || '').replace(/\s+/g, ' ').trim();
        const row = a.closest('tr');
        const cells = row ? row.querySelectorAll('td') : null;
        if (!cells || cells.length < 2) continue;
        if (!connectedCell && /Connected\s+Resources/i.test(label)) connectedCell = cells[1];
        if (!bonusCell && /Bonus\s+Resources/i.test(label)) bonusCell = cells[1];
      }
    }
    const connected = extractResourcesFromValueCell(connectedCell);
    const bonus = extractResourcesFromValueCell(bonusCell);
    if (!connected.length && !bonus.length) {
      const globalImgs = Array.from(document.querySelectorAll('img[src^="images/resources/"][title]'));
      const all = [];
      for (const img of globalImgs) {
        const nm = parseResourceNameFromImage(img);
        if (nm && !all.includes(nm)) all.push(nm);
      }
      return { resources: all, bonusResources: [] };
    }
    return { resources: connected, bonusResources: bonus };
  }

  function getBillsStatusFromPage() {
    const body = (document.body?.textContent || '').replace(/\s+/g, ' ').trim();
    const m = body.match(/You haven't paid your bills today[.!]?\s*You last paid your bills\s+(\d+)\s+day[s]?\s+ago\s+on\s+([0-9/.-]+)/i);
    if (m) {
      return { hasPaidBills: false, billsDaysAgo: Number(m[1]), billsLastPaymentDate: m[2] };
    }
    const valTd = getValueTdForLabel((t) => /^Last Bill Payment:/i.test(t));
    if (valTd) {
      const dt = (valTd.textContent || '').replace(/\s+/g, ' ').trim();
      const d = new Date();
      const today = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
      if (dt === today) return { hasPaidBills: true, billsLastPaymentDate: dt };
      let billsDaysAgo = null;
      try {
        const paidDate = new Date(dt);
        if (!isNaN(paidDate)) {
          const startOfToday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
          const startOfPaid = new Date(paidDate.getFullYear(), paidDate.getMonth(), paidDate.getDate());
          billsDaysAgo = Math.max(0, Math.floor((startOfToday - startOfPaid) / 86400000));
        }
      } catch {}
      return { hasPaidBills: false, billsDaysAgo, billsLastPaymentDate: dt };
    }
    return { hasPaidBills: null };
  }

  function buildIssuesAndNotes(effectiveStats) {
    const issues = [];
    const notes = [];
    if (effectiveStats.hasLaborCamps) issues.push('Labor Camps are present.');
    if (effectiveStats.hasGuerrillaCamps) issues.push('Guerrilla Camps are present.');
    if (typeof effectiveStats.soldiers === 'number' && typeof effectiveStats.soldiersTarget25 === 'number') {
      if (effectiveStats.soldiers > effectiveStats.soldiersTarget25) {
        const toSell = Math.max(0, effectiveStats.soldiersToSell || 0);
        issues.push(`Soldiers exceed 25% cap. You have <b>${fmt(effectiveStats.soldiers)}</b> soldiers; 25% of population is <b>${fmt(effectiveStats.soldiersTarget25)}</b>. Suggested to sell <b>${fmt(toSell)}</b>.`);
      }
    }
    if (typeof effectiveStats.defcon === 'number' && effectiveStats.defcon !== 5) {
      issues.push(`DEFCON is <b>${effectiveStats.defcon}</b>. Recommended: <b>5</b>.`);
    }
    if (typeof effectiveStats.threatLevelCode === 'number' && effectiveStats.threatLevelCode !== 5) {
      const name = effectiveStats.threatLevelName || String(effectiveStats.threatLevelCode);
      issues.push(`Threat Level is <b>${name}</b>. Recommended: <b>Low</b>.`);
    }
    if (typeof effectiveStats.crimeIndex === 'number' && effectiveStats.crimeIndex >= 1 && effectiveStats.crimeIndex <= 6) {
      issues.push(`Your Crime Index is <b>${effectiveStats.crimeIndex}</b>, check if there's more you can do with your government positions or improvements.`);
    }
    if (typeof effectiveStats.tradeSlotsUsed === 'number' && typeof effectiveStats.tradeSlotsTotal === 'number') {
      if (effectiveStats.tradeSlotsUsed < effectiveStats.tradeSlotsTotal) {
        issues.push("Your trade circle isn't complete.");
      } else if (effectiveStats.tradeSlotsUsed >= effectiveStats.tradeSlotsTotal && effectiveStats.tradeSlotsTotal >= 5) {
        notes.push('Your trade circle looks complete! Do you need to temp? If not, you can ignore this. Yay you!');
      }
    }
    if (typeof effectiveStats.technology === 'number' && effectiveStats.technology < 110) {
      notes.push(`Your tech is ${fmt(effectiveStats.technology)}. Consider buying to 110 for additional bonuses.`);
    }
    if (effectiveStats.governmentDiscontent === true) {
      if (effectiveStats.governmentPreferenceName) notes.push(`Government preference: ${effectiveStats.governmentPreferenceName}`);
      else notes.push(`Your people would prefer a different government than ${effectiveStats.governmentName || 'current'}.`);
    }
    if (effectiveStats.religionDiscontent === true) {
      if (effectiveStats.religionPreferenceName) notes.push(`Religion preference: ${effectiveStats.religionPreferenceName}`);
      else notes.push(`Your people would prefer a different national religion than ${effectiveStats.religionName || 'current'}.`);
    }
    return { issues, notes };
  }

  function getTotalPopulation() {
    const valueTd = getValueTdForLabel((txt) => /^Total Population:/i.test(txt));
    if (!valueTd) return null;
    return parseFirstNumber(valueTd.textContent);
  }

  function getSoldiers() {
    const valueTd = getRowSecondCellByAnchor('#Military') ||
      getValueTdForLabel((txt) => /Number of Soldiers:/i.test(txt));
    if (!valueTd) return null;
    return parseFirstNumber(valueTd.textContent);
  }

  function getDefcon() {
    const img = getRowSecondCellByAnchor('#DEFCON')?.querySelector('img[src*="DEFCON"]');
    const m = (img?.getAttribute('src') || '').match(/DEFCON(\d)\.gif/i);
    return m ? Number(m[1]) : null;
  }

  function getThreat() {
    const img = getRowSecondCellByAnchor('#Threat_Level')?.querySelector('img[src*="Threat"]');
    const m = (img?.getAttribute('src') || '').match(/Threat(\d)\.gif/i);
    if (!m) return null;
    const code = Number(m[1]);
    const map = { 1: 'Severe', 2: 'High', 3: 'Elevated', 4: 'Guarded', 5: 'Low' };
    return { code, name: map[code] || String(code) };
  }

  function getCrimeIndexAndCps() {
    const td = getRowSecondCellByAnchor('#Crime_Index');
    if (!td) return { crimeIndex: null, crimePreventionScore: null };
    const text = (td.textContent || '').replace(/\s+/g, ' ').trim();
    const mIdx = text.match(/Crime\s*Index\s*(\d+)/i);
    const mCps = text.match(/Crime\s*Prevention\s*Score:\s*([0-9][0-9,]*)/i);
    const crimeIndex = mIdx ? Number(mIdx[1]) : null;
    const crimePreventionScore = mCps ? Number(mCps[1].replace(/,/g, '')) : null;
    return { crimeIndex, crimePreventionScore };
  }

  function getTradeSlots() {
    const valueTd = getValueTdForLabel((txt) => /^Trade Slots Used:/i.test(txt));
    if (!valueTd) return { tradeSlotsUsed: null, tradeSlotsTotal: null };
    const title = valueTd.querySelector('img[title*="trade slots" i]')?.getAttribute('title')
      || (valueTd.textContent || '');
    const m = title.match(/(\d+)\s*of\s*(\d+)\s*trade\s*slots/i);
    const tradeSlotsUsed = m ? Number(m[1]) : null;
    const tradeSlotsTotal = m ? Number(m[2]) : null;
    return { tradeSlotsUsed, tradeSlotsTotal };
  }

  function getTechnology() {
    const valueTd = getRowSecondCellByAnchor('#Technology');
    if (!valueTd) return null;
    return parseFirstNumber(valueTd.textContent);
  }

  function getGovernmentInfo() {
    const td = getRowSecondCellByAnchor('#Government_Type');
    if (!td) return { governmentName: null, governmentDiscontent: null };
    const imgTitle = td.querySelector('img[title]')?.getAttribute('title') || '';
    const text = (td.textContent || '').replace(/\s+/g, ' ').trim();
    const m = !imgTitle ? text.match(/^([^\-]+)\s*-/) : null;
    const name = imgTitle || (m ? m[1].trim() : null);
    const discontent = /prefer\s+something\s+else/i.test(text) ? true : false;
    let preference = null;
    if (discontent) {
      const prefs = [
        [/ruled\s+by\s+a\s+royal\s+family/i, 'Monarchy'],
        [/invest\s+heavily\s+in\s+business\s+ventures/i, 'Capitalist'],
        [/common\s+ownership\s+of\s+all\s+national\s+possessions/i, 'Communist'],
        [/fair\s+elective\s+processes/i, 'Democracy'],
        [/supreme\s+ruler\s+who\s+is\s+in\s+charge/i, 'Dictatorship'],
        [/strong\s+central\s+powers/i, 'Federal Government'],
        [/ruled\s+by\s+the\s+people\s+themselves/i, 'Republic'],
        [/radical\s+change/i, 'Revolutionary Government'],
        [/exercises\s+total\s+control/i, 'Totalitarian State'],
        [/prefer\s+something\s+more\s+temporary/i, 'Transitional'],
      ];
      for (const [re, val] of prefs) { if (re.test(text)) { preference = val; break; } }
    }
    return { governmentName: name, governmentDiscontent: discontent, governmentPreferenceName: preference };
  }

  function getReligionInfo() {
    const td = getRowSecondCellByAnchor('#National_Religion');
    if (!td) return { religionName: null, religionDiscontent: null };
    const imgTitle = td.querySelector('img[title]')?.getAttribute('title') || '';
    const text = (td.textContent || '').replace(/\s+/g, ' ').trim();
    const m = !imgTitle ? text.match(/^([^\-]+)\s*-/) : null;
    const name = imgTitle || (m ? m[1].trim() : null);
    const discontent = /prefer\s+something\s+else/i.test(text) ? true : false;
    let preference = null;
    if (discontent) {
      const prefs = [
        [/do\s+not\s+desire\s+a\s+religion/i, 'None'],
        [/(no\s+dominant\s+religion|variety\s+of\s+various\s+teachings)/i, 'Mixed'],
        [/modern\s+middle\s+eastern.*monotheism/i, "Baha'i faith"],
        [/(do\s+not\s+care\s+to\s+worship\s+a\s+supreme\s+deity|Four\s+Noble\s+Truths|Eightfold\s+Path)/i, 'Buddhism'],
        [/(divine\s+savior|Old\s+Testament.*New\s+Testament)/i, 'Christianity'],
        [/Far\s+Eastern.*love\s+for\s+humanity/i, 'Confucianism'],
        [/reincarnation\s+and\s+karma/i, 'Hinduism'],
        [/Allah.*Quran/i, 'Islam'],
        [/(non-materialistic.*atheism.*jiva|Jiva)/i, 'Jainism'],
        [/(divine\s+scriptures(?!.*Quran)|Torah.*Talmud)/i, 'Judaism'],
        [/ancient\s+religion.*Germanic.*Nordic/i, 'Norse'],
        [/god\s+is\s+present\s+in\s+all\s+walks\s+of\s+life.*living\s+and\s+non-living/i, 'Shinto'],
        [/blends\s+Hindu.*Islamic\s+monotheistic.*Ten\s+Gurus/i, 'Sikhism'],
        [/(do\s+not\s+believe\s+in\s+a\s+single\s+god).*oneness.*freedom\s+from\s+personal\s+desires/i, 'Taoism'],
        [/conjuring\s+of\s+dead\s+spirits/i, 'Voodoo'],
      ];
      for (const [re, val] of prefs) { if (re.test(text)) { preference = val; break; } }
    }
    return { religionName: name, religionDiscontent: discontent, religionPreferenceName: preference };
  }

  function saveNationStats(nationId, stats) {
    if (!nationId) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + nationId, JSON.stringify(stats));
      localStorage.setItem(LAST_NATION_KEY, nationId);
    } catch {}
  }

  function loadNationStats(nationId) {
    if (!nationId) return null;
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + nationId);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

function createPanel(htmlInner) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <table border="2" cellpadding="5" cellspacing="0" style="border-collapse: collapse" bordercolor="#000080" bgcolor="#FFFFFF" width="100%">
        <tr>
          <td align="left" bgcolor="#000080" bordercolor="#000080">
            <b><font color="#FFFFFF">:. Advisory</font></b>
          </td>
        </tr>
        <tr>
          <td>${htmlInner}</td>
        </tr>
      </table>
    `;
  const tbl = wrapper.firstElementChild;
    tbl.id = 'cn_collect_panel';
    return tbl;
}

  function setDisabled(btn, disabled) {
    if (!btn) return;
    btn.disabled = !!disabled;
    const s = btn.style;
    if (disabled) { s.opacity = '0.5'; s.filter = 'grayscale(100%)'; s.cursor = 'not-allowed'; }
    else { s.opacity = ''; s.filter = ''; s.cursor = ''; }
  }

  function fmt(num) {
    try { return Number(num).toLocaleString(); } catch { return String(num); }
  }

  function getMaxColumns(container) {
    const rows = container && container.rows ? Array.from(container.rows) : [];
    let maxCols = 0;
    for (const r of rows) {
      let sum = 0;
      for (const c of Array.from(r.cells)) sum += Math.max(1, c.colSpan || 1);
      if (sum > maxCols) maxCols = sum;
    }
    return maxCols || 2;
  }

  function handleNationPage() {
    const nationId = findNationIdFromPage();
    if (!nationId) return;
    const myNationId = findNationIdFromSidebar();
    if (myNationId && nationId !== myNationId) return;

    const imp = getImprovementsFlags();
    const res = getResourcesInfo();
    const bills = getBillsStatusFromPage();
    const totalPopulation = getTotalPopulation();
    const soldiers = getSoldiers();
    const defcon = getDefcon();
    const threat = getThreat();
    const crime = getCrimeIndexAndCps();
    const trade = getTradeSlots();
    const technology = getTechnology();
    const gov = getGovernmentInfo();
    const rel = getReligionInfo();

    const soldiersTarget25 = typeof totalPopulation === 'number' ? Math.floor(totalPopulation * 0.25) : null;
    const soldiersToSell = typeof soldiers === 'number' && typeof soldiersTarget25 === 'number' ? Math.max(0, soldiers - soldiersTarget25) : null;

    saveNationStats(nationId, {
      nationId,
      timestamp: Date.now(),
      ...imp,
      ...(res || {}),
      ...bills,
      totalPopulation,
      soldiers,
      soldiersTarget25,
      soldiersToSell,
      defcon,
      threatLevelCode: threat ? threat.code : null,
      threatLevelName: threat ? threat.name : null,
      crimeIndex: crime ? crime.crimeIndex : null,
      crimePreventionScore: crime ? crime.crimePreventionScore : null,
      tradeSlotsUsed: trade ? trade.tradeSlotsUsed : null,
      tradeSlotsTotal: trade ? trade.tradeSlotsTotal : null,
      technology,
      governmentName: gov ? gov.governmentName : null,
      governmentDiscontent: gov ? gov.governmentDiscontent : null,
      governmentPreferenceName: gov ? gov.governmentPreferenceName : null,
      religionName: rel ? rel.religionName : null,
      religionDiscontent: rel ? rel.religionDiscontent : null,
      religionPreferenceName: rel ? rel.religionPreferenceName : null,
    });
  }

  function handleCollectPage() {
    const nationId = getNationIdFromAny();
    const stats = loadNationStats(nationId);

    const submitBtn = document.querySelector('input.Buttons[type="submit"][name="Submit"][value="Collect Taxes"]');
    if (!submitBtn) return;

    const form = submitBtn.closest('form') || document.forms[0] || document.body;

    const taxTable = form ? form.closest('table') : null;
    const moneyAfterLabelTd = taxTable
      ? Array.from(taxTable.querySelectorAll('td')).find((td) => /Money\s*Available\s*After\s*Tax\s*Collection/i.test(((td.textContent || '').replace(/\s+/g, ' ').trim())))
      : null;
    const moneyAfterTr = moneyAfterLabelTd ? moneyAfterLabelTd.closest('tr') : null;

    const issues = [];
    const notes = [];
    if (!stats) {
      issues.push('Nation details not found. Visit your "View My Nation" page first to capture current data.');
    }

    const effectiveStats = stats || {};

    if (!(typeof effectiveStats.soldiers === 'number' && typeof effectiveStats.soldiersTarget25 === 'number') && typeof effectiveStats.totalPopulation === 'number') {
      const soldiersNow = getSoldiers();
      if (typeof soldiersNow === 'number') {
        const cap = Math.floor(effectiveStats.totalPopulation * 0.25);
        const toSell = Math.max(0, soldiersNow - cap);
        effectiveStats.soldiers = soldiersNow;
        effectiveStats.soldiersTarget25 = cap;
        effectiveStats.soldiersToSell = toSell;
        if (nationId) saveNationStats(nationId, effectiveStats);
      }
    }

    {
      const built = buildIssuesAndNotes(effectiveStats);
      for (const i of built.issues) issues.push(i);
      for (const n of built.notes) notes.push(n);
    }

    if (!effectiveStats.hasLaborCamps || !effectiveStats.hasGuerrillaCamps) {
      notes.push("Don't forget to rebuy your Labor Camps and Guerrilla Camps after collecting.");
    }

    if (issues.length === 0 && notes.length === 0) return;

    const overrideId = 'cn_collect_override';
    const hasWarnings = issues.length > 0;
    const hasActionable = (
      (typeof effectiveStats.soldiers === 'number' && typeof effectiveStats.soldiersTarget25 === 'number' && effectiveStats.soldiers > effectiveStats.soldiersTarget25) ||
      (typeof effectiveStats.defcon === 'number' && effectiveStats.defcon !== 5) ||
      (typeof effectiveStats.threatLevelCode === 'number' && effectiveStats.threatLevelCode !== 5) ||
      (typeof effectiveStats.tradeSlotsUsed === 'number' && typeof effectiveStats.tradeSlotsTotal === 'number' && effectiveStats.tradeSlotsUsed < effectiveStats.tradeSlotsTotal)
    );
    const messages = issues.concat(notes);
    const panelHtml = `
      <div style="padding:4px;">
        <img src="images/ico_arr_gray.gif" width="11" height="11"> <b>Recommendations</b>
        <ul style="margin-top:6px;">${messages.map((i) => `<li>${i}</li>`).join('')}</ul>
        ${hasWarnings ? `<div style="margin-top:8px;"><label><input type="checkbox" id="${overrideId}"> <span id="${overrideId}_text">I understand and want to collect taxes anyway (e.g., at war, not thinking, etc.).</span></label></div>` : ''}
      </div>
    `;
    const existing = document.getElementById('cn_collect_panel');
    if (existing) {
      const tr = existing.closest('tr');
      if (tr && tr.parentNode) tr.parentNode.removeChild(tr); else existing.remove();
    }
    const panel = createPanel(panelHtml);

    if (moneyAfterTr && moneyAfterTr.parentNode) {
      const advisoryTr = document.createElement('tr');
      const td = document.createElement('td');
      const columns = moneyAfterTr.querySelectorAll('td').length || moneyAfterTr.children.length || 2;
      td.colSpan = columns;
      td.appendChild(panel);
      advisoryTr.appendChild(td);
      const tbody = moneyAfterTr.parentNode;
      tbody.insertBefore(advisoryTr, moneyAfterTr.nextSibling);
    } else if (taxTable && taxTable.tBodies && taxTable.tBodies[0]) {
      const tbody = taxTable.tBodies[0];
      const advisoryTr = document.createElement('tr');
      const td = document.createElement('td');
      const columns = (tbody.rows[0] ? tbody.rows[0].cells.length : 2);
      td.colSpan = columns;
      td.appendChild(panel);
      advisoryTr.appendChild(td);
      tbody.appendChild(advisoryTr);
    } else {
      form.parentNode.insertBefore(panel, form);
    }

    setDisabled(submitBtn, hasWarnings);
    if (hasWarnings) {
      const override = document.getElementById(overrideId);
      const textEl = document.getElementById(`${overrideId}_text`);
      let stage = 1;
      const update = () => {
        if (!override) return;
        if (!override.checked) { setDisabled(submitBtn, true); return; }
        if (hasActionable && stage === 1) {
          stage = 2;
          override.checked = false;
          if (textEl) textEl.textContent = "Are you absolutely sure? There's still things you can do to improve your collect, do you hate money?";
          setDisabled(submitBtn, true);
          return;
        }
        if (hasActionable && stage >= 2) {
          if (textEl) textEl.textContent = "Alright, it's your loss.";
          setDisabled(submitBtn, false);
          return;
        }
        setDisabled(submitBtn, false);
      };
      if (override) override.addEventListener('change', update);
      setDisabled(submitBtn, true);
    }
  }

  function handleInfrastructurePage() {
    const nationId = getNationIdFromAny();
    const stats = loadNationStats(nationId) || {};
    const tables = Array.from(document.querySelectorAll('table#table17'));
    const table = tables.find((t) => /Purchase\s*Infrastructure/i.test(((t.textContent || '').replace(/\s+/g, ' '))))
      || tables.find((t) => /Current\s*Infrastructure:/i.test(((t.textContent || '').replace(/\s+/g, ' '))));
    if (!table) return;
    const bills = getBillsStatusFromPage();
    if (nationId) {
      const current = loadNationStats(nationId) || {};
      saveNationStats(nationId, { ...current, ...bills });
    }
    const infraIssues = [];
    if (typeof stats.factoriesCount === 'number' && stats.factoriesCount < 5) infraIssues.push(`You have <b>${fmt(stats.factoriesCount)}</b>/5 Factories.`);
    {
      const effectiveHasPaid = (bills && bills.hasPaidBills !== null)
        ? bills.hasPaidBills
        : (typeof stats.hasPaidBills === 'boolean' ? stats.hasPaidBills : null);
      if (effectiveHasPaid === false) {
        infraIssues.push("It looks like you haven't paid bills yet. You should do that if you plan a large infra jump.");
      }
    }
    {
      const owned = new Set(([]).concat(stats.resources || [], stats.bonusResources || []).map((r) => String(r).trim()).filter(Boolean));
      const pool = [
        { name: 'Marble', pct: 10 },
        { name: 'Aluminum', pct: 7 },
        { name: 'Lumber', pct: 6 },
        { name: 'Iron', pct: 5 },
        { name: 'Coal', pct: 4 },
      ];
      const top = pool.filter((r) => !owned.has(r.name)).sort((a, b) => b.pct - a.pct).slice(0, 6);
      if (owned.size && top.length) {
        const baseTotal = top.reduce((s, r) => s + r.pct, 0);
        const list = top.map((r) => r.name);
        const union = new Set([...owned, ...list]);
        const haveBonus = new Set((stats.bonusResources || []).map((b) => String(b).trim()));
        const hasAll = (req) => req.every((n) => union.has(n));
        const techOk = typeof stats.technology === 'number' ? stats.technology > 5 : true;
        const unlocked = [];
        let bonusTotal = 0;
        if (!haveBonus.has('Steel') && hasAll(['Coal', 'Iron'])) { bonusTotal += 2; unlocked.push('Steel'); }
        if (!haveBonus.has('Construction') && techOk && hasAll(['Lumber', 'Iron', 'Marble', 'Aluminum'])) { bonusTotal += 5; unlocked.push('Construction'); }
        const total = baseTotal + bonusTotal;
        const niceList = list.length <= 2 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
        const bonusText = bonusTotal > 0 ? ` [<b>-${bonusTotal}%</b> specifically from Bonus Resources: ${unlocked.join(', ')}]` : '';
        infraIssues.push(`You could temp trade for the resources <b>${niceList}</b> for an additional total of <b>-${total}%</b> on your infra purchase.${bonusText}`);
      }
    }
    if (!infraIssues.length) return;
    const panelHtml = `
      <div style="padding:4px;">
        <img src="images/ico_arr_gray.gif" width="11" height="11"> <b>Recommendations</b>
        <ul style="margin-top:6px;">${infraIssues.map((i) => `<li>${i}</li>`).join('')}</ul>
      </div>
    `;
    const existing = document.getElementById('cn_collect_panel');
    if (existing) existing.remove();
    const panel = createPanel(panelHtml);
    const tbody = table.tBodies && table.tBodies[0] ? table.tBodies[0] : table;
    const advisoryTr = document.createElement('tr');
    const td = document.createElement('td');
    const columns = getMaxColumns(tbody);
    td.colSpan = columns;
    td.appendChild(panel);
    advisoryTr.appendChild(td);
    tbody.appendChild(advisoryTr);
  }

  function handleImprovementsPage() {
    const nationId = getNationIdFromAny();
    if (nationId) {
      const stats = loadNationStats(nationId);
      if (stats) {
        const imp = getImprovementsFromTable();
        Object.assign(stats, imp);
        saveNationStats(nationId, stats);
      }
    }

    document.querySelectorAll('form[action*="improvements_purchase_destroy.asp"]').forEach(form => {
      form.addEventListener('submit', e => {
        const improvement = decodeURIComponent(form.action.match(/Improvement=([^&]+)/)?.[1] || '');
        if (improvement === 'Labor Camp' || improvement === 'Guerilla Camp') {
          const stats = loadNationStats(getNationIdFromAny());
          if (stats) {
            stats[improvement === 'Labor Camp' ? 'hasLaborCamps' : 'hasGuerrillaCamps'] = false;
            saveNationStats(getNationIdFromAny(), stats);
          }
        }
      });
    });

    document.querySelectorAll('input[name="improvement"]').forEach(radio => {
      radio.addEventListener('click', function() {
        if (this.value === 'Labor Camp' || this.value === 'Guerilla Camp') {
          const stats = loadNationStats(getNationIdFromAny());
          if (stats) {
            stats[this.value === 'Labor Camp' ? 'hasLaborCamps' : 'hasGuerrillaCamps'] = true;
            saveNationStats(getNationIdFromAny(), stats);
          }
        }
      });
    });
  }

  function getImprovementsFromTable() {
    const improvements = { hasLaborCamps: false, hasGuerrillaCamps: false, hasFactories: false, factoriesCount: 0 };
    
    document.querySelectorAll('tr').forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 4) {
        const checks = [
          [cells[0].textContent.trim(), cells[1].textContent.trim()],
          [cells[2].textContent.trim(), cells[3].textContent.trim()]
        ];
        
        checks.forEach(([name, count]) => {
          if (name === 'Labor Camps') improvements.hasLaborCamps = parseInt(count) > 0;
          else if (name === 'Guerrilla Camps') improvements.hasGuerrillaCamps = parseInt(count) > 0;
          else if (name === 'Factories') {
            improvements.hasFactories = parseInt(count) > 0;
            improvements.factoriesCount = parseInt(count) || 0;
          }
        });
      }
    });
    
    return improvements;
  }

  function main() {
    const path = location.pathname.toLowerCase();
    try { injectCalcLink(); } catch {}
    if (path.includes('nation_drill_display.asp')) {
      handleNationPage();
    }
    if (path.includes('collect_taxes.asp')) {
      handleCollectPage();
    }
    if (path.includes('infrastructurebuysell.asp')) {
      handleInfrastructurePage();
    }
    if (path.includes('improvements_purchase.asp')) {
      handleImprovementsPage();
    }
    const sidebarNationId = findNationIdFromSidebar();
    if (sidebarNationId) try { localStorage.setItem(LAST_NATION_KEY, sidebarNationId); } catch {}
  }

  function injectCalcLink(){
    if(document.getElementById('cn_calc_link'))return;
    const a=document.querySelector('a[href*="trade_information.asp"]');
    if(!a)return;
    const tr=a.closest('tr');
    if(!tr||!tr.parentNode)return;
    const nr=document.createElement('tr');
    nr.innerHTML='\n<td height="19" width="18" align="right" valign="top"><img src="images/ico_arr_gray.gif" width="11" height="11"></td>\n<td height="19" align="left"><a href="#" id="cn_calc_link">Resource Calculator</a></td>\n<td height="19" align="left">&nbsp;</td>\n';
    tr.parentNode.insertBefore(nr,tr.nextSibling);
    document.getElementById('cn_calc_link').addEventListener('click',function(e){e.preventDefault();openCalcPage();});
  }

function openCalcPage(){
    const existingContent = document.body.innerHTML;

    document.body.innerHTML = `
        <div style="background: #FFFFFF; min-height: 100vh;">
            <div align="center">
                <table cellspacing="0" cellpadding="4" border="0" id="table1" width="900">
                    <tbody><tr>
                    <td valign="top" align="middle">
                    <table border="0" width="100%" id="table25" cellspacing="0" bordercolor="#000080" cellpadding="0">
                    <tbody><tr>
                    <td width="3%" valign="top">&nbsp;</td>
                    <td width="69%">
                    <a href="default.asp" name="pagetop">
                    <img border="0" src="images/cn_logo.png" alt="Home"></a></td>
                    <td align="right">
                    <table border="0" width="100%" id="table51" cellspacing="0" cellpadding="3">
                    <tbody><tr>

                    <td align="right">
                    <br>
                    </td>
                    </tr>
                    <tr>
                    <td align="right">
                    &nbsp;
                    </td>



                    </tr>
                    </tbody></table>

                    <br>
                    Server Time: ${new Date().toLocaleString('en-US', {timeZone: 'America/Chicago', month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true})}</td>
                    </tr>
                    </tbody></table>
                    </td>
                    </tr>
                    </tbody></table>
                </div>
            <div style="display: flex; max-width: 900px; margin: 0 auto;">
                <div style="width: 159px; flex-shrink: 0;">
                    <table border="2" cellpadding="0" cellspacing="0" style="border-collapse: collapse" bordercolor="#000080" bgcolor="#FFFFFF" width="155">
                        <tr><td bgcolor="#000080" height="18"><p align="left"><font color="#FFFFFF"><b>&nbsp;:. User Menu</b></font></p></td></tr>
                        <tr><td align="center" width="150">
                            <table border="0" cellpadding="2" style="border-collapse: collapse" width="100%">
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="default.asp">Home</a></td><td height="19" align="left">&nbsp;</td></tr>
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="about.asp">About The Game</a></td><td height="19" align="left"><img border="0" src="images/arrow.gif" width="7" height="9"></td></tr>
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="inbox.asp">My Messages</a></td><td height="19" align="left">&nbsp;</td></tr>
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="myprofile.asp">My Profile</a></td><td height="19" align="left"><img border="0" src="images/arrow.gif" width="7" height="9"></td></tr>
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="logout">Logout</a></td><td height="19" align="left">&nbsp;</td></tr>
                            </table>
                        </td></tr>
                        <tr><td bgcolor="#000080" height="18"><p align="left"><font color="#FFFFFF"><b>&nbsp;:. Main Menu</b></font></p></td></tr>
                        <tr><td align="center" width="150">
                            <table border="0" cellpadding="2" style="border-collapse: collapse" width="100%">
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="https://www.cybernations.net/nation_drill_display.asp?Nation_ID=${localStorage.getItem('cn:lastNationId') || ''}">View My Nation</a></td><td height="19" align="left"><img border="0" src="images/arrow.gif" width="7" height="9"></td></tr>
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="offer_donation_nation.asp">Donation Bonuses</a></td><td height="19" align="left">&nbsp;</td></tr>
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="government_position.asp">Government Position</a></td><td height="19" align="left">&nbsp;</td></tr>
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="teams.asp">Team Information</a></td><td height="19" align="left"><img border="0" src="images/arrow.gif" width="7" height="9"></td></tr>
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="event_information.asp">Events</a></td><td height="19" align="left">&nbsp;</td></tr>
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="trade_information.asp">Trade Agreements</a></td><td height="19" align="left">&nbsp;</td></tr>
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="#">Resource Calculator</a></td><td height="19" align="left">&nbsp;</td></tr>
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="aid_information.asp">Foreign Aid</a></td><td height="19" align="left">&nbsp;</td></tr>
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="nation_edit.asp">Edit My Nation</a></td><td height="19" align="left">&nbsp;</td></tr>
                            </table>
                        </td></tr>
                        <tr><td bgcolor="#000080" height="18"><p align="left"><font color="#FFFFFF"><b>&nbsp;:. Nation Purchases</b></font></p></td></tr>
                        <tr><td align="center" width="150">
                            <table border="0" cellpadding="2" style="border-collapse: collapse" width="100%">
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="collect_taxes.asp">Collect Taxes</a></td><td height="19" align="left">&nbsp;</td></tr>
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="pay_bills.asp">Pay Bills</a></td><td height="19" align="left">&nbsp;</td></tr>
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="infrastructurebuysell.asp">Infrastructure</a></td><td height="19" align="left">&nbsp;</td></tr>
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="improvements_purchase.asp">Improvements</a></td><td height="19" align="left">&nbsp;</td></tr>
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="landbuysell.asp">Land</a></td><td height="19" align="left">&nbsp;</td></tr>
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="technology_purchase.asp">Technology</a></td><td height="19" align="left">&nbsp;</td></tr>
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="national_wonders_purchase.asp">Wonders</a></td><td height="19" align="left">&nbsp;</td></tr>
                            </table>
                        </td></tr>
                        <tr><td bgcolor="#000080" height="18"><p align="left"><font color="#FFFFFF"><b>&nbsp;:. Military Menu</b></font></p></td></tr>
                        <tr><td align="center" width="150">
                            <table border="0" cellpadding="2" style="border-collapse: collapse" width="100%">
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="allNations_display_myranking.asp">Nation Rankings</a></td><td height="19" align="left">&nbsp;</td></tr>
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="military_purchase.asp">Purchase Military</a></td><td height="19" align="left">&nbsp;</td></tr>
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="militarydeploy.asp">Deploy Military</a></td><td height="19" align="left">&nbsp;</td></tr>
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="nation_war_information.asp">War & Battles</a></td><td height="19" align="left">&nbsp;</td></tr>
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="spies_information.asp">Spy Operations</a></td><td height="19" align="left">&nbsp;</td></tr>
                            </table>
                        </td></tr>
                        <tr><td bgcolor="#000080" height="18"><p align="left"><font color="#FFFFFF"><b>&nbsp;:. Alliance Menu</b></font></p></td></tr>
                        <tr><td align="center" width="150">
                            <table border="0" cellpadding="2" style="border-collapse: collapse" width="100%">
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="alliance_display.asp">View My Alliance</a></td><td height="19" align="left">&nbsp;</td></tr>
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="alliance_stats.asp">My Alliance Stats</a></td><td height="19" align="left">&nbsp;</td></tr>
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="alliance_announcement.asp">Announcements</a></td><td height="19" align="left">&nbsp;</td></tr>
                            </table>
                        </td></tr>
                        <tr><td bgcolor="#000080" height="18"><p align="left"><font color="#FFFFFF"><b>&nbsp;:. World Menu</b></font></p></td></tr>
                        <tr><td align="center" width="150">
                            <table border="0" cellpadding="2" style="border-collapse: collapse" width="100%">
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="allNations_display.asp">Display All Nations</a></td><td height="19" align="left">&nbsp;</td></tr>
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="alliance_all.asp">Display All Alliances</a></td><td height="19" align="left">&nbsp;</td></tr>
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="all_aid_information.asp">Foreign Aid Offers</a></td><td height="19" align="left">&nbsp;</td></tr>
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="all_war_information.asp">Wars Across the Globe</a></td><td height="19" align="left">&nbsp;</td></tr>
                                <tr><td height="19" width="18" align="right" valign="top"><img border="0" src="images/ico_arr_gray.gif" width="11" height="11"></td><td height="19" align="left"><a href="stats.asp">World Statistics</a></td><td height="19" align="left">&nbsp;</td></tr>
                            </table>
                        </td></tr>
                    </table>
                </div>
                <div style="width: 2%; flex-shrink: 0;"></div>
                <div style="flex: 1; padding: 0 20px;">
                    <div id="resourceCalculator"></div>
                </div>
            </div>
        </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
        body { font-family: Verdana, Arial, Helvetica, sans-serif; }
        .game-button { padding: 8px 16px; background: #000080; color: white; border: none; cursor: pointer; font-family: Verdana, Arial, Helvetica, sans-serif; }
        .game-select { padding: 6px 12px; border: 1px solid #000080; font-family: Verdana, Arial, Helvetica, sans-serif; }
        .resource-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(60px, 1fr)); gap: 8px; padding: 10px; background: #FFFFFF; min-height: 60px; }
        .resource-item { width: 50px; height: 50px; cursor: pointer; border: 2px solid transparent; transition: all 0.2s; position: relative; }
        .resource-item:hover { border-color: #000080; transform: scale(1.05); }
        .resource-item.active { border-color: #000080; }
        .resource-item.dragging { opacity: 0.5; transform: scale(1.1); }
        .bonus-item { border-color: #ff6b6b; }
        .bonus-item.active { }
        .mine-checkbox { display: flex; align-items: center; gap: 5px; font-family: Verdana, Arial, Helvetica, sans-serif; }
        .special-resources { display: none; }
        .bonus-bars { display: flex; flex-direction: column; gap: 8px; }
        .bonus-bar { display: flex; justify-content: space-between; padding: 8px; background: #FFFFFF; border: 1px solid #000080; }
        .bonus-value.positive { color: #28a745; }
        .bonus-value.negative { color: #dc3545; }
        .warning-message { background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 10px; margin-top: 10px; }
        .drag-over { border-color: #000080; background-color: #f0f8ff; }
        #activeResourceGrid, #activeBonusResourceGrid { background-color: #f8f9fa; }
        .resource-tooltip { position: absolute; background: #000080; color: white; padding: 5px 8px; border-radius: 3px; font-size: 12px; font-family: Verdana, Arial, Helvetica, sans-serif; white-space: nowrap; z-index: 1000; pointer-events: none; box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
        .game-input { padding: 5px; border: 1px solid #000080; border-radius: 3px; font-family: Verdana, Arial, Helvetica, sans-serif; width: 100%; box-sizing: border-box; }
        .game-button { height: 30px; padding: 0 12px; margin-right: 8px; }
        .game-select { height: 30px; margin-right: 8px; }
        .game-input { width: 150px; }
    `;
    document.head.appendChild(style);

    setTimeout(() => {
        const calcScript = `
            const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/oh-ari/cn-collect/main';
            const RESOURCE_LIMIT = 12;

            function createResourceImg(basePath, name, className) {
                const img = document.createElement('img');
                img.src = \`\${GITHUB_RAW_URL}\${basePath}/\${name}.png\`;
                img.className = className;
                img.setAttribute('data-resource', String(name).toLowerCase());
                img.draggable = true;

                if (basePath.includes('moonmars')) {
                    img.classList.add('special-resource');
                }

                img.onerror = () => {
                    console.error(\`Failed to load image: \${basePath}/\${name}.png\`);
                    img.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
                };

                const tooltip = document.createElement('div');
                tooltip.className = 'resource-tooltip';
                tooltip.textContent = name.charAt(0).toUpperCase() + name.slice(1).replace(/([A-Z])/g, ' $1');
                tooltip.style.display = 'none';
                img.appendChild(tooltip);

                img.addEventListener('mouseenter', () => {
                    tooltip.style.display = 'block';
                });

                img.addEventListener('mouseleave', () => {
                    tooltip.style.display = 'none';
                });

                return img;
            }

            function initializeResourceCalculator() {
                const calculator = document.getElementById('resourceCalculator');
                if (!calculator) return;

                const style = document.createElement('style');
                style.textContent = \`
                    .warning-message {
                        background-color: #ffebee;
                        color: #c62828;
                        padding: 10px;
                        margin: 10px 0;
                        border: 1px solid #ef5350;
                        border-radius: 4px;
                        text-align: center;
                        font-weight: bold;
                    }
                    .resource-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
                        gap: 5px;
                        padding: 10px;
                    }
                    .resource-item {
                        width: 40px;
                        height: 40px;
                        cursor: pointer;
                        border: 2px solid transparent;
                        transition: border-color 0.2s;
                    }
                    .resource-item:hover {
                        border-color: #000080;
                    }
                    .resource-item.active {
                        border-color: #00ff00;
                    }
                    .resource-item.dragging {
                        opacity: 0.5;
                    }
                    .drag-over {
                        background-color: #e3f2fd;
                    }
                    .bonus-item {
                        border-color: #ff9800;
                    }
                    .special-resource {
                        border-color: #9c27b0;
                    }
                    .resource-tooltip {
                        position: absolute;
                        background: #333;
                        color: white;
                        padding: 5px;
                        border-radius: 3px;
                        font-size: 12px;
                        white-space: nowrap;
                        z-index: 1000;
                        pointer-events: none;
                        top: -30px;
                        left: 50%;
                        transform: translateX(-50%);
                    }
                    .resource-item {
                        position: relative;
    }
                \`;
                document.head.appendChild(style);

                calculator.innerHTML = \`
                    <table border="2" cellpadding="5" cellspacing="0" style="border-collapse: collapse" bordercolor="#000080" bgcolor="#FFFFFF" width="100%">
                        <tr>
                            <td align="left" bgcolor="#000080" bordercolor="#000080">
                                <b><font color="#FFFFFF">:. Calculator Controls</font></b>
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <table border="0" width="100%" cellspacing="0" cellpadding="5">
                                    <tr>
                                        <td>
                                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                                <div>
                                                    <button class="game-button" id="resetResources">Reset</button>
                                                    <button class="game-button" id="importCurrent">Import</button>
                                                    <select class="game-select" id="presetSelect">
                                                        <option value="none">Select Preset</option>
                                                        <option value="3br-a">3BR-A</option>
                                                        <option value="3br-b">3BR-B</option>
                                                        <option value="4br-a">4BR-A</option>
                                                        <option value="5br-a">5BR-A</option>
                                                        <option value="7br-a">7BR-A</option>
                                                        <option value="8br-a">8BR-A</option>
                                                    </select>
                                                </div>
                                                <div style="border-left: 2px solid #000080; height: 30px; margin: 0 16px;"></div>
                                                <div>
                                                    <input type="text" class="game-input" id="customPresetName" placeholder="Preset Name">
                                                    <button class="game-button" id="savePreset">Save</button>
                                                    <button class="game-button" id="deletePreset">Delete</button>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>

                    <br>

                    <table border="2" cellpadding="5" cellspacing="0" style="border-collapse: collapse" bordercolor="#000080" bgcolor="#FFFFFF" width="100%">
                        <tr>
                            <td align="left" bgcolor="#000080" bordercolor="#000080">
                                <b><font color="#FFFFFF">:. Active Resources <span id="resourceCounter">0/12</span></font></b>
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <div class="resource-grid" id="activeResourceGrid"></div>
                            </td>
                        </tr>
                    </table>

                    <br>

                    <table border="2" cellpadding="5" cellspacing="0" style="border-collapse: collapse" bordercolor="#000080" bgcolor="#FFFFFF" width="100%">
                        <tr>
                            <td align="left" bgcolor="#000080" bordercolor="#000080">
                                <b><font color="#FFFFFF">:. Active Bonus Resources</font></b>
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <div class="resource-grid" id="activeBonusResourceGrid"></div>
                            </td>
                        </tr>
                    </table>

                    <br>

                    <table border="2" cellpadding="5" cellspacing="0" style="border-collapse: collapse" bordercolor="#000080" bgcolor="#FFFFFF" width="100%">
                        <tr>
                            <td align="left" bgcolor="#000080" bordercolor="#000080">
                                <b><font color="#FFFFFF">:. Available Resources</font></b>
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <div class="resource-grid" id="resourceGrid"></div>
                            </td>
                        </tr>
                    </table>

                    <br>

                    <table border="2" cellpadding="5" cellspacing="0" style="border-collapse: collapse" bordercolor="#000080" bgcolor="#FFFFFF" width="100%">
                        <tr>
                            <td align="left" bgcolor="#000080" bordercolor="#000080">
                                <b><font color="#FFFFFF">:. Available Bonus Resources</font></b>
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <div class="resource-grid" id="bonusResourceGrid"></div>
                            </td>
                        </tr>
                    </table>

                    <br>

                    <table border="2" cellpadding="5" cellspacing="0" style="border-collapse: collapse" bordercolor="#000080" bgcolor="#FFFFFF" width="100%">
                        <tr>
                            <td align="left" bgcolor="#000080" bordercolor="#000080">
                                <b><font color="#FFFFFF">:. Mine Controls</font></b>
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <table border="0" width="100%" cellspacing="0" cellpadding="5">
                                    <tr>
                                        <td width="50%">
                                            <label class="mine-checkbox">
                                                <input type="checkbox" id="moonMine"> Moon Mine
                                            </label>
                                        </td>
                                        <td width="50%">
                                            <label class="mine-checkbox">
                                                <input type="checkbox" id="marsMine"> Mars Mine
                                            </label>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>

                    <div class="special-resources" id="moonResources">
                        <br>
                        <table border="2" cellpadding="5" cellspacing="0" style="border-collapse: collapse" bordercolor="#000080" bgcolor="#FFFFFF" width="100%">
                            <tr>
                                <td align="left" bgcolor="#000080" bordercolor="#000080">
                                    <b><font color="#FFFFFF">:. Moon Resources</font></b>
                                </td>
                            </tr>
                            <tr>
                                <td>
                                    <div class="resource-grid"></div>
                                </td>
                            </tr>
                        </table>
                    </div>

                    <div class="special-resources" id="marsResources">
                        <br>
                        <table border="2" cellpadding="5" cellspacing="0" style="border-collapse: collapse" bordercolor="#000080" bgcolor="#FFFFFF" width="100%">
                            <tr>
                                <td align="left" bgcolor="#000080" bordercolor="#000080">
                                    <b><font color="#FFFFFF">:. Mars Resources</font></b>
                                </td>
                            </tr>
                            <tr>
                                <td>
                                    <div class="resource-grid"></div>
                                </td>
                            </tr>
                        </table>
                    </div>

                    <br>

                    <table border="0" width="100%" cellspacing="0" cellpadding="0">
                        <tr>
                            <td width="48%" valign="top">
                                <table border="2" cellpadding="5" cellspacing="0" style="border-collapse: collapse" bordercolor="#000080" bgcolor="#FFFFFF" width="100%">
                                    <tr>
                                        <td align="left" bgcolor="#000080" bordercolor="#000080">
                                            <b><font color="#FFFFFF">:. Economic Bonuses</font></b>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div class="economic-bonuses bonus-bars"></div>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                            <td width="4%">&nbsp;</td>
                            <td width="48%" valign="top">
                                <table border="2" cellpadding="5" cellspacing="0" style="border-collapse: collapse" bordercolor="#000080" bgcolor="#FFFFFF" width="100%">
                                    <tr>
                                        <td align="left" bgcolor="#000080" bordercolor="#000080">
                                            <b><font color="#FFFFFF">:. Military Bonuses</font></b>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div class="military-bonuses bonus-bars"></div>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                \`;

                loadResources();
                setupEventListeners();
            }

            function loadResources() {
                const resourceGrid = document.getElementById('resourceGrid');
                const resources = [
                    'aluminum', 'cattle', 'coal', 'fish', 'furs', 'gems', 'gold', 'iron',
                    'lead', 'lumber', 'marble', 'oil', 'pigs', 'rubber', 'silver', 'spices',
                    'sugar', 'uranium', 'water', 'wheat', 'wine'
                ];
                resources.forEach((name) => resourceGrid.appendChild(createResourceImg('/trade', name, 'resource-item')));

                const bonusGrid = document.getElementById('bonusResourceGrid');
                const bonuses = [
                    'affluent', 'asphalt', 'automobile', 'beer', 'construction',
                    'fastfood', 'jewelry', 'microchip', 'radiation', 'scholar', 'steel'
                ];
                bonuses.forEach((name) => bonusGrid.appendChild(createResourceImg('/trade/bonus', name, 'resource-item bonus-item')));

                loadSpecialResources();
            }

            function loadSpecialResources() {
                const appendTo = (containerId, list) => {
                    const grid = document.querySelector(\`#\${containerId} .resource-grid\`);
                    list.forEach((name) => grid.appendChild(createResourceImg('/trade/moonmars', name, 'resource-item')));
                };
                appendTo('moonResources', ['Calcium', 'Radon', 'Silicon', 'Titanium']);
                appendTo('marsResources', ['Basalt', 'Magnesium', 'Potassium', 'Sodium']);
            }

            function setupEventListeners() {
                setupDragAndDrop();
                setupMineHandlers();
                document.getElementById('resetResources').addEventListener('click', resetResources);
                document.getElementById('importCurrent').addEventListener('click', importCurrentResources);
                document.getElementById('presetSelect').addEventListener('change', handlePresetSelection);
                document.getElementById('savePreset').addEventListener('click', saveCurrentAsPreset);
                document.getElementById('deletePreset').addEventListener('click', deleteSelectedPreset);
                setupSpecialResourceListeners();
                loadCustomPresets();
            }

            function setupDragAndDrop() {
                const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                if (isMobile) {
                    setupMobileHandlers();
                } else {
                    setupDesktopDragAndDrop();
                }
            }

            function setupMobileHandlers() {
                document.querySelectorAll('.resource-item:not(.bonus-item)').forEach(item => {
                    item.addEventListener('click', () => {
                        if (item.parentElement.id === 'resourceGrid') {
                            if (isResourceLimitReached()) {
                                showWarning('You can only have 12 resources active.');
                                return;
                            }
                            document.getElementById('activeResourceGrid').appendChild(item);
                            item.classList.add('active');
                            checkAndAddBonusResources();
                            updateBonuses();
                        } else if (item.parentElement.id === 'activeResourceGrid') {
                            document.getElementById('resourceGrid').appendChild(item);
                            item.classList.remove('active');
                            updateBonuses();
                        }
                    });
                });

                document.querySelectorAll('.bonus-item').forEach(item => {
                    item.addEventListener('click', () => {
                        if (item.parentElement.id === 'bonusResourceGrid') {
                            const bonusId = item.getAttribute('data-resource');
                            handleBonusRequirements(bonusId);
                        } else if (item.parentElement.id === 'activeBonusResourceGrid') {
                            document.getElementById('bonusResourceGrid').appendChild(item);
                            item.classList.remove('active');
                            updateBonuses();
                        }
                    });
                });


            }

            function setupDesktopDragAndDrop() {
                document.querySelectorAll('.resource-item').forEach(item => {
                    item.addEventListener('dragstart', (e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        item.classList.add('dragging');
                    });

                    item.addEventListener('dragend', (e) => {
                        item.classList.remove('dragging');
                    });

                    item.addEventListener('click', () => handleResourceClick(item));
                });

                setupDropZone('activeResourceGrid', handleResourceDrop);
                setupDropZone('activeBonusResourceGrid', handleBonusDrop);
                setupDropZone('moonResources', handleSpecialResourceDrop);
                setupDropZone('marsResources', handleSpecialResourceDrop);
            }

            function setupDropZone(id, dropHandler) {
                const dropZone = document.getElementById(id);
                if (!dropZone) return;

                dropZone.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    dropZone.classList.add('drag-over');
                });

                dropZone.addEventListener('dragleave', (e) => {
                    if (!dropZone.contains(e.relatedTarget)) {
                        dropZone.classList.remove('drag-over');
                    }
                });

                dropZone.addEventListener('drop', (e) => {
                    e.preventDefault();
                    dropZone.classList.remove('drag-over');
                    dropHandler(e, dropZone);
                });
            }

            function handleBonusDrop(e, dropZone) {
                const draggingItem = document.querySelector('.dragging');
                if (!draggingItem) return;

                if (draggingItem.classList.contains('bonus-item')) {
                    const bonusId = draggingItem.getAttribute('data-resource');
                    handleBonusRequirements(bonusId);
                } else if (isSpecialResource(draggingItem)) {
                    handleSpecialResourceDrop(e, dropZone);
                }
            }

            function handleResourceDrop(e, dropZone) {
                const draggingItem = document.querySelector('.dragging');
                if (!draggingItem || draggingItem.classList.contains('bonus-item')) return;

                if (isResourceLimitReached()) {
                    showWarning('You can only have 12 resources active.');
                    return;
                }

                if (draggingItem.parentElement.id === 'resourceGrid') {
                    dropZone.appendChild(draggingItem);
                    draggingItem.classList.add('active');
                    checkAndAddBonusResources();
                    updateBonuses();
                }
            }

            function handleSpecialResourceDrop(e, dropZone) {
                const draggingItem = document.querySelector('.dragging');
                if (!draggingItem || !isSpecialResource(draggingItem)) return;

                const activeBonusGrid = document.getElementById('activeBonusResourceGrid');
                const existingSpecial = activeBonusGrid.querySelector('[data-resource*="calcium"], [data-resource*="radon"], [data-resource*="silicon"], [data-resource*="titanium"], [data-resource*="basalt"], [data-resource*="magnesium"], [data-resource*="potassium"], [data-resource*="sodium"]');

                if (existingSpecial) {
                    const sourceGrid = existingSpecial.getAttribute('data-resource').toLowerCase().includes('calcium') || existingSpecial.getAttribute('data-resource').toLowerCase().includes('radon') || existingSpecial.getAttribute('data-resource').toLowerCase().includes('silicon') || existingSpecial.getAttribute('data-resource').toLowerCase().includes('titanium') ? 'moonResources' : 'marsResources';
                    document.querySelector('#' + sourceGrid + ' .resource-grid').appendChild(existingSpecial);
                    existingSpecial.classList.remove('active');
                }

                activeBonusGrid.appendChild(draggingItem);
                draggingItem.classList.add('active');
                if (!draggingItem.hasAttribute('data-click-bound')) {
                    draggingItem.addEventListener('click', () => handleResourceClick(draggingItem));
                    draggingItem.setAttribute('data-click-bound', 'true');
                }
                updateBonuses();
            }

            function handleResourceClick(item) {
                if (item.classList.contains('bonus-item')) {
                    const bonusId = item.getAttribute('data-resource');
                    handleBonusRequirements(bonusId);
                } else if (isSpecialResource(item) || isSpecialResourceFromGrid(item)) {
                    handleSpecialResourceClick(item);
                } else {
                    if (item.parentElement.id === 'resourceGrid') {
                        if (isResourceLimitReached()) {
                            showWarning('You can only have 12 resources active.');
                            return;
                        }
                        document.getElementById('activeResourceGrid').appendChild(item);
                        item.classList.add('active');
                        checkAndAddBonusResources();
                        updateBonuses();
                    } else if (item.parentElement.id === 'activeResourceGrid') {
                        document.getElementById('resourceGrid').appendChild(item);
                        item.classList.remove('active');
                        updateBonuses();
                    }
                }
            }

            function isSpecialResource(item) {
                const resourceName = item.getAttribute('data-resource');
                return item.classList.contains('special-resource') || ['calcium', 'radon', 'silicon', 'titanium', 'basalt', 'magnesium', 'potassium', 'sodium'].includes(resourceName.toLowerCase());
            }

            function isSpecialResourceFromGrid(item) {
                const parentId = item.parentElement.id;
                return parentId === 'moonResources' || parentId === 'marsResources';
            }

            function handleSpecialResourceClick(item) {
                if (item.parentElement.id === 'activeBonusResourceGrid') {
                    const sourceGrid = item.getAttribute('data-resource').toLowerCase().includes('calcium') || item.getAttribute('data-resource').toLowerCase().includes('radon') || item.getAttribute('data-resource').toLowerCase().includes('silicon') || item.getAttribute('data-resource').toLowerCase().includes('titanium') ? 'moonResources' : 'marsResources';
                    document.querySelector('#' + sourceGrid + ' .resource-grid').appendChild(item);
                    item.classList.remove('active');
                    updateBonuses();
                    return;
                }

                const activeBonusGrid = document.getElementById('activeBonusResourceGrid');
                const existingSpecial = activeBonusGrid.querySelector('[data-resource*="calcium"], [data-resource*="radon"], [data-resource*="silicon"], [data-resource*="titanium"], [data-resource*="basalt"], [data-resource*="magnesium"], [data-resource*="potassium"], [data-resource*="sodium"]');

                if (existingSpecial) {
                    const sourceGrid = existingSpecial.getAttribute('data-resource').toLowerCase().includes('calcium') || existingSpecial.getAttribute('data-resource').toLowerCase().includes('radon') || existingSpecial.getAttribute('data-resource').toLowerCase().includes('silicon') || existingSpecial.getAttribute('data-resource').toLowerCase().includes('titanium') ? 'moonResources' : 'marsResources';
                    document.querySelector('#' + sourceGrid + ' .resource-grid').appendChild(existingSpecial);
                    existingSpecial.classList.remove('active');
                }

                activeBonusGrid.appendChild(item);
                item.classList.add('active');

                if (!item.hasAttribute('data-click-bound')) {
                    item.addEventListener('click', () => handleResourceClick(item));
                    item.setAttribute('data-click-bound', 'true');
                }
                updateBonuses();
            }

            function setupMineHandlers() {
                const moonMine = document.getElementById('moonMine');
                const marsMine = document.getElementById('marsMine');
                const moonResources = document.getElementById('moonResources');
                const marsResources = document.getElementById('marsResources');

                function handleMineSelection(e) {
                    const checkbox = e.target;
                    const otherCheckbox = checkbox.id === 'moonMine' ? marsMine : moonMine;
                    const activeBonusGrid = document.getElementById('activeBonusResourceGrid');

                    if (checkbox.checked) {
                        otherCheckbox.checked = false;

                        const existingSpecial = activeBonusGrid.querySelector('[data-resource*="calcium"], [data-resource*="radon"], [data-resource*="silicon"], [data-resource*="titanium"], [data-resource*="basalt"], [data-resource*="magnesium"], [data-resource*="potassium"], [data-resource*="sodium"]');
                        if (existingSpecial) {
                            const sourceGrid = existingSpecial.getAttribute('data-resource').toLowerCase().includes('calcium') || existingSpecial.getAttribute('data-resource').toLowerCase().includes('radon') || existingSpecial.getAttribute('data-resource').toLowerCase().includes('silicon') || existingSpecial.getAttribute('data-resource').toLowerCase().includes('titanium') ? 'moonResources' : 'marsResources';
                            if (sourceGrid !== (checkbox.id === 'moonMine' ? 'moonResources' : 'marsResources')) {
                                document.querySelector('#' + sourceGrid + ' .resource-grid').appendChild(existingSpecial);
                                existingSpecial.classList.remove('active');
                                updateBonuses();
                            }
                        }
                    }

                    moonResources.style.display = moonMine.checked ? 'block' : 'none';
                    marsResources.style.display = marsMine.checked ? 'block' : 'none';

                    if (moonMine.checked || marsMine.checked) {
                        setupSpecialResourceListeners();
                    }
                }

                moonMine.addEventListener('change', handleMineSelection);
                marsMine.addEventListener('change', handleMineSelection);

                moonResources.style.display = 'none';
                marsResources.style.display = 'none';
            }

            function setupSpecialResourceListeners() {
                document.querySelectorAll('#moonResources .resource-item, #marsResources .resource-item, #activeBonusResourceGrid .special-resource').forEach(item => {
                    if (!item.hasAttribute('data-click-bound')) {
                        item.addEventListener('click', () => handleResourceClick(item));
                        item.setAttribute('data-click-bound', 'true');
                    }
                });
            }

            function showWarning(message) {
                const warning = document.createElement('div');
                warning.className = 'warning-message';
                warning.textContent = message;
                const calculator = document.getElementById('resourceCalculator');
                if (calculator) {
                    calculator.appendChild(warning);
                }

                setTimeout(() => warning.remove(), 3000);
            }

            function isResourceLimitReached() {
                return document.getElementById('activeResourceGrid').children.length >= RESOURCE_LIMIT;
            }

            const bonusRequirements = {
                'affluent': { resources: ['fish', 'furs', 'wine'], bonuses: ['jewelry'] },
                'asphalt': { resources: ['oil', 'rubber'], bonuses: ['construction'] },
                'automobile': { resources: [], bonuses: ['asphalt', 'steel'] },
                'beer': { resources: ['water', 'wheat', 'lumber', 'aluminum'], bonuses: [] },
                'construction': { resources: ['lumber', 'iron', 'marble', 'aluminum'], bonuses: [] },
                'fastfood': { resources: ['cattle', 'sugar', 'spices', 'pigs'], bonuses: [] },
                'jewelry': { resources: ['gold', 'silver', 'gems', 'coal'], bonuses: [] },
                'microchip': { resources: ['gold', 'lead', 'oil'], bonuses: [] },
                'radiation': { resources: ['construction', 'steel'], bonuses: ['microchip'] },
                'scholar': { resources: ['lumber', 'lead'], bonuses: [] },
                'steel': { resources: ['coal', 'iron'], bonuses: [] }
            };

            function checkAndAddBonusResources() {
                const activeResources = Array.from(document.getElementById('activeResourceGrid').children)
                    .map(item => item.getAttribute('data-resource'));

                Object.entries(bonusRequirements).forEach(([bonusId, requirements]) => {
                    if (requirements.resources.length === 0) return;

                    const hasAllRequirements = requirements.resources.every(resource =>
                        activeResources.includes(resource)
                    );

                    if (hasAllRequirements) {
                        const bonusItem = document.querySelector('#bonusResourceGrid [data-resource="' + bonusId + '"]');
                        const isAlreadyActive = document.querySelector('#activeBonusResourceGrid [data-resource="' + bonusId + '"]');

                        if (bonusItem && !isAlreadyActive) {
                            document.getElementById('activeBonusResourceGrid').appendChild(bonusItem);
                            bonusItem.classList.add('active');
                            if (!bonusItem.hasAttribute('data-click-bound')) {
                                bonusItem.addEventListener('click', () => handleResourceClick(bonusItem));
                                bonusItem.setAttribute('data-click-bound', 'true');
                            }
                        }
                    }
                });
            }

            const resourceBonuses = {
                economic: {
                    'land_area': { name: 'Land Area', resources: { coal: 15, rubber: 20, spices: 8 }, format: '+%v%' },
                    'land_cost': { name: 'Land Cost', resources: { cattle: -10, fish: -5, rubber: -10 }, format: '-%v%' },
                    'infrastructure_purchase': { name: 'Infrastructure Purchase', resources: { aluminum: -7, coal: -4, iron: -5, lumber: -6, marble: -10, rubber: -3 }, bonuses: { construction: -5, steel: -2 }, format: '-%v%' },
                    'infrastructure_upkeep': { name: 'Infrastructure Upkeep', resources: { iron: -10, lumber: -8, uranium: -3 }, bonuses: { asphalt: -5, basalt: -5, magnesium: -4 }, format: '-%v%' },
                    'infrastructure_purchase': { name: 'Infrastructure Purchase', resources: { aluminum: -7, coal: -4, iron: -5, lumber: -6, marble: -10, rubber: -3 }, bonuses: { construction: -5, steel: -2, basalt: -5 }, format: '-%v%' },
                    'citizen_count': { name: 'Citizens', resources: { cattle: 5, fish: 8, pigs: 3.5, sugar: 3, wheat: 8 }, bonuses: { affluent: 5 }, format: '+%v%' },
                    'citizen_income': { name: 'Citizen Income', resources: { furs: 3.50, gems: 1.50, gold: 3.00, silver: 2.00 }, bonuses: { scholar: 3.00 }, format: '+$%v' },
                    'happiness': { name: 'Happiness', resources: { gems: 2.5, oil: 1.5, silver: 2, spices: 2, sugar: 1, water: 2.5, wine: 3 }, bonuses: { automobile: 3, fastfood: 2, jewelry: 3, microchip: 2, beer: 2, basalt: 3, magnesium: 4, potassium: 3, sodium: 2 }, format: '+%v' },
                    'tech_cost': { name: 'Technology Cost', resources: { gold: -5 }, bonuses: { microchip: -8 }, format: '-%v%' },
                    'grl_reduction': { name: 'GRL Reduction', resources: {}, bonuses: { radiation: 50 }, format: '-%v%' }
                },
                military: {
                    'soldier_efficiency': { name: 'Soldier Efficiency', resources: { aluminum: 20, coal: 8, oil: 10, pigs: 15 }, format: '+%v%' },
                    'soldier_cost': { name: 'Soldier Cost', resources: { iron: -3, oil: -3 }, format: '-$%v' },
                    'soldier_upkeep': { name: 'Soldier Upkeep', resources: { lead: -0.50, pigs: -0.50 }, format: '-$%v' },
                    'aircraft_purchase': { name: 'Aircraft Purchase', resources: { aluminum: -8, oil: -4, rubber: -4 }, format: '-%v%' },
                    'aircraft_upkeep': { name: 'Aircraft Upkeep', resources: { lead: -25 }, format: '-%v%' },
                    'tank_purchase': { name: 'Tank Purchase', resources: { lead: -8 }, format: '-%v%' },
                    'tank_upkeep': { name: 'Tank Upkeep', resources: { iron: -5, oil: -5, lead: -8 }, format: '-%v%' },
                    'navy_purchase': { name: 'Navy Purchase', resources: { uranium: -5 }, bonuses: { steel: -15, microchip: -10 }, format: '-%v%' },
                    'navy_upkeep': { name: 'Navy Upkeep', resources: { lead: -20, oil: -10 }, format: '-%v%' },
                    'missile_costs': { name: 'Missile/Nuclear Costs', resources: { lead: -20 }, format: '-%v%' }
                }
            };

            function handleBonusRequirements(bonusId) {
                const requirements = bonusRequirements[bonusId];
                if (!requirements) return false;

                const activeResourceGrid = document.getElementById('activeResourceGrid');
                const currentActiveCount = activeResourceGrid.children.length;
                const missingResources = requirements.resources.filter(resourceId =>
                    !document.querySelector(\`#activeResourceGrid [data-resource="\${resourceId}"]\`)
                );

                if (currentActiveCount + missingResources.length > RESOURCE_LIMIT) {
                    showWarning('Not enough space for required resources');
                    return false;
                }

                missingResources.forEach(resourceId => {
                    const resourceItem = document.querySelector(\`#resourceGrid [data-resource="\${resourceId}"]\`);
                    if (resourceItem) {
                        activeResourceGrid.appendChild(resourceItem);
                        resourceItem.classList.add('active');
                    }
                });

                if (requirements.bonuses) {
                    requirements.bonuses.forEach(requiredBonusId => {
                        if (!document.querySelector(\`#activeBonusResourceGrid [data-resource="\${requiredBonusId}"]\`)) {
                            handleBonusRequirements(requiredBonusId);
                        }
                    });
                }

                const bonusItem = document.querySelector(\`#bonusResourceGrid [data-resource="\${bonusId}"]\`);
                if (bonusItem) {
                    document.getElementById('activeBonusResourceGrid').appendChild(bonusItem);
                    bonusItem.classList.add('active');
                    if (!bonusItem.hasAttribute('data-click-bound')) {
                        bonusItem.addEventListener('click', () => handleResourceClick(bonusItem));
                        bonusItem.setAttribute('data-click-bound', 'true');
                    }
                }

                updateBonuses();
                return true;
            }

            function updateBonuses() {
                const activeResources = Array.from(document.getElementById('activeResourceGrid').children)
                    .map(item => item.getAttribute('data-resource'));
                const activeBonuses = Array.from(document.getElementById('activeBonusResourceGrid').children)
                    .map(item => item.getAttribute('data-resource'));

                const counter = document.getElementById('resourceCounter');
                counter.textContent = \`\${activeResources.length}/12\`;

                const bonusTotals = calculateBonuses(activeResources, activeBonuses);
                updateBonusDisplay(bonusTotals);
            }

            function calculateBonuses(activeResources, activeBonuses) {
                const bonusTotals = { economic: {}, military: {} };

                Object.keys(resourceBonuses).forEach(type => {
                    Object.keys(resourceBonuses[type]).forEach(category => {
                        bonusTotals[type][category] = 0;
                    });
                });

                const activeSpecialResources = Array.from(document.getElementById('activeBonusResourceGrid').children)
                    .filter(item => isSpecialResource(item))
                    .map(item => item.getAttribute('data-resource').toLowerCase());

                const allActiveResources = [...activeResources, ...activeSpecialResources];

                Object.entries(resourceBonuses).forEach(([type, categories]) => {
                    Object.entries(categories).forEach(([category, data]) => {
                        allActiveResources.forEach(resource => {
                            if (data.resources && data.resources[resource]) {
                                bonusTotals[type][category] += data.resources[resource];
                            }
                        });

                        activeBonuses.forEach(bonus => {
                            if (data.bonuses && data.bonuses[bonus]) {
                                bonusTotals[type][category] += data.bonuses[bonus];
                            }
                        });

                        activeSpecialResources.forEach(special => {
                            if (data.bonuses && data.bonuses[special]) {
                                bonusTotals[type][category] += data.bonuses[special];
                            }
                        });
                    });
                });





                if (activeBonuses.includes('radiation')) {
                    let grlReduction = 50;
                    if (activeSpecialResources.includes('sodium')) grlReduction = 75;
                    if (!bonusTotals.economic.grl_reduction) bonusTotals.economic.grl_reduction = 0;
                    bonusTotals.economic.grl_reduction = grlReduction;
                }

                activeSpecialResources.forEach(special => {
                    switch(special) {
                        case 'calcium':
                            const calciumResources = ['rubber', 'furs', 'spices', 'wine'];
                            const calciumBonus = calciumResources.filter(r => activeResources.includes(r)).length * 3.00;
                            if (calciumBonus > 0) {
                                bonusTotals.economic.citizen_income += calciumBonus;
                            }
                            break;
                        case 'radon':
                            const radonResources = ['lead', 'gold', 'water', 'uranium'];
                            const radonBonus = radonResources.filter(r => activeResources.includes(r)).length * 3.00;
                            if (radonBonus > 0) {
                                bonusTotals.economic.citizen_income += radonBonus;
                            }
                            break;
                        case 'silicon':
                            const siliconResources = ['rubber', 'furs', 'gems', 'silver'];
                            const siliconBonus = siliconResources.filter(r => activeResources.includes(r)).length * 3.00;
                            if (siliconBonus > 0) {
                                bonusTotals.economic.citizen_income += siliconBonus;
                            }
                            break;
                        case 'titanium':
                            const titaniumResources = ['gold', 'lead', 'coal', 'oil'];
                            const titaniumBonus = titaniumResources.filter(r => activeResources.includes(r)).length * 3.00;
                            if (titaniumBonus > 0) {
                                bonusTotals.economic.citizen_income += titaniumBonus;
                            }
                            break;
                    }
                });

                return bonusTotals;
            }

            function updateBonusDisplay(bonusTotals) {
                ['economic', 'military'].forEach(type => {
                    const container = document.querySelector(\`.\${type}-bonuses\`);
                    if (!container) return;

                    container.innerHTML = '';

                    Object.entries(resourceBonuses[type]).forEach(([category, data]) => {
                        const value = bonusTotals[type][category];
                        if (value !== 0) {
                            const bar = document.createElement('div');
                            bar.className = 'bonus-bar';
                            bar.innerHTML = \`
                                <span class="bonus-name">\${data.name}</span>
                                <span class="bonus-value \${value < 0 ? 'negative' : 'positive'}">
                                    \${formatBonusValue(value, data.format)}
                                </span>
                            \`;
                            container.appendChild(bar);
                        }
                    });
                });
            }

            function formatBonusValue(value, format) {
                const absValue = Math.abs(value);
                const sign = value >= 0 ? '+' : '-';

                switch (format) {
                    case '+%v%':
                    case '-%v%':
                        return \`\${sign}\${absValue.toFixed(1)}%\`;
                    case '+$%v':
                    case '-$%v':
                        return \`\${sign}\$\${absValue.toFixed(2)}\`;
                    default:
                        return \`\${sign}\${absValue.toFixed(1)}\`;
                }
            }

            function handlePresetSelection(e) {
                const selectedPreset = e.target.value;
                if (selectedPreset === 'none') return;

                resetResources();

                const presetResources = presetConfigurations[selectedPreset];
                if (presetResources) {
                    presetResources.forEach(resourceId => {
                        const resourceElement = document.querySelector(\`#resourceGrid [data-resource="\${resourceId}"]\`);
                        if (resourceElement) {
                            document.getElementById('activeResourceGrid').appendChild(resourceElement);
                            resourceElement.classList.add('active');
                        }
                    });
                    checkAndAddBonusResources();
                    updateBonuses();
                }
            }

            function resetResources() {
                ['activeResourceGrid', 'activeBonusResourceGrid'].forEach(gridId => {
                    const grid = document.getElementById(gridId);
                    while (grid.firstChild) {
                        const item = grid.firstChild;
                        const isBonus = item.classList.contains('bonus-item');
                        const isSpecial = isSpecialResource(item);

                        let targetGrid;
                        if (isSpecial) {
                            const resourceName = item.getAttribute('data-resource').toLowerCase();
                            if (['calcium', 'radon', 'silicon', 'titanium'].includes(resourceName)) {
                                targetGrid = document.querySelector('#moonResources .resource-grid');
                            } else {
                                targetGrid = document.querySelector('#marsResources .resource-grid');
                            }
                        } else {
                            targetGrid = document.getElementById(isBonus ? 'bonusResourceGrid' : 'resourceGrid');
                        }

                        targetGrid.appendChild(item);
                        item.classList.remove('active');
                    }
                });

                document.getElementById('moonMine').checked = false;
                document.getElementById('marsMine').checked = false;

                updateBonuses();
            }

            function importCurrentResources() {
                const nationId = localStorage.getItem('cn:lastNationId');
                if (!nationId) return;

                const stats = JSON.parse(localStorage.getItem('cn:stats:' + nationId) || '{}');
                if (!stats.resources || !stats.bonusResources) return;

                resetResources();

                stats.resources.forEach(resourceName => {
                    const resourceElement = document.querySelector(\`#resourceGrid [data-resource="\${resourceName.toLowerCase()}"]\`);
                    if (resourceElement) {
                        document.getElementById('activeResourceGrid').appendChild(resourceElement);
                        resourceElement.classList.add('active');
                    }
                });

                checkAndAddBonusResources();

                stats.bonusResources.forEach(bonusName => {
                    const bonusNameLower = bonusName.toLowerCase();
                    let bonusElement = document.querySelector(\`#bonusResourceGrid [data-resource="\${bonusNameLower}"]\`);

                    if (!bonusElement && ['calcium', 'radon', 'silicon', 'titanium', 'basalt', 'magnesium', 'potassium', 'sodium'].includes(bonusNameLower)) {
                        if (['calcium', 'radon', 'silicon', 'titanium'].includes(bonusNameLower)) {
                            bonusElement = document.querySelector(\`#moonResources [data-resource="\${bonusNameLower}"]\`);
                        } else {
                            bonusElement = document.querySelector(\`#marsResources [data-resource="\${bonusNameLower}"]\`);
                        }
                    }

                    if (bonusElement) {
                        document.getElementById('activeBonusResourceGrid').appendChild(bonusElement);
                        bonusElement.classList.add('active');
                    }
                });

                updateBonuses();
            }

            const presetConfigurations = {
                '3br-a': ['aluminum', 'cattle', 'iron', 'lumber', 'marble', 'pigs', 'spices', 'sugar', 'water', 'wheat', 'fish'],
                '3br-b': ['cattle', 'coal', 'fish', 'furs', 'gems', 'gold', 'pigs', 'silver', 'spices', 'sugar', 'wine', 'wheat'],
                '4br-a': ['aluminum', 'cattle', 'coal', 'iron', 'lumber', 'marble', 'pigs', 'spices', 'sugar', 'water', 'wheat', 'fish'],
                '5br-a': ['aluminum', 'coal', 'iron', 'lumber', 'marble', 'oil', 'rubber', 'water', 'wheat', 'fish'],
                '7br-a': ['aluminum', 'coal', 'gold', 'iron', 'lead', 'lumber', 'marble', 'oil', 'rubber', 'fish', 'wheat'],
                '8br-a': ['aluminum', 'coal', 'gems', 'gold', 'iron', 'lead', 'lumber', 'marble', 'oil', 'rubber', 'silver']
            };

            function loadCustomPresets() {
                const customPresets = JSON.parse(localStorage.getItem('cn:customPresets') || '{}');
                Object.assign(presetConfigurations, customPresets);
                updatePresetSelect();
            }

            function updatePresetSelect() {
                const select = document.getElementById('presetSelect');
                if (!select) return;

                const currentValue = select.value;
                select.innerHTML = '<option value="none">Select Preset</option>';

                Object.keys(presetConfigurations).forEach(key => {
                    const option = document.createElement('option');
                    option.value = key;
                    option.textContent = key.toUpperCase();
                    select.appendChild(option);
                });

                if (currentValue && presetConfigurations[currentValue]) {
                    select.value = currentValue;
                }
            }

            function saveCurrentAsPreset() {
                const nameInput = document.getElementById('customPresetName');
                const name = nameInput.value.trim();
                if (!name) return;

                const activeResources = Array.from(document.getElementById('activeResourceGrid').children)
                    .map(item => item.getAttribute('data-resource'));
                const activeBonusResources = Array.from(document.getElementById('activeBonusResourceGrid').children)
                    .map(item => item.getAttribute('data-resource'));

                if (activeResources.length === 0) return;

                const customPresets = JSON.parse(localStorage.getItem('cn:customPresets') || '{}');
                customPresets[name] = activeResources;
                localStorage.setItem('cn:customPresets', JSON.stringify(customPresets));

                presetConfigurations[name] = activeResources;
                updatePresetSelect();
                nameInput.value = '';

                showWarning('Preset saved successfully!');
            }

            function deleteSelectedPreset() {
                const select = document.getElementById('presetSelect');
                const selectedValue = select.value;
                if (selectedValue === 'none' || !presetConfigurations[selectedValue]) return;

                if (selectedValue.startsWith('3br-') || selectedValue.startsWith('4br-') || selectedValue.startsWith('5br-') || selectedValue.startsWith('7br-') || selectedValue.startsWith('8br-')) {
                    showWarning('Cannot delete built-in presets');
                    return;
                }

                const customPresets = JSON.parse(localStorage.getItem('cn:customPresets') || '{}');
                delete customPresets[selectedValue];
                localStorage.setItem('cn:customPresets', JSON.stringify(customPresets));

                delete presetConfigurations[selectedValue];
                updatePresetSelect();

                showWarning('Preset deleted successfully!');
            }

            initializeResourceCalculator();
        `;

        eval(calcScript);
    }, 100);
}

  try { main(); } catch (e) { /* swallow */ }
})();