// content.js - Twitter/X のタイムラインでツイートを検知・保存

(function() {
  'use strict';

  // 既に保存済みの tweetId を管理（重複保存防止）
  const savedTweetIds = new Set();

  // IntersectionObserver の設定
  const INTERSECTION_THRESHOLD = 0.3; // 30% 以上表示されたら「見た」と判定
  const MIN_VISIBLE_DURATION = 300;   // 最低 300ms 画面内に表示

  // 表示状態を管理するマップ
  const visibleState = new Map();

  // 処理キュー
  let isProcessing = false;
  const processQueue = [];

  // ツイート本文のプレビューを取得
  function getTweetPreviewText(element) {
    // ツイート本文を含む要素を探索
    const selectors = [
      'div[data-testid="tweetText"]',
      'div.tweet-text',
      'div.content > p',
      'div.r-18u37iz > div',
      'article div span'
    ];

    for (const selector of selectors) {
      const textElement = element.querySelector(selector);
      if (textElement) {
        const text = textElement.textContent || '';
        const preview = text.replace(/\s+/g, ' ').substring(0, 30);
        if (preview.length > 0) {
          return preview;
        }
      }
    }

    // 見つからない場合は article 内の最初のテキストを取得
    const allText = element.textContent || '';
    return allText.replace(/\s+/g, ' ').substring(0, 30);
  }

  // ツイート ID の正規化と保存
  async function saveTweetFromElement(element) {
    if (!window.TweetSaverStorage || !window.TweetSaverStorage.normalizeTwitterUrl) {
      return false;
    }

    const statusLinks = element.querySelectorAll('a[href*="/status/"]');

    for (const link of statusLinks) {
      const url = link.getAttribute('href');

      if (!url) continue;

      // 不要な派生 URL を除外
      if (url.match(/\/(photo|analytics|retweets|likes|conversation)/)) {
        continue;
      }

      // クエリパラメータ付き URL を除外
      if (url.includes('?')) {
        continue;
      }

      // 正規化された URL を取得
      const normalized = window.TweetSaverStorage.normalizeTwitterUrl(url);

      if (normalized && normalized.tweetId) {
        if (savedTweetIds.has(normalized.tweetId)) {
          continue;
        }

        // ツイート本文を取得（プレビュー用）
        const previewText = getTweetPreviewText(element);

        // 保存処理をキューに追加
        processQueue.push({
          tweetId: normalized.tweetId,
          url: normalized.url,
          username: normalized.username,
          preview: previewText
        });

        // 処理が実行されていないなら実行
        if (!isProcessing) {
          processQueueDebounce();
        }

        return true;
      }
    }

    return false;
  }

  // キュー内のツイートを保存（重複チェックあり）
  async function processQueueDebounce() {
    if (processQueue.length === 0) return;

    isProcessing = true;

    await new Promise(resolve => setTimeout(resolve, 150));

    const itemsToSave = [...processQueue];
    processQueue.length = 0;

    try {
      for (const item of itemsToSave) {
        const saved = await window.TweetSaverStorage.saveTweet(item.url, item.tweetId, item.username, item.preview);
        if (saved) {
          savedTweetIds.add(item.tweetId);
        }
      }
    } catch (error) {
      // エラーは無視
    }

    isProcessing = false;
  }

  // IntersectionObserver のコールバック
  const intersectionCallback = (entries) => {
    for (const entry of entries) {
      const element = entry.target;

      if (entry.isIntersecting) {
        if (!visibleState.has(element)) {
          visibleState.set(element, {
            entranceTime: Date.now(),
            processed: false
          });
        }
      } else {
        visibleState.delete(element);
      }
    }
  };

  // 処理対象かどうかをチェックして保存
  function checkAndSaveVisibleElements() {
    const now = Date.now();

    for (const [element, state] of visibleState.entries()) {
      if (state.processed) continue;

      if (now - state.entranceTime >= MIN_VISIBLE_DURATION) {
        state.processed = true;
        saveTweetFromElement(element);
      }
    }
  }

  // 定期的なチェック
  const checkInterval = setInterval(checkAndSaveVisibleElements, 200);

  // 1つの要素を監視
  function observeElement(element) {
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }

    if (element.dataset.tweetSaverObserved === 'true') {
      return;
    }
    element.dataset.tweetSaverObserved = 'true';

    const observer = new IntersectionObserver(intersectionCallback, {
      root: null,
      rootMargin: '0px',
      threshold: INTERSECTION_THRESHOLD
    });

    observer.observe(element);
  }

  // 要素がツイートであるかを判定
  function isTweetElement(element) {
    if (element.tagName === 'ARTICLE') {
      return true;
    }
    if (element.tagName === 'DIV' && element.getAttribute('role') === 'article') {
      return true;
    }
    return false;
  }

  // 初期化時に既存の要素を監視
  async function init() {
    if (window.TweetSaverStorage && window.TweetSaverStorage.loadStorageData) {
      try {
        const data = await window.TweetSaverStorage.loadStorageData();
        data.tweets.forEach(t => savedTweetIds.add(t.tweetId));
      } catch (err) {
        // エラーは無視
      }
    }

    let tweetElements = document.querySelectorAll('article, div[role="article"]');

    const observedElements = new Set();
    for (const element of tweetElements) {
      if (observedElements.has(element)) continue;
      observedElements.add(element);
      observeElement(element);
    }

    // MutationObserver を開始
    const bodyObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (isTweetElement(node)) {
              observeElement(node);
            }

            const tweetNodes = node.querySelectorAll('article, div[role="article"]');
            for (const tweetNode of tweetNodes) {
              if (!tweetNode.dataset.tweetSaverObserved) {
                observeElement(tweetNode);
              }
            }
          }
        }
      }
    });

    bodyObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // 初期化（DOMContentLoaded 後に実行）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // クリーンアップ
  window.addEventListener('beforeunload', () => {
    clearInterval(checkInterval);
  });
})();
