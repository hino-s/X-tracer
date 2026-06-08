// storage.js - データ保存・取得・設定管理用モジュール

(function() {
  'use strict';

  // 初期化されたかどうかのフラグ
  let initialized = false;
  let storageData = null;

  // 設定のデフォルト値
  const DEFAULT_SETTINGS = {
    maxItems: 200
  };

  // ストレージからデータを読み込む
  function loadStorageData() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['tweets', 'settings'], (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        storageData = {
          tweets: result.tweets || [],
          settings: {
            ...DEFAULT_SETTINGS,
            ...result.settings
          }
        };
        initialized = true;
        resolve(storageData);
      });
    });
  }

  // ストレージにデータを保存する
  function saveStorageData(data) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve();
      });
    });
  }

  // 初回読み込み（lazy load）
  async function ensureInitialized() {
    if (!initialized) {
      await loadStorageData();
    }
    return storageData;
  }

  // ツイートを保存（重複チェックあり）
  async function saveTweet(url, tweetId, username, preview) {
    const data = await ensureInitialized();

    // 既に存在するかチェック
    const exists = data.tweets.some(t => t.tweetId === tweetId);
    if (exists) {
      return false;
    }

    const newTweet = {
      tweetId: tweetId,
      url: url,
      username: username,
      preview: preview || '',
      seenAt: Date.now()
    };

    data.tweets.unshift(newTweet); // 新しい順に並べるために先頭に追加

    // 最大件数を超えていたら古いものから削除
    const maxItems = data.settings.maxItems;
    if (data.tweets.length > maxItems) {
      data.tweets = data.tweets.slice(0, maxItems);
    }

    await saveStorageData({ tweets: data.tweets, settings: data.settings });
    return true;
  }

  // 全ツイートを取得
  async function getAllTweets() {
    const data = await ensureInitialized();
    return data.tweets;
  }

  // tweetIdで検索
  async function getTweetByTweetId(tweetId) {
    const data = await ensureInitialized();
    return data.tweets.find(t => t.tweetId === tweetId);
  }

  // ツイートを削除（1件）
  async function deleteTweet(tweetId) {
    const data = await ensureInitialized();
    const beforeLength = data.tweets.length;
    data.tweets = data.tweets.filter(t => t.tweetId !== tweetId);

    if (data.tweets.length !== beforeLength) {
      await saveStorageData({ tweets: data.tweets, settings: data.settings });
      return true;
    }
    return false;
  }

  // 全ツイートを削除
  async function deleteAllTweets() {
    const data = await ensureInitialized();
    if (data.tweets.length === 0) {
      return false;
    }
    data.tweets = [];
    await saveStorageData({ tweets: data.tweets, settings: data.settings });
    return true;
  }

  // 設定を取得
  async function getSettings() {
    const data = await ensureInitialized();
    return data.settings;
  }

  // 設定を更新
  async function updateSettings(newSettings) {
    const data = await ensureInitialized();
    data.settings = { ...data.settings, ...newSettings };
    await saveStorageData({ tweets: data.tweets, settings: data.settings });
    return data.settings;
  }

  // データをリセット（デバッグ用）
  async function resetData() {
    storageData = {
      tweets: [],
      settings: { ...DEFAULT_SETTINGS }
    };
    initialized = true;
    await saveStorageData({
      tweets: [],
      settings: { maxItems: DEFAULT_SETTINGS.maxItems }
    });
  }

  // ストレージ変更のリスナーを追加（他タブでの更新を検知）
  function addStorageChangeListener(callback) {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && (changes.tweets || changes.settings)) {
        loadStorageData().then(callback);
      }
    });
  }

  // 初期化済みかどうかをチェック
  function isInitialized() {
    return initialized;
  }

  // URL から tweetId を抽出して正規化された URL を返す
  function normalizeTwitterUrl(url) {
    if (!url) return null;

    // クエリパラメータを除外して処理
    const cleanUrl = url.split('?')[0];

    // 相対URLなら絶対URLに変換
    let absoluteUrl = cleanUrl;
    if (cleanUrl.startsWith('/')) {
      absoluteUrl = window.location.origin + cleanUrl;
    }

    // Twitter/X の URL パターン
    // https://twitter.com/username/status/tweetId
    // https://x.com/username/status/tweetId

    const patterns = [
      /(?:https?:\/\/)?(?:twitter|x)\.com\/([^\/]+)\/status\/(\d+)(?:\/[^\/]+)?/i,
      /(?:https?:\/\/)?(?:twitter|x)\.com\/([^\/]+)\/status\/(\d+)/i
    ];

    for (const pattern of patterns) {
      const match = absoluteUrl.match(pattern);
      if (match) {
        const username = match[1];
        const tweetId = match[2];
        return {
          tweetId: tweetId,
          url: `https://x.com/${username}/status/${tweetId}`,
          username: username
        };
      }
    }

    return null;
  }

  // エクスポート（モジュールとして使う場合）
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      saveTweet,
      getAllTweets,
      getTweetByTweetId,
      deleteTweet,
      deleteAllTweets,
      getSettings,
      updateSettings,
      resetData,
      addStorageChangeListener,
      normalizeTwitterUrl,
      isInitialized,
      loadStorageData
    };
  } else {
    // ブラウザ拡張用にグローバルオブジェクトに追加
    window.TweetSaverStorage = {
      saveTweet,
      getAllTweets,
      getTweetByTweetId,
      deleteTweet,
      deleteAllTweets,
      getSettings,
      updateSettings,
      resetData,
      addStorageChangeListener,
      normalizeTwitterUrl,
      isInitialized,
      loadStorageData,
      DEFAULT_SETTINGS
    };
  }
})();
