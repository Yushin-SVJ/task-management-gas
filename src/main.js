// ↓ ご使用のSlack Bot User OAuth Token (xoxb-...) に適宜書き換えてください
const SLACK_ACCESS_TOKEN = "xoxb-YOUR-BOT-TOKEN";

/**
 * 時間主導型トリガーで実行するメインの関数
 * 毎朝9時台（9:00〜10:00）などに設定することを推奨
 */
function remindPendingTasks() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return; // ヘッダーのみの場合は処理終了

  const now = new Date();
  const messagesByUser = {}; // 担当者別に送信するタスクをまとめる

  // 1行目はヘッダーなので、2行目(index: 1)からループ
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const slackId = row[0];        // A列: 担当者のSlackID
    const messageLink = row[1];    // B列: メッセージリンク
    const reactionTime = row[2];   // C列: リアクションが押された時間
    let reminderTime = row[3];     // D列: リマインド時刻
    const status = row[4];         // E列: 進行状況
    const remindedStatus = row[5]; // F列: 進行状況(リマインド状況)

    // ステータスが「完了」の場合はリマインド不要
    if (status === "完了") {
      continue;
    }

    // 1. リマインド時刻（D列）が空の場合の初期化（C列+24時間）
    if (!reminderTime && reactionTime) {
      const initTriggerDate = new Date(reactionTime);
      initTriggerDate.setHours(initTriggerDate.getHours() + 24);
      reminderTime = initTriggerDate;
      sheet.getRange(i + 1, 4).setValue(reminderTime); // D列にセット
    }

    // 2. リマインド対象か判定
    // D列の時刻が存在し、現在時刻がそれを超過している場合
    if (reminderTime && now >= reminderTime) {
      if (!messagesByUser[slackId]) {
        messagesByUser[slackId] = {
          tasks: [],
          rowsToUpdate: []
        };
      }
      messagesByUser[slackId].tasks.push(messageLink);
      messagesByUser[slackId].rowsToUpdate.push(i + 1); // 該当行番号 (1-indexed)
    }
  }

  // 3. 次回リマインド時刻の定義（翌日の朝8時）
  // ※スクリプト実行時が前日だったとしても現在日付基準で翌日とする
  const nextDay8AM = new Date(now);
  nextDay8AM.setDate(nextDay8AM.getDate() + 1);
  nextDay8AM.setHours(8, 0, 0, 0);

  // 4. 各担当者(SlackID)宛にDMを送信し、送信成功したらシートを上書きする
  for (const slackId in messagesByUser) {
    if (!slackId) continue; // IDが空の場合はスキップ
    
    const userTasks = messagesByUser[slackId].tasks;
    const updateRows = messagesByUser[slackId].rowsToUpdate;

    // Slackへの通知メッセージの組み立て
    const textBlocks = userTasks.map(link => `・ ${link}`).join('\n');
    const messageText = `🚨 *未完了タスクのリマインド* 🚨\n\n以下のタスクが現在も進行中となっています。\n対応状況のご確認をお願いします！\n\n<@${slackId}>\n${textBlocks}`;

    // Slackの chat.postMessage は、channel に userID を指定するとDMとして送信されます
    const url = "https://slack.com/api/chat.postMessage";
    const payload = {
      channel: slackId,
      text: messageText,
    };

    const options = {
      method: "post",
      contentType: "application/json",
      headers: {
        "Authorization": `Bearer ${SLACK_ACCESS_TOKEN}`
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    try {
      const response = UrlFetchApp.fetch(url, options);
      const resData = JSON.parse(response.getContentText());

      // Slack通知が成功した場合のみ、D列とF列を更新する
      if (resData.ok) {
        updateRows.forEach(rowNum => {
          sheet.getRange(rowNum, 4).setValue(nextDay8AM); // D列を翌日8:00に変更
          sheet.getRange(rowNum, 6).setValue("配信済");    // F列を「配信済」に変更
        });
      } else {
        console.error(`Slack通知エラー (ユーザーID: ${slackId}): ${resData.error}`);
      }
    } catch (e) {
      console.error(`HTTPリクエストエラー (ユーザーID: ${slackId}): ${e.message}`);
    }
  }
}
