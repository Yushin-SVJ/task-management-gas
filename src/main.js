// ↓ ご使用のSlack Bot User OAuth Token (xoxb-...) に適宜書き換えてください
const SLACK_ACCESS_TOKEN = "YOUR_SLACK_BOT_TOKEN"; // GASのスクリプトプロパティまたは直接書き換えて使用
const SPREADSHEET_ID = "1XFduMSLrX9viD8pnWSEHTT-RRhHdy9uxePgytNNCYIU";

// true: 開発モード（初回リマインドをスタンプ押下5分後に設定）
// false: 本番モード（初回リマインドを翌日10:00に設定）
const DEV_MODE = true;

/**
 * 1日2回の通知スケジュール（朝・夕）
 */
function remindPendingTasks() {
  console.log("--- remindPendingTasks 開始 ---");
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheets()[0];
  const data = sheet.getDataRange().getValues();
  console.log(`全データ行数: ${data.length}`);
  if (data.length <= 1) {
    console.log("データがヘッダーのみのため終了します。");
    return;
  }

  const now = new Date();
  const currentHour = now.getHours();

  // 朝（10時台）通知後 → 当日19:00、夜（19時台）通知後 → 翌日10:00
  let nextReminderTimeBase = new Date(now);
  if (currentHour < 15) {
    nextReminderTimeBase.setHours(19, 0, 0, 0); // 当日19:00
  } else {
    nextReminderTimeBase.setDate(nextReminderTimeBase.getDate() + 1);
    nextReminderTimeBase.setHours(10, 0, 0, 0); // 翌日10:00
  }

  const messagesByUser = {};

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const slackId = row[0];
    const messageLink = row[1];
    let reminderTime = row[3];
    const status = row[4];

    if (status === "完了") continue;

    const normalizedLink = normalizeSlackUrl(messageLink);

    // 1. リマインド時刻（D列）が空の場合の初期化
    if (!reminderTime || String(reminderTime).trim() === "") {
      const initTriggerDate = new Date(now);
      if (DEV_MODE) {
        // 開発モード: スタンプ押下から5分後
        initTriggerDate.setMinutes(initTriggerDate.getMinutes() + 5);
        console.log(`行 ${i+1}: [DEV] 初回リマインド時刻を5分後に設定しました (${initTriggerDate})`);
      } else {
        // 本番モード: 翌日10:00
        initTriggerDate.setDate(initTriggerDate.getDate() + 1);
        initTriggerDate.setHours(10, 0, 0, 0);
        console.log(`行 ${i+1}: 初回リマインド時刻を翌日10:00に設定しました (${initTriggerDate})`);
      }
      reminderTime = initTriggerDate;
      sheet.getRange(i + 1, 4).setValue(reminderTime);
      SpreadsheetApp.flush();
    }

    if (reminderTime) {
      const reminderDate = new Date(reminderTime);
      const isDue = now >= reminderDate;
      
      if (isDue) {
        if (!messagesByUser[slackId]) {
          messagesByUser[slackId] = { tasks: [], rowsToUpdate: [] };
        }
        // 通知には正規化されたURLを使用
        messagesByUser[slackId].tasks.push(normalizedLink);
        messagesByUser[slackId].rowsToUpdate.push(i + 1);
      }
    }
  }

  for (const slackId in messagesByUser) {
    if (!slackId) continue;
    
    const userTasks = messagesByUser[slackId].tasks;
    const updateRows = messagesByUser[slackId].rowsToUpdate;

    const blocks = buildSlackBlocks(userTasks, slackId, (currentHour >= 15));

    const url = "https://slack.com/api/chat.postMessage";
    const payload = {
      channel: slackId,
      blocks: blocks,
      text: "🚨 未完了タスクのリマインド"
    };

    const options = {
      method: "post",
      contentType: "application/json",
      headers: { "Authorization": `Bearer ${SLACK_ACCESS_TOKEN}` },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    try {
      console.log(`Slack通知を送信中: ${slackId} へ ${userTasks.length}件`);
      const response = UrlFetchApp.fetch(url, options);
      const resData = JSON.parse(response.getContentText());

      if (resData.ok) {
        updateRows.forEach(rowNum => {
          sheet.getRange(rowNum, 4).setValue(nextReminderTimeBase);
          sheet.getRange(rowNum, 6).setValue("配信成功");
        });
        SpreadsheetApp.flush();
      } else {
        console.error(`Slack通知エラー: ${resData.error}`);
      }
    } catch (e) {
      console.error(`HTTPリクエストエラー: ${e.message}`);
    }
  }
  console.log("--- remindPendingTasks 終了 ---");
}

