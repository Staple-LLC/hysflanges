// Keep the company header consistent if older wordmark markup is restored.
document.querySelectorAll('.hys-wordmark').forEach(function (wordmark) {
  wordmark.className = 'hys-brand';
  wordmark.innerHTML = '<img src="/assets/hs-mark.png" alt="" width="183" height="265"><span>HYS FLANGES CO. LTD.</span>';
});
