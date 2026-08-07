// SPDX-License-Identifier: GPL-3.0-only
// providers/chatgpt.js - ChatGPT web provider (chatgpt.com).
// Uses the user's normal signed-in ChatGPT page; no API key is required.
// eslint-disable-next-line no-unused-vars
const ZSProvider = (() => {
  "use strict";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let diag = () => {};
  let locked = false;
  const S = {
    turn: '[data-message-author-role]', assistant: '[data-message-author-role="assistant"]',
    user: '[data-message-author-role="user"]', editor: '#prompt-textarea',
    send: '[data-testid="send-button"]', stop: '[data-testid="stop-button"]',
    error: '[role="alert"],[data-testid*="error"],[class*="error"],[class*="toast"]',
  };
  const timings = { GEN_IDLE_MS: 1500, REASON_IDLE_MS: 12000, WARMUP_MS: 45000, REASON_NOREPLY_MS: 90000, STABLE_MS: 10000, RESPONSE_TIMEOUT_MS: 300000 };
  const turns = () => [...document.querySelectorAll(S.turn)].filter((e) => !e.closest('#zs-root'));
  const isAssistantItem = (item) => !!item && item.matches(S.assistant);
  const isUserItem = (item) => !!item && item.matches(S.user);
  const assistantItems = () => turns().filter(isAssistantItem);
  const allItems = () => turns();
  const assistantCount = () => assistantItems().length;
  const userCount = () => turns().filter(isUserItem).length;
  const lastAssistant = () => { const a = assistantItems(); return a[a.length - 1] || null; };
  const ids = new WeakMap(); let idSeq = 0;
  // ChatGPT frequently replaces a rendered message node during a syntax/highlight
  // pass. Its data-message-id survives that replacement; a WeakMap-only identity
  // does not, which made the previous command look like a fresh reply and could
  // execute it twice after a tool result was sent.
  const lastAssistantId = () => {
    const item = lastAssistant();
    if (!item) return null;
    const stableId = item.getAttribute('data-message-id');
    if (stableId) return stableId;
    if (!ids.has(item)) ids.set(item, ++idSeq);
    return ids.get(item);
  };
  const withoutOwnUi = (root, exclude) => {
    if (!root) return "";
    const copy = root.cloneNode(true);
    // `.zs-tool-hide` is only a presentation class: EverLua puts it on
    // ChatGPT's raw command <pre> after it has rendered a polished tool card.
    // Do NOT remove it from this clone. This reader is also the command parser,
    // and removing the source block made ChatGPT commands look like an unnamed
    // "command" and then settle as "not run".
    copy.querySelectorAll('.zs-chip' + (exclude ? ',' + exclude : '')).forEach((e) => e.remove());
    // The rendered command block is deliberately hidden after EverLua adds its
    // compact tool card. `innerText` omits hidden elements, leaving only the
    // code-block chrome (for example, "JSON") and making a valid
    // {"command":"list_commands"} reply look like ordinary text. `textContent`
    // preserves the command source regardless of its presentation state.
    return copy.textContent || "";
  };
  const itemText = (item) => {
    const text = withoutOwnUi(item);
    // ChatGPT paints a code-block language header (usually just `JSON`) before
    // CodeMirror mounts the block's actual contents. A bare header is not a
    // reply: treating it as one let startup finish before
    // {"command":"list_commands"} arrived on the next render.
    return /^(?:json|javascript|typescript|python|lua|text)\s*$/i.test(text) ? "" : text;
  };
  const classifyText = (item, exclude) => withoutOwnUi(item, exclude);
  const readAssistant = () => { const item = lastAssistant(); return { present: !!item, reply: itemText(item).trim(), thinking: "", item }; };
  const streamLen = () => readAssistant().reply.length;
  const snapshot = () => ({ asst: assistantCount(), user: userCount(), gen: isGenerating() });
  function getEditor() {
    const preferred = document.querySelector(S.editor);
    if (preferred && !preferred.closest('#zs-root')) return preferred;
    return [...document.querySelectorAll('[contenteditable="true"], textarea')].find((e) => !e.closest('#zs-root') && /chat with chatgpt|ask anything/i.test(e.getAttribute('aria-label') || e.getAttribute('placeholder') || '')) || null;
  }
  const editorText = () => { const e = getEditor(); return e ? (e.value != null ? e.value : e.innerText || e.textContent || "") : ""; };
  const chatIsEmpty = () => turns().length === 0;
  const isFreshChat = () => chatIsEmpty();
  const composerFrame = () => { const e = getEditor(); return e && (e.closest('form') || e.parentElement); };
  function barMount() {
    const frame = composerFrame();
    if (!frame || !frame.parentElement) return null;
    // Place EverLua directly above ChatGPT's composer form. Returning the
    // explicit mount contract keeps the bar in-flow; returning a bare element
    // made the core reject the mount and left Start invisible.
    return { parent: frame.parentElement, before: frame, inside: false };
  }
  const barAnchor = composerFrame;
  const coverTarget = composerFrame;
  function applyLock() { const e = getEditor(); if (!e) return; e.contentEditable = locked ? 'false' : 'true'; e.toggleAttribute('readonly', locked); }
  function setInputLock(on) { locked = !!on; applyLock(); }
  function setEditorText(editor, text) {
    if (editor.value != null && editor.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(editor, text);
    } else {
      // ChatGPT uses a React-managed contenteditable. Assigning textContent
      // paints text but does not always update the editor's internal state,
      // leaving EverLua waiting for a reply that was never actually sent.
      editor.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor); range.collapse(false);
      selection.removeAllRanges(); selection.addRange(range);
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      const lines = String(text).split('\n');
      lines.forEach((line, index) => {
        if (line) document.execCommand('insertText', false, line);
        if (index < lines.length - 1) document.execCommand('insertLineBreak', false, null);
      });
    }
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  }
  async function typeAndSend(text) {
    // ChatGPT keeps some non-generation controls mounted with the same test id,
    // so only an explicitly labelled visible Stop control means it is busy.
    const isActuallyGenerating = () => [...document.querySelectorAll(S.stop)].some((b) => {
      const label = `${b.getAttribute('aria-label') || ''} ${b.getAttribute('title') || ''} ${b.innerText || ''}`.toLowerCase();
      return !!b.getClientRects().length && /stop (?:generating|response)|stop$/i.test(label.trim());
    });
    // Do not type a follow-up into the composer while ChatGPT is generating.
    // This is state-driven, not a fixed delay: send as soon as the real Stop
    // control disappears and the composer can accept the next message.
    while (isActuallyGenerating()) await sleep(150);
    const editor = getEditor(); if (!editor) throw new Error('ChatGPT composer not found');
    const wasLocked = locked; if (wasLocked) { locked = false; applyLock(); }
    setEditorText(editor, text); await sleep(80);
    // React enables ChatGPT's button on its next render after a programmatic
    // contenteditable update. Checking immediately leaves the tool result in
    // the composer and falsely aborts an otherwise healthy EverLua session.
    let send = null;
    // The Send button itself is the authoritative readiness signal. A goal
    // check may be queued while ChatGPT is still rendering a long reply, so do
    // not abandon it after an arbitrary timeout: send immediately when the
    // button becomes available.
    while (true) {
      send = document.querySelector(S.send);
      if (send && !send.disabled && send.getAttribute('aria-disabled') !== 'true') break;
      await sleep(100);
    }
    send.click();
    if (wasLocked) { locked = true; applyLock(); }
  }
  // `data-testid="stop-button"` is also used by voice controls, so require a
  // visible, explicitly labelled generation-stop control before reporting busy.
  const isGenerating = () => [...document.querySelectorAll(S.stop)].some((b) => {
    const label = `${b.getAttribute('aria-label') || ''} ${b.getAttribute('title') || ''} ${b.innerText || ''}`.toLowerCase();
    return !!b.getClientRects().length && /stop (?:generating|response)|stop$/i.test(label.trim());
  });
  const isHardGenerating = isGenerating;
  const isBusyNow = isGenerating;
  const stopGeneration = () => { const b = document.querySelector(S.stop); if (b) b.click(); };
  const enforceComposer = () => { if (locked) applyLock(); return { ready: !!getEditor() }; };
  const ensureComposerReady = async () => ({ ready: !!getEditor() });
  const modeWarning = () => null;
  const captchaPresent = () => false;
  const overlayBlocking = () => false;
  const turnHalted = () => false;
  const findContinueBtn = () => [...document.querySelectorAll('button')].find((b) => /^(continue|continue generating)$/i.test((b.innerText || '').trim())) || null;
  const clickContinueBtn = () => { const b = findContinueBtn(); if (b) { b.click(); return true; } return false; };
  const scanError = () => [...document.querySelectorAll(S.error)].map((e) => e.innerText || e.textContent || '').find((t) => /error|try again|limit|too many/i.test(t)) || '';
  const isTooLongMsg = (t) => /too long|context limit|maximum length/i.test(t || '');
  const isBusyMsg = (t) => /try again|too many requests|rate limit|busy/i.test(t || '');
  // ChatGPT keeps the root URL (/) on its blank welcome screen. Treat that as
  // no conversation, otherwise a stale started-session record hides EverLua's
  // Start button before the first prompt has ever been sent.
  const conversationKey = () => (chatIsEmpty() || location.pathname === '/') ? '' : location.pathname;
  function installSendHooks(handlers) {
    const onUserSubmit = () => {
      if (handlers.isBlocked()) { if (handlers.onBlockedUserMessage) handlers.onBlockedUserMessage(assistantCount()); return; }
      if (!handlers.isStarted()) { if (chatIsEmpty()) handlers.onBlockedAttempt(); return; }
      handlers.onUserMessage(assistantCount());
    };
    document.addEventListener('click', (e) => {
      const b = e.target && e.target.closest && e.target.closest('button'); if (!b) return;
      if (b.matches(S.stop)) { handlers.onNativeStop(); return; }
      if (!b.matches(S.send) || b.disabled || b.getAttribute('aria-disabled') === 'true') return;
      onUserSubmit();
    }, true);
    // ChatGPT sends with Enter as well as its visible Send button. The old
    // click-only hook meant keyboard-submitted messages received an AI reply
    // but never started EverLua's command loop, leaving tool JSON as "not run".
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
      const editor = getEditor();
      if (!editor || !(e.target === editor || editor.contains(e.target))) return;
      const submittedText = editorText().trim();
      if (!submittedText) return;
      // ChatGPT processes Enter after the current event turn. The old zero-ms
      // check often ran first, saw the still-populated composer, and abandoned
      // the EverLua loop even though ChatGPT sent the message a moment later.
      // Confirm acceptance over a short window by watching the composer clear
      // or the Send button become disabled.
      const deadline = Date.now() + 1200;
      const confirmSent = () => {
        const send = document.querySelector(S.send);
        const accepted = editorText().trim() !== submittedText ||
          (send && (send.disabled || send.getAttribute('aria-disabled') === 'true'));
        if (accepted) { onUserSubmit(); return; }
        if (Date.now() < deadline) setTimeout(confirmSent, 80);
      };
      setTimeout(confirmSent, 80);
    }, true);
  }
  const findToolBlockSpot = (item) => {
    if (!item) return null;
    const block = [...item.querySelectorAll('pre,code')].find((e) => /"(?:command|tool)"\s*:|###\s*(?:lua|mcp_tool)/i.test(e.textContent || ''));
    if (block) { block.classList.add('zs-tool-hide'); return { parent: block.parentElement, ref: block }; }
    return null;
  };
  return { id:'chatgpt', displayName:'ChatGPT', supportsVision:false, timings, chipAtItemLevel:true, chipAnchor:(i) => i, chipAppend:true, reliableCounts:true, init({diag:d}={}) { if (d) diag=d; }, allItems,isUserItem,isAssistantItem,itemText,classifyText,assistantCount,userCount,lastAssistant,lastAssistantId,readAssistant,streamLen,snapshot,getEditor,editorText,chatIsEmpty,isFreshChat,composerFrame,barAnchor,barMount,coverTarget,setInputLock,typeAndSend,stopGeneration,isGenerating,isBusyNow,isHardGenerating,enforceComposer,ensureComposerReady,modeWarning,captchaPresent,overlayBlocking,turnHalted,findContinueBtn,clickContinueBtn,scanError,isTooLongMsg,isBusyMsg,attachImages:async()=>{},clearAttachments:()=>{},conversationKey,installSendHooks,findToolBlockSpot };
})();