/**
 * URLを正規化して比較やAPI利用を安定させる
 * 例: https://seven-rich.slack.com/archives/C123/p1234567890123456?thread_ts=...
 * → https://slack.com/archives/C123/p1234567890123456
 */
function normalizeSlackUrl(url) {
  if (!url) return "";
  let clean = url.split("?")[0].split("#")[0];
  const match = clean.match(/archives\/([A-Z0-9]+)\/([a-z]?[0-9]+(\.[0-9]+)?)/i);
  if (match) {
    const channel = match[1];
    const tsPart = match[2];
    // ドメインを統一し、比較を確実に
    return `https://slack.com/archives/${channel}/${tsPart}`;
  }
  return clean;
}

/**
 * リッチメッセージ(Block Kit)を構築する
 */
function buildSlackBlocks(userTasks, slackId, isEvening) {
  const title = isEvening ? "🌙 *【19時】未完タスクの追い込みリマインド*" : "🚨 *【朝】未完了タスクのリマインド*";
  const intro = isEvening ? "本日のやり残しはありませんか？ステータスの更新をお願いします！" : "以下のタスクが現在も進行中となっています。対応状況をご確認ください！";

  let blocks = [
    { type: "section", text: { type: "mrkdwn", text: `<@${slackId}>\n${title}` } },
    { type: "section", text: { type: "mrkdwn", text: intro } },
    { type: "divider" }
  ];

  userTasks.forEach(link => {
    // リンクからチャンネルIDとタイムスタンプを抽出
    const match = link.match(/archives\/([A-Z0-9]+)\/([a-z]?([0-9]+)(\.?[0-9]+)?)/i);
    let previewText = "(プレビューを読み込めませんでした)";
    
    if (match) {
      const channelId = match[1];
      const rawTs = match[2];
      // API用にタイムスタンプ形式を修正 (p123... -> 123... . ...)
      const apiTs = formatTsForApi(rawTs);
      previewText = fetchMessageText(channelId, apiTs) || "(メッセージ本文を取得できませんでした)";
    }

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `> ${previewText}\n<${link}|詳細を確認する>`
      }
    });
  });

  return blocks;
}

/**
 * p1234567890123456 形式の文字列を 1234567890.123456 に変換する
 */
function formatTsForApi(tsPart) {
  if (!tsPart) return "";
  if (tsPart.includes(".")) return tsPart;
  
  let clean = tsPart.replace(/^p/i, "");
  if (clean.length === 16) {
    return clean.substring(0, 10) + "." + clean.substring(10);
  }
  return clean;
}

/**
 * Slack API を使ってメッセージの本文を取得する
 */
function fetchMessageText(channel, ts) {
  const url = `https://slack.com/api/conversations.replies?channel=${channel}&ts=${ts}&limit=1&inclusive=true`;
  const options = {
    headers: { "Authorization": `Bearer ${SLACK_ACCESS_TOKEN}` },
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const data = JSON.parse(response.getContentText());
    if (data.ok && data.messages && data.messages.length > 0) {
      let text = data.messages[0].text;
      if (text.length > 100) text = text.substring(0, 100) + "...";
      return text;
    } else {
      console.warn(`Slack APIエラー: ${data.error} (channel: ${channel}, ts: ${ts})`);
    }
  } catch (err) {
    console.warn(`メッセージ取得失敗: ${err.message}`);
  }
  return null;
}

/**
 * 重複してしまった行をクリーンアップするユーティリティ
 * (既存の重複を整理したい場合に手動で1回実行してください)
 */
function cleanupDuplicateTasks() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheets()[0];
  const data = sheet.getDataRange().getValues();
  const seenUrls = {};
  const rowsToDelete = [];

  // 下から上にループして削除
  for (let i = data.length - 1; i >= 1; i--) {
    const url = normalizeSlackUrl(data[i][1]);
    if (!url) continue;

    if (seenUrls[url]) {
      // すでに存在するのでこの行（古い方）は削除対象
      rowsToDelete.push(i + 1);
    } else {
      seenUrls[url] = true;
    }
  }

  rowsToDelete.forEach(rowNum => {
    sheet.deleteRow(rowNum);
  });
  console.log(`${rowsToDelete.length} 件の重複行を削除しました。`);
}
