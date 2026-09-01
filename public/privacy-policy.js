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
    document.title = l === 'ar' ? 'سياسة الخصوصية - Traino' : 'Privacy Policy - Traino';
  }

  document.querySelectorAll('[data-set-lang]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      apply(btn.getAttribute('data-set-lang'));
    });
  });

  apply(lang);
})();
