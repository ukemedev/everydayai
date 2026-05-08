(function () {
  'use strict';

  var cfg = window.EverydayAI || {};
  var agentId = cfg.agentId;
  var color = cfg.color || '#3b5bfc';
  var size = cfg.size || 'regular';
  var startingMessage = cfg.startingMessage || 'Hi! How can I help you?';

  if (!agentId) {
    console.warn('[EverydayAI] No agentId configured.');
    return;
  }

  // Resolve API base from this script's own origin so embeds on other sites work
  var scriptSrc = (document.currentScript || {}).src || '';
  var baseUrl = scriptSrc ? (new URL(scriptSrc)).origin : window.location.origin;

  var chatWidth  = size === 'large' ? '380px' : '340px';
  var chatHeight = size === 'large' ? '520px' : '460px';

  // ── State ─────────────────────────────────────────────────────────────────
  var isOpen = false;
  var isBusy = false;
  var agentName = 'AI Assistant';
  var conversationHistory = [];

  // ── Hex → rgb helper ──────────────────────────────────────────────────────
  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    var r = parseInt(hex.substring(0,2), 16);
    var g = parseInt(hex.substring(2,4), 16);
    var b = parseInt(hex.substring(4,6), 16);
    return r + ',' + g + ',' + b;
  }

  var rgb = hexToRgb(color);

  // ── Styles ────────────────────────────────────────────────────────────────
  var css = '\
* { box-sizing: border-box; margin: 0; padding: 0; }\
\
.bubble {\
  width: 56px; height: 56px; border-radius: 50%;\
  background: ' + color + '; border: none; cursor: pointer;\
  display: flex; align-items: center; justify-content: center;\
  box-shadow: 0 4px 20px rgba(0,0,0,0.3);\
  transition: transform 0.18s, box-shadow 0.18s; outline: none;\
}\
.bubble:hover { transform: scale(1.06); box-shadow: 0 6px 28px rgba(0,0,0,0.35); }\
.bubble:active { transform: scale(0.97); }\
.icon-chat { display: block; }\
.icon-close { display: none; }\
.bubble.open .icon-chat { display: none; }\
.bubble.open .icon-close { display: block; }\
\
.win {\
  position: absolute; bottom: 68px; right: 0;\
  width: ' + chatWidth + '; height: ' + chatHeight + ';\
  border-radius: 16px; background: #0a0f1e;\
  border: 1px solid rgba(255,255,255,0.08);\
  box-shadow: 0 20px 72px rgba(0,0,0,0.55);\
  display: flex; flex-direction: column; overflow: hidden;\
  transform-origin: bottom right;\
  transform: scale(0.92) translateY(12px); opacity: 0;\
  pointer-events: none; transition: transform 0.22s cubic-bezier(.34,1.56,.64,1), opacity 0.18s;\
}\
.win.open { transform: scale(1) translateY(0); opacity: 1; pointer-events: all; }\
\
.hdr {\
  padding: 13px 15px; background: #0d1117;\
  border-bottom: 1px solid rgba(255,255,255,0.06);\
  display: flex; align-items: center; gap: 10px; flex-shrink: 0;\
}\
.hdr-avatar {\
  width: 34px; height: 34px; border-radius: 10px;\
  background: rgba(' + rgb + ',0.18); display: flex;\
  align-items: center; justify-content: center;\
  font-size: 16px; flex-shrink: 0;\
}\
.hdr-info { flex: 1; min-width: 0; }\
.hdr-name { font-size: 13px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\
.hdr-status { font-size: 11px; color: #4ade80; margin-top: 1px; }\
.hdr-close {\
  width: 28px; height: 28px; border-radius: 8px;\
  background: transparent; border: none; cursor: pointer;\
  color: rgba(255,255,255,0.3); font-size: 20px; line-height: 1;\
  display: flex; align-items: center; justify-content: center;\
  transition: background 0.14s, color 0.14s; flex-shrink: 0;\
}\
.hdr-close:hover { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.75); }\
\
.msgs {\
  flex: 1; overflow-y: auto; padding: 14px;\
  display: flex; flex-direction: column; gap: 11px;\
  scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent;\
}\
.msgs::-webkit-scrollbar { width: 4px; }\
.msgs::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }\
\
.empty {\
  flex: 1; display: flex; flex-direction: column;\
  align-items: center; justify-content: center;\
  gap: 8px; text-align: center; padding: 24px;\
}\
.empty-ico {\
  width: 44px; height: 44px; border-radius: 14px;\
  background: rgba(' + rgb + ',0.1); border: 1px solid rgba(' + rgb + ',0.2);\
  display: flex; align-items: center; justify-content: center; font-size: 20px;\
}\
.empty-txt { font-size: 13px; color: rgba(255,255,255,0.5); line-height: 1.5; }\
\
.row { display: flex; align-items: flex-end; gap: 6px; }\
.row.user { flex-direction: row-reverse; }\
.avatar {\
  width: 26px; height: 26px; border-radius: 8px;\
  background: rgba(' + rgb + ',0.15);\
  display: flex; align-items: center; justify-content: center;\
  font-size: 13px; flex-shrink: 0;\
}\
.bbl {\
  max-width: 78%; padding: 9px 12px;\
  font-size: 13px; line-height: 1.55;\
  white-space: pre-wrap; word-break: break-word;\
  font-family: system-ui,-apple-system,sans-serif;\
}\
.row.agent .bbl {\
  background: #1a2235; color: rgba(255,255,255,0.87);\
  border-radius: 14px; border-bottom-left-radius: 4px;\
  border: 1px solid rgba(255,255,255,0.06);\
}\
.row.user .bbl {\
  background: ' + color + '; color: #fff;\
  border-radius: 14px; border-bottom-right-radius: 4px;\
}\
\
.typing {\
  display: flex; align-items: center; gap: 4px;\
  padding: 10px 13px; background: #1a2235;\
  border: 1px solid rgba(255,255,255,0.06);\
  border-radius: 14px; border-bottom-left-radius: 4px;\
}\
.typing span {\
  width: 5px; height: 5px; border-radius: 50%;\
  background: rgba(255,255,255,0.35);\
  animation: tdot 1.2s infinite;\
}\
.typing span:nth-child(2) { animation-delay: 0.16s; }\
.typing span:nth-child(3) { animation-delay: 0.32s; }\
@keyframes tdot {\
  0%,60%,100% { transform: translateY(0); }\
  30% { transform: translateY(-5px); }\
}\
\
.inp-area {\
  padding: 11px 12px; background: #0d1117;\
  border-top: 1px solid rgba(255,255,255,0.05); flex-shrink: 0;\
}\
.inp-row {\
  display: flex; align-items: center; gap: 8px;\
  background: rgba(255,255,255,0.05);\
  border: 1px solid rgba(255,255,255,0.08);\
  border-radius: 11px; padding: 7px 11px;\
}\
.inp {\
  flex: 1; background: transparent; border: none; outline: none;\
  font-size: 13px; color: #fff;\
  font-family: system-ui,-apple-system,sans-serif;\
}\
.inp::placeholder { color: rgba(255,255,255,0.24); }\
.send-btn {\
  width: 30px; height: 30px; border-radius: 8px;\
  border: none; cursor: pointer; background: ' + color + ';\
  display: flex; align-items: center; justify-content: center;\
  transition: opacity 0.14s, transform 0.14s; flex-shrink: 0;\
}\
.send-btn:hover:not(:disabled) { opacity: 0.9; }\
.send-btn:active:not(:disabled) { transform: scale(0.95); }\
.send-btn:disabled { opacity: 0.28; cursor: default; }\
\
.footer {\
  text-align: center; font-size: 10px;\
  color: rgba(255,255,255,0.2); margin-top: 7px;\
}\
.footer a { color: rgba(255,255,255,0.3); text-decoration: none; }\
.footer a:hover { color: rgba(255,255,255,0.55); }\
';

  // ── Markup ────────────────────────────────────────────────────────────────
  var html = '\
<style>' + css + '</style>\
<div class="win" id="eai-win">\
  <div class="hdr">\
    <div class="hdr-avatar">🤖</div>\
    <div class="hdr-info">\
      <div class="hdr-name" id="eai-name">AI Assistant</div>\
      <div class="hdr-status">Online</div>\
    </div>\
    <button class="hdr-close" id="eai-close">×</button>\
  </div>\
  <div class="msgs" id="eai-msgs">\
    <div class="empty" id="eai-empty">\
      <div class="empty-ico">🤖</div>\
      <div class="empty-txt">' + startingMessage + '</div>\
    </div>\
  </div>\
  <div class="inp-area">\
    <div class="inp-row">\
      <input class="inp" id="eai-inp" type="text" placeholder="Type a message\u2026" />\
      <button class="send-btn" id="eai-send" disabled>\
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">\
          <path d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>\
        </svg>\
      </button>\
    </div>\
    <div class="footer">Powered by <a href="' + baseUrl + '" target="_blank" rel="noopener">EverydayAI</a></div>\
  </div>\
</div>\
<button class="bubble" id="eai-bubble" aria-label="Open chat">\
  <svg class="icon-chat" width="23" height="23" viewBox="0 0 24 24" fill="none">\
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" stroke="white" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>\
  </svg>\
  <svg class="icon-close" width="20" height="20" viewBox="0 0 24 24" fill="none">\
    <path d="M18 6L6 18M6 6l12 12" stroke="white" stroke-width="2.3" stroke-linecap="round"/>\
  </svg>\
</button>\
';

  // ── Mount ─────────────────────────────────────────────────────────────────
  var host = document.createElement('div');
  host.setAttribute('id', 'everydayai-widget');
  host.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;font-family:system-ui,-apple-system,sans-serif;';
  document.body.appendChild(host);

  var root;
  if (host.attachShadow) {
    root = host.attachShadow({ mode: 'open' });
  } else {
    root = host; // fallback for older browsers
  }
  root.innerHTML = html;

  // ── Element refs ──────────────────────────────────────────────────────────
  function el(id) { return root.getElementById ? root.getElementById(id) : root.querySelector('#' + id); }

  var winEl    = el('eai-win');
  var bubbleEl = el('eai-bubble');
  var closeEl  = el('eai-close');
  var msgsEl   = el('eai-msgs');
  var emptyEl  = el('eai-empty');
  var inpEl    = el('eai-inp');
  var sendEl   = el('eai-send');
  var nameEl   = el('eai-name');

  // ── Agent info ────────────────────────────────────────────────────────────
  function loadAgent() {
    fetch(baseUrl + '/api/public/agents/' + agentId)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.agent && d.agent.name) {
          agentName = d.agent.name;
          if (nameEl) nameEl.textContent = agentName;
        }
      })
      .catch(function () {});
  }

  // ── Toggle ────────────────────────────────────────────────────────────────
  function toggle() {
    isOpen = !isOpen;
    winEl.classList.toggle('open', isOpen);
    bubbleEl.classList.toggle('open', isOpen);
    if (isOpen) {
      setTimeout(function () { if (inpEl) inpEl.focus(); }, 220);
    }
  }

  // ── Messages ──────────────────────────────────────────────────────────────
  function appendMessage(role, text) {
    if (emptyEl) emptyEl.style.display = 'none';
    var row = document.createElement('div');
    row.className = 'row ' + role;
    if (role === 'agent') {
      row.innerHTML = '<div class="avatar">🤖</div><div class="bbl"></div>';
      row.querySelector('.bbl').textContent = text;
    } else {
      row.innerHTML = '<div class="bbl"></div>';
      row.querySelector('.bbl').textContent = text;
    }
    msgsEl.appendChild(row);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  function showTyping() {
    var row = document.createElement('div');
    row.className = 'row agent';
    row.id = 'eai-typing';
    row.innerHTML = '<div class="avatar">🤖</div><div class="typing"><span></span><span></span><span></span></div>';
    msgsEl.appendChild(row);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  function hideTyping() {
    var t = el('eai-typing');
    if (t) t.parentNode.removeChild(t);
  }

  // ── Send ──────────────────────────────────────────────────────────────────
  function send() {
    var text = inpEl ? inpEl.value.trim() : '';
    if (!text || isBusy) return;

    inpEl.value = '';
    sendEl.disabled = true;
    appendMessage('user', text);
    isBusy = true;
    showTyping();

    var historySnapshot = conversationHistory.slice();
    conversationHistory.push({ role: 'user', content: text });

    fetch(baseUrl + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        agentId: agentId,
        conversationHistory: historySnapshot,
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        hideTyping();
        var reply = d.reply || 'Sorry, something went wrong.';
        appendMessage('agent', reply);
        conversationHistory.push({ role: 'assistant', content: reply });
      })
      .catch(function () {
        hideTyping();
        appendMessage('agent', 'Connection error. Please try again.');
      })
      .finally(function () {
        isBusy = false;
      });
  }

  // ── Events ────────────────────────────────────────────────────────────────
  if (bubbleEl) bubbleEl.addEventListener('click', toggle);
  if (closeEl)  closeEl.addEventListener('click', toggle);

  if (inpEl) {
    inpEl.addEventListener('input', function () {
      sendEl.disabled = !this.value.trim() || isBusy;
    });
    inpEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
  }

  if (sendEl) sendEl.addEventListener('click', send);

  loadAgent();
})();
