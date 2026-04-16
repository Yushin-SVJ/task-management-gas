/**
 * SlackからのEvent Subscriptionsを受け取るためのエンドポイント
 */
function doPost(e) {
  const json = JSON.parse(e.postData.contents);

  if (json.type === "url_verification") {
    return ContentService.createTextOutput(json.challenge);
  }

  if (json.type === "event_callback") {
    const eventId = json.event_id;
    const cache = CacheService.getScriptCache();
    // すでに処理中のイベントID（Slackからのリトライ）なら無視する
    if (eventId && cache.get(eventId)) {
      console.log(`[重複排除] リトライをスキップ: ${eventId}`);
      return ContentService.createTextOutput("ok");
    }
    // 10分間キャッシュに保存
    if (eventId) {
      cache.put(eventId, "true", 600);
    }

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
        sheet.getRange(i + 1, 7).setValue("完了");
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
    const reminderTime = new Date(now);
    if (DEV_MODE) {
      // 開発モード: スタンプ押下から1分後
      reminderTime.setMinutes(reminderTime.getMinutes() + 1);
    } else {
      // 本番モード: 翌日10:00
      reminderTime.setDate(reminderTime.getDate() + 1);
      reminderTime.setHours(10, 0, 0, 0);
    }

    const userName = fetchSlackUserName(slackId); // 新しく追加

    if (foundRowIndex !== -1) {
      // 重複あり: 既存行を更新
      console.log(`既存URLを更新: 行 ${foundRowIndex}`);
      sheet.getRange(foundRowIndex, 1).setValue(slackId);       // A: 担当者SlackID
      sheet.getRange(foundRowIndex, 2).setValue(targetUrl);     // B: メッセージリンク
      sheet.getRange(foundRowIndex, 3).setValue(channel);       // C: 依頼チャンネル
      sheet.getRange(foundRowIndex, 4).setValue(userName);      // D: タスク化した人
      sheet.getRange(foundRowIndex, 5).setValue(now);           // E: 登録日時
      sheet.getRange(foundRowIndex, 6).setValue(reminderTime);  // F: リマインド日時
      sheet.getRange(foundRowIndex, 7).setValue("進行中");       // G: ステータス
      sheet.getRange(foundRowIndex, 8).clearContent();          // H: 通知結果
    } else {
      // 重複なし: 新規追加
      console.log(`新規URLを追加: ${targetUrl}`);
      sheet.appendRow([
        slackId,         // A: 担当者SlackID
        targetUrl,       // B: メッセージリンク
        channel,         // C: 依頼チャンネル
        userName,        // D: タスク化した人
        now,             // E: 登録日時
        reminderTime,    // F: リマインド日時
        "進行中",         // G: ステータス
        ""               // H: 通知結果
      ]);
    }
    SpreadsheetApp.flush();

  } catch (err) {
    console.error(`Webhook処理エラー: ${err.message}`);
  } finally {
    lock.releaseLock();
  }
}
