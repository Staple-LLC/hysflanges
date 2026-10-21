// Preserve the form layout, but do not submit to the original WordPress server.
function prepareEmail(event) {
 const submit = event.target.closest('.submit-container input,.submit-container button');
 if (!submit) return;
 event.preventDefault(); event.stopImmediatePropagation();
 const form = submit.closest('form');
 const fields = Array.from(form.querySelectorAll('input:not([type=button]):not([type=submit]):not([type=hidden]),textarea'));
 for (const field of fields) { field.required = true; if (!field.reportValidity()) return; }
 const body = fields.map(field => `${field.getAttribute('aria-label') || field.name || 'Message'}: ${field.value}`).join('\n\n');
 let note = form.querySelector('.copy-form-message');
 if (!note) { note = document.createElement('p'); note.className = 'copy-form-message'; note.setAttribute('role','status'); form.append(note); }
 note.textContent = 'This copy uses your email app to send enquiries. Review and send the draft in your email app.';
 window.location.href = 'mailto:sales@huatsiang.com?subject=Website%20enquiry&body='+encodeURIComponent(body);
}
document.addEventListener('click', prepareEmail, true);
