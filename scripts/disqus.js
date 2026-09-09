(() => {
  const container = document.querySelector('.disqus-thread');
  if (!container) return;
  const { shortname, url, identifier, title } = container.dataset;
  const status = container.querySelector('.disqus-status');
  const retry = container.querySelector('.disqus-retry');
  let loading = false;
  const showError = () => {
    loading = false;
    if (status) status.textContent = '留言板暫時無法載入。';
    if (retry) retry.hidden = false;
  };
  const load = () => {
    if (loading || !shortname || !url || !identifier) return;
    loading = true;
    if (retry) retry.hidden = true;
    if (status) status.textContent = '留言板載入中…';
    window.disqus_config = function () {
      this.page.url = url;
      this.page.identifier = identifier;
      this.page.title = title || document.title;
    };
    if (window.DISQUS) {
      window.DISQUS.reset({ reload: true, config: window.disqus_config });
      return;
    }
    const script = document.createElement('script');
    script.src = `https://${encodeURIComponent(shortname)}.disqus.com/embed.js`;
    script.async = true;
    script.onload = () => { loading = false; if (status) status.remove(); };
    script.onerror = showError;
    (document.head || document.body).appendChild(script);
  };
  retry?.addEventListener('click', load);
  load();
})();
