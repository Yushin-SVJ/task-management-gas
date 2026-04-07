/**
 * SlackからのEvent Subscriptionsを受け取るためのエンドポイント
 */
function doPost(e) {
  const json = JSON.parse(e.postData.contents);

  if (json.type === "url_verification") {
    return ContentService.createTextOutput(json.challenge);
  }

  if (json.type === "event_callback") {
    const event = json.event;

    if (event.type === "reaction_added" && event.reaction === "かくにん") {
      handleReactionAdded(event);
    }

    if (event.type === "reaction_added" && event.reaction === "対応済み") {
      handleCompleted(event);
    }
  }

  return ContentService.createTextOutput("ok");
}

/**
 * :対応済み: リアクション検知時にE列を「完了」に更新
 */
function handleCompleted(event) {
  const channel = event.item.channel;
  const ts = event.item.ts;
  const rawUrl = `https://slack.com/archives/${channel}/${ts}`;
  const targetUrl = normalizeSlackUrl(rawUrl);

  console.log(`完了リアクション検知: URL=${targetUrl}`);

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheets()[0];
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (normalizeSlackUrl(data[i][1]) === targetUrl) {
        sheet.getRange(i + 1, 5).setValue("完了");
        SpreadsheetApp.flush();
        console.log(`行 ${i + 1} を完了に更新しました`);
        break;
      }
    }
  } catch (err) {
    console.error(`完了処理エラー: ${err.message}`);
  } finally {
    lock.releaseLock();
  }
}

/**
 * リアクション検知時のUPSERTロジック (正規化による重複排除)
 */
function handleReactionAdded(event) {
  const slackId = event.user;
  const channel = event.item.channel;
  const ts = event.item.ts;
  
  // 元のURLを構築し、即座に正規化 (クエリパラメータの削除など)
  const rawUrl = `https://slack.com/archives/${channel}/${ts}`;
  const targetUrl = normalizeSlackUrl(rawUrl);
  
  console.log(`リアクション検知 (正規化済): URL=${targetUrl}`);

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheets()[0];
    const data = sheet.getDataRange().getValues();

    let foundRowIndex = -1;
    // 重複チェック: B列（メッセージリンク）を正規化して比較
    for (let i = 1; i < data.length; i++) {
        if (normalizeSlackUrl(data[i][1]) === targetUrl) {
            foundRowIndex = i + 1;
            break;
        }
    }

    const now = new Date();
    const reminderTime = new Date(now.getTime() + 5 * 60 * 1000);

    if (foundRowIndex !== -1) {
      // 重複あり: 既存行を更新
      console.log(`既存URLを更新: 行 ${foundRowIndex}`);
      sheet.getRange(foundRowIndex, 1).setValue(slackId);
      sheet.getRange(foundRowIndex, 2).setValue(targetUrl);     // B列も正規化済みURLに上書き
      sheet.getRange(foundRowIndex, 3).setValue(now);
      sheet.getRange(foundRowIndex, 4).setValue(reminderTime);
      sheet.getRange(foundRowIndex, 5).setValue("進行中");
      sheet.getRange(foundRowIndex, 6).clearContent();
    } else {
      // 重複なし: 新規追加
      console.log(`新規URLを追加: ${targetUrl}`);
      sheet.appendRow([
        slackId,
        targetUrl,
        now,
        reminderTime,
        "進行中",
        ""
      ]);
    }
    SpreadsheetApp.flush();

  } catch (err) {
    console.error(`Webhook処理エラー: ${err.message}`);
  } finally {
    lock.releaseLock();
  }
}
