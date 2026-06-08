// popup.js - ポップアップ画面用スクリプト

document.addEventListener('DOMContentLoaded', async function() {
  const tweetListEl = document.getElementById('tweetList');
  const deleteAllBtn = document.getElementById('deleteAll');
  const maxItemsInput = document.getElementById('maxItems');
  const saveSettingsBtn = document.getElementById('saveSettings');
  const saveMessageEl = document.getElementById('saveMessage');
  const supportBtn = document.getElementById('supportBtn');
  const tweetCountEl = document.getElementById('tweetCount');
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearch');

  // 現在表示中のツイートリスト
  let currentTweets = [];
  let isSearchMode = false;

  // ツイート一覧を描画
  async function renderTweets() {
    try {
      const tweets = await window.TweetSaverStorage.getAllTweets();
      const settings = await window.TweetSaverStorage.getSettings();

      // 最大件数の入力値を更新
      maxItemsInput.value = settings.maxItems;

      // 検索モードか通常モードかで表示データを切り替え
      const displayTweets = isSearchMode ? tweets : tweets;
      currentTweets = displayTweets;

      // 件数表示
      tweetCountEl.textContent = currentTweets.length + '件';

      if (currentTweets.length === 0) {
        tweetListEl.innerHTML = '<div class="empty-message">まだ保存されたツイートはありません</div>';
        return;
      }

      // 新しい順にソート（既に新しい順だが念のため）
      const sortedTweets = [...currentTweets].sort((a, b) => b.seenAt - a.seenAt);

      // username が保存されていないツイートのために補完
      for (const tweet of sortedTweets) {
        if (!tweet.username) {
          try {
            const urlMatch = tweet.url.match(/https?:\/\/([^\/]+)\/status\/\d+/);
            if (urlMatch) {
              tweet.username = urlMatch[1];
            }
          } catch (e) {
            // URL 解析エラーは無視
          }
        }
      }

      // HTML を生成
      let html = '';
      for (const tweet of sortedTweets) {
        const time = new Date(tweet.seenAt);
        const timeString = time.toLocaleDateString() + ' ' + time.toLocaleTimeString();
        const preview = tweet.preview ? escapeHtml(tweet.preview) : '';

        html += `
          <div class="tweet-item" data-tweet-id="${escapeHtml(tweet.tweetId)}">
            <a href="${escapeHtml(tweet.url)}" target="_blank" rel="noopener noreferrer" class="tweet-url">
              ${escapeHtml(tweet.url)}
            </a>
            ${preview ? `<div class="tweet-preview">${preview}...</div>` : ''}
            <div class="tweet-meta">
              <span class="tweet-time">${timeString}</span>
              <div class="tweet-actions">
                <button class="open-btn" data-action="open">開く</button>
                <button class="delete-btn" data-action="delete">削除</button>
              </div>
            </div>
          </div>
        `;
      }

      tweetListEl.innerHTML = html;

      // イベントリスナーを追加
      tweetListEl.addEventListener('click', handleTweetItemClick);

    } catch (error) {
      tweetListEl.innerHTML = '<div class="empty-message" style="color: #dc3545;">読み込み中にエラーが発生しました</div>';
    }
  }

  // 検索機能
  function searchTweets(query) {
    if (!query || query.trim() === '') {
      isSearchMode = false;
      renderTweets();
      clearSearchBtn.style.display = 'none';
      return;
    }

    isSearchMode = true;
    const searchTerm = query.toLowerCase().trim();

    // URL、ユーザー名、プレビューのいずれかに一致するものをフィルタリング
    currentTweets = window.TweetSaverStorage.getAllTweets().then(tweets => {
      return tweets.filter(tweet => {
        const urlMatch = tweet.url.toLowerCase().includes(searchTerm);
        const usernameMatch = (tweet.username || '').toLowerCase().includes(searchTerm);
        const previewMatch = (tweet.preview || '').toLowerCase().includes(searchTerm);
        return urlMatch || usernameMatch || previewMatch;
      });
    });

    // フィルタリング結果を描画
    currentTweets.then(filtered => {
      if (filtered.length === 0) {
        tweetListEl.innerHTML = '<div class="empty-message">検索結果はありません</div>';
        return;
      }

      const sortedTweets = [...filtered].sort((a, b) => b.seenAt - a.seenAt);

      let html = '';
      for (const tweet of sortedTweets) {
        const time = new Date(tweet.seenAt);
        const timeString = time.toLocaleDateString() + ' ' + time.toLocaleTimeString();
        const preview = tweet.preview ? escapeHtml(tweet.preview) : '';

        html += `
          <div class="tweet-item" data-tweet-id="${escapeHtml(tweet.tweetId)}">
            <a href="${escapeHtml(tweet.url)}" target="_blank" rel="noopener noreferrer" class="tweet-url">
              ${escapeHtml(tweet.url)}
            </a>
            ${preview ? `<div class="tweet-preview">${preview}...</div>` : ''}
            <div class="tweet-meta">
              <span class="tweet-time">${timeString}</span>
              <div class="tweet-actions">
                <button class="open-btn" data-action="open">開く</button>
                <button class="delete-btn" data-action="delete">削除</button>
              </div>
            </div>
          </div>
        `;
      }

      tweetListEl.innerHTML = html;
      tweetListEl.addEventListener('click', handleTweetItemClick);
      clearSearchBtn.style.display = 'block';
    });
  }

  // 検索をクリア
  function clearSearch() {
    searchInput.value = '';
    isSearchMode = false;
    clearSearchBtn.style.display = 'none';
    renderTweets();
  }

  // イベントハンドラ
  function handleTweetItemClick(e) {
    const button = e.target.closest('button');

    if (!button) return;

    const action = button.dataset.action;
    const tweetItem = button.closest('.tweet-item');
    const tweetId = tweetItem.dataset.tweetId;

    if (action === 'delete') {
      deleteTweet(tweetId, tweetItem);
    } else if (action === 'open') {
      openTweet(tweetId);
    }
  }

  // ツイートを削除
  async function deleteTweet(tweetId, element) {
    try {
      const result = await window.TweetSaverStorage.deleteTweet(tweetId);
      if (result) {
        // アニメーションで削除
        element.style.opacity = '0';
        element.style.transform = 'translateX(-20px)';
        setTimeout(() => {
          element.remove();
          // 空になったら空メッセージを表示
          if (document.querySelectorAll('.tweet-item').length === 0) {
            renderTweets();
          }
        }, 200);
      }
    } catch (error) {
      alert('削除中にエラーが発生しました');
    }
  }

  // ツイートを開く
  async function openTweet(tweetId) {
    try {
      const tweet = await window.TweetSaverStorage.getTweetByTweetId(tweetId);
      if (tweet && tweet.url) {
        chrome.tabs.create({ url: tweet.url });
      }
    } catch (error) {
      alert('ツイートを開けませんでした');
    }
  }

  // 設定を保存
  async function saveSettings() {
    const maxItems = parseInt(maxItemsInput.value, 10);

    // 範囲チェック
    if (isNaN(maxItems) || maxItems < 20 || maxItems > 2000) {
      alert('最大保存件数は 20 から 2000 の間で指定してください');
      maxItemsInput.value = await (await window.TweetSaverStorage.getSettings()).maxItems;
      return;
    }

    try {
      await window.TweetSaverStorage.updateSettings({ maxItems: maxItems });

      // 保存メッセージを表示
      saveMessageEl.textContent = '保存しました';
      setTimeout(() => {
        saveMessageEl.textContent = '';
      }, 2000);

      // リストを再描画
      renderTweets();
    } catch (error) {
      alert('保存中にエラーが発生しました');
    }
  }

  // すべて削除
  async function deleteAllTweets() {
    if (!confirm('すべての保存済みツイートを削除します。よろしいですか？')) {
      return;
    }

    try {
      const result = await window.TweetSaverStorage.deleteAllTweets();
      if (result) {
        renderTweets();
      }
    } catch (error) {
      alert('全削除中にエラーが発生しました');
    }
  }

  // HTML エスケープ
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // イベントリスナーの設定
  saveSettingsBtn.addEventListener('click', saveSettings);
  deleteAllBtn.addEventListener('click', deleteAllTweets);
  searchInput.addEventListener('input', (e) => {
    searchTweets(e.target.value);
  });
  clearSearchBtn.addEventListener('click', clearSearch);

  // ストレージ変更を監視
  window.TweetSaverStorage.addStorageChangeListener(renderTweets);

  // 初回描画
  renderTweets();

  // 補足: ポップアップが開かれたときに自動更新
  const refreshInterval = setInterval(async () => {
    // ポップアップが閉じられている場合は停止
    if (!document.hasFocus() && document.hidden) {
      clearInterval(refreshInterval);
      return;
    }
    renderTweets();
  }, 5000);

  // オプション画面からの更新メッセージを受信
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'refreshPopup') {
      renderTweets();
    }
  });
});
