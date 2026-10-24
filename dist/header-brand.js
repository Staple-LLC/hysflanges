// Keep the company header consistent if older wordmark markup is restored.
document.querySelectorAll('.hys-wordmark').forEach(function (wordmark) {
  wordmark.className = 'hys-brand';
  wordmark.innerHTML = '<span>HYS FLANGES CO. LTD.</span>';
});
