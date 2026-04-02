// content.js
const msPerDay = 86400000;

async function sendPrompt(text) {
  try {
    const response = await fetch('https://reportsapi-d8ja.onrender.com/api/prompt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();
    return data; // { success: true, resp: "..." }

  } catch (err) {
    console.error('Fetch error:', err);
    return { success: false, error: err.message };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTodayDate() {
  const now = new Date();
  console.log(
    `Поточна дата: ${String(now.getDate()).padStart(2, "0")}.${String(
      now.getMonth() + 1
    ).padStart(2, "0")}.${now.getFullYear()}`
  );
  return `${String(now.getDate()).padStart(2, "0")}.${String(
    now.getMonth() + 1
  ).padStart(2, "0")}.${now.getFullYear()}`;
}

function parseDMY(str) {
  // "dd.mm.yyyy" → Date
  const [d, m, y] = str.split(".").map(Number);
  return new Date(y, m - 1, d);
}

function getStudentName(row) {
  const el = row.querySelector("a .hover-brand-effect");
  return el ? el.textContent.trim() : "Unknown";
}

async function readTooltip(square) {
  const id = square.getAttribute("aria-describedby");
  if (!id) return null;

  ["mouseenter", "mouseover"].forEach((t) =>
    square.dispatchEvent(new MouseEvent(t, { bubbles: true }))
  );
  await sleep(150);

  const el = document.getElementById(id);
  const inner = el?.closest(".ant-tooltip-inner");
  if (!inner) {
    ["mouseleave", "mouseout"].forEach((t) =>
      square.dispatchEvent(new MouseEvent(t, { bubbles: true }))
    );
    return null;
  }

  let date = "",
    lesson = "",
    status = "";
  inner.querySelectorAll(".ant-typography").forEach((span) => {
    const text = span.textContent.trim();
    const dm = text.match(/(\d{2}\.\d{2}\.\d{4})/);
    if (dm && !date) date = dm[1];
    if (/^\d+\.\s/.test(text) && !lesson) lesson = text;
    if (
      ["Присутній", "Відсутній", "Урок ще не відбувся"].includes(text) &&
      !status
    )
      status = text;
  });

  ["mouseleave", "mouseout"].forEach((t) =>
    square.dispatchEvent(new MouseEvent(t, { bubbles: true }))
  );

  return date ? { date, lesson, status } : null;
}

async function findTargetIndex(firstRow) {
  const squares = [...firstRow.querySelectorAll('[aria-describedby]')];
  const todayMs = parseDMY(getTodayDate()).getTime();
  let bestIndex = -1;
  let i = 0;

  while (i < squares.length) {
    const data = await readTooltip(squares[i]);
    if (!data || !data.date) { i++; continue; }

    const diff = todayMs - parseDMY(data.date).getTime();

    if (diff === 0) return i;
    if (diff < 0){
      const nextElement = await readTooltip(squares[i+1]);
      const nextDiff = todayMs - parseDMY(nextElement.date).getTime();
      if (nextDiff < 0){
        break;
      }
    }
    bestIndex = i;

    // Jump forward by estimated weeks, but land 1 square before target
    // so the next iteration can confirm with a single hover
    const weeksAway = Math.floor(diff / (msPerDay * 7));
    i += Math.max(1, weeksAway - 1); // -1 = don't overshoot
  }

  return bestIndex;
}

async function readAtIndex(row, index) {
  const squares = [...row.querySelectorAll("[aria-describedby]")];
  const square = squares[index];
  if (!square) return null;
  return await readTooltip(square);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== "scrapeAttendance") return;

  (async () => {
    const rows = [...document.querySelectorAll("tr.ant-table-row")];
    if (rows.length === 0) {
      sendResponse({
        error: "No student rows found. Make sure you are on the Students tab.",
      });
      return;
    }

    // Step 1: find the right column index from the first student
    const targetIndex = await findTargetIndex(rows[0]);
    if (targetIndex === -1) {
      sendResponse({ error: "Could not find a matching lesson date." });
      return;
    }

    // Step 2: read that same index for every student
    const results = [];
    const absentStudents = [];

    for (const row of rows) {
      const name = getStudentName(row);
      const data = await readAtIndex(row, targetIndex);
      const status = data?.status || "Unknown";
      const lesson = data?.lesson || "";
      const date = data?.date || "";
      console.log(lesson);
      results.push({ student: name, status, lesson, date });
      if (status === "Відсутній") absentStudents.push(name);
    }

    const textD = await sendPrompt(`Напиши коротко, що ми робили з учнями за цією темою: ${results[0].lesson}. Без всяких емоджі та символів, простими 1-2 реченнями.`)
    console.log('result', textD.text);
    
    sendResponse({
      today: getTodayDate(),
      targetIndex,
      results,
      absentStudents,
      textD
    });
  })();

  return true;
});
