/* G36 看板娘 v3 — 镂空点击 + 拖拽优化 + 边缘修复 */
(function() {
  'use strict';
  if (window.innerWidth < 768) return;

  var widget = document.getElementById('saber-widget');
  if (!widget) return;

  var body = widget.querySelector('.saber-body');
  var bubble = widget.querySelector('.saber-bubble');
  var canvas = document.getElementById('live2d-canvas');
  var hideBtn = widget.querySelector('.saber-hide-btn');
  var zoomBtn = widget.querySelector('.saber-zoom-btn');
  if (!body || !bubble || !canvas) return;

  // ===== 状态 =====
  var app = null;
  var model = null;
  var lastMsg = '';
  var idleTimer = null, scrollTimer = null, hideTimer = null;

  var state = {
    hidden: false,
    scaleIdx: 0,
    scales: [1, 0.7, 1.2],
    dragging: false,
    dragStartX: 0, dragStartY: 0,
    dragOffset: { x: 0, y: 0 },
    dragBase: { x: 0, y: 0 },
    moved: false,
    savedPos: null
  };

  // ===== 台词库 =====
  var messages = {
    welcome: ['G36报到，指挥官！', '您终于来了，长官。', '随时待命，请指示。', '欢迎回来，指挥官。'],
    idle: ['今天的任务是什么呢？', '指挥官，要喝杯茶吗？', '我会一直守护您的。', '嗯...在思考战术吗？', '长官，需要整理装备吗？', '这篇情报很有价值呢。', '请放心，后方交给我。', '指挥官，辛苦了。'],
    click: ['呀！请、请不要突然碰我...', '有什么命令吗，指挥官？', '嘿嘿，是在测试我的反应吗？', '我在听，请说。', '又来逗我了？', '指挥官今天很有精神呢。'],
    scroll: ['下面还有更多情报哦。', '慢慢看，不着急。', '要返回顶部吗？', '看了这么久，休息一下吧。'],
    search: ['要搜索情报吗？我来帮忙！', '输入关键词试试看？', '情报检索系统就绪。'],
    dark: ['夜间的警戒也不能松懈。', '月光下巡逻中...', '指挥官，夜深了请注意休息。', '夜间模式已启动。'],
    peek: ['啧，被发现了...', '我还在哦~', '需要帮忙吗？', '偷偷看一眼...']
  };

  function pick(arr) {
    var msg;
    do { msg = arr[Math.floor(Math.random() * arr.length)]; }
    while (msg === lastMsg && arr.length > 1);
    lastMsg = msg;
    return msg;
  }

  function say(text, duration) {
    if (!text) return;
    if (state.hidden) return;
    bubble.textContent = text;
    bubble.classList.add('show');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function() {
      bubble.classList.remove('show');
    }, duration || 3000);
  }

  // ===== 判断点击是否在人物区域内（椭圆近似）=====
  function isInsideModel(x, y) {
    var rect = canvas.getBoundingClientRect();
    var cx = rect.width / 2;
    var cy = rect.height / 2;
    var rx = cx * 0.85;
    var ry = cy * 0.82;
    var dx = x - rect.left - cx;
    var dy = y - rect.top - cy;
    return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
  }

  // ===== transform 更新 =====
  function updateTransform() {
    var parts = [];
    var scale = state.scales[state.scaleIdx];
    if (state.hidden) {
      parts.push('translate3d(-' + (body.offsetWidth * scale - 20) + 'px, 0, 0)');
    } else {
      parts.push('translate3d(' + state.dragOffset.x + 'px, ' + state.dragOffset.y + 'px, 0)');
    }
    if (scale !== 1) parts.push('scale(' + scale + ')');
    widget.style.transform = parts.join(' ');
  }

  // ===== Live2D 加载 =====
  function initLive2D() {
    if (typeof PIXI === 'undefined' || !PIXI.live2d || !PIXI.live2d.Live2DModel) {
      setTimeout(initLive2D, 300);
      return;
    }
    try {
      app = new PIXI.Application({
        view: canvas,
        autoStart: true,
        backgroundAlpha: 0,
        width: 360,
        height: 540,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true
      });

      var modelPath = canvas.dataset.model || '/live2d/g36/normal.model3.json';

      PIXI.live2d.Live2DModel.from(modelPath).then(function(m) {
        model = m;
        app.stage.addChild(model);
        var fitScale = Math.min(
          app.screen.width / model.width,
          app.screen.height / model.height
        );
        model.scale.set(fitScale * 0.88);
        model.x = (app.screen.width - model.width) / 2;
        model.y = app.screen.height - model.height;

        widget.classList.add('loaded');
        setTimeout(function() { say(pick(messages.welcome), 3500); }, 600);
        try { model.motion('', 0); } catch(e) {}
      }).catch(function(err) {
        console.warn('[live2d] model load fail:', err);
      });
    } catch(e) {
      console.warn('[live2d] init fail:', e);
    }
  }

  // ===== 隐藏/显示 =====
  function toggleHidden() {
    state.hidden = !state.hidden;
    if (state.hidden) {
      // 保存当前位置
      state.savedPos = {
        left: widget.style.left,
        bottom: widget.style.bottom,
        transform: widget.style.transform
      };
      // 强制贴到左边缘，只露20px
      widget.style.left = '0px';
      widget.style.bottom = '20px';
      state.dragOffset = { x: 0, y: 0 };
      updateTransform();
      widget.classList.add('peek-hidden');
      hideBtn.classList.add('hidden-state');
      hideBtn.title = '显示看板娘';
      bubble.classList.remove('show');
    } else {
      widget.classList.remove('peek-hidden');
      hideBtn.classList.remove('hidden-state');
      hideBtn.title = '隐藏看板娘';
      if (state.savedPos) {
        widget.style.left = state.savedPos.left;
        widget.style.bottom = state.savedPos.bottom;
        widget.style.transform = state.savedPos.transform;
        var m = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px/.exec(state.savedPos.transform || '');
        if (m) {
          state.dragOffset.x = parseFloat(m[1]);
          state.dragOffset.y = parseFloat(m[2]);
        } else {
          state.dragOffset = { x: 0, y: 0 };
        }
      } else {
        widget.style.left = '0px';
        widget.style.bottom = '20px';
        widget.style.transform = '';
        state.dragOffset = { x: 0, y: 0 };
      }
      say(pick(messages.peek), 3000);
      if (model) { try { model.motion('', 0); } catch(e) {} }
    }
  }

  // ===== 缩放（3档循环）=====
  function toggleZoom() {
    state.scaleIdx = (state.scaleIdx + 1) % 3;
    updateTransform();
  }

  // ===== 点击处理 =====
  function onClick() {
    if (state.hidden) return;
    say(pick(messages.click), 3000);
    if (model) { try { model.motion('', 0); } catch(e) {} }
    body.style.animation = 'none';
    body.offsetHeight; // reflow
    body.style.animation = 'saber-shake 0.5s ease-out';
  }

  // ===== 拖拽 =====
  canvas.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return;
    // 只有点在人物椭圆区域内才触发
    if (!isInsideModel(e.clientX, e.clientY)) return;
    state.dragging = true;
    state.moved = false;
    state.dragStartX = e.clientX;
    state.dragStartY = e.clientY;
    state.dragBase.x = state.dragOffset.x;
    state.dragBase.y = state.dragOffset.y;
    widget.classList.add('dragging');
    // 暂停Live2D渲染减少卡顿
    if (app && app.ticker) app.ticker.stop();
    e.preventDefault();
  });

  window.addEventListener('mousemove', function(e) {
    if (!state.dragging) return;
    var dx = e.clientX - state.dragStartX;
    var dy = e.clientY - state.dragStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) state.moved = true;
    if (!state.moved) return;
    state.dragOffset.x = state.dragBase.x + dx;
    state.dragOffset.y = state.dragBase.y + dy;
    updateTransform();
  });

  window.addEventListener('mouseup', function(e) {
    if (!state.dragging) return;
    state.dragging = false;
    widget.classList.remove('dragging');
    // 恢复Live2D渲染
    if (app && app.ticker) app.ticker.start();
    if (!state.moved) {
      if (state.hidden) {
        toggleHidden();
      } else {
        onClick();
      }
    }
    state.moved = false;
  });

  // 鼠标离开窗口时结束拖拽
  window.addEventListener('mouseleave', function() {
    if (state.dragging) {
      state.dragging = false;
      widget.classList.remove('dragging');
      if (app && app.ticker) app.ticker.start();
      state.moved = false;
    }
  });

  // ===== 按钮事件 =====
  if (hideBtn) {
    hideBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      toggleHidden();
    });
  }
  if (zoomBtn) {
    zoomBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      toggleZoom();
    });
  }

  // ===== 滚轮缩放（Ctrl+滚轮）=====
  body.addEventListener('wheel', function(e) {
    if (e.ctrlKey) {
      e.preventDefault();
      toggleZoom();
    }
  }, { passive: false });

  // ===== 滚动提示 =====
  var lastScrollY = 0;
  window.addEventListener('scroll', function() {
    if (scrollTimer) return;
    scrollTimer = setTimeout(function() {
      scrollTimer = null;
      var st = window.scrollY;
      if (st > lastScrollY + 200 && Math.random() > 0.7) {
        say(pick(messages.scroll), 3000);
      }
      lastScrollY = st;
    }, 500);
  });

  // ===== 随机 idle =====
  function scheduleIdle() {
    var delay = 25000 + Math.random() * 15000;
    idleTimer = setTimeout(function() {
      if (!bubble.classList.contains('show') && !state.hidden) {
        say(pick(messages.idle), 3000);
      }
      scheduleIdle();
    }, delay);
  }
  scheduleIdle();

  // ===== 搜索按钮联动 =====
  var searchBtn = document.querySelector('.sakura-search-trigger');
  if (searchBtn) {
    searchBtn.addEventListener('click', function() {
      say(pick(messages.search), 3000);
    });
  }

  // ===== 夜间模式联动 =====
  var darkToggle = document.querySelector('.sakura-dark-mode-toggle');
  if (darkToggle) {
    darkToggle.addEventListener('click', function() {
      setTimeout(function() {
        if (document.documentElement.classList.contains('dark')) {
          say(pick(messages.dark), 3000);
        }
      }, 300);
    });
  }

  // ===== 清理 =====
  window.addEventListener('beforeunload', function() {
    clearTimeout(idleTimer);
    clearTimeout(scrollTimer);
    clearTimeout(hideTimer);
  });

  // 初始化
  widget.style.left = '0px';
  widget.style.bottom = '20px';
  updateTransform();
  initLive2D();
})();
