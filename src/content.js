// content.js - Twitter/X のタイムラインでツイートを検知・保存

(function() {
  'use strict';

  const savedTweetIds = new Set();
  const observedElements = new WeakSet();

  // 一瞬だけ表示されるツイートも拾いやすくするための閾値
  const INTERSECTION_THRESHOLD = 0.01;
  const MIN_VISIBLE_DURATION = 60;
  const CHECK_INTERVAL_MS = 80;
  const SAVE_DEBOUNCE_MS = 50;
  const VIEWPORT_SCAN_INTERVAL_MS = 400;

  const visibleState = new Map();
  const pendingTweetMap = new Map();

  let isProcessing = false;
  let intersectionObserver = null;

  function getTweetPreviewText(element) {
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
        const preview = text.replace(/\s+/g, ' ').trim().substring(0, 80);
        if (preview.length > 0) {
          return preview;
        }
      }
    }

    const allText = element.textContent || '';
    return allText.replace(/\s+/g, ' ').trim().substring(0, 80);
  }

  function getNormalizedTweetFromElement(element) {
    if (!window.TweetSaverStorage || !window.TweetSaverStorage.normalizeTwitterUrl) {
      return null;
    }

    const statusLinks = element.querySelectorAll('a[href*="/status/"]');

    for (const link of statusLinks) {
      const url = link.getAttribute('href');
      if (!url) continue;

      if (url.match(/\/(photo|analytics|retweets|likes|conversation)/)) {
        continue;
      }

      const normalized = window.TweetSaverStorage.normalizeTwitterUrl(url);
      if (normalized && normalized.tweetId) {
        return normalized;
      }
    }

    return null;
  }

  function enqueueTweetSaveFromElement(element, reason = 'visible') {
    const normalized = getNormalizedTweetFromElement(element);
    if (!normalized) {
      return false;
    }

    if (savedTweetIds.has(normalized.tweetId) || pendingTweetMap.has(normalized.tweetId)) {
      return false;
    }

    pendingTweetMap.set(normalized.tweetId, {
      tweetId: normalized.tweetId,
      url: normalized.url,
      username: normalized.username,
      preview: getTweetPreviewText(element),
      reason,
      queuedAt: Date.now()
    });

    if (!isProcessing) {
      processQueueDebounce();
    }

    return true;
  }

  async function processQueueDebounce() {
    if (pendingTweetMap.size === 0 || isProcessing) return;

    isProcessing = true;

    await new Promise(resolve => setTimeout(resolve, SAVE_DEBOUNCE_MS));

    const itemsToSave = Array.from(pendingTweetMap.values());
    pendingTweetMap.clear();

    try {
      for (const item of itemsToSave) {
        if (savedTweetIds.has(item.tweetId)) {
          continue;
        }

        const saved = await window.TweetSaverStorage.saveTweet(
          item.url,
          item.tweetId,
          item.username,
          item.preview
        );

        if (saved) {
          savedTweetIds.add(item.tweetId);
        }
      }
    } catch (error) {
      // エラーは無視
    }

    isProcessing = false;

    if (pendingTweetMap.size > 0) {
      processQueueDebounce();
    }
  }

  function isInViewport(element) {
    if (!element || !element.isConnected) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

    return (
      rect.bottom >= 0 &&
      rect.right >= 0 &&
      rect.top <= viewportHeight &&
      rect.left <= viewportWidth
    );
  }

  function captureElementIfRelevant(element, reason = 'visible') {
    if (!isTweetElement(element)) {
      return false;
    }

    return enqueueTweetSaveFromElement(element, reason);
  }

  function flushElementBeforeRemoval(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    if (isTweetElement(element)) {
      captureElementIfRelevant(element, 'removed');
      visibleState.delete(element);
    }

    const tweetNodes = element.querySelectorAll ? element.querySelectorAll('article, div[role="article"]') : [];
    for (const tweetNode of tweetNodes) {
      captureElementIfRelevant(tweetNode, 'removed-descendant');
      visibleState.delete(tweetNode);
    }
  }

  const intersectionCallback = (entries) => {
    for (const entry of entries) {
      const element = entry.target;
      const existingState = visibleState.get(element);

      if (entry.isIntersecting) {
        if (!existingState) {
          visibleState.set(element, {
            entranceTime: Date.now(),
            processed: false
          });
        }
      } else if (existingState) {
        if (!existingState.processed) {
          captureElementIfRelevant(element, 'exit-before-threshold');
        }
        visibleState.delete(element);
      }
    }
  };

  function checkAndSaveVisibleElements() {
    const now = Date.now();

    for (const [element, state] of visibleState.entries()) {
      if (state.processed) continue;

      if (!element.isConnected) {
        captureElementIfRelevant(element, 'disconnected');
        visibleState.delete(element);
        continue;
      }

      if (now - state.entranceTime >= MIN_VISIBLE_DURATION) {
        state.processed = true;
        captureElementIfRelevant(element, 'visible-threshold');
      }
    }
  }

  function observeElement(element) {
    if (typeof IntersectionObserver === 'undefined' || !element) {
      return;
    }

    if (observedElements.has(element)) {
      return;
    }

    observedElements.add(element);
    element.dataset.tweetSaverObserved = 'true';
    intersectionObserver.observe(element);

    if (isInViewport(element)) {
      const currentState = visibleState.get(element);
      if (!currentState) {
        visibleState.set(element, {
          entranceTime: Date.now(),
          processed: false
        });
      }

      captureElementIfRelevant(element, 'observed-in-viewport');
    }
  }

  function isTweetElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }

    if (element.tagName === 'ARTICLE') {
      return true;
    }

    if (element.tagName === 'DIV' && element.getAttribute('role') === 'article') {
      return true;
    }

    return false;
  }

  function observeTweetElementsInSubtree(root) {
    if (!root || root.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    if (isTweetElement(root)) {
      observeElement(root);
    }

    const tweetNodes = root.querySelectorAll('article, div[role="article"]');
    for (const tweetNode of tweetNodes) {
      observeElement(tweetNode);
    }
  }

  function scanVisibleTweets() {
    const tweetElements = document.querySelectorAll('article, div[role="article"]');
    for (const element of tweetElements) {
      if (isInViewport(element)) {
        captureElementIfRelevant(element, 'viewport-scan');
      }
    }
  }

  async function init() {
    if (window.TweetSaverStorage && window.TweetSaverStorage.loadStorageData) {
      try {
        const data = await window.TweetSaverStorage.loadStorageData();
        data.tweets.forEach(t => savedTweetIds.add(t.tweetId));
      } catch (err) {
        // エラーは無視
      }
    }

    if (typeof IntersectionObserver !== 'undefined') {
      intersectionObserver = new IntersectionObserver(intersectionCallback, {
        root: null,
        rootMargin: '160px 0px',
        threshold: INTERSECTION_THRESHOLD
      });
    }

    observeTweetElementsInSubtree(document.body);
    scanVisibleTweets();

    const bodyObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.removedNodes) {
          flushElementBeforeRemoval(node);
        }

        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            observeTweetElementsInSubtree(node);
          }
        }
      }
    });

    bodyObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  const checkInterval = setInterval(checkAndSaveVisibleElements, CHECK_INTERVAL_MS);
  const viewportScanInterval = setInterval(scanVisibleTweets, VIEWPORT_SCAN_INTERVAL_MS);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('beforeunload', () => {
    clearInterval(checkInterval);
    clearInterval(viewportScanInterval);
  });
})();
