(function () {
  var lang = localStorage.getItem('lang') || 'ar';

  function apply(l) {
    lang = l;
    localStorage.setItem('lang', l);
    document.documentElement.lang = l;
    document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-lang-block]').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-lang') === l);
    });
    document.querySelectorAll('[data-set-lang]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-set-lang') === l);
    });
    document.title = l === 'ar' ? 'حذف الحساب - Traino' : 'Delete Account - Traino';
  }

  document.querySelectorAll('[data-set-lang]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      apply(btn.getAttribute('data-set-lang'));
    });
  });

  async function submit(emailId, reasonId, errId, formBoxId, successId, errMsg) {
    var email = document.getElementById(emailId).value.trim();
    var reason = document.getElementById(reasonId).value.trim();
    var errEl = document.getElementById(errId);
    errEl.classList.add('hidden');
    try {
      var res = await fetch('/api/account-deletion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, reason: reason }),
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || errMsg);
      document.getElementById(formBoxId).classList.add('hidden');
      document.getElementById(successId).classList.remove('hidden');
    } catch (e) {
      errEl.textContent = e.message;
      errEl.classList.remove('hidden');
    }
  }

  document.getElementById('submitAr').addEventListener('click', function () {
    submit('emailAr', 'reasonAr', 'errAr', 'formBoxAr', 'successAr', 'حصل خطأ، حاول تاني');
  });
  document.getElementById('submitEn').addEventListener('click', function () {
    submit('emailEn', 'reasonEn', 'errEn', 'formBoxEn', 'successEn', 'Something went wrong, please try again');
  });

  apply(lang);
})();
