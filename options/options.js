document.addEventListener('DOMContentLoaded', async () => {
  const maxItemsInput = document.getElementById('maxItems');
  const saveBtn = document.getElementById('saveBtn');
  const saveMessageEl = document.getElementById('saveMessage');
  const deleteAllBtn = document.getElementById('deleteAllBtn');
  const versionEl = document.getElementById('version');
  const statusMessageEl = document.getElementById('statusMessage');

  function showStatus(message, type = 'success') {
    statusMessageEl.textContent = message;
    statusMessageEl.className = `status-message ${type}`;
    statusMessageEl.hidden = false;
  }

  function clearStatus() {
    statusMessageEl.hidden = true;
    statusMessageEl.textContent = '';
    statusMessageEl.className = 'status-message';
  }

  async function loadSettings() {
    try {
      const settings = await window.TweetSaverStorage.getSettings();
      maxItemsInput.value = settings.maxItems;
      clearStatus();
    } catch (error) {
      showStatus('設定の読み込みに失敗しました。', 'error');
    }
  }

  async function saveSettings() {
    const maxItems = parseInt(maxItemsInput.value, 10);

    if (Number.isNaN(maxItems) || maxItems < 20 || maxItems > 2000) {
      window.alert('最大保存件数は 20 から 2000 の間で指定してください');
      maxItemsInput.focus();
      return;
    }

    try {
      await window.TweetSaverStorage.updateSettings({ maxItems });
      saveMessageEl.textContent = '保存しました';
      showStatus('設定を更新しました。', 'success');
      setTimeout(() => {
        saveMessageEl.textContent = '';
      }, 2200);
      notifyPopupRefresh();
    } catch (error) {
      showStatus('保存中にエラーが発生しました。', 'error');
      window.alert('保存中にエラーが発生しました');
    }
  }

  async function deleteAll() {
    if (!window.confirm('すべての保存済みポストを削除します。よろしいですか？')) {
      return;
    }

    try {
      const deleted = await window.TweetSaverStorage.deleteAllTweets();
      if (deleted) {
        showStatus('保存済みポストをすべて削除しました。', 'success');
      } else {
        showStatus('削除対象の保存データはありませんでした。', 'success');
      }
      notifyPopupRefresh();
    } catch (error) {
      showStatus('削除中にエラーが発生しました。', 'error');
      window.alert('削除中にエラーが発生しました');
    }
  }

  function notifyPopupRefresh() {
    chrome.runtime.sendMessage({ action: 'refreshPopup' });
  }

  saveBtn.addEventListener('click', saveSettings);
  deleteAllBtn.addEventListener('click', deleteAll);

  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'refreshPopup') {
      loadSettings();
    }
  });

  const manifest = chrome.runtime.getManifest();
  versionEl.textContent = manifest.version;

  await loadSettings();
});
