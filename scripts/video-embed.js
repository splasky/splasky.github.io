(() => {
  const youtubeHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be']);
  const driveHosts = new Set(['drive.google.com', 'www.drive.google.com']);
  const gateways = new Set(['ipfs.io', 'dweb.link', 'w3s.link', 'nftstorage.link', 'cloudflare-ipfs.com']);
  const parse = (value) => {
    if (!value || /[\s<>"']/.test(value)) return null;
    if (value.toLowerCase().startsWith('ipfs://')) {
      const path = value.slice(7).replace(/^\/+/, '');
      const match = path.match(/^((?:Qm[A-HJ-NP-Za-km-z1-9]{44})|(?:bafy|bafk)[a-z2-7]{20,})(?:\/(.*))?$/);
      return match ? { kind: 'ipfs', url: `https://ipfs.io/ipfs/${match[1]}${match[2] ? `/${match[2].split('/').map(encodeURIComponent).join('/')}` : ''}` } : null;
    }
    let url;
    try { url = new URL(value); } catch { return null; }
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    if (youtubeHosts.has(host)) {
      let id = '';
      if (host.includes('youtu.be')) id = url.pathname.slice(1).split('/')[0];
      else if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
      else if (url.pathname.startsWith('/shorts/')) id = url.pathname.split('/')[2] || '';
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? { kind: 'youtube', url: `https://www.youtube-nocookie.com/embed/${id}` } : null;
    }
    if (driveHosts.has(host)) {
      const match = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]{10,})\/(?:view|preview)?$/);
      return match ? { kind: 'gdrive', url: `https://drive.google.com/file/d/${match[1]}/preview` } : null;
    }
    return gateways.has(host) && /^\/ipfs\/((?:Qm[A-HJ-NP-Za-km-z1-9]{44})|(?:bafy|bafk)[a-z2-7]{20,})(?:\/[^\s]*)?$/.test(url.pathname)
      ? { kind: 'ipfs', url: url.href } : null;
  };
  document.querySelectorAll('.video-embed').forEach((card) => {
    const button = card.querySelector('.video-embed-load');
    if (!button) return;
    button.addEventListener('click', () => {
      if (card.querySelector('iframe, video')) return;
      const parsed = parse(card.getAttribute('data-original-url') || '');
      if (!parsed || parsed.kind !== card.getAttribute('data-video-kind')) return;
      let player;
      if (parsed.kind === 'ipfs') {
        player = document.createElement('video');
        player.controls = true;
        player.preload = 'none';
        player.src = parsed.url;
        player.addEventListener('error', () => {
          player.remove();
          button.hidden = false;
          button.setAttribute('aria-label', '重試載入 IPFS 影片');
          card.classList.add('video-embed-error');
        }, { once: true });
      } else {
        player = document.createElement('iframe');
        player.src = parsed.url;
        player.loading = 'eager';
        player.title = parsed.kind === 'youtube' ? 'YouTube video' : 'Google Drive video';
        player.allow = 'autoplay; encrypted-media; picture-in-picture';
        player.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
        player.setAttribute('allowfullscreen', '');
      }
      player.className = 'video-embed-player';
      card.append(player);
      button.hidden = true;
    });
  });
})();
