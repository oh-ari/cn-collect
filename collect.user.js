// ==UserScript==
// @name         CN Collect Advisor
// @namespace    https://cn-collect.local
<<<<<<< Updated upstream
// @author       Ari / Mochi
// @version      1.0
=======
// @version      1.3
>>>>>>> Stashed changes
// @description  Warns you on a bad collect.
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
    if (!a) return { hasGuerrillaCamps: false, hasLaborCamps: false, improvementsText: '' };
    const td = a.closest('tr')?.querySelectorAll('td')[1] || a.closest('td');
    const text = (td?.querySelector('table td:nth-child(2)')?.textContent || td?.textContent || '')
      .replace(/\s+/g, ' ').trim();
    return {
      hasGuerrillaCamps: /Guerrilla\s+Camps/i.test(text),
      hasLaborCamps: /Labor\s+Camps/i.test(text),
      improvementsText: text,
    };
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

  function createWarningTable(htmlInner) {
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

  function setButtonDisabled(btn, disabled) {
    if (!btn) return;
    btn.disabled = !!disabled;
    const s = btn.style;
    if (disabled) { s.opacity = '0.5'; s.filter = 'grayscale(100%)'; s.cursor = 'not-allowed'; }
    else { s.opacity = ''; s.filter = ''; s.cursor = ''; }
  }

  function formatNumber(num) {
    try { return Number(num).toLocaleString(); } catch { return String(num); }
  }

  function handleNationPage() {
    const nationId = findNationIdFromPage();
    if (!nationId) return;
    const myNationId = findNationIdFromSidebar();
    if (myNationId && nationId !== myNationId) return;

    const imp = getImprovementsFlags();
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
    
    if (effectiveStats.hasLaborCamps) issues.push('Labor Camps are present.');
    if (effectiveStats.hasGuerrillaCamps) issues.push('Guerrilla Camps are present.');

    if (typeof effectiveStats.soldiers === 'number' && typeof effectiveStats.soldiersTarget25 === 'number') {
      if (effectiveStats.soldiers > effectiveStats.soldiersTarget25) {
        const toSell = Math.max(0, effectiveStats.soldiersToSell || 0);
        issues.push(
          `Soldiers exceed 25% cap. You have <b>${formatNumber(effectiveStats.soldiers)}</b> soldiers; 25% of population is <b>${formatNumber(effectiveStats.soldiersTarget25)}</b>. Suggested to sell <b>${formatNumber(toSell)}</b>.`
        );
      }
    } else if (typeof effectiveStats.totalPopulation === 'number') {
      const soldiersNow = getSoldiers();
      if (typeof soldiersNow === 'number') {
        const cap = Math.floor(effectiveStats.totalPopulation * 0.25);
        const toSell = Math.max(0, soldiersNow - cap);
        if (soldiersNow > cap) {
          issues.push(
            `Soldiers exceed 25% cap. You have <b>${formatNumber(soldiersNow)}</b> soldiers; 25% of population is <b>${formatNumber(cap)}</b>. Suggested to sell <b>${formatNumber(toSell)}</b>.`
          );
        }
        effectiveStats.soldiers = soldiersNow;
        effectiveStats.soldiersTarget25 = cap;
        effectiveStats.soldiersToSell = toSell;
        if (nationId) saveNationStats(nationId, effectiveStats);
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
        issues.push('Your trade circle isn\'t complete.');
      } else if (effectiveStats.tradeSlotsUsed >= effectiveStats.tradeSlotsTotal && effectiveStats.tradeSlotsTotal >= 5) {
        notes.push("Your trade circle looks complete! Do you need to temp? If not, you can ignore this. Yay you!");
      }
    }

    if (typeof effectiveStats.technology === 'number' && effectiveStats.technology < 110) {
      notes.push(`Your tech is ${formatNumber(effectiveStats.technology)}. Consider buying to 110 for additional bonuses.`);
    }

    if (effectiveStats.governmentDiscontent === true) {
      if (effectiveStats.governmentPreferenceName) notes.push(`Government preference: ${effectiveStats.governmentPreferenceName}`);
      else notes.push(`Your people would prefer a different government than ${effectiveStats.governmentName || 'current'}.`);
    }
    if (effectiveStats.religionDiscontent === true) {
      if (effectiveStats.religionPreferenceName) notes.push(`Religion preference: ${effectiveStats.religionPreferenceName}`);
      else notes.push(`Your people would prefer a different national religion than ${effectiveStats.religionName || 'current'}.`);
    }

    if (issues.length === 0 && notes.length === 0) return;

    const overrideId = 'cn_collect_override';
    const hasWarnings = issues.length > 0;
    const messages = issues.concat(notes);
    const panelHtml = `
      <div style="padding:4px;">
        <img src="images/ico_arr_gray.gif" width="11" height="11"> <b>Recommendations</b>
        <ul style="margin-top:6px;">${messages.map((i) => `<li>${i}</li>`).join('')}</ul>
        ${hasWarnings ? `<div style="margin-top:8px;"><label><input type="checkbox" id="${overrideId}"> I understand and want to collect taxes anyway (e.g., at war).</label></div>` : ''}
      </div>
    `;
    const existing = document.getElementById('cn_collect_panel');
    if (existing) {
      const tr = existing.closest('tr');
      if (tr && tr.parentNode) tr.parentNode.removeChild(tr); else existing.remove();
    }
    const panel = createWarningTable(panelHtml);

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

    setButtonDisabled(submitBtn, hasWarnings);
    if (hasWarnings) {
      const override = document.getElementById(overrideId);
      if (override) {
        override.addEventListener('change', () => {
          setButtonDisabled(submitBtn, !override.checked);
        });
        if (effectiveStats.hasLaborCamps === false || effectiveStats.hasGuerrillaCamps === false) {
          const box = override.closest('div') || override.parentElement;
          if (box && box.parentNode) {
            const r = document.createElement('div');
            r.style.marginTop = '6px';
            r.textContent = "Don't forget to rebuy your Labor Camps and Guerrilla Camps after collecting.";
            box.insertAdjacentElement('afterend', r);
          }
        }
      }
    }
  }

  function main() {
    const path = location.pathname.toLowerCase();
    if (path.includes('nation_drill_display.asp')) {
      handleNationPage();
    }
    if (path.includes('collect_taxes.asp')) {
      handleCollectPage();
    }
    const sidebarNationId = findNationIdFromSidebar();
    if (sidebarNationId) try { localStorage.setItem(LAST_NATION_KEY, sidebarNationId); } catch {}
  }

  try { main(); } catch (e) { /* swallow */ }
})();


