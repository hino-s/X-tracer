document.addEventListener('DOMContentLoaded', async () => {
  const tweetListEl = document.getElementById('tweetList');
  const deleteAllBtn = document.getElementById('deleteAll');
  const maxItemsInput = document.getElementById('maxItems');
  const saveSettingsBtn = document.getElementById('saveSettings');
  const saveMessageEl = document.getElementById('saveMessage');
  const tweetCountEl = document.getElementById('tweetCount');
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearch');
  const listStatusEl = document.getElementById('listStatus');
  const openOptionsBtn = document.getElementById('openOptions');

  let allTweets = [];
  let filteredTweets = [];
  let currentQuery = '';

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }

  function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString('ja-JP') + ' ' + date.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getUsernameLabel(tweet) {
    if (tweet.username) {
      return '@' + tweet.username;
    }

    try {
      const match = tweet.url.match(/https?:\/\/(?:twitter|x)\.com\/([^\/]+)\/status\/\d+/i);
      if (match) {
        return '@' + match[1];
      }
    } catch (error) {
      // ignore
    }

    return '@unknown';
  }

  function renderTweetList(tweets) {
    tweetCountEl.textContent = `${tweets.length}件`;

    if (currentQuery) {
      listStatusEl.textContent = `「${currentQuery}」の検索結果`;
    } else {
      listStatusEl.textContent = '新しい順';
    }

    if (tweets.length === 0) {
      tweetListEl.innerHTML = `<div class="empty-message">${currentQuery ? '検索結果はありません' : 'まだ保存されたポストはありません'}</div>`;
      return;
    }

    const html = tweets.map((tweet) => {
      const preview = tweet.preview ? escapeHtml(tweet.preview) : '本文プレビューはまだ取得されていません';
      return `
        <article class="tweet-item" data-tweet-id="${escapeHtml(tweet.tweetId)}">
          <div class="tweet-item-header">
            <span class="tweet-user">${escapeHtml(getUsernameLabel(tweet))}</span>
            <span class="tweet-time">${escapeHtml(formatDate(tweet.seenAt))}</span>
          </div>
          <p class="tweet-preview">${preview}</p>
          <a href="${escapeHtml(tweet.url)}" target="_blank" rel="noopener noreferrer" class="tweet-url">${escapeHtml(tweet.url)}</a>
          <div class="tweet-actions">
            <button class="open-btn" data-action="open" type="button">開く</button>
            <button class="delete-btn" data-action="delete" type="button">削除</button>
          </div>
        </article>
      `;
    }).join('');

    tweetListEl.innerHTML = html;
  }

  function applyFilter(query) {
    currentQuery = query.trim();
    const normalizedQuery = currentQuery.toLowerCase();

    clearSearchBtn.style.display = currentQuery ? 'block' : 'none';

    if (!normalizedQuery) {
      filteredTweets = [...allTweets];
      renderTweetList(filteredTweets);
      return;
    }

    filteredTweets = allTweets.filter((tweet) => {
      return [tweet.url, tweet.username || '', tweet.preview || '']
        .some((value) => value.toLowerCase().includes(normalizedQuery));
    });

    renderTweetList(filteredTweets);
  }

  async function refreshTweets() {
    try {
      const [tweets, settings] = await Promise.all([
        window.TweetSaverStorage.getAllTweets(),
        window.TweetSaverStorage.getSettings()
      ]);

      allTweets = [...tweets].sort((a, b) => b.seenAt - a.seenAt);
      maxItemsInput.value = settings.maxItems;
      applyFilter(searchInput.value || '');
    } catch (error) {
      tweetCountEl.textContent = '0件';
      listStatusEl.textContent = '読込失敗';
      tweetListEl.innerHTML = '<div class="empty-message">読み込み中にエラーが発生しました</div>';
    }
  }

  async function deleteTweet(tweetId) {
    try {
      const deleted = await window.TweetSaverStorage.deleteTweet(tweetId);
      if (deleted) {
        await refreshTweets();
      }
    } catch (error) {
      window.alert('削除中にエラーが発生しました');
    }
  }

  async function openTweet(tweetId) {
    try {
      const tweet = await window.TweetSaverStorage.getTweetByTweetId(tweetId);
      if (tweet?.url) {
        chrome.tabs.create({ url: tweet.url });
      }
    } catch (error) {
      window.alert('ポストを開けませんでした');
    }
  }

  async function saveSettings() {
    const maxItems = parseInt(maxItemsInput.value, 10);
    if (Number.isNaN(maxItems) || maxItems < 20 || maxItems > 2000) {
      window.alert('最大保存件数は 20 から 2000 の間で指定してください');
      const settings = await window.TweetSaverStorage.getSettings();
      maxItemsInput.value = settings.maxItems;
      return;
    }

    try {
      await window.TweetSaverStorage.updateSettings({ maxItems });
      saveMessageEl.textContent = '保存しました';
      setTimeout(() => {
        saveMessageEl.textContent = '';
      }, 2200);
      await refreshTweets();
    } catch (error) {
      window.alert('保存中にエラーが発生しました');
    }
  }

  async function deleteAllTweets() {
    if (!window.confirm('すべての保存済みポストを削除します。よろしいですか？')) {
      return;
    }

    try {
      const deleted = await window.TweetSaverStorage.deleteAllTweets();
      if (deleted) {
        await refreshTweets();
      }
    } catch (error) {
      window.alert('全削除中にエラーが発生しました');
    }
  }

  function openOptionsPage() {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
      return;
    }
    chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') });
  }

  tweetListEl.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;

    const tweetItem = button.closest('.tweet-item');
    if (!tweetItem) return;

    const tweetId = tweetItem.dataset.tweetId;
    if (!tweetId) return;

    if (button.dataset.action === 'open') {
      openTweet(tweetId);
    }

    if (button.dataset.action === 'delete') {
      deleteTweet(tweetId);
    }
  });

  saveSettingsBtn.addEventListener('click', saveSettings);
  deleteAllBtn.addEventListener('click', deleteAllTweets);
  searchInput.addEventListener('input', (event) => applyFilter(event.target.value));
  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    applyFilter('');
  });
  openOptionsBtn.addEventListener('click', openOptionsPage);

  window.TweetSaverStorage.addStorageChangeListener(refreshTweets);

  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'refreshPopup') {
      refreshTweets();
    }
  });

  await refreshTweets();
});
