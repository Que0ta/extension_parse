// popup.js

const MONTHS_UA = [
  'січня','лютого','березня','квітня','травня','червня',
  'липня','серпня','вересня','жовтня','листопада','грудня'
];

function formatDateUA(ddmmyyyy) {
  // "02.04.2026" -> "2 квітня"
  const [dd, mm] = ddmmyyyy.split('.').map(Number);
  let dattt = null;
  //   return `${dd} ${MONTHS_UA[mm - 1]}`;
  if (mm < 10 && mm > 0){
    dattt = `0${mm}`
  } else{
    dattt = mm;
  }
  return `${dd}.${dattt}`;
}

function buildMessage({ lessonDate, lessonName, absentStudents }, textData) {
  // {0} absence line
  let absence = '';
  if (absentStudents.length === 1) {
    absence = `На уроці був відсутній: ${absentStudents[0]}`;
  } else if (absentStudents.length >= 2) {
    absence = `На уроці були відсутні: ${absentStudents.join(', ')}`;
} else{
    absence = `На уроці були всі присутні💯`;
  }

  // {1} date day & month
  const dateStr = formatDateUA(lessonDate);

  // {2} lesson name (strip leading number like "5. ")
  const lessonClean = lessonName.replace(/^\d+\.\s*/, '');

  // {3} GEN placeholder
  const gen = textData;
  console.log('func test', gen);
  // {4} homework
  const homework = 'Повторити пройдений матеріал';

  return `Доброго дня, Шановні батьки!\n\n${absence}\n\n💡${dateStr} була пройдена тема: ${lessonClean}\n\n${gen}\n\n📕ДОМАШНЯ ПРАКТИКА:\n1. ${homework}\n\nВсім вдалого тижня!\nЗ повагою, викладач ІТ школи Logika`;
}

document.getElementById("scrape").addEventListener("click", () => {
  const output = document.getElementById("output");
  output.value = "Скануємо...";

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) { output.value = "No active tab."; return; }
    const tabId = tabs[0].id;

    chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }, () => {
      if (chrome.runtime.lastError) {
        output.value = "Inject error: " + chrome.runtime.lastError.message;
        return;
      }

      chrome.tabs.sendMessage(tabId, { action: "scrapeAttendance" }, (response) => {
        if (chrome.runtime.lastError) {
          output.value = "Error: " + chrome.runtime.lastError.message;
          return;
        }

        if (!response) { output.value = "No response."; return; }
        if (response.error) { output.value = response.error; return; }

        const { results, absentStudents, textD } = response;
        console.log("Check=>",textD);
        if (!results || results.length === 0) {
          output.value = "Немає інформації.";
          return;
        }

        const lessonDate = results.find(r => r.date)?.date || '';
        const lessonName = results.find(r => r.lesson)?.lesson || '';

        if (textD){
          // textD -- параметр готової відповіді переданий у buildMessage
          output.value = buildMessage({ lessonDate, lessonName, absentStudents }, textD.resp);
          document.getElementById('copy').disabled = false;
        }
      });
    });
  });
});


document.getElementById('copy').addEventListener('click', () => {
  const output = document.getElementById('output');
  navigator.clipboard.writeText(output.value).then(() => {
    const toast = document.getElementById('toast');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1800);
  });
});