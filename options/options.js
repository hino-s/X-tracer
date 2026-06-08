// options.js - オプション画面用スクリプト

document.addEventListener('DOMContentLoaded', async function() {
  const maxItemsInput = document.getElementById('maxItems');
  const saveBtn = document.getElementById('saveBtn');
  const saveMessageEl = document.getElementById('saveMessage');
  const deleteAllBtn = document.getElementById('deleteAllBtn');
  const versionEl = document.getElementById('version');
  const supportBtn = document.querySelector('.support-btn');

  // 設定を読み込んで表示
  async function loadSettings() {
    try {
      const settings = await window.TweetSaverStorage.getSettings();
      maxItemsInput.value = settings.maxItems;
    } catch (error) {
      console.error('[Options] 設定読み込みエラー:', error);
    }
  }

  // 設定を保存
  async function saveSettings() {
    const maxItems = parseInt(maxItemsInput.value, 10);

    // 範囲チェック
    if (isNaN(maxItems) || maxItems < 20 || maxItems > 2000) {
      alert('最大保存件数は 20 から 2000 の間で指定してください');
      maxItemsInput.focus();
      return;
    }

    try {
      await window.TweetSaverStorage.updateSettings({ maxItems: maxItems });

      // 保存メッセージを表示
      saveMessageEl.textContent = '保存しました';
      saveMessageEl.className = 'save-message success';
      setTimeout(() => {
        saveMessageEl.textContent = '';
        saveMessageEl.className = 'save-message';
      }, 2000);

      // オプション画面が開いている場合、ポップアップも更新
      updateAllPopups();
    } catch (error) {
      console.error('[Options] 保存エラー:', error);
      alert('保存中にエラーが発生しました');
    }
  }

  // 全削除
  async function deleteAll() {
    if (!confirm('すべての保存済みツイートを削除します。よろしいですか？')) {
      return;
    }

    try {
      const result = await window.TweetSaverStorage.deleteAllTweets();
      if (result) {
        alert('すべてのツイートを削除しました');
        updateAllPopups();
      }
    } catch (error) {
      console.error('[Options] 全削除エラー:', error);
      alert('削除中にエラーが発生しました');
    }
  }

  // すべてのポップアップを更新
  function updateAllPopups() {
    // ポップアップ画面を再読み込みする
    chrome.runtime.sendMessage({ action: 'refreshPopup' });
  }

  // イベントリスナーの設定
  saveBtn.addEventListener('click', saveSettings);
  deleteAllBtn.addEventListener('click', deleteAll);
  supportBtn.addEventListener('click', function() {
    // ポップアップは自動で閉じる
  });

  // メッセージリスナー
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'refreshPopup') {
      loadSettings();
    }
  });

  // 初期化
  loadSettings();

  // バージョンを表示
  const manifest = chrome.runtime.getManifest();
  versionEl.textContent = manifest.version;
});
